import type { KbEntry, KbHit, AssistantSurface } from './types';
import { expandSynonyms } from './glossary';

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

/**
 * 질문에서만 나오고 문서 제목에는 없는 군말. 이게 내용어로 잡히면
 * "프로모션 어떻게 걸어요" 가 '프로모션' 문서에서 커버리지 1/2 로 떨어져 밀린다.
 */
const STOPWORDS = new Set([
  '어떻게', '어떡해', '어떡하죠', '어디', '어디서', '언제', '무엇', '뭐가', '뭘', '뭔가요',
  '왜요', '누가', '얼마나', '얼마', '몇개', '하나요', '되나요', '있나요', '없나요', '인가요',
  '있어요', '없어요', '해요', '해야', '하면', '하는', '해도', '되는', '돼요', '같아요', '같은데',
  '주세요', '알려줘', '알려주세요', '궁금해요', '문의', '질문', '이거', '저거', '그거', '요거',
  '지금', '좀', '제가', '저는', '내가', '나는', '우리', '것을', '것이', '건가요', '건데', '건지',
  '싶어요', '싶은데', '봐주세요', '봐줘', '해줘', '해주세요', '가요', '가나요', '나요',
]);

/** 질의에서 의미 있는 단어만 뽑는다 (불용어·1글자 제거). */
export function extractContentWords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^0-9a-z가-힣\s]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
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

  // 구어 → 문서말 확장. 원문 토큰보다 가중치를 낮게 줘서 보조로만 쓴다.
  //   "똑같은 걸 두 번 올렸다" 에 '중복','등록' 을 얹는 식.
  const synonyms = expandSynonyms(query);
  for (const syn of synonyms) {
    for (const t of tokenize(syn)) {
      if (!uniq.has(t)) uniq.set(t, 2);
    }
  }

  const N = index.docs.length || 1;
  const exclude = new Set(opts.excludeIds || []);
  const path = (opts.path || '').split('?')[0];

  // 구절 매칭 재료
  const flatQuery = flatten(query);
  const contentWords = extractContentWords(query);
  const synonymSet = synonyms.map((x) => flatten(x)).filter((x) => x.length >= 2);
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
      if (doc.flatTitleTags.includes(flatQuery)) {
        score *= 2.6; // 질의 전체가 제목/태그에 통째로 있음
      } else if (contentWords.length) {
        // 한국어는 어미가 뒤에 붙는다("중복이래요" ← "중복"). 앞에서부터 잘라가며
        // 가장 긴 접두어가 걸리는지 보고, 얼마나 걸렸는지를 비율로 환산한다.
        //
        // idf 가중(드문 단어에 큰 무게)도 시험해 봤는데 실측이 80.6% → 77.6% 로 떨어졌다.
        // 토큰 df 가 n-gram 까지 섞여 있어 단어 희소도를 제대로 못 재는 탓이다. 단순 비율이 낫다.
        let covered = 0;
        for (const w of contentWords) {
          let hit = 0;
          for (let len = w.length; len >= 2; len--) {
            if (doc.flatTitleTags.includes(w.slice(0, len))) {
              hit = len / w.length;
              break;
            }
          }
          // 글자로는 안 겹쳐도 뜻이 같은 말이 문서에 있으면 인정한다(0.8 로 약간 깎아서).
          if (hit === 0) {
            for (const syn of synonymSet) {
              if (doc.flatTitleTags.includes(syn)) {
                hit = 0.8;
                break;
              }
            }
          }
          covered += hit;
        }
        const ratio = covered / contentWords.length;
        if (ratio >= 0.95) score *= 2.2;
        else if (ratio >= 0.6) score *= 1.6;
        else if (ratio >= 0.35) score *= 1.25;
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
