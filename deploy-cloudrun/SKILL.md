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
| `deploy.ps1` | project root | Multi-service deploy: local Docker or `-CloudBuild`, staging by default, `-Production` for prod names, `-Account` for a deployer SA, `INITIAL_DEPLOY` vars flow |
| `backend.dockerignore` | `back-end/.dockerignore` AND `back-end/.gcloudignore` | Same content in both. Keeps `.env*`, `.config/`, `vars/` out of the build (rule 8) |
| `frontend.dockerignore` | `front-end/.dockerignore` AND `front-end/.gcloudignore` | Same content in both. Also excludes `/back-end` for a front-end at the repo root, plus agent/tool folders |
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
6. **Frontend installs use `npm ci`**, never `npm install --legacy-peer-deps`: the legacy
   flag skips peer dependencies (e.g. `@testing-library/dom`, peer of
   `@testing-library/react` v16), so the in-container `tsc` gate fails on test files with
   TS2305 even though the identical build passes locally. Found in cat4-practice, 2026-07.
7. **nginx no-cache headers must live in `location /`**, not only `location = /index.html`:
   `try_files` serves the SPA fallback as a *file*, bypassing the exact-match block, so `/`
   and deep links ship with no `Cache-Control` and browsers heuristically cache a stale
   `index.html` across deploys. Repeat the security `add_header`s there too — any
   `add_header` in a location suppresses the inherited server-level ones. Found in
   cat4-practice, 2026-07.
8. **Secrets never enter a build context.** Both Dockerfiles run `COPY . …`, so every file
   the ignore files let through is uploaded and copied. Cloud Build uploads what
   `.gcloudignore` allows (the tarball stays in `gs://<project>_cloudbuild/source/`), and
   `docker build` copies what `.dockerignore` allows. Each service folder therefore needs
   BOTH files, with the same secret block: `**/.env*`, `**/.config`, `/vars` (the
   `*.dockerignore` templates are written to mean the same in both syntaxes; verified with
   `gcloud meta list-files-for-upload` and a `FROM scratch` docker build). A `RUN rm` after
   the COPY does NOT help: the file stays in the COPY layer, readable by anyone who can
   pull the image. A front-end at the repo root must also exclude `/back-end`. Check with
   `gcloud meta list-files-for-upload <dir>` before the first deploy. Stronger still for a
   backend: an allow-list `.dockerignore` (`*`, then one `!path` line per file or folder
   the image needs), as wine-your-sign.new's `backend/` uses. A key that already shipped
   in an image or upload must be rotated; excluding it only protects future builds. Found in
   train-to-negotiate, 2026-10: the root front-end's `.gcloudignore` let `.config/`
   (deployer SA key, DNS key) through, and `back-end/.dockerignore` let `.env_pydantic`
   through for local builds.
9. **Never change the shared gcloud config.** No `gcloud config set project|account` in
   scripts or by hand: every project on the machine shares it, so one project's deploy
   silently re-points the others. Pass `--project` (and `--account` when a deployer SA is
   used) on every gcloud call; `deploy.ps1` does this through `$Gc`, and takes the project
   from `PROJECT CONFIG` (`$DefaultProjectId`, `$DefaultAccount`), never from the gcloud
   config. Docker's credential helper ignores `--account`, so the script sets
   `CLOUDSDK_CORE_ACCOUNT` only around `docker push`. With an explicit account, Cloud
   Build is submitted `--async` and polled: streaming its logs needs project Viewer, which
   a deployer SA usually lacks, and `gcloud builds submit` then exits 1 while the build
   keeps running (`--suppress-logs` does not avoid it). Found in train-to-negotiate, 2026-10.
10. **No `$ErrorActionPreference = "Stop"` in scripts that run gcloud/docker.** Both write
    progress and warnings to stderr; Windows PowerShell 5.1 turns each stderr line into a
    terminating `NativeCommandError` whenever output is captured (coding agents, CI, `tee`),
    so the script dies on the first harmless warning. Use `"Continue"` and check
    `$LASTEXITCODE` after every native command that matters. Same bug as gcp-bootstrap's
    `setup-gcp.ps1` (fixed 2026-07); hit again by `deploy.ps1` in train-to-negotiate, 2026-10.

## Setting up a new project

1. Run the `gcp-bootstrap` skill first (APIs, worker SA, Firestore, bucket, registry).
2. Copy the templates per the table above, including both ignore files per service; fill
   each `PROJECT CONFIG` block (project id, service names, registry id, region, env-var
   seeds, domain in nginx.conf).
3. Add `vars/` and `.config/` to .gitignore (they contain secrets); commit `.example.yaml`
   siblings if useful. Run `gcloud meta list-files-for-upload <service dir>` and confirm no
   key or env file is listed.
4. First deploy: `$env:INITIAL_DEPLOY=1; .\deploy.ps1 all` — edit the generated YAMLs when
   prompted. Subsequent deploys: `.\deploy.ps1 all` (add `-CloudBuild` when Docker Desktop
   isn't running).
