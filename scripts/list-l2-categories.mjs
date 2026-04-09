#!/usr/bin/env node
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const story = JSON.parse(readFileSync(join(ROOT, 'src/lib/megaload/data/story-templates.json'), 'utf-8'));
const keys = Object.keys(story.variables).filter(k => k !== 'DEFAULT');

const byL1 = {};
for (const k of keys) {
  const [l1] = k.split('>');
  if (!byL1[l1]) byL1[l1] = [];
  byL1[l1].push(k);
}

for (const [l1, arr] of Object.entries(byL1)) {
  console.log(`${l1}: ${arr.length}`);
  for (const k of arr) console.log(`  - ${k}`);
}
console.log(`\nTOTAL: ${keys.length}`);
