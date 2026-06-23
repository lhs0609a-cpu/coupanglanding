'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { CHANNEL_LABELS } from '@/lib/megaload/constants';
import type { Channel } from '@/lib/megaload/types';
import {
  AlertTriangle, RefreshCw, Loader2, CheckCircle2, ShieldCheck,
  Truck, Tag, Image as ImageIcon, FolderTree, Settings,
} from 'lucide-react';

interface Group { field: string; reason: string; count: number; channels: string[]; }
interface Item { productId: string; channel: string; productName: string; fields: string[]; reason: string; updatedAt: string | null; }
interface ExceptionData { total: number; groups: Group[]; items: Item[]; certLabels: string[]; }

// 누락필드 → 표시 라벨/아이콘/해결 안내
const FIELD_META: Record<string, { label: string; icon: typeof Truck; hint: string; settingsLink?: string }> = {
  ship_template: { label: '배송 설정 필요', icon: Truck, hint: '출고지·반품지·배송비', settingsLink: '/megaload/channels/automation' },
  as_info: { label: 'A/S 정보 필요', icon: Truck, hint: 'A/S 전화·안내', settingsLink: '/megaload/channels/automation' },
  cert_required: { label: '인증 확인 필요', icon: ShieldCheck, hint: '자격/인증 보유 확인' },
  category: { label: '카테고리 매핑 필요', icon: FolderTree, hint: '채널 카테고리 자동매핑 실패' },
  price_below_cost: { label: '가격(역마진)', icon: Tag, hint: '원가 미만 — 마진율 상향', settingsLink: '/megaload/channels/automation' },
  price_parity: { label: '가격(쿠팡 정합)', icon: Tag, hint: '쿠팡보다 저가 — 마진율 0 이상', settingsLink: '/megaload/channels/automation' },
  image: { label: '대표 이미지 없음', icon: ImageIcon, hint: '이미지 누락' },
  name: { label: '상품명 없음', icon: Tag, hint: '상품명 누락' },
  price: { label: '판매가 0', icon: Tag, hint: '판매가 없음' },
  channel_unsupported: { label: '미지원 채널', icon: AlertTriangle, hint: '자동등록 미지원' },
  channel_mapping: { label: '매핑 미구현', icon: AlertTriangle, hint: '채널 번역 미구현' },
};

function fieldMeta(field: string) {
  return FIELD_META[field] || { label: field, icon: AlertTriangle, hint: '' };
}

export default function ExceptionsPage() {
  const [data, setData] = useState<ExceptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/megaload/products/exceptions');
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const post = useCallback(async (body: Record<string, unknown>, key: string) => {
    setBusy(key); setMsg(null);
    const res = await fetch('/api/megaload/products/exceptions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const json = await res.json();
    setBusy(null);
    if (json.success) {
      setMsg(`${json.reset ?? 0}건 재시도 큐에 투입했습니다.${json.acknowledged ? ` ('${json.acknowledged}' 인증 확인됨)` : ''}`);
      fetchData();
    } else {
      setMsg(json.error || '처리 실패');
    }
  }, [fetchData]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-500" /> 예외큐 — 해결 필요
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            멀티채널 자동등록이 막힌 항목입니다. 필요한 값을 채우거나 확인하면 자동으로 다시 등록됩니다.
          </p>
        </div>
        <button onClick={fetchData} className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> 새로고침
        </button>
      </div>

      {msg && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-blue-50 text-blue-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {msg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : !data || data.total === 0 ? (
        <div className="text-center py-20">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">막힌 항목이 없습니다 🎉</p>
          <p className="text-gray-400 text-sm mt-1">쿠팡에 등록하면 연결된 채널로 자동 전파됩니다.</p>
        </div>
      ) : (
        <>
          {/* 누락필드별 그룹 — 일괄 해결 */}
          <div className="space-y-3 mb-8">
            {data.groups.map((g) => {
              const meta = fieldMeta(g.field);
              const Icon = meta.icon;
              const isCert = g.field === 'cert_required';
              return (
                <div key={g.field} className="border rounded-xl p-4 flex items-center justify-between gap-4 bg-white">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold flex items-center gap-2">
                        {meta.label}
                        <span className="text-xs font-normal text-white bg-amber-500 rounded-full px-2 py-0.5">{g.count}건</span>
                      </div>
                      <div className="text-sm text-gray-500 truncate">
                        {meta.hint} · {g.channels.map((c) => CHANNEL_LABELS[c as Channel] || c).join(', ')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {meta.settingsLink && (
                      <Link href={meta.settingsLink} className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">
                        <Settings className="w-4 h-4" /> 설정
                      </Link>
                    )}
                    {isCert ? (
                      data.certLabels.map((label) => (
                        <button key={label} disabled={busy !== null}
                          onClick={() => post({ action: 'ack_cert', label }, `ack:${label}`)}
                          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                          {busy === `ack:${label}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                          {label} 보유 확인
                        </button>
                      ))
                    ) : (
                      <button disabled={busy !== null}
                        onClick={() => post({ action: 'retry', field: g.field }, `retry:${g.field}`)}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-[#E31837] text-white hover:opacity-90 disabled:opacity-50">
                        {busy === `retry:${g.field}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        채운 뒤 전체 재시도
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 전체 재시도 */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700">개별 항목 ({data.total})</h2>
            <button disabled={busy !== null}
              onClick={() => post({ action: 'retry' }, 'retry:all')}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50">
              {busy === 'retry:all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              전체 재시도
            </button>
          </div>

          <div className="border rounded-xl overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">상품</th>
                  <th className="px-4 py-2 font-medium">채널</th>
                  <th className="px-4 py-2 font-medium">막힌 이유</th>
                </tr>
              </thead>
              <tbody>
                {data.items.slice(0, 300).map((it) => (
                  <tr key={`${it.productId}-${it.channel}`} className="border-t">
                    <td className="px-4 py-2 max-w-[220px] truncate">{it.productName}</td>
                    <td className="px-4 py-2">{CHANNEL_LABELS[it.channel as Channel] || it.channel}</td>
                    <td className="px-4 py-2 text-gray-500 max-w-[360px] truncate" title={it.reason}>{it.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
