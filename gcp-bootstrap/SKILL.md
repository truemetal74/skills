---
name: gcp-bootstrap
description: Idempotent one-time Google Cloud project setup for the house web-app stack — enables APIs, creates the canonical 'worker' runtime service account with standard IAM roles, Firestore database, Cloud Storage bucket, and Artifact Registry repository. Use this when starting any new GCP project, when a Cloud Run service 403s on Firestore access, when asked to "set up GCP" / "init the project" / grant IAM roles, or before the first deploy of a new app.
---

# GCP project bootstrap (house stack)

One canonical script (`assets/setup-gcp.ps1`) merging the three per-project variants
(perfect-resume's `setup-gcp.ps1` + `setup-gcp-iam.ps1`, wine-your-sign's
`init-gcp-project.ps1`). Copy it to the project root and run once per GCP project;
it is safe to re-run.

## What it does (in order)

1. Enables the API set: firestore, storage, run, artifactregistry, cloudbuild,
   secretmanager, logging, clouderrorreporting, iam, cloudresourcemanager.
2. Creates the runtime service account — **always named `worker`** (the projects
   historically diverged into `worker@` vs `waiter@`; `worker` is the standard because
   the deploy-cloudrun script pins `--service-account=worker@<project>...`).
3. Grants the standard runtime roles: `datastore.user`, `storage.objectAdmin`,
   `logging.logWriter`, `errorreporting.writer`, `secretmanager.secretAccessor`.
   Without `datastore.user` on the runtime SA, every Firestore call from Cloud Run 403s.
4. Creates the Firestore database (native mode, named after the app — not `(default)`,
   so multiple apps can share a project).
5. Creates the GCS bucket `<project>-<app>`.
6. Creates the Artifact Registry Docker repository (multi-region `europe` by default).

## Usage

```powershell
.\setup-gcp.ps1 -ProjectId my-project -AppName my-app
# region overrides:
.\setup-gcp.ps1 -ProjectId my-project -AppName my-app -Region us-central1 -RepoLocation us
```

`-AppName` drives the database name, bucket suffix and registry name — keep it equal to
the `$RegistryId` in the project's deploy.ps1 (deploy-cloudrun skill).

Afterwards: create a local dev key for the SA into the gitignored `.config/` dir, wire
`.env_pydantic` (`database_name`, `gcp_storage_bucket`), then use the deploy-cloudrun
skill for the first deploy.
