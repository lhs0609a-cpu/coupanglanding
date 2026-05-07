import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractSpecsFromBase64Images, extractSpecsFromProductFolder } from '@/lib/megaload/services/product-info-ocr';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


/**
 * POST — 상품정보 이미지 OCR 스펙 추출
 *
 * 두 가지 모드:
 * 1. base64 이미지 직접 전송: { images: [{ data: string, mimeType: string }] }
 * 2. 서버 폴더 경로 지정: { folderPath: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    let specs: Record<string, string>;

    if (body.images && Array.isArray(body.images) && body.images.length > 0) {
      // 모드 1: base64 이미지 직접 처리
      specs = await extractSpecsFromBase64Images(body.images);
    } else if (body.folderPath && typeof body.folderPath === 'string') {
      // 모드 2: 서버 폴더에서 이미지 탐색
      specs = await extractSpecsFromProductFolder(body.folderPath);
    } else {
      return NextResponse.json(
        { error: 'images 배열 또는 folderPath가 필요합니다.' },
        { status: 400 },
      );
    }

    return NextResponse.json({ specs, fieldCount: Object.keys(specs).length });
  } catch (err) {
    console.error('[ocr-specs] 오류:', err);
    void logSystemError({ source: 'megaload/products/bulk-register/ocr-specs', error: err }).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'OCR 처리 실패' },
      { status: 500 },
    );
  }
}
