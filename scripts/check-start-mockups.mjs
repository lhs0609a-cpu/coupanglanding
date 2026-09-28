/**
 * /start 화면 목업 검사.
 *
 * 세 가지를 본다:
 *   ① 목업이 없는 단계   — 그 단계는 글만 남아서 "그 버튼 어디 있는데"에서 멈춘다.
 *   ② 없는 id 를 가리키는 pin — 번호가 조용히 사라진다(에러도 안 난다).
 *   ③ pin 이 안 붙은 체크리스트 항목 — 목업과 글이 1:1 로 안 붙은 자리.
 *
 * 실행: node scripts/check-start-mockups.mjs
 */

import { createJiti } from 'jiti';
import path from 'node:path';
import { existsSync } from 'node:fs';
import process from 'node:process';

const root = process.cwd();
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(root, 'src') } });

const { ROADMAP_STEPS } = await jiti.import(path.join(root, 'src/lib/data/start-roadmap.ts'));
const { STEP_MOCKUPS } = await jiti.import(path.join(root, 'src/lib/data/start-mockups/index.ts'));

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
const stepCount = ROADMAP_STEPS.length;
const screenCount = ROADMAP_STEPS.reduce((n, s) => n + (STEP_MOCKUPS[s.id]?.length ?? 0), 0);
const subCount = ROADMAP_STEPS.reduce((n, s) => n + s.subSteps.length, 0);

console.log(
  `\n${stepCount}단계 · 화면 ${screenCount}장(실제 캡처 ${shotCount}장) · 체크항목 ${subCount}개 — 오류 ${errors}, 미연결 ${warnings}`,
);

if (errors > 0) process.exit(1);
