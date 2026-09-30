/**
 * /start 화면 목업 검사.
 *
 * 다섯 가지를 본다:
 *   ① 목업이 없는 단계   — 그 단계는 글만 남아서 "그 버튼 어디 있는데"에서 멈춘다.
 *   ② 없는 id 를 가리키는 pin — 번호가 조용히 사라진다(에러도 안 난다).
 *   ③ 캡처 파일이 실제로 있는지, 좌표가 이미지 안에 있는지.
 *   ④ 단계마다 "누를 곳" 표시가 최소 하나.
 *   ⑤ 한 화면 안에서 번호가 1,2,3 순서로 가는지.
 *   (+ pin 이 안 붙은 체크리스트 항목은 경고로 센다 — 목업과 글이 1:1 로 안 붙은 자리)
 *
 * 실행: node scripts/check-start-mockups.mjs
 */

import { createJiti } from 'jiti';
import path from 'node:path';
import { existsSync } from 'node:fs';
import process from 'node:process';

const root = process.cwd();
const jiti = createJiti(import.meta.url, { fsCache: false, tryNative: false, alias: { '@': path.join(root, 'src') } });

const { ROADMAP_STEPS } = await jiti.import(path.join(root, 'src/lib/data/start-roadmap.ts'));
const { STEP_MOCKUPS } = await jiti.import(path.join(root, 'src/lib/data/start-mockups/index.ts'));

// 렌더러의 CLICK_KINDS 와 같은 목록. 여기와 StepMockup.tsx 가 어긋나면
// 검사는 통과하는데 화면에는 점선이 안 쳐진다.
const CLICK_KINDS = new Set([
  'btn', 'btnrow', 'select', 'field', 'radio', 'check', 'tabs', 'cards', 'thumbs', 'upload',
]);

let errors = 0;
let warnings = 0;

for (const step of ROADMAP_STEPS) {
  const screens = STEP_MOCKUPS[step.id];
  const subIds = step.subSteps.map((s) => s.id);

  if (!screens || screens.length === 0) {
    console.error(`✗ ${step.number}. ${step.title} — 목업 없음 (${step.id})`);
    errors++;
    continue;
  }

  const pins = [];
  for (const screen of screens) {
    if (!screen.caption) {
      console.error(`✗ ${step.number}. ${step.title} / ${screen.tab} — caption 없음`);
      errors++;
    }
    if (screen.kind === 'shot') {
      // 실제 캡처: 파일이 진짜 있어야 하고, 좌표가 이미지 밖으로 나가면 배지가 사라진다.
      const file = path.join(root, 'public', screen.src.replace(/^\//, ''));
      if (!existsSync(file)) {
        console.error(`✗ ${step.number}. ${step.title} / ${screen.tab} — 캡처 파일 없음: ${screen.src}`);
        errors++;
      }
      if (!screen.alt) {
        console.error(`✗ ${step.number}. ${step.title} / ${screen.tab} — alt 없음`);
        errors++;
      }
      for (const h of screen.hotspots) {
        pins.push(h.pin);
        if (!subIds.includes(h.pin)) {
          console.error(`✗ ${step.number}. ${step.title} / ${screen.tab} — 없는 pin: ${h.pin}`);
          errors++;
        }
        if (h.x < 0 || h.x > 100 || h.y < 0 || h.y > 100) {
          console.error(`✗ ${step.number}. ${step.title} / ${screen.tab} — 좌표가 범위 밖: ${h.x},${h.y}`);
          errors++;
        }
      }
      continue;
    }

    for (const block of screen.blocks) {
      if (!block.pin) continue;
      pins.push(block.pin);
      if (!subIds.includes(block.pin)) {
        console.error(`✗ ${step.number}. ${step.title} / ${screen.tab} — 없는 pin: ${block.pin}`);
        errors++;
      }
    }
  }

  // ④ 단계마다 "누를 곳" 이 최소 하나는 표시돼야 한다.
  //    설명만 번호로 매겨두면 "어디를 눌러요" 라는 질문이 그대로 남는다.
  const clickTargets = screens.reduce((n, sc) => {
    if (sc.kind === 'shot') return n + sc.hotspots.length;
    return n + sc.blocks.filter((b) => b.pin && CLICK_KINDS.has(b.k)).length;
  }, 0);
  if (clickTargets === 0) {
    console.error(`✗ ${step.number}. ${step.title} — 누를 곳 표시가 하나도 없음`);
    errors++;
  }

  // ⑤ 한 화면 안에서 번호가 거꾸로 가면 안 된다.
  //    사람은 위에서 아래로 읽는데 번호가 1,5,2 로 뛰면 "순서대로 하라"는 말이 거짓이 된다.
  for (const screen of screens) {
    const seq = (
      screen.kind === 'shot'
        ? screen.hotspots.map((h) => h.pin)
        : screen.blocks.map((b) => b.pin).filter(Boolean)
    )
      .map((p) => subIds.indexOf(p) + 1)
      .filter((n) => n > 0);
    const ascending = seq.every((v, i) => i === 0 || v >= seq[i - 1]);
    if (!ascending) {
      console.error(
        `✗ ${step.number}. ${step.title} / ${screen.tab} — 번호가 거꾸로 갑니다: ${seq.join(',')}`,
      );
      errors++;
    }
  }

  const missing = subIds.filter((id) => !pins.includes(id));
  if (missing.length > 0) {
    console.warn(`△ ${step.number}. ${step.title} — pin 안 붙은 항목: ${missing.join(', ')}`);
    warnings += missing.length;
  }
}

const shotCount = ROADMAP_STEPS.reduce(
  (n, s) => n + (STEP_MOCKUPS[s.id] ?? []).filter((x) => x.kind === 'shot').length,
  0,
);
const clickCount = ROADMAP_STEPS.reduce((n, s) => {
  const ids = s.subSteps.map((x) => x.id);
  return (
    n +
    (STEP_MOCKUPS[s.id] ?? []).reduce((m, sc) => {
      if (sc.kind === 'shot') return m + sc.hotspots.filter((h) => ids.includes(h.pin)).length;
      return m + sc.blocks.filter((b) => b.pin && CLICK_KINDS.has(b.k)).length;
    }, 0)
  );
}, 0);
const stepCount = ROADMAP_STEPS.length;
const screenCount = ROADMAP_STEPS.reduce((n, s) => n + (STEP_MOCKUPS[s.id]?.length ?? 0), 0);
const subCount = ROADMAP_STEPS.reduce((n, s) => n + s.subSteps.length, 0);

console.log(
  `\n${stepCount}단계 · 화면 ${screenCount}장(실제 캡처 ${shotCount}장) · 체크항목 ${subCount}개 · 누를 곳 ${clickCount}곳 — 오류 ${errors}, 미연결 ${warnings}`,
);

// Every mission now opens its own matching screen; a missing pin would render an empty guide.
if (errors > 0 || warnings > 0) process.exit(1);
