'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Megaphone, Save, Loader2, CheckCircle2, XCircle,
  TrendingUp, TrendingDown, Minus, Info,
} from 'lucide-react';

type Mode = 'dryrun' | 'approval' | 'auto';

interface AdRule {
  id?: string;
  enabled: boolean;
  mode: Mode;
  target_roas: number;
  roas_tolerance_pct: number;
  min_bid: number;
  max_bid: number;
  step_pct: number;
  daily_max_change_pct: number;
  lookback_days: number;
  pause_on_zero_conv: boolean;
  zero_conv_min_clicks: number;
  zero_conv_min_spend: number;
}

interface BidChange {
  id: string;
  campaign_name: string | null;
  keyword: string | null;
  before_bid: number | null;
  after_bid: number | null;
  measured_roas: number | null;
  reason: string | null;
  status: 'proposed' | 'approved' | 'applied' | 'rejected' | 'failed' | 'skipped';
  created_at: string;
}

const DEFAULT_RULE: AdRule = {
  enabled: false,
  mode: 'dryrun',
  target_roas: 300,
  roas_tolerance_pct: 15,
  min_bid: 100,
  max_bid: 2000,
  step_pct: 10,
  daily_max_change_pct: 30,
  lookback_days: 7,
  pause_on_zero_conv: true,
  zero_conv_min_clicks: 30,
  zero_conv_min_spend: 10000,
};

const MODE_INFO: Record<Mode, { label: string; desc: string; cls: string }> = {
  dryrun:   { label: '드라이런', desc: '실제 변경 없이 “이렇게 바꿀 예정”만 기록 (안전, 신뢰 확인용)', cls: 'bg-gray-100 text-gray-700' },
  approval: { label: '승인 후 적용', desc: '변경안을 띄우고 내가 ✔ 누른 것만 적용', cls: 'bg-amber-100 text-amber-800' },
  auto:     { label: '완전 자동', desc: '규칙대로 즉시 자동 적용 (한도 안에서)', cls: 'bg-rose-100 text-rose-700' },
};

const STATUS_BADGE: Record<BidChange['status'], { label: string; cls: string }> = {
  proposed: { label: '제안됨', cls: 'bg-sky-100 text-sky-700' },
  approved: { label: '승인(적용대기)', cls: 'bg-indigo-100 text-indigo-700' },
  applied:  { label: '적용완료', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '거절', cls: 'bg-gray-100 text-gray-500' },
  failed:   { label: '실패', cls: 'bg-rose-100 text-rose-700' },
  skipped:  { label: '스킵(한도)', cls: 'bg-gray-100 text-gray-500' },
};

export default function AdsAutomationPage() {
  const supabase = createClient();
  const [muId, setMuId] = useState<string | null>(null);
  const [rule, setRule] = useState<AdRule>(DEFAULT_RULE);
  const [changes, setChanges] = useState<BidChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: mu } = await supabase
        .from('megaload_users').select('id').eq('profile_id', user.id).single();
      if (!mu) return;
      setMuId(mu.id as string);

      const { data: r } = await supabase
        .from('megaload_ad_rules')
        .select('*')
        .eq('megaload_user_id', mu.id)
        .eq('scope_type', 'account')
        .maybeSingle();
      if (r) setRule({ ...DEFAULT_RULE, ...(r as Partial<AdRule>) });

      const { data: c } = await supabase
        .from('megaload_ad_bid_changes')
        .select('id, campaign_name, keyword, before_bid, after_bid, measured_roas, reason, status, created_at')
        .eq('megaload_user_id', mu.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (c) setChanges(c as BidChange[]);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    if (!muId) return;
    setSaving(true);
    try {
      const payload = {
        megaload_user_id: muId,
        scope_type: 'account',
        scope_id: null,
        enabled: rule.enabled,
        mode: rule.mode,
        target_roas: rule.target_roas,
        roas_tolerance_pct: rule.roas_tolerance_pct,
        min_bid: rule.min_bid,
        max_bid: rule.max_bid,
        step_pct: rule.step_pct,
        daily_max_change_pct: rule.daily_max_change_pct,
        lookback_days: rule.lookback_days,
        pause_on_zero_conv: rule.pause_on_zero_conv,
        zero_conv_min_clicks: rule.zero_conv_min_clicks,
        zero_conv_min_spend: rule.zero_conv_min_spend,
        updated_at: new Date().toISOString(),
      };
      // scope_id 가 NULL이라 onConflict upsert가 불안정 → 수동 update/insert
      if (rule.id) {
        await supabase.from('megaload_ad_rules').update(payload).eq('id', rule.id);
      } else {
        const { data } = await supabase.from('megaload_ad_rules').insert(payload).select('id').single();
        if (data) setRule((p) => ({ ...p, id: data.id as string }));
      }
      setSavedAt(Date.now());
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  }, [muId, rule, supabase]);

  const decide = useCallback(async (id: string, approve: boolean) => {
    await supabase
      .from('megaload_ad_bid_changes')
      .update({ status: approve ? 'approved' : 'rejected', decided_at: new Date().toISOString() })
      .eq('id', id);
    setChanges((prev) => prev.map((c) => c.id === id ? { ...c, status: approve ? 'approved' : 'rejected' } : c));
  }, [supabase]);

  const num = (key: keyof AdRule) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setRule((p) => ({ ...p, [key]: Number(e.target.value) }));

  if (loading) {
    return <div className="p-8 text-gray-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />불러오는 중...</div>;
  }

  return (
    <div className="max-w-3xl space-y-6 p-1">
      {/* 헤더 */}
      <div className="flex items-start gap-3">
        <div className="p-2 bg-rose-50 rounded-lg"><Megaphone className="w-5 h-5 text-[#E31837]" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">광고 자동화</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            쿠팡 애즈는 입찰 관리 API가 없어, 로컬 워커가 윙 광고화면을 직접 조작해 목표 ROAS에 맞춰 입찰가를 자동 조정합니다.
          </p>
        </div>
      </div>

      {/* P2/P3 안내 배너 */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 leading-relaxed">
          <b>준비 단계:</b> 지금은 규칙 설정과 변경이력 화면이 동작합니다. 실제 <b>성과 수집·입찰 적용</b>은
          워커 연동(다음 단계) 후 켜집니다. 처음에는 <b>드라이런</b>으로 며칠 돌려보며 제안이 합리적인지 확인하시고,
          신뢰가 생기면 <b>승인 후 적용 → 완전 자동</b> 순서로 올리는 걸 권장합니다.
        </p>
      </div>

      {/* 규칙 설정 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">자동조정 규칙 (계정 기본값)</h2>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={rule.enabled} onChange={(e) => setRule((p) => ({ ...p, enabled: e.target.checked }))}
              className="w-4 h-4 accent-[#E31837]" />
            <span className="text-sm font-medium text-gray-700">{rule.enabled ? '켜짐' : '꺼짐'}</span>
          </label>
        </div>

        {/* 모드 */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">실행 모드</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(MODE_INFO) as Mode[]).map((m) => (
              <button key={m} type="button" onClick={() => setRule((p) => ({ ...p, mode: m }))}
                className={`rounded-lg border px-3 py-2 text-left transition ${rule.mode === m ? 'border-[#E31837] ring-1 ring-[#E31837]/30' : 'border-gray-200 hover:border-gray-300'}`}>
                <span className={`inline-block text-[11px] font-semibold px-1.5 py-0.5 rounded ${MODE_INFO[m].cls}`}>{MODE_INFO[m].label}</span>
                <span className="block text-[11px] text-gray-500 mt-1 leading-snug">{MODE_INFO[m].desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 목표/여유 */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="목표 ROAS (%)" hint="매출÷광고비×100. 300 = 광고비의 3배">
            <input type="number" value={rule.target_roas} onChange={num('target_roas')} className={inputCls} />
          </Field>
          <Field label="목표 허용 여유 (±%)" hint="이 범위 안이면 입찰 유지">
            <input type="number" value={rule.roas_tolerance_pct} onChange={num('roas_tolerance_pct')} className={inputCls} />
          </Field>
        </div>

        {/* 입찰 한도/스텝 */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="입찰가 하한 (원)"><input type="number" value={rule.min_bid} onChange={num('min_bid')} className={inputCls} /></Field>
          <Field label="입찰가 상한 (원)"><input type="number" value={rule.max_bid} onChange={num('max_bid')} className={inputCls} /></Field>
          <Field label="1회 조정 폭 (%)" hint="한 번 조정할 때 ±몇 %"><input type="number" value={rule.step_pct} onChange={num('step_pct')} className={inputCls} /></Field>
          <Field label="하루 최대 변동 (%)" hint="급격한 변동 방지"><input type="number" value={rule.daily_max_change_pct} onChange={num('daily_max_change_pct')} className={inputCls} /></Field>
          <Field label="성과 평가 기간 (일)" hint="최근 N일 성과로 판단"><input type="number" value={rule.lookback_days} onChange={num('lookback_days')} className={inputCls} /></Field>
        </div>

        {/* 전환0 보호 */}
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={rule.pause_on_zero_conv} onChange={(e) => setRule((p) => ({ ...p, pause_on_zero_conv: e.target.checked }))}
              className="w-4 h-4 accent-[#E31837]" />
            <span className="text-sm font-medium text-gray-700">전환 0인데 비용만 나가면 강하게 인하/중단</span>
          </label>
          {rule.pause_on_zero_conv && (
            <div className="grid grid-cols-2 gap-4 pl-6">
              <Field label="최소 클릭 수" hint="이 클릭 이상인데 전환0이면"><input type="number" value={rule.zero_conv_min_clicks} onChange={num('zero_conv_min_clicks')} className={inputCls} /></Field>
              <Field label="최소 광고비 (원)"><input type="number" value={rule.zero_conv_min_spend} onChange={num('zero_conv_min_spend')} className={inputCls} /></Field>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button type="button" onClick={save} disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#E31837] text-white rounded-lg text-sm font-semibold hover:bg-[#c5142f] disabled:opacity-60 transition">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? '저장 중...' : '규칙 저장'}
          </button>
          {savedAt && !saving && <span className="inline-flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 className="w-4 h-4" /> 저장됨</span>}
        </div>
      </div>

      {/* 변경 이력/제안 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900 mb-3">입찰 변경 제안·이력</h2>
        {changes.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">아직 제안된 변경이 없습니다. 워커가 성과를 평가하면 여기에 표시됩니다.</p>
        ) : (
          <div className="space-y-2">
            {changes.map((c) => {
              const Icon = c.after_bid != null && c.before_bid != null
                ? (c.after_bid > c.before_bid ? TrendingUp : c.after_bid < c.before_bid ? TrendingDown : Minus)
                : Minus;
              const isProposed = c.status === 'proposed';
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5">
                  <Icon className={`w-4 h-4 shrink-0 ${c.after_bid != null && c.before_bid != null && c.after_bid > c.before_bid ? 'text-emerald-500' : c.after_bid != null && c.before_bid != null && c.after_bid < c.before_bid ? 'text-rose-500' : 'text-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-800 truncate">
                      {c.campaign_name || '캠페인'}{c.keyword ? ` · ${c.keyword}` : ''}
                      {c.before_bid != null && c.after_bid != null && <span className="text-gray-500"> — {c.before_bid}→{c.after_bid}원</span>}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">{c.reason}</div>
                  </div>
                  <span className={`shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded ${STATUS_BADGE[c.status].cls}`}>{STATUS_BADGE[c.status].label}</span>
                  {isProposed && (
                    <div className="shrink-0 flex items-center gap-1">
                      <button onClick={() => decide(c.id, true)} title="승인" className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600"><CheckCircle2 className="w-4 h-4" /></button>
                      <button onClick={() => decide(c.id, false)} title="거절" className="p-1.5 rounded-md hover:bg-rose-50 text-rose-500"><XCircle className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls = 'w-full text-sm rounded-md border border-gray-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{hint}</p>}
    </div>
  );
}
