import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;

/**
 * POST /api/megaload/release-notes
 * 도우미 릴리스가 끝나면 **자동으로** 공지사항에 올린다.
 *
 * 왜 필요한가: 새 버전이 나가도 사용자는 무엇이 바뀌었는지 알 방법이 없었다.
 *   자동 업데이트라 앱은 조용히 새 버전이 되고, 좋아진 점은 아무도 모른 채 지나갔다.
 *   ("빨라졌다"는 말을 우리만 알고 있으면 빨라지지 않은 것과 같다.)
 *
 * 누가 부르나: GitHub Actions 릴리스 워크플로가 빌드 성공 후 1회.
 *   원문은 worker/desktop/RELEASE_NOTES.md 의 해당 버전 섹션이다 — 사람이 사용자 말로 써 둔 것.
 *
 * 인증: Bearer CRON_SECRET (브라우저 세션이 없으므로 쿠키 인증이 불가능하다).
 *   ⚠️ 이 경로는 미들웨어 PUBLIC_API_PREFIXES 에 반드시 있어야 한다 — 없으면 라우트에
 *      닿기도 전에 401 이라 "배포가 안 됐다"로 오진하게 된다(같은 함정을 두 번 겪었다).
 *
 * 멱등: 같은 버전으로 다시 부르면 새로 만들지 않고 내용만 갱신한다(워크플로 재실행 대비).
 */

/**
 * 공지 제목 규칙 — 이 규칙이 곧 **버전별 멱등키이자 "업데이트 공지" 표식**이다.
 * 화면(/megaload/notices)도 이 접두사로 업데이트 공지를 알아본다.
 * ⚠️ 바꾸려면 양쪽을 같이 바꿔야 한다.
 */
const titleFor = (version: string) => `도우미 v${version} 업데이트`;

/**
 * category 는 'system' 을 쓴다.
 *   notices.category 에 CHECK 제약이 걸려 있어 'update' 는 거부된다(실측 23514).
 *   값을 늘리려면 마이그레이션이 필요한데, 제목 접두사만으로 이미 구분되므로 그 비용을 지지 않는다.
 */
const NOTICE_CATEGORY = 'system';

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return NextResponse.json({ error: 'CRON_SECRET 미설정' }, { status: 500 });
    }
    const auth = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (auth !== secret) {
      return NextResponse.json({ error: '인증 실패' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { version?: string; notes?: string };
    const version = String(body.version || '').trim().replace(/^v/i, '');
    const notes = String(body.notes || '').trim();
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      return NextResponse.json({ error: 'version 형식이 올바르지 않습니다(예: 0.4.3).' }, { status: 400 });
    }
    if (notes.length < 10) {
      // 빈 공지는 올리지 않는다 — "업데이트됨"만 뜨는 공지는 안 읽느니만 못하다.
      return NextResponse.json({ error: '릴리스 노트 본문이 비어 있습니다.' }, { status: 400 });
    }

    const service = await createServiceClient();
    const title = titleFor(version);

    // 이미 올라간 버전이면 내용만 갱신한다(워크플로 재실행·오탈자 수정 대비).
    const { data: existing } = await service
      .from('notices')
      .select('id')
      .eq('title', title)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await service
        .from('notices')
        .update({ content: notes, is_published: true, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) throw error;
      return NextResponse.json({ ok: true, updated: true, version });
    }

    const { error } = await service.from('notices').insert({
      title,
      content: notes,
      category: NOTICE_CATEGORY,
      is_published: true,
      is_pinned: false,
    });
    if (error) throw error;

    return NextResponse.json({ ok: true, created: true, version });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
