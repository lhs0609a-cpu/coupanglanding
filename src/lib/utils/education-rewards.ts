import { SupabaseClient } from '@supabase/supabase-js';
import { MODULE_CATEGORIES } from '@/lib/utils/education-helpers';
import { EDUCATION_POINTS, getArenaLevel } from '@/lib/utils/arena-points';

const ALL_STEP_KEYS = MODULE_CATEGORIES.flatMap((cat) => cat.stepKeys);

/**
 * 교육 모듈 완료 시 포인트 + 배지를 지급하는 공통 유틸
 * - 모듈 1개 완료: 30P (중복 방지: achievement_key = edu_reward_{stepKey})
 * - 카테고리 전체 완료: 50P 보너스
 * - 전체 12개 올클리어: 200P 보너스 + education_complete 배지
 * - 첫 교육 완료: first_education 배지
 */
export async function grantEducationRewards(
  serviceClient: SupabaseClient,
  ptUserId: string,
  completedStepKey: string
): Promise<{ pointsAwarded: number; badgesUnlocked: string[] }> {
  let pointsAwarded = 0;
  const badgesUnlocked: string[] = [];

  // 1) 해당 step에 대해 이미 보상을 받았는지 확인 (중복 방지)
  const rewardKey = `edu_reward_${completedStepKey}`;
  const { data: existingReward } = await serviceClient
    .from('seller_achievements')
    .select('id')
    .eq('pt_user_id', ptUserId)
    .eq('achievement_key', rewardKey)
    .maybeSingle();

  if (existingReward) {
    // 이미 보상을 받았으면 스킵
    return { pointsAwarded: 0, badgesUnlocked: [] };
  }

  // 2) 모듈 완료 포인트 30P 기록
  const { error: rewardInsertError } = await serviceClient
    .from('seller_achievements')
    .insert({
      pt_user_id: ptUserId,
      achievement_key: rewardKey,
      unlocked_at: new Date().toISOString(),
    });

  if (rewardInsertError) {
    // UNIQUE 위반이면 이미 받은 것 → 스킵
    if (rewardInsertError.code === '23505') {
      return { pointsAwarded: 0, badgesUnlocked: [] };
    }
    console.error('Education reward insert error:', rewardInsertError);
    return { pointsAwarded: 0, badgesUnlocked: [] };
  }

  pointsAwarded += EDUCATION_POINTS.perModule;

  // 3) 이전에 완료한 step 목록 조회
  const { data: allCompletedSteps } = await serviceClient
    .from('onboarding_steps')
    .select('step_key')
    .eq('pt_user_id', ptUserId)
    .eq('status', 'approved');

  const completedKeys = (allCompletedSteps || []).map((s) => s.step_key);
  // 현재 step도 포함 보장
  if (!completedKeys.includes(completedStepKey)) {
    completedKeys.push(completedStepKey);
  }

  // 4) 첫 교육 완료 배지 (first_education)
  await tryUnlockBadge(serviceClient, ptUserId, 'first_education', badgesUnlocked);

  // 5) 카테고리 완료 보너스 체크
  const category = MODULE_CATEGORIES.find((cat) => cat.stepKeys.includes(completedStepKey));
  if (category) {
    const allCategoryDone = category.stepKeys.every((key) => completedKeys.includes(key));
    if (allCategoryDone) {
      const categoryBonusKey = `edu_category_${category.id}`;
      const inserted = await tryInsertReward(serviceClient, ptUserId, categoryBonusKey);
      if (inserted) {
        pointsAwarded += EDUCATION_POINTS.categoryBonus;
      }
    }
  }

  // 6) 올클리어 보너스 (전체 12개)
  const allDone = ALL_STEP_KEYS.every((key) => completedKeys.includes(key));
  if (allDone) {
    const allClearKey = 'edu_all_clear';
    const inserted = await tryInsertReward(serviceClient, ptUserId, allClearKey);
    if (inserted) {
      pointsAwarded += EDUCATION_POINTS.allClearBonus;
    }
    // education_complete 배지
    await tryUnlockBadge(serviceClient, ptUserId, 'education_complete', badgesUnlocked);
  }

  // 7) seller_points 업데이트 (total_points 증가 + 레벨 재계산)
  if (pointsAwarded > 0) {
    await addPointsAndRecalcLevel(serviceClient, ptUserId, pointsAwarded);
  }

  return { pointsAwarded, badgesUnlocked };
}

/** 배지 unlock 시도 (이미 있으면 무시) */
async function tryUnlockBadge(
  serviceClient: SupabaseClient,
  ptUserId: string,
  achievementKey: string,
  badgesUnlocked: string[]
): Promise<boolean> {
  const { error } = await serviceClient
    .from('seller_achievements')
    .insert({
      pt_user_id: ptUserId,
      achievement_key: achievementKey,
      unlocked_at: new Date().toISOString(),
    });

  if (!error) {
    badgesUnlocked.push(achievementKey);
    return true;
  }
  // 23505 = unique_violation → 이미 보유
  return false;
}

/** 보상 기록 insert 시도 (중복이면 false 반환) */
async function tryInsertReward(
  serviceClient: SupabaseClient,
  ptUserId: string,
  rewardKey: string
): Promise<boolean> {
  const { error } = await serviceClient
    .from('seller_achievements')
    .insert({
      pt_user_id: ptUserId,
      achievement_key: rewardKey,
      unlocked_at: new Date().toISOString(),
    });

  return !error;
}

/** seller_points의 total_points를 증가시키고 레벨 재계산 */
async function addPointsAndRecalcLevel(
  serviceClient: SupabaseClient,
  ptUserId: string,
  additionalPoints: number
): Promise<void> {
  const { data: existing } = await serviceClient
    .from('seller_points')
    .select('total_points')
    .eq('pt_user_id', ptUserId)
    .maybeSingle();

  const currentTotal = existing?.total_points || 0;
  const newTotal = currentTotal + additionalPoints;
  const newLevel = getArenaLevel(newTotal);

  await serviceClient
    .from('seller_points')
    .upsert({
      pt_user_id: ptUserId,
      total_points: newTotal,
      current_level: newLevel.level,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'pt_user_id' });
}
