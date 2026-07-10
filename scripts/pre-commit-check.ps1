# Windows PowerShell script executed by Git's pre-commit hook wrapper

Write-Host "[Git Guard] Scanning staged changes..." -ForegroundColor Cyan

$Blocked = $false
$StagedFiles = git diff --cached --name-only

foreach ($File in $StagedFiles) {
    if (-not (Test-Path $File)) {
        continue
    }

    $FileInfo = Get-Item $File
    $SizeMB = $FileInfo.Length / 1MB
    $Ext = $FileInfo.Extension.Replace(".", "").ToLower()

    # 1. Size Check
    if ($SizeMB -ge 100) {
        Write-Host "  [BLOCKED] '$File' is too large ($([math]::Round($SizeMB, 2)) MB). Hard limit is 100 MB." -ForegroundColor Red
        $Blocked = $true
    }

    # 2. Secret / Credentials check
    if ($FileInfo.Name -eq ".env" -or $FileInfo.Name -match "key" -or $FileInfo.Name -match "secret" -or $Ext -eq "pem" -or $Ext -eq "pfx") {
        Write-Host "  [BLOCKED] Suspect key or configuration file: '$File'" -ForegroundColor Red
        $Blocked = $true
    }
}

if ($Blocked) {
    Write-Host "[Git Guard] Commit rejected! Please track large files with DVC/Object Storage and credentials in ignored paths." -ForegroundColor Red
    Exit 1
} else {
    Write-Host "[Git Guard] All staged files passed validation." -ForegroundColor Green
    Exit 0
}
