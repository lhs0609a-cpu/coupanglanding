import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateProductStoriesBatch, type StoryBatchInput } from '@/lib/megaload/services/ai.service';

export const maxDuration = 55;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { products } = await req.json() as { products: StoryBatchInput[] };
    if (!products?.length) return NextResponse.json({ error: '상품 목록 필요' }, { status: 400 });
    if (products.length > 100) return NextResponse.json({ error: '최대 100개' }, { status: 400 });

    const rawResults = await generateProductStoriesBatch(products);

    const results = rawResults.map(r => {
      if (!r.content) return { paragraphs: [], reviewTexts: [] };
      try {
        const parsed = JSON.parse(r.content);
        return {
          paragraphs: parsed.paragraphs || [],
          reviewTexts: parsed.reviewTexts || [],
        };
      } catch {
        return { paragraphs: [], reviewTexts: [] };
      }
    });

    return NextResponse.json({ results, totalCount: results.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '콘텐츠 생성 실패' },
      { status: 500 },
    );
  }
}
