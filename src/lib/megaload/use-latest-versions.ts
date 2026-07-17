'use client';

import { useEffect, useState } from 'react';
import { fallbackVersions, type LatestVersionsResponse } from './worker-download';

// 여러 컴포넌트가 동시에 마운트돼도(배너 + 설정탭) 조회는 한 번만.
let inflight: Promise<LatestVersionsResponse> | null = null;
let cached: LatestVersionsResponse | null = null;

function load(): Promise<LatestVersionsResponse> {
  if (cached) return Promise.resolve(cached);
  inflight ??= fetch('/api/megaload/worker/latest-version')
    .then((r) => r.json() as Promise<LatestVersionsResponse>)
    .then((v) => {
      // 폴백 응답은 캐시하지 않는다 — 다음 마운트 때 다시 진짜 값을 노려본다.
      if (v.resolved) cached = v;
      return v;
    })
    .catch(() => fallbackVersions())
    .finally(() => { inflight = null; });
  return inflight;
}

/**
 * 도우미 2종의 최신 버전 + 실재하는 다운로드 URL.
 * 출처는 실제 발행된 GitHub 릴리스(앱 자동업데이트와 동일) — 손수 관리하는 상수가 아니다.
 * 첫 페인트에는 폴백값을 쓰고, 조회가 끝나면 진짜 값으로 교체한다(레이아웃 흔들림 방지).
 */
export function useLatestVersions() {
  const [versions, setVersions] = useState<LatestVersionsResponse>(() => cached ?? fallbackVersions());
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let alive = true;
    load().then((v) => {
      if (!alive) return;
      setVersions(v);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  return { versions, loading };
}

/**
 * 설치된 버전이 최신보다 낮은지. semver 숫자 비교(프리릴리스 태그는 무시).
 * 형식이 이상하면 false — 확신 없이 "업데이트 필요" 경고를 띄우지 않는다.
 */
export function isOutdated(installed: string | null | undefined, latest: string): boolean {
  if (!installed) return false;
  const parse = (v: string) => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim().replace(/^v/, ''));
    return m ? [+m[1], +m[2], +m[3]] : null;
  };
  const a = parse(installed);
  const b = parse(latest);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}
