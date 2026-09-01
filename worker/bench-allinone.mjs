#!/usr/bin/env node
/**
 * 올인원 A/B 회귀 하네스 — "빨라졌는데 나빠졌다"를 막는 자
 * ===========================================================================
 * 속도 개선은 품질 저하를 숨기기 쉽다. 대표컷 한 장이 바뀌어도 화면은 멀쩡해 보이고,
 * 상세컷을 덜 걸러도 그 자리에서는 티가 안 난다. 그래서 **같은 폴더를 두 설정으로 돌려
 * 결과를 대조**한다(설계도 §5 의 검증 도구).
 *
 * 쓰는 법
 * ---------------------------------------------------------------------------
 *   1) 기준선 저장 — 지금 설정 그대로 한 번 돌린 결과를 기록해 둔다
 *        node worker/bench-allinone.mjs --baseline "D:\\소싱\\표본20"
 *
 *   2) 바꾼 뒤 대조 — 같은 폴더를 다시 돌려 기준선과 비교한다
 *        node worker/bench-allinone.mjs --compare "D:\\소싱\\표본20"
 *
 *   설정을 바꿔 보려면 환경변수를 앞에 붙인다(재배포 없이 즉시 적용):
 *        MEGALOAD_VISION_CELLS=12 node worker/bench-allinone.mjs --compare "D:\\소싱\\표본20"
 *        MEGALOAD_VISION_CELL=224 node worker/bench-allinone.mjs --compare ...
 *
 * 무엇을 보나
 * ---------------------------------------------------------------------------
 *   · 대표컷(mainImage)  — 등록물에 그대로 실린다. **여기가 바뀌면 반드시 눈으로 확인한다.**
 *   · 리뷰컷 집합        — 상세 본문의 실제 재료다(등록물에 닿는다).
 *   · 상세컷 집합        — 지금은 등록에 안 쓰지만, 판정 품질의 지표라 같이 센다.
 *   · 검수필요 건수      — 늘었으면 글 품질이 내려갔다는 뜻이다.
 *   · 단계별 실측        — _allinone.timing.json 을 그대로 읽는다.
 *
 * ⚠️ 이 스크립트는 생성을 **직접 돌리지 않는다**. run-folder 를 그대로 실행할 뿐이라,
 *    측정 대상과 실제 동작이 어긋날 일이 없다.
 */

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const mode = args.includes('--baseline') ? 'baseline' : args.includes('--compare') ? 'compare' : null;
const folder = args.find((a) => !a.startsWith('--'));

if (!mode || !folder) {
  console.error('사용법: node worker/bench-allinone.mjs --baseline|--compare <소싱폴더> [run-folder 옵션…]');
  console.error('예:     node worker/bench-allinone.mjs --baseline "D:\\소싱\\표본20"');
  process.exit(1);
}

const passthrough = args.filter((a) => a !== '--baseline' && a !== '--compare' && a !== folder);
const prefix = join(folder, '_allinone');
const genFile = `${prefix}.generated.jsonl`;
const timingFile = `${prefix}.timing.json`;
const baseFile = join(folder, '_allinone.bench-baseline.json');

/** run-folder 를 그대로 돌린다(측정 대상 = 실제 동작). */
function runFolder() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(here, 'run-folder.mjs'), folder, ...passthrough], {
      stdio: 'inherit',
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`run-folder 종료코드 ${code}`))));
    child.on('error', reject);
  });
}

function readRecords() {
  if (!existsSync(genFile)) throw new Error(`결과가 없습니다: ${genFile}`);
  return readFileSync(genFile, 'utf8')
    .split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function readTiming() {
  try { return JSON.parse(readFileSync(timingFile, 'utf8')); } catch { return null; }
}

/** 비교 가능한 최소 형태로 줄인다 — 경로는 파일명만 본다(폴더가 옮겨져도 대조된다). */
function snapshot(records, timing) {
  const nameOf = (p) => (p ? basename(String(p)) : null);
  const set = (arr) => [...new Set((arr || []).map(nameOf).filter(Boolean))].sort();
  const byId = {};
  for (const r of records) {
    const id = String(r.sourceId ?? r.productCode ?? r.id ?? '');
    if (!id) continue;
    byId[id] = {
      mainImage: nameOf(r.mainImage),
      review: set(r.reviewImages),
      detail: set(r.detailImages),
      needsReview: !!r.needsReview,
      displayName: r.displayName || '',
      categoryPath: r.categoryPath || '',
      detailLen: (r.detail || r.detailText || '').length,
    };
  }
  return { at: Date.now(), count: records.length, timing, byId };
}

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

const fmt = (ms) => (ms == null ? '-' : ms >= 60000 ? `${(ms / 60000).toFixed(1)}분` : `${(ms / 1000).toFixed(1)}초`);

await runFolder();
const snap = snapshot(readRecords(), readTiming());

if (mode === 'baseline') {
  writeFileSync(baseFile, JSON.stringify(snap, null, 2), 'utf8');
  console.log(`\n기준선 저장: ${baseFile}  (상품 ${snap.count}개)`);
  if (snap.timing) {
    console.log(`기준선 실측: 상품당 ${fmt(snap.timing.perProductMs)} · 100개 환산 ${fmt(snap.timing.per100Ms)}`);
  }
  console.log('이제 설정을 바꾼 뒤 --compare 로 같은 폴더를 다시 돌리세요.');
  process.exit(0);
}

// ── 대조 ───────────────────────────────────────────────────────────────────
if (!existsSync(baseFile)) {
  console.error(`기준선이 없습니다: ${baseFile}\n먼저 --baseline 으로 한 번 돌리세요.`);
  process.exit(1);
}
const base = JSON.parse(readFileSync(baseFile, 'utf8'));

const ids = [...new Set([...Object.keys(base.byId), ...Object.keys(snap.byId)])].sort();
let mainSame = 0, mainDiff = 0, missing = 0;
let reviewSum = 0, detailSum = 0, pairs = 0;
let needsBefore = 0, needsAfter = 0;
const changed = [];

for (const id of ids) {
  const a = base.byId[id], b = snap.byId[id];
  if (!a || !b) { missing++; continue; }
  pairs++;
  if (a.needsReview) needsBefore++;
  if (b.needsReview) needsAfter++;
  if (a.mainImage === b.mainImage) mainSame++;
  else { mainDiff++; changed.push({ id, before: a.mainImage, after: b.mainImage }); }
  reviewSum += jaccard(a.review, b.review);
  detailSum += jaccard(a.detail, b.detail);
}

const pct = (v) => `${Math.round(v * 100)}%`;
console.log('\n=== A/B 대조 ===');
console.log(`상품 ${pairs}개 대조${missing ? ` (짝을 못 찾은 ${missing}개는 제외)` : ''}`);
console.log(`대표컷 동일   ${mainSame}/${pairs} (${pct(pairs ? mainSame / pairs : 1)})  ← 등록물에 그대로 실린다`);
console.log(`리뷰컷 집합일치 ${pct(pairs ? reviewSum / pairs : 1)}  ← 상세 본문의 실제 재료`);
console.log(`상세컷 집합일치 ${pct(pairs ? detailSum / pairs : 1)}  ← 지금은 등록에 안 쓴다(판정 품질 지표)`);
console.log(`검수필요       ${needsBefore} → ${needsAfter}${needsAfter > needsBefore ? '  ⚠️ 늘었다' : ''}`);

if (base.timing && snap.timing) {
  const bp = base.timing.perProductMs, sp = snap.timing.perProductMs;
  const delta = bp ? Math.round(((sp - bp) / bp) * 100) : 0;
  console.log(`\n속도  상품당 ${fmt(bp)} → ${fmt(sp)} (${delta > 0 ? '+' : ''}${delta}%)`);
  console.log(`      100개 환산 ${fmt(base.timing.per100Ms)} → ${fmt(snap.timing.per100Ms)}   목표 20분`);
  const pb = base.timing.phase, ps = snap.timing.phase;
  console.log(`      인식 ${fmt(pb.recogMs)} → ${fmt(ps.recogMs)} · 텍스트 ${fmt(pb.textMs)} → ${fmt(ps.textMs)}`
    + ` · 누끼 ${fmt(pb.thumbMs)} → ${fmt(ps.thumbMs)}`);
  const vb = base.timing.vision, vs = snap.timing.vision;
  console.log(`      비전 ${vb.calls}콜/${vb.cells}칸 → ${vs.calls}콜/${vs.cells}칸`
    + ` (격자 ${fmt(vb.sheetMs)} → ${fmt(vs.sheetMs)} · 모델 ${fmt(vb.vlmMs)} → ${fmt(vs.vlmMs)})`);
}

if (changed.length) {
  console.log(`\n대표컷이 바뀐 ${changed.length}건 — 눈으로 확인할 목록:`);
  for (const c of changed.slice(0, 30)) console.log(`  ${c.id}: ${c.before} → ${c.after}`);
  if (changed.length > 30) console.log(`  … 외 ${changed.length - 30}건`);
}

// 판정: 대표컷이 흔들렸거나 검수필요가 늘면 실패로 돌린다(CI 에서 그대로 쓸 수 있게).
const mainRate = pairs ? mainSame / pairs : 1;
const bad = mainRate < 0.95 || needsAfter > needsBefore;
console.log(bad
  ? '\n❌ 품질이 흔들렸다 — 위 목록을 확인하고, 되돌리려면 환경변수를 원래 값으로 두면 된다.'
  : '\n✅ 품질 유지 — 속도 변화만 반영됐다.');
process.exit(bad ? 1 : 0);
