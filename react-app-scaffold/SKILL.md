---
name: react-app-scaffold
description: Scaffold a new front-end for the house web-app stack — React + TypeScript (strict) + Vite + Tailwind + Zustand + React Router with pinned versions, the standard folder layout, and wiring order for the sibling skills. Use this whenever starting a new React/Vite front-end, restructuring one to match the house conventions, or deciding which library versions to use — even if the user just says "create the frontend" or "start a new web app".
---

# React app scaffold (house stack)

Creates a front-end matching the house conventions. The three existing projects drifted
badly on versions (React 18.2 / 18.3 / 19.2, Vite 5 / 8, Tailwind 3 / 4) — new projects
start from the pinned set in `assets/package.json` (perfect-resume's, the most current).
Copy `assets/vite.config.ts`, `tsconfig.json`, `tsconfig.app.json` as the build config
baseline.

## Stack (pinned in assets/package.json)

React 19 + React DOM, TypeScript (strict, no `any` — ESLint blocking), Vite 8,
Tailwind CSS 4 (via `@tailwindcss/vite`, theme tokens in `src/index.css` `@theme`),
Zustand (state), React Router, Axios, Lucide (icons), Framer Motion (optional),
react-markdown (optional). Dev: ESLint 9, Vitest, Puppeteer (only with SSG).

## Folder layout

```
front-end/
├── src/
│   ├── components/        # feature-based dirs (auth/, jobs/, common/, pages/, seo/)
│   ├── store/             # Zustand stores — one per domain, errors via getErrorMessage()
│   ├── lib/               # api.ts + support (react-api-client skill)
│   ├── types/             # shared TS domain types
│   ├── config.ts          # runtime config loader (react-api-client skill)
│   ├── App.tsx            # routes (wrap protected ones in AuthGuard)
│   └── main.tsx
├── nginx/nginx.conf       # deploy-cloudrun skill
├── docker-entrypoint.sh   # deploy-cloudrun skill
├── Dockerfile             # deploy-cloudrun skill
├── prerender.js           # react-seo-ssg skill (public-facing apps)
└── CLAUDE.md              # routes table + stores + theme (keep updated)
```

## Wiring order for a new app

1. Scaffold with this skill's configs; define theme tokens in `src/index.css`.
2. **react-api-client** — HTTP layer + runtime config.
3. **react-auth-otp** — auth store + AuthGuard (if the app has accounts).
4. **react-seo-ssg** — only if there are public marketing/SEO pages.
5. **deploy-cloudrun** — Dockerfile, nginx, entrypoint, deploy script.

## Conventions that matter

- Stores own server state; components stay presentational; every store formats errors
  with `getErrorMessage()` so users never see raw axios errors.
- Runtime config comes from `window.ENV_CONFIG` — never bake API URLs into the bundle.
- `npm run build` runs `tsc -b` first: type errors block the build (CI gate).
- Write a `CLAUDE.md` with the routes table and store list; update it with every new
  page (the house rule: stale docs are worse than none).
