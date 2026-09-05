#!/usr/bin/env node
/**
 * 올인원 "생성 단계" 속도·품질 고정 하네스
 * ===========================================================================
 *   node bench-allinone-speed.mjs [--model exaone3.5:7.8b] [--concurrency 6] [--n 12]
 *                                 [--out bench.json] [--compare 이전bench.json]
 *
 * 왜 필요한가(올인원_속도_설계도 §5): 속도 개선은 품질 저하를 숨기기 쉽다. 그리고
 * 지금까지 단계별 시간은 콘솔에만 찍히고 사라져서 "느려졌다/빨라졌다"를 숫자로 받을 수
 * 없었다. 이 스크립트는 **같은 표본·같은 지표**로 매번 같은 방식으로 잰다.
 *
 * 재는 것:
 *   · 상품당 벽시계 / 배치 전체 벽시계 / 100개 환산 예상
 *   · 상세글 생성 시도 횟수(= 재생성이 시간의 몇 %를 먹는가)
 *   · 검증 실패 사유 히스토그램(무엇 때문에 재생성이 걸리는가 — 여기가 곧 개선 지점)
 *   · 실패(생성 0건) 상품 수
 *   · --compare 를 주면 이전 결과와 대표 지표를 나란히 출력(회귀 감시)
 *
 * ⚠️ 이미지(비전/누끼)는 재지 않는다 — 사진이 필요하고 GPU 점유가 달라 재현성이 없다.
 *    이 하네스가 재는 것은 run-folder 의 Phase A(텍스트)뿐이다.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { generateBatch } from './lib/ai-batch.mjs';
import { isUp } from './lib/local-llm.mjs';

/**
 * 고정 표본 — 카테고리 종류(kind)를 골고루 덮는다. 종류마다 프롬프트의 감각 가이드와
 * 검증 규칙이 달라서, 한 종류만 재면 개선이 다른 종류를 망가뜨려도 알 수 없다.
 * ⚠️ 이 배열은 **바꾸지 않는다**(바꾸면 이전 측정과 비교가 불가능해진다).
 */
const SAMPLE = [
  { id: 'B01', originalName: '기능성 쌀 혼합곡 18곡 4kg', categoryPath: '식품>쌀/잡곡>혼합곡', features: ['18곡', '4kg'] },
  { id: 'B02', originalName: '나주배 5kg 선물세트 대과', categoryPath: '식품>신선식품>과일>배', features: ['5kg', '대과'] },
  { id: 'B03', originalName: '스테인리스 텀블러 500ml 보온보냉 진공', categoryPath: '생활/건강>주방용품>컵/텀블러', features: ['500ml', '진공'] },
  { id: 'B04', originalName: '비오틴 5000mcg 고함량 모발 영양제 120정', categoryPath: '식품>건강식품>비타민', features: ['고함량', '120정'] },
  { id: 'B05', originalName: '강아지 사료 연어 2kg 소형견 알러지케어', categoryPath: '반려동물>강아지>사료', features: ['연어', '2kg'] },
  { id: 'B06', originalName: '무선 블루투스 이어폰 노이즈캔슬링 저지연', categoryPath: '디지털/가전>음향기기>이어폰', features: ['노이즈캔슬링', '저지연'] },
  { id: 'B07', originalName: '세라마이드 수분 바디로션 528ml 저자극', categoryPath: '화장품/미용>바디케어>바디로션', features: ['528ml', '저자극'] },
  { id: 'B08', originalName: '아기 물티슈 캡형 100매 10팩 무향', categoryPath: '출산/육아>물티슈', features: ['100매', '무향'] },
  { id: 'B09', originalName: '남성 기모 맨투맨 오버핏 티셔츠 검정', categoryPath: '패션의류>남성의류>티셔츠', features: ['기모', '오버핏'] },
  { id: 'B10', originalName: '차량용 무선충전 거치대 15W 급속', categoryPath: '자동차용품>차량용품>거치대', features: ['15W', '급속'] },
  { id: 'B11', originalName: '하이네켄 논알콜릭 330ml 24캔', categoryPath: '식품>음료>맥주>무알콜맥주', features: ['330ml', '24캔'] },
  { id: 'B12', originalName: '접이식 원목 좌식 테이블 600x400', categoryPath: '가구/인테리어>거실가구>테이블', features: ['원목', '접이식'] },
];

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) { a._.push(t); continue; }
    a[t.slice(2)] = argv[++i];
  }
  return a;
}

const pct = (n, d) => (d ? Math.round((n * 100) / d) : 0);

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const model = cli.model || 'exaone3.5:7.8b';
  const concurrency = Math.max(1, Number(cli.concurrency) || 1);
  const n = Math.max(1, Math.min(Number(cli.n) || SAMPLE.length, SAMPLE.length));
  const products = SAMPLE.slice(0, n);

  if (!(await isUp())) { console.error('❌ ollama 미응답 — ollama serve 후 다시 실행'); process.exit(1); }

  console.log(`[하네스] 모델 ${model} · 동시 ${concurrency}개 · 표본 ${n}개`);
  const t0 = Date.now();
  const { records, summary } = await generateBatch(products, {
    model, sellerId: 'bench', concurrency,
    onItem: (i, total, rec, done) => {
      console.log(`  ${String(done).padStart(2)}/${total} ${rec.detailAttempts ?? '?'}회 · ${(rec.ms / 1000).toFixed(1)}s · ${rec.displayName?.slice(0, 40)}`);
    },
    onItemError: (i, total, err, done) => console.log(`  ${done}/${total} ❌ ${String(err).slice(0, 120)}`),
  });
  const wallMs = Date.now() - t0;

  const got = records.filter(Boolean);
  // 재생성 비용 = 상세 시도 횟수의 초과분. 1회 초과분이 곧 "다시 쓴 상세글" 개수다.
  const attempts = got.map((r) => r.detailAttempts || 1);
  const extra = attempts.reduce((s, a) => s + (a - 1), 0);
  const firstPass = attempts.filter((a) => a === 1).length;

  // 무엇 때문에 다시 썼는가 — 사유별 집계가 곧 다음 개선 지점이다.
  const issueHist = {};
  for (const r of got) for (const s of r.detailIssueLog || []) {
    const key = s.replace(/\([^)]*\)/g, '').slice(0, 42).trim();
    issueHist[key] = (issueHist[key] || 0) + 1;
  }

  const perProductSec = wallMs / 1000 / Math.max(1, got.length);
  const result = {
    model, concurrency, n,
    okCount: got.length, failed: summary.failed,
    wallSec: +(wallMs / 1000).toFixed(1),
    perProductSec: +perProductSec.toFixed(1),
    per100Min: +((perProductSec * 100) / 60).toFixed(1),
    detailFirstPassPct: pct(firstPass, got.length),
    detailExtraGenerations: extra,
    needsReview: summary.needsReview,
    issueHist,
  };

  console.log('\n=== 결과 ===');
  console.log(`전체 ${result.wallSec}s · 상품당 ${result.perProductSec}s · **100개 환산 ${result.per100Min}분**`);
  console.log(`상세 1회 통과 ${result.detailFirstPassPct}% · 재생성 ${extra}회 · 실패 ${summary.failed}건 · 검수필요 ${summary.needsReview}건`);
  const top = Object.entries(issueHist).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (top.length) {
    console.log('재생성을 부른 사유 (많은 순):');
    for (const [k, v] of top) console.log(`  ${String(v).padStart(3)}회  ${k}`);
  }

  if (cli.compare) {
    try {
      const prev = JSON.parse(readFileSync(cli.compare, 'utf8'));
      const d = (a, b) => `${b} → ${a} (${a - b >= 0 ? '+' : ''}${+(a - b).toFixed(1)})`;
      console.log('\n=== 이전 대비 ===');
      console.log(`100개 환산(분): ${d(result.per100Min, prev.per100Min)}`);
      console.log(`상세 1회 통과(%): ${d(result.detailFirstPassPct, prev.detailFirstPassPct)}`);
      console.log(`검수필요(건): ${d(result.needsReview, prev.needsReview)}`);
      console.log(`실패(건): ${d(result.failed, prev.failed)}`);
    } catch (e) { console.log(`(이전 결과를 읽지 못함: ${e.message})`); }
  }

  if (cli.out) { writeFileSync(cli.out, JSON.stringify(result, null, 2)); console.log(`\n저장: ${cli.out}`); }
}

main().catch((e) => { console.error('하네스 오류:', e); process.exit(1); });
