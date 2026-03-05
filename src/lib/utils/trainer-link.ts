import type { SupabaseClient } from '@supabase/supabase-js';

interface LinkParams {
  userEmail: string;
  ptUserId: string;
  profileId: string;
}

interface LinkResult {
  linked: boolean;
  isReferred: boolean;
  trainerId?: string;
  trainerProfileId?: string;
  referralCode?: string;
  applicationId?: string;
}

/**
 * 사용자의 신청서에서 추천 코드를 찾아 트레이너-교육생 연결을 생성한다.
 *
 * 1. applications 테이블에서 email + referral_code IS NOT NULL인 최신 신청 조회
 * 2. trainers 테이블에서 해당 referral_code + status='approved'인 트레이너 조회
 * 3. trainer_trainees에 이미 링크가 있으면 중복 방지, isReferred: true 반환
 * 4. 링크 없으면 trainer_trainees INSERT (application_id 포함)
 */
export async function lookupAndLinkTrainee(
  supabase: SupabaseClient,
  params: LinkParams,
): Promise<LinkResult> {
  const { userEmail, ptUserId, profileId } = params;

  // 1. 추천 코드가 있는 최신 신청서 조회
  const { data: application } = await supabase
    .from('applications')
    .select('id, referral_code')
    .eq('email', userEmail)
    .not('referral_code', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!application?.referral_code) {
    return { linked: false, isReferred: false };
  }

  // 2. 해당 추천 코드의 승인된 트레이너 조회
  const { data: trainer } = await supabase
    .from('trainers')
    .select('id, pt_user_id, pt_user:pt_users(profile_id)')
    .eq('referral_code', application.referral_code)
    .eq('status', 'approved')
    .maybeSingle();

  if (!trainer) {
    return { linked: false, isReferred: false };
  }

  const trainerProfileId = (trainer as unknown as { pt_user: { profile_id: string } }).pt_user?.profile_id;

  // 자기 자신 추천 방지
  if (trainer.pt_user_id === ptUserId) {
    return { linked: false, isReferred: false };
  }

  // 3. 이미 링크가 존재하는지 확인
  const { data: existing } = await supabase
    .from('trainer_trainees')
    .select('id')
    .eq('trainer_id', trainer.id)
    .eq('trainee_pt_user_id', ptUserId)
    .maybeSingle();

  if (existing) {
    return {
      linked: false,
      isReferred: true,
      trainerId: trainer.id,
      trainerProfileId,
      referralCode: application.referral_code,
      applicationId: application.id,
    };
  }

  // 4. trainer_trainees INSERT
  await supabase.from('trainer_trainees').insert({
    trainer_id: trainer.id,
    trainee_pt_user_id: ptUserId,
    application_id: application.id,
    is_active: true,
  });

  return {
    linked: true,
    isReferred: true,
    trainerId: trainer.id,
    trainerProfileId,
    referralCode: application.referral_code,
    applicationId: application.id,
  };
}
