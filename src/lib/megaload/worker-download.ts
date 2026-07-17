// 메가로드 도우미(통합 데스크톱 앱)·상품 모니터링 도우미 설치파일.
// ⚠️ 과거 env(NEXT_PUBLIC_WORKER_DOWNLOAD_URL)로 덮어쓰던 방식은 제거했다 —
//    그 env 가 통합 전 옛 'CoupangThumbnailWorker-Setup.exe' URL 로 남아 있어,
//    홈페이지에서 엉뚱하게 옛 워커가 받아지는 사고가 있었음. 이제 코드값을 강제 사용.
//
// ⭐ 버전의 단일 출처는 **실제 발행된 GitHub 릴리스**다(이 파일의 상수가 아니다).
//    /api/megaload/worker/latest-version 이 electron-updater 가 읽는 것과 똑같은
//    latest.yml · 릴리스 자산 목록을 읽어 버전과 다운로드 URL 을 만든다.
//    → 웹이 표시하는 "최신 버전"과 앱이 자동업데이트하는 버전이 어긋날 수 없다.
//    아래 *_FALLBACK 상수는 그 조회가 실패했을 때(네트워크·레이트리밋)만 쓰는 보험이다.

export const GITHUB_OWNER = 'lhs0609a-cpu';
export const GITHUB_REPO = 'coupanglanding';

// ─────────────────────────────────────────────────────────────────────────
// 메가로드 도우미(데스크톱 앱) — 고정 태그 릴리스에 버전 파일명으로 발행.
//   예: MegaloadDesktop-Setup-0.2.40.exe (electron-builder.yml artifactName 규칙)
//   electron-updater generic 프로바이더가 이 고정 URL 의 latest.yml 을 읽는다.
export const DESKTOP_RELEASE_TAG = 'megaload-desktop-update';
export const DESKTOP_RELEASE_BASE =
  `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${DESKTOP_RELEASE_TAG}`;
/** 앱·웹이 공유하는 자동업데이트 피드. 여기 version 이 곧 "진짜 최신". */
export const DESKTOP_LATEST_YML_URL = `${DESKTOP_RELEASE_BASE}/latest.yml`;

/** 조회 실패 시에만 쓰는 보험값. 최신값을 여기 적을 필요 없다(릴리스가 출처). */
export const WORKER_APP_VERSION_FALLBACK = '0.2.40';

export const buildDesktopDownloadUrl = (version: string) =>
  `${DESKTOP_RELEASE_BASE}/MegaloadDesktop-Setup-${version}.exe`;

// ─────────────────────────────────────────────────────────────────────────
// 상품 모니터링 도우미(desktop-monitor) — 별도 exe·별도 버전·버전별 태그.
//   release workflow(desktop-monitor-release.yml) 태그 규칙: `desktop-v*.*.*`
//   ⚠️ releases/latest/download 는 다른 프로젝트 release 로 redirect 되어 404 나므로
//      태그 접두사로 직접 필터링한다.
export const MONITOR_TAG_PREFIX = 'desktop-v';
export const MONITOR_APP_VERSION_FALLBACK = '0.1.16';

export const buildMonitorReleaseBase = (version: string) =>
  `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${MONITOR_TAG_PREFIX}${version}`;

/**
 * 모니터 다운로드 URL — **자산이 실제 존재할 때만** 채운다.
 * ⚠️ mac Intel(x64) dmg 는 0.1.15 부터 빌드가 깨져 발행되지 않았다. 그런데도 웹이
 *    URL 을 조립해 링크를 걸어 두면 사용자는 404 를 받는다. 그래서 "조립"이 아니라
 *    릴리스 자산 목록에 있는 파일만 링크한다(없으면 그 버튼은 감춘다).
 */
export function buildMonitorUrls(version: string, assetNames: string[]) {
  const base = buildMonitorReleaseBase(version);
  const has = (name: string) => assetNames.includes(name);
  const pick = (name: string) => (has(name) ? `${base}/${name}` : undefined);
  return {
    win: pick(`Megaload-Monitor-Setup-${version}.exe`),
    macIntel: pick(`Megaload-Monitor-${version}-x64.dmg`),
    macArm: pick(`Megaload-Monitor-${version}-arm64.dmg`),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 워커 설치 방법·사양 체크가 있는 설정 탭.
// ⭐ 메가로드 도우미·모니터링 도우미 **다운로드 단일 허브**. 다른 화면은 여기로 링크만 한다.
export const WORKER_SETTINGS_URL = '/megaload/settings?tab=localgpu';
// 모니터링 도우미 인증코드 발급·연결 진단 페이지.
export const MONITOR_AUTH_URL = '/megaload/desktop-app';

// ─────────────────────────────────────────────────────────────────────────
// /api/megaload/worker/latest-version 응답 계약.

export interface DesktopReleaseInfo {
  version: string;
  downloadUrl: string;
}

export interface MonitorReleaseInfo {
  version: string;
  /** 실제 발행된 자산만. 없는 플랫폼은 undefined → UI 가 버튼을 감춘다. */
  urls: { win?: string; macIntel?: string; macArm?: string };
}

export interface LatestVersionsResponse {
  desktop: DesktopReleaseInfo;
  monitor: MonitorReleaseInfo;
  /** false = 릴리스 조회 실패로 폴백 상수를 쓴 응답(표시값이 낡았을 수 있음). */
  resolved: boolean;
}

/** 릴리스 조회가 완전히 실패했을 때의 최종 응답. */
export function fallbackVersions(): LatestVersionsResponse {
  const v = MONITOR_APP_VERSION_FALLBACK;
  const base = buildMonitorReleaseBase(v);
  return {
    desktop: {
      version: WORKER_APP_VERSION_FALLBACK,
      downloadUrl: buildDesktopDownloadUrl(WORKER_APP_VERSION_FALLBACK),
    },
    monitor: {
      version: v,
      // 폴백에서도 x64 는 넣지 않는다 — 0.1.15+ 에는 존재하지 않는 자산이다.
      urls: {
        win: `${base}/Megaload-Monitor-Setup-${v}.exe`,
        macArm: `${base}/Megaload-Monitor-${v}-arm64.dmg`,
      },
    },
    resolved: false,
  };
}
