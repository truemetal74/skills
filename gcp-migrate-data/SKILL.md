---
name: gcp-migrate-data
description: Migrate Firestore and Cloud Storage data between GCP projects (export/import Firestore via an intermediate bucket, rsync GCS buckets) — for cloning production to staging, moving an app to a new project, or seeding a fresh environment. Use this when asked to copy/move/clone Firestore data, duplicate an environment, migrate a GCP project, or back up app data.
---

# GCP data migration (house stack)

One generalized script (`assets/migrate-data.ps1`, extracted from wine-your-sign) that
moves an app's data between GCP projects. Copy to the project's `cmd_tools/`.

## What it does

- **Firestore**: `gcloud firestore export` from the source project into an intermediate
  export bucket (auto-created as `<SourceProject>-firestore-export` if not given), then
  `gcloud firestore import` into the target project. The target database must be empty —
  import does not merge or overwrite cleanly.
- **GCS**: `gsutil rsync` the source bucket to the target bucket (idempotent, re-runnable).
- Switches gcloud accounts between source and target as needed (both accounts must have
  the required permissions in their respective projects).

## Usage

```powershell
.\cmd_tools\migrate-data.ps1 `
    -SourceProject old-project -SourceAccount you@gmail.com `
    -TargetProject new-project -TargetAccount you@newdomain.com
# Partial runs:
.\cmd_tools\migrate-data.ps1 ... -FirestoreOnly     # skip GCS rsync
.\cmd_tools\migrate-data.ps1 ... -GcsOnly           # skip Firestore
```

Bucket names default to the project names; override with `-SourceBucket`/`-TargetBucket`.
`-NoWait` skips waiting for the Firestore export operation (check progress in the console).

## Cautions

- Firestore import into a non-empty database produces undefined merges — verify the
  target is empty first (`gcloud firestore databases describe`).
- The export bucket accrues storage costs — clean it up after a successful migration.
- Run `gcp-bootstrap` on the target project first so databases/buckets/SAs exist.
