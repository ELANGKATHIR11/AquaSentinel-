# Windows PowerShell Script to set up Git and hooks for AquaSentinel
# Enables Git LFS and registers the pre-commit Hook

Write-Host "=== Setting up Git and Git LFS for AquaSentinel ===" -ForegroundColor Cyan

# 1. Check Git Installation
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "Git is not installed or not in PATH."
    Exit 1
}

# 2. Check and Initialize Git LFS
Write-Host "Initializing Git LFS..." -ForegroundColor Gray
& git lfs install

# 3. Configure local repository limits
# Set warning threshold and check permissions
if (Test-Path ".git") {
    # Copy pre-commit check script hook to Git hooks directory
    $HookDest = ".git/hooks/pre-commit"
    
    # We write a bash script wrapper for the powershell execution inside the git hook
    $HookContent = @"
#!/bin/sh
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/pre-commit-check.ps1
"@
    
    [System.IO.File]::WriteAllText($HookDest, $HookContent)
    Write-Host "[OK] Registered pre-commit hook wrapper at $HookDest" -ForegroundColor Green
} else {
    Write-Warning "Not in a Git repository root. Hooks were not installed."
}

Write-Host "=== Git Configuration complete! ===" -ForegroundColor Green
