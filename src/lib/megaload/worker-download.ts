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

/** electron-builder.yml 의 mac artifactName 규칙과 1:1. */
export const desktopMacAssetName = (version: string, arch: 'arm64' | 'x64') =>
  `MegaloadDesktop-${version}-${arch}.dmg`;

/**
 * macOS 설치파일(dmg) — Apple Silicon / Intel 별도.
 *
 * ⚠️ **실재하는 자산만** 링크한다. 예전에 모니터 앱에서 x64 dmg 빌드가 깨졌는데도
 *   웹이 URL 을 조립해 링크를 걸어 사용자가 404 를 받은 사고가 있었다. 도우미 dmg 도
 *   맥 빌드가 한 번도 성공한 적 없던 기간이 있어 같은 함정을 그대로 안고 있었다
 *   → 릴리스 자산 목록에 있는 파일만 내주고, 없으면 UI 가 버튼을 감춘다.
 *
 * ⚠️ 서명·공증이 없다(Apple Developer 계정 미등록). 사용자는 최초 1회
 *   시스템 설정 → 개인정보 보호 및 보안 → "확인 없이 열기" 를 눌러야 한다.
 *   (macOS Sequoia 부터 우클릭→열기 우회가 제거돼 이 경로만 유효하다.)
 */
export function pickDesktopMacUrls(version: string, assetNames: string[]): DesktopMacUrls {
  const pick = (arch: 'arm64' | 'x64') => {
    const name = desktopMacAssetName(version, arch);
    return assetNames.includes(name) ? `${DESKTOP_RELEASE_BASE}/${name}` : undefined;
  };
  return { arm: pick('arm64'), intel: pick('x64') };
}

/**
 * 맥에서의 기능 범위 안내 — UI 단일 출처.
 * Apple Silicon 은 Metal(MPS)로 ComfyUI·SDXL 까지 돌지만, Intel 맥은 GPU 가속이 없어
 * 이미지 생성만 빠진다(텍스트·이미지인식은 정상).
 */
export const MAC_CAPABILITY_NOTE =
  'Apple Silicon(M1 이상) 맥은 상품명·상세글·옵션·카테고리 생성과 이미지 인식, 누끼·이미지 생성까지 '
  + '윈도우와 동일하게 동작합니다(자동 업데이트만 수동). '
  + 'Intel 맥은 GPU 가속(Metal)이 없어 지원하지 않습니다 — 윈도우 PC를 쓰시거나 서버 기능만 이용하세요.';

/** 맥 설치 시 Gatekeeper 통과 안내 — UI 여러 곳에서 같은 문구를 쓰도록 단일 출처. */
export const MAC_GATEKEEPER_GUIDE =
  '맥에서 처음 실행하면 "확인되지 않은 개발자" 경고가 뜹니다. [완료]를 누른 뒤 '
  + '시스템 설정 → 개인정보 보호 및 보안 → 맨 아래 "확인 없이 열기"를 누르면 됩니다(최초 1회).';

// ─────────────────────────────────────────────────────────────────────────
// 상품 모니터링 도우미(desktop-monitor) — 별도 exe·별도 버전·버전별 태그.
//   release workflow(desktop-monitor-release.yml) 태그 규칙: `desktop-v*.*.*`
//   ⚠️ releases/latest/download 는 다른 프로젝트 release 로 redirect 되어 404 나므로
//      태그 접두사로 직접 필터링한다.
export const MONITOR_TAG_PREFIX = 'desktop-v';
export const MONITOR_APP_VERSION_FALLBACK = '0.1.16';

/**
 * ⛔ 상품 모니터링 도우미(별도 앱) 폐기 — 2026-08-10.
 *
 * 실측으로 이 앱의 조회 방식이 구조적으로 막혀 있음이 확인됐다:
 *   - 이 앱: Electron net.request 로 네이버 직결(GT 폴백 없음) → 최근 24h 실패율 **76%**
 *   - 서버 크론: Google Translate 프록시 경유 → 같은 기간 실패율 **2%** (URL 구성 동일)
 * 페이싱 문제가 아니다 — 이 앱은 이미 30~75초/건이라는 아주 느린 속도인데도 76% 실패한다.
 * 네이버가 IP 를 플래그하면 진짜 크롬으로 렌더해도 막힌다(개발기 실측: 12/12 차단 페이지).
 * 그리고 사용자 PC 는 한국 IP 라 GT 를 쓸 수도 없다("This translation service isn't
 * available in your region" 403). 즉 **가정 IP 로는 뚫을 방법이 없다.**
 *
 * → 품절 확인은 서버(미국 리전 → GT 통과)가 전담한다. 이 앱은 더 이상 배포하지 않는다.
 *   이미 설치된 사용자는 서버 품질 게이트(desktop/monitors)가 자동으로 일감을 끊으므로
 *   방치해도 피해는 없고, 통합 도우미로 옮기면 된다.
 */
export const MONITOR_RETIRED = true;
export const MONITOR_RETIRED_NOTICE =
  '상품 모니터링 도우미는 종료되었습니다. 품절·가격 확인은 이제 서버가 자동으로 처리하므로 PC를 켜두지 않아도 됩니다.';

export const buildMonitorReleaseBase = (version: string) =>
  `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${MONITOR_TAG_PREFIX}${version}`;

/**
 * 모니터 다운로드 URL — **자산이 실제 존재할 때만** 채운다.
 * ⚠️ mac Intel(x64) dmg 는 0.1.15 부터 빌드가 깨져 발행되지 않았다. 그런데도 웹이
 *    URL 을 조립해 링크를 걸어 두면 사용자는 404 를 받는다. 그래서 "조립"이 아니라
 *    릴리스 자산 목록에 있는 파일만 링크한다(없으면 그 버튼은 감춘다).
 */
export function buildMonitorUrls(version: string, assetNames: string[]) {
  // 폐기됨 — 신규 설치를 막기 위해 다운로드 URL 을 아예 내주지 않는다.
  // UI 들은 이미 `urls.win && ...` 식으로 가드하고 있어 버튼이 자동으로 사라진다.
  if (MONITOR_RETIRED) return { win: undefined, macIntel: undefined, macArm: undefined };
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

/** 실제 발행된 dmg 만. 없는 아키텍처는 undefined → UI 가 버튼을 감춘다. */
export interface DesktopMacUrls { arm?: string; intel?: string }

export interface DesktopReleaseInfo {
  version: string;
  /** Windows 설치파일(.exe) */
  downloadUrl: string;
  macUrls: DesktopMacUrls;
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
  return {
    desktop: {
      version: WORKER_APP_VERSION_FALLBACK,
      downloadUrl: buildDesktopDownloadUrl(WORKER_APP_VERSION_FALLBACK),
      // 자산 목록을 못 읽은 상황이므로 dmg 가 실재하는지 알 수 없다 → 링크하지 않는다(404 방지).
      macUrls: {},
    },
    // 폐기된 앱이라 폴백에서도 URL 을 만들지 않는다(신규 설치 차단).
    monitor: { version: MONITOR_APP_VERSION_FALLBACK, urls: {} },
    resolved: false,
  };
}
