'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, TrendingUp, Receipt, Users, ArrowLeft, ShieldCheck, Activity, Package, Megaphone, ShoppingBag, PlusCircle, Check } from 'lucide-react';

interface SellerRow { alias: string; qty: number; gmv: number; orders: number }
interface Settlement { year_month: string; gmv_confirmed: number; commission_amount: number; clawback_amount: number; net_amount: number; payment_status: string; paid_at: string | null }
interface ProdRow { id: string; name: string; status: string; notice: string | null; notice_at: string | null; stock: number; sellerCount: number; monthQty: number }
interface ActItem { type: 'listed' | 'sold'; at: string; product: string; seller: string; qty?: number; amount?: number }
interface Data {
  supplier: { commission_rate: number; commission_base: string; billing_status: string };
  thisMonth: { gmvAll: number; gmvConfirmed: number; qtyAll: number; estimatedCharge: number; pendingGmv: number; projectedCharge: number };
  sellers: SellerRow[];
  settlements: Settlement[];
  products: ProdRow[];
  activity: ActItem[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <Stat label="이번 달 판매 GMV (잠정)" value={`₩${tm.gmvAll.toLocaleString()}`} sub={`${tm.qtyAll}개`} />
        <Stat label="확정 GMV (반품불가)" value={`₩${tm.gmvConfirmed.toLocaleString()}`} sub={`잠정중 확정`} accent />
        <Stat label="확정 대기 (7일 경과 전)" value={`₩${tm.pendingGmv.toLocaleString()}`} />
        <Stat label="확정 예상 청구액" value={`₩${tm.estimatedCharge.toLocaleString()}`} sub="확정 GMV × 수수료율" accent />
        <Stat label="예상 정산 (대기 포함)" value={`₩${tm.projectedCharge.toLocaleString()}`} sub="잠정 전체 × 수수료율" />
      </div>

      {/* 실시간 활동 피드 */}
      <section className="border rounded-xl bg-white p-5 mb-6">
        <h2 className="font-semibold flex items-center gap-2 mb-3"><Activity className="w-4 h-4" /> 실시간 활동</h2>
        {d.activity.length === 0 ? (
          <p className="text-sm text-gray-400">아직 활동이 없습니다. 셀러가 상품을 등록하거나 판매가 발생하면 여기에 표시됩니다.</p>
        ) : (
          <ul className="space-y-2.5">
            {d.activity.map((a, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${a.type === 'sold' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-500'}`}>
                  {a.type === 'sold' ? <ShoppingBag className="w-3.5 h-3.5" /> : <PlusCircle className="w-3.5 h-3.5" />}
                </span>
                <span className="flex-1 min-w-0">
                  {a.type === 'sold' ? (
                    <><b className="text-emerald-600">판매</b> · {a.seller}가 <span className="text-gray-700">{a.product}</span> {a.qty}개 (₩{(a.amount || 0).toLocaleString()})</>
                  ) : (
                    <><b className="text-blue-500">등록</b> · {a.seller}가 <span className="text-gray-700">{a.product}</span> 올림</>
                  )}
                </span>
                <span className="text-xs text-gray-400 shrink-0">{timeAgo(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 상품별 성과 + 공지 */}
      <section className="border rounded-xl bg-white p-5 mb-6">
        <h2 className="font-semibold flex items-center gap-2 mb-3"><Package className="w-4 h-4" /> 상품별 성과 <span className="text-xs text-gray-400 font-normal">(판매 중인 셀러 · 이번 달 판매 · 공지)</span></h2>
        {d.products.length === 0 ? (
          <p className="text-sm text-gray-400">등록한 상품이 없습니다. <Link href="/supplier/products/new" className="text-[#E31837] underline">새 상품 등록</Link></p>
        ) : (
          <div className="space-y-2">
            {d.products.map((p) => (
              <ProductPerfRow key={p.id} p={p} onSaved={(notice, at) => setD((prev) => prev && ({
                ...prev, products: prev.products.map((x) => x.id === p.id ? { ...x, notice, notice_at: at } : x),
              }))} />
            ))}
          </div>
        )}
      </section>

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

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  approved: { text: '판매중', cls: 'bg-emerald-50 text-emerald-600' },
  pending: { text: '검수중', cls: 'bg-amber-50 text-amber-600' },
  rejected: { text: '반려', cls: 'bg-red-50 text-red-500' },
  draft: { text: '임시', cls: 'bg-gray-100 text-gray-500' },
  suspended: { text: '중지', cls: 'bg-gray-100 text-gray-500' },
  discontinued: { text: '단종', cls: 'bg-gray-100 text-gray-500' },
};

function ProductPerfRow({ p, onSaved }: { p: ProdRow; onSaved: (notice: string | null, at: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(p.notice || '');
  const [saving, setSaving] = useState(false);
  const st = STATUS_LABEL[p.status] || { text: p.status, cls: 'bg-gray-100 text-gray-500' };
  const lowStock = p.stock <= 10;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/supplier/products/${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notice: text.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        onSaved(data.product?.supplier_notice ?? null, data.product?.supplier_notice_at ?? null);
        setEditing(false);
      }
    } finally { setSaving(false); }
  };

  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${st.cls}`}>{st.text}</span>
            <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
            <span className="flex items-center gap-0.5"><Users className="w-3 h-3" /> {p.sellerCount}명 판매중</span>
            <span>이번 달 {p.monthQty}개</span>
            <span className={lowStock ? 'text-red-500 font-medium' : ''}>재고 {p.stock}{lowStock ? ' ⚠️' : ''}</span>
          </div>
        </div>
        <button onClick={() => { setEditing((v) => !v); setText(p.notice || ''); }}
          className="text-xs text-gray-500 hover:text-[#E31837] flex items-center gap-1 shrink-0">
          <Megaphone className="w-3.5 h-3.5" /> {p.notice ? '공지 수정' : '공지 달기'}
        </button>
      </div>

      {p.notice && !editing && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
          <Megaphone className="w-3 h-3 mt-0.5 shrink-0" /><span>{p.notice}</span>
        </div>
      )}

      {editing && (
        <div className="mt-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={200} rows={2}
            placeholder="셀러에게 보일 공지 (예: 다음 주 재고 보충 예정 / 12월 단종 예정). 비우고 저장하면 삭제됩니다."
            className="w-full border rounded-lg px-2.5 py-2 text-sm resize-none" />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-gray-400">{text.length}/200 · 이 상품을 파는 전 셀러에게 노출</span>
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="text-xs text-gray-400 px-2 py-1">취소</button>
              <button onClick={save} disabled={saving}
                className="text-xs font-bold text-white bg-[#E31837] rounded-lg px-3 py-1.5 flex items-center gap-1 disabled:opacity-50">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
