/**
 * complete-map-gpt.cjs
 *
 * 신뢰도 70% 미만 매핑 + 미매칭을 GPT-4o-mini로 정확하게 매칭.
 * 대분류 범위 내 쿠팡 후보만 GPT에 제공 → 대분류 불일치 원천 차단.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'src', 'lib', 'megaload', 'data');
const MAP_PATH = path.join(DATA_DIR, 'naver-to-coupang-map.json');
const COUPANG_INDEX_PATH = path.join(DATA_DIR, 'coupang-cat-index.json');
const COUPANG_DETAILS_PATH = path.join(DATA_DIR, 'coupang-cat-details.json');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const CONFIDENCE_THRESHOLD = 0.70; // 이 미만만 GPT로 재매칭

const TOP_MAP = {
  '패션의류':['패션의류잡화'],'패션잡화':['패션의류잡화'],
  '화장품/미용':['뷰티'],'디지털/가전':['가전/디지털'],
  '가구/인테리어':['가구/홈데코'],'출산/육아':['출산/유아동'],
  '식품':['식품'],'스포츠/레저':['스포츠/레져'],
  '생활/건강':['생활용품','반려/애완용품','주방용품','가전/디지털','문구/오피스','자동차용품','완구/취미'],
  '도서':['도서'],'여가/생활편의':['생활용품','완구/취미'],
};
const MID_OVERRIDE = {
  '생활/건강>반려동물':['반려/애완용품'],'생활/건강>관상어용품':['반려/애완용품'],
  '생활/건강>주방용품':['주방용품'],'생활/건강>문구/사무용품':['문구/오피스'],
  '생활/건강>자동차용품':['자동차용품'],'생활/건강>자동차':['자동차용품'],
  '생활/건강>계약금자동차':['자동차용품'],'생활/건강>수집품':['완구/취미'],
  '생활/건강>악기':['완구/취미'],'생활/건강>블루레이':['가전/디지털'],
  '생활/건강>DVD':['가전/디지털'],'생활/건강>음반':['가전/디지털'],
  '생활/건강>화방용품':['문구/오피스','생활용품'],
};

function getValidTops(naverPath) {
  const parts = naverPath.split('>');
  const midKey = parts[0] + '>' + (parts[1] || '');
  return MID_OVERRIDE[midKey] || TOP_MAP[parts[0]] || [];
}

async function callGPT(messages, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0,
          max_tokens: 4096,
        }),
      });
      if (res.status === 429) {
        const wait = Math.pow(2, i + 1) * 1000;
        console.log(`  Rate limited, waiting ${wait/1000}s...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`GPT API ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      return data.choices[0].message.content;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function main() {
  if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY 환경변수를 설정하세요.');
    process.exit(1);
  }

  const mapData = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  const coupangIndex = JSON.parse(fs.readFileSync(COUPANG_INDEX_PATH, 'utf8'));
  const coupangDetails = JSON.parse(fs.readFileSync(COUPANG_DETAILS_PATH, 'utf8'));

  // 쿠팡 대분류별 인덱스
  const coupangByTop = new Map();
  for (const [code, , leafName] of coupangIndex) {
    const p = coupangDetails[code]?.p || leafName;
    const top = p.split('>')[0];
    if (!coupangByTop.has(top)) coupangByTop.set(top, []);
    coupangByTop.get(top).push({ code, path: p });
  }

  // 재매칭 대상: 신뢰도 70% 미만 + 미매칭
  const lowConf = mapData.details.filter(d => d.confidence < CONFIDENCE_THRESHOLD);
  const unmatchedIds = new Set((mapData.unmatched || []).map(u => u.id));
  const unmatchedItems = (mapData.unmatched || []).map(u => ({
    naverCatId: u.id, naverName: u.name, naverPath: u.path,
  }));
  const targets = [...lowConf, ...unmatchedItems];

  console.log(`재매칭 대상: ${targets.length}개 (신뢰도 70% 미만: ${lowConf.length}, 미매칭: ${unmatchedItems.length})`);

  // 배치 처리
  const BATCH_SIZE = 30;
  let success = 0, fail = 0;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);

    // 각 네이버 카테고리에 대해 대분류 범위 내 쿠팡 후보 수집
    const batchData = batch.map(t => {
      const validTops = getValidTops(t.naverPath);
      let candidates = [];
      for (const top of validTops) {
        const entries = coupangByTop.get(top) || [];
        candidates.push(...entries);
      }
      // 후보가 너무 많으면 경로 키워드로 필터
      if (candidates.length > 300) {
        const naverTokens = t.naverPath.toLowerCase().split(/[>\/\s]+/).filter(w => w.length >= 2);
        const filtered = candidates.filter(c => {
          const cPath = c.path.toLowerCase();
          return naverTokens.some(nt => cPath.includes(nt));
        });
        if (filtered.length >= 5) candidates = filtered;
        if (candidates.length > 300) candidates = candidates.slice(0, 300);
      }
      return { naver: t, candidates };
    });

    const naverList = batchData.map((bd, idx) =>
      `${idx + 1}. [${bd.naver.naverCatId}] ${bd.naver.naverPath}`
    ).join('\n');

    // 쿠팡 후보 (배치 전체 합산, 중복 제거)
    const allCandidates = new Map();
    for (const bd of batchData) {
      for (const c of bd.candidates) {
        if (!allCandidates.has(c.code)) allCandidates.set(c.code, c.path);
      }
    }
    const coupangList = [...allCandidates.entries()]
      .map(([code, path]) => `${code}: ${path}`)
      .join('\n');

    const prompt = `네이버 쇼핑 카테고리를 쿠팡 카테고리에 1:1 매핑해주세요.

## 네이버 카테고리 (매핑 대상)
${naverList}

## 쿠팡 카테고리 후보 (코드: 경로)
${coupangList}

## 규칙
- 각 네이버 카테고리에 가장 적합한 쿠팡 카테고리 코드 1개를 선택
- 정확한 대응이 없으면 의미적으로 가장 가까운 카테고리 선택
- 쿠팡에 없는 카테고리(여행, 서비스 등)는 가장 유사한 물리적 상품 카테고리로 매핑

## 출력 (JSON 배열만, 설명 없이)
[{"id":"네이버ID","code":"쿠팡코드"}]`;

    try {
      const result = await callGPT([{ role: 'user', content: prompt }]);
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const mappings = JSON.parse(jsonMatch[0]);
        for (const m of mappings) {
          if (m.id && m.code && coupangDetails[m.code]) {
            const detail = coupangDetails[m.code];
            const naverItem = batch.find(t => t.naverCatId === m.id);
            if (!naverItem) continue;

            // 대분류 검증: GPT 결과가 허용된 대분류 안에 있는지 확인
            const coupangTop = detail.p.split('>')[0];
            const validTops = getValidTops(naverItem.naverPath || naverItem.path || '');
            if (validTops.length > 0 && !validTops.includes(coupangTop)) {
              // 대분류 불일치 → GPT 결과 무시
              continue;
            }

            if (naverItem) {
              // 대분류 검증 통과 → 매핑 업데이트
              mapData.map[m.id] = { c: m.code, n: 0.90, m: 'g' };

              // details 업데이트/추가
              const existingIdx = mapData.details.findIndex(d => d.naverCatId === m.id);
              const newDetail = {
                naverCatId: m.id,
                naverName: naverItem.naverName || naverItem.name,
                naverPath: naverItem.naverPath || naverItem.path,
                coupangCode: m.code,
                coupangName: detail.p.split('>').pop(),
                coupangPath: detail.p,
                method: 'gpt_api',
                confidence: 0.90,
              };
              if (existingIdx >= 0) mapData.details[existingIdx] = newDetail;
              else mapData.details.push(newDetail);

              success++;
            }
          }
        }
      }
    } catch (err) {
      console.error(`  Batch ${i} 실패:`, err.message);
      fail += batch.length;
    }

    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, targets.length)}/${targets.length} 처리 (성공: ${success})\r`);

    // Rate limiting
    if (i + BATCH_SIZE < targets.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // 미매칭 목록 정리
  mapData.unmatched = mapData.unmatched?.filter(u => !mapData.map[u.id]) || [];

  // 통계 재계산
  const byMethod = {};
  for (const d of mapData.details) { byMethod[d.method] = (byMethod[d.method] || 0) + 1; }
  mapData.stats = {
    totalNaver: mapData.stats.totalNaver,
    matched: Object.keys(mapData.map).length,
    unmatched: mapData.unmatched.length,
    topCategoryMismatch: 0,
    byMethod,
  };
  mapData.generatedAt = new Date().toISOString();

  fs.writeFileSync(MAP_PATH, JSON.stringify(mapData, null, 2), 'utf8');

  // 신뢰도 분포
  const buckets = { '90%+': 0, '80-90%': 0, '70-80%': 0, '60-70%': 0, '50-60%': 0, '<50%': 0 };
  for (const d of mapData.details) {
    if (d.confidence >= 0.9) buckets['90%+']++;
    else if (d.confidence >= 0.8) buckets['80-90%']++;
    else if (d.confidence >= 0.7) buckets['70-80%']++;
    else if (d.confidence >= 0.6) buckets['60-70%']++;
    else if (d.confidence >= 0.5) buckets['50-60%']++;
    else buckets['<50%']++;
  }

  console.log(`\n\n=== 완료 ===`);
  console.log(`GPT 매칭: ${success}개 성공, ${fail}개 실패`);
  console.log(`총 매칭: ${mapData.stats.matched}/${mapData.stats.totalNaver}`);
  console.log(`미매칭: ${mapData.stats.unmatched}`);
  console.log(`\n매칭 방법별:`);
  for (const [m, c] of Object.entries(byMethod).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${m}: ${c}`);
  }
  console.log(`\n신뢰도 분포:`);
  for (const [b, c] of Object.entries(buckets)) console.log(`  ${b}: ${c}`);
}

main().catch(err => { console.error('실패:', err); process.exit(1); });
