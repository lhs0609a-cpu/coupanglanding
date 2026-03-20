import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';
import { notifyTrainerNewTrainee, notifyTrainerBonusEarned } from '@/lib/utils/notifications';
import { getReportCosts } from '@/lib/calculations/deposit';
import { calculateTrainerBonus } from '@/lib/calculations/trainer';

async function requireAdmin(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return null;
  return user;
}

// POST: 수동 연결
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = await requireAdmin(supabase);
    if (!admin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { trainer_id, trainee_pt_user_id, link_reason, effective_from, calculate_retroactive } = body;

    if (!trainer_id || !trainee_pt_user_id) {
      return NextResponse.json({ error: '트레이너 ID와 교육생 ID가 필요합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 트레이너 검증
    const { data: trainer } = await serviceClient
      .from('trainers')
      .select('*, pt_user:pt_users(profile_id)')
      .eq('id', trainer_id)
      .single();

    if (!trainer || trainer.status !== 'approved') {
      return NextResponse.json({ error: '승인된 트레이너만 교육생을 연결할 수 있습니다.' }, { status: 400 });
    }

    // 자기 자신 연결 방지
    if (trainer.pt_user_id === trainee_pt_user_id) {
      return NextResponse.json({ error: '트레이너 자신을 교육생으로 연결할 수 없습니다.' }, { status: 400 });
    }

    // 트레이니 검증
    const { data: trainee } = await serviceClient
      .from('pt_users')
      .select('*, profile:profiles(*)')
      .eq('id', trainee_pt_user_id)
      .eq('status', 'active')
      .single();

    if (!trainee) {
      return NextResponse.json({ error: '활성 상태의 PT 사용자만 연결할 수 있습니다.' }, { status: 400 });
    }

    // 기존 활성 연결 중복 체크
    const { data: existingLink } = await serviceClient
      .from('trainer_trainees')
      .select('*, trainer:trainers(*, pt_user:pt_users(*, profile:profiles(*)))')
      .eq('trainee_pt_user_id', trainee_pt_user_id)
      .eq('is_active', true)
      .maybeSingle();

    if (existingLink) {
      const existingTrainer = (existingLink as Record<string, unknown>).trainer as { pt_user?: { profile?: { full_name?: string } } } | null;
      const existingTrainerName = existingTrainer?.pt_user?.profile?.full_name || '알 수 없음';
      return NextResponse.json({
        error: `이미 트레이너 "${existingTrainerName}"에게 연결되어 있습니다. 먼저 연결을 해제해주세요.`,
        existing_trainer: existingTrainerName,
      }, { status: 409 });
    }

    // trainer_trainees INSERT
    const { data: newLink, error: insertError } = await serviceClient
      .from('trainer_trainees')
      .insert({
        trainer_id,
        trainee_pt_user_id,
        is_active: true,
        link_type: 'manual',
        linked_by: admin.id,
        link_reason: link_reason || null,
        effective_from: effective_from || null,
      })
      .select('id')
      .single();

    if (insertError) {
      return NextResponse.json({ error: '연결 생성에 실패했습니다: ' + insertError.message }, { status: 500 });
    }

    let retroactiveCount = 0;
    let retroactiveTotal = 0;

    // 소급 보너스 계산
    if (calculate_retroactive && effective_from) {
      const { data: confirmedReports } = await serviceClient
        .from('monthly_reports')
        .select('*')
        .eq('pt_user_id', trainee_pt_user_id)
        .eq('payment_status', 'confirmed')
        .gte('year_month', effective_from)
        .order('year_month', { ascending: true });

      if (confirmedReports && confirmedReports.length > 0) {
        for (const report of confirmedReports) {
          // 이미 trainer_earnings 존재하는 건 제외
          const { data: existingEarning } = await serviceClient
            .from('trainer_earnings')
            .select('id')
            .eq('monthly_report_id', report.id)
            .maybeSingle();

          if (existingEarning) continue;

          const reportCosts = getReportCosts(report);
          const { netProfit, bonusAmount } = calculateTrainerBonus(
            report.reported_revenue,
            reportCosts,
            trainer.bonus_percentage,
          );

          if (bonusAmount > 0) {
            await serviceClient.from('trainer_earnings').insert({
              trainer_id,
              trainee_pt_user_id,
              monthly_report_id: report.id,
              year_month: report.year_month,
              trainee_net_profit: netProfit,
              bonus_percentage: trainer.bonus_percentage,
              bonus_amount: bonusAmount,
              payment_status: 'pending',
            });

            retroactiveCount++;
            retroactiveTotal += bonusAmount;
          }
        }

        // trainers.total_earnings 누적 업데이트
        if (retroactiveTotal > 0) {
          await serviceClient
            .from('trainers')
            .update({ total_earnings: (trainer.total_earnings || 0) + retroactiveTotal })
            .eq('id', trainer_id);
        }
      }
    }

    // 트레이너에게 알림
    const trainerProfileId = (trainer as Record<string, unknown>).pt_user
      ? ((trainer as Record<string, unknown>).pt_user as { profile_id: string }).profile_id
      : null;
    const traineeName = (trainee as Record<string, unknown>).profile
      ? ((trainee as Record<string, unknown>).profile as { full_name: string }).full_name
      : '이름 없음';

    if (trainerProfileId) {
      await notifyTrainerNewTrainee(serviceClient, trainerProfileId, traineeName);

      if (retroactiveTotal > 0) {
        await notifyTrainerBonusEarned(
          serviceClient,
          trainerProfileId,
          traineeName,
          `소급(${effective_from}~)`,
          retroactiveTotal,
        );
      }
    }

    // 활동 로그
    await logActivity(serviceClient, {
      adminId: admin.id,
      action: 'link_trainee',
      targetType: 'trainer_trainee',
      targetId: newLink.id,
      details: {
        trainer_id,
        trainee_pt_user_id,
        link_type: 'manual',
        link_reason: link_reason || null,
        effective_from: effective_from || null,
        retroactive_count: retroactiveCount,
        retroactive_total: retroactiveTotal,
      },
    });

    return NextResponse.json({
      success: true,
      link_id: newLink.id,
      retroactive_count: retroactiveCount,
      retroactive_total: retroactiveTotal,
    });
  } catch (error) {
    console.error('trainer-link POST error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// DELETE: 연결 해제
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = await requireAdmin(supabase);
    if (!admin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { trainer_trainee_id } = body;

    if (!trainer_trainee_id) {
      return NextResponse.json({ error: 'trainer_trainee_id가 필요합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    const { error } = await serviceClient
      .from('trainer_trainees')
      .update({ is_active: false })
      .eq('id', trainer_trainee_id);

    if (error) {
      return NextResponse.json({ error: '연결 해제에 실패했습니다.' }, { status: 500 });
    }

    // 활동 로그
    await logActivity(serviceClient, {
      adminId: admin.id,
      action: 'unlink_trainee',
      targetType: 'trainer_trainee',
      targetId: trainer_trainee_id,
      details: {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('trainer-link DELETE error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
