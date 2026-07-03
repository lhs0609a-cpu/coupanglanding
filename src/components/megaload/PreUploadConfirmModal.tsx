'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Tag, AlertTriangle, X } from 'lucide-react';

/**
 * 업로드 전 최종 책임 확인 게이트.
 *
 * 모든 최종 업로드(등록) 경로에서 실제 등록 함수를 호출하기 직전에 띄운다.
 * 3개 항목(지식재산권 / 옵션명 / 책임 동의)을 모두 체크해야 "확인하고 업로드"가 활성화된다.
 * 프론트에서만 막는 게이트 — 별도 백엔드 동의 기록은 남기지 않는다.
 *
 * 예시 이미지는 외부 핫링크 대신 내장 SVG 목업을 사용한다(저작권/링크깨짐 리스크 0).
 * 실제 스크린샷으로 교체하려면 아래 <ExampleThumb> 자리에 <img src="/megaload/guide/xxx.png" /> 로 바꾸면 된다.
 */

interface Props {
  open: boolean;
  /** 업로드할 상품 수 (표시용) */
  count?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 내장 SVG 목업 썸네일 — good=정상 예시, bad=위반 예시 */
function ExampleThumb({ variant }: { variant: 'ip-good' | 'ip-bad' | 'opt-good' | 'opt-bad' }) {
  const isGood = variant === 'ip-good' || variant === 'opt-good';
  const ring = isGood ? '#16a34a' : '#E31837';
  return (
    <svg viewBox="0 0 120 90" className="w-full h-auto rounded-md border" style={{ borderColor: ring }} role="img" aria-hidden>
      <rect x="0" y="0" width="120" height="90" fill={isGood ? '#f0fdf4' : '#fef2f2'} />
      {variant === 'ip-good' && (
        <>
          {/* 정품/직접촬영 상품 박스 */}
          <rect x="34" y="24" width="52" height="42" rx="4" fill="#bbf7d0" stroke="#16a34a" />
          <rect x="42" y="34" width="36" height="6" rx="3" fill="#16a34a" opacity="0.6" />
          <rect x="42" y="46" width="24" height="6" rx="3" fill="#16a34a" opacity="0.35" />
        </>
      )}
      {variant === 'ip-bad' && (
        <>
          {/* 캐릭터/브랜드 로고 무단 사용 느낌 — 별 + 말풍선 */}
          <circle cx="46" cy="42" r="14" fill="#fecaca" stroke="#E31837" />
          <path d="M46 32 l3 6 6 1 -4.5 4 1 6 -5.5 -3 -5.5 3 1 -6 -4.5 -4 6 -1 z" fill="#E31837" opacity="0.7" />
          <rect x="66" y="34" width="30" height="16" rx="8" fill="#fff" stroke="#E31837" />
          <text x="81" y="45" fontSize="9" fill="#E31837" textAnchor="middle" fontWeight="bold">TM®</text>
        </>
      )}
      {variant === 'opt-good' && (
        <>
          <rect x="14" y="24" width="92" height="14" rx="3" fill="#fff" stroke="#16a34a" />
          <text x="20" y="34" fontSize="8" fill="#166534">색상: 블랙</text>
          <rect x="14" y="44" width="92" height="14" rx="3" fill="#fff" stroke="#16a34a" />
          <text x="20" y="54" fontSize="8" fill="#166534">사이즈: 라지(L)</text>
        </>
      )}
      {variant === 'opt-bad' && (
        <>
          <rect x="14" y="24" width="92" height="14" rx="3" fill="#fff" stroke="#E31837" />
          <text x="20" y="34" fontSize="8" fill="#991b1b">옵션1: 1</text>
          <rect x="14" y="44" width="92" height="14" rx="3" fill="#fff" stroke="#E31837" />
          <text x="20" y="54" fontSize="8" fill="#991b1b">옵션2: 2</text>
        </>
      )}
    </svg>
  );
}

function CheckRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-[#E31837] shrink-0"
      />
      <span className="text-sm text-gray-800 leading-snug">{children}</span>
    </label>
  );
}

export default function PreUploadConfirmModal({ open, count, onConfirm, onCancel }: Props) {
  const [ipChecked, setIpChecked] = useState(false);
  const [optChecked, setOptChecked] = useState(false);
  const [respChecked, setRespChecked] = useState(false);

  // 열릴 때마다 초기화 — 매 업로드마다 새로 확인하도록
  useEffect(() => {
    if (open) {
      setIpChecked(false);
      setOptChecked(false);
      setRespChecked(false);
    }
  }, [open]);

  // ESC 로 취소
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const allChecked = ipChecked && optChecked && respChecked;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#E31837]" />
            <h2 className="text-base font-bold text-gray-900">업로드 전 최종 확인</h2>
          </div>
          <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-700 rounded" aria-label="닫기">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="px-5 py-4 overflow-y-auto space-y-5">
          <p className="text-sm text-gray-600">
            {typeof count === 'number' && count > 0
              ? <>상품 <b className="text-gray-900">{count.toLocaleString()}개</b>를 등록하기 전, 아래 항목을 반드시 확인해주세요.</>
              : <>등록하기 전, 아래 항목을 반드시 확인해주세요.</>}
          </p>

          {/* ① 지식재산권 */}
          <section className="rounded-lg border border-gray-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-gray-700" />
              <h3 className="text-sm font-semibold text-gray-900">① 지식재산권(지재권)을 확인하셨나요?</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <ExampleThumb variant="ip-good" />
                <p className="text-[11px] text-green-700 font-medium text-center">✅ 직접 촬영·정품 이미지</p>
              </div>
              <div className="space-y-1">
                <ExampleThumb variant="ip-bad" />
                <p className="text-[11px] text-[#E31837] font-medium text-center">❌ 캐릭터·브랜드 로고 무단 사용</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              타인의 상표·저작권·디자인권을 침해하는 이미지/문구(브랜드 로고, 캐릭터, 유명 제품 사진 무단 도용 등)는 판매 중지·계정 정지·손해배상 사유가 됩니다.
            </p>
            <CheckRow checked={ipChecked} onChange={setIpChecked}>
              상표·저작권·디자인권 등 타인의 <b>지식재산권을 침해하지 않음</b>을 확인했습니다.
            </CheckRow>
          </section>

          {/* ② 옵션명 */}
          <section className="rounded-lg border border-gray-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-gray-700" />
              <h3 className="text-sm font-semibold text-gray-900">② 옵션명을 정확하게 입력하셨나요?</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <ExampleThumb variant="opt-good" />
                <p className="text-[11px] text-green-700 font-medium text-center">✅ 의미가 명확한 옵션명</p>
              </div>
              <div className="space-y-1">
                <ExampleThumb variant="opt-bad" />
                <p className="text-[11px] text-[#E31837] font-medium text-center">❌ 의미 없는 옵션명(1, 2…)</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              옵션명·옵션값이 실제 상품과 다르거나 의미 없이 입력되면 오배송·반품·품질 클레임의 원인이 됩니다. 색상/사이즈/용량 등 실제 구성과 일치하는지 확인하세요.
            </p>
            <CheckRow checked={optChecked} onChange={setOptChecked}>
              <b>옵션명·옵션값을 정확히 입력</b>했음을 확인했습니다.
            </CheckRow>
          </section>

          {/* 책임 동의 */}
          <section className="rounded-lg border-2 border-[#E31837]/40 bg-red-50/50 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[#E31837] mt-0.5 shrink-0" />
              <CheckRow checked={respChecked} onChange={setRespChecked}>
                위 내용을 모두 확인했으며, 이에 대한 <b>책임은 본인(판매자)에게 있음에 동의</b>합니다.
              </CheckRow>
            </div>
          </section>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={!allChecked}
            className="px-5 py-2 text-sm font-semibold text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
            title={allChecked ? '' : '3개 항목을 모두 체크해야 업로드할 수 있습니다.'}
          >
            확인하고 업로드{typeof count === 'number' && count > 0 ? ` (${count.toLocaleString()}개)` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
