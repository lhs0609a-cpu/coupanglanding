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

$exe = Get-ChildItem (Join-Path $desktopDst 'dist\*Setup*.exe') | Select-Object -First 1
# 결과물을 Drive 의 worker/desktop/dist 로도 복사(찾기 쉽게)
$driveDist = Join-Path $desktopSrc 'dist'
New-Item -ItemType Directory -Path $driveDist -Force | Out-Null
Copy-Item $exe.FullName $driveDist -Force

Write-Host ""
Write-Host "완료! 원클릭 설치기:" -ForegroundColor Green
Write-Host "  $($exe.FullName)" -ForegroundColor Green
Write-Host "  (사본) $driveDist\$($exe.Name)" -ForegroundColor Green
Write-Host ""
Write-Host "다음: 이 .exe 를 GitHub Releases 에 올리고, Vercel 환경변수" -ForegroundColor Yellow
Write-Host "      NEXT_PUBLIC_WORKER_DOWNLOAD_URL 에 다운로드 링크를 설정하면" -ForegroundColor Yellow
Write-Host "      메가로드 '로컬 GPU 썸네일' 탭의 다운로드 버튼이 활성화됩니다." -ForegroundColor Yellow
