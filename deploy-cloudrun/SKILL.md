---
name: deploy-cloudrun
description: Canonical Google Cloud Run deployment setup for the house web-app stack (React+Vite front-end behind nginx, FastAPI back-end, PowerShell deploy scripts, Artifact Registry). Use this whenever setting up deployment for a new project, writing or editing a deploy.ps1 / Dockerfile / nginx.conf for Cloud Run, adding a staging environment, fixing runtime-config (config.js) injection, or when a docker build fails on private dependencies — even if the user just says "deploy this" or "containerize the app".
---

# Cloud Run Deployment (house stack)

Canonical deployment machinery extracted from brandician / perfect-resume / wine-your-sign.
The templates in `assets/` are the single source of truth — copy them into the project and
adapt only the clearly-marked PROJECT CONFIG sections. If you improve a template here,
offer to propagate the change to the other projects using it.

## Architecture

- One Docker image per service (back-end: python-slim + uvicorn; front-end: node build stage + nginx).
- Images pushed to **Artifact Registry**, deployed to **Cloud Run** (port 8080, non-root user).
- Runtime identity is always the project's `worker@<project>.iam.gserviceaccount.com`
  service account (created by the `gcp-bootstrap` skill). Never omit `--service-account`:
  Cloud Run would fall back to the default compute SA, which has no Firestore permission,
  and every request 403s.
- Environment variables live in Cloud Run, seeded on first deploy from a gitignored
  `vars/<service>.yaml` (created when `$env:INITIAL_DEPLOY=1`). Later deploys never touch
  env vars — change them in the Cloud Run console or with `--env-vars-file` explicitly.
- Front-end config is injected **at container start**, not build time: `docker-entrypoint.sh`
  writes `/usr/share/nginx/html/config.js` (`window.ENV_CONFIG`) from env vars, so the API
  URL can change without a rebuild. nginx must serve `config.js` and `index.html` with
  no-cache headers (already in the template).

## Templates (assets/)

| File | Copy to | Notes |
|---|---|---|
| `deploy.ps1` | project root | Multi-service deploy: local Docker or `-CloudBuild`, staging by default, `-Production` for prod names, `INITIAL_DEPLOY` vars flow |
| `backend.Dockerfile` | `back-end/Dockerfile` | python-slim, non-root `httpd`, vendored-wheels install; weasyprint system deps are marked optional |
| `frontend.Dockerfile` | `front-end/Dockerfile` | node:22-alpine build (+ Chromium only if SSG prerendering), nginx:stable-alpine serve stage |
| `nginx.conf` | `front-end/nginx/nginx.conf` | SPA routing with prerender support, no-cache for `index.html` AND `/config.js`, 1y asset caching, security headers, gzip, www→apex redirect |
| `docker-entrypoint.sh` | `front-end/docker-entrypoint.sh` | Generates `config.js` from `VITE_*` env vars — extend the list per project |
| `vendor-shared-packages.ps1` | `back-end/cmd_tools/` | Rebuilds the vendored wheels for the shared my-python packages |

## Rules that prevent known failures

1. **Private pip dependencies are vendored as wheels**, committed under `back-end/vendor/`
   and referenced by `./vendor/<name>.whl` lines in requirements.txt. Never use
   `git+https://` pins to private repos: `pip install` runs *inside* the build container
   (even for local `docker build`) where no git credentials exist. The Dockerfile must
   `COPY ./vendor/ /app/vendor/` **before** `pip install -r requirements.txt`.
2. **Staging first**: without `-Production`, services deploy as `staging-<name>`. Keep prod
   and staging in the same project unless the project has outgrown it.
3. **Line endings**: `docker-entrypoint.sh` is authored on Windows — the frontend Dockerfile
   strips CRLF (`dos2unix`/`sed`) before `chmod +x`. Don't remove that step.
4. **Ports**: everything listens on 8080 internally; Cloud Run maps 443 externally, so
   nginx has `port_in_redirect off` / `absolute_redirect off`.
5. After a first `all` deploy, cross-wire the URLs: frontend `VITE_API_URL` → backend URL,
   backend `CORS_ALLOWED_ORIGINS` → frontend URL (the script prints a reminder).

## Setting up a new project

1. Run the `gcp-bootstrap` skill first (APIs, worker SA, Firestore, bucket, registry).
2. Copy the templates per the table above; fill each `PROJECT CONFIG` block
   (service names, registry id, region, env-var seeds, domain in nginx.conf).
3. Add `vars/` to .gitignore (contains secrets); commit `.example.yaml` siblings if useful.
4. First deploy: `$env:INITIAL_DEPLOY=1; .\deploy.ps1 all` — edit the generated YAMLs when
   prompted. Subsequent deploys: `.\deploy.ps1 all` (add `-CloudBuild` when Docker Desktop
   isn't running).
