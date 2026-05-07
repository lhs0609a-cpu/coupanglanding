import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readFile } from 'fs/promises';
import { resolve, extname } from 'path';

export const maxDuration = 30;


const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/**
 * GET — 로컬 파일 경로의 이미지를 읽어 브라우저에 전달 (프록시)
 * ?path=<encoded-path>
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const filePath = req.nextUrl.searchParams.get('path');
    if (!filePath) return NextResponse.json({ error: 'path 파라미터가 필요합니다.' }, { status: 400 });

    // Path traversal 방어: .. 포함 시 거부
    const resolved = resolve(filePath);
    if (resolved !== filePath && filePath.includes('..')) {
      return NextResponse.json({ error: '잘못된 경로입니다.' }, { status: 400 });
    }

    // 확장자 검증
    const ext = extname(resolved).toLowerCase();
    const contentType = MIME_MAP[ext];
    if (!contentType) {
      return NextResponse.json({ error: '지원하지 않는 이미지 형식입니다.' }, { status: 400 });
    }

    const buffer = await readFile(resolved);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
        'Content-Length': String(buffer.byteLength),
      },
    });
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '이미지 로드 실패' },
      { status: 500 },
    );
  }
}
