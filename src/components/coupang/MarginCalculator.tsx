'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

/**
 * 쿠팡 마진 계산기 (클라이언트)
 *
 * ── 왜 만드는가 ──
 * "마진율계산기" 월 3,030 · "마진계산기" 월 2,040 인데 둘 다 경쟁이 낮다. 그리고 우리는
 * 쿠팡 카테고리 16,259개의 **실제 판매수수료율**을 가진 거의 유일한 곳이다.
 * 일반 마진계산기는 수수료율을 사용자가 알아서 넣어야 하는데, 그 값을 모르는 게 진짜 문제다.
 *
 * ── 지어내지 않는다 ──
 * · 판매수수료율 = coupang-cat-details.json 실데이터 (카테고리별 4~10.9%)
 * · 결제수수료 기본 2.9% = channel-onboarding-guides.ts 의 쿠팡 정산 요약 ("약 2.9%")
 * · 로켓그로스 12.9% = ad-tips.ts ("로켓그로스 수수료(약 12.9%)")
 * 셋 다 "약" 값이라 전부 사용자가 고칠 수 있게 입력 필드로 둔다. 화면에도 근사값임을 적는다.
 */

export interface PickerCategory {
  id: string;
  name: string;
  rate: number;
  topLevel: string;
}

interface Props {
  categories: PickerCategory[];
  /** 카테고리 문서에서 넘어온 경우 — 그 카테고리로 미리 채운다 */
  initial?: { id: string; name: string; path: string; rate: number } | null;
}

/** 쿠팡 정산 요약의 근사값. 사용자가 고칠 수 있다 */
const DEFAULT_PAYMENT_FEE = 2.9;
/** ad-tips.ts 기준 근사값 */
const DEFAULT_ROCKET_FEE = 12.9;

function won(n: number): string {
  return `${Math.round(n).toLocaleString()}원`;
}

/** 빈 문자열을 0으로 만들지 않기 위해 숫자 입력을 문자열로 들고 있는다 */
function num(v: string): number {
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export default function MarginCalculator({ categories, initial }: Props) {
  const [price, setPrice] = useState('20000');
  const [cost, setCost] = useState('10000');
  const [shipping, setShipping] = useState('3000');
  const [etc, setEtc] = useState('0');

  const [commission, setCommission] = useState(String(initial?.rate ?? 10.8));
  const [paymentFee, setPaymentFee] = useState(String(DEFAULT_PAYMENT_FEE));
  const [useRocket, setUseRocket] = useState(false);
  const [rocketFee, setRocketFee] = useState(String(DEFAULT_ROCKET_FEE));

  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string>(initial ? `${initial.name} (${initial.path})` : '');

  const matches = useMemo(() => {
    const q = query.trim();
    if (q.length < 1) return [];
    return categories.filter((c) => c.name.includes(q)).slice(0, 20);
  }, [categories, query]);

  const r = useMemo(() => {
    const p = num(price);
    const commissionAmt = (p * num(commission)) / 100;
    const paymentAmt = (p * num(paymentFee)) / 100;
    const rocketAmt = useRocket ? (p * num(rocketFee)) / 100 : 0;
    const settled = p - commissionAmt - paymentAmt - rocketAmt;
    const spend = num(cost) + num(shipping) + num(etc);
    const profit = settled - spend;
    return {
      price: p,
      commissionAmt,
      paymentAmt,
      rocketAmt,
      settled,
      spend,
      profit,
      // 마진율은 판매가 대비 순이익 — 업계에서 이 정의를 가장 많이 쓴다
      marginRate: p > 0 ? (profit / p) * 100 : 0,
      // 원가 대비 수익률도 같이 보여준다. 사입 판단에는 이쪽이 더 유용하다
      returnOnCost: spend > 0 ? (profit / spend) * 100 : 0,
      // 순이익 0이 되는 판매가 — 수수료가 판매가에 비례하므로 역산이 된다
      breakEven: (() => {
        const feeRate = (num(commission) + num(paymentFee) + (useRocket ? num(rocketFee) : 0)) / 100;
        if (feeRate >= 1) return null;
        return spend / (1 - feeRate);
      })(),
    };
  }, [price, cost, shipping, etc, commission, paymentFee, useRocket, rocketFee]);

  const positive = r.profit > 0;

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* ── 입력 ── */}
      <div className="rounded-2xl border border-gray-200 p-5 sm:p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4">1. 카테고리 — 수수료율을 자동으로 채웁니다</h2>

        <label className="block text-xs font-semibold text-gray-600 mb-1.5" htmlFor="cat-search">
          카테고리 검색
        </label>
        <input
          id="cat-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="예: 소파, 텀블러, 운동화"
          className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:border-[#E31837] focus:outline-none"
        />
        {picked && (
          <p className="mt-2 text-xs text-gray-600">
            선택됨: <strong className="text-gray-900">{picked}</strong> · 판매수수료{' '}
            <strong className="text-[#E31837]">{commission}%</strong>
          </p>
        )}
        {matches.length > 0 && (
          <ul className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
            {matches.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setCommission(String(c.rate));
                    setPicked(`${c.name} (${c.topLevel})`);
                    setQuery('');
                  }}
                  className="w-full text-left px-3.5 py-2 text-sm hover:bg-gray-50 flex justify-between gap-3"
                >
                  <span className="text-gray-800">
                    {c.name} <span className="text-gray-400">· {c.topLevel}</span>
                  </span>
                  <span className="text-[#E31837] font-semibold shrink-0">{c.rate}%</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-gray-400">
          중분류 {categories.length}개에서 찾습니다. 더 세분화된 카테고리는{' '}
          <Link href="/coupang/category" className="text-[#E31837] hover:underline">
            전체 목록
          </Link>
          에서 열어 &ldquo;이 카테고리로 계산&rdquo;을 누르세요.
        </p>

        <h2 className="text-base font-bold text-gray-900 mt-7 mb-4">2. 금액</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: '판매가', v: price, set: setPrice, hint: '고객이 내는 돈' },
            { label: '매입가(원가)', v: cost, set: setCost, hint: '도매가' },
            { label: '배송비', v: shipping, set: setShipping, hint: '내가 부담하는 금액' },
            { label: '기타비', v: etc, set: setEtc, hint: '포장·부자재 등' },
          ].map((f) => (
            <div key={f.label}>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{f.label}</label>
              <input
                type="text"
                inputMode="numeric"
                value={f.v}
                onChange={(e) => f.set(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:border-[#E31837] focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-gray-400">{f.hint}</p>
            </div>
          ))}
        </div>

        <h2 className="text-base font-bold text-gray-900 mt-7 mb-1">3. 수수료율</h2>
        <p className="text-xs text-gray-500 mb-4">
          판매수수료는 카테고리 실데이터입니다. 나머지는 근사값이라 직접 고치실 수 있습니다.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">판매수수료 (%)</label>
            <input
              type="text"
              inputMode="decimal"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:border-[#E31837] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">결제수수료 (%)</label>
            <input
              type="text"
              inputMode="decimal"
              value={paymentFee}
              onChange={(e) => setPaymentFee(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:border-[#E31837] focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-gray-400">쿠팡 기준 약 2.9%</p>
          </div>
        </div>

        <label className="mt-4 flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={useRocket}
            onChange={(e) => setUseRocket(e.target.checked)}
            className="w-4 h-4 accent-[#E31837]"
          />
          <span className="text-sm text-gray-700">로켓그로스 수수료 포함</span>
        </label>
        {useRocket && (
          <div className="mt-2.5">
            <input
              type="text"
              inputMode="decimal"
              value={rocketFee}
              onChange={(e) => setRocketFee(e.target.value)}
              className="w-40 rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:border-[#E31837] focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-gray-400">
              약 12.9%. 상품 크기·무게에 따라 달라집니다.
            </p>
          </div>
        )}
      </div>

      {/* ── 결과 ── */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 sm:p-6 lg:sticky lg:top-6 h-fit">
        <h2 className="text-base font-bold text-gray-900 mb-4">계산 결과</h2>

        <div
          className={`rounded-xl p-4 mb-4 ${positive ? 'bg-white border border-gray-200' : 'bg-red-50 border border-red-200'}`}
        >
          <div className="text-xs font-semibold text-gray-500 mb-1">개당 순이익</div>
          <div className={`text-3xl font-extrabold ${positive ? 'text-gray-900' : 'text-red-600'}`}>
            {won(r.profit)}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <span className="text-gray-600">
              마진율 <strong className={positive ? 'text-gray-900' : 'text-red-600'}>{r.marginRate.toFixed(1)}%</strong>
              <span className="text-gray-400"> (판매가 대비)</span>
            </span>
            <span className="text-gray-600">
              원가 대비{' '}
              <strong className={positive ? 'text-gray-900' : 'text-red-600'}>
                {r.returnOnCost.toFixed(1)}%
              </strong>
            </span>
          </div>
        </div>

        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="py-1.5 text-gray-600">판매가</td>
              <td className="py-1.5 text-right font-semibold text-gray-900">{won(r.price)}</td>
            </tr>
            <tr>
              <td className="py-1.5 text-gray-600">판매수수료 ({commission}%)</td>
              <td className="py-1.5 text-right text-[#E31837]">−{won(r.commissionAmt)}</td>
            </tr>
            <tr>
              <td className="py-1.5 text-gray-600">결제수수료 ({paymentFee}%)</td>
              <td className="py-1.5 text-right text-[#E31837]">−{won(r.paymentAmt)}</td>
            </tr>
            {useRocket && (
              <tr>
                <td className="py-1.5 text-gray-600">로켓그로스 ({rocketFee}%)</td>
                <td className="py-1.5 text-right text-[#E31837]">−{won(r.rocketAmt)}</td>
              </tr>
            )}
            <tr className="border-t border-gray-300">
              <td className="py-1.5 font-semibold text-gray-900">정산 예상액</td>
              <td className="py-1.5 text-right font-bold text-gray-900">{won(r.settled)}</td>
            </tr>
            <tr>
              <td className="py-1.5 text-gray-600">매입가 + 배송비 + 기타비</td>
              <td className="py-1.5 text-right text-[#E31837]">−{won(r.spend)}</td>
            </tr>
            <tr className="border-t border-gray-300">
              <td className="py-2 font-bold text-gray-900">순이익</td>
              <td className={`py-2 text-right font-extrabold ${positive ? 'text-gray-900' : 'text-red-600'}`}>
                {won(r.profit)}
              </td>
            </tr>
          </tbody>
        </table>

        {r.breakEven !== null && (
          <div className="mt-4 rounded-xl bg-white border border-gray-200 p-3.5">
            <div className="text-xs font-semibold text-gray-500 mb-0.5">손익분기 판매가</div>
            <div className="text-lg font-bold text-gray-900">{won(r.breakEven)}</div>
            <p className="mt-1 text-[11px] text-gray-500">
              이 금액 아래로 팔면 손해입니다. 수수료가 판매가에 비례해 붙기 때문에, 가격을 내릴수록
              수수료도 같이 줄지만 원가는 그대로라 역전 지점이 생깁니다.
            </p>
          </div>
        )}

        <p className="mt-4 text-[11px] text-gray-500 leading-relaxed">
          판매수수료는 카테고리별 실데이터이고, 결제수수료·로켓그로스 수수료는 공개된 근사값입니다.
          반품·쿠폰·광고비는 계산에 넣지 않았습니다. 실제 정산액은 쿠팡 윙의 정산 내역이 기준입니다.
        </p>
      </div>
    </div>
  );
}
