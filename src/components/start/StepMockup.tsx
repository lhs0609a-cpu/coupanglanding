'use client';

/**
 * 단계별 화면 목업 렌더러.
 *
 * ★ 설계에서 중요한 것 두 가지:
 *   ① **밝은 화면을 어두운 페이지 안에 프레임째 넣는다.** 토스·정부24·쿠팡 윙은 전부 밝은 UI 라서,
 *      다크 카드 안에 흰 바탕이 브라우저 크롬과 함께 들어가야 "그 화면" 으로 읽힌다.
 *      반대로 다크 스타일로 그리면 예쁘긴 한데 내가 볼 실제 화면과 안 닮아서 쓸모가 없다.
 *   ② **왼쪽 번호 여백.** 모든 블록이 같은 폭의 번호 칸을 왼쪽에 두고, pin 이 붙은 블록만
 *      거기에 번호가 뜬다. 절대 위치로 핫스팟을 찍으면 화면 폭이 좁아질 때 전부 어긋나는데,
 *      이 방식은 반응형에서 깨지지 않고, 아래 체크리스트의 같은 번호와 눈으로 바로 이어진다.
 *      그리고 체크가 들어오면 번호가 초록 체크로 바뀐다 — 목업이 진행률을 같이 표시한다.
 */

import { useState } from 'react';
import {
  Check,
  Copy,
  Lock,
  ChevronDown,
  ChevronRight,
  Ban,
  X,
  Paperclip,
  Bell,
  MousePointerClick,
} from 'lucide-react';
import type {
  Cell,
  MockupBlock,
  MockupDrawnScreen,
  MockupScreen,
  MockupShotScreen,
  Tone,
} from '@/lib/data/start-mockups';
import { isShot } from '@/lib/data/start-mockups';

// ─── 색 ───
// 밝은 바탕 위에서 읽히는 값이라야 한다. 다크 팔레트를 그대로 쓰면 하나도 안 보인다.
const TONE_CHIP: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warn: 'bg-amber-50 text-amber-700 border-amber-200',
  bad: 'bg-rose-50 text-rose-700 border-rose-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  mute: 'bg-gray-100 text-gray-500 border-gray-200',
};

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-emerald-700',
  warn: 'text-amber-700',
  bad: 'text-rose-700',
  info: 'text-blue-700',
  mute: 'text-gray-400',
};

const TONE_BOX: Record<Tone, string> = {
  ok: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  warn: 'bg-amber-50 border-amber-200 text-amber-900',
  bad: 'bg-rose-50 border-rose-200 text-rose-900',
  info: 'bg-blue-50 border-blue-200 text-blue-900',
  mute: 'bg-gray-50 border-gray-200 text-gray-700',
};

const TONE_BAR: Record<Tone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-rose-500',
  info: 'bg-blue-500',
  mute: 'bg-gray-300',
};

const ACCENT: Record<string, string> = {
  red: 'bg-[#E31837]',
  blue: 'bg-[#3182F6]',
  green: 'bg-[#0F9D58]',
  gray: 'bg-gray-800',
};

/**
 * **누르는 것**인 블록들.
 *
 * 번호를 왼쪽 여백에만 두면 "몇 번째 설명" 이지 "어디를 눌러라" 가 아니다. 이 목록에 있는
 * 블록은 점선 상자로 감싸고 번호를 그 위에 얹는다 — 캡처 화면의 핫스팟과 같은 뜻이 되게.
 * 경고·표·설명은 누르는 것이 아니므로 여백 번호 그대로 둔다. 전부 점선을 치면
 * 점선이 아무 뜻도 없어진다.
 */
const CLICK_KINDS = new Set<MockupBlock['k']>([
  'btn',
  'btnrow',
  'select',
  'field',
  'radio',
  'check',
  'tabs',
  'cards',
  'thumbs',
  'upload',
]);

// ─── 조각들 ───
function Pin({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums shadow-sm ${
        done ? 'bg-emerald-500 text-white' : 'bg-[#E31837] text-white'
      }`}
    >
      {done ? <Check className="h-3 w-3" strokeWidth={3} /> : n}
    </span>
  );
}

function CellView({ cell }: { cell: Cell }) {
  if (typeof cell === 'string') return <span className="text-gray-700">{cell}</span>;
  if (!cell.tone) return <span className="text-gray-700">{cell.t}</span>;
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-medium ${TONE_CHIP[cell.tone]}`}>
      {cell.t}
    </span>
  );
}

/** 카드·썸네일에 들어가는 사진 자리. 실제 상품 사진을 쓸 수 없으니 추상 도형으로 그린다. */
function PhotoBlock({ kind }: { kind: 'white' | 'photo' | 'review' | 'box' }) {
  if (kind === 'white') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white">
        <div className="h-3/5 w-1/3 rounded-md bg-gradient-to-b from-gray-300 to-gray-400" />
      </div>
    );
  }
  if (kind === 'box') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-amber-50">
        <div className="h-1/2 w-3/5 rounded-sm border-2 border-amber-300 bg-amber-200/70" />
      </div>
    );
  }
  if (kind === 'review') {
    return (
      <div className="relative h-full w-full bg-gradient-to-br from-stone-200 to-stone-400">
        <div className="absolute bottom-1 left-1 rounded bg-black/55 px-1 text-[9px] text-white">리뷰</div>
        <div className="absolute left-1/4 top-1/4 h-1/2 w-1/2 rounded-full bg-white/40" />
      </div>
    );
  }
  return (
    <div className="relative h-full w-full bg-gradient-to-br from-slate-200 to-slate-400">
      <div className="absolute bottom-2 left-2 h-1/3 w-1/3 rounded bg-white/50" />
      <div className="absolute right-2 top-2 h-1/4 w-1/4 rounded-full bg-white/40" />
    </div>
  );
}

// ─── 블록 ───
function BlockView({ b, accent }: { b: MockupBlock; accent: string }) {
  switch (b.k) {
    case 'heading':
      return (
        <div>
          <h4 className="text-[15px] font-bold text-gray-900">{b.text}</h4>
          {b.sub && <p className="mt-0.5 text-[11px] text-gray-500">{b.sub}</p>}
        </div>
      );

    case 'text':
      return (
        <p className={`text-[12px] leading-relaxed ${b.strong ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
          {b.text}
        </p>
      );

    case 'field': {
      const state = b.state ?? 'plain';
      const border =
        state === 'error'
          ? 'border-rose-300 bg-rose-50'
          : state === 'ok'
            ? 'border-gray-300 bg-white'
            : state === 'lock'
              ? 'border-gray-200 bg-gray-100'
              : 'border-gray-300 bg-white';
      return (
        <div>
          <span className="mb-1 block text-[11px] font-medium text-gray-500">{b.label}</span>
          <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${border}`}>
            <span className={`flex-1 break-all text-[12px] ${b.value ? 'text-gray-900' : 'text-gray-400'}`}>
              {b.value ?? b.ph ?? ''}
            </span>
            {state === 'lock' && <Lock className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
            {state === 'ok' && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={3} />}
          </div>
          {b.hint && <span className="mt-1 block text-[11px] leading-relaxed text-gray-500">{b.hint}</span>}
        </div>
      );
    }

    case 'select':
      return (
        <div>
          <span className="mb-1 block text-[11px] font-medium text-gray-500">{b.label}</span>
          <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-2.5 py-2">
            <span className="flex-1 text-[12px] text-gray-900">{b.value}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          </div>
          {b.hint && <span className="mt-1 block text-[11px] text-gray-500">{b.hint}</span>}
        </div>
      );

    case 'radio':
      return (
        <div>
          {b.label && <span className="mb-1.5 block text-[11px] font-medium text-gray-500">{b.label}</span>}
          <div className="space-y-1.5">
            {b.options.map((o) => (
              <div
                key={o.text}
                className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 ${
                  o.on ? 'border-gray-900 bg-white' : 'border-gray-200 bg-white'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 ${
                    o.on ? 'border-gray-900' : 'border-gray-300'
                  }`}
                >
                  {o.on && <span className="h-1.5 w-1.5 rounded-full bg-gray-900" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[12px] ${o.on ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                    {o.text}
                  </span>
                  {o.note && <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-500">{o.note}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      );

    case 'check':
      return (
        <div>
          {b.label && <span className="mb-1.5 block text-[11px] font-medium text-gray-500">{b.label}</span>}
          <div className="space-y-1.5">
            {b.options.map((o) => (
              <div key={o.text} className="flex items-start gap-2">
                <span
                  className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                    o.on ? 'border-emerald-600 bg-emerald-600' : 'border-gray-300 bg-white'
                  }`}
                >
                  {o.on && <Check className="h-2.5 w-2.5 text-white" strokeWidth={4} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-gray-800">{o.text}</span>
                  {o.note && <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-500">{o.note}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      );

    case 'btn': {
      const align = b.align === 'right' ? 'justify-end' : b.align === 'full' ? '' : 'justify-start';
      return (
        <div className={b.align === 'full' ? '' : `flex ${align}`}>
          <ButtonView label={b.label} variant={b.variant} accent={accent} full={b.align === 'full'} />
        </div>
      );
    }

    case 'btnrow':
      return (
        <div className="flex flex-wrap gap-2">
          {b.items.map((it) => (
            <ButtonView key={it.label} label={it.label} variant={it.variant} accent={accent} />
          ))}
        </div>
      );

    case 'notice':
      return (
        <div className={`rounded-lg border-l-[3px] border px-2.5 py-2 ${TONE_BOX[b.tone]}`}>
          {b.title && <p className="text-[11px] font-bold">{b.title}</p>}
          <p className={`text-[11.5px] leading-relaxed ${b.title ? 'mt-0.5' : ''}`}>{b.text}</p>
        </div>
      );

    case 'table':
      return (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[360px] border-collapse text-left">
            <thead>
              <tr>
                {b.cols.map((c, i) => (
                  <th
                    key={i}
                    className="border-b border-gray-300 bg-gray-50 px-2 py-1.5 text-[10.5px] font-semibold text-gray-500"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, ri) => (
                <tr key={ri} className="align-top">
                  {row.map((cell, ci) => (
                    <td key={ci} className="border-b border-gray-200 px-2 py-1.5 text-[11.5px] leading-relaxed">
                      <CellView cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'cards':
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {b.items.map((it) => (
            <div
              key={it.name}
              className={`overflow-hidden rounded-lg border bg-white ${
                it.checked ? 'border-[#E31837] ring-1 ring-[#E31837]/30' : 'border-gray-200'
              } ${it.lock ? 'opacity-60' : ''}`}
            >
              <div className="relative aspect-square">
                <PhotoBlock kind="photo" />
                <span
                  className={`absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded border bg-white ${
                    it.checked ? 'border-[#E31837] bg-[#E31837]' : 'border-gray-400'
                  }`}
                >
                  {it.checked && <Check className="h-3 w-3 text-white" strokeWidth={4} />}
                  {it.lock && <Ban className="h-2.5 w-2.5 text-gray-400" />}
                </span>
                {it.badge && (
                  <span
                    className={`absolute bottom-1.5 left-1.5 rounded border px-1 py-0.5 text-[9px] font-bold ${TONE_CHIP[it.badge.tone]}`}
                  >
                    {it.badge.t}
                  </span>
                )}
              </div>
              <div className="p-1.5">
                <p className="truncate text-[10.5px] font-medium text-gray-800">{it.name}</p>
                {it.price && <p className="text-[10px] text-gray-500">{it.price}</p>}
              </div>
            </div>
          ))}
        </div>
      );

    case 'tabs':
      return (
        <div className="flex gap-4 border-b border-gray-200">
          {b.items.map((t, i) => (
            <span
              key={t}
              className={`-mb-px border-b-2 pb-1.5 text-[12px] ${
                i === b.active ? 'border-gray-900 font-bold text-gray-900' : 'border-transparent text-gray-400'
              }`}
            >
              {t}
            </span>
          ))}
        </div>
      );

    case 'gauges':
      return (
        <div className="space-y-1.5">
          {b.items.map((g) => (
            <div key={g.label}>
              <div className="mb-0.5 flex items-baseline justify-between">
                <span className="text-[11px] text-gray-600">{g.label}</span>
                <span className={`text-[10px] font-bold tabular-nums ${TONE_TEXT[g.tone ?? 'mute']}`}>{g.pct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                <div className={`h-full rounded-full ${TONE_BAR[g.tone ?? 'info']}`} style={{ width: `${g.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      );

    case 'thumbs':
      return (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {b.items.map((t) => (
            <div key={t.cap} className="w-[76px] shrink-0">
              <div
                className={`relative aspect-square overflow-hidden rounded-lg border ${
                  t.pick ? 'border-[#E31837] ring-2 ring-[#E31837]/25' : 'border-gray-200'
                } ${t.del ? 'opacity-40' : ''}`}
              >
                <PhotoBlock kind={t.kind} />
                {t.pick && (
                  <span className="absolute left-1 top-1 rounded bg-[#E31837] px-1 text-[8.5px] font-bold text-white">
                    대표
                  </span>
                )}
                {t.del && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gray-900/80">
                    <X className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                  </span>
                )}
              </div>
              <p className="mt-1 text-[9.5px] leading-tight text-gray-500">{t.cap}</p>
            </div>
          ))}
        </div>
      );

    case 'imgpair':
      return (
        <div className="grid grid-cols-2 gap-2">
          {b.items.map((it) => (
            <div key={it.src}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={it.src}
                alt={it.alt}
                loading="lazy"
                className={`aspect-square w-full rounded-lg border-2 bg-white object-contain ${
                  it.verdict === 'ok' ? 'border-emerald-500' : 'border-rose-500'
                }`}
              />
              <p
                className={`mt-1 text-center text-[11px] font-semibold ${
                  it.verdict === 'ok' ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {it.verdict === 'ok' ? '○ ' : '× '}
                {it.cap}
              </p>
              {it.note && <p className="mt-0.5 text-center text-[10.5px] leading-relaxed text-gray-500">{it.note}</p>}
            </div>
          ))}
        </div>
      );

    case 'chat':
      return (
        <div className="space-y-2">
          {b.items.map((m, i) => (
            <div key={i} className={`flex ${m.who === 'me' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[88%] rounded-2xl px-3 py-2 text-[11.5px] leading-relaxed ${
                  m.who === 'me'
                    ? 'rounded-br-sm bg-gray-900 text-white'
                    : m.who === 'sys'
                      ? 'bg-gray-100 text-gray-500'
                      : 'rounded-bl-sm border border-gray-200 bg-white text-gray-800'
                }`}
              >
                <span className="mb-0.5 block text-[9.5px] font-bold opacity-60">
                  {m.who === 'me' ? '판매자(나)' : m.who === 'cs' ? '고객' : '시스템'}
                </span>
                {m.text}
              </div>
            </div>
          ))}
        </div>
      );

    case 'kv':
      return (
        <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
          {b.items.map((it) => (
            <div key={it.k} className="flex items-start gap-3 px-2.5 py-2">
              <span className="w-[86px] shrink-0 text-[11px] text-gray-500">{it.k}</span>
              <span className={`min-w-0 flex-1 break-all text-[11.5px] font-medium ${it.tone ? TONE_TEXT[it.tone] : 'text-gray-900'}`}>
                {it.v}
              </span>
              {it.copy && <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />}
            </div>
          ))}
        </div>
      );

    case 'flow':
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {b.items.map((s, i) => (
            <span key={s.text} className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10.5px] font-medium ${
                  s.state === 'done'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : s.state === 'now'
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 bg-white text-gray-400'
                }`}
              >
                {s.state === 'done' && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
                {s.text}
              </span>
              {i < b.items.length - 1 && <ChevronRight className="h-3 w-3 text-gray-300" />}
            </span>
          ))}
        </div>
      );

    case 'upload':
      return (
        <div>
          <span className="mb-1 block text-[11px] font-medium text-gray-500">{b.label}</span>
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-2.5">
            <div className="flex flex-wrap gap-1.5">
              {(b.files ?? []).map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-1 text-[10.5px] text-gray-700"
                >
                  <Paperclip className="h-2.5 w-2.5 text-gray-400" />
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      );

    case 'doc':
      return (
        <div className="rounded-lg border border-gray-300 bg-white p-3 shadow-sm">
          <p className="mb-2 border-b border-gray-200 pb-1.5 text-center text-[12.5px] font-bold tracking-[0.2em] text-gray-900">
            {b.title}
          </p>
          <div className="space-y-1">
            {b.lines.map((l, i) => (
              <p key={i} className="text-[11px] leading-relaxed text-gray-700">
                {l}
              </p>
            ))}
          </div>
          {b.stamp && (
            <div className="mt-3 flex justify-end">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-rose-400/70 text-center text-[8px] font-bold leading-tight text-rose-500/80">
                {b.stamp}
              </span>
            </div>
          )}
        </div>
      );

    default:
      return null;
  }
}

function ButtonView({
  label,
  variant = 'primary',
  accent,
  full,
}: {
  label: string;
  variant?: 'primary' | 'sec' | 'danger' | 'off';
  accent: string;
  full?: boolean;
}) {
  const cls =
    variant === 'primary'
      ? `${ACCENT[accent] ?? ACCENT.red} text-white`
      : variant === 'danger'
        ? 'bg-rose-600 text-white'
        : variant === 'off'
          ? 'bg-gray-100 text-gray-400 border border-gray-200'
          : 'bg-white text-gray-800 border border-gray-300';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-[11.5px] font-semibold ${cls} ${
        full ? 'w-full' : ''
      }`}
    >
      {label}
    </span>
  );
}

// ─── 실제 캡처 ───
/**
 * 진짜 캡처 + 번호 배지.
 *
 * 배지 번호는 그림 목업과 **같은 규칙**으로 매긴다(체크리스트 순번). 캡처냐 그림이냐에 따라
 * 번호 체계가 달라지면 아래 체크리스트와 이어지지 않는다.
 * 좌표만으로는 모바일에서도 스크린리더에서도 안 읽히므로, 아래에 번호 목록을 항상 같이 낸다.
 */
function ShotView({
  screen,
  subIds,
  checkedItems,
  focusPin,
}: {
  focusPin?: string;
  screen: MockupShotScreen;
  subIds: string[];
  checkedItems: Record<string, boolean>;
}) {
  const [zoom, setZoom] = useState(false);
  const [broken, setBroken] = useState(false);

  const spots = screen.hotspots.filter(h => !focusPin || h.pin === focusPin).map((h) => ({
    ...h,
    n: subIds.indexOf(h.pin) + 1,
    done: !!checkedItems[h.pin],
  }));

  if (broken) {
    return (
      <div className="bg-gray-900 px-4 py-6 text-center text-[12px] text-gray-500">
        화면 캡처를 불러오지 못했습니다. 아래 체크리스트의 설명을 그대로 따라가면 됩니다.
      </div>
    );
  }

  return (
    <div className="bg-[#e9ebf0]">
      <div className="relative">
        <button type="button" onClick={() => setZoom(true)} className="block w-full cursor-zoom-in" title="크게 보기">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screen.src}
            alt={screen.alt}
            loading="lazy"
            onError={() => setBroken(true)}
            className="block h-auto w-full bg-white"
          />
        </button>
        {spots.map((h, i) => (
          <span
            key={i}
            aria-hidden
            className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-bold tabular-nums shadow-lg ring-2 ring-white ${
              h.done ? 'bg-emerald-500 text-white' : 'bg-[#E31837] text-white'
            }`}
            style={{ left: `${h.x}%`, top: `${h.y}%` }}
          >
            {h.done ? <Check className="h-3 w-3" strokeWidth={3} /> : h.n}
          </span>
        ))}
        <span className="absolute right-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[9px] text-white">
          실제 화면 캡처 · 눌러서 크게 보기
        </span>
      </div>

      {/* 좌표 대신 읽을 수 있는 목록 */}
      <ol className="space-y-1.5 bg-white p-3">
        {spots.map((h, i) => (
          <li key={i} className="flex items-start gap-2">
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold tabular-nums text-white ${
                h.done ? 'bg-emerald-500' : 'bg-[#E31837]'
              }`}
            >
              {h.n}
            </span>
            <span className="text-[11.5px] leading-relaxed text-gray-700">{h.label}</span>
          </li>
        ))}
      </ol>

      {zoom && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4" onClick={() => setZoom(false)}>
          <div className="relative max-h-[92vh] max-w-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={screen.src} alt={screen.alt} className="max-h-[92vh] max-w-full rounded-lg object-contain shadow-2xl" />
            {spots.map((h, i) => (
              <span
                key={i}
                className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#E31837] text-[11px] font-bold text-white shadow-lg ring-2 ring-white"
                style={{ left: `${h.x}%`, top: `${h.y}%` }}
              >
                {h.n}
              </span>
            ))}
            <button
              onClick={() => setZoom(false)}
              className="absolute -top-3 right-0 flex h-8 w-8 -translate-y-full items-center justify-center rounded-full bg-white/10 text-white"
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 프레임 ───
function Frame({
  screen,
  children,
}: {
  screen: MockupDrawnScreen;
  children: React.ReactNode;
}) {
  const accent = screen.accent ?? 'red';

  if (screen.chrome === 'phone') {
    return (
      <div className="flex justify-center bg-gradient-to-b from-gray-900 to-gray-950 px-4 py-4">
        <div className="w-full max-w-[300px] overflow-hidden rounded-[22px] border-4 border-gray-800 bg-white shadow-xl">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 ${ACCENT[accent]} text-white`}>
            <Bell className="h-3 w-3" />
            <span className="text-[10.5px] font-semibold">{screen.brand ?? '알림'}</span>
          </div>
          <div className="space-y-3 p-3">{children}</div>
        </div>
      </div>
    );
  }

  if (screen.chrome === 'paper') {
    return (
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 px-4 py-5">
        <div className="mx-auto max-w-[420px] space-y-3 rounded-lg bg-[#fdfcf8] p-4 shadow-xl">{children}</div>
      </div>
    );
  }

  // browser
  return (
    <div className="bg-[#e9ebf0]">
      {/* 크롬 */}
      <div className="flex items-center gap-2 border-b border-black/10 bg-[#dfe2e8] px-2.5 py-1.5">
        <span className="flex gap-1">
          <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
          <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
          <span className="h-2 w-2 rounded-full bg-[#28c840]" />
        </span>
        <span className="min-w-0 flex-1 truncate rounded bg-white/90 px-2 py-0.5 text-[10px] text-gray-500">
          {screen.url ?? screen.brand ?? ''}
        </span>
      </div>
      {/* 서비스 헤더 */}
      {screen.brand && (
        <div className="flex items-center gap-2 border-b border-black/10 bg-white px-3 py-2">
          <span className={`h-3.5 w-3.5 rounded ${ACCENT[accent]}`} />
          <span className="text-[11.5px] font-bold text-gray-900">{screen.brand}</span>
          {screen.menu && (
            <span className="ml-3 hidden gap-3 sm:flex">
              {screen.menu.items.map((m, i) => (
                <span
                  key={m}
                  className={`text-[10.5px] ${
                    i === screen.menu!.active ? 'font-bold text-gray-900 underline decoration-2 underline-offset-4' : 'text-gray-400'
                  }`}
                >
                  {m}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
      {screen.path && (
        <div className="border-b border-black/5 bg-[#f2f4f7] px-3 py-1 text-[10px] text-gray-500">{screen.path}</div>
      )}
      <div className="space-y-3 bg-[#f7f8fa] p-3 sm:p-4">{children}</div>
    </div>
  );
}

/** 이 화면이 다루는 체크리스트 번호 범위 — '1–4' 또는 '2'. 번호가 없으면 빈 값. */
function numberRange(screen: MockupScreen, subIds: string[]): string {
  const ns = (
    isShot(screen)
      ? screen.hotspots.map((h) => h.pin)
      : screen.blocks.map((b) => b.pin).filter((p): p is string => !!p)
  )
    .map((p) => subIds.indexOf(p) + 1)
    .filter((n) => n > 0);
  if (ns.length === 0) return '';
  const lo = Math.min(...ns);
  const hi = Math.max(...ns);
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

// ─── 본체 ───
export default function StepMockup({
  screens,
  subIds,
  checkedItems,
  focusPin,
}: {
  focusPin?: string;
  screens: MockupScreen[];
  /** 이 단계의 체크리스트 id 순서. pin → 번호를 여기서 구한다. */
  subIds: string[];
  checkedItems: Record<string, boolean>;
}) {
  const [active, setActive] = useState(0);
  if (screens.length === 0) return null;

  const screen = screens[Math.min(active, screens.length - 1)];
  const shot = isShot(screen);
  const accent = shot ? 'red' : (screen.accent ?? 'red');

  return (
    <div className="mb-4">
      {/* 화면이 여러 장이면 전환 탭 — 어느 번호를 다루는 화면인지까지 적는다.
          "3번이 어느 화면에 있지" 를 탭을 하나씩 눌러 찾게 하면 안 된다. */}
      {screens.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {screens.map((s, i) => {
            const range = numberRange(s, subIds);
            return (
              <button
                key={s.tab}
                onClick={() => setActive(i)}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  i === active
                    ? 'bg-white/15 text-white'
                    : 'bg-white/[0.03] text-gray-500 hover:bg-white/[0.07] hover:text-gray-300'
                }`}
              >
                {s.tab}
                {range && <span className="ml-1.5 tabular-nums opacity-60">{range}</span>}
              </button>
            );
          })}
        </div>
      )}

      <figure className="overflow-hidden rounded-xl border border-white/10 bg-gray-950">
        {/* 캡처인지 그림인지를 숨기지 않는다. 둘은 신뢰도가 다르다. */}
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider ${shot ? 'text-emerald-500' : 'text-gray-500'}`}
          >
            {shot ? '실제 캡처' : '화면 재현'}
          </span>
          <span className="truncate text-[10px] text-gray-600">{shot ? screen.source : screen.brand}</span>
          <span className="ml-auto rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] text-gray-500">
            {shot ? '서비스 업데이트로 달라질 수 있음' : '실제 화면과 다를 수 있음'}
          </span>
        </div>

        {shot ? (
          <ShotView screen={screen} subIds={subIds} checkedItems={checkedItems} focusPin={focusPin} />
        ) : (
          <Frame screen={screen}>
            {screen.blocks.map((b, i) => {
              const n = b.pin ? subIds.indexOf(b.pin) + 1 : 0;
              const done = !!(b.pin && checkedItems[b.pin]);
              // 누르는 것이면 번호를 요소 위에 얹고 점선으로 감싼다.
              const target = n > 0 && CLICK_KINDS.has(b.k);
              return (
                <div key={i} className={`flex gap-2 rounded-lg transition-opacity ${focusPin && b.pin && b.pin !== focusPin ? 'opacity-40' : ''} ${focusPin && b.pin === focusPin ? 'ring-2 ring-violet-400 ring-offset-4 ring-offset-white' : ''}`}>
                  <span className="w-5 shrink-0">{n > 0 && !target && <Pin n={n} done={done} />}</span>
                  <div className="min-w-0 flex-1">
                    {target ? (
                      <div
                        className={`relative rounded-lg border-2 border-dashed p-2 ${
                          done ? 'border-emerald-500/60 bg-emerald-500/[0.04]' : 'border-[#E31837]/60 bg-[#E31837]/[0.03]'
                        }`}
                      >
                        <span
                          className={`absolute -left-2 -top-2.5 z-10 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white shadow-md ${
                            done ? 'bg-emerald-500' : 'bg-[#E31837]'
                          }`}
                        >
                          {done ? <Check className="h-3 w-3" strokeWidth={3} /> : <MousePointerClick className="h-3 w-3" />}
                          <span className="tabular-nums">{n}</span>
                        </span>
                        <BlockView b={b} accent={accent} />
                      </div>
                    ) : (
                      <BlockView b={b} accent={accent} />
                    )}
                  </div>
                </div>
              );
            })}
          </Frame>
        )}

        <figcaption className="border-t border-white/10 bg-white/[0.02] px-3 py-2.5">
          <p className="text-[12px] leading-relaxed text-gray-400">{screen.caption}</p>
          <p className="mt-1 text-[10.5px] leading-relaxed text-gray-600">
            {shot
              ? '빨간 번호가 현재 미션에서 확인할 자리입니다. 완료 체크하면 초록색으로 바뀝니다. 화면을 누르면 크게 볼 수 있습니다.'
              : '점선으로 둘러싸인 곳이 누르거나 입력하는 자리입니다. 보라색 테두리가 현재 미션의 위치이며, 완료 체크하면 번호가 초록색으로 바뀝니다.'}
          </p>
        </figcaption>
      </figure>
    </div>
  );
}
