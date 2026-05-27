// 로컬 GPU 썸네일 워커(설치형 .exe) 배포 위치.
//
// electron-builder(generic) 가 읽는 고정 태그 'gpu-worker-update' 릴리스에
// build-installer.ps1 이 CoupangThumbnailWorker-Setup.exe 를 항상 덮어쓰기 업로드한다.
// → 태그/파일명이 불변이라 다운로드 URL 도 영구 불변. 따라서 env 없이도 동작하도록
//   이 고정 URL 을 기본값으로 둔다(배포 환경에서 NEXT_PUBLIC_WORKER_DOWNLOAD_URL 로 덮어쓰기 가능).
export const WORKER_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_WORKER_DOWNLOAD_URL ||
  'https://github.com/lhs0609a-cpu/coupanglanding/releases/download/megaload-desktop-update/MegaloadDesktop-Setup.exe';

// 워커 설치 방법·사양 체크가 있는 설정 탭.
export const WORKER_SETTINGS_URL = '/megaload/settings?tab=localgpu';

// 현재 발행된 "메가로드 도우미(데스크톱 앱)" 버전. 다운로드 URL 은 버전 무관 고정이라,
// 사용자에게 "지금 받으면/돌고 있는 게 몇 버전인지" 알리는 라벨로 쓴다.
// ⚠️ 도우미 릴리스(worker/desktop/package.json) 올릴 때 이 값도 함께 올린다.
export const WORKER_APP_VERSION = '0.2.4';
