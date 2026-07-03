---
name: stack-audit
description: Audit a house-stack web project (React+Vite front-end, FastAPI+Firestore back-end, Cloud Run deploy) against the canonical shared packages and skill templates, producing a drift report and optionally applying upgrades. Use this when asked to audit/sync/align a project with the standard stack, after changing any shared package or skill template (to propagate the fix to all projects), when a bug fixed in one project may exist in the siblings, or periodically as stack hygiene — even if the user just says "is this project up to date?".
---

# Stack audit — drift detection against the canonical stack

The reuse system has two layers: **pip packages** (`github.com/truemetal74/my-python`,
local source `C:\prog\my-py`) and **skill templates** (the sibling skills in this repo).
Both only help if projects actually track them. This skill compares one project against
both layers and reports drift; fixes are applied only on request.

Known fleet (audit others on demand): `C:\prog\perfect-resume` (migrated 2026-07),
`C:\prog\brandician`, `C:\prog\wine-your-sign.new` (both still on embedded copies).

## Procedure

Work through `references/checklist.md` area by area (read it now). For each item:

1. Locate the project's counterpart file (paths differ per project — search, don't assume).
2. Compare against the canonical source listed in the checklist. Template files contain
   `PROJECT CONFIG` markers — differences inside those blocks are expected and NOT drift;
   differences in the engine/invariant parts ARE.
3. Classify each finding:
   - **BUG-CLASS** — the project misses a fix/behavior the canon has (e.g. no 401 refresh,
     no `/config.js` no-cache rule, missing `update_field` date conversion). These are the
     "fixed it in one project, not the others" cases the system exists to kill.
   - **STRUCTURAL** — embedded copy where a shared package should be used, wrong SA name,
     unpinned/divergent library versions.
   - **COSMETIC** — naming/layout differences with no behavioral impact. List briefly,
     don't push fixes.

## Report format

Always produce this table, worst first, before proposing any change:

| # | Area | Project file | Canonical source | Drift | Class |
|---|------|--------------|------------------|-------|-------|

Follow with a short "recommended fixes in order" list. Apply fixes only when the user
asks; prefer one commit per area so each upgrade is independently revertable. After
applying, re-run the relevant checklist section to confirm the drift is gone, and run
the project's tests.

## Reverse drift

If the *project* has an improvement the canon lacks (newer behavior, a bugfix, a better
pattern), that is canon-drift, not project-drift: propose updating the shared package /
skill template instead, then propagating to the other projects. The canon must stay the
best-known version or the whole system rots.
