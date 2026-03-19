import { SupabaseClient } from '@supabase/supabase-js';
import { AD_ACADEMY_POINTS, getArenaLevel } from '@/lib/utils/arena-points';
import { AD_ACADEMY_STAGES, STAGE_IDS } from '@/lib/data/ad-academy-stages';

/**
 * 광고 아카데미 스테이지 클리어 시 포인트 + 뱃지 지급
 * 패턴: education-rewards.ts 미러링
 */
export async function grantAdAcademyRewards(
  serviceClient: SupabaseClient,
  ptUserId: string,
  stageId: string,
  stars: number,
  bonusTipsCount: number
): Promise<{ pointsAwarded: number; badgesUnlocked: string[] }> {
  let pointsAwarded = 0;
  const badgesUnlocked: string[] = [];

  // 1) 중복 방지 체크
  const rewardKey = `ad_academy_${stageId}`;
  const inserted = await tryInsertReward(serviceClient, ptUserId, rewardKey);
  if (!inserted) {
    return { pointsAwarded: 0, badgesUnlocked: [] };
  }

  // 2) 기본 포인트
  const stage = AD_ACADEMY_STAGES.find(s => s.id === stageId);
  if (!stage) return { pointsAwarded: 0, badgesUnlocked: [] };

  pointsAwarded += stage.rewards.basePoints;

  // 3) 올 정답 보너스
  if (stars === 3) {
    pointsAwarded += stage.rewards.perfectBonus;
  }

  // 4) 히든 팁 보너스
  pointsAwarded += bonusTipsCount * AD_ACADEMY_POINTS.bonusTip;

  // 5) 스테이지별 뱃지
  if (stage.rewards.badge) {
    await tryUnlockBadge(serviceClient, ptUserId, stage.rewards.badge, badgesUnlocked);
  }

  // 6) 전체 클리어 체크
  const { data: allRewards } = await serviceClient
    .from('seller_achievements')
    .select('achievement_key')
    .eq('pt_user_id', ptUserId)
    .like('achievement_key', 'ad_academy_stage-%');

  const bossReward = await serviceClient
    .from('seller_achievements')
    .select('achievement_key')
    .eq('pt_user_id', ptUserId)
    .eq('achievement_key', 'ad_academy_boss')
    .maybeSingle();

  const clearedKeys = (allRewards?.map(r => r.achievement_key) || []);
  if (bossReward?.data) clearedKeys.push('ad_academy_boss');
  clearedKeys.push(rewardKey);

  const allCleared = STAGE_IDS.every(id => clearedKeys.includes(`ad_academy_${id}`));
  if (allCleared) {
    const allClearInserted = await tryInsertReward(serviceClient, ptUserId, 'ad_academy_all_clear');
    if (allClearInserted) {
      pointsAwarded += AD_ACADEMY_POINTS.allClearBonus;
      await tryUnlockBadge(serviceClient, ptUserId, 'ad_all_clear', badgesUnlocked);
    }
  }

  // 7) seller_points 업데이트
  if (pointsAwarded > 0) {
    await addPointsAndRecalcLevel(serviceClient, ptUserId, pointsAwarded);
  }

  return { pointsAwarded, badgesUnlocked };
}

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
  return false;
}

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
