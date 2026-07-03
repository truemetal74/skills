---
name: react-auth-otp
description: Canonical front-end authentication for the house stack — Zustand auth store with email+OTP login, optional password login, magic-link auto-verify, refresh tokens, password reset, and an AuthGuard for protected routes. Use this when adding login/registration to a React app, building or fixing an auth store, wiring OTP or magic-link flows, protecting routes, or when a project's auth diverges from the standard — even if the user just says "add user accounts".
---

# React auth: OTP + magic link + JWT (house stack)

The front half of the house auth vertical, extracted from perfect-resume (the superset
implementation; brandician lacks password login/reset, wine-your-sign lacks refresh).
Works against the standard FastAPI backend (`auth.py` + OTP modules — still
project-embedded; the JWT/OTP endpoints are identical across the sibling projects).

## Files (assets/)

| File | Copy to | Role |
|---|---|---|
| `auth.ts` | `src/store/auth.ts` | Zustand store, persisted to localStorage. Actions: `register`, `login` (→ otp_id), `loginWithPassword`, `verifyOTP(otpId, code)`, `verifyMagicLink(token)`, `requestPasswordReset`, `confirmPasswordReset`, `confirmPasswordResetMagic`, `logout` |
| `AuthGuard.tsx` | `src/components/auth/AuthGuard.tsx` | Route wrapper: renders children when authenticated, spinner while loading, redirect to `/login` otherwise |

Requires the **react-api-client** skill first — the store calls its `auth.*` namespace and
formats errors with `getErrorMessage()`; tokens land in localStorage as
`access_token`/`refresh_token` where the client's interceptors expect them.

## The flow (backend contract, `/api/v1.0`)

1. `POST /auth/register` or `/auth/login` (email) → `{otp_id}`; an email goes out with a
   6-digit code **and** a magic link (`?magic=<token>`).
2. `POST /auth/verify-otp {otp_id, code}` **or** `POST /auth/magic-link {token}` →
   `{access_token, refresh_token}`. Login/Register forms auto-call `verifyMagicLink` on
   mount when `?magic=` is present (spinner → navigate to the app).
3. Password variants: `/auth/login-password`, `/auth/password-reset/request`,
   `/auth/password-reset/confirm` (code) or `/confirm-magic` (link token).
4. Token refresh is handled by the api-client interceptor, not the store.

## Adaptation points

- `auth.ts` persist key (`PROJECT CONFIG` marker) — must be unique per app.
- `AuthGuard.tsx` uses the project's Tailwind theme tokens (`pr-*` in the template) —
  swap for the project's palette.
- Login/Register **forms** are intentionally not bundled (heavily styled per project);
  reference implementations: `perfect-resume/front-end/src/components/auth/LoginForm.tsx`
  and `RegisterForm.tsx` (captcha, invite codes, waitlist, magic-link auto-verify).
