import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';
import {
  notifyViolationCreated,
  notifyViolationInvestigating,
  notifyViolationActionTaken,
  notifyViolationResolved,
} from '@/lib/utils/notifications';

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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const category = searchParams.get('category');

    const serviceClient = await createServiceClient();

    let query = serviceClient
      .from('partner_violations')
      .select('*, pt_user:pt_users(id, profile_id, profile:profiles(id, full_name, email))')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (category && category !== 'all') {
      query = query.eq('violation_category', category);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const {
      pt_user_id, violation_category, violation_type,
      title, description, evidence, contract_article,
      action_level, correction_deadline, admin_notes,
      related_incident_id,
    } = body;

    if (!pt_user_id || !violation_category || !violation_type || !title) {
      return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // Create violation
    const { data, error } = await serviceClient
      .from('partner_violations')
      .insert({
        pt_user_id,
        violation_category,
        violation_type,
        title,
        description: description || null,
        evidence: evidence || null,
        contract_article: contract_article || null,
        action_level: action_level || null,
        correction_deadline: correction_deadline || null,
        admin_notes: admin_notes || null,
        related_incident_id: related_incident_id || null,
        reported_by: user.id,
        status: action_level ? 'action_taken' : 'reported',
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Create history entry
    await serviceClient.from('violation_history').insert({
      violation_id: data.id,
      new_status: data.status,
      new_action_level: action_level || null,
      changed_by: user.id,
      reason: '위반 등록',
    });

    // Update summary
    await updateViolationSummary(serviceClient, pt_user_id);

    // Notify partner
    const { data: ptUser } = await serviceClient
      .from('pt_users')
      .select('profile_id')
      .eq('id', pt_user_id)
      .single();

    if (ptUser?.profile_id) {
      await notifyViolationCreated(serviceClient, ptUser.profile_id, title);
    }

    // Activity log
    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'create_violation',
      targetType: 'violation',
      targetId: data.id,
      details: { violation_category, violation_type, action_level },
    });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { id, status, action_level, admin_notes, correction_deadline, reason } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'ID와 상태는 필수입니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // Get current violation
    const { data: current } = await serviceClient
      .from('partner_violations')
      .select('*, pt_user:pt_users(id, profile_id, profile:profiles(id, full_name))')
      .eq('id', id)
      .single();

    if (!current) {
      return NextResponse.json({ error: '위반 건을 찾을 수 없습니다.' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {
      status,
      reviewed_by: user.id,
      updated_at: new Date().toISOString(),
    };

    if (action_level !== undefined) updateData.action_level = action_level;
    if (admin_notes !== undefined) updateData.admin_notes = admin_notes;
    if (correction_deadline !== undefined) updateData.correction_deadline = correction_deadline;
    if (status === 'resolved') updateData.correction_completed_at = new Date().toISOString();

    const { data, error } = await serviceClient
      .from('partner_violations')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Create history entry
    await serviceClient.from('violation_history').insert({
      violation_id: id,
      previous_status: current.status,
      new_status: status,
      previous_action_level: current.action_level,
      new_action_level: action_level || current.action_level,
      changed_by: user.id,
      reason: reason || null,
    });

    // Update summary
    await updateViolationSummary(serviceClient, current.pt_user_id);

    // Notify partner
    const ptUser = current.pt_user as { id: string; profile_id: string; profile: { id: string; full_name: string } };
    if (ptUser?.profile_id) {
      if (status === 'investigating') {
        await notifyViolationInvestigating(serviceClient, ptUser.profile_id, current.title);
      } else if (status === 'action_taken' && action_level) {
        await notifyViolationActionTaken(serviceClient, ptUser.profile_id, current.title, action_level, correction_deadline);
      } else if (status === 'dismissed' || status === 'resolved') {
        await notifyViolationResolved(serviceClient, ptUser.profile_id, current.title, status === 'dismissed');
      }
    }

    // Activity log
    let action: string;
    switch (status) {
      case 'escalated': action = 'escalate_violation'; break;
      case 'resolved': action = 'resolve_violation'; break;
      case 'dismissed': action = 'dismiss_violation'; break;
      case 'terminated': action = 'terminate_violation'; break;
      default: action = 'update_violation';
    }

    await logActivity(serviceClient, {
      adminId: user.id,
      action: action as Parameters<typeof logActivity>[1]['action'],
      targetType: 'violation',
      targetId: id,
      details: { previous_status: current.status, new_status: status, action_level, reason },
    });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

/** Update violation_summary for a pt_user */
async function updateViolationSummary(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  ptUserId: string,
) {
  const { data: violations } = await supabase
    .from('partner_violations')
    .select('status, action_level, created_at')
    .eq('pt_user_id', ptUserId);

  if (!violations) return;

  const activeStatuses = ['reported', 'investigating', 'action_taken', 'escalated'];
  const active = violations.filter(v => activeStatuses.includes(v.status));

  const notice_count = violations.filter(v => v.action_level === 'notice').length;
  const warning_count = violations.filter(v => v.action_level === 'warning').length;
  const corrective_count = violations.filter(v => v.action_level === 'corrective').length;

  const risk_score = Math.min(
    (notice_count * 5) + (warning_count * 15) + (corrective_count * 30) + (active.length * 10),
    100,
  );

  const lastViolation = violations.length > 0
    ? violations.reduce((latest, v) => v.created_at > latest ? v.created_at : latest, violations[0].created_at)
    : null;

  await supabase
    .from('violation_summary')
    .upsert({
      pt_user_id: ptUserId,
      total_violations: violations.length,
      active_violations: active.length,
      notice_count,
      warning_count,
      corrective_count,
      last_violation_at: lastViolation,
      risk_score,
      updated_at: new Date().toISOString(),
    });
}
