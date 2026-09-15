import type { KbEntry, KbMedia } from '../types';
import { buildIndex, type KbIndex } from '../retrieval';
import { OPERATOR_KB } from './operator';
import { TROUBLESHOOTING_KB } from './troubleshooting';
import { PRACTICAL_KB } from './practical';
import { pageKbEntries } from './pages';
import { buildAppDataKb } from './from-app-data';

/**
 * KB 조립 + 색인 캐시.
 *
 * 정적 KB(코드에 박힌 것)는 프로세스가 사는 동안 한 번만 만든다.
 * DB KB(faqs / notices / assistant_kb_entries)는 관리자가 고치면 바로 반영돼야 하므로
 * TTL 5분으로 다시 읽는다. 서버리스에서 인스턴스가 짧게 살아 실제로는 거의 매번 새로 읽는다.
 */

let staticCache: KbEntry[] | null = null;

export function staticKb(): KbEntry[] {
  if (!staticCache) {
    staticCache = [
      ...OPERATOR_KB,
      ...PRACTICAL_KB,
      ...TROUBLESHOOTING_KB,
      ...pageKbEntries(),
      ...buildAppDataKb(),
    ];
  }
  return staticCache;
}

// ── DB KB ────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
// supabase-js 빌더는 체이닝 형태가 쿼리마다 달라 구조적 타입으로 묶기 어렵다.
// 이 파일 안의 쿼리는 전부 try/catch 로 감싸므로 느슨하게 받는다.
type DbClient = any;

interface CachedDb {
  at: number;
  entries: KbEntry[];
}

let dbCache: CachedDb | null = null;
const DB_TTL_MS = 5 * 60 * 1000;

/** faqs / notices / assistant_kb_entries 를 KB 항목으로 읽어온다. 실패해도 절대 던지지 않는다. */
export async function dbKb(client: DbClient): Promise<KbEntry[]> {
  if (dbCache && Date.now() - dbCache.at < DB_TTL_MS) return dbCache.entries;

  const entries: KbEntry[] = [];

  // 1) FAQ
  try {
    const { data } = await client
      .from('faqs')
      .select('id, category, question, answer')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .limit(500);
    for (const row of (data || []) as Array<Record<string, unknown>>) {
      const q = String(row.question ?? '');
      const a = String(row.answer ?? '');
      if (!q || !a) continue;
      entries.push({
        id: `faq-${row.id}`,
        title: q,
        summary: a.slice(0, 160),
        body: a,
        tags: ['FAQ', q, String(row.category ?? '')].filter(Boolean),
        audience: 'all',
        priority: 60,
        source: 'faq',
        link: { label: 'FAQ 보기', href: '/my/faq' },
      });
    }
  } catch {
    /* FAQ 테이블이 없거나 권한이 없어도 상담은 계속돼야 한다 */
  }

  // 2) 공지 — 최근 것만. "최근 공지 알려줘"에 답할 수 있게.
  try {
    const { data } = await client
      .from('notices')
      .select('id, title, content, category, created_at')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(30);
    for (const row of (data || []) as Array<Record<string, unknown>>) {
      const title = String(row.title ?? '');
      const content = String(row.content ?? '');
      if (!title) continue;
      entries.push({
        id: `notice-${row.id}`,
        title: `[공지] ${title}`,
        summary: content.slice(0, 160),
        body: `${content}\n\n(게시일: ${String(row.created_at ?? '').slice(0, 10)})`,
        tags: ['공지', '공지사항', title, String(row.category ?? '')].filter(Boolean),
        audience: 'all',
        priority: String(row.category) === 'emergency' ? 85 : 55,
        source: 'notice',
        link: { label: '공지사항 보기', href: '/my/notices' },
      });
    }
  } catch {
    /* noop */
  }

  // 3) 관리자가 직접 넣은 KB — 배포 없이 즉시 반영
  try {
    const { data } = await client
      .from('assistant_kb_entries')
      .select('id, slug, title, summary, body, tags, paths, audience, priority')
      .eq('is_published', true)
      .order('priority', { ascending: false })
      .limit(500);
    for (const row of (data || []) as Array<Record<string, unknown>>) {
      const title = String(row.title ?? '');
      const body = String(row.body ?? '');
      if (!title || !body) continue;
      entries.push({
        id: `adminkb-${row.slug ?? row.id}`,
        title,
        summary: String(row.summary ?? body.slice(0, 160)),
        body,
        tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
        paths: Array.isArray(row.paths) ? (row.paths as string[]) : undefined,
        audience: (['public', 'pt', 'megaload', 'all'].includes(String(row.audience))
          ? String(row.audience)
          : 'all') as KbEntry['audience'],
        // 관리자가 직접 쓴 항목은 정적 KB 보다 위에 오게 기본값을 높인다.
        priority: typeof row.priority === 'number' ? row.priority + 100 : 100,
        source: 'admin-kb',
      });
    }
  } catch {
    /* 마이그레이션 전이면 테이블이 없다 */
  }

  // 4) 교육 영상 — 봇이 답변에 영상을 띄울 수 있게
  try {
    const { data } = await client
      .from('training_videos')
      .select('id, title, description, youtube_id, category, duration_seconds')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .limit(200);
    for (const row of (data || []) as Array<Record<string, unknown>>) {
      const title = String(row.title ?? '');
      const ytId = String(row.youtube_id ?? '');
      if (!title || !ytId) continue;
      const desc = String(row.description ?? '');
      const mins = Number(row.duration_seconds)
        ? ` (${Math.round(Number(row.duration_seconds) / 60)}분)`
        : '';
      entries.push({
        id: `video-${row.id}`,
        title: `[영상] ${title}`,
        summary: desc.slice(0, 160) || `${title} 교육 영상${mins}`,
        body: `**${title}**${mins}

${desc}

이 영상을 보여주면 됩니다. 말로 설명하기 어려운 화면 조작은 영상이 훨씬 빠릅니다.`,
        tags: ['영상', '교육영상', '동영상', title, String(row.category ?? '')].filter(Boolean),
        paths: ['/my/training-videos'],
        audience: 'pt',
        priority: 70,
        source: 'tutorial',
        link: { label: '교육 영상 보기', href: '/my/training-videos' },
        media: [{ kind: 'youtube', src: ytId, caption: title }],
      });
    }
  } catch {
    /* noop */
  }

  // 5) 가이드 단계 캡처 — 기존 KB 항목(guide-*)에 이미지를 덧붙인다
  try {
    const { data } = await client
      .from('guide_step_images')
      .select('article_id, step_index, image_url, alt_text, caption, display_order')
      .order('display_order', { ascending: true })
      .limit(1000);
    const byArticle = new Map<string, KbMedia[]>();
    for (const row of (data || []) as Array<Record<string, unknown>>) {
      const articleId = String(row.article_id ?? '');
      const url = String(row.image_url ?? '');
      if (!articleId || !url) continue;
      const list = byArticle.get(articleId) ?? [];
      if (list.length >= 4) continue;
      list.push({
        kind: 'image',
        src: url,
        alt: String(row.alt_text ?? ''),
        caption: String(row.caption ?? '') || undefined,
      });
      byArticle.set(articleId, list);
    }
    // 정적 KB 의 guide-<articleId> 항목에 주입 (원본 배열을 건드리지 않게 복사본으로)
    if (byArticle.size) {
      guideImageOverlay = byArticle;
    }
  } catch {
    /* noop */
  }

  dbCache = { at: Date.now(), entries };
  return entries;
}

/** DB 에서 읽은 가이드 단계 캡처 — staticKb 의 guide-* 항목에 덧입힌다. */
let guideImageOverlay: Map<string, KbMedia[]> | null = null;

// ── 전체 KB + 색인 ───────────────────────────────────────

interface CachedIndex {
  at: number;
  entries: KbEntry[];
  index: KbIndex;
}

let indexCache: CachedIndex | null = null;

export async function getKb(client?: DbClient | null): Promise<{ entries: KbEntry[]; index: KbIndex }> {
  const fromDb = client ? await dbKb(client) : [];

  // DB 에 등록된 가이드 캡처가 있으면 해당 정적 항목에 이미지를 덧입힌다.
  const base = guideImageOverlay
    ? staticKb().map((e) => {
        if (!e.id.startsWith('guide-')) return e;
        const imgs = guideImageOverlay!.get(e.id.slice('guide-'.length));
        return imgs?.length ? { ...e, media: [...(e.media ?? []), ...imgs].slice(0, 4) } : e;
      })
    : staticKb();

  const entries = [...base, ...fromDb];

  // DB 항목 수가 그대로면 이전 색인을 재사용한다.
  if (indexCache && indexCache.entries.length === entries.length && Date.now() - indexCache.at < DB_TTL_MS) {
    return { entries: indexCache.entries, index: indexCache.index };
  }

  const index = buildIndex(entries);
  indexCache = { at: Date.now(), entries, index };
  return { entries, index };
}

export function findEntry(entries: KbEntry[], id: string): KbEntry | null {
  return entries.find((e) => e.id === id) ?? null;
}

export { PAGE_MAP, resolvePage, resolveSurface } from './pages';
