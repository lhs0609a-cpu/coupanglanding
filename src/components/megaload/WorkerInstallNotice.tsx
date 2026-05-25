'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cpu, Download, Settings2, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { WORKER_DOWNLOAD_URL, WORKER_SETTINGS_URL } from '@/lib/megaload/worker-download';

interface WorkerStatus {
  online: boolean;
  workers: { worker_id: string; hostname: string | null; last_seen: string }[];
}

const COPY = {
  allinone: {
    title: '올인원 자동등록에는 로컬 GPU 워커가 필요합니다',
    desc: '워커가 내 PC에서 노출명·카테고리·가격·옵션·상세·대표이미지를 미리 생성합니다. 설치 후 워커를 켜고 폴더를 처리하면 여기서 결과를 불러올 수 있어요.',
  },
  regenerate: {
    title: '대표 썸네일 재생성에는 로컬 GPU 워커가 필요합니다',
    desc: '내 PC GPU로 누끼·재생성을 무료·무제한 처리합니다(서버 비용 0원). 설치 후 워커를 켜면 아래 버튼이 자동으로 동작해요.',
  },
} as const;

/**
 * 로컬 GPU 워커 설치/연결 안내.
 * - 켜짐: 작은 "연결됨" 칩
 * - 꺼짐: 다운로드(.exe) + 설치 방법(설정) 링크가 있는 안내 배너
 * 워커가 전제인 진입점(올인원/재생성)에 배치해 자연스럽게 설치를 유도한다.
 */
export default function WorkerInstallNotice({
  context = 'regenerate',
  className = '',
}: {
  context?: keyof typeof COPY;
  className?: string;
}) {
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/megaload/products/thumbnail-jobs/worker-status');
        const json = (await res.json()) as WorkerStatus;
        if (alive) setStatus(json);
      } catch {
        if (alive) setStatus({ online: false, workers: [] });
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (loading) {
    return (
      <div className={`inline-flex items-center gap-1.5 text-xs text-gray-400 ${className}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 워커 상태 확인 중…
      </div>
    );
  }

  if (status?.online) {
    const names = status.workers.map((w) => w.hostname || w.worker_id).join(', ');
    return (
      <div className={className}>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5" />
          로컬 GPU 워커 연결됨{names ? ` · ${names}` : ''}
        </span>
      </div>
    );
  }

  const copy = COPY[context];
  return (
    <div className={`rounded-lg border border-indigo-200 bg-indigo-50 p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 p-1.5 bg-white rounded-lg border border-indigo-100">
          <Cpu className="w-4 h-4 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900">{copy.title}</div>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">{copy.desc}</p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <a
              href={WORKER_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#E31837] text-white rounded-md text-xs font-semibold hover:bg-[#c5142f] transition"
            >
              <Download className="w-3.5 h-3.5" />
              워커 앱 다운로드 (Windows)
              <ExternalLink className="w-3 h-3 opacity-70" />
            </a>
            <Link
              href={WORKER_SETTINGS_URL}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-300 text-indigo-700 rounded-md text-xs font-semibold hover:bg-indigo-100 transition"
            >
              <Settings2 className="w-3.5 h-3.5" />
              설치 방법 · 내 사양 체크
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
