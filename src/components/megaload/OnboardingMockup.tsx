'use client';

import { useState } from 'react';
import { Check, Upload, ChevronDown, Search, Clock, ShieldCheck, FileText, ZoomIn, X } from 'lucide-react';

/**
 * 입점 가이드용 "실제 화면처럼 보이는" 목업 렌더러.
 *
 * 각 단계는 screen 스펙(선언형)으로 실제 가입 화면을 재현한다.
 * step.imageUrl(실제 스크린샷)이 있고 로드에 성공하면 그 이미지를 우선 표시하고,
 * 없거나 핫링크 차단으로 실패하면 아래 목업으로 자동 폴백한다.
 */

export type MockFieldType = 'text' | 'select' | 'radio' | 'file' | 'checkbox' | 'toggle' | 'date';

export interface MockField {
  label: string;
  value?: string;
  type?: MockFieldType;
  options?: string[];
  /** radio/select에서 선택된 값 */
  selected?: string;
  /** 강조(빨간 테두리 등) */
  active?: boolean;
  /** 채워진(회색) vs 빈칸 */
  filled?: boolean;
}

export type MockVariant =
  | 'form'        // 정보 입력 폼
  | 'choice'      // 유형 선택(개인/사업자 등 카드)
  | 'upload'      // 서류 업로드
  | 'status'      // 심사중/승인 상태
  | 'dashboard'   // 판매자센터 홈
  | 'menu';       // 메뉴 네비게이션 강조

export interface MockScreen {
  variant: MockVariant;
  /** 페이지 제목(화면 안 헤더) */
  screenTitle?: string;
  fields?: MockField[];
  /** choice 변형용 카드 */
  choices?: { label: string; desc?: string; selected?: boolean }[];
  /** upload 변형용 문서 목록 */
  docs?: { label: string; done?: boolean }[];
  /** status 변형: 상태 텍스트 */
  status?: 'pending' | 'approved' | 'rejected';
  statusTitle?: string;
  statusText?: string;
  /** menu 변형: 사이드 메뉴 항목(하이라이트=active) */
  menu?: { label: string; active?: boolean }[];
  /** 하단 기본 버튼 텍스트 */
  cta?: string;
}

function withAlpha(hex: string, alpha: string) {
  return `${hex}${alpha}`;
}

function FieldRow({ f, color }: { f: MockField; color: string }) {
  const t = f.type ?? 'text';
  if (t === 'radio') {
    return (
      <div className="py-1">
        <span className="block text-[11px] text-gray-500 mb-1">{f.label}</span>
        <div className="flex flex-wrap gap-1.5">
          {(f.options ?? []).map((o) => {
            const on = o === f.selected;
            return (
              <span
                key={o}
                className="inline-flex items-center gap-1 text-[11px] rounded-full border px-2.5 py-1"
                style={
                  on
                    ? { borderColor: color, backgroundColor: withAlpha(color, '14'), color }
                    : { borderColor: '#e5e7eb', color: '#6b7280' }
                }
              >
                <span
                  className="w-2.5 h-2.5 rounded-full border inline-block"
                  style={on ? { borderColor: color, backgroundColor: color } : { borderColor: '#cbd5e1' }}
                />
                {o}
              </span>
            );
          })}
        </div>
      </div>
    );
  }
  if (t === 'checkbox') {
    return (
      <label className="flex items-center gap-2 py-1 text-[11px] text-gray-600">
        <span
          className="w-3.5 h-3.5 rounded flex items-center justify-center text-white"
          style={{ backgroundColor: f.filled ? color : '#e5e7eb' }}
        >
          {f.filled && <Check className="w-2.5 h-2.5" />}
        </span>
        {f.label}
      </label>
    );
  }
  if (t === 'toggle') {
    return (
      <div className="flex items-center justify-between py-1">
        <span className="text-[11px] text-gray-600">{f.label}</span>
        <span className="w-8 h-4 rounded-full relative" style={{ backgroundColor: f.filled ? color : '#e5e7eb' }}>
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${f.filled ? 'right-0.5' : 'left-0.5'}`} />
        </span>
      </div>
    );
  }
  // text / select / date / file
  return (
    <div className="py-1">
      <span className="block text-[11px] text-gray-500 mb-1">{f.label}</span>
      <div
        className="flex items-center justify-between rounded-md border bg-white px-2.5 h-8"
        style={{ borderColor: f.active ? color : '#e5e7eb' }}
      >
        <span className={`text-[11px] truncate ${f.value ? 'text-gray-700' : 'text-gray-300'}`}>
          {f.value || (t === 'select' ? '선택하세요' : t === 'date' ? 'YYYY.MM.DD' : '입력')}
        </span>
        {t === 'select' && <ChevronDown className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
        {t === 'file' && <Upload className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
        {t === 'date' && <span className="text-gray-300 text-[11px] shrink-0">📅</span>}
      </div>
    </div>
  );
}

function ScreenBody({ screen, color }: { screen: MockScreen; color: string }) {
  const { variant } = screen;

  const header = screen.screenTitle && (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-1 h-4 rounded-full" style={{ backgroundColor: color }} />
      <h5 className="text-[13px] font-bold text-gray-800">{screen.screenTitle}</h5>
    </div>
  );

  const cta = screen.cta && (
    <button
      className="mt-3 w-full rounded-md py-2 text-[12px] font-bold text-white"
      style={{ backgroundColor: variant === 'status' && screen.status === 'pending' ? '#9ca3af' : color }}
      tabIndex={-1}
    >
      {screen.cta}
    </button>
  );

  if (variant === 'choice') {
    return (
      <div className="p-4">
        {header}
        <div className="grid grid-cols-2 gap-2">
          {(screen.choices ?? []).map((c) => (
            <div
              key={c.label}
              className="rounded-lg border-2 p-2.5 text-center"
              style={
                c.selected
                  ? { borderColor: color, backgroundColor: withAlpha(color, '0d') }
                  : { borderColor: '#e5e7eb' }
              }
            >
              <div
                className="mx-auto w-7 h-7 rounded-full flex items-center justify-center mb-1"
                style={{ backgroundColor: c.selected ? color : '#f1f5f9' }}
              >
                {c.selected ? <Check className="w-4 h-4 text-white" /> : <span className="w-2 h-2 rounded-full bg-gray-300" />}
              </div>
              <p className="text-[12px] font-semibold" style={{ color: c.selected ? color : '#374151' }}>{c.label}</p>
              {c.desc && <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{c.desc}</p>}
            </div>
          ))}
        </div>
        {cta}
      </div>
    );
  }

  if (variant === 'upload') {
    return (
      <div className="p-4">
        {header}
        <div
          className="rounded-lg border-2 border-dashed flex flex-col items-center justify-center py-4 mb-2.5"
          style={{ borderColor: withAlpha(color, '55') }}
        >
          <Upload className="w-5 h-5 mb-1" style={{ color }} />
          <p className="text-[11px] text-gray-500">파일을 끌어다 놓거나 클릭해 업로드</p>
        </div>
        <div className="space-y-1.5">
          {(screen.docs ?? []).map((d) => (
            <div key={d.label} className="flex items-center justify-between rounded-md bg-gray-50 border border-gray-100 px-2.5 py-1.5">
              <span className="flex items-center gap-1.5 text-[11px] text-gray-600">
                <FileText className="w-3.5 h-3.5 text-gray-400" /> {d.label}
              </span>
              {d.done ? (
                <span className="flex items-center gap-1 text-[10px] font-medium" style={{ color }}>
                  <Check className="w-3 h-3" /> 첨부됨
                </span>
              ) : (
                <span className="text-[10px] text-gray-300">미첨부</span>
              )}
            </div>
          ))}
        </div>
        {cta}
      </div>
    );
  }

  if (variant === 'status') {
    const s = screen.status ?? 'pending';
    const icon =
      s === 'approved' ? <ShieldCheck className="w-7 h-7 text-white" /> :
      s === 'rejected' ? <span className="text-white text-xl font-bold">!</span> :
      <Clock className="w-7 h-7 text-white" />;
    const badge = s === 'approved' ? color : s === 'rejected' ? '#ef4444' : '#f59e0b';
    return (
      <div className="p-5 text-center">
        <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: badge }}>
          {icon}
        </div>
        <p className="text-[13px] font-bold text-gray-800">{screen.statusTitle ?? (s === 'approved' ? '입점 승인 완료' : s === 'rejected' ? '보완 요청' : '심사 진행 중')}</p>
        {screen.statusText && <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{screen.statusText}</p>}
        {cta}
      </div>
    );
  }

  if (variant === 'dashboard') {
    return (
      <div className="p-4">
        {header}
        <div className="grid grid-cols-3 gap-1.5 mb-2.5">
          {['주문', '정산', '문의'].map((k) => (
            <div key={k} className="rounded-lg bg-gray-50 border border-gray-100 p-2 text-center">
              <p className="text-[10px] text-gray-400">{k}</p>
              <p className="text-[13px] font-bold" style={{ color }}>0</p>
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          {(screen.menu ?? [{ label: '상품관리' }, { label: '판매자정보', active: true }, { label: '정산관리' }]).map((m) => (
            <div
              key={m.label}
              className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-[11px]"
              style={m.active ? { backgroundColor: withAlpha(color, '14'), color, fontWeight: 700 } : { color: '#6b7280' }}
            >
              {m.label}
              {m.active && <span className="text-[10px]">← 여기</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'menu') {
    return (
      <div className="flex">
        <div className="w-2/5 border-r border-gray-100 py-2">
          {(screen.menu ?? []).map((m) => (
            <div
              key={m.label}
              className="px-2.5 py-1.5 text-[11px] flex items-center gap-1"
              style={m.active ? { backgroundColor: withAlpha(color, '14'), color, fontWeight: 700, borderLeft: `2px solid ${color}` } : { color: '#6b7280' }}
            >
              {m.active && <span style={{ color }}>▸</span>}
              {m.label}
            </div>
          ))}
        </div>
        <div className="flex-1 p-3">
          {header}
          <div className="space-y-1">
            {(screen.fields ?? []).map((f, i) => <FieldRow key={i} f={f} color={color} />)}
          </div>
          {cta}
        </div>
      </div>
    );
  }

  // form (default)
  return (
    <div className="p-4">
      {header}
      <div className="space-y-0.5">
        {(screen.fields ?? []).map((f, i) => <FieldRow key={i} f={f} color={color} />)}
      </div>
      {cta}
    </div>
  );
}

export default function OnboardingMockup({
  screen,
  color,
  domain,
  imageUrl,
  imageSource,
}: {
  screen?: MockScreen;
  color: string;
  domain?: string | null;
  imageUrl?: string;
  imageSource?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const [zoom, setZoom] = useState(false);
  const showReal = !!imageUrl && !imgError;

  return (
    <>
    <div className="rounded-xl border-2 border-gray-200 overflow-hidden bg-white shadow-sm select-none">
      {/* 브라우저 크롬 */}
      <div className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-100 border-b border-gray-200">
        <span className="w-3 h-3 rounded-full bg-red-400" />
        <span className="w-3 h-3 rounded-full bg-yellow-400" />
        <span className="w-3 h-3 rounded-full bg-green-400" />
        <span className="ml-2 flex-1 flex items-center gap-1 text-[11px] text-gray-500 bg-white rounded-full px-2.5 py-1 min-w-0">
          <span className="shrink-0">🔒</span>
          <span className="truncate">{domain || 'seller.example.co.kr'}</span>
          <Search className="w-3 h-3 text-gray-300 ml-auto shrink-0" />
        </span>
      </div>

      {showReal ? (
        <figure className="m-0 relative group">
          <button type="button" onClick={() => setZoom(true)} className="block w-full cursor-zoom-in" title="크게 보기">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="실제 화면 예시"
              loading="lazy"
              onError={() => setImgError(true)}
              className="w-full max-h-[560px] object-contain bg-gray-50"
            />
            <span className="absolute top-2 right-2 flex items-center gap-1 bg-black/55 text-white text-[11px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition">
              <ZoomIn className="w-3.5 h-3.5" /> 크게 보기
            </span>
          </button>
          <figcaption className="text-[11px] text-gray-400 text-center py-1.5 px-2 border-t border-gray-100">
            실제 화면 예시{imageSource ? ` · 출처: ${imageSource}` : ''} (마켓 UI 버전에 따라 다를 수 있어요)
          </figcaption>
        </figure>
      ) : screen ? (
        <div className="text-[13px] sm:text-sm">
          <ScreenBody screen={screen} color={color} />
        </div>
      ) : (
        <div className="p-8 text-center text-xs text-gray-300">화면 미리보기</div>
      )}
    </div>

    {/* 확대 라이트박스 */}
    {zoom && showReal && (
      <div
        className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
        onClick={() => setZoom(false)}
      >
        <button
          type="button"
          className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
          onClick={() => setZoom(false)}
          aria-label="닫기"
        >
          <X className="w-7 h-7" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="실제 화면 확대" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
      </div>
    )}
    </>
  );
}
