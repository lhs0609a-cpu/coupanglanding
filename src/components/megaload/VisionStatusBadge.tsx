'use client';

/**
 * 비전 모델(qwen2.5vl) 라이브니스 뱃지 — 올인원 화면 전용
 * ---------------------------------------------------------------------------
 * 올인원 대표/상세 이미지 선별은 로컬 VLM(qwen2.5vl)이 "이미지를 직접 보고" 판단할 때
 * 최상 품질이 된다(성분 텍스처·로고·배송배너를 상품과 구분). 모델이 없으면 CLIP 휴리스틱으로
 * 폴백하는데, 그 상태를 화면에서 알 수 없어 "왜 대표컷이 이상하지?"의 원인 파악이 어려웠다.
 *
 * ── 어떻게 확인하나 ──────────────────────────────────────────────────────────
 * 비전 모델은 사용자 PC 의 ollama(127.0.0.1:11434)에 설치된다. 브라우저는 그 응답(모델 목록)을
 * CORS 때문에 직접 못 읽으므로, 이미 연결된 도우미 pair-server 의 /allinone/vision-status 를
 * 거쳐 확인한다(도우미가 ollama 를 서버사이드로 조회해 결과만 돌려줌).
 *
 * 상태:
 *   ready     — 모델 설치됨: 재생성 시 비전이 이미지를 직접 보고 선별(초록)
 *   no-model  — ollama 는 떠 있으나 모델 미설치: CLIP 폴백(다음 생성 시 자동 다운로드) (노랑)
 *   no-ollama — ollama 미기동: 생성 시 자동 기동됨(회색, 정보성)
 *   no-helper — 도우미 미연결(회색)
 */
import { useEffect, useState } from 'react';
import { Eye, Loader2, Cpu, EyeOff } from 'lucide-react';
import { discoverLocalEndpoint, fetchVisionStatus } from '@/lib/megaload/allinone-local';

type State = 'checking' | 'ready' | 'no-model' | 'no-ollama' | 'no-helper' | 'old-helper';
const POLL_MS = 20_000;

export default function VisionStatusBadge({ className = '' }: { className?: string }) {
  const [state, setState] = useState<State>('checking');
  const [model, setModel] = useState('qwen2.5vl:7b');

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const ep = await discoverLocalEndpoint();
      if (!alive) return;
      if (!ep) { setState('no-helper'); return; }
      const vs = await fetchVisionStatus(ep);
      if (!alive) return;
      // 도우미는 연결됐는데 응답이 없다 = 이 엔드포인트가 없는 구버전 도우미(업데이트 필요).
      if (!vs) { setState('old-helper'); return; }
      if (vs.model) setModel(vs.model);
      setState(vs.ready ? 'ready' : vs.ollamaUp ? 'no-model' : 'no-ollama');
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (state === 'checking') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs text-gray-400 ${className}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 비전 모델 확인 중…
      </span>
    );
  }

  if (state === 'ready') {
    return (
      <span
        title={`비전 모델(${model}) 준비됨 — 재생성 시 이미지를 직접 보고 대표/상세컷을 선별합니다(성분 텍스처·로고·배송배너 자동 제외).`}
        className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ${className}`}
      >
        <Eye className="w-3.5 h-3.5" />
        비전 모델(qwen2.5vl) 준비됨
      </span>
    );
  }

  if (state === 'no-model') {
    return (
      <span
        title={`ollama 는 떠 있으나 비전 모델(${model})이 아직 없습니다 — 지금은 CLIP 휴리스틱으로 폴백합니다. 다음 올인원 생성 시 자동 다운로드(최초 1회, 수 GB)됩니다.`}
        className={`inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ${className}`}
      >
        <EyeOff className="w-3.5 h-3.5" />
        비전 모델 미설치 · CLIP 폴백(생성 시 자동 설치)
      </span>
    );
  }

  if (state === 'old-helper') {
    return (
      <span
        title='도우미는 연결됐지만 비전 상태 조회를 지원하지 않는 구버전입니다 — 데스크탑 도우미를 최신으로 업데이트하면 표시됩니다(비전 기능 자체는 v0.2.63+ 부터 동작).'
        className={`inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-500 ${className}`}
      >
        <Cpu className="w-3.5 h-3.5" />
        비전 상태 · 도우미 업데이트 필요
      </span>
    );
  }

  // no-ollama / no-helper — 정보성(회색)
  return (
    <span
      title={state === 'no-ollama'
        ? 'ollama 미기동 — 올인원 생성 시 도우미가 자동 기동합니다. 그때 비전 모델도 준비됩니다.'
        : '도우미 미연결 — 데스크탑 "메가로드 도우미"를 실행/연결하면 비전 모델 상태가 표시됩니다.'}
      className={`inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-500 ${className}`}
    >
      <Cpu className="w-3.5 h-3.5" />
      {state === 'no-ollama' ? '비전 모델 대기 · 생성 시 준비' : '비전 상태 · 도우미 미연결'}
    </span>
  );
}
