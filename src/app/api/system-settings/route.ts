import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { logSystemError, logSystemSuccess } from '@/lib/utils/system-log';

export const maxDuration = 30;


// GET: 공개 읽기 — 비율/운영비 설정 조회용
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  try {
    const supabase = await createServiceClient();

    if (key) {
      const { data, error } = await supabase
        .from('system_settings')
        .select('key, value')
        .eq('key', key)
        .single();

      if (error || !data) {
        // 'PGRST116' = row not found — 정상 404, 로깅 X
        if (error && error.code !== 'PGRST116') {
          void logSystemError({ source: 'api/system-settings', error, context: { stage: 'select-by-key', key } }).catch(() => {});
        }
        return NextResponse.json({ error: '설정을 찾을 수 없습니다.' }, { status: 404 });
      }
      void logSystemSuccess({ source: 'api/system-settings' }).catch(() => {});
      return NextResponse.json(data);
    }

    const { data, error } = await supabase
      .from('system_settings')
      .select('key, value');

    if (error) {
      void logSystemError({ source: 'api/system-settings', error, context: { stage: 'select-all' } }).catch(() => {});
      // 클라이언트는 fallback 가지므로 빈 배열로 graceful — UI 깨지지 않음
      return NextResponse.json([], { status: 200 });
    }

    void logSystemSuccess({ source: 'api/system-settings' }).catch(() => {});
    return NextResponse.json(data || []);
  } catch (err) {
    // createServiceClient throw 또는 기타 unhandled — Supabase 일시 장애일 때 여기 옴
    void logSystemError({
      source: 'api/system-settings',
      error: err,
      context: { stage: 'unhandled', key: key || null },
    }).catch(() => {});
    // graceful degradation — 클라 fallback 동작하도록 빈 배열 반환
    return NextResponse.json([], { status: 200 });
  }
}
