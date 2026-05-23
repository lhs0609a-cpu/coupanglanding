/**
 * 올인원 텍스트 생성 벤치마크 (순수 node + ollama, electron 불필요)
 * ---------------------------------------------------------------------------
 * 실행: node bench-aigen.mjs [모델명]
 *   예) node bench-aigen.mjs qwen2.5:7b-instruct
 *
 * 사전: ollama 설치 + 모델 pull (예: ollama pull qwen2.5:7b-instruct)
 * 출력: 상품별 생성물 + 필드별 소요시간/토큰per초 + 100/1k/1만 환산.
 */
import { isUp, listModels } from './lib/local-llm.mjs';
import { generateAllFields } from './lib/ai-generator.mjs';
import { topCandidates } from './lib/category-candidates-mini.mjs';
import { topCandidatesEmbed, isBuilt as embedBuilt } from './lib/category-embed-matcher.mjs';

const MODEL = process.argv[2] || 'qwen2.5:7b-instruct';

const SAMPLES = [
  { originalName: '비오틴 5000mcg 고함량 모발 영양제 120정', categoryPath: '건강식품>영양제>비타민', brand: '', features: ['고함량', '120정', '모발/손톱'] },
  { originalName: '히알루론산 수분크림 50ml 보습 진정', categoryPath: '뷰티>스킨케어>크림', brand: '', features: ['50ml', '수분', '진정'] },
  { originalName: '여성 나일론 크로스백 경량 여행용 베이지', categoryPath: '패션잡화>가방>크로스백', brand: '', features: ['경량', '나일론', '여행용'] },
];

const ms = (n) => `${(n / 1000).toFixed(1)}s`;

async function main() {
  console.log(`\n=== 올인원 생성 벤치 (모델: ${MODEL}) ===`);
  if (!(await isUp())) {
    console.log('❌ ollama 데몬이 응답하지 않습니다 (http://127.0.0.1:11434).');
    console.log('   설치: https://ollama.com/download  →  실행 후  ollama pull ' + MODEL);
    process.exit(1);
  }
  const models = await listModels();
  if (!models.some((m) => m === MODEL || m.startsWith(MODEL.split(':')[0]))) {
    console.log(`❌ 모델 '${MODEL}' 미설치. 설치된 모델: ${models.join(', ') || '(없음)'}`);
    console.log(`   실행:  ollama pull ${MODEL}`);
    process.exit(1);
  }

  const totals = [];
  for (const p of SAMPLES) {
    console.log('\n────────────────────────────────────────');
    console.log('원본:', p.originalName);
    const cands = embedBuilt() ? await topCandidatesEmbed(p.originalName, 8) : topCandidates(p.originalName, 8); // {code, path}[]
    const r = await generateAllFields(p, { model: MODEL, personaSeed: 'seller-A', categoryCandidates: cands, maxDetailTokens: 800 });
    console.log(`페르소나: ${r.persona}`);
    console.log('노출상품명:', r.displayName);
    console.log('키워드:', (r.keywords || []).join(', '));
    console.log('카테고리:', r.categoryPath, r.categoryCode ? `[code ${r.categoryCode}]` : '(코드없음)');
    console.log('상세(첫 200자):', r.detail.slice(0, 200).replace(/\n/g, ' '), '…');
    console.log(`⏱  총 ${ms(r.timings.totalMs)} | 제목 ${ms(r.timings.titleMs)} · 카테고리 ${ms(r.timings.categoryMs)} · 상세 ${ms(r.timings.detailMs)}`);
    console.log(`   tok/s — 제목 ${r.timings.tokPerSec.title} · 카테고리 ${r.timings.tokPerSec.category} · 상세 ${r.timings.tokPerSec.detail}`);
    console.log(`   금지어 통과: ${r.compliance.ok ? '✅' : '❌ ' + JSON.stringify(r.compliance.byField)}`);
    totals.push(r.timings.totalMs);
  }

  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  console.log('\n=== 요약 ===');
  console.log(`상품당 평균: ${ms(avg)}`);
  const ext = (n) => `${n.toLocaleString()}개 → ${(avg * n / 1000 / 60).toFixed(0)}분 (${(avg * n / 1000 / 3600).toFixed(1)}시간)`;
  console.log('순차 환산:', ext(100));
  console.log('           ', ext(1000));
  console.log('           ', ext(10000));
  console.log('(배치/병렬 최적화 시 2~5배 단축 가능)');
}

main().catch((e) => { console.error('벤치 오류:', e.message); process.exit(1); });
