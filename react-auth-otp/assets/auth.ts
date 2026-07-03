import { create } from "zustand";
import { persist } from "zustand/middleware";
import { auth, getErrorMessage } from "../lib/api";
import { getRecaptchaToken } from "../lib/recaptcha";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  otpId: string | null;
  register: (
    email: string,
    firstName: string,
    lastName: string,
    inviteCode?: string,
    password?: string,
    marketingConsent?: boolean,
  ) => Promise<string>;
  login: (email: string) => Promise<string>;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  verifyOTP: (otpId: string, otp: string) => Promise<void>;
  verifyMagicLink: (token: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<string>;
  confirmPasswordReset: (otpId: string, otpCode: string, newPassword: string) => Promise<void>;
  confirmPasswordResetMagic: (token: string, newPassword: string) => Promise<void>;
  loadUser: () => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: false,
      error: null,
      otpId: null,

      register: async (
        email: string,
        firstName: string,
        lastName: string,
        inviteCode: string = "",
        password: string = "",
        marketingConsent: boolean = false,
      ) => {
        set({ isLoading: true, error: null });
        try {
          const captchaToken = await getRecaptchaToken("register");
          const { otp_id } = await auth.register(
            email,
            firstName,
            lastName,
            captchaToken,
            inviteCode,
            password,
            marketingConsent,
          );
          set({ isLoading: false, otpId: otp_id });
          return otp_id;
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      login: async (email: string) => {
        set({ isLoading: true, error: null });
        try {
          const captchaToken = await getRecaptchaToken("login");
          const { otp_id } = await auth.login(email, captchaToken);
          set({ isLoading: false, otpId: otp_id });
          return otp_id;
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      loginWithPassword: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const captchaToken = await getRecaptchaToken("login");
          await auth.loginWithPassword(email, password, captchaToken);
          const user = await auth.getCurrentUser();
          set({ user, isLoading: false });
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      requestPasswordReset: async (email: string) => {
        set({ isLoading: true, error: null });
        try {
          const captchaToken = await getRecaptchaToken("password_reset");
          const { otp_id } = await auth.requestPasswordReset(email, captchaToken);
          set({ isLoading: false });
          return otp_id;
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      confirmPasswordReset: async (otpId: string, otpCode: string, newPassword: string) => {
        set({ isLoading: true, error: null });
        try {
          await auth.confirmPasswordReset(otpId, otpCode, newPassword);
          const user = await auth.getCurrentUser();
          set({ user, isLoading: false });
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      confirmPasswordResetMagic: async (token: string, newPassword: string) => {
        set({ isLoading: true, error: null });
        try {
          await auth.confirmPasswordResetMagic(token, newPassword);
          const user = await auth.getCurrentUser();
          set({ user, isLoading: false });
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      verifyOTP: async (otpId: string, otp: string) => {
        set({ isLoading: true, error: null });
        try {
          await auth.verifyOtp(otpId, otp);
          const user = await auth.getCurrentUser();
          set({ user, isLoading: false, otpId: null });
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      verifyMagicLink: async (token: string) => {
        set({ isLoading: true, error: null });
        try {
          await auth.verifyMagicLink(token);
          const user = await auth.getCurrentUser();
          set({ user, isLoading: false, otpId: null });
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      loadUser: async () => {
        const token = localStorage.getItem("access_token");
        if (!token) return;

        set({ isLoading: true });
        try {
          const user = await auth.getCurrentUser();
          set({ user, isLoading: false });
        } catch {
          set({ isLoading: false, user: null });
        }
      },

      logout: () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        set({ user: null, otpId: null, error: null });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: "my-app-auth", // PROJECT CONFIG: unique localStorage persist key per app
      partialize: (state) => ({ user: state.user }),
    }
  )
);
