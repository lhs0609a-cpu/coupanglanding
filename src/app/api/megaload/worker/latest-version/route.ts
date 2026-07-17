import { NextResponse } from 'next/server';
import {
  DESKTOP_LATEST_YML_URL,
  GITHUB_OWNER,
  GITHUB_REPO,
  MONITOR_TAG_PREFIX,
  buildDesktopDownloadUrl,
  buildMonitorUrls,
  fallbackVersions,
  type LatestVersionsResponse,
} from '@/lib/megaload/worker-download';

export const maxDuration = 10;

// 릴리스는 자주 안 바뀌므로 넉넉히 캐시한다. GitHub API 는 미인증 60회/시간(IP 기준)이라
// 캐시가 곧 레이트리밋 방어다. 10분이면 릴리스 직후에도 충분히 빨리 반영된다.
const TTL_SEC = 600;

/** 웹 인스턴스 로컬 캐시 — fetch 캐시가 없는 런타임에서도 API 호출을 아낀다. */
let cache: { at: number; body: LatestVersionsResponse } | null = null;

const ghHeaders = (): HeadersInit => ({
  Accept: 'application/vnd.github+json',
  // 토큰이 있으면 레이트리밋이 5000회/시간으로 올라간다. 없어도 동작한다.
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
});

/**
 * 메가로드 도우미 최신 버전 — electron-updater 가 읽는 latest.yml 을 그대로 읽는다.
 * 앱과 완전히 같은 출처라 표시 버전이 어긋날 수 없다.
 */
async function fetchDesktop() {
  const res = await fetch(DESKTOP_LATEST_YML_URL, {
    next: { revalidate: TTL_SEC },
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!res.ok) throw new Error(`latest.yml ${res.status}`);
  const yml = await res.text();

  // latest.yml 은 electron-builder 가 쓴 단순 YAML. 파서를 들이지 않고 필요한 두 줄만 읽는다.
  //   version: 0.2.40
  //   path: MegaloadDesktop-Setup-0.2.40.exe
  const version = /^version:\s*(.+)$/m.exec(yml)?.[1]?.trim();
  if (!version) throw new Error('latest.yml 에 version 없음');
  const path = /^path:\s*(.+)$/m.exec(yml)?.[1]?.trim();

  return {
    version,
    // path 가 있으면 그게 실제 발행된 파일명이므로 우선(파일명 규칙이 바뀌어도 따라간다).
    downloadUrl: path
      ? `${DESKTOP_LATEST_YML_URL.replace(/\/latest\.yml$/, '')}/${path}`
      : buildDesktopDownloadUrl(version),
  };
}

/**
 * 모니터링 도우미 최신 버전 — `desktop-v*` 태그 릴리스 중 최신.
 * 자산 목록까지 받아 **실제 존재하는 파일만** 다운로드 링크로 노출한다(mac x64 404 방지).
 */
async function fetchMonitor() {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=30`,
    { next: { revalidate: TTL_SEC }, headers: ghHeaders() },
  );
  if (!res.ok) throw new Error(`releases ${res.status}`);
  const releases = (await res.json()) as {
    tag_name: string; draft: boolean; prerelease: boolean; published_at: string;
    assets: { name: string }[];
  }[];

  const latest = releases
    .filter((r) => !r.draft && !r.prerelease && r.tag_name.startsWith(MONITOR_TAG_PREFIX))
    .sort((a, b) => (a.published_at < b.published_at ? 1 : -1))[0];
  if (!latest) throw new Error(`${MONITOR_TAG_PREFIX}* 릴리스 없음`);

  const version = latest.tag_name.slice(MONITOR_TAG_PREFIX.length);
  return { version, urls: buildMonitorUrls(version, latest.assets.map((a) => a.name)) };
}

/**
 * GET /api/megaload/worker/latest-version
 * 도우미 2종의 "진짜 최신" 버전 + 실재하는 다운로드 URL.
 * 조회 실패 시에도 200 + 폴백을 준다(다운로드 버튼이 사라지는 것보다 낫다).
 */
export async function GET() {
  if (cache && Date.now() - cache.at < TTL_SEC * 1000) {
    return NextResponse.json(cache.body);
  }

  // 한쪽이 실패해도 다른 쪽은 정상값을 쓴다.
  const [desktop, monitor] = await Promise.allSettled([fetchDesktop(), fetchMonitor()]);
  const fb = fallbackVersions();

  const body: LatestVersionsResponse = {
    desktop: desktop.status === 'fulfilled' ? desktop.value : fb.desktop,
    monitor: monitor.status === 'fulfilled' ? monitor.value : fb.monitor,
    resolved: desktop.status === 'fulfilled' && monitor.status === 'fulfilled',
  };

  // 폴백이 섞인 응답은 캐시하지 않는다 — 일시적 장애를 10분간 굳히지 않기 위해.
  if (body.resolved) cache = { at: Date.now(), body };

  return NextResponse.json(body, {
    headers: { 'Cache-Control': body.resolved ? `public, max-age=${TTL_SEC}` : 'no-store' },
  });
}
