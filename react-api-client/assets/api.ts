import axios from "axios";
import { config } from "../config";
import { recordRequestEnd } from "./requestLogger";
import { shouldAttemptRefresh } from "./authRefresh";

// Extend axios config to include our metadata
declare module "axios" {
  export interface AxiosRequestConfig {
    metadata?: {
      requestId: string;
      startTime?: number;
    };
  }
}

/** Internal augmented config type for retry tracking */
interface RetryableConfig extends Record<string, unknown> {
  retryCount: number;
}

export const API_URL = config.apiUrl;
const API_PREFIX = "/api/v1.0";
const DEBUG = config.debug;

// Generate random request ID
const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const logApiCall = (
  type: string,
  url: string,
  requestId: string,
  data?: unknown,
  response?: unknown,
) => {
  console.log(`[${requestId}] API ${type} ${API_URL}${url}`);

  if (DEBUG) {
    console.group(`[${requestId}] API ${type}`);
    console.log("Host:", API_URL);
    console.log("Path:", url);
    console.log("Request ID:", requestId);
    if (data) console.log("Request Data:", data);
    if (response) console.log("Response:", response);
    console.groupEnd();
  }
};

// Enhanced error logging for connection issues
const logConnectionError = (error: unknown, url: string, requestId: string) => {
  const err = error as { code?: string; message?: string };
  console.group(`[${requestId}] Connection Error Details`);
  console.log("Target URL:", `${API_URL}${url}`);
  console.log("Request ID:", requestId);
  console.log("Error Code:", err.code);
  console.log("Error Message:", err.message);

  if (err.code === "ERR_CONNECTION_REFUSED") {
    console.log("Troubleshooting:");
    console.log("   - Check if the backend server is running");
    console.log("   - Verify the API URL in your .env file");
    console.log("   - Current API_URL:", API_URL);
    console.log(
      "   - Expected format: http://localhost:PORT (e.g., http://localhost:8080)",
    );
  }

  console.groupEnd();
};

// Request deduplication system: wrap idempotent calls in deduplicate() so
// concurrent identical requests share one promise (see example namespace below)
export const pendingRequests = new Map<string, Promise<unknown>>();

const createRequestKey = (method: string, url: string, data?: unknown) => {
  const dataKey = data ? JSON.stringify(data) : "";
  return `${method}:${url}:${dataKey}`;
};

const deduplicate = async <T>(
  key: string,
  requestFn: () => Promise<T>,
): Promise<T> => {
  if (pendingRequests.has(key)) {
    const requestId = generateRequestId();
    console.log(`[${requestId}] Deduplicating request: ${key}`);
    return pendingRequests.get(key) as Promise<T>;
  }

  const promise = requestFn();
  pendingRequests.set(key, promise);

  try {
    const result = await promise;
    return result;
  } finally {
    pendingRequests.delete(key);
  }
};

// Create axios instance with base URL
const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Helper function to build API paths
const apiPath = (path: string) => `${API_PREFIX}${path}`;

// Configure retry settings
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// Add request interceptor for auth token and request ID
api.interceptors.request.use((reqConfig) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    reqConfig.headers.Authorization = `Bearer ${token}`;
  }

  const requestId = generateRequestId();
  reqConfig.headers["X-Request-ID"] = requestId;

  reqConfig.metadata = { requestId, startTime: Date.now() };

  if (!Object.prototype.hasOwnProperty.call(reqConfig, "retryCount")) {
    (reqConfig as unknown as RetryableConfig).retryCount = 0;
  }

  logApiCall(
    reqConfig.method?.toUpperCase() || "REQUEST",
    reqConfig.url || "",
    requestId,
    reqConfig.data,
  );

  return reqConfig;
});

// Add response interceptor for token refresh
api.interceptors.response.use(
  (response) => {
    const requestId = response.config.metadata?.requestId || "unknown";
    logApiCall(
      "RESPONSE",
      response.config.url || "",
      requestId,
      undefined,
      response.data,
    );
    recordRequestEnd(response.config, response);
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const requestId = originalRequest?.metadata?.requestId || "unknown";

    if (DEBUG || error.code === "ERR_CONNECTION_REFUSED" || !error.response) {
      if (!error.response) {
        logConnectionError(error, originalRequest.url || "", requestId);
      } else {
        console.error(`[${requestId}] API Error:`, {
          url: originalRequest.url,
          status: error.response?.status,
          data: error.response?.data,
        });
      }
    }

    if (!error.response) {
      console.warn("Network error detected - not logging out user");

      const errConfig = error.config;
      const retryCount = (errConfig as unknown as RetryableConfig).retryCount || 0;

      if (retryCount < MAX_RETRIES) {
        (errConfig as unknown as RetryableConfig).retryCount = retryCount + 1;
        const delay = RETRY_DELAY * Math.pow(2, retryCount);

        console.log(
          `[${requestId}] Retrying request (attempt ${
            retryCount + 1
          }/${MAX_RETRIES}) after ${delay}ms...`,
        );

        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(api(errConfig));
          }, delay);
        });
      }

      console.error(
        `[${requestId}] Max retries (${MAX_RETRIES}) reached for network error`,
      );
      recordRequestEnd(errConfig, undefined, error);
      return Promise.reject(error);
    }

    // Only attempt a token refresh for protected resources. A 401 from a public
    // auth endpoint (login/register/OTP/reset) is a credential failure and must
    // propagate with its original response so the UI shows the real message.
    if (shouldAttemptRefresh(originalRequest?.url, error.response?.status, originalRequest?._retry)) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem("refresh_token");
        if (!refreshToken) {
          throw new Error("No refresh token");
        }

        const response = await api.post(apiPath("/auth/token/refresh"), {
          refresh_token: refreshToken,
        });

        const { access_token } = response.data;
        localStorage.setItem("access_token", access_token);

        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (refreshError: unknown) {
        if ((refreshError as { response?: { status?: number } }).response?.status === 401) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = "/login";
        }
        recordRequestEnd(originalRequest, undefined, refreshError);
        return Promise.reject(refreshError);
      }
    }

    recordRequestEnd(originalRequest, error.response, error);
    return Promise.reject(error);
  },
);

/** Shape of an axios-style error response as seen in this codebase */
interface ApiError {
  code?: string;
  message?: string;
  response?: {
    status?: number;
    data?: { message?: string; detail?: string };
    statusText?: string;
  };
}

export const getErrorMessage = (error: unknown, defaultMessage?: string): string => {
  const err = error as ApiError;
  if (
    err.code === "ECONNREFUSED" ||
    err.code === "ERR_CONNECTION_REFUSED" ||
    err.message?.includes("ERR_CONNECTION_REFUSED") ||
    err.message?.includes("Network Error") ||
    !err.response
  ) {
    return "Unable to connect to the server. Please check your internet connection or try again later.";
  }

  if ((err.response?.status ?? 0) >= 500) {
    return "The server is experiencing issues. Please try again later.";
  }

  if ((err.response?.status ?? 0) >= 400 && (err.response?.status ?? 0) < 500) {
    const serverMessage =
      err.response?.data?.message || err.response?.data?.detail;
    if (serverMessage) {
      return serverMessage;
    }

    switch (err.response?.status) {
      case 400:
        return "Invalid request. Please check your input and try again.";
      case 401:
        return "Invalid credentials. Please check your email and try again.";
      case 403:
        return "Access denied. Please contact support if this persists.";
      case 404:
        return "Service not found. Please try again later.";
      default:
        return "An error occurred. Please try again.";
    }
  }

  return defaultMessage || "An unexpected error occurred. Please try again.";
};

// ======================= PROJECT API NAMESPACES ==============================
// Everything above is the shared engine — keep it identical across projects.
// Below, define one exported namespace per backend router with typed functions.
// Wrap idempotent GETs in deduplicate() when components may fire them in parallel.
//
// Example:
//
// export const jobs = {
//   list: async () => {
//     return deduplicate(createRequestKey("GET", apiPath("/job-targets")), async () => {
//       const response = await api.get(apiPath("/job-targets"));
//       return response.data;
//     });
//   },
//
//   create: async (data: { title: string; raw_description: string }) => {
//     const response = await api.post(apiPath("/job-targets"), data);
//     return response.data;
//   },
// };
// =============================================================================

export default api;
