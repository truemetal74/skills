# Rebuild the vendored wheels for the shared packages (github.com/truemetal74/my-python).
# Run after changing/bumping a shared package, then update the wheel filenames in
# requirements.txt if a version changed, and commit the new wheels.
#
# Usage:  .\cmd_tools\vendor-shared-packages.ps1 [-SourceRoot C:\prog\my-py]

param(
    [string]$SourceRoot = "C:\prog\my-py"
)

$backEnd = Split-Path -Parent $PSScriptRoot
$vendor = Join-Path $backEnd "vendor"
$python = Join-Path $backEnd ".venv\Scripts\python.exe"

$packages = @("firestore-dict", "transactional-emails", "openrouter-llm", "fastapi-reqlog")

if (-not (Test-Path $python)) {
    Write-Error "Backend venv python not found at $python"
    exit 1
}

New-Item -ItemType Directory -Force $vendor | Out-Null
Remove-Item (Join-Path $vendor "*.whl") -Force -ErrorAction SilentlyContinue

foreach ($pkg in $packages) {
    $src = Join-Path $SourceRoot $pkg
    if (-not (Test-Path $src)) {
        Write-Error "Package source not found: $src"
        exit 1
    }
    & $python -m pip wheel --quiet --no-deps -w $vendor $src
    if ($LASTEXITCODE -ne 0) {
        Write-Error "pip wheel failed for $pkg"
        exit 1
    }
}

Write-Host "Vendored wheels in ${vendor}:"
Get-ChildItem $vendor -Filter *.whl | ForEach-Object { Write-Host "  $($_.Name)" }
Write-Host "If a version changed, update the ./vendor/ lines in requirements.txt."
