// 메가로드 도우미(통합 데스크톱 앱) 설치파일 — 고정 태그 'megaload-desktop-update' 릴리스의
// MegaloadDesktop-Setup.exe (파일명/태그 불변 → URL 영구 불변).
// ⚠️ 과거 env(NEXT_PUBLIC_WORKER_DOWNLOAD_URL)로 덮어쓰던 방식은 제거했다 —
//    그 env 가 통합 전 옛 'CoupangThumbnailWorker-Setup.exe' URL 로 남아 있어,
//    홈페이지에서 엉뚱하게 옛 워커가 받아지는 사고가 있었음. 이제 코드값을 강제 사용.
export const WORKER_DOWNLOAD_URL =
  'https://github.com/lhs0609a-cpu/coupanglanding/releases/download/megaload-desktop-update/MegaloadDesktop-Setup.exe';

// 워커 설치 방법·사양 체크가 있는 설정 탭.
export const WORKER_SETTINGS_URL = '/megaload/settings?tab=localgpu';

// 현재 발행된 "메가로드 도우미(데스크톱 앱)" 버전. 다운로드 URL 은 버전 무관 고정이라,
// 사용자에게 "지금 받으면/돌고 있는 게 몇 버전인지" 알리는 라벨로 쓴다.
// ⚠️ 도우미 릴리스(worker/desktop/package.json) 올릴 때 이 값도 함께 올린다.
export const WORKER_APP_VERSION = '0.2.18';
