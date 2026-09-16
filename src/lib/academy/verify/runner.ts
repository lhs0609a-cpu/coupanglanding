/**
 * 판정 실행기 — 아카데미의 심장.
 *
 * 트레이너가 하던 다섯 가지 일 중 "됐는지 확인해주기" 가 여기다.
 * 나머지(순서 안내·화면 설명·트러블슈팅)는 콘텐츠지만, 이것만이
 * "트레이너 없이" 를 성립시킨다.
 *
 * 운영 규칙(설계도 §5-2):
 *   · 쿨다운 20초 — 쿠팡 API 를 연타로 때리지 않는다
 *   · 프로브 캐시 60초 — 한 화면에서 여러 스텝이 같은 프로브를 쓴다
 *   · 3회 연속 실패 → 수동 통과 요청 노출 (오판으로 길이 막히면 신뢰가 무너진다)
 *   · 성공·실패 전부 로그 — 어느 스텝에서 사람이 죽는지 찾는 유일한 근거
 *   · 한번 통과한 스텝은 다시 잠기지 않는다
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getStep } from '@/lib/data/academy';
import type { AcademyStep, ProbeResult, VerifyVerdict } from '@/lib/data/academy/types';
import { PROBES, type ProbeContext } from './probes';
import { NUMBER_VALIDATORS, maskNumber } from './validators';
import { touchStreak } from '../streak';

export const COOLDOWN_MS = 20_000;
const PROBE_CACHE_MS = 60_000;
/** 이 횟수부터 "수동 통과 요청" 을 보여준다 */
export const MANUAL_REVIEW_AFTER = 3;

// 서버 인스턴스 단위 캐시. 서버리스라 완벽하진 않지만, 한 화면에서 나는 연타는 막아준다.
const probeCache = new Map<string, { at: number; result: ProbeResult }>();

/** 퀘스트 라우트도 같은 캐시를 쓰도록 공개한다 — 한 화면에서 두 번 쏘면 안 된다. */
export async function runProbe(
  ctx: ProbeContext,
  probeKey: string,
  params?: Record<string, unknown>,
): Promise<ProbeResult> {
  const cacheKey = `${ctx.megaloadUserId}:${probeKey}:${JSON.stringify(params ?? {})}`;
  const hit = probeCache.get(cacheKey);
  if (hit && Date.now() - hit.at < PROBE_CACHE_MS) return hit.result;

  const probe = PROBES[probeKey as keyof typeof PROBES];
  if (!probe) return { ok: false, data: {}, error: `알 수 없는 판정 방법입니다(${probeKey}).` };

  const result = await probe(ctx, params);
  probeCache.set(cacheKey, { at: Date.now(), result });
  return result;
}

export interface VerifyInput {
  service: SupabaseClient;
  userId: string;            // auth.users.id — 진행·XP 의 주인
  megaloadUserId: string;    // 쿠팡 자격증명의 주인
  stepKey: string;
  /** L3 퀴즈 답안 (문항 순서대로 고른 보기 index) */
  answers?: number[];
  /** L2(mode: 'number') 입력값 — 사업자등록번호 등 */
  value?: string;
}

export interface VerifyOutcome {
  passed: boolean;
  detail: string;
  attempts: number;
  /** 3회 이상 실패 — 화면에 "수동 통과 요청" 을 띄워야 한다 */
  canRequestReview: boolean;
  xpAwarded: number;
  badgeAwarded?: string;
  /** 쿨다운에 걸린 경우 남은 밀리초 */
  cooldownMs?: number;
}

/** L3 — 퀴즈 채점. 정답은 서버에만 있다. */
function gradeQuiz(step: AcademyStep, answers: number[] | undefined): VerifyVerdict {
  if (step.verify.level !== 3) return { passed: false, detail: '퀴즈 스텝이 아닙니다.' };
  const quiz = step.verify.quiz;
  if (!answers || answers.length !== quiz.length) {
    return { passed: false, detail: '문항에 모두 답해주세요.' };
  }
  const wrong = quiz.map((q, i) => (answers[i] === q.answer ? null : q)).filter(Boolean) as typeof quiz;
  if (wrong.length === 0) return { passed: true, detail: '모두 맞혔습니다.' };
  // 틀린 이유를 말해준다 — 점수만 주면 아무것도 안 배운다.
  return {
    passed: false,
    detail: `${wrong.length}문항이 틀렸습니다. ${wrong.map((q) => q.why).join(' ')}`,
  };
}

export async function verifyStep(input: VerifyInput): Promise<VerifyOutcome> {
  const { service, userId, megaloadUserId, stepKey } = input;
  const step = getStep(stepKey);
  if (!step) {
    return { passed: false, detail: '없는 스텝입니다.', attempts: 0, canRequestReview: false, xpAwarded: 0 };
  }

  const { data: row } = await service
    .from('academy_progress')
    .select('status, attempts, last_attempt_at, passed_at')
    .eq('user_id', userId)
    .eq('step_key', stepKey)
    .maybeSingle();

  // 이미 통과한 스텝은 다시 판정하지 않는다. 상품을 지웠다고 배운 게 사라지지는 않는다.
  if (row?.status === 'passed') {
    return {
      passed: true,
      detail: '이미 통과한 스텝입니다.',
      attempts: row.attempts ?? 0,
      canRequestReview: false,
      xpAwarded: 0,
    };
  }

  // 쿨다운 — 연타로 쿠팡 API 를 때리지 않는다
  const last = row?.last_attempt_at ? new Date(row.last_attempt_at).getTime() : 0;
  const since = Date.now() - last;
  if (last && since < COOLDOWN_MS) {
    return {
      passed: false,
      detail: '조금만 기다렸다 다시 눌러주세요.',
      attempts: row?.attempts ?? 0,
      canRequestReview: (row?.attempts ?? 0) >= MANUAL_REVIEW_AFTER,
      xpAwarded: 0,
      cooldownMs: COOLDOWN_MS - since,
    };
  }

  const startedAt = Date.now();
  let verdict: VerifyVerdict;
  let probeUsed: string | null = null;
  let payload: Record<string, unknown> = {};

  if (step.verify.level === 1) {
    probeUsed = step.verify.probe;
    const result = await runProbe({ service, megaloadUserId }, step.verify.probe, step.verify.params);
    payload = { probe: probeUsed, ...result.data, ...(result.error ? { error: result.error } : {}) };
    verdict = step.verify.pass(result);
  } else if (step.verify.level === 3) {
    verdict = gradeQuiz(step, input.answers);
    payload = { answers: input.answers ?? [] };
  } else if (step.verify.mode === 'number') {
    const check = NUMBER_VALIDATORS[step.verify.validator](input.value ?? '');
    // ★ 번호 전체를 저장하지 않는다. 판정에 필요한 건 "맞았다" 이지 번호가 아니다.
    payload = { validator: step.verify.validator, masked: check.normalized ? maskNumber(check.normalized) : null };
    verdict = check.valid
      ? { passed: true, detail: '번호 형식과 체크섬을 확인했습니다.' }
      : { passed: false, detail: check.reason || '번호를 확인하지 못했습니다.' };
  } else {
    // 파일 증빙은 업로드 라우트가 필요하다 — 아직 없다. 있는 척하지 않는다.
    verdict = { passed: false, detail: '이 단계는 증빙 파일 확인 기능이 아직 준비 중입니다.' };
  }

  const attempts = (row?.attempts ?? 0) + 1;
  const nowIso = new Date().toISOString();

  await service.from('academy_progress').upsert(
    {
      user_id: userId,
      step_key: stepKey,
      status: verdict.passed ? 'passed' : 'in_progress',
      verify_level: step.verify.level,
      verify_payload: payload,
      attempts,
      last_attempt_at: nowIso,
      ...(verdict.passed ? { passed_at: nowIso } : {}),
    },
    { onConflict: 'user_id,step_key' },
  );

  // 실패도 반드시 남긴다. 성공만 남기면 고칠 곳을 영영 못 찾는다.
  await service.from('academy_verify_log').insert({
    user_id: userId,
    step_key: stepKey,
    level: step.verify.level,
    passed: verdict.passed,
    probe: probeUsed,
    error: verdict.passed ? null : verdict.detail.slice(0, 500),
    duration_ms: Date.now() - startedAt,
  });

  let xpAwarded = 0;
  let badgeAwarded: string | undefined;

  if (verdict.passed) {
    // UNIQUE(user_id, reason, ref_key) 가 중복 지급을 막는다 — 여기서 세지 않아도 된다.
    const { error: xpErr } = await service.from('academy_xp_ledger').insert({
      user_id: userId,
      amount: step.xp,
      reason: 'step_passed',
      ref_key: stepKey,
    });
    if (!xpErr) xpAwarded = step.xp;

    if (step.badgeKey) {
      const { error: badgeErr } = await service.from('academy_badges').insert({
        user_id: userId,
        badge_key: step.badgeKey,
        proof: payload,
      });
      if (!badgeErr) badgeAwarded = step.badgeKey;
    }

    // 단계를 하나 통과한 날은 "운영한 날" 로 친다(설계도 §8-4).
    void touchStreak(service, userId);

    // 트레이너 화면(기존 교육 현황판)에 단방향으로 미러링한다.
    // 실패해도 판정 자체는 성공이므로 조용히 넘어간다.
    if (step.moduleKey) {
      void mirrorToPtEducation(service, userId, step.moduleKey).catch(() => {});
    }
  }

  return {
    passed: verdict.passed,
    detail: verdict.detail,
    attempts,
    canRequestReview: !verdict.passed && attempts >= MANUAL_REVIEW_AFTER,
    xpAwarded,
    badgeAwarded,
  };
}

/**
 * 기존 pt_education_progress 로 **단방향** 미러링.
 * 양방향 동기화는 하지 않는다 — 한쪽이 진실이어야 한다(진실은 academy_progress).
 * 그 모듈에 묶인 아카데미 스텝이 전부 통과됐을 때만 completed 로 올린다.
 */
async function mirrorToPtEducation(service: SupabaseClient, userId: string, moduleKey: string) {
  const { ACADEMY_STEPS } = await import('@/lib/data/academy');
  const siblings = ACADEMY_STEPS.filter((s) => s.moduleKey === moduleKey).map((s) => s.key);
  if (!siblings.length) return;

  const { data: passed } = await service
    .from('academy_progress')
    .select('step_key')
    .eq('user_id', userId)
    .eq('status', 'passed')
    .in('step_key', siblings);

  if ((passed?.length ?? 0) < siblings.length) return;

  const { data: ptUser } = await service
    .from('pt_users')
    .select('id')
    .eq('profile_id', userId)
    .maybeSingle();
  if (!ptUser) return;   // PT 학생이 아니면 미러링할 곳이 없다 — 정상이다

  await service
    .from('pt_education_progress')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('pt_user_id', ptUser.id)
    .eq('module_key', moduleKey)
    .neq('status', 'completed');
}
