import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;

interface ImportRow {
  /** 학생 식별자 — 이메일 또는 이름 (이메일 우선) */
  identifier: string;
  /** 모듈별 상태 */
  modules: Record<string, {
    status?: 'locked' | 'triggered' | 'in_progress' | 'completed' | 'needs_review';
    notes?: string;
    subProgress?: Record<string, boolean>;
  }>;
}

interface ImportBody {
  rows: ImportRow[];
  /** true 면 매칭 실패한 row 도 명시적으로 보고 (기본: 모두 skip) */
  strict?: boolean;
}

interface ImportResult {
  matched: number;
  notMatched: string[];
  updatedRows: number;
  errors: { identifier: string; error: string }[];
}

/**
 * POST /api/admin/education/import
 * 기존 시트 데이터 일괄 import.
 * 학생 매칭: profile.email 또는 profile.full_name 으로 pt_users 찾음.
 * 각 모듈별 status/notes/subProgress 를 upsert.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !['admin', 'partner'].includes(profile.role)) {
      return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 });
    }

    const body = (await req.json()) as ImportBody;
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ error: 'rows 가 비어있습니다' }, { status: 400 });
    }
    if (body.rows.length > 500) {
      return NextResponse.json({ error: '한 번에 500명까지만 import 가능합니다' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 1) 모든 식별자에 대해 pt_user 한번에 조회 (email + name)
    const identifiers = body.rows.map(r => r.identifier.trim()).filter(Boolean);

    const { data: profiles } = await serviceClient
      .from('profiles')
      .select('id, email, full_name')
      .or(identifiers.map(id => `email.eq.${id},full_name.eq.${id}`).join(','));

    const profileMap = new Map<string, { id: string; email: string; full_name: string }>();
    for (const p of (profiles || []) as { id: string; email: string; full_name: string }[]) {
      if (p.email) profileMap.set(p.email.toLowerCase(), p);
      if (p.full_name) profileMap.set(p.full_name, p);
    }

    // profile_id → pt_user_id 매핑
    const profileIds = Array.from(new Set([...profileMap.values()].map(p => p.id)));
    const { data: ptUsers } = await serviceClient
      .from('pt_users')
      .select('id, profile_id')
      .in('profile_id', profileIds);
    const ptUserByProfileId = new Map<string, string>();
    for (const u of (ptUsers || []) as { id: string; profile_id: string }[]) {
      ptUserByProfileId.set(u.profile_id, u.id);
    }

    // 2) 모듈 키 검증용 마스터
    const { data: modules } = await serviceClient
      .from('pt_education_modules').select('key').eq('is_active', true);
    const validModuleKeys = new Set((modules || []).map(m => (m as { key: string }).key));

    // 3) 각 row 처리
    const result: ImportResult = { matched: 0, notMatched: [], updatedRows: 0, errors: [] };
    const now = new Date().toISOString();

    for (const row of body.rows) {
      const idKey = row.identifier.trim();
      const profile = profileMap.get(idKey.toLowerCase()) || profileMap.get(idKey);
      const ptUserId = profile ? ptUserByProfileId.get(profile.id) : null;
      if (!ptUserId) {
        result.notMatched.push(idKey);
        continue;
      }
      result.matched++;

      // 학생에게 모든 모듈 진행 row 보장 (ensure RPC)
      await serviceClient.rpc('ensure_pt_education_progress', { p_pt_user_id: ptUserId });

      // 각 모듈별로 upsert
      const upserts: Record<string, unknown>[] = [];
      for (const [moduleKey, m] of Object.entries(row.modules)) {
        if (!validModuleKeys.has(moduleKey)) continue;
        const u: Record<string, unknown> = {
          pt_user_id: ptUserId,
          module_key: moduleKey,
          trainer_id: user.id,
        };
        if (m.status) {
          u.status = m.status;
          if (m.status === 'triggered') u.triggered_at = now;
          if (m.status === 'in_progress') { u.triggered_at = now; u.started_at = now; }
          if (m.status === 'completed') u.completed_at = now;
        }
        if (m.notes !== undefined) u.notes = m.notes;
        if (m.subProgress) u.sub_progress = m.subProgress;
        upserts.push(u);
      }

      if (upserts.length > 0) {
        const { error } = await serviceClient
          .from('pt_education_progress')
          .upsert(upserts, { onConflict: 'pt_user_id,module_key' });
        if (error) {
          result.errors.push({ identifier: idKey, error: error.message });
        } else {
          result.updatedRows += upserts.length;
        }
      }
    }

    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 },
    );
  }
}
