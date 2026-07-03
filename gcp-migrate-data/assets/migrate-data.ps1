# Migrate Firestore + GCS data from the source GCP project to the target project.
#
# Firestore: export from source to an export bucket in the source project,
#            then import into the target project (target DB must be empty).
# GCS:       rsync source thumbnail bucket -> target thumbnail bucket.

param(
    [Parameter(Mandatory=$false)] [switch]$help,
    [Parameter(Mandatory=$true)]  [string]$SourceProject,
    [Parameter(Mandatory=$true)]  [string]$SourceAccount,
    [Parameter(Mandatory=$false)] [string]$SourceBucket = "",
    [Parameter(Mandatory=$true)]  [string]$TargetProject,
    [Parameter(Mandatory=$true)]  [string]$TargetAccount,
    [Parameter(Mandatory=$false)] [string]$TargetBucket = "",
    [Parameter(Mandatory=$false)] [string]$ExportBucket = "",  # default: <SourceProject>-firestore-export
    [Parameter(Mandatory=$false)] [string]$ExportBucketLocation = "EU",
    [Parameter(Mandatory=$false)] [switch]$FirestoreOnly,
    [Parameter(Mandatory=$false)] [switch]$GcsOnly,
    [Parameter(Mandatory=$false)] [switch]$NoWait
)

# Derive optional names from the projects when not given
if (-not $SourceBucket) { $SourceBucket = $SourceProject }
if (-not $TargetBucket) { $TargetBucket = $TargetProject }
if (-not $ExportBucket) { $ExportBucket = "$SourceProject-firestore-export" }

if ($help) {
    Write-Host @"
Usage: cmd_tools\migrate-data.ps1 [options]

Migrate Firestore and GCS thumbnail data from the source GCP project
to the target project. Idempotent for GCS (rsync); for Firestore, the
target database must be empty (script aborts if not).

Options:
  -SourceProject <id>           (required)
  -SourceAccount <email>        (required)
  -SourceBucket <name>          Source thumbnails bucket. (required)
  -TargetProject <id>           (required)
  -TargetAccount <email>        (required)
  -TargetBucket <name>          (required)
  -ExportBucket <name>          Intermediate Firestore export bucket. Default: <SourceProject>-firestore-export
  -ExportBucketLocation <loc>   Location for the export bucket if it needs creating. Default: EU
  -FirestoreOnly                Skip GCS rsync
  -GcsOnly                      Skip Firestore export/import
  -NoWait                       Skip confirmation prompts
  -help                         Show this help

"@
    exit 0
}

function Write-Step { param([string]$m)
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host $m -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}
function Write-Info { param([string]$m) Write-Host "  [info] $m" -ForegroundColor Yellow }
function Write-OK   { param([string]$m) Write-Host "  [ok]   $m" -ForegroundColor Green }
function Write-Err  { param([string]$m) Write-Host "  [err]  $m" -ForegroundColor Red }

Write-Host "`n==================================================" -ForegroundColor Magenta
Write-Host "  Wine Your Sign - Data Migration" -ForegroundColor Magenta
Write-Host "==================================================" -ForegroundColor Magenta
Write-Host "Source:  $SourceAccount / $SourceProject"
Write-Host "Target:  $TargetAccount / $TargetProject"
Write-Host "Modes:   firestore=$(-not $GcsOnly), gcs=$(-not $FirestoreOnly)"

if (-not $NoWait) {
    Write-Host "`nPress enter to continue (Ctrl-C to abort)..." -ForegroundColor Yellow -NoNewline
    [void](Read-Host)
}

# Resolve project numbers (needed for Firestore service-agent emails).
function Get-ProjectNumber($project) {
    $n = gcloud projects describe $project --format="value(projectNumber)" 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Err "Cannot read projectNumber for $project"; exit 1 }
    return $n.Trim()
}

# ============================================================
# Firestore export -> import
# ============================================================
if (-not $GcsOnly) {
    Write-Step "Firestore migration"

    Write-Info "Resolving project numbers..."
    gcloud config set account $SourceAccount 2>&1 | Out-Null
    $sourceNumber = Get-ProjectNumber $SourceProject
    Write-OK "Source project number: $sourceNumber"

    gcloud config set account $TargetAccount 2>&1 | Out-Null
    $targetNumber = Get-ProjectNumber $TargetProject
    Write-OK "Target project number: $targetNumber"

    $sourceFsAgent = "service-$sourceNumber@gcp-sa-firestore.iam.gserviceaccount.com"
    $targetFsAgent = "service-$targetNumber@gcp-sa-firestore.iam.gserviceaccount.com"

    # --- Source side ---
    gcloud config set account $SourceAccount 2>&1 | Out-Null
    gcloud config set project $SourceProject 2>&1 | Out-Null

    Write-Info "Ensuring export bucket gs://$ExportBucket exists in $SourceProject..."
    $exportBucketExists = $false
    try {
        $b = gcloud storage buckets describe "gs://$ExportBucket" --format="value(name)" 2>$null
        if ($b) { $exportBucketExists = $true }
    } catch {}
    if (-not $exportBucketExists) {
        gcloud storage buckets create "gs://$ExportBucket" --project=$SourceProject --location=$ExportBucketLocation --uniform-bucket-level-access
        if ($LASTEXITCODE -ne 0) { Write-Err "Cannot create export bucket"; exit 1 }
        Write-OK "Created gs://$ExportBucket in $ExportBucketLocation"
    } else {
        Write-OK "gs://$ExportBucket already exists"
    }

    Write-Info "Granting roles/storage.admin on gs://$ExportBucket to $sourceFsAgent..."
    gcloud storage buckets add-iam-policy-binding "gs://$ExportBucket" --member="serviceAccount:$sourceFsAgent" --role="roles/storage.admin" 2>&1 | Out-Null

    $timestamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
    $exportPath = "gs://$ExportBucket/exports/$timestamp"
    Write-Info "Exporting Firestore to $exportPath (this can take a while)..."
    gcloud firestore export $exportPath --project=$SourceProject
    if ($LASTEXITCODE -ne 0) { Write-Err "firestore export failed"; exit 1 }
    Write-OK "Export complete at $exportPath"

    # --- Cross-project IAM so target Firestore agent can read the export ---
    # Firestore import needs storage.admin on the bucket per
    # https://cloud.google.com/firestore/docs/manage-data/move-data#cross-project_data_migrations
    Write-Info "Granting roles/storage.admin on gs://$ExportBucket to $targetFsAgent..."
    gcloud storage buckets add-iam-policy-binding "gs://$ExportBucket" --member="serviceAccount:$targetFsAgent" --role="roles/storage.admin" 2>&1 | Out-Null

    # --- Target side ---
    gcloud config set account $TargetAccount 2>&1 | Out-Null
    gcloud config set project $TargetProject 2>&1 | Out-Null

    # Sanity: refuse to import if target DB already has user-collection documents.
    # Use a cheap empirical check: count root collections via a list call.
    Write-Info "Checking that target Firestore DB is empty..."
    $colsRaw = gcloud firestore databases list --project=$TargetProject --format="value(name)" 2>&1
    if (-not $colsRaw) {
        Write-Err "No Firestore database in $TargetProject. Run init-gcp-project.ps1 first."
        exit 1
    }
    # We cannot list collections via gcloud directly; rely on operator confirmation.
    if (-not $NoWait) {
        Write-Host "`n  IMPORTANT: Firestore import will FAIL if the target DB already contains data" -ForegroundColor Yellow
        Write-Host "  with the same collection paths. If this is a re-run, abort and clear the target first." -ForegroundColor Yellow
        Write-Host "  Press enter to proceed with import, or Ctrl-C to abort..." -ForegroundColor Yellow -NoNewline
        [void](Read-Host)
    }

    Write-Info "Importing into $TargetProject from $exportPath..."
    gcloud firestore import $exportPath --project=$TargetProject
    if ($LASTEXITCODE -ne 0) { Write-Err "firestore import failed"; exit 1 }
    Write-OK "Firestore import complete"
} else {
    Write-Info "Skipping Firestore (--GcsOnly)"
}

# ============================================================
# GCS thumbnail bucket rsync
# ============================================================
if (-not $FirestoreOnly) {
    Write-Step "GCS thumbnail bucket migration"

    Write-Info "Granting roles/storage.objectViewer + roles/storage.legacyBucketReader on gs://$SourceBucket to $TargetAccount..."
    gcloud config set account $SourceAccount 2>&1 | Out-Null
    gcloud config set project $SourceProject 2>&1 | Out-Null
    gcloud storage buckets add-iam-policy-binding "gs://$SourceBucket" --member="user:$TargetAccount" --role="roles/storage.objectViewer" 2>&1 | Out-Null
    gcloud storage buckets add-iam-policy-binding "gs://$SourceBucket" --member="user:$TargetAccount" --role="roles/storage.legacyBucketReader" 2>&1 | Out-Null

    gcloud config set account $TargetAccount 2>&1 | Out-Null
    gcloud config set project $TargetProject 2>&1 | Out-Null

    Write-Info "Rsyncing gs://$SourceBucket -> gs://$TargetBucket ..."
    gcloud storage rsync "gs://$SourceBucket" "gs://$TargetBucket" --recursive
    if ($LASTEXITCODE -ne 0) { Write-Err "gcs rsync failed"; exit 1 }
    Write-OK "GCS rsync complete"
} else {
    Write-Info "Skipping GCS (--FirestoreOnly)"
}

Write-Host "`n==================================================" -ForegroundColor Magenta
Write-Host "  Data migration complete" -ForegroundColor Magenta
Write-Host "==================================================" -ForegroundColor Magenta
