/**
 * 쿠팡 애즈 입찰 자동조정 — 평가 오케스트레이션 (P2, DOM 비의존)
 * ---------------------------------------------------------------------------
 * collect()(성과 수집)와 apply()(입찰 변경)는 윙 DOM에 의존하므로 "주입"받는다.
 * 이 모듈은 그것들을 엮어: 성과 → evaluateBid → (드라이런/승인=제안 기록 /
 * 자동=즉시 적용) → ad_bid_changes 영속화 + 일일 변동상한 누적 추적을 담당한다.
 * collect/apply/db 를 목으로 주입하면 네트워크 없이 단위 테스트 가능.
 */

import { evaluateBid, evaluateCampaignAction } from './ad-automation.mjs';
import { selectRows, insertRows, patchRow } from './supabase-rest.mjs';

/** DB 행(snake_case) → 규칙(camelCase) */
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
    // B-1: 자동 OFF
    autoOffEnabled: !!r.auto_off_enabled,
    offSpendThreshold: Number(r.off_spend_threshold),
    offMaxSales: Number(r.off_max_sales),
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
export async function runAdEvaluation({ ruleRow, collect, apply, offApply, db, workerId, onEvent = () => {} }) {
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

  const summary = { evaluated: 0, proposed: 0, applied: 0, failed: 0, skipped: 0, off: 0 };

  for (const row of rows) {
    summary.evaluated++;

    // B-1: 먼저 "이 캠페인 꺼야 하나?" 판정 — OFF면 입찰 조정은 건너뜀
    const camAction = evaluateCampaignAction({ metrics: row, rule });
    if (camAction) {
      const offBase = {
        rule_id: ruleRow.id ?? null, action: 'off',
        campaign_id: row.campaignId, campaign_name: row.campaignName ?? null, keyword: row.keyword ?? null,
        before_bid: row.currentBid, after_bid: null,
        measured_roas: row.spend > 0 ? Math.round((row.sales / row.spend) * 100) : null,
        reason: camAction.reason, worker_id: workerId ?? null,
      };
      if (mode === 'auto' && offApply) {
        try {
          const res = await offApply({ campaignId: row.campaignId });
          if (res && res.ok) { await db.insertChange({ ...offBase, status: 'applied', applied_at: new Date().toISOString() }); summary.off++; onEvent({ type: 'off', ...offBase }); }
          else { await db.insertChange({ ...offBase, status: 'failed', error_message: (res && res.error) || 'OFF 실패' }); summary.failed++; }
        } catch (e) {
          await db.insertChange({ ...offBase, status: 'failed', error_message: String(e.message).slice(0, 500) }); summary.failed++;
        }
      } else {
        await db.insertChange({ ...offBase, status: 'proposed' }); summary.off++; onEvent({ type: 'off-proposed', mode, ...offBase });
      }
      continue;
    }

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
 * B-1 삭제 패스 — OFF된 지 N일 넘은 캠페인을 삭제(또는 제안).
 * @param {Object} o
 * @param {Object} o.ruleRow
 * @param {Object} o.db
 * @param {(t:{campaignId:string})=>Promise<{ok:boolean,error?:string}>} [o.deleteApply]
 */
export async function runDeletePass({ ruleRow, db, deleteApply, workerId, onEvent = () => {} }) {
  if (!ruleRow.auto_delete_enabled) return { proposed: 0, deleted: 0, failed: 0 };
  const mode = ruleRow.mode || 'dryrun';
  const days = Number(ruleRow.delete_after_off_days) || 7;
  const stale = await db.getStaleOffCampaigns(days);
  const summary = { proposed: 0, deleted: 0, failed: 0 };
  for (const c of stale) {
    const base = {
      rule_id: ruleRow.id ?? null, action: 'delete',
      campaign_id: c.campaign_id, campaign_name: c.campaign_name ?? null,
      reason: `OFF 후 ${days}일 경과 — 삭제`, worker_id: workerId ?? null,
    };
    if (mode === 'auto' && deleteApply) {
      try {
        const res = await deleteApply({ campaignId: c.campaign_id });
        if (res && res.ok) { await db.insertChange({ ...base, status: 'applied', applied_at: new Date().toISOString() }); summary.deleted++; onEvent({ type: 'deleted', ...base }); }
        else { await db.insertChange({ ...base, status: 'failed', error_message: (res && res.error) || '삭제 실패' }); summary.failed++; }
      } catch (e) { await db.insertChange({ ...base, status: 'failed', error_message: String(e.message).slice(0, 500) }); summary.failed++; }
    } else {
      await db.insertChange({ ...base, status: 'proposed' }); summary.proposed++; onEvent({ type: 'delete-proposed', mode, ...base });
    }
  }
  onEvent({ type: 'delete-summary', ...summary });
  return summary;
}

/**
 * B-2 자동등록 큐 처리 — 일일 상한(register_max_per_day) 안에서 pending 상품을 광고 등록.
 * 상품당 일예산은 큐 항목 또는 규칙 기본값을 사용(사용자 지정).
 * @param {Object} o
 * @param {Object} o.ruleRow
 * @param {Object} o.db
 * @param {(t:{coupangProductId:string,initialBid:number,dailyBudget:number})=>Promise<{ok:boolean,campaignId?:string,error?:string}>} o.register
 */
export async function runRegisterQueue({ ruleRow, db, register, workerId, onEvent = () => {} }) {
  if (!ruleRow.auto_register_enabled) return { registered: 0, failed: 0, capped: false };

  // 신규 상품 전체(all_new): 쿠팡 등록된 최근 상품을 큐에 자동 보충 (중복 제외)
  if (ruleRow.register_scope === 'all_new' && db.enqueueNewProducts) {
    try {
      const n = await db.enqueueNewProducts(200, {
        initialBid: Number(ruleRow.register_initial_bid),
        dailyBudget: Number(ruleRow.register_daily_budget),
      });
      if (n) onEvent({ type: 'register-enqueued', count: n });
    } catch (e) { onEvent({ type: 'warn', message: '신규상품 자동큐 실패: ' + e.message }); }
  }

  const maxPerDay = Number(ruleRow.register_max_per_day) || 10;
  const remaining = Math.max(0, maxPerDay - await db.countRegisteredToday());
  if (remaining <= 0) { onEvent({ type: 'register-capped', message: `일일 자동등록 상한(${maxPerDay}개) 도달` }); return { registered: 0, failed: 0, capped: true }; }

  const pending = await db.listPendingRegister(remaining);
  const summary = { registered: 0, failed: 0, capped: false };
  for (const item of pending) {
    await db.markRegister(item.id, { status: 'processing', worker_id: workerId ?? null });
    try {
      const res = await register({
        coupangProductId: item.coupang_product_id,
        initialBid: item.initial_bid ?? Number(ruleRow.register_initial_bid),
        dailyBudget: item.daily_budget ?? Number(ruleRow.register_daily_budget),
      });
      if (res && res.ok) { await db.markRegister(item.id, { status: 'done', campaign_id: res.campaignId ?? null, completed_at: new Date().toISOString() }); summary.registered++; onEvent({ type: 'registered', product: item.product_name }); }
      else { await db.markRegister(item.id, { status: 'error', error_message: (res && res.error) || '등록 실패' }); summary.failed++; }
    } catch (e) { await db.markRegister(item.id, { status: 'error', error_message: String(e.message).slice(0, 500) }); summary.failed++; }
  }
  onEvent({ type: 'register-summary', ...summary });
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
    /** OFF된 지 days일 넘은(개선 없는) 캠페인 — 삭제 후보. 이미 삭제기록 있는 건 제외. */
    async getStaleOffCampaigns(days) {
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      const offs = await selectRows(
        session, 'megaload_ad_bid_changes',
        `megaload_user_id=eq.${megaloadUserId}&action=eq.off&status=eq.applied`
        + `&applied_at=lt.${encodeURIComponent(cutoff)}`
        + `&select=campaign_id,campaign_name,applied_at&order=applied_at.asc`,
      );
      const deleted = await selectRows(
        session, 'megaload_ad_bid_changes',
        `megaload_user_id=eq.${megaloadUserId}&action=eq.delete&select=campaign_id`,
      );
      const deletedSet = new Set((deleted || []).map((d) => d.campaign_id));
      const seen = new Set();
      const out = [];
      for (const o of offs || []) {
        if (deletedSet.has(o.campaign_id) || seen.has(o.campaign_id)) continue;
        seen.add(o.campaign_id);
        out.push(o);
      }
      return out;
    },
    /** 자동등록 대기 큐 (오래된 순) */
    async listPendingRegister(limit) {
      return selectRows(
        session, 'megaload_ad_register_queue',
        `megaload_user_id=eq.${megaloadUserId}&status=eq.pending&select=*&order=created_at.asc&limit=${Number(limit) || 10}`,
      );
    },
    /** 오늘 자동등록 완료 건수 (일일 상한 체크용) */
    async countRegisteredToday() {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const rows = await selectRows(
        session, 'megaload_ad_register_queue',
        `megaload_user_id=eq.${megaloadUserId}&status=eq.done&completed_at=gte.${encodeURIComponent(since.toISOString())}&select=id`,
      );
      return (rows || []).length;
    },
    async markRegister(id, patch) {
      return patchRow(session, 'megaload_ad_register_queue', `id=eq.${id}`, patch);
    },
    /** all_new: 쿠팡 등록된(상품ID 있는) 최근 상품 중 큐에 없는 것을 자동 추가 → 추가 개수 */
    async enqueueNewProducts(limit, defaults) {
      const prods = await selectRows(
        session, 'sh_products',
        `megaload_user_id=eq.${megaloadUserId}&coupang_product_id=not.is.null&status=neq.deleted`
        + `&select=coupang_product_id,product_name&order=created_at.desc&limit=${Number(limit) || 100}`,
      );
      if (!prods || prods.length === 0) return 0;
      const existing = await selectRows(
        session, 'megaload_ad_register_queue',
        `megaload_user_id=eq.${megaloadUserId}&select=coupang_product_id`,
      );
      const have = new Set((existing || []).map((e) => e.coupang_product_id));
      const fresh = prods.filter((p) => p.coupang_product_id && !have.has(p.coupang_product_id));
      if (fresh.length === 0) return 0;
      await insertRows(session, 'megaload_ad_register_queue', fresh.map((p) => ({
        megaload_user_id: megaloadUserId,
        coupang_product_id: p.coupang_product_id,
        product_name: p.product_name ?? null,
        initial_bid: defaults.initialBid,
        daily_budget: defaults.dailyBudget,
        status: 'pending',
      })));
      return fresh.length;
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
