# Windows PowerShell Script to check workspace files for Git limits and secret exposure

Write-Host "=== Auditing Git-Tracked Workspace for Large Files & Exposed Secrets ===" -ForegroundColor Cyan

$Success = $true

# Secret scanning keywords/patterns
$SecretPatterns = @(
    "VITE_SECRET_KEY", "SECRET_KEY", "PGPASSWORD", "JWT_SECRET", "API_KEY", "PRIVATE KEY"
)

# Read Git Attributes to know LFS-tracked extensions
$LfsExtensions = @()
if (Test-Path ".gitattributes") {
    $Attrs = Get-Content ".gitattributes"
    foreach ($Line in $Attrs) {
        if ($Line -match "\*\.(\w+)") {
            $LfsExtensions += $Matches[1].ToLower()
        }
    }
}

# Scan only Git-tracked and staged files
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "Git is not installed or not in PATH."
    Exit 1
}

$TrackedFiles = git ls-files
$StagedFiles = git diff --cached --name-only
$FilesToScan = ($TrackedFiles + $StagedFiles) | Select-Object -Unique

foreach ($FilePath in $FilesToScan) {
    if (-not (Test-Path $FilePath)) {
        continue
    }
    
    $File = Get-Item $FilePath
    $SizeMB = $File.Length / 1MB
    $Ext = $File.Extension.Replace(".", "").ToLower()
    
    # 1. Hard 100 MB Limit check
    if ($SizeMB -ge 100) {
        Write-Host "[BLOCKED] $FilePath is too large ($([math]::Round($SizeMB, 2)) MB). Max allowed size is 100 MB." -ForegroundColor Red
        $Success = $false
    }
    # 2. 10 MB Warning Check (if not tracked by LFS)
    elseif ($SizeMB -ge 10) {
        if ($LfsExtensions -notcontains $Ext) {
            Write-Host "[WARNING] $FilePath is ($([math]::Round($SizeMB, 2)) MB) and not registered in .gitattributes for LFS tracking." -ForegroundColor Yellow
        }
    }
    
    # 3. Secret checks for text files
    if ($File.Length -lt 10MB -and @(".env", ".txt", ".json", ".ini", ".yaml", ".yml", ".py", ".ts", ".tsx", ".js") -contains $File.Extension) {
        try {
            $Content = Get-Content -Path $File.FullName -Raw -ErrorAction SilentlyContinue
            if ($File.Name -eq ".env" -or $File.Name -match "key" -or $File.Name -match "secret") {
                if ($File.Name -notmatch "example" -and $File.Name -notmatch "config" -and $File.Name -notmatch "manifest" -and $File.Name -notmatch "check-large-files") {
                    Write-Host "[BLOCKED] Secret file pattern detected: $FilePath" -ForegroundColor Red
                    $Success = $false
                }
            }
            foreach ($P in $SecretPatterns) {
                if ($Content -match "$P\s*=\s*" -and $File.Name -notmatch "config" -and $File.Name -notmatch "example" -and $File.Name -notmatch "manifest" -and $File.Name -notmatch "check-large-files" -and $File.Name -notmatch "pre-commit") {
                    Write-Host "[BLOCKED] Key exposure in $FilePath (contains '$P' assignment)" -ForegroundColor Red
                    $Success = $false
                }
            }
        } catch {}
    }
}

if ($Success) {
    Write-Host "=== Audit complete: No policy violations found! ===" -ForegroundColor Green
} else {
    Write-Error "Workspace policy audit failed. Correct the errors above."
    Exit 1
}
