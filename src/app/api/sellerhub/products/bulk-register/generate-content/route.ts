import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateProductStory } from '@/lib/sellerhub/services/ai.service';

/**
 * POST — AI 상세페이지 스토리 생성
 * body: { productName, category, features, description }
 * → { html, model, creditsUsed }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as {
      productName: string;
      category?: string;
      features?: string[];
      description?: string;
    };

    if (!body.productName) {
      return NextResponse.json({ error: '상품명이 필요합니다.' }, { status: 400 });
    }

    const result = await generateProductStory(
      body.productName,
      body.category || '',
      body.features || [],
      body.description,
    );

    if (!result.content) {
      return NextResponse.json(
        { error: 'AI 스토리 생성 실패 (API 키가 설정되지 않았거나 요청 실패)' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      html: result.content,
      model: result.model,
      creditsUsed: result.creditsUsed,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI 생성 실패' },
      { status: 500 },
    );
  }
}
