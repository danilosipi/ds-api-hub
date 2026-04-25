# ======================================================
# DS API Hub — backup do código: backend NestJS + stacks
# (Docker Compose) + README e scripts; .env sanitizado
# ======================================================

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot | Split-Path -Parent
$WorkspaceRoot = Split-Path $ProjectRoot -Parent
$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$BackupsRoot = Join-Path $ProjectRoot "backups"
$BackupDir = Join-Path $BackupsRoot "backup_$Timestamp"
$BackupZip = Join-Path $BackupsRoot "backup_$Timestamp.zip"
$BackupBackend = Join-Path $BackupDir "backend"
$BackupStacks = Join-Path $BackupDir "stacks"
$BackupScripts = Join-Path $BackupDir "scripts"
$StacksSource = Join-Path $WorkspaceRoot "stacks"

# NestJS / Node (repo/backend)
$ExcludeBackend = @(
    "node_modules",
    "dist",
    "coverage",
    ".nyc_output",
    ".turbo",
    "build",
    ".cache",
    ".git",
    "logs",
    "*.log",
    "tmp"
)

# scripts/ e stacks/ — só o essencial
$ExcludeLight = @(
    ".git",
    "*.log"
)

function New-SanitizedEnvContent {
    param ([string]$SourcePath)
    if (-not (Test-Path $SourcePath)) { return $null }

    $lines = Get-Content $SourcePath -Encoding UTF8
    $out = @()

    foreach ($line in $lines) {
        if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
            $out += "$($Matches[1])="
        } else {
            $out += $line
        }
    }

    return $out -join "`n"
}

function Copy-DirectoryFiltered {
    param (
        [string]$Source,
        [string]$Dest,
        [string[]]$Exclude
    )

    if (-not (Test-Path $Source)) {
        Write-Warning "Pasta não encontrada: $Source"
        return
    }

    $SourceResolved = (Resolve-Path $Source).Path
    New-Item -ItemType Directory -Path $Dest -Force | Out-Null

    Get-ChildItem -Path $SourceResolved -Recurse -Force | ForEach-Object {
        $full = $_.FullName
        $rel = $full.Substring($SourceResolved.Length).TrimStart('\')
        $leaf = Split-Path $rel -Leaf
        $excluded = $false

        foreach ($pattern in $Exclude) {
            if ($pattern -notmatch '[\*\?]') {
                $parts = $rel -split '[\\/]'
                if ($parts -contains $pattern) {
                    $excluded = $true
                    break
                }
            } else {
                if ($leaf -like $pattern) {
                    $excluded = $true
                    break
                }
            }
        }

        if (-not $excluded) {
            $destPath = Join-Path $Dest $rel

            if ($_.PSIsContainer) {
                New-Item -ItemType Directory -Path $destPath -Force | Out-Null
            } else {
                $destDir = Split-Path $destPath -Parent
                if (-not (Test-Path $destDir)) {
                    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                }
                Copy-Item $full $destPath -Force
            }
        }
    }
}

New-Item -ItemType Directory -Path $BackupsRoot -Force | Out-Null
New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null

Write-Host "Criando backup em: $BackupZip" -ForegroundColor Cyan

# Backend (NestJS)
Write-Host "Copiando backend..." -ForegroundColor Green
Copy-DirectoryFiltered -Source (Join-Path $ProjectRoot "backend") -Dest $BackupBackend -Exclude $ExcludeBackend

foreach ($envFile in @(".env", ".env.local", ".env.docker", ".env.production", ".env.development")) {
    $src = Join-Path $ProjectRoot "backend\$envFile"
    $dst = Join-Path $BackupBackend $envFile
    if (Test-Path $src) {
        $sanitized = New-SanitizedEnvContent -SourcePath $src
        [System.IO.File]::WriteAllText($dst, $sanitized, [System.Text.UTF8Encoding]::new($false))
        Write-Host "  $envFile sanitizado" -ForegroundColor Gray
    }
}

# Stacks (Docker Compose na raiz do workspace, irmão de repo/)
if (Test-Path $StacksSource) {
    Write-Host "Copiando stacks (Docker Compose)..." -ForegroundColor Green
    Copy-DirectoryFiltered -Source $StacksSource -Dest $BackupStacks -Exclude $ExcludeLight
} else {
    Write-Warning "Pasta stacks não encontrada em: $StacksSource (ignorado)."
}

# README do repositório
$readmeSrc = Join-Path $ProjectRoot "README.md"
if (Test-Path $readmeSrc) {
    Copy-Item $readmeSrc (Join-Path $BackupDir "README.md") -Force
    Write-Host "README.md incluído." -ForegroundColor Green
}

# Scripts de utilitários (ex.: este backup)
Write-Host "Copiando scripts..." -ForegroundColor Green
Copy-DirectoryFiltered -Source (Join-Path $ProjectRoot "scripts") -Dest $BackupScripts -Exclude $ExcludeLight

Write-Host "Compactando em .zip..." -ForegroundColor Green
if (Test-Path $BackupZip) { Remove-Item $BackupZip -Force }
Compress-Archive -Path (Join-Path $BackupDir "*") -DestinationPath $BackupZip -CompressionLevel Optimal
Remove-Item -Path $BackupDir -Recurse -Force

Write-Host ""
Write-Host "Backup concluído: $BackupZip" -ForegroundColor Green
Write-Host "Os arquivos .env foram incluídos com chaves vazias." -ForegroundColor Gray
