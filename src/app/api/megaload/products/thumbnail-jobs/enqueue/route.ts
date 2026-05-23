import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;

interface JobInput {
  sourceUrl: string;
  productCode?: string;
  label?: string;
}
interface EnqueueBody {
  jobs: JobInput[];
  prompt?: string;
  negativePrompt?: string;
  /** 'cutout'(기본): 누끼+흰배경 / 'regenerate': SDXL img2img 재생성(잘림·지저분·흐림 대표사진 정리) */
  mode?: 'cutout' | 'regenerate';
}

const MAX_JOBS = 2000;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Megaload 계정이 없습니다.' },
        { status: 404 },
      );
    }

    const body = (await req.json()) as EnqueueBody;
    const jobs = Array.isArray(body.jobs) ? body.jobs : [];
    const cleaned = jobs
      .filter((j) => j && typeof j.sourceUrl === 'string' && /^https?:\/\//i.test(j.sourceUrl))
      .slice(0, MAX_JOBS);

    if (cleaned.length === 0) {
      return NextResponse.json({ error: '유효한 sourceUrl(http/https)이 없습니다.' }, { status: 400 });
    }

    const batchId = randomUUID();
    const mode = body.mode === 'regenerate' ? 'regenerate' : 'cutout';
    // 우선순위: 요청에 명시된 프롬프트 > 계정 기본값(설정 화면 저장) > NULL(워커 내장 기본값)
    let prompt = body.prompt?.trim() || null;
    let negativePrompt = body.negativePrompt?.trim() || null;
    if (prompt === null || negativePrompt === null) {
      const { data: defaults } = await serviceClient
        .from('megaload_users')
        .select('thumbnail_prompt, thumbnail_negative_prompt')
        .eq('id', shUserId)
        .single();
      if (prompt === null) prompt = (defaults?.thumbnail_prompt as string | null)?.trim() || null;
      if (negativePrompt === null) negativePrompt = (defaults?.thumbnail_negative_prompt as string | null)?.trim() || null;
    }

    const rows = cleaned.map((j) => ({
      megaload_user_id: shUserId,
      batch_id: batchId,
      source_url: j.sourceUrl,
      product_code: j.productCode ?? null,
      label: j.label ?? null,
      prompt,
      negative_prompt: negativePrompt,
      mode,
      status: 'pending',
    }));

    const { error: insErr } = await serviceClient.from('megaload_thumbnail_jobs').insert(rows);
    if (insErr) {
      return NextResponse.json({ error: `잡 생성 실패: ${insErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ batchId, count: rows.length });
  } catch (err) {
    void logSystemError({ source: 'megaload/products/thumbnail-jobs/enqueue', error: err }).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '잡 생성 실패' },
      { status: 500 },
    );
  }
}
