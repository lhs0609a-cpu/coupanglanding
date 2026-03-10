import { createServiceClient } from '@/lib/supabase/server';
import crypto from 'crypto';

function generateSignature(timestamp: number, method: string, path: string, secretKey: string): string {
  const message = `${timestamp}.${method}.${path}`;
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

export function calculateTrendScore(pcQcCnt: number, mobileQcCnt: number): number {
  const total = pcQcCnt + mobileQcCnt;
  if (total >= 100000) return 95;
  if (total >= 50000) return 85;
  if (total >= 10000) return 75;
  if (total >= 5000) return 65;
  if (total >= 1000) return 55;
  if (total >= 500) return 45;
  if (total >= 100) return 35;
  return 20;
}

export interface KeywordCandidate {
  keyword: string;
  pcQcCnt: number;
  mobileQcCnt: number;
  totalSearch: number;
  compIdx: string;
  monthlyAvePcClkCnt: number;
  monthlyAveMobileClkCnt: number;
  plAvgDepth: number;
}

export async function fetchNaverKeywords(
  hintKeywords: string[],
  accessKey: string,
  secretKey: string,
  customerId: string
): Promise<KeywordCandidate[]> {
  const timestamp = Date.now();
  const method = 'GET';
  const path = '/keywordstool';
  const signature = generateSignature(timestamp, method, path, secretKey);

  const params = new URLSearchParams({
    hintKeywords: hintKeywords.join(','),
    showDetail: '1',
  });

  const response = await fetch(`https://api.searchad.naver.com${path}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'X-API-KEY': accessKey,
      'X-CUSTOMER': customerId,
      'X-Timestamp': String(timestamp),
      'X-Signature': signature,
    },
  });

  if (!response.ok) {
    console.error('Naver keyword API error:', response.status);
    return [];
  }

  const result = await response.json();
  const keywordList = result.keywordList || [];

  return keywordList.map((item: Record<string, unknown>) => {
    const pc = typeof item.monthlyPcQcCnt === 'number' ? item.monthlyPcQcCnt : 0;
    const mobile = typeof item.monthlyMobileQcCnt === 'number' ? item.monthlyMobileQcCnt : 0;
    return {
      keyword: item.relKeyword as string,
      pcQcCnt: pc,
      mobileQcCnt: mobile,
      totalSearch: pc + mobile,
      compIdx: (item.compIdx as string) || '낮음',
      monthlyAvePcClkCnt: typeof item.monthlyAvePcClkCnt === 'number' ? item.monthlyAvePcClkCnt : 0,
      monthlyAveMobileClkCnt: typeof item.monthlyAveMobileClkCnt === 'number' ? item.monthlyAveMobileClkCnt : 0,
      plAvgDepth: typeof item.plAvgDepth === 'number' ? item.plAvgDepth : 0,
    };
  });
}

export async function fetchShoppingCount(
  keywords: string[],
  clientId: string,
  clientSecret: string
): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  const batchSize = 5;

  for (let i = 0; i < keywords.length; i += batchSize) {
    const batch = keywords.slice(i, i + batchSize);

    const promises = batch.map(async (kw) => {
      try {
        const params = new URLSearchParams({ query: kw, display: '1' });
        const res = await fetch(
          `https://openapi.naver.com/v1/search/shop.json?${params.toString()}`,
          {
            headers: {
              'X-Naver-Client-Id': clientId,
              'X-Naver-Client-Secret': clientSecret,
            },
          }
        );
        if (res.ok) {
          const data = await res.json();
          return { keyword: kw, count: data.total || 0 };
        }
        return { keyword: kw, count: 0 };
      } catch {
        return { keyword: kw, count: 0 };
      }
    });

    const batchResults = await Promise.all(promises);
    for (const r of batchResults) {
      results[r.keyword] = r.count;
    }

    if (i + batchSize < keywords.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}

export interface CollectResult {
  category: string;
  collected: number;
  message: string;
}

/**
 * 핵심 수집 파이프라인: 시드 키워드 → 네이버 API 호출 → DB upsert → 랭킹 재계산
 */
export async function collectTrendKeywords(
  category: string,
  seedKeywords: string[]
): Promise<CollectResult> {
  const adCustomerId = process.env.NAVER_AD_CUSTOMER_ID;
  const adAccessKey = process.env.NAVER_AD_ACCESS_KEY;
  const adSecretKey = process.env.NAVER_AD_SECRET_KEY;
  const shopClientId = process.env.NAVER_DATALAB_CLIENT_ID;
  const shopClientSecret = process.env.NAVER_DATALAB_CLIENT_SECRET;

  if (!adCustomerId || !adAccessKey || !adSecretKey) {
    throw new Error('네이버 광고 API 키가 설정되지 않았습니다.');
  }

  // 1. 시드 키워드를 5개씩 배치로 네이버 키워드 도구 API 호출
  const allCandidates: KeywordCandidate[] = [];
  const batchSize = 5;

  for (let i = 0; i < seedKeywords.length; i += batchSize) {
    const batch = seedKeywords.slice(i, i + batchSize);
    const candidates = await fetchNaverKeywords(batch, adAccessKey, adSecretKey, adCustomerId);
    allCandidates.push(...candidates);

    if (i + batchSize < seedKeywords.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // 2. 중복 제거 (같은 키워드 → 검색량 높은 것 유지)
  const uniqueMap = new Map<string, KeywordCandidate>();
  for (const c of allCandidates) {
    const key = c.keyword.toLowerCase().trim();
    const existing = uniqueMap.get(key);
    if (!existing || c.totalSearch > existing.totalSearch) {
      uniqueMap.set(key, c);
    }
  }

  // 3. 총 검색량 기준 상위 100개 선별
  const sorted = Array.from(uniqueMap.values())
    .filter((c) => c.totalSearch > 0)
    .sort((a, b) => b.totalSearch - a.totalSearch)
    .slice(0, 100);

  if (sorted.length === 0) {
    throw new Error('수집된 키워드가 없습니다.');
  }

  // 4. 상위 100개에 대해 네이버 쇼핑 API로 상품수 수집 (키가 있을 때만)
  let productCounts: Record<string, number> = {};
  if (shopClientId && shopClientSecret) {
    const keywordNames = sorted.map((c) => c.keyword);
    productCounts = await fetchShoppingCount(keywordNames, shopClientId, shopClientSecret);
  }

  // 5. competition_ratio 계산 + upsert 데이터 구성
  const now = new Date().toISOString();
  const upsertRows = sorted.map((c) => {
    const productCount = productCounts[c.keyword] || 0;
    const competitionRatio = c.totalSearch > 0
      ? Math.round((productCount / c.totalSearch) * 100) / 100
      : 0;
    const trendScore = calculateTrendScore(c.pcQcCnt, c.mobileQcCnt);

    return {
      keyword: c.keyword,
      category,
      source: 'naver' as const,
      trend_score: trendScore,
      naver_trend_data: {
        relKeyword: c.keyword,
        monthlyPcQcCnt: c.pcQcCnt,
        monthlyMobileQcCnt: c.mobileQcCnt,
        monthlyAvePcClkCnt: c.monthlyAvePcClkCnt,
        monthlyAveMobileClkCnt: c.monthlyAveMobileClkCnt,
        compIdx: c.compIdx,
        plAvgDepth: c.plAvgDepth,
      },
      naver_fetched_at: now,
      product_count: productCount,
      competition_ratio: competitionRatio,
      is_active: true,
      collected_at: now,
      updated_at: now,
    };
  });

  // 6. Upsert (keyword + category 기준)
  const serviceClient = await createServiceClient();
  const { error: upsertError } = await serviceClient
    .from('trending_keywords')
    .upsert(upsertRows, {
      onConflict: 'keyword,category',
      ignoreDuplicates: false,
    });

  if (upsertError) {
    throw new Error('DB 저장 실패: ' + upsertError.message);
  }

  // 7. 해당 카테고리의 rank_daily, rank_weekly 재계산
  const { data: catKeywords } = await serviceClient
    .from('trending_keywords')
    .select('id, trend_score, naver_trend_data')
    .eq('category', category)
    .eq('is_active', true)
    .order('trend_score', { ascending: false });

  if (catKeywords) {
    // rank_daily: trend_score 내림차순
    const dailySorted = [...catKeywords].sort((a, b) => b.trend_score - a.trend_score);
    // rank_weekly: 총 검색량 내림차순
    const weeklySorted = [...catKeywords].sort((a, b) => {
      const aData = a.naver_trend_data as { monthlyPcQcCnt?: number; monthlyMobileQcCnt?: number } | null;
      const bData = b.naver_trend_data as { monthlyPcQcCnt?: number; monthlyMobileQcCnt?: number } | null;
      const aTotal = (aData?.monthlyPcQcCnt || 0) + (aData?.monthlyMobileQcCnt || 0);
      const bTotal = (bData?.monthlyPcQcCnt || 0) + (bData?.monthlyMobileQcCnt || 0);
      return bTotal - aTotal;
    });

    // 배치 업데이트
    const dailyUpdates = dailySorted.map((kw, idx) =>
      serviceClient
        .from('trending_keywords')
        .update({ rank_daily: idx + 1 })
        .eq('id', kw.id)
    );
    const weeklyUpdates = weeklySorted.map((kw, idx) =>
      serviceClient
        .from('trending_keywords')
        .update({ rank_weekly: idx + 1 })
        .eq('id', kw.id)
    );

    await Promise.all([...dailyUpdates, ...weeklyUpdates]);
  }

  return {
    category,
    collected: sorted.length,
    message: `${category} 카테고리에서 ${sorted.length}개 키워드를 수집했습니다.`,
  };
}
