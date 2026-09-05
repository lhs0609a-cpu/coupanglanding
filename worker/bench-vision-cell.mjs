/**
 * 비전 격자 크기 A/B — "얼마나 빨라지는가"와 "대표컷 선택이 몇 건 바뀌는가"를 함께 잰다.
 *
 * 왜 필요한가(실측 2026-08-20, RTX 4060 Ti):
 *   비전 호출 한 번을 구간별로 쪼개 보면 **추론은 0.2초, 나머지 ~9초가 이미지 인코딩**이다.
 *   그 비용은 픽셀 수에 비례하므로 격자 셀을 줄이면 곧장 빨라진다. 하지만 셀이 작아지면
 *   로고·작은 글자(logo_text) 판별이 흔들릴 수 있다 — **속도만 재고 품질을 안 재면
 *   "빨라졌는데 나빠진" 변경을 그대로 내보내게 된다.**
 *
 * 그래서 이 스크립트는 두 가지를 같이 낸다:
 *   ① 설정별 소요시간(상품당 평균)
 *   ② 기준(baseline=300px/24칸) 대비 **대표컷이 바뀐 상품 수** — 이게 0에 가까워야 채택한다.
 *
 * 쓰는 법 (도우미 소스 폴더에서. sharp·ollama 가 있는 환경이어야 한다):
 *   node bench-vision-cell.mjs <소싱폴더> [--limit 20] [--cells 300x24,256x24,224x16]
 *
 * 예:
 *   node bench-vision-cell.mjs "C:\\Users\\me\\AppData\\Roaming\\megaload-desktop\\naver-sourcing" --limit 20
 *
 * ⚠️ 표본은 최소 20상품을 권한다. 5상품에서 "변경 0건"은 아무것도 보증하지 못한다.
 */
import path from 'node:path';
import { scanFolder } from './lib/folder-scanner.mjs';
import { ensureModel } from './lib/local-llm.mjs';

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith('--'));
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

if (!folder) {
  console.error('사용법: node bench-vision-cell.mjs <소싱폴더> [--limit 20] [--cells 300x24,256x24,224x16]');
  process.exit(1);
}

const limit = Number(flag('limit', 20));
const model = flag('model', process.env.MEGALOAD_VISION_MODEL || 'qwen2.5vl:7b');
// "셀크기x칸수" 목록. 첫 항목이 기준(baseline)이 된다.
const configs = String(flag('cells', '300x24,256x24,224x16')).split(',').map((s) => {
  const [cell, cells] = s.split('x').map(Number);
  return { cell, cells, label: s };
});

const main = async () => {
  const products = scanFolder(folder).slice(0, limit);
  if (!products.length) { console.error('❌ product_* 폴더를 찾지 못했습니다.'); process.exit(1); }
  console.log(`표본 ${products.length}상품 · 모델 ${model}`);

  if (!(await ensureModel(model, { onLog: (m) => console.log('  ' + m) }))) {
    console.error('❌ 비전 모델을 준비하지 못했습니다.');
    process.exit(1);
  }

  const results = [];
  for (const cfg of configs) {
    // ⚠️ 모듈 로드 시점에 상수를 읽으므로, 환경변수를 바꾼 뒤 **새로 import** 해야 적용된다.
    process.env.MEGALOAD_VISION_CELL = String(cfg.cell);
    process.env.MEGALOAD_VISION_CELLS = String(cfg.cells);
    const mod = await import(`./lib/vision-selector.mjs?cfg=${encodeURIComponent(cfg.label)}`);

    const picks = new Map();
    const t0 = Date.now();
    for (const p of products) {
      const vc = await mod.visionCurateProduct({
        mainPool: p.mainImages || (p.mainImage ? [p.mainImage] : []),
        detailPool: p.detailImages || [],
        reviewPool: p.reviewImages || [],
        model, onLog: () => {}, kind: 'generic',
      }).catch(() => null);
      picks.set(p.id || p.folderPath, vc?.mainImage ? path.basename(vc.mainImage) : null);
    }
    const ms = Date.now() - t0;
    results.push({ cfg, ms, picks });
    console.log(`${cfg.label.padEnd(9)} 총 ${(ms / 1000).toFixed(1)}s · 상품당 ${(ms / products.length / 1000).toFixed(1)}s`);
  }

  // ── 품질: 기준 대비 대표컷이 바뀐 상품 수 ────────────────────────────────
  const base = results[0];
  console.log(`\n기준 = ${base.cfg.label}`);
  console.log('설정        속도배수   대표컷 변경   바뀐 상품');
  for (const r of results) {
    const changed = [];
    for (const [id, pick] of r.picks) {
      if (base.picks.get(id) !== pick) changed.push(`${id}: ${base.picks.get(id) || '-'} → ${pick || '-'}`);
    }
    console.log(
      r.cfg.label.padEnd(11)
      + `${(base.ms / r.ms).toFixed(2)}x`.padStart(8)
      + `${changed.length}/${products.length}`.padStart(14)
      + '   ' + (changed.length ? changed.slice(0, 3).join(' | ') : '(없음)'),
    );
  }
  console.log('\n판단 기준: 대표컷 변경 0건이면 그대로 채택. 1건이라도 바뀌면 그 상품을 눈으로 보고 결정한다.');
};

main().catch((e) => { console.error('벤치 오류:', e.message); process.exit(1); });
