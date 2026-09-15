import type { KbEntry } from '../types';
import { buildIndex, type KbIndex } from '../retrieval';
import { OPERATOR_KB } from './operator';
import { TROUBLESHOOTING_KB } from './troubleshooting';
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
      ...TROUBLESHOOTING_KB,
      ...pageKbEntries(),
      ...buildAppDataKb(),
    ];
  }
  return staticCache;
}

// ── DB KB ────────────────────────────────────────────────

interface DbClient {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        order: (col: string, opts?: { ascending?: boolean }) => {
          limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }>;
        };
      };
    };
  };
}

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

  dbCache = { at: Date.now(), entries };
  return entries;
}

// ── 전체 KB + 색인 ───────────────────────────────────────

interface CachedIndex {
  at: number;
  entries: KbEntry[];
  index: KbIndex;
}

let indexCache: CachedIndex | null = null;

export async function getKb(client?: DbClient | null): Promise<{ entries: KbEntry[]; index: KbIndex }> {
  const fromDb = client ? await dbKb(client) : [];
  const entries = [...staticKb(), ...fromDb];

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
