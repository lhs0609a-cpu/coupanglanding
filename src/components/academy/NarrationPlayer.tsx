'use client';

/**
 * 내레이션 재생 — "설명해주는 사람" 을 대신한다.
 *
 * 설계도 §6 의 2단 구조 중 **2순위(브라우저 TTS)** 를 먼저 붙인 것이다.
 * 1순위(GPT 로 사전 생성한 mp3)는 Phase 4 에서 얹는다. 그때가 되면
 * /api/academy/tts/[stepKey] 가 302 로 mp3 를 주고, 없을 때만 여기로 떨어진다.
 *
 * ★ 문장 하나를 발화 하나로 끊어 읽는다.
 *   통으로 넘기면 지금 어느 문장을 읽는 중인지 알 수 없어 하이라이트가 안 붙는다.
 *
 * ★ 자막은 항상 보인다. 소리를 못 켜는 환경이 실제로 많다.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX } from 'lucide-react';

const RATES = [0.75, 1, 1.25, 1.5];

/** 구독할 외부 변화가 없다 — 스냅샷만 필요하다. */
const noSubscribe = () => () => {};

export default function NarrationPlayer({ lines }: { lines: string[] }) {
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(-1);
  const [rate, setRate] = useState(1);
  const stoppedRef = useRef(false);

  // 브라우저 지원 여부. useState + useEffect 로 하면 하이드레이션이 어긋나거나
  // effect 안 setState 로 연쇄 렌더가 난다. 서버 스냅샷을 따로 주는 게 정석이다.
  const supported = useSyncExternalStore(
    noSubscribe,
    () => 'speechSynthesis' in window,
    () => false,
  );

  // 스텝이 바뀌면 읽던 것을 멈춘다 — 안 그러면 이전 스텝 설명이 계속 들린다.
  // 외부 시스템(음성 합성) 정리는 cleanup 에서. effect 의 본래 용도가 이것이다.
  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      try { window.speechSynthesis?.cancel(); } catch { /* 지원 안 하는 브라우저 */ }
    };
  }, [lines]);

  // props 가 바뀌었을 때의 state 조정은 렌더 중에 한다(React 권장) —
  // effect 안에서 setState 하면 한 번 그린 뒤 또 그린다.
  const [prevLines, setPrevLines] = useState(lines);
  if (prevLines !== lines) {
    setPrevLines(lines);
    setPlaying(false);
    setCurrent(-1);
  }

  const speakFrom = useCallback((startIndex: number, speed: number) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    stoppedRef.current = false;
    setPlaying(true);

    const speakAt = (i: number) => {
      if (stoppedRef.current || i >= lines.length) {
        setPlaying(false);
        setCurrent(-1);
        return;
      }
      setCurrent(i);
      const u = new SpeechSynthesisUtterance(lines[i]);
      u.lang = 'ko-KR';
      u.rate = speed;
      u.onend = () => { if (!stoppedRef.current) speakAt(i + 1); };
      // 실패해도 다음 문장으로 넘어간다 — 한 문장 때문에 전체가 멈추면 안 된다
      u.onerror = () => { if (!stoppedRef.current) speakAt(i + 1); };
      window.speechSynthesis.speak(u);
    };
    speakAt(startIndex);
  }, [lines]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    setPlaying(false);
  }, []);

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        {supported ? <Volume2 className="h-4 w-4 text-gray-500" /> : <VolumeX className="h-4 w-4 text-gray-400" />}
        <span className="text-sm font-semibold text-gray-800">설명 듣기</span>
        <span className="flex-1" />
        {supported && (
          <>
            <button
              type="button"
              onClick={() => (playing ? stop() : speakFrom(current < 0 ? 0 : current, rate))}
              className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-700"
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {playing ? '멈춤' : '재생'}
            </button>
            <button
              type="button"
              onClick={() => { stop(); setCurrent(-1); }}
              title="처음부터"
              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <select
              value={rate}
              onChange={(e) => {
                const next = Number(e.target.value);
                setRate(next);
                if (playing) speakFrom(current < 0 ? 0 : current, next);   // 배속은 즉시 반영
              }}
              aria-label="재생 속도"
              className="rounded-lg border border-gray-200 px-1.5 py-1 text-xs text-gray-700"
            >
              {RATES.map((r) => <option key={r} value={r}>{r}x</option>)}
            </select>
          </>
        )}
      </div>

      {/* 자막 — 소리를 못 켜도 여기만 읽으면 된다 */}
      <ol className="space-y-1.5 px-3 py-3">
        {lines.map((line, i) => (
          <li
            key={i}
            onClick={() => speakFrom(i, rate)}
            className={`cursor-pointer rounded-md px-2 py-1 text-sm leading-relaxed transition-colors ${
              i === current ? 'bg-blue-50 font-medium text-blue-900' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            {line}
          </li>
        ))}
      </ol>

      {!supported && (
        <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
          이 브라우저는 음성 읽기를 지원하지 않습니다. 위 자막을 읽어주세요.
        </p>
      )}
    </div>
  );
}
