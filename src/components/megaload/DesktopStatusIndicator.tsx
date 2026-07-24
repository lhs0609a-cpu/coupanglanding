'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useLatestVersions, isOutdated } from '@/lib/megaload/use-latest-versions';
import { triggerLocalUpdate, classifyHelperLink, type LocalEndpoint } from '@/lib/megaload/allinone-local';
import { WORKER_SETTINGS_URL } from '@/lib/megaload/worker-download';

/**
 * 메가로드 도우미(데스크탑 앱) 연결 + 버전 표시등 — 항상 표시(사이드바 상단).
 *   🟢 연결됨 / 🔴 미연결 / ⚪ 확인 중
 * 연결돼 있으면 설치 버전 vs 최신(실제 릴리스 latest.yml)을 비교해:
 *   · 최신    → "v0.2.42 최신"
 *   · 구버전  → "v0.2.40 → 최신 v0.2.42" + [업데이트] (인앱 트리거, 실패 시 다운로드 안내)
 * 버전을 안 보내는 구버전 도우미(app_version=NULL)는 판단 근거가 없어 버전 표기를 생략한다.
 */
interface WorkerRow {
  worker_id: string;
  hostname: string | null;
  last_seen: string;
  app_version?: string | null;
  local_endpoint?: LocalEndpoint | null;
}

export default function DesktopStatusIndicator() {
  const [workers, setWorkers] = useState<WorkerRow[] | null>(null);
  const { versions } = useLatestVersions();
  const latest = versions.desktop.version;

  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/megaload/products/thumbnail-jobs/worker-status');
        const j = await res.json();
        if (alive) setWorkers(Array.isArray(j.workers) ? j.workers : []);
      } catch {
        if (alive) setWorkers([]);
      }
    };
    poll();
    const id = setInterval(poll, 15_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // ⚠️ 예전엔 `workers.length > 0` 이 곧 "연결됨"이었다 — 그게 거짓 초록의 원인이었다.
  //    세션이 만료되면 품절 모니터('desktop-monitor', 토큰 인증이라 만료 없음)만 남는데도
  //    🟢 연결됨으로 보여, 정작 올인원·썸네일·재생성이 죽은 걸 아무도 몰랐다(실측 10시간).
  const link = workers === null ? null : classifyHelperLink(workers);
  const online = link === null ? null : link === 'online';
  // 버전을 보낸 워커 중 가장 낮은 버전을 기준으로 판정(하나라도 구버전이면 업데이트 안내).
  const versioned = (workers ?? []).filter((w) => w.app_version);
  const installed = versioned.length
    ? versioned.map((w) => w.app_version as string).sort(cmpVer)[0]
    : null;
  const outdated = installed ? isOutdated(installed, latest) : false;
  // 업데이트를 인앱으로 트리거할 로컬 서버(있으면 원클릭, 없으면 다운로드 폴백).
  const ep = (workers ?? []).map((w) => w.local_endpoint).find(
    (x): x is LocalEndpoint => !!x && typeof x.port === 'number' && typeof x.nonce === 'string',
  );

  const doUpdate = useCallback(async () => {
    setUpdating(true);
    setUpdateMsg('');
    try {
      const triggered = ep ? await triggerLocalUpdate(ep) : false;
      if (triggered) {
        setUpdateMsg('업데이트 확인 중 — 다운로드되면 도우미가 재시작하며 적용됩니다.');
      } else {
        // 로컬 트리거가 안 되는 구버전(≤0.2.42)·미연결 → 설치파일 다운로드로 폴백.
        window.open(versions.desktop.downloadUrl, '_blank', 'noopener');
        setUpdateMsg('최신 설치파일을 받았습니다. 실행하면 최신으로 덮어써집니다(도우미 재시작 시 자동 적용도 됩니다).');
      }
    } finally {
      setUpdating(false);
    }
  }, [ep, versions.desktop.downloadUrl]);

  // 모니터링만 살아있는 상태(monitor-only)는 초록도 빨강도 정직하지 않다 — 노랑으로 구분한다.
  const dot = link === null ? 'bg-gray-300'
    : link === 'online' ? 'bg-emerald-500'
    : link === 'monitor-only' ? 'bg-amber-500'
    : 'bg-red-400';
  const label = link === null ? '도우미 확인 중…'
    : link === 'online' ? '도우미 연결됨'
    : link === 'monitor-only' ? '모니터링만 연결됨'
    : '도우미 미연결';

  // 배포 버전 (next.config 에서 빌드 시 주입) — 최신 푸시 반영 확인용
  const sha = process.env.NEXT_PUBLIC_BUILD_SHA || 'local';
  const rawTime = process.env.NEXT_PUBLIC_BUILD_TIME || '';
  let buildTime = '';
  try {
    if (rawTime) {
      const d = new Date(rawTime);
      const k = new Date(d.getTime() + 9 * 60 * 60 * 1000); // KST
      buildTime = `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`;
    }
  } catch { /* ignore */ }

  return (
    <div className="space-y-1">
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200"
        title={
          link === 'online' ? '메가로드 도우미가 켜져 있고 로그인된 상태입니다.'
            : link === 'monitor-only'
              ? '품절 모니터링만 연결돼 있습니다. 올인원 생성·썸네일·재생성은 동작하지 않습니다(앱 로그인 세션 만료 또는 통합 도우미 미연결).'
              : '메가로드 도우미가 꺼져 있거나 로그인 안 됨. 앱을 켜고 메가로드 연결을 하세요.'
        }
      >
        <span className={`w-2 h-2 rounded-full ${dot} ${online ? 'animate-pulse' : ''}`} />
        <span className="text-[11px] font-medium text-gray-600">{label}</span>
        {/* 연결됐고 버전을 보내면: 최신/구버전 표기를 항상 노출 */}
        {online && installed && (
          outdated
            ? <span className="ml-auto text-[10px] font-semibold text-amber-700">v{installed} → 최신 v{latest}</span>
            : <span className="ml-auto text-[10px] font-medium text-emerald-600">v{installed} 최신</span>
        )}
      </div>

      {/* 구버전이면 업데이트 액션을 항상 표시 */}
      {online && outdated && (
        <div className="px-3">
          <button
            type="button"
            onClick={doUpdate}
            disabled={updating}
            className="w-full text-[11px] font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-md px-2 py-1 transition"
          >
            {updating ? '업데이트 중…' : `최신 v${latest} 로 업데이트`}
          </button>
          {updateMsg && <p className="mt-1 text-[10px] text-gray-500 leading-snug">{updateMsg}</p>}
        </div>
      )}

      {/* 모니터링만 붙은 상태 — 무엇이 안 되는지와 복구 방법을 그 자리에서 알려준다.
          (설치 안내를 띄우면 오답이다. 앱은 이미 깔려서 돌고 있고, 필요한 건 재연결뿐) */}
      {link === 'monitor-only' && (
        <div className="px-3">
          <p className="text-[10px] leading-snug text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
            올인원 생성·썸네일·재생성이 멈춘 상태입니다.
            <br />
            도우미 앱에서 <b>로그아웃 · 다른 계정 연결</b> → <b>메가로드 연결</b>을 눌러 다시 연결하세요.
          </p>
        </div>
      )}

      {/* 완전 미연결이면 설치 안내(설정 다운로드 허브) */}
      {link === 'offline' && (
        <div className="px-3">
          <Link href={WORKER_SETTINGS_URL} className="text-[10px] font-medium text-indigo-600 hover:text-indigo-800">
            도우미 받기 · 설치 방법 →
          </Link>
        </div>
      )}

      <div className="px-3 text-[10px] text-gray-400" title={`배포 커밋 ${sha} · 빌드 ${rawTime}`}>
        배포 {sha}{buildTime ? ` · ${buildTime}` : ''}
      </div>
    </div>
  );
}

/** semver 오름차순 비교(문자열이 아니라 숫자 자리별). 파싱 실패는 뒤로. */
function cmpVer(a: string, b: string): number {
  const p = (v: string) => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim().replace(/^v/, ''));
    return m ? [+m[1], +m[2], +m[3]] : [Infinity, Infinity, Infinity];
  };
  const x = p(a), y = p(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}
