import type { KbEntry, KbHit, AssistantSurface } from './types';

/**
 * 한국어에 맞춘 가벼운 어휘 검색.
 *
 * 임베딩을 쓰지 않는 이유:
 *  - KB 가 수백 건 규모라 어휘 검색으로 충분히 상위권이 잡힌다.
 *  - 임베딩은 빌드 파이프라인 + 벡터 테이블 + 갱신 주기를 만들어야 하는데,
 *    그만큼의 정확도 이득이 없고 KB 를 고칠 때마다 재색인이 필요해진다.
 *  - 최종 선택은 LLM 이 한다. 검색은 후보를 넉넉히(20건) 넘겨주는 역할만 하면 된다.
 *
 * 한글은 형태소 분석기 없이 어절 + 문자 bigram 을 함께 토큰으로 쓴다.
 * "상품등록" 질의가 "대량 상품 등록"에도 걸리게 하는 게 목적이다.
 */

const HANGUL = /[가-힣]/;

/** 조사·접미가 붙어도 겹치도록 어절 + 문자 bigram 을 함께 낸다. */
export function tokenize(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, ' ')
    .trim();
  if (!cleaned) return [];

  const tokens: string[] = [];
  for (const word of cleaned.split(/\s+/)) {
    if (!word) continue;
    tokens.push(word);
    if (HANGUL.test(word) && word.length >= 2) {
      for (let i = 0; i < word.length - 1; i++) tokens.push(word.slice(i, i + 2));
      // 3-gram 도 넣으면 "상품등록" 같은 합성어 정확도가 올라간다.
      for (let i = 0; i < word.length - 2; i++) tokens.push(word.slice(i, i + 3));
    }
  }
  return tokens;
}

interface IndexedDoc {
  entry: KbEntry;
  /** token → 가중치 합 */
  tf: Map<string, number>;
  length: number;
}

export interface KbIndex {
  docs: IndexedDoc[];
  /** token → 몇 개 문서에 등장하는가 */
  df: Map<string, number>;
  avgLength: number;
}

const FIELD_WEIGHT = { title: 6, tags: 5, summary: 2, body: 1 } as const;

export function buildIndex(entries: KbEntry[]): KbIndex {
  const docs: IndexedDoc[] = [];
  const df = new Map<string, number>();

  for (const entry of entries) {
    const tf = new Map<string, number>();
    const add = (text: string, weight: number) => {
      for (const t of tokenize(text)) tf.set(t, (tf.get(t) || 0) + weight);
    };
    add(entry.title, FIELD_WEIGHT.title);
    add(entry.tags.join(' '), FIELD_WEIGHT.tags);
    add(entry.summary, FIELD_WEIGHT.summary);
    add(entry.body, FIELD_WEIGHT.body);

    let length = 0;
    for (const v of tf.values()) length += v;
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);

    docs.push({ entry, tf, length: length || 1 });
  }

  const avgLength = docs.length ? docs.reduce((s, d) => s + d.length, 0) / docs.length : 1;
  return { docs, df, avgLength };
}

export interface SearchOptions {
  /** 현재 보고 있는 경로 — 해당 화면 문서에 가산점 */
  path?: string | null;
  /** 현재 표면 — 안 맞는 대상의 문서는 감점(제외하지는 않음) */
  surface?: AssistantSurface;
  limit?: number;
  /** 이미 본 문서는 제외 */
  excludeIds?: string[];
}

const K1 = 1.4;
const B = 0.6;

export function searchKb(index: KbIndex, query: string, opts: SearchOptions = {}): KbHit[] {
  const limit = opts.limit ?? 20;
  const qTokens = tokenize(query);
  if (!qTokens.length) return [];

  // 같은 토큰이 여러 번 나와도 한 번만 센다 (bigram 중복 폭주 방지)
  const uniq = new Map<string, number>();
  for (const t of qTokens) uniq.set(t, Math.min((uniq.get(t) || 0) + 1, 3));

  const N = index.docs.length || 1;
  const exclude = new Set(opts.excludeIds || []);
  const path = (opts.path || '').split('?')[0];

  const hits: KbHit[] = [];
  for (const doc of index.docs) {
    if (exclude.has(doc.entry.id)) continue;

    let score = 0;
    for (const [token, qWeight] of uniq) {
      const f = doc.tf.get(token);
      if (!f) continue;
      const n = index.df.get(token) || 1;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      const norm = f * (K1 + 1) / (f + K1 * (1 - B + B * (doc.length / index.avgLength)));
      score += idf * norm * qWeight;
    }
    if (score <= 0) continue;

    // 현재 화면과 관련된 문서를 위로
    if (path && doc.entry.paths?.some((p) => path === p || path.startsWith(p + '/'))) {
      score *= 1.35;
    }
    // 표면 적합도
    if (opts.surface) {
      const a = doc.entry.audience;
      if (a !== 'all') {
        if (opts.surface === 'public' && a !== 'public') score *= 0.75;
        else if (opts.surface === 'megaload' && a === 'public') score *= 0.85;
        else if (opts.surface === 'pt' && a === 'public') score *= 0.85;
      }
    }
    // 운영 노하우·긴급 대응처럼 중요한 문서를 살짝 위로
    score *= 1 + (doc.entry.priority ?? 0) / 500;

    hits.push({ entry: doc.entry, score });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

/** 현재 화면에서 미리 보여줄 문서 (질의 없이) */
export function pageRelevantEntries(entries: KbEntry[], path: string | null | undefined, limit = 6): KbEntry[] {
  if (!path) return [];
  const clean = path.split('?')[0];
  return entries
    .filter((e) => e.paths?.some((p) => clean === p || clean.startsWith(p + '/')))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, limit);
}
