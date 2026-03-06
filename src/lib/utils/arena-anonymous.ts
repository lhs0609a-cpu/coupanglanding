const ADJECTIVES = [
  '불꽃', '번개', '전설의', '무적의', '빛나는',
  '폭풍', '황금', '다이아', '로켓', '터보',
  '슈퍼', '메가', '울트라', '파워', '스피드',
  '마법의', '신비한', '무한', '최강', '용감한',
];

const NOUNS = [
  '셀러', '무역왕', '판매왕', '상인', '장사꾼',
  '거상', '사업가', '마스터', '챔피언', '히어로',
];

/** UUID를 숫자로 변환하는 간단한 해시 */
function simpleHash(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    const char = uuid.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/** UUID 기반 결정적 익명 이름 생성 */
export function generateAnonymousName(uuid: string): { name: string; emoji: string } {
  const hash = simpleHash(uuid);

  const adjIndex = hash % ADJECTIVES.length;
  const nounIndex = Math.floor(hash / ADJECTIVES.length) % NOUNS.length;
  const number = (Math.floor(hash / (ADJECTIVES.length * NOUNS.length)) % 99) + 1;

  const name = `${ADJECTIVES[adjIndex]} ${NOUNS[nounIndex]} #${number}`;

  // Deterministic emoji selection
  const EMOJIS = ['🔥', '⚡', '💫', '🌟', '✨', '🚀', '💎', '🏅', '🎯', '💪'];
  const emoji = EMOJIS[hash % EMOJIS.length];

  return { name, emoji };
}

/** 익명 이름이 이미 DB에 있으면 사용, 없으면 생성 */
export function getOrGenerateAnonymous(uuid: string, existingName?: string | null, existingEmoji?: string | null): { name: string; emoji: string } {
  if (existingName && existingEmoji) {
    return { name: existingName, emoji: existingEmoji };
  }
  return generateAnonymousName(uuid);
}
