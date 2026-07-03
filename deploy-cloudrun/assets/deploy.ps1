<#
.SYNOPSIS
    Deploy services to Google Cloud Run (canonical house-stack script).

.DESCRIPTION
    Builds Docker images (locally or via Cloud Build) and deploys to Cloud Run.
    Deploys STAGING service names by default; use -Production for production names.
    On initial deploy ($env:INITIAL_DEPLOY set), seeds env vars from vars/<service>.yaml.

.EXAMPLE
    .\deploy.ps1 all                               # staging, local Docker build
    .\deploy.ps1 all -CloudBuild                   # staging, Cloud Build (no local Docker)
    .\deploy.ps1 back-end -Production              # production backend
    $env:INITIAL_DEPLOY=1; .\deploy.ps1 all        # first deploy, prompts for env YAMLs
#>

param(
    [Parameter(Position=0, Mandatory=$true)]
    [ValidateSet("back-end", "front-end", "all")]
    [string]$Service,

    [string]$Region = "",
    [string]$ProjectId = "",
    [switch]$Production,
    [switch]$CloudBuild  # Use Cloud Build instead of local Docker
)

$ErrorActionPreference = "Stop"

# ============================ PROJECT CONFIG =================================
$AppTitle    = "My App"            # display name in banners
$RegistryId  = "my-app"            # Artifact Registry repository name
$RepoRegion  = "europe"            # Artifact Registry multi-region
$DefaultRegion = "europe-west1"

# Per-service settings: dir, base service name, resources.
$ServiceTable = @{
    "back-end"  = @{ Dir = "back-end";  Name = "my-app-back";  Timeout = 120; Memory = "1Gi"   }
    "front-end" = @{ Dir = "front-end"; Name = "my-app-front"; Timeout = 30;  Memory = "256Mi" }
}

# Env-var YAML seeds written on INITIAL_DEPLOY (edit before continuing the deploy)
$BackendYamlSeed = @"
DEBUG: "false"
DATABASE_NAME: "my-app"
AUTH_JWT_SECRET: "CHANGE-THIS-TO-A-SECURE-SECRET-AT-LEAST-32-CHARS"
OPENROUTER_API_KEY: ""
CORS_ALLOWED_ORIGINS: '["https://FRONTEND-URL"]'
EMAIL_MAILER_DRY_RUN: "true"
"@
$FrontendYamlSeed = @"
VITE_API_URL: "https://BACKEND-URL"
VITE_DEBUG: "false"
"@
# =============================================================================

# Resolve defaults
$ProjectId = if ($ProjectId) { $ProjectId }
    elseif ($env:PROJECT_ID) { $env:PROJECT_ID }
    else { (gcloud config get-value project 2>$null) }

$Region = if ($Region) { $Region }
    elseif ($env:CLOUD_REGION) { $env:CLOUD_REGION }
    else { $DefaultRegion }

$NamePrefix = if ($Production) { "" } else { "staging-" }
$EnvLabel   = if ($Production) { "PRODUCTION" } else { "staging" }

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  $AppTitle - Cloud Run Deployment ($EnvLabel)" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Project:  $ProjectId"
Write-Host "Region:   $Region"
Write-Host "Service:  $Service"
Write-Host ""

gcloud config set project $ProjectId
gcloud auth configure-docker "$RepoRegion-docker.pkg.dev" --quiet

function Deploy-Service {
    param(
        [string]$ServiceDir,
        [string]$ServiceName,
        [int]$Timeout = 300,
        [string]$Memory = "512Mi"
    )

    Write-Host "--- Deploying $ServiceName ---" -ForegroundColor Yellow

    $image = "$RepoRegion-docker.pkg.dev/$ProjectId/$RegistryId/$ServiceName"

    Push-Location $ServiceDir

    if ($CloudBuild) {
        # Cloud Build: builds remotely, no local Docker needed
        Write-Host "Building via Cloud Build -> $image ..." -ForegroundColor Cyan
        gcloud builds submit `
            --project=$ProjectId `
            --region=$Region `
            --tag=$image `
            --quiet
        if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Cloud Build failed for $ServiceName" }
    } else {
        # Local Docker: faster iteration, can test locally before pushing
        Write-Host "Building locally -> $image ..." -ForegroundColor Cyan
        docker build -t $ServiceName .
        if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Docker build failed for $ServiceName" }

        Write-Host "Pushing to Artifact Registry..." -ForegroundColor Cyan
        docker tag $ServiceName $image
        docker push $image
        if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Docker push failed for $ServiceName" }
    }

    Pop-Location

    # Pin the runtime identity to the project's worker SA so the service has
    # Firestore/Storage/logging access (granted by the gcp-bootstrap script).
    # Without this, Cloud Run falls back to the default compute SA, which has
    # no Firestore permission and every request 403s.
    $deployArgs = @(
        $ServiceName,
        "--image", $image,
        "--region", $Region,
        "--port", "8080",
        "--cpu", "1",
        "--memory", $Memory,
        "--concurrency", "80",
        "--timeout", "$Timeout",
        "--service-account", "worker@$($ProjectId).iam.gserviceaccount.com",
        "--allow-unauthenticated"
    )

    if ($env:INITIAL_DEPLOY) {
        $yamlDir = Join-Path $ServiceDir "vars"
        $yamlFile = Join-Path $yamlDir "$ServiceName.yaml"

        if (-not (Test-Path $yamlDir)) { New-Item -ItemType Directory -Path $yamlDir | Out-Null }

        if (-not (Test-Path $yamlFile)) {
            Write-Host "Creating default env vars YAML..." -ForegroundColor Cyan
            $seed = if ($ServiceName -like "*back*") { $BackendYamlSeed } else { $FrontendYamlSeed }
            $seed | Set-Content -Path $yamlFile
        }

        Write-Host ""
        Write-Host "Edit environment variables in: $yamlFile" -ForegroundColor Yellow
        Get-Content $yamlFile
        Write-Host ""
        $response = Read-Host "Press Enter to continue (or Ctrl+C to cancel)"
        $deployArgs += @("--env-vars-file", $yamlFile)
    }

    Write-Host "Deploying to Cloud Run..." -ForegroundColor Green
    gcloud run deploy @deployArgs

    if ($LASTEXITCODE -eq 0) {
        Write-Host "$ServiceName deployed successfully!" -ForegroundColor Green
        $url = gcloud run services describe $ServiceName --region $Region --format="value(status.url)"
        Write-Host "URL: $url" -ForegroundColor Cyan
        return $url
    } else {
        throw "Deployment failed for $ServiceName"
    }
}

# Deploy requested services
$backendUrl = ""
$frontendUrl = ""

foreach ($key in @("back-end", "front-end")) {
    if ($Service -ne $key -and $Service -ne "all") { continue }
    $cfg = $ServiceTable[$key]
    $url = Deploy-Service -ServiceDir $cfg.Dir -ServiceName "$NamePrefix$($cfg.Name)" `
                          -Timeout $cfg.Timeout -Memory $cfg.Memory
    if ($key -eq "back-end") { $backendUrl = $url } else { $frontendUrl = $url }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Deployment Complete ($EnvLabel)" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
if ($backendUrl) { Write-Host "Backend:  $backendUrl" }
if ($frontendUrl) { Write-Host "Frontend: $frontendUrl" }
Write-Host ""
if ($backendUrl -and $frontendUrl) {
    Write-Host "Next: Update frontend VITE_API_URL to point to the backend URL" -ForegroundColor Yellow
    Write-Host "Next: Update backend CORS_ALLOWED_ORIGINS to include the frontend URL" -ForegroundColor Yellow
}
