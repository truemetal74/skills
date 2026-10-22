<#
.SYNOPSIS
    One-time GCP project bootstrap for the house web-app stack. Idempotent.

.DESCRIPTION
    Enables required APIs, creates the 'worker' runtime service account with the
    standard IAM roles, and creates the Firestore database, Cloud Storage bucket
    and Artifact Registry repository. Safe to re-run — existing resources are
    skipped, existing IAM bindings are no-ops.

.EXAMPLE
    .\setup-gcp.ps1 -ProjectId my-project -AppName my-app
    .\setup-gcp.ps1 -ProjectId my-project -AppName my-app -Region us-central1 -RepoLocation us
#>

param(
    [string]$ProjectId = "",
    [Parameter(Mandatory = $true)]
    [string]$AppName,                       # used for database, bucket suffix, registry name
    [string]$Region = "europe-west1",
    [string]$RepoLocation = "europe",       # Artifact Registry multi-region
    [string]$ServiceAccountName = "worker"  # canonical runtime SA name across all projects
)

# NOT "Stop": gcloud/gsutil write progress AND success messages to stderr.
# Under Windows PowerShell 5.1, whenever this script's output is redirected
# (coding agents, CI, `... 2>&1 | tee`), every such stderr line surfaces as a
# NativeCommandError record — with "Stop" the FIRST one terminates the script
# even though the command succeeded (exit 0). Seen live 2026-07-09: the run
# died on `services enable` at "Operation ... finished successfully."
# All failure handling below is explicit via $LASTEXITCODE, which is the only
# reliable success signal for native commands.
$ErrorActionPreference = "Continue"

if (-not $ProjectId) {
    $ProjectId = gcloud config get-value project 2>$null
    if (-not $ProjectId) {
        Write-Error "No GCP project configured. Set with: gcloud config set project <PROJECT_ID>"
        exit 1
    }
}

$DatabaseName = $AppName
$BucketName = "$ProjectId-$AppName"
$RepoName = $AppName
$ServiceAccount = "$ServiceAccountName@$ProjectId.iam.gserviceaccount.com"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  GCP Project Bootstrap - $AppName" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Project:         $ProjectId"
Write-Host "Region:          $Region"
Write-Host "Database:        $DatabaseName"
Write-Host "Bucket:          gs://$BucketName"
Write-Host "Registry:        $RepoLocation/$RepoName"
Write-Host "Service Account: $ServiceAccount"
Write-Host ""

# --- Step 1: Enable required APIs ---
Write-Host "Step 1: Enabling required GCP APIs..." -ForegroundColor Yellow

$requiredApis = @(
    "firestore.googleapis.com"              # Firestore
    "storage.googleapis.com"                # Cloud Storage
    "run.googleapis.com"                    # Cloud Run (deployment)
    "artifactregistry.googleapis.com"       # Artifact Registry (container images)
    "cloudbuild.googleapis.com"             # Cloud Build (-CloudBuild deploys)
    "secretmanager.googleapis.com"          # Secret Manager (API keys, credentials)
    "logging.googleapis.com"                # Cloud Logging
    "clouderrorreporting.googleapis.com"    # Error Reporting
    "iam.googleapis.com"                    # IAM (service accounts)
    "cloudresourcemanager.googleapis.com"   # Cloud Resource Manager
)

foreach ($api in $requiredApis) {
    Write-Host "  Enabling $api..." -NoNewline
    $result = gcloud services enable $api --project=$ProjectId 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " FAILED: $result" -ForegroundColor Red
    }
}

Write-Host ""

# --- Step 2: Create the runtime service account ---
Write-Host "Step 2: Creating service account '$ServiceAccountName'..." -ForegroundColor Yellow

$saExists = gcloud iam service-accounts describe $ServiceAccount `
    --project=$ProjectId --format="value(email)" 2>$null

if ($saExists) {
    Write-Host "  Service account already exists. Skipping." -ForegroundColor Green
} else {
    Write-Host "  Creating service account..." -NoNewline
    $result = gcloud iam service-accounts create $ServiceAccountName `
        --project=$ProjectId `
        --display-name="$AppName runtime (Cloud Run)" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " FAILED: $result" -ForegroundColor Red
    }
}

# --- Step 3: Grant the standard runtime roles (idempotent) ---
Write-Host "Step 3: Granting IAM roles to $ServiceAccount..." -ForegroundColor Yellow

$roles = @(
    "roles/datastore.user",                 # Firestore read/write
    "roles/storage.objectAdmin",            # write app files to the GCS bucket
    "roles/logging.logWriter",              # structured logs from app code
    "roles/errorreporting.writer",          # push exceptions to Error Reporting
    "roles/secretmanager.secretAccessor"    # read secrets if/when wired up
)

foreach ($role in $roles) {
    Write-Host "  Granting $role..."
    gcloud projects add-iam-policy-binding $ProjectId `
        --member="serviceAccount:$ServiceAccount" `
        --role=$role `
        --condition=None `
        --quiet `
        --no-user-output-enabled
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    OK" -ForegroundColor Green
    } else {
        Write-Host "    FAILED (exit $LASTEXITCODE)" -ForegroundColor Red
    }
}

Write-Host ""

# --- Step 4: Create Firestore database ---
Write-Host "Step 4: Creating Firestore database '$DatabaseName'..." -ForegroundColor Yellow

$existingDbs = gcloud firestore databases list --project=$ProjectId --format="value(name)" 2>$null
$dbExists = $existingDbs | Where-Object { $_ -match "$DatabaseName$" }

if ($dbExists) {
    Write-Host "  Database '$DatabaseName' already exists. Skipping." -ForegroundColor Green
} else {
    Write-Host "  Creating database..." -NoNewline
    $result = gcloud firestore databases create `
        --project=$ProjectId `
        --database=$DatabaseName `
        --location=$Region `
        --type=firestore-native 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " FAILED: $result" -ForegroundColor Red
        Write-Host "  Note: If the default database exists, you may need a different name or Blaze plan." -ForegroundColor Yellow
    }
}

Write-Host ""

# --- Step 5: Create Cloud Storage bucket ---
Write-Host "Step 5: Creating Cloud Storage bucket..." -ForegroundColor Yellow

$bucketExists = gsutil ls -b "gs://$BucketName" 2>$null

if ($bucketExists) {
    Write-Host "  Bucket 'gs://$BucketName' already exists. Skipping." -ForegroundColor Green
} else {
    Write-Host "  Creating bucket 'gs://$BucketName'..." -NoNewline
    $result = gsutil mb -l $Region -p $ProjectId "gs://$BucketName" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " FAILED: $result" -ForegroundColor Red
    }
}

Write-Host ""

# --- Step 6: Create Artifact Registry repository ---
Write-Host "Step 6: Creating Artifact Registry repository..." -ForegroundColor Yellow

$repoExists = gcloud artifacts repositories describe $RepoName `
    --project=$ProjectId --location=$RepoLocation --format="value(name)" 2>$null

if ($repoExists) {
    Write-Host "  Repository '$RepoName' already exists. Skipping." -ForegroundColor Green
} else {
    Write-Host "  Creating repository..." -NoNewline
    $result = gcloud artifacts repositories create $RepoName `
        --project=$ProjectId `
        --location=$RepoLocation `
        --repository-format=docker `
        --description="$AppName container images" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " FAILED: $result" -ForegroundColor Red
    }
}

Write-Host ""

# --- Summary ---
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Bootstrap Complete" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. For local dev, create a key: gcloud iam service-accounts keys create .config/$AppName.json --iam-account=$ServiceAccount"
Write-Host "     and set GOOGLE_APPLICATION_CREDENTIALS to it (keep .config/ gitignored)"
Write-Host "  2. Update back-end/.env_pydantic with:"
Write-Host "       database_name=$DatabaseName"
Write-Host "       gcp_storage_bucket=$BucketName"
Write-Host "  3. Deploy with the deploy-cloudrun skill's deploy.ps1 (it pins --service-account=$ServiceAccount)"
Write-Host ""
