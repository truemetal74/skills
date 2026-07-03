---
name: react-api-client
description: Canonical axios API client + runtime config loader for the house React/Vite stack (JWT injection, X-Request-ID tracing, 401 refresh-and-retry, request deduplication, network retry with backoff, user-friendly error extraction). Use this whenever creating or editing a front-end API client, adding API calls to a new React project, fixing token-refresh/logout loops, wiring window.ENV_CONFIG runtime configuration, or when a project's api.ts/client.ts diverges from the standard — even if the user just says "hook the frontend to the backend".
---

# React API client (house stack)

The canonical front-end HTTP layer extracted from perfect-resume (the most evolved of the
three sibling projects — brandician and wine-your-sign have older mutations; wine's lacks
401-refresh and deduplication entirely). `assets/` is the single source of truth: copy the
files in, keep the engine identical across projects, and add project code only in the
marked section.

## Files (assets/)

| File | Copy to | Role |
|---|---|---|
| `api.ts` | `src/lib/api.ts` | The engine (interceptors, retry, refresh, dedup, `getErrorMessage`) + a marked `PROJECT API NAMESPACES` section where per-router namespaces go |
| `authRefresh.ts` | `src/lib/authRefresh.ts` | Pure decision function: refresh only on 401 from *protected* endpoints — a 401 from `/auth/*` is a credential failure and must surface its real message |
| `requestLogger.ts` | `src/lib/requestLogger.ts` | Rolling request log used by the response interceptor (debug tooling) |
| `config.ts` | `src/config.ts` | Runtime config: `window.ENV_CONFIG` (injected by docker-entrypoint.sh at container start — see deploy-cloudrun skill) with `import.meta.env` fallback for dev |

## Invariants — why the engine looks the way it does

- **`X-Request-ID` on every request** pairs with the backend's `fastapi-reqlog` package:
  the same id appears in every backend log line, making cross-tier debugging one grep.
- **401 handling is split**: `shouldAttemptRefresh()` refreshes+retries once for protected
  resources; auth endpoints propagate untouched (otherwise "wrong password" shows as a
  session error). On refresh failure with 401: clear tokens, redirect to `/login`.
- **Network errors never log the user out** — they retry up to 3 times with exponential
  backoff (1s/2s/4s), then reject.
- **`getErrorMessage()`** understands the backend's unified `{code, message}` envelope
  (fastapi-reqlog) via `data.message`/`data.detail`, with per-status fallbacks. All Zustand
  stores format errors through it.
- **Tokens** live in localStorage as `access_token` / `refresh_token`; the backend
  contract is `POST /api/v1.0/auth/token/refresh` with `{refresh_token}`.

## Wiring a project

1. Copy the four files; `npm install axios` if missing.
2. Fill the `PROJECT API NAMESPACES` section — one exported namespace per backend router,
   typed functions per endpoint. Wrap idempotent GETs in `deduplicate()` when parallel
   components may fire them together.
3. Extend `config.ts` with the project's `VITE_*` keys — keep the same keys listed in
   docker-entrypoint.sh (deploy-cloudrun skill) or runtime config will silently be empty.
4. If the backend lacks the refresh endpoint or `{code, message}` envelope, wire the
   shared backend packages first (fastapi-reqlog + the auth vertical) rather than
   degrading this client.

When you improve the engine here, offer to propagate the change to the sibling projects.
