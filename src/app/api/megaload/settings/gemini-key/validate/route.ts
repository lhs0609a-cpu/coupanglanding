import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;


export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const apiKey = String(body.apiKey || '').trim();
    if (!apiKey) return NextResponse.json({ error: 'API 키가 비어있습니다.' }, { status: 400 });

    // Gemini REST endpoint — 가장 가벼운 listModels 호출로 키 유효성 확인 (과금 없음)
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { method: 'GET' },
    );

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error?.message || `HTTP ${res.status}`;
      return NextResponse.json(
        { ok: false, error: `키 검증 실패: ${msg}` },
        { status: 400 },
      );
    }

    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models : [];
    const hasImageModel = models.some((m: { name?: string }) =>
      m.name?.includes('flash-image'),
    );

    return NextResponse.json({
      ok: true,
      modelCount: models.length,
      hasImageModel,
      message: hasImageModel
        ? '✅ 유효한 키입니다. 이미지 생성 모델을 사용할 수 있습니다.'
        : '⚠️ 유효한 키지만 이미지 모델 접근 권한이 없습니다. 계정 설정 확인 필요.',
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : '검증 실패' },
      { status: 500 },
    );
  }
}
