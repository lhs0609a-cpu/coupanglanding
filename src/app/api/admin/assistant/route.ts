import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

/* eslint-disable @typescript-eslint/no-explicit-any */

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: '인증 필요' }, { status: 401 }) };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== 'admin' && role !== 'partner') {
    return { error: NextResponse.json({ error: '권한 없음' }, { status: 403 }) };
  }
  return { user };
}

/**
 * GET  ?tab=conversations&filter=all|escalated|unhelpful  → 대화 목록
 * GET  ?conversationId=...                                → 대화 상세(메시지)
 * GET  ?tab=kb                                            → 관리자 KB 목록
 */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get('conversationId');
  const tab = searchParams.get('tab') || 'conversations';

  try {
    const sc: any = await createServiceClient();

    if (conversationId) {
      const [{ data: conv }, { data: messages }] = await Promise.all([
        sc.from('assistant_conversations').select('*').eq('id', conversationId).maybeSingle(),
        sc
          .from('assistant_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
          .limit(200),
      ]);
      return NextResponse.json({ conversation: conv, messages: messages || [] });
    }

    if (tab === 'kb') {
      const { data } = await sc
        .from('assistant_kb_entries')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(300);
      return NextResponse.json({ entries: data || [] });
    }

    const filter = searchParams.get('filter') || 'all';
    let q = sc
      .from('assistant_conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(100);
    if (filter === 'escalated') q = q.eq('escalated', true);
    if (filter === 'unhelpful') q = q.gt('unhelpful_count', 0);

    const { data } = await q;

    // 목록에 첫 질문을 같이 보여주면 훑기가 쉬워진다
    const rows = (data || []) as Array<Record<string, any>>;
    const ids = rows.map((r) => r.id);
    const firstQuestion = new Map<string, string>();
    if (ids.length) {
      const { data: msgs } = await sc
        .from('assistant_messages')
        .select('conversation_id, content, created_at, role')
        .in('conversation_id', ids)
        .eq('role', 'user')
        .order('created_at', { ascending: true })
        .limit(600);
      for (const m of ((msgs || []) as Array<Record<string, any>>)) {
        if (!firstQuestion.has(m.conversation_id)) firstQuestion.set(m.conversation_id, m.content);
      }
    }

    return NextResponse.json({
      conversations: rows.map((r) => ({ ...r, first_question: firstQuestion.get(r.id) ?? r.title ?? '' })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '조회 실패', conversations: [], entries: [] },
      { status: 200 },
    );
  }
}

/** 관리자 KB 추가/수정 — 배포 없이 봇 지식을 바로 보강한다. */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const title = String(body.title ?? '').trim();
  const bodyText = String(body.body ?? '').trim();
  if (!title || !bodyText) {
    return NextResponse.json({ error: '제목과 본문이 필요합니다.' }, { status: 400 });
  }

  const slug =
    String(body.slug ?? '').trim() ||
    `kb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  try {
    const sc: any = await createServiceClient();
    const { error } = await sc.from('assistant_kb_entries').upsert(
      {
        slug,
        title,
        summary: String(body.summary ?? bodyText.slice(0, 160)),
        body: bodyText,
        tags: Array.isArray(body.tags) ? body.tags : String(body.tags ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        paths: Array.isArray(body.paths) ? body.paths : String(body.paths ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        audience: ['public', 'pt', 'megaload', 'all'].includes(String(body.audience)) ? body.audience : 'all',
        priority: Number(body.priority) || 0,
        is_published: body.is_published !== false,
        created_by: guard.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'slug' },
    );
    if (error) throw error;
    return NextResponse.json({ ok: true, slug });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '저장 실패' }, { status: 500 });
  }
}

/** 대화 검토 완료 표시 / KB 삭제 */
export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  let body: { conversationId?: string; reviewed?: boolean; deleteKbSlug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  try {
    const sc: any = await createServiceClient();
    if (body.deleteKbSlug) {
      await sc.from('assistant_kb_entries').delete().eq('slug', body.deleteKbSlug);
      return NextResponse.json({ ok: true });
    }
    if (body.conversationId) {
      await sc
        .from('assistant_conversations')
        .update({ reviewed: body.reviewed !== false })
        .eq('id', body.conversationId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: '대상이 없습니다.' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '처리 실패' }, { status: 500 });
  }
}
