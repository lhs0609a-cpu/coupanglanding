'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, X, ShieldAlert, Ban } from 'lucide-react';

/**
 * "검수 없이 바로 등록" 위험 확인 게이트.
 *
 * 올인원 패널의 기본 경로는 카드별 검수(승인 체크 + 필수옵션 직접입력 + 지재권/옵션명 확인)다.
 * 이 모달은 그 검수를 **사용자가 스스로 포기**하고 전량 등록할 때만 뜬다.
 *
 * 설계 원칙 — 실수로 통과할 수 없게:
 *   ① 무엇을 건너뛰는지 실측 건수와 함께 먼저 보여준다(추상적 경고 금지).
 *   ② 위험 5종을 각각 결과(판매중지·계정정지·과징금·손해배상)까지 적고 개별 체크.
 *   ③ 마지막에 확인 문구를 **직접 타이핑**해야 버튼이 열린다(연타 방지).
 *   ④ 기본 포커스/강조는 "취소(검수하고 등록)" 쪽에 둔다.
 *
 * ⚠️ 여기서 건너뛰는 건 어디까지나 **우리 쪽 검수**다. 카테고리코드·판매가·대표이미지처럼
 *    쿠팡 API 가 거절하는 하드 조건은 이 모달로도 건너뛸 수 없다(호출부에서 제외 처리).
 */

export interface SkipReviewPlan {
  /** 실제로 등록될 상품 수 */
  count: number;
  /** 하드 조건(카테고리·가격·대표이미지) 미달로 제외된 수 — 검수 포기로도 등록 불가 */
  excluded: number;
  /** 워커가 "검수필요"로 표시한 상품 수 */
  needsReview: number;
  /** 상품명에서 값을 못 뽑아 자동 기본값이 그대로 나갈 필수옵션 보유 상품 수 */
  unresolvedOptions: number;
  /** 인증번호가 등록 payload 에 안 붙는(빠지는) 상품 수 */
  certRisk: number;
}

const CONFIRM_PHRASE = '검수없이등록';

interface RiskItem {
  key: string;
  title: string;
  body: React.ReactNode;
  label: React.ReactNode;
}

function riskItems(plan: SkipReviewPlan, preArm: boolean): RiskItem[] {
  return [
    {
      key: 'ip',
      title: '① 지식재산권 침해 — 판매중지 · 계정정지 · 손해배상',
      body: (
        <>
          상품명·상세글·이미지를 <b>사람이 한 번도 보지 않고</b> 그대로 올립니다. 소싱처·제조사가 만든
          연출컷이나 타사 상표가 섞여 있어도 걸러지지 않습니다. 적발되면 쿠팡의 상품 삭제·판매 중지,
          반복 시 <b>계정 정지</b>, 권리자의 <b>손해배상 청구·형사 고소</b>로 이어질 수 있습니다.
        </>
      ),
      label: <>이미지·상품명의 <b>지식재산권을 확인하지 않은 채</b> 등록함을 이해합니다.</>,
    },
    {
      key: 'opt',
      title: '② 옵션·스펙 오류 — 오배송 · 반품 · 쿠팡 페널티',
      body: (
        <>
          상품명에 용량·수량이 없으면 자동 추출이 <b>억지 기본값</b>(예: 1ml, 1개)을 채웁니다. 평소엔
          이 값들이 등록을 막지만, 지금은 그대로 나갑니다.
          {plan.unresolvedOptions > 0 && (
            <> 현재 <b className="text-[#E31837]">{plan.unresolvedOptions}개</b> 상품이 여기에 해당합니다.</>
          )}
          {' '}실제와 다른 옵션은 오배송·반품·품질 클레임과 쿠팡 페널티의 직접 원인입니다.
        </>
      ),
      label: <>자동 추출된 <b>옵션값이 실제와 다를 수 있음</b>을 감수합니다.</>,
    },
    {
      key: 'cert',
      title: '③ 인증·고시정보 누락 — 행정처분 · 과태료',
      body: (
        <>
          KC 인증번호가 붙지 않아도 등록이 진행됩니다.
          {plan.certRisk > 0 && (
            <> 현재 <b className="text-[#E31837]">{plan.certRisk}개</b> 상품의 인증정보가 등록에서 빠집니다.</>
          )}
          {' '}전기용품·생활용품·어린이제품은 인증 없이 판매하면 <b>행정처분·과태료</b> 대상이며
          쿠팡 자체 모니터링으로도 판매가 정지됩니다.
        </>
      ),
      label: <>인증정보가 <b>빠진 채 등록될 수 있음</b>을 이해하고, 등록 후 직접 보완하겠습니다.</>,
    },
    {
      key: 'ad',
      title: '④ 표시·광고 위반 — 시정명령 · 과징금',
      body: (
        <>
          상세글은 AI가 생성한 초안입니다. 사실과 다른 효능·원산지·과장 표현이 섞여도
          검수 없이 그대로 노출됩니다. 표시광고법 위반은 <b>시정명령·과징금</b>과 계정 리스크로 이어집니다.
          {plan.needsReview > 0 && (
            <> 워커가 <b className="text-[#E31837]">{plan.needsReview}개</b>를 &ldquo;검수필요&rdquo;로 표시했습니다.</>
          )}
        </>
      ),
      label: <>AI가 쓴 <b>상세글을 검토하지 않고</b> 노출함을 감수합니다.</>,
    },
    {
      key: 'undo',
      title: '⑤ 되돌릴 수 없음 — 한 건씩 수동 삭제',
      body: (
        <>
          등록은 자동으로 취소되지 않습니다. 잘못 올라간 상품은 <b>쿠팡 윙에서 한 건씩 직접 삭제</b>해야 하며,
          그 사이 노출·주문이 발생하면 배송·환불 책임이 그대로 발생합니다.
          {preArm && <> 무인 등록은 <b>내가 화면을 보지 않는 동안</b> 이 일이 벌어진다는 뜻입니다.</>}
        </>
      ),
      label: preArm
        ? <>이번 세션에 <b>생성되는 전량을 되돌리기 어렵다</b>는 점을 이해합니다.</>
        : <><b>{plan.count.toLocaleString()}개를 되돌리기 어렵다</b>는 점을 이해합니다.</>,
    },
    // 무인 실행은 "검수를 건너뛴다"와 별개의 위험이다 — 내가 화면 앞에 없는 동안,
    // 내가 몇 건인지도 모르는 채로 등록이 일어난다. 그래서 동의도 따로 받는다.
    ...(preArm ? [{
      key: 'unattended',
      title: '⑥ 무인 실행 — 내가 보지 않는 동안 등록됩니다',
      body: (
        <>
          생성이 끝나면 <b>확인 화면 없이</b> 등록이 시작됩니다. 몇 건이 올라가는지, 어떤 경고가 있었는지
          <b> 등록이 끝난 뒤에야</b> 알 수 있습니다. 멈출 수 있는 시간은 시작 직전 <b>10초</b>뿐이며,
          그때 자리에 없으면 그대로 진행됩니다. 소싱 폴더를 잘못 골라도 마찬가지입니다.
        </>
      ),
      label: <>내가 <b>자리에 없는 동안 자동으로 등록</b>되는 것에 동의합니다.</>,
    }] : []),
  ];
}

/** 확인 시 호출부에 넘기는 실행 옵션. */
export interface SkipReviewOptions {
  /** 등록 직전 AI 최종점검 실행 여부 */
  audit: boolean;
  /** 점검으로도 못 고친 상품을 등록에서 뺄지(false = 경고만 하고 그대로 등록) */
  excludeUnfixed: boolean;
}

interface Props {
  open: boolean;
  plan: SkipReviewPlan;
  /** 도우미(로컬 GPU) 연결 여부 — 꺼져 있으면 규칙 점검만 되고 재생성은 못 한다 */
  helperOnline: boolean;
  /**
   * 사전 무장(무인 자동등록) 모드. 아직 상품이 하나도 없는 시점(폴더 선택 전)에 미리 동의를 받아,
   * 생성이 끝나면 화면을 보지 않고 그대로 등록되게 한다. 건수를 알 수 없으므로 문구·게이트가 달라진다.
   */
  preArm?: boolean;
  onConfirm: (opts: SkipReviewOptions) => void;
  onCancel: () => void;
}

/**
 * 닫혀 있을 땐 아예 언마운트한다 — 다시 열릴 때 체크·확인문구가 **마운트로** 초기화되므로
 * 직전 동의가 남아 연타로 통과되는 일이 구조적으로 불가능하다(초기화 effect 불필요).
 */
export default function SkipReviewRiskModal(props: Props) {
  if (!props.open) return null;
  return <SkipReviewRiskDialog {...props} />;
}

function SkipReviewRiskDialog({ plan, helperOnline, preArm = false, onConfirm, onCancel }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [phrase, setPhrase] = useState('');
  const [agreed, setAgreed] = useState(false);
  // 사람 검수를 포기하는 대신 기계 점검이라도 태우는 게 기본값이다.
  const [audit, setAudit] = useState(true);
  const [excludeUnfixed, setExcludeUnfixed] = useState(true);

  const items = riskItems(plan, preArm);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const allChecked = items.every((it) => checked[it.key]);
  const phraseOk = phrase.replace(/\s/g, '') === CONFIRM_PHRASE;
  // 사전 무장(무인 켜기)은 **동의 한 번**으로 끝낸다.
  //   항목별 체크 6개 + 확인문구 타이핑은 "한 번 크게 저지르는" 즉시등록용 안전장치라,
  //   반복해서 켜고 끄는 설정 화면에 그대로 두면 매번 30초씩 잡아먹는 고문이 된다(사용자 피드백).
  //   위험 설명 자체는 없애지 않고 접어서 그대로 둔다 — 읽을 사람은 읽고, 동의는 한 줄로.
  const ready = preArm ? agreed : (allChecked && agreed && phraseOk && plan.count > 0);

  // 두 모드가 공유하는 기계 점검 설정.
  const auditSection = (
    <section className="rounded-lg border border-emerald-300 bg-emerald-50/60 p-4 space-y-3">
      <label className="flex items-start gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={audit}
          onChange={(e) => setAudit(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-emerald-600 shrink-0"
        />
        <span className="text-sm text-gray-900 leading-snug">
          🤖 <b>등록 직전 AI 최종점검</b> 실행 <span className="text-emerald-700">(권장)</span>
        </span>
      </label>
      <p className="text-xs text-gray-600 leading-relaxed pl-7">
        올리기 직전에 상품명 · 카테고리 · 상세글 · 옵션 · 가격 · 이미지를 전부 다시 훑습니다.
        금지어·마크다운 기호·가격 오류처럼 규칙으로 고칠 수 있는 건 <b>그 자리에서 자동 수정</b>하고,
        상세글·옵션·카테고리처럼 다시 써야 하는 건 <b>내 PC GPU로 한 번 더 재생성</b>한 뒤 재검사합니다.
        {helperOnline
          ? ' 도우미가 연결돼 있어 재생성까지 가능합니다(서버 비용 0).'
          : ' ⚠️ 지금은 도우미가 꺼져 있어 규칙 점검만 되고, 재생성이 필요한 항목은 고칠 수 없습니다.'}
      </p>
      {audit && (
        <div className="pl-7 space-y-1.5">
          <p className="text-xs font-medium text-gray-700">점검으로도 못 고친 상품은?</p>
          <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-800">
            <input type="radio" checked={excludeUnfixed} onChange={() => setExcludeUnfixed(true)}
              className="w-3.5 h-3.5 accent-emerald-600" />
            등록에서 <b>제외</b>하고 사유를 알려주기 <span className="text-emerald-700">(권장)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-800">
            <input type="radio" checked={!excludeUnfixed} onChange={() => setExcludeUnfixed(false)}
              className="w-3.5 h-3.5 accent-[#E31837]" />
            경고만 남기고 <b>그대로 등록</b>
          </label>
        </div>
      )}
      {!audit && (
        <p className="text-xs text-[#E31837] leading-relaxed pl-7">
          점검을 끄면 생성 결과가 <b>아무 확인 없이</b> 그대로 올라갑니다.
        </p>
      )}
    </section>
  );

  // ── 무인 켜기: 차분한 설정 화면 ────────────────────────────────────────
  if (preArm) {
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50">
        <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl max-h-[92vh] flex flex-col border border-gray-300">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
            <h2 className="text-base font-bold text-gray-900">🤖 무인 자동등록 켜기</h2>
            <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-700 rounded" aria-label="닫기">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-5 py-4 overflow-y-auto space-y-4">
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
              <p className="text-sm text-gray-800 leading-relaxed">
                <b>소싱 폴더 선택 → 자동 생성</b>이 끝나면 검수 화면을 거치지 않고 그대로 쿠팡에 등록합니다.
                시작 직전 <b>10초</b> 동안 멈출 수 있고, 그 뒤로는 자동으로 진행됩니다.
              </p>
            </div>

            {auditSection}

            {/* 위험 설명은 없애지 않는다 — 접어 둘 뿐. */}
            <details className="rounded-lg border border-gray-200 group">
              <summary className="cursor-pointer select-none px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 rounded-lg">
                사람이 확인하지 않게 되는 것 {items.length}가지 — 펼쳐보기
              </summary>
              <div className="px-4 pb-3 space-y-3 border-t border-gray-100 pt-3">
                {items.map((it) => (
                  <div key={it.key}>
                    <h3 className="text-xs font-semibold text-gray-900">{it.title}</h3>
                    <p className="mt-0.5 text-[11px] text-gray-600 leading-relaxed">{it.body}</p>
                  </div>
                ))}
              </div>
            </details>

            {/* 동의는 한 번만 — 대신 무엇에 동의하는지는 한 문장에 다 담는다. */}
            <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-lg border border-[#E31837]/40 bg-red-50/50 p-3.5">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#E31837] shrink-0"
              />
              <span className="text-sm text-gray-900 leading-snug">
                지재권·옵션·인증·표시광고를 <b>사람이 확인하지 않은 채</b>, 내가 자리에 없는 동안
                자동으로 등록되는 데 동의합니다. 그로 인한 <b>책임은 판매자 본인</b>에게 있습니다.
              </span>
            </label>
          </div>

          <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900">
              취소
            </button>
            <button
              onClick={() => onConfirm({ audit, excludeUnfixed })}
              disabled={!ready}
              className="px-5 py-2 text-sm font-semibold text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
              title={ready ? '' : '동의 체크가 필요합니다.'}
            >
              무인 자동등록 켜기{audit ? ' (AI점검 포함)' : ''}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl max-h-[92vh] flex flex-col border-2 border-[#E31837]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-[#E31837]">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-white" />
            <h2 className="text-base font-bold text-white">검수 없이 바로 등록 — 위험 확인</h2>
          </div>
          <button onClick={onCancel} className="p-1 text-white/80 hover:text-white rounded" aria-label="닫기">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-4">
          {/* 무엇을 하는지 한 문장 */}
          <div className="rounded-lg bg-red-50 border border-[#E31837]/40 px-4 py-3">
            <p className="text-sm text-gray-900 leading-relaxed">
              카드별 검수·승인을 <b>모두 건너뛰고</b> 상품{' '}
              <b className="text-[#E31837]">{plan.count.toLocaleString()}개</b>를 쿠팡에 바로 등록합니다.
              평소 등록을 막던 경고도 이번만 <b>무시</b>합니다.
            </p>
            {plan.excluded > 0 && (
              <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                <Ban className="inline w-3.5 h-3.5 -mt-0.5 mr-0.5 text-gray-500" />
                <b>{plan.excluded}개</b>는 카테고리·판매가·대표이미지가 없어 이번에도 등록되지 않습니다
                (쿠팡이 거절하는 항목이라 검수를 포기해도 통과할 수 없습니다).
              </p>
            )}
          </div>

          {/* 건너뛰는 검수 목록 */}
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs font-semibold text-gray-700 mb-1.5">이번 등록에서 건너뛰는 확인</p>
            <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
              <li>카드별 승인 체크 — 전부 승인 처리</li>
              <li>필수옵션 직접 입력 차단 — 자동 기본값 그대로 전송
                {plan.unresolvedOptions > 0 && <b className="text-[#E31837]"> ({plan.unresolvedOptions}개 해당)</b>}
              </li>
              <li>&ldquo;검수필요&rdquo; 표시 무시
                {plan.needsReview > 0 && <b className="text-[#E31837]"> ({plan.needsReview}개 해당)</b>}
              </li>
              <li>지재권·옵션명 확인 게이트 — 이 창으로 대체</li>
            </ul>
          </div>

          {/* 사람 검수를 포기하는 대신 태울 기계 점검 */}
          {auditSection}

          {/* 위험 5종 */}
          {items.map((it) => (
            <section key={it.key} className="rounded-lg border border-gray-200 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-gray-900">{it.title}</h3>
              <p className="text-xs text-gray-600 leading-relaxed">{it.body}</p>
              <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={!!checked[it.key]}
                  onChange={(e) => setChecked((p) => ({ ...p, [it.key]: e.target.checked }))}
                  className="mt-0.5 w-4 h-4 accent-[#E31837] shrink-0"
                />
                <span className="text-sm text-gray-800 leading-snug">{it.label}</span>
              </label>
            </section>
          ))}

          {/* 최종 책임 */}
          <section className="rounded-lg border-2 border-[#E31837]/40 bg-red-50/60 p-4 space-y-3">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <AlertTriangle className="w-4 h-4 text-[#E31837] mt-0.5 shrink-0" />
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#E31837] shrink-0"
              />
              <span className="text-sm text-gray-900 leading-snug">
                검수를 건너뛴 등록으로 발생하는 <b>모든 법적·행정적·금전적 책임은 판매자 본인</b>에게 있으며,
                이 도구는 사용자의 지시대로 등록을 대행할 뿐임에 동의합니다.
              </span>
            </label>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                확인을 위해 <b className="text-[#E31837]">{CONFIRM_PHRASE}</b> 를 입력하세요
              </label>
              <input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder={CONFIRM_PHRASE}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none ${
                  phrase && !phraseOk ? 'border-[#E31837] bg-red-50' : 'border-gray-300 focus:border-gray-500'
                }`}
              />
            </div>
          </section>
        </div>

        {/* 푸터 — 강조는 안전한 쪽(취소)에 둔다 */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-800"
          >
            취소하고 검수하기 (권장)
          </button>
          <button
            onClick={() => onConfirm({ audit, excludeUnfixed })}
            disabled={!ready}
            className="px-5 py-2 text-sm font-semibold text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title={ready ? '' : '위험 항목 전체 체크 + 책임 동의 + 확인 문구 입력이 필요합니다.'}
          >
            위험을 감수하고 {plan.count.toLocaleString()}개 {audit ? 'AI점검 후 등록' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
}
