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

/** 공백·기호를 전부 지워 붙인 문자열. "이미지 몇 장" 과 "이미지몇장" 을 같게 본다. */
export function flatten(text: string): string {
  return text.toLowerCase().replace(/[^0-9a-z가-힣]+/g, '');
}

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
  /** 구절 매칭용 — 공백·기호를 지운 제목+태그 (예: "이미지몇장넣어야해요") */
  flatTitleTags: string;
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

    docs.push({
      entry,
      tf,
      length: length || 1,
      flatTitleTags: flatten(`${entry.title} ${entry.tags.join(' ')}`),
    });
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
// 짧은 문서가 과도하게 유리해지지 않게 길이 보정을 낮춘다(0.6 → 0.35).
const B = 0.35;

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

  // 구절 매칭 재료
  const flatQuery = flatten(query);
  // 조사·군말을 뺀 내용어만 남긴다 (2글자 이상 어절)
  const contentWords = query
    .toLowerCase()
    .replace(/[^0-9a-z가-힣\s]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/(이에요|예요|인가요|한가요|나요|까요|어요|아요|해요|에서|으로|에게|까지|부터|이랑|하고|은|는|이|가|을|를|에|의|도|만|와|과)$/, ''))
    .filter((w) => w.length >= 2);
  const askingAboutScreen = /화면|페이지|메뉴|탭|어디|여기/.test(query);
  const mentionsAds = /광고|roas|입찰|키워드|캠페인/i.test(query);

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

    // ── 구절 매칭 가산 ──
    // BM25 만으로는 "반품 요청 왔어요" 같은 짧은 질의에서 제목이 정확히 맞는 문서가
    // 토큰이 많은 긴 문서에 밀린다. 질의의 내용어가 제목·태그에 통째로 들어 있으면 크게 올린다.
    if (flatQuery.length >= 2) {
      if (doc.flatTitleTags.includes(flatQuery)) score *= 2.6;       // 질의 전체가 제목/태그에 있음
      else {
        let covered = 0;
        for (const w of contentWords) if (doc.flatTitleTags.includes(w)) covered++;
        if (contentWords.length && covered === contentWords.length) score *= 2.0;
        else if (covered >= 2) score *= 1.5;
      }
    }

    // ── 문서 종류 보정 ──
    // '[화면] xxx' 항목은 본문이 짧아 BM25 길이 보정에서 유리해 자꾸 1위로 올라온다.
    // "이 화면 뭐야" 류가 아니면 눌러둔다. 현재 보고 있는 경로면 예외.
    if (doc.entry.source === 'page') {
      const onThisPage = !!path && !!doc.entry.paths?.some((p) => path === p || path.startsWith(p + '/'));
      if (!askingAboutScreen && !onThisPage) score *= 0.45;
    }
    // 광고 아카데미 스테이지는 태그가 많아 광고와 무관한 질의에도 걸린다.
    if (doc.entry.id.startsWith('adacademy-') && !mentionsAds) score *= 0.5;

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
    // 운영 노하우·긴급 대응을 위로. 예전엔 /500 이라 거의 차이가 없어
    // 우선순위 100 짜리 실무 문서가 40 짜리 화면 설명에 밀렸다.
    score *= 1 + (doc.entry.priority ?? 0) / 160;

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
