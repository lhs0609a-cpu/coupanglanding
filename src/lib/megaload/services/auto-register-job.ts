// ============================================================
// 올인원 자동 등록 잡 (Auto-mode) — CRUD 헬퍼
//
// 브라우저 탭이 닫혀도 resume 가능하도록 진행 상태를 Supabase 에 영속화.
// Gate 1 사전분석 / Gate 2 자동 일시정지 / Gate 3 hard stop 의 상태를 한 곳에서 관리.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export type AutoJobStatus =
  | 'pending'
  | 'scanning'
  | 'registering'
  | 'paused'
  | 'completed'
  | 'aborted'
  | 'failed';

export type AutoJobPauseReason =
  | 'failure_rate'
  | 'rate_limit'
  | 'zero_price'
  | 'category_match'
  | 'manual'
  | 'payment_lock'
  | 'quota';

export interface AutoJobPreAnalysis {
  productCount: number;
  imageCount: number;
  estDurationMin: number;
  estAiCostUsd: number;
  warnings: string[];
}

export interface AutoJobThresholds {
  pauseFailureRate?: number;
  pauseOn429Burst?: number;
  pauseOnZeroPrice?: boolean;
  minCategoryMatchRate?: number;
}

export interface AutoJobRow {
  id: string;
  megaload_user_id: string;
  status: AutoJobStatus;
  root_folder_name: string | null;
  dry_run: boolean;
  pre_analysis: AutoJobPreAnalysis | null;
  gate1_confirmed_at: string | null;
  pause_failure_rate: number;
  pause_on_429_burst: number;
  pause_on_zero_price: boolean;
  min_category_match_rate: number;
  total_products: number;
  processed_products: number;
  success_products: number;
  failed_products: number;
  last_checkpoint_idx: number;
  last_checkpoint_at: string | null;
  pause_reason: AutoJobPauseReason | null;
  pause_detail: Record<string, unknown> | null;
  paused_at: string | null;
  result_summary: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 새 자동 등록 잡 생성 — Gate 1 결과와 임계치를 함께 저장 */
export async function createAutoJob(
  serviceClient: SupabaseClient,
  megaloadUserId: string,
  input: {
    rootFolderName: string;
    dryRun: boolean;
    preAnalysis: AutoJobPreAnalysis;
    thresholds?: AutoJobThresholds;
  },
): Promise<AutoJobRow> {
  const { data, error } = await serviceClient
    .from('sh_auto_register_jobs')
    .insert({
      megaload_user_id: megaloadUserId,
      status: 'pending',
      root_folder_name: input.rootFolderName,
      dry_run: input.dryRun,
      pre_analysis: input.preAnalysis,
      total_products: input.preAnalysis.productCount,
      pause_failure_rate: input.thresholds?.pauseFailureRate ?? 0.10,
      pause_on_429_burst: input.thresholds?.pauseOn429Burst ?? 5,
      pause_on_zero_price: input.thresholds?.pauseOnZeroPrice ?? true,
      min_category_match_rate: input.thresholds?.minCategoryMatchRate ?? 0.80,
    })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message || '잡 생성 실패');
  return data as AutoJobRow;
}

/** Gate 1 사용자 확인 → 잡을 실행 가능 상태로 전환 */
export async function confirmGate1(
  serviceClient: SupabaseClient,
  jobId: string,
): Promise<void> {
  const { error } = await serviceClient
    .from('sh_auto_register_jobs')
    .update({
      status: 'scanning',
      gate1_confirmed_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  if (error) throw new Error(error.message);
}

/**
 * 체크포인트 저장 — 배치 N개 완료 후 호출.
 * 부분 실패 카운트도 함께 갱신. status='registering' 으로 자동 전환.
 */
export async function checkpointAutoJob(
  serviceClient: SupabaseClient,
  jobId: string,
  delta: {
    processedDelta: number;
    successDelta: number;
    failedDelta: number;
    lastIdx: number;
  },
): Promise<void> {
  // RPC 가 이상적이지만 단순 read-modify-write 로 처리 (concurrent writer 없음 — 단일 브라우저 탭)
  const { data: cur } = await serviceClient
    .from('sh_auto_register_jobs')
    .select('processed_products, success_products, failed_products, last_checkpoint_idx')
    .eq('id', jobId)
    .single();
  if (!cur) return;
  const c = cur as Pick<AutoJobRow, 'processed_products' | 'success_products' | 'failed_products' | 'last_checkpoint_idx'>;
  const { error } = await serviceClient
    .from('sh_auto_register_jobs')
    .update({
      status: 'registering',
      processed_products: c.processed_products + delta.processedDelta,
      success_products: c.success_products + delta.successDelta,
      failed_products: c.failed_products + delta.failedDelta,
      last_checkpoint_idx: Math.max(c.last_checkpoint_idx, delta.lastIdx),
      last_checkpoint_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  if (error) throw new Error(error.message);
}

/** Gate 2 자동 일시정지 — 임계치 초과 시 호출 */
export async function pauseAutoJob(
  serviceClient: SupabaseClient,
  jobId: string,
  reason: AutoJobPauseReason,
  detail?: Record<string, unknown>,
): Promise<void> {
  const { error } = await serviceClient
    .from('sh_auto_register_jobs')
    .update({
      status: 'paused',
      pause_reason: reason,
      pause_detail: detail ?? null,
      paused_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  if (error) throw new Error(error.message);
}

/** 사용자가 일시정지 잡을 다시 시작 */
export async function resumeAutoJob(
  serviceClient: SupabaseClient,
  jobId: string,
): Promise<AutoJobRow> {
  const { data, error } = await serviceClient
    .from('sh_auto_register_jobs')
    .update({
      status: 'registering',
      pause_reason: null,
      pause_detail: null,
      paused_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .select()
    .single();
  if (error || !data) throw new Error(error?.message || 'resume 실패');
  return data as AutoJobRow;
}

/** 잡 종료 (완료 / 중단 / 실패) */
export async function finalizeAutoJob(
  serviceClient: SupabaseClient,
  jobId: string,
  finalStatus: 'completed' | 'aborted' | 'failed',
  resultSummary?: Record<string, unknown>,
): Promise<void> {
  const { error } = await serviceClient
    .from('sh_auto_register_jobs')
    .update({
      status: finalStatus,
      result_summary: resultSummary ?? null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  if (error) throw new Error(error.message);
}

/** 가장 최근 미완료 잡 조회 — resume 후보 (브라우저 첫 진입 시 확인) */
export async function getResumableJob(
  serviceClient: SupabaseClient,
  megaloadUserId: string,
): Promise<AutoJobRow | null> {
  const { data } = await serviceClient
    .from('sh_auto_register_jobs')
    .select('*')
    .eq('megaload_user_id', megaloadUserId)
    .in('status', ['scanning', 'registering', 'paused'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AutoJobRow) || null;
}

/** 단일 잡 조회 (소유권 체크 포함) */
export async function getAutoJob(
  serviceClient: SupabaseClient,
  jobId: string,
  megaloadUserId: string,
): Promise<AutoJobRow | null> {
  const { data } = await serviceClient
    .from('sh_auto_register_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('megaload_user_id', megaloadUserId)
    .maybeSingle();
  return (data as AutoJobRow) || null;
}
