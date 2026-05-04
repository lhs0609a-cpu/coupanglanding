'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CHANNELS, CHANNEL_LABELS, CHANNEL_BG_COLORS, CHANNEL_COMMISSION_RATES } from '@/lib/megaload/constants';
import { isChannelSupported } from '@/lib/megaload/types';
import type { Channel } from '@/lib/megaload/types';
import { Check, Loader2, AlertTriangle, CheckCircle2, XCircle, RotateCcw, Clock } from 'lucide-react';

interface ChannelResult {
  success: boolean;
  channelProductId?: string;
  error?: string;
}

export default function ProductRegisterPage() {
  const supabase = useMemo(() => createClient(), []);

  // 등록 가능 채널 (쿠팡은 소스, 토스/카카오는 준비 중)
  const availableChannels = useMemo(
    () => CHANNELS.filter((c) => c !== 'coupang' && isChannelSupported(c)),
    [],
  );

  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(availableChannels);
  const [margins, setMargins] = useState<Record<string, number>>({});
  const [marginsLoaded, setMarginsLoaded] = useState(false);

  const [registering, setRegistering] = useState(false);
  const [retryingChannels, setRetryingChannels] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, ChannelResult>>({});
  const [error, setError] = useState<string | null>(null);

  // ── 저장된 마진 로드 ──
  //   try/catch/finally — supabase 호출 throw 시에도 marginsLoaded=true 보장.
  //   누락 시 등록 버튼이 영원히 비활성화되는 문제 방지.
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { data } = await supabase
          .from('sh_channel_margin_settings')
          .select('channel, margin_percent')
          .eq('is_enabled', true);
        const initial: Record<string, number> = {};
        for (const ch of availableChannels) initial[ch] = 0;
        for (const row of (data || []) as Array<Record<string, unknown>>) {
          initial[row.channel as string] = Number(row.margin_percent) || 0;
        }
        setMargins(initial);
      } catch (err) {
        console.warn('[register] 저장된 마진 로드 실패 — 0 으로 시작:', err);
      } finally {
        setMarginsLoaded(true);
      }
    })();
  }, [supabase, availableChannels]);

  const toggleChannel = (channel: Channel) => {
    setSelectedChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );
  };

  const updateMargin = (ch: string, value: number) => {
    setMargins((prev) => ({ ...prev, [ch]: value }));
  };

  // ── 마진 저장 ──
  const persistMargins = useCallback(async (channels: Channel[]) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: shUser } = await supabase
      .from('megaload_users')
      .select('id')
      .eq('profile_id', session.user.id)
      .single();
    if (!shUser) return;
    const rows = channels.map((ch) => ({
      megaload_user_id: (shUser as Record<string, unknown>).id as string,
      channel: ch,
      margin_percent: margins[ch] ?? 0,
      is_enabled: true,
    }));
    if (rows.length > 0) {
      await supabase
        .from('sh_channel_margin_settings')
        .upsert(rows, { onConflict: 'megaload_user_id,channel' });
    }
  }, [supabase, margins]);

  // ── 등록 실행 ──
  const executeRegister = useCallback(async (channels: Channel[], isRetry: boolean) => {
    const productId = new URLSearchParams(window.location.search).get('productId');
    if (!productId) {
      setError('상품 ID가 없습니다.');
      return;
    }

    if (!isRetry) setRegistering(true);
    setError(null);

    try {
      // 마진 저장 (재사용 목적)
      await persistMargins(channels);

      // /register 라우트는 margins 가 있으면 우선 적용, 없으면 priceMode/prices 사용.
      const res = await fetch(`/api/megaload/products/${productId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channels,
          margins: Object.fromEntries(channels.map((c) => [c, margins[c] ?? 0])),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResults((prev) => ({ ...prev, ...(data.results as Record<string, ChannelResult>) }));
      } else {
        const err = await res.json();
        setError(err.error || '등록 실패');
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      if (!isRetry) setRegistering(false);
    }
  }, [margins, persistMargins]);

  const retryChannel = useCallback(async (channel: Channel) => {
    setRetryingChannels((prev) => new Set(prev).add(channel));
    await executeRegister([channel], true);
    setRetryingChannels((prev) => {
      const next = new Set(prev);
      next.delete(channel);
      return next;
    });
  }, [executeRegister]);

  const hasResults = Object.keys(results).length > 0;
  const successCount = Object.values(results).filter((r) => r.success).length;
  const failedCount = Object.values(results).filter((r) => !r.success).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">채널 등록 설정</h1>
        <p className="text-sm text-gray-500 mt-1">
          상품을 등록할 채널을 선택하고 채널별 마진율을 설정하세요
        </p>
      </div>

      {/* 채널 선택 + 마진 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">등록 채널 및 마진율</h2>
          <button
            type="button"
            onClick={() => setSelectedChannels(availableChannels)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            전체 선택
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-3">
          기준 가격은 쿠팡 판매가이며, 입력한 마진율(%)만큼 가산되어 등록됩니다.
        </p>

        <div className="space-y-2">
          {availableChannels.map((ch) => {
            const checked = selectedChannels.includes(ch);
            return (
              <label
                key={ch}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition ${
                  checked ? 'border-[#E31837] bg-red-50/40' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleChannel(ch)}
                  className="w-4 h-4 rounded border-gray-300 text-[#E31837] focus:ring-[#E31837]"
                />
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: CHANNEL_BG_COLORS[ch] }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-900">{CHANNEL_LABELS[ch]}</div>
                  <div className="text-xs text-gray-500">
                    기본 수수료율 약 {CHANNEL_COMMISSION_RATES[ch]}%
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.1"
                    value={margins[ch] ?? 0}
                    disabled={!checked || !marginsLoaded}
                    onChange={(e) => updateMargin(ch, Number(e.target.value) || 0)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-20 px-2 py-1 text-sm text-right border border-gray-300 rounded-md focus:ring-1 focus:ring-[#E31837] focus:border-[#E31837] disabled:bg-gray-100 disabled:text-gray-400"
                  />
                  <span className="text-xs text-gray-500 font-medium">%</span>
                </div>
                {checked && <Check className="w-4 h-4 text-[#E31837]" />}
              </label>
            );
          })}
        </div>

        {/* 준비 중 채널 */}
        <div className="mt-4 border-t border-gray-100 pt-4">
          <div className="text-xs text-gray-500 mb-2">준비 중인 채널</div>
          <div className="space-y-2">
            {['toss', 'kakao'].map((ch) => (
              <div
                key={ch}
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 opacity-60"
              >
                <div className="w-4 h-4" />
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: CHANNEL_BG_COLORS[ch as Channel] }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-700">{CHANNEL_LABELS[ch as Channel]}</div>
                  <div className="text-xs text-gray-500">공식 셀러 API 공개 후 지원</div>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-yellow-100 text-yellow-800">
                  <Clock className="w-3 h-3" />
                  준비 중
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 오류 메시지 */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 leading-snug">{error}</p>
        </div>
      )}

      {/* 등록 결과 */}
      {hasResults && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">등록 결과</h2>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-green-600 font-medium">성공 {successCount}</span>
              <span className="text-red-600 font-medium">실패 {failedCount}</span>
            </div>
          </div>

          <div className="space-y-2">
            {Object.entries(results).map(([ch, result]) => {
              const retrying = retryingChannels.has(ch);
              return (
                <div
                  key={ch}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                    result.success
                      ? 'border-green-200 bg-green-50/40'
                      : 'border-red-200 bg-red-50/40'
                  }`}
                >
                  {result.success ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  )}
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: CHANNEL_BG_COLORS[ch as Channel] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">
                      {CHANNEL_LABELS[ch as Channel]}
                    </div>
                    {result.success ? (
                      <div className="text-xs text-gray-500 truncate">
                        상품번호: {result.channelProductId}
                      </div>
                    ) : (
                      <div className="text-xs text-red-600 leading-snug">
                        {result.error}
                      </div>
                    )}
                  </div>
                  {!result.success && (
                    <button
                      type="button"
                      onClick={() => retryChannel(ch as Channel)}
                      disabled={retrying}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                    >
                      {retrying ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      재시도
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 실행 */}
      <div className="flex justify-end">
        <button
          onClick={() => executeRegister(selectedChannels, false)}
          disabled={registering || selectedChannels.length === 0 || !marginsLoaded}
          className="flex items-center gap-2 px-6 py-3 text-white bg-[#E31837] rounded-lg font-medium hover:bg-red-700 transition disabled:opacity-50"
        >
          {registering && <Loader2 className="w-4 h-4 animate-spin" />}
          {selectedChannels.length}개 채널에 등록
        </button>
      </div>
    </div>
  );
}
