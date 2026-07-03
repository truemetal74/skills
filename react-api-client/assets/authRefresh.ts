/**
 * Decide whether a 401 response should trigger a token refresh + retry.
 *
 * A 401 from a public auth endpoint (login, register, OTP, password reset, and
 * the token-refresh call itself) means "bad credentials" — NOT an expired
 * session. Those must propagate to the caller with their original response so the
 * UI can show the real backend message (e.g. "Invalid email or password")
 * instead of being swapped for a refresh failure that looks like a network error.
 *
 * Only a 401 from a protected resource (e.g. /users/me) should attempt a refresh.
 * Kept as a tiny pure function so it can be unit-tested without mocking axios.
 */
export function isAuthEndpoint(url: string | undefined): boolean {
  return !!url && url.includes("/auth/");
}

export function shouldAttemptRefresh(
  url: string | undefined,
  status: number | undefined,
  alreadyRetried: boolean | undefined,
): boolean {
  return status === 401 && !alreadyRetried && !isAuthEndpoint(url);
}
