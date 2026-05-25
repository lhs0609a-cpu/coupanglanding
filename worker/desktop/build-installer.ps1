# =====================================================================
# 쿠팡 썸네일 워커 — 원클릭 설치기(.exe) 빌드 스크립트
# ---------------------------------------------------------------------
# 이 스크립트 한 번 실행이면: 로컬 복사 → npm 설치 → winCodeSign 우회 → 빌드 → .exe.
# Google Drive("내 드라이브") 위에서 직접 빌드하면 파일잠금/심링크 문제로 실패하므로,
# 소스를 로컬 디스크로 복사해 빌드한다. 관리자 권한/개발자 모드 불필요.
#
# 사용: 이 파일을 우클릭 → "PowerShell로 실행"  또는
#       powershell -ExecutionPolicy Bypass -File build-installer.ps1
# =====================================================================
$ErrorActionPreference = 'Stop'

# 이 스크립트가 있는 worker/desktop 의 상위 = worker/
$desktopSrc = $PSScriptRoot
$workerSrc  = Split-Path $desktopSrc -Parent
$buildRoot  = Join-Path $env:LOCALAPPDATA 'cthumb-build'
$workerDst  = Join-Path $buildRoot 'worker'
$desktopDst = Join-Path $workerDst 'desktop'

Write-Host "1/4  소스를 로컬로 복사 (Drive FS 회피)..." -ForegroundColor Cyan
robocopy $workerSrc $workerDst /E /XD node_modules dist .git | Out-Null
if ($LASTEXITCODE -ge 8) { throw "복사 실패 (robocopy $LASTEXITCODE)" }

Write-Host "2/4  npm 설치..." -ForegroundColor Cyan
Push-Location $desktopDst
try {
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm install 실패" }

  # 3/4 winCodeSign 심링크 우회: macOS .dylib 심링크(Windows 빌드 불필요)를 제외하고 미리 캐시.
  Write-Host "3/4  winCodeSign 캐시 준비 (심링크 우회)..." -ForegroundColor Cyan
  $cache = Join-Path $env:LOCALAPPDATA 'electron-builder\Cache\winCodeSign'
  $cacheDir = Join-Path $cache 'winCodeSign-2.6.0'
  if (-not (Test-Path (Join-Path $cacheDir 'windows-10'))) {
    New-Item -ItemType Directory -Path $cache -Force | Out-Null
    $sevenZa = Join-Path $desktopDst 'node_modules\7zip-bin\win\x64\7za.exe'
    $arcItem = Get-ChildItem "$cache\*.7z" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($arcItem) {
      $arcPath = $arcItem.FullName
    } else {
      $arcPath = Join-Path $cache 'winCodeSign-2.6.0.7z'
      Invoke-WebRequest -Uri 'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z' -OutFile $arcPath
    }
    if (Test-Path $cacheDir) { Remove-Item $cacheDir -Recurse -Force }
    New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
    & $sevenZa x $arcPath "-o$cacheDir" "-xr!darwin" -y | Out-Null
  }

  Write-Host "4/4  설치기 빌드..." -ForegroundColor Cyan
  npm run dist
  if ($LASTEXITCODE -ne 0) { throw "빌드 실패" }
}
finally { Pop-Location }

$buildDistDir = Join-Path $desktopDst 'dist'
$exe = Get-ChildItem (Join-Path $buildDistDir '*Setup*.exe') | Select-Object -First 1
# 결과물을 Drive 의 worker/desktop/dist 로도 복사(찾기 쉽게)
$driveDist = Join-Path $desktopSrc 'dist'
New-Item -ItemType Directory -Path $driveDist -Force | Out-Null
Copy-Item $exe.FullName $driveDist -Force

# ── 자동 업데이트 피드 발행 ──────────────────────────────────────────
# electron-updater(generic) 가 읽는 고정 태그 'gpu-worker-update' 릴리스에
# latest.yml + Setup.exe + .blockmap 을 덮어쓰기 업로드한다. (모니터 릴리스와 격리)
# gh CLI 가 인증돼 있어야 함. 없거나 실패하면 빌드는 성공 처리하고 수동 안내만 출력.
$repo = 'lhs0609a-cpu/coupanglanding'
$feedTag = 'megaload-desktop-update'
$ymlPath = Join-Path $buildDistDir 'latest.yml'
$blockmap = Get-ChildItem (Join-Path $buildDistDir '*Setup*.exe.blockmap') -ErrorAction SilentlyContinue | Select-Object -First 1
$assets = @($exe.FullName)
if (Test-Path $ymlPath) { $assets += $ymlPath; Copy-Item $ymlPath $driveDist -Force }
if ($blockmap) { $assets += $blockmap.FullName }

$published = $false
if (-not (Test-Path $ymlPath)) {
  Write-Host "[경고] dist\latest.yml 이 없습니다 — electron-builder publish 설정 확인 필요. 자동 업데이트 피드 업로드 건너뜀." -ForegroundColor Yellow
} elseif (Get-Command gh -ErrorAction SilentlyContinue) {
  Write-Host "5/5  자동 업데이트 피드 업로드 ($feedTag)..." -ForegroundColor Cyan
  try {
    gh release view $feedTag --repo $repo 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) {
      gh release create $feedTag --repo $repo --title "메가로드 도우미 — 자동업데이트 피드" --notes "electron-updater 자동업데이트용 롤링 릴리스. 항상 최신 빌드의 latest.yml / MegaloadDesktop-Setup.exe / .blockmap 이 여기에 덮어써집니다." | Out-Null
    }
    gh release upload $feedTag @assets --clobber --repo $repo
    if ($LASTEXITCODE -eq 0) { $published = $true }
  } catch { Write-Host "[경고] gh 업로드 실패: $_" -ForegroundColor Yellow }
} else {
  Write-Host "[안내] gh CLI 가 없어 자동 업로드를 건너뜁니다." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "완료! 원클릭 설치기:" -ForegroundColor Green
Write-Host "  $($exe.FullName)" -ForegroundColor Green
Write-Host "  (사본) $driveDist\$($exe.Name)" -ForegroundColor Green
Write-Host ""
if ($published) {
  Write-Host "자동 업데이트 피드 발행 완료 → $feedTag 릴리스에 latest.yml/Setup.exe 업로드됨." -ForegroundColor Green
  Write-Host "기존 사용자(자동업데이트 포함 버전)는 다음 체크 때 업데이트 알림을 받습니다." -ForegroundColor Green
  Write-Host "다운로드 버튼용 Vercel 환경변수(최초 1회): NEXT_PUBLIC_WORKER_DOWNLOAD_URL =" -ForegroundColor Yellow
  Write-Host "  https://github.com/$repo/releases/download/$feedTag/$($exe.Name)" -ForegroundColor Yellow
} else {
  Write-Host "다음(수동): 아래 3개 파일을 GitHub '$feedTag' 릴리스에 덮어쓰기 업로드하세요:" -ForegroundColor Yellow
  Write-Host "  - $($exe.Name)`n  - latest.yml`n  - $($exe.Name).blockmap" -ForegroundColor Yellow
  Write-Host "그리고 Vercel 환경변수 NEXT_PUBLIC_WORKER_DOWNLOAD_URL 에 다운로드 링크를 설정하면" -ForegroundColor Yellow
  Write-Host "메가로드 '로컬 GPU 썸네일' 탭의 다운로드 버튼이 활성화됩니다." -ForegroundColor Yellow
}
