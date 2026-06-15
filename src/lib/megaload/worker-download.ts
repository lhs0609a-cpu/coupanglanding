// 메가로드 도우미(통합 데스크톱 앱) 설치파일.
// 고정 태그 'megaload-desktop-update' 릴리스에, 버전이 들어간 파일명으로 업로드한다.
//   예: MegaloadDesktop-Setup-0.2.20.exe  (electron-builder.yml 의 artifactName 과 동일 규칙)
// ⚠️ 과거 env(NEXT_PUBLIC_WORKER_DOWNLOAD_URL)로 덮어쓰던 방식은 제거했다 —
//    그 env 가 통합 전 옛 'CoupangThumbnailWorker-Setup.exe' URL 로 남아 있어,
//    홈페이지에서 엉뚱하게 옛 워커가 받아지는 사고가 있었음. 이제 코드값을 강제 사용.

// 현재 발행된 "메가로드 도우미(데스크톱 앱)" 버전 — 단일 출처.
// ⚠️ 릴리스 순서를 반드시 지킬 것 (안 그러면 다운로드 404):
//    1) worker/desktop/package.json version 을 이 값과 동일하게
//    2) cd worker/desktop && npm run dist  (→ MegaloadDesktop-Setup-<버전>.exe + latest.yml)
//    3) GitHub 릴리스 'megaload-desktop-update' 에 위 2개 업로드
//    4) 그 다음에 이 값을 올려 배포  ← 업로드 전에 올리면 없는 파일을 가리켜 404
export const WORKER_APP_VERSION = '0.2.34';

// 버전 포함 다운로드 URL — WORKER_APP_VERSION 단일 출처에서 구성(파일명과 자동 일치).
export const WORKER_DOWNLOAD_URL =
  `https://github.com/lhs0609a-cpu/coupanglanding/releases/download/megaload-desktop-update/MegaloadDesktop-Setup-${WORKER_APP_VERSION}.exe`;

// 워커 설치 방법·사양 체크가 있는 설정 탭.
// ⭐ 메가로드 도우미·모니터링 도우미 **다운로드 단일 허브**. 다른 화면은 여기로 링크만 한다.
export const WORKER_SETTINGS_URL = '/megaload/settings?tab=localgpu';

// ─────────────────────────────────────────────────────────────────────────
// 상품 모니터링 도우미(desktop-monitor) — 별도 exe·별도 버전. 다운로드 URL 단일 출처.
//   release workflow(desktop-monitor-release.yml) 태그 규칙: `desktop-v*.*.*`
//   ⚠️ releases/latest/download 는 다른 프로젝트 release 로 redirect 되어 404 나므로 명시 태그 사용.
//   버전 올릴 때: 1) 릴리스 업로드 → 2) 이 값 변경 (순서 지킬 것).
export const MONITOR_APP_VERSION = '0.1.13';
const MONITOR_RELEASE_BASE =
  `https://github.com/lhs0609a-cpu/coupanglanding/releases/download/desktop-v${MONITOR_APP_VERSION}`;
export const MONITOR_DOWNLOAD_URLS = {
  win: `${MONITOR_RELEASE_BASE}/Megaload-Monitor-Setup-${MONITOR_APP_VERSION}.exe`,
  macIntel: `${MONITOR_RELEASE_BASE}/Megaload-Monitor-${MONITOR_APP_VERSION}-x64.dmg`,
  macArm: `${MONITOR_RELEASE_BASE}/Megaload-Monitor-${MONITOR_APP_VERSION}-arm64.dmg`,
} as const;
// 모니터링 도우미 인증코드 발급·연결 진단 페이지.
export const MONITOR_AUTH_URL = '/megaload/desktop-app';
