import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;

type TaskType = 'display_name' | 'content' | 'options' | 'category';
const TASKS: TaskType[] = ['display_name', 'content', 'options', 'category'];

interface JobInput {
  /** "{uid}:{task}" — 결과를 어느 상품/필드에 적용할지 */
  label: string;
  taskType: TaskType;
  /** 생성 컨텍스트(상품명/카테고리/현재값 등) */
  input: Record<string, unknown>;
}
interface EnqueueBody {
  jobs: JobInput[];
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
      .filter((j) => j && typeof j.label === 'string' && TASKS.includes(j.taskType) && j.input && typeof j.input === 'object')
      .slice(0, MAX_JOBS);

    if (cleaned.length === 0) {
      return NextResponse.json({ error: '유효한 잡이 없습니다 (label/taskType/input 확인).' }, { status: 400 });
    }

    const batchId = randomUUID();
    const rows = cleaned.map((j) => ({
      megaload_user_id: shUserId,
      batch_id: batchId,
      label: j.label,
      task_type: j.taskType,
      input: j.input,
      status: 'pending',
    }));

    const { error: insErr } = await serviceClient.from('megaload_llm_jobs').insert(rows);
    if (insErr) {
      return NextResponse.json({ error: `잡 생성 실패: ${insErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ batchId, count: rows.length });
  } catch (err) {
    void logSystemError({ source: 'megaload/products/llm-jobs/enqueue', error: err }).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '잡 생성 실패' },
      { status: 500 },
    );
  }
}
