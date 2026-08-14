# Installs dsh-pet into the `web` profile of a DSH home.
# Idempotent: safe to re-run. Does NOT restart the server.
param(
  [string]$DshHome = $(
    if ($env:DSH_HOME) { $env:DSH_HOME }
    elseif ($env:USERPROFILE) { Join-Path $env:USERPROFILE '.dsh' }
    else { Join-Path $HOME '.dsh' }
  )
)
$ErrorActionPreference = 'Stop'

$src = Split-Path -Parent $PSScriptRoot          # workspace root (has lib/, package.json)
$profileDir = Join-Path $DshHome 'profiles\web'
$dest = Join-Path $profileDir 'node_modules\@minybear\dsh-pet'

if (-not (Test-Path (Join-Path $src 'package.json'))) {
  throw "package.json not found under $src — run this from the dsh-pet checkout"
}

# 1. copy the package into the profile's hoisted node_modules
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Recurse -Force (Join-Path $src 'lib') $dest
Copy-Item -Force (Join-Path $src 'package.json') $dest
Copy-Item -Force (Join-Path $src 'cordis.patch.yml') $dest
Write-Host "copied package -> $dest"

# 2. register the browser roster row in the profile patch layer
$patchFile = Join-Path $profileDir 'cordis.patch.yml'
if (-not (Test-Path $profileDir)) { throw "profile dir missing: $profileDir (is DSH_HOME correct?)" }

$rowBlock = @(
  '- insert:'
  '    - id: ui-pet'
  "      name: '@minybear/dsh-pet'"
) -join "`n"

if (-not (Test-Path $patchFile)) {
  Set-Content -Path $patchFile -Value $rowBlock -Encoding utf8
  Write-Host "created $patchFile with the ui-pet roster row"
} else {
  $content = Get-Content $patchFile -Raw
  if ($content -match 'id:\s*ui-pet') {
    Write-Host "roster row already present; skipped"
  } elseif ($content.TrimEnd().EndsWith('[]')) {
    # replace the empty flow list with the block list
    $content = $content.Substring(0, $content.LastIndexOf('[]')) + $rowBlock
    Set-Content -Path $patchFile -Value $content -Encoding utf8
    Write-Host "replaced empty [] with the ui-pet roster row"
  } else {
    $content = $content.TrimEnd() + "`n`n" + $rowBlock
    Set-Content -Path $patchFile -Value $content -Encoding utf8
    Write-Host "appended the ui-pet roster row"
  }
}

Write-Host ""
Write-Host "Done. Next steps:"
Write-Host "  1. validate config:  dsh --profile web --dump-config"
Write-Host "  2. restart:          (stop the running 'dsh web', then) dsh web"
Write-Host "  3. refresh http://127.0.0.1:3080 — the pet appears bottom-right."
