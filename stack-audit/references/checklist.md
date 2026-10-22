# Stack audit checklist

Canonical sources: `~/.claude/skills/<skill>/assets/...` (skill templates) and
`C:\prog\my-py\<package>` (shared pip packages, repo `truemetal74/my-python`).

## 1. Shared backend packages (pip)

| Check | Canonical | Drift signals |
|---|---|---|
| FirestoreDict | package `firestore-dict` | An embedded `firestore_dict.py` copy anywhere under the project; missing `update_field()`; missing date→datetime conversion on `__setitem__`/`update_field` |
| Email service | package `transactional-emails` | Embedded `mailersend_mailer.py`/`brevo_mailer.py`; `EmailType`-agnostic dispatcher missing; validation copy of `validate.py` |
| LLM client | package `openrouter-llm` | Embedded `llm.py`/`llm_log.py`; own prompt-registry dict instead of the shared one; DB-log field `user_id`/`brand_id` instead of `context_id` |
| Request logging | package `fastapi-reqlog` | Embedded `request_trace.py`/`logging_middleware.py`/`rqid_in_logs.py`/`errors.py`; missing unified `{code,message}` envelope |
| Wheel currency | versions in `C:\prog\my-py\*\pyproject.toml` | `back-end/vendor/*.whl` versions older than package sources; requirements.txt still using `git+https` pins to the private repo (breaks docker builds) |
| Wiring | perfect-resume pattern | Project settings not passed via `configure_*()`; modules importing project `settings` inside shared-package code |

## 2. Front-end API client (skill: react-api-client)

Compare project `src/lib/api.ts` (or `src/services/api/client.ts`) engine section against
`react-api-client/assets/api.ts`:

- [ ] JWT injected from localStorage + `X-Request-ID` generated per request
- [ ] 401 → refresh-and-retry ONLY for non-`/auth/` endpoints (`authRefresh.ts` logic)
- [ ] Refresh failure with 401 → clear tokens + redirect; network errors never log out
- [ ] Network retry with exponential backoff (3 attempts)
- [ ] Request deduplication (`pendingRequests` + `deduplicate()`)
- [ ] `getErrorMessage()` reading `data.message`/`data.detail` (the fastapi-reqlog envelope)
- [ ] `config.ts`: `window.ENV_CONFIG` first, `import.meta.env` fallback

Known state: wine-your-sign lacks refresh + dedup (BUG-CLASS); brandician is close to canon.

## 3. Front-end auth (skill: react-auth-otp)

- [ ] Store actions match `assets/auth.ts` (OTP, magic-link auto-verify, password login,
      password reset incl. magic variant, logout)
- [ ] Unique localStorage persist key per app
- [ ] Protected routes wrapped in AuthGuard

## 4. SSG / SEO (skill: react-seo-ssg) — only for apps with public pages

- [ ] `prerender.js` + `prerender.routes.js` present and routes in sync with `App.tsx`
- [ ] `SEOHead` on every public page (title, description, canonical, OG, JSON-LD)
- [ ] `build:ssg` script; sitemap generated
- [ ] `prerender.js` has a `MUST_CONTAIN` gate for every route and a `MUST_NOT_CONTAIN`
      gate for the consent banner (older copies exit 0 on an empty `#root`)
- [ ] `window.__PRERENDER__` set by `prerender.js` and checked by the consent banner,
      the analytics loader and any intro/scroll animation
- [ ] `SEOHead` marks JSON-LD with `data-seo-schema` (what `prerender.js` waits for)

## 5. Versions (skill: react-app-scaffold)

Diff project `package.json` against `react-app-scaffold/assets/package.json` for the core
set (react, vite, typescript, tailwind, zustand, react-router, axios). Major-version lag
is STRUCTURAL drift; note it even if not fixing now.

## 6. Deployment (skill: deploy-cloudrun)

- [ ] `deploy.ps1` pins `--service-account=worker@<project>...` (missing → runtime 403s)
- [ ] Staging-by-default naming (`staging-` prefix, `-Production` switch)
- [ ] `INITIAL_DEPLOY` vars/*.yaml flow; `vars/` gitignored
- [ ] backend Dockerfile: non-root user; `COPY ./vendor/` **before** `pip install`
- [ ] frontend Dockerfile: CRLF strip on entrypoint; SSG block only if used
- [ ] nginx.conf: no-cache for BOTH `index.html` and `/config.js`; 1y `/assets/` caching;
      security headers; `port_in_redirect off`
- [ ] `docker-entrypoint.sh` lists every `VITE_*` key the app's `config.ts` reads
- [ ] Secrets out of every build context (rule 8): for EACH service dir, check whichever
      the deploy script actually uses: `gcloud meta list-files-for-upload <dir>` (Cloud
      Build) and the docker context (`printf 'FROM scratch\nCOPY . /\n' | docker build -f-
      --output type=local,dest=<tmp> <dir>`). Neither may contain `.env*` (examples
      aside), `.config/`, `vars/*.yaml` or `*.key`. Worst case: a Python image with
      `COPY . /app/` and no `.dockerignore`. A `RUN rm` does not count: the file stays in
      the layer. A key that already shipped must be rotated, not just excluded. Before
      excluding `.env*` from a Vite front-end, check that its build doesn't read
      `.env.production` (runtime `config.js` projects don't).
- [ ] Deploy scripts never `gcloud config set project|account` (rule 9); `--project`/
      `--account` on every call; no `$ErrorActionPreference = "Stop"` around gcloud/docker
      (rule 10)

## 7. GCP setup (skill: gcp-bootstrap)

- [ ] Runtime SA named `worker` (wine historically used `waiter` — STRUCTURAL)
- [ ] Standard role set on the SA (datastore.user, storage.objectAdmin, logging.logWriter,
      errorreporting.writer, secretmanager.secretAccessor)
- [ ] Bootstrap script is the canonical merged one (single script, idempotent)

## 8. Docs hygiene

- [ ] CLAUDE.md files reflect reality (shared packages mentioned where used; no references
      to deleted embedded modules)
