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
export const WORKER_APP_VERSION = '0.2.23';

// 버전 포함 다운로드 URL — WORKER_APP_VERSION 단일 출처에서 구성(파일명과 자동 일치).
export const WORKER_DOWNLOAD_URL =
  `https://github.com/lhs0609a-cpu/coupanglanding/releases/download/megaload-desktop-update/MegaloadDesktop-Setup-${WORKER_APP_VERSION}.exe`;

// 워커 설치 방법·사양 체크가 있는 설정 탭.
export const WORKER_SETTINGS_URL = '/megaload/settings?tab=localgpu';
