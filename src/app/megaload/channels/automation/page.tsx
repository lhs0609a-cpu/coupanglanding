'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { CHANNEL_LABELS } from '@/lib/megaload/constants';
import type { Channel } from '@/lib/megaload/types';
import { Loader2, Check, Truck, Zap, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

interface TemplateRow {
  channel: string;
  outbound_place_code?: string; return_center_code?: string;
  delivery_charge_type?: string; delivery_charge?: number; free_ship_over_amount?: number;
  return_charge?: number; exchange_charge?: number;
  after_service_tel?: string; after_service_guide?: string;
  origin_code?: string; origin_content?: string;
  is_complete?: boolean;
}

const FIELDS: { key: keyof TemplateRow; label: string; type: 'text' | 'number'; ph?: string; required?: boolean }[] = [
  { key: 'outbound_place_code', label: '출고지 코드', type: 'text', ph: '채널 주소록 코드', required: true },
  { key: 'return_center_code', label: '반품지 코드', type: 'text', ph: '채널 주소록 코드', required: true },
  { key: 'after_service_tel', label: 'A/S 전화', type: 'text', ph: '1600-0000', required: true },
  { key: 'after_service_guide', label: 'A/S 안내', type: 'text', ph: '평일 09~18시', required: true },
  { key: 'delivery_charge', label: '배송비', type: 'number', ph: '0' },
  { key: 'free_ship_over_amount', label: '무료배송 기준액', type: 'number', ph: '0' },
  { key: 'return_charge', label: '반품 배송비', type: 'number', ph: '0' },
  { key: 'exchange_charge', label: '교환 배송비', type: 'number', ph: '0' },
  { key: 'origin_code', label: '원산지 코드', type: 'text', ph: '선택' },
];

export default function AutomationPage() {
  const [enabled, setEnabled] = useState(false);
  const [targets, setTargets] = useState<Channel[]>([]);
  const [templates, setTemplates] = useState<Record<string, TemplateRow>>({});
  const [loading, setLoading] = useState(true);
  const [savingToggle, setSavingToggle] = useState(false);
  const [savingCh, setSavingCh] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [af, tpl] = await Promise.all([
      fetch('/api/megaload/channels/autofanout').then((r) => r.json()),
      fetch('/api/megaload/channels/shipping-template').then((r) => r.json()),
    ]);
    setEnabled(Boolean(af.enabled));
    setTargets(af.connectedTargets || []);
    const map: Record<string, TemplateRow> = {};
    for (const t of (tpl.templates || []) as TemplateRow[]) map[t.channel] = t;
    setTemplates(map);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggle = async () => {
    setSavingToggle(true);
    const next = !enabled;
    await fetch('/api/megaload/channels/autofanout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: next }),
    });
    setEnabled(next);
    setSavingToggle(false);
  };

  const setField = (channel: string, key: keyof TemplateRow, value: string) => {
    setTemplates((prev) => ({ ...prev, [channel]: { ...prev[channel], channel, [key]: value } }));
  };

  const saveTemplate = async (channel: string) => {
    setSavingCh(channel);
    const t = templates[channel] || { channel };
    const res = await fetch('/api/megaload/channels/shipping-template', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...t, channel }),
    });
    const json = await res.json();
    setTemplates((prev) => ({ ...prev, [channel]: { ...prev[channel], channel, is_complete: json.is_complete } }));
    setSavingCh(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-1">
        <Zap className="w-6 h-6 text-[#E31837]" /> 자동전파 설정
      </h1>
      <p className="text-gray-500 text-sm mb-6">
        켜면 쿠팡에 등록한 상품이 연결된 채널로 <b>자동 전파</b>됩니다. 채널별 배송 설정이 채워져야 등록이 통과됩니다.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <>
          {/* 마스터 토글 */}
          <div className="border rounded-xl p-5 flex items-center justify-between mb-6 bg-white">
            <div>
              <div className="font-semibold">쿠팡 → 전 채널 자동전파</div>
              <div className="text-sm text-gray-500 mt-0.5">
                {enabled ? '켜짐 — 쿠팡 등록 시 자동으로 다른 채널에 등록됩니다.' : '꺼짐 — 쿠팡에만 등록됩니다.'}
              </div>
            </div>
            <button onClick={toggle} disabled={savingToggle}
              className={`relative w-14 h-8 rounded-full transition-colors ${enabled ? 'bg-[#E31837]' : 'bg-gray-300'}`}>
              <span className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : ''}`} />
              {savingToggle && <Loader2 className="w-4 h-4 animate-spin text-white absolute top-2 left-2" />}
            </button>
          </div>

          {/* 채널별 배송 템플릿 */}
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Truck className="w-4 h-4" /> 채널별 배송/반품/AS 설정</h2>
          {targets.length === 0 ? (
            <div className="border rounded-xl p-5 text-sm text-gray-500 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              연결된 대상 채널이 없습니다. <Link href="/megaload/channels" className="text-[#E31837] underline">채널 연동</Link> 먼저 해주세요.
            </div>
          ) : (
            <div className="space-y-2">
              {targets.map((ch) => {
                const t = templates[ch] || { channel: ch };
                const isOpen = open === ch;
                return (
                  <div key={ch} className="border rounded-xl bg-white overflow-hidden">
                    <button onClick={() => setOpen(isOpen ? null : ch)} className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                      <div className="flex items-center gap-2 font-medium">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        {CHANNEL_LABELS[ch] || ch}
                      </div>
                      {t.is_complete
                        ? <span className="flex items-center gap-1 text-xs text-green-600"><Check className="w-3.5 h-3.5" /> 설정 완료</span>
                        : <span className="text-xs text-amber-600">미완성 (필수값 필요)</span>}
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 pt-1 border-t">
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          {FIELDS.map((f) => (
                            <label key={String(f.key)} className="text-sm">
                              <span className="block text-gray-500 mb-1">{f.label}{f.required && <span className="text-[#E31837]"> *</span>}</span>
                              <input
                                type={f.type}
                                value={(t[f.key] as string | number | undefined) ?? ''}
                                placeholder={f.ph}
                                onChange={(e) => setField(ch, f.key, e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31837]/30"
                              />
                            </label>
                          ))}
                        </div>
                        <button onClick={() => saveTemplate(ch)} disabled={savingCh === ch}
                          className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-[#E31837] text-white hover:opacity-90 disabled:opacity-50">
                          {savingCh === ch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} 저장
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
