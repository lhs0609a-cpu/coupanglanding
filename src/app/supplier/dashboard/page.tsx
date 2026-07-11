'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, TrendingUp, Receipt, Users, ArrowLeft, ShieldCheck } from 'lucide-react';

interface SellerRow { alias: string; qty: number; gmv: number; orders: number }
interface Settlement { year_month: string; gmv_confirmed: number; commission_amount: number; clawback_amount: number; net_amount: number; payment_status: string; paid_at: string | null }
interface Data {
  supplier: { commission_rate: number; commission_base: string; billing_status: string };
  thisMonth: { gmvAll: number; gmvConfirmed: number; qtyAll: number; estimatedCharge: number; pendingGmv: number };
  sellers: SellerRow[];
  settlements: Settlement[];
}

const PAY_LABEL: Record<string, string> = { pending: '대기', awaiting_payment: '청구예정', paid: '결제완료', failed: '실패', skipped: '없음' };

export default function SupplierDashboardPage() {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/supplier/dashboard').then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || '조회 실패');
      setD(j);
    }).catch((e) => setErr(e instanceof Error ? e.message : '조회 실패')).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;
  if (err || !d) return <div className="max-w-3xl mx-auto px-4 py-10 text-center text-sm text-gray-500">{err || '데이터 없음'} <div className="mt-4"><Link href="/supplier" className="text-[#E31837] underline">공급사 센터로</Link></div></div>;

  const tm = d.thisMonth;
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href="/supplier" className="text-sm text-gray-400 flex items-center gap-1 mb-3"><ArrowLeft className="w-4 h-4" /> 공급사 센터</Link>
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-1"><TrendingUp className="w-6 h-6 text-[#E31837]" /> 판매·정산 현황</h1>
      <p className="text-gray-500 text-sm mb-6">수수료율 {d.supplier.commission_rate}% ({d.supplier.commission_base === 'supply' ? '공급가' : '판매가'} 기준) · 청구는 <b>반품불가 확정분</b>만.</p>

      {/* 이번 달 요약 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Stat label="이번 달 판매 GMV (잠정)" value={`₩${tm.gmvAll.toLocaleString()}`} sub={`${tm.qtyAll}개`} />
        <Stat label="확정 GMV (반품불가)" value={`₩${tm.gmvConfirmed.toLocaleString()}`} sub={`잠정중 확정`} accent />
        <Stat label="확정 대기 (7일 경과 전)" value={`₩${tm.pendingGmv.toLocaleString()}`} />
        <Stat label="예상 청구액" value={`₩${tm.estimatedCharge.toLocaleString()}`} sub="확정 GMV × 수수료율" accent />
      </div>

      {/* 셀러별 실적 (익명) */}
      <section className="border rounded-xl bg-white p-5 mb-6">
        <h2 className="font-semibold flex items-center gap-2 mb-3"><Users className="w-4 h-4" /> 셀러별 실적 <span className="text-xs text-gray-400 font-normal">(이번 달 · 익명)</span></h2>
        {d.sellers.length === 0 ? (
          <p className="text-sm text-gray-400">아직 판매 내역이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 text-xs border-b">
                <th className="py-2">셀러</th><th className="py-2 text-right">판매수량</th><th className="py-2 text-right">주문건</th><th className="py-2 text-right">GMV</th>
              </tr></thead>
              <tbody>
                {d.sellers.map((s) => (
                  <tr key={s.alias} className="border-b last:border-0">
                    <td className="py-2 font-medium text-gray-700">{s.alias}</td>
                    <td className="py-2 text-right">{s.qty.toLocaleString()}개</td>
                    <td className="py-2 text-right text-gray-500">{s.orders}</td>
                    <td className="py-2 text-right font-medium">₩{s.gmv.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 정산 이력 */}
      <section className="border rounded-xl bg-white p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-3"><Receipt className="w-4 h-4" /> 정산 이력</h2>
        {d.settlements.length === 0 ? (
          <p className="text-sm text-gray-400">정산 이력이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 text-xs border-b">
                <th className="py-2">월</th><th className="py-2 text-right">확정 GMV</th><th className="py-2 text-right">수수료</th><th className="py-2 text-right">반품차감</th><th className="py-2 text-right">청구액</th><th className="py-2 text-right">상태</th>
              </tr></thead>
              <tbody>
                {d.settlements.map((s) => (
                  <tr key={s.year_month} className="border-b last:border-0">
                    <td className="py-2 font-medium">{s.year_month}</td>
                    <td className="py-2 text-right">₩{s.gmv_confirmed.toLocaleString()}</td>
                    <td className="py-2 text-right">₩{s.commission_amount.toLocaleString()}</td>
                    <td className="py-2 text-right text-gray-500">{s.clawback_amount > 0 ? `-₩${s.clawback_amount.toLocaleString()}` : '-'}</td>
                    <td className="py-2 text-right font-bold">₩{s.net_amount.toLocaleString()}</td>
                    <td className="py-2 text-right">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${s.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-600' : s.payment_status === 'failed' ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500'}`}>
                        {s.payment_status === 'paid' && <ShieldCheck className="w-3 h-3" />}{PAY_LABEL[s.payment_status] || s.payment_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? 'bg-[#E31837]/5 border-[#E31837]/20' : 'bg-white'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${accent ? 'text-[#E31837]' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
