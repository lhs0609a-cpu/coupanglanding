'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Cpu, Download, CheckCircle2, AlertCircle, Loader2, Wifi, WifiOff,
  MonitorDown, Sparkles, ExternalLink,
} from 'lucide-react';

// 빌드한 설치 .exe 의 GitHub Releases 링크. 배포 시 환경변수로 주입.
const DOWNLOAD_URL = process.env.NEXT_PUBLIC_WORKER_DOWNLOAD_URL || '';

interface WorkerStatus {
  online: boolean;
  workers: { worker_id: string; hostname: string | null; last_seen: string }[];
}

const STEPS = [
  { t: '설치 파일 다운로드', d: '위 버튼으로 설치기(.exe)를 받아 더블클릭하면 자동 설치됩니다.' },
  { t: '엔진 설치 (처음 1회)', d: '앱에서 "엔진 설치"를 누르면 ComfyUI와 AI 모델(약 6.5GB)을 자동으로 받습니다. 한 번만 받으면 됩니다.' },
  { t: '로그인', d: '메가로드 계정(이메일/비밀번호)으로 앱에 로그인합니다.' },
  { t: '워커 시작', d: '"워커 시작"을 누르면 아래 상태가 "연결됨"으로 바뀝니다. 창을 닫아도 트레이에 상주합니다.' },
  { t: '대량등록에서 사용', d: '상품 검수 화면에서 상품을 고르고 "로컬 GPU로 대표 썸네일 재생성"을 누르면 자동 처리됩니다.' },
];

export default function LocalGpuWorkerSettings() {
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/megaload/products/thumbnail-jobs/worker-status');
      setStatus(await res.json());
    } catch {
      setStatus({ online: false, workers: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const id = setInterval(loadStatus, 10_000); // 10초마다 갱신
    return () => clearInterval(id);
  }, [loadStatus]);

  return (
    <div className="space-y-5 max-w-2xl">
      {/* 헤더 */}
      <div className="flex items-start gap-3">
        <div className="p-2 bg-indigo-50 rounded-lg"><Cpu className="w-5 h-5 text-indigo-600" /></div>
        <div>
          <h3 className="text-base font-semibold text-gray-900">로컬 GPU 썸네일 재생성</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            내 PC의 그래픽카드로 네이버 누끼 이미지를 쿠팡용 깔끔한 흰 배경 썸네일로
            <b className="text-gray-700"> 무료·무제한</b> 재생성합니다. (서버 비용 0원)
          </p>
        </div>
      </div>

      {/* 실시간 상태 */}
      <div className={`rounded-lg border p-4 ${status?.online ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-center gap-2">
          {loading ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            : status?.online ? <Wifi className="w-5 h-5 text-emerald-600" />
            : <WifiOff className="w-5 h-5 text-gray-400" />}
          <span className={`font-semibold text-sm ${status?.online ? 'text-emerald-700' : 'text-gray-600'}`}>
            {loading ? '확인 중...' : status?.online ? '워커 연결됨' : '워커 꺼짐'}
          </span>
        </div>
        {status?.online ? (
          <p className="text-xs text-emerald-700 mt-1.5">
            {status.workers.map(w => w.hostname || w.worker_id).join(', ')} — 지금 바로 재생성 버튼을 쓸 수 있어요.
          </p>
        ) : (
          <p className="text-xs text-gray-500 mt-1.5">
            아래에서 워커 앱을 설치·실행하면 여기가 "연결됨"으로 바뀝니다.
          </p>
        )}
      </div>

      {/* 요건 */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-800 leading-relaxed">
          <b>요건:</b> NVIDIA 그래픽카드(RTX 권장) + Windows. GPU가 없거나 설치가 부담되면,
          상품 화면의 기존 <b>Gemini 재생성</b>(무료 티어 하루 500장)을 그대로 쓰셔도 됩니다.
        </div>
      </div>

      {/* 다운로드 */}
      <div>
        {DOWNLOAD_URL ? (
          <a
            href={DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#E31837] text-white rounded-lg font-semibold text-sm hover:bg-[#c5142f] transition"
          >
            <Download className="w-4 h-4" />
            워커 앱 다운로드 (Windows)
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>
        ) : (
          <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-400 rounded-lg font-semibold text-sm cursor-not-allowed">
            <MonitorDown className="w-4 h-4" />
            다운로드 준비 중 (관리자 등록 대기)
          </div>
        )}
      </div>

      {/* 단계 가이드 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-indigo-500" /> 설치 방법
        </h4>
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div>
                <div className="text-sm font-medium text-gray-800">{s.t}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.d}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* 안내 */}
      <div className="flex items-start gap-2 text-xs text-gray-500">
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
        <p>
          상품 픽셀은 그대로 보존하고 <b>배경만</b> 새로 생성합니다(인페인트). 결과는
          대량등록 화면에서 원본과 비교 확인하실 수 있습니다.
        </p>
      </div>
    </div>
  );
}
