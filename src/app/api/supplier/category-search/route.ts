/**
 * GET /api/supplier/category-search?q=감자
 *   카테고리 자동완성 — 키워드로 leaf/경로 검색 → [{ code, path, name }]
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchCategories } from '@/lib/megaload/services/category-matcher';

export const maxDuration = 15;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const q = request.nextUrl.searchParams.get('q') || '';
  if (q.trim().length < 1) return NextResponse.json({ results: [] });

  try {
    const results = searchCategories(q, 30);
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '검색 실패', results: [] }, { status: 500 });
  }
}
