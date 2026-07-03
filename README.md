# my-skills

Reusable [Claude Code skills](https://code.claude.com/docs/en/skills) for a specific web-app
stack: React + TypeScript + Vite front-end, FastAPI + Pydantic + Firestore back-end,
deployed to Google Cloud Run. Extracted from three production sibling projects so that
patterns, fixes and conventions live in one place instead of drifting per project.

Companion repo: [truemetal74/my-python](https://github.com/truemetal74/my-python) — the
shared backend code as pip packages (firestore-dict, transactional-emails, openrouter-llm,
fastapi-reqlog). Skills carry the things packages can't: scripts, Dockerfiles, configs,
front-end template code, and process knowledge.

## Skills

| Skill | Purpose |
|---|---|
| `react-app-scaffold` | New front-end baseline: pinned versions, folder layout, wiring order |
| `react-api-client` | Canonical axios client: JWT, X-Request-ID, 401 refresh, dedup, retry |
| `react-auth-otp` | Auth store (OTP + magic link + password + reset) and AuthGuard |
| `react-seo-ssg` | Puppeteer prerendering, sitemap, SEOHead with JSON-LD |
| `gcp-bootstrap` | Idempotent GCP project setup: APIs, `worker` SA + IAM, Firestore, GCS, registry |
| `deploy-cloudrun` | Deploy scripts, Dockerfiles, nginx config, runtime config.js injection |
| `gcp-migrate-data` | Firestore export/import + GCS rsync between projects |
| `stack-audit` | Drift report: compare a project against the packages + templates above |

## Installation

Each skill is a directory with a `SKILL.md` and bundled `assets/`. Point Claude Code at
them either by copying into `~/.claude/skills/` or (single source of truth) linking:

```powershell
# Windows: directory junctions, no admin rights needed
Get-ChildItem <repo-path> -Directory | ForEach-Object {
    New-Item -ItemType Junction -Path "$HOME\.claude\skills\$($_.Name)" -Target $_.FullName
}
```

```bash
# macOS/Linux
for d in <repo-path>/*/; do ln -s "$(realpath "$d")" ~/.claude/skills/; done
```

## Conventions

- `assets/` files are the canonical templates — the single source of truth across projects.
- `PROJECT CONFIG` markers denote the only places projects are expected to differ.
- When a template improves, run `stack-audit` on each project to propagate the change.
