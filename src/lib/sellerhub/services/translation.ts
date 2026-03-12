export interface TranslationResult {
  translated: string;
  engine: 'deepl' | 'gpt' | 'google' | 'fallback';
}

// Simple in-memory cache (7 days TTL)
const translationCache = new Map<string, { result: string; engine: string; cachedAt: number }>();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

export async function translateText(
  text: string,
  targetLang = 'ko',
  sourceLang = 'zh'
): Promise<TranslationResult> {
  if (!text || text.trim() === '') {
    return { translated: '', engine: 'fallback' };
  }

  // Check cache
  const cacheKey = `${sourceLang}:${targetLang}:${text}`;
  const cached = translationCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return { translated: cached.result, engine: cached.engine as TranslationResult['engine'] };
  }

  // Try DeepL first
  try {
    const deeplResult = await translateWithDeepL(text, targetLang, sourceLang);
    if (deeplResult) {
      translationCache.set(cacheKey, { result: deeplResult, engine: 'deepl', cachedAt: Date.now() });
      return { translated: deeplResult, engine: 'deepl' };
    }
  } catch {
    // Fallback to next engine
  }

  // Try GPT
  try {
    const gptResult = await translateWithGPT(text, targetLang, sourceLang);
    if (gptResult) {
      translationCache.set(cacheKey, { result: gptResult, engine: 'gpt', cachedAt: Date.now() });
      return { translated: gptResult, engine: 'gpt' };
    }
  } catch {
    // Fallback
  }

  // Fallback: return original
  return { translated: text, engine: 'fallback' };
}

async function translateWithDeepL(text: string, targetLang: string, sourceLang: string): Promise<string | null> {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) return null;

  const langMap: Record<string, string> = { ko: 'KO', zh: 'ZH', en: 'EN' };
  const res = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: [text],
      source_lang: langMap[sourceLang] || sourceLang.toUpperCase(),
      target_lang: langMap[targetLang] || targetLang.toUpperCase(),
    }),
  });

  if (!res.ok) return null;
  const data = await res.json() as { translations: { text: string }[] };
  return data.translations?.[0]?.text || null;
}

async function translateWithGPT(text: string, targetLang: string, _sourceLang: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const langNames: Record<string, string> = { ko: '한국어', zh: '중국어', en: '영어' };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a professional e-commerce product translator. Translate to ${langNames[targetLang] || targetLang}. Remove Chinese-specific marketing phrases. Keep brand names in English. Output only the translation.`,
        },
        { role: 'user', content: text },
      ],
      temperature: 0.3,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices?.[0]?.message?.content || null;
}

export function cleanProductTitle(title: string): string {
  // Remove common Chinese marketing phrases
  const removePatterns = [
    /包邮/g, /热卖/g, /爆款/g, /新款/g, /特价/g, /促销/g,
    /厂家直销/g, /一件代发/g, /批发/g, /代购/g,
    /\[.*?\]/g, /【.*?】/g, /（.*?）/g,
  ];

  let cleaned = title;
  for (const pattern of removePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned.replace(/\s+/g, ' ').trim();
}
