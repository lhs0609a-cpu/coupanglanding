/**
 * 쿠팡 애즈 입찰 자동조정 — 평가 오케스트레이션 (P2, DOM 비의존)
 * ---------------------------------------------------------------------------
 * collect()(성과 수집)와 apply()(입찰 변경)는 윙 DOM에 의존하므로 "주입"받는다.
 * 이 모듈은 그것들을 엮어: 성과 → evaluateBid → (드라이런/승인=제안 기록 /
 * 자동=즉시 적용) → ad_bid_changes 영속화 + 일일 변동상한 누적 추적을 담당한다.
 * collect/apply/db 를 목으로 주입하면 네트워크 없이 단위 테스트 가능.
 */

import { evaluateBid } from './ad-automation.mjs';
import { selectRows, insertRows } from './supabase-rest.mjs';

/** DB 행(snake_case) → evaluateBid 규칙(camelCase) */
export function ruleFromRow(r) {
  return {
    targetRoas: Number(r.target_roas),
    roasTolerancePct: Number(r.roas_tolerance_pct),
    minBid: Number(r.min_bid),
    maxBid: Number(r.max_bid),
    stepPct: Number(r.step_pct),
    dailyMaxChangePct: Number(r.daily_max_change_pct),
    pauseOnZeroConv: !!r.pause_on_zero_conv,
    zeroConvMinClicks: Number(r.zero_conv_min_clicks),
    zeroConvMinSpend: Number(r.zero_conv_min_spend),
  };
}

const scopeKey = (campaignId, keyword) => `${campaignId}|${keyword ?? ''}`;

/**
 * 한 번의 평가 사이클 실행.
 *
 * @param {Object} o
 * @param {Object} o.ruleRow                    megaload_ad_rules 행 (account 규칙)
 * @param {(opts:{lookbackDays:number}) => Promise<Array>} o.collect
 *        → [{campaignId, campaignName, keyword|null, currentBid, clicks, spend, sales, conversions}]
 * @param {(t:{campaignId,keyword,newBid}) => Promise<{ok:boolean,screenshotUrl?:string,error?:string}>} o.apply
 * @param {{ getTodayAppliedChanges:Function, insertChange:Function, saveMetrics?:Function }} o.db
 * @param {string} [o.workerId]
 * @param {(e:object)=>void} [o.onEvent]
 * @returns {Promise<{evaluated:number,proposed:number,applied:number,failed:number,skipped:number}>}
 */
export async function runAdEvaluation({ ruleRow, collect, apply, db, workerId, onEvent = () => {} }) {
  const rule = ruleFromRow(ruleRow);
  const mode = ruleRow.mode || 'dryrun';

  const rows = await collect({ lookbackDays: Number(ruleRow.lookback_days) || 7 });
  onEvent({ type: 'collected', count: rows.length });

  // 메트릭 저장(선택) — 웹 성과 화면용
  if (db.saveMetrics && rows.length) {
    try { await db.saveMetrics(rows); } catch (e) { onEvent({ type: 'warn', message: `메트릭 저장 실패: ${e.message}` }); }
  }

  // 오늘 이미 적용된 변동%를 캠페인·키워드별로 누적
  const todayChanges = await db.getTodayAppliedChanges();
  const pctMap = new Map();
  for (const ch of todayChanges) {
    if (ch.before_bid > 0 && ch.after_bid != null) {
      const k = scopeKey(ch.campaign_id, ch.keyword);
      const pct = Math.abs((ch.after_bid - ch.before_bid) / ch.before_bid) * 100;
      pctMap.set(k, (pctMap.get(k) ?? 0) + pct);
    }
  }

  const summary = { evaluated: 0, proposed: 0, applied: 0, failed: 0, skipped: 0 };

  for (const row of rows) {
    summary.evaluated++;
    const changedTodayPct = pctMap.get(scopeKey(row.campaignId, row.keyword)) ?? 0;
    const decision = evaluateBid({ currentBid: row.currentBid, metrics: row, rule, changedTodayPct });

    if (decision.action === 'hold') { summary.skipped++; continue; }

    const base = {
      rule_id: ruleRow.id ?? null,
      campaign_id: row.campaignId,
      campaign_name: row.campaignName ?? null,
      keyword: row.keyword ?? null,
      before_bid: row.currentBid,
      after_bid: decision.newBid,
      measured_roas: decision.measuredRoas,
      reason: decision.reason,
      worker_id: workerId ?? null,
    };

    if (mode === 'auto') {
      try {
        const res = await apply({ campaignId: row.campaignId, keyword: row.keyword ?? null, newBid: decision.newBid });
        if (res && res.ok) {
          await db.insertChange({ ...base, status: 'applied', applied_at: new Date().toISOString(), screenshot_url: res.screenshotUrl ?? null });
          summary.applied++;
          onEvent({ type: 'applied', ...base });
        } else {
          await db.insertChange({ ...base, status: 'failed', error_message: (res && res.error) || '적용 실패' });
          summary.failed++;
          onEvent({ type: 'failed', ...base, error: res && res.error });
        }
      } catch (e) {
        await db.insertChange({ ...base, status: 'failed', error_message: String(e.message).slice(0, 500) });
        summary.failed++;
        onEvent({ type: 'failed', ...base, error: e.message });
      }
    } else {
      // dryrun / approval → 적용하지 않고 제안만 기록
      await db.insertChange({ ...base, status: 'proposed' });
      summary.proposed++;
      onEvent({ type: 'proposed', mode, ...base });
    }
  }

  onEvent({ type: 'summary', ...summary });
  return summary;
}

/**
 * Supabase REST 기반 db 구현 (워커 세션 사용 → RLS로 본인 데이터만).
 * @param {import('./supabase-rest.mjs').Session} session
 * @param {string} megaloadUserId
 */
export function makeSupabaseDb(session, megaloadUserId) {
  return {
    async getTodayAppliedChanges() {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const q = `megaload_user_id=eq.${megaloadUserId}&status=eq.applied`
        + `&created_at=gte.${encodeURIComponent(since.toISOString())}`
        + `&select=campaign_id,keyword,before_bid,after_bid`;
      return selectRows(session, 'megaload_ad_bid_changes', q);
    },
    async insertChange(rec) {
      return insertRows(session, 'megaload_ad_bid_changes', [{ megaload_user_id: megaloadUserId, ...rec }]);
    },
    async saveMetrics(rows) {
      const today = new Date().toISOString().slice(0, 10);
      const recs = rows.map((r) => ({
        megaload_user_id: megaloadUserId,
        campaign_id: r.campaignId,
        campaign_name: r.campaignName ?? null,
        keyword: r.keyword ?? null,
        metric_date: today,
        impressions: r.impressions ?? 0,
        clicks: r.clicks ?? 0,
        spend: r.spend ?? 0,
        sales: r.sales ?? 0,
        conversions: r.conversions ?? 0,
        roas: r.spend > 0 ? Math.round((r.sales / r.spend) * 100) : null,
        collected_at: new Date().toISOString(),
      }));
      return insertRows(session, 'megaload_ad_metrics', recs, { upsert: true });
    },
  };
}
