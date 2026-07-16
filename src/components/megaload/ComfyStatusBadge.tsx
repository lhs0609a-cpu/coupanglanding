'use client';

/**
 * 누끼 엔진(ComfyUI) 라이브니스 뱃지 — 올인원 화면 전용
 * ---------------------------------------------------------------------------
 * 올인원 대표이미지 가공(누끼·흰배경)은 로컬 ComfyUI(SDXL)가 켜져 있을 때 최상 품질로
 * 처리된다. 지금까지 웹에는 ollama 기반 "도우미 연결됨" 배너만 있고 누끼 엔진 상태는
 * 화면에서 알 수 없어, 사용자가 "고품질 대표컷이 되는 상태인가"를 확인할 수 없었다.
 *
 * ── 어떻게 확인하나 (브라우저 → 로컬 직접 프로브) ──────────────────────────────
 * ComfyUI 는 사용자 PC 의 localhost:8188 에서 돈다(원격 서버는 못 찌름). 이 앱은 이미
 * 도우미 pair-server(http://127.0.0.1:<port>/pair)로 브라우저↔localhost 통신을 하고 있어
 * 대상 브라우저(Chrome/Edge)에서 loopback fetch 가 믹스드콘텐츠/PNA 로 막히지 않음이
 * 검증돼 있다. 그래서 여기서도 직접 프로브한다.
 *
 * ⚠️ 단, ComfyUI 는 최신 버전부터 크로스오리진 요청을 403 으로 막고 CORS 헤더를 주지
 *    않는다(실측 확인). 그래서 응답 "본문(버전/VRAM)"은 브라우저가 못 읽는다.
 *    대신 `mode:'no-cors'` 프로브는 서버가 응답만 하면(403 이어도) resolve, 포트가 죽어
 *    연결이 거부되면 reject → 이 차이로 "가동/미가동"만 확실히 판별한다(라이브니스).
 *
 * ── 미가동이어도 등록은 됨 ────────────────────────────────────────────────
 * ComfyUI 가 꺼져 있으면 도우미 워커가 내장 BiRefNet(CPU 누끼)로 폴백하므로 대표이미지
 * 배경제거·흰배경은 그대로 처리된다(품질만 SDXL 대비 낮음). 따라서 "대기" 상태는 경고가
 * 아니라 정보성으로만 표시한다.
 *
 * ComfyUI 는 상시가 아니라 온디맨드(올인원 생성 시작 시 도우미가 기동)라, 유휴 중엔
 * "대기"로 보이는 게 정상이다.
 */
import { useEffect, useState } from 'react';
import { Sparkles, Loader2, Cpu } from 'lucide-react';

/** 도우미 comfy-manager 기본 포트와 동일. 사용자가 포트를 바꾼 경우는 커버 못 함(기본값 전제). */
const COMFY_URL = 'http://127.0.0.1:8188/';
const PROBE_TIMEOUT_MS = 2500;
const POLL_MS = 20_000;

type State = 'checking' | 'up' | 'down';

/**
 * no-cors 프로브: 서버가 응답하면(403 opaque 포함) resolve → 'up',
 * 연결 거부/타임아웃이면 reject → 'down'. 본문은 읽지 않는다(읽을 수도 없음).
 */
async function probeComfy(): Promise<boolean> {
  try {
    await fetch(COMFY_URL, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return true; // opaque resolve = 포트가 응답함 = 가동 중
  } catch {
    return false; // connection refused / timeout = 미가동
  }
}

export default function ComfyStatusBadge({ className = '' }: { className?: string }) {
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const up = await probeComfy();
      if (alive) setState(up ? 'up' : 'down');
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (state === 'checking') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs text-gray-400 ${className}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 누끼 엔진 확인 중…
      </span>
    );
  }

  if (state === 'up') {
    return (
      <span
        title="ComfyUI(SDXL) 가동 중 — 대표사진을 고품질 누끼·흰배경 스튜디오컷으로 가공합니다."
        className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ${className}`}
      >
        <Sparkles className="w-3.5 h-3.5" />
        누끼 엔진(ComfyUI) 가동 중
      </span>
    );
  }

  // down — 경고 아님(정보성). CPU 폴백으로 등록은 정상 진행됨을 명시.
  return (
    <span
      title="ComfyUI 미가동 — 올인원 생성 시 도우미가 자동 기동합니다(온디맨드). 꺼져 있어도 CPU 누끼(BiRefNet)로 배경제거·흰배경은 처리됩니다."
      className={`inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-500 ${className}`}
    >
      <Cpu className="w-3.5 h-3.5" />
      누끼 엔진(ComfyUI) 대기 · CPU 누끼로 폴백
    </span>
  );
}
