import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const require = createRequire(import.meta.url);
const e = require(join(root, '.audit-build/services/persuasion-engine.js'));
const r = JSON.parse(readFileSync(join(root, 'scripts/audit-fast-result.json'), 'utf-8'));

const sbr = r.samplesByRule || {};
for (const s of (sbr['15_duplicate_sentences'] || [])) {
  const catPath = s.catPath.replace(/ /g, '>');
  const leafName = s.catPath.split(' ').slice(-1)[0];
  for (let i = 0; i < 3; i++) {
    const result = e.generatePersuasionContent(s.productName, catPath, 'audit:' + s.code, i, [leafName], s.code);
    const paras = e.contentBlocksToParagraphs(result.blocks, catPath);
    const text = paras.join('\n');
    const sent = text.split(/[.!?]\s+/).map(x => x.trim()).filter(x => x.length > 25);
    const map = new Map();
    for (const ss of sent) {
      const k = ss.replace(/[가-힣]+상품|이 (상품|제품)/g, '').slice(0, 60);
      map.set(k, (map.get(k) || 0) + 1);
    }
    const dups = [...map.entries()].filter(([k, v]) => v >= 2);
    if (dups.length > 0) {
      console.log('=== HIT ===');
      console.log('cat:', s.catPath, '| idx:', i, '| code:', s.code);
      for (const [k, v] of dups) console.log('  ', v, 'x first60:', k);
      // 실제 매칭 — 동일 첫 60자 문장 찾기
      for (const [k, v] of dups) {
        const matched = sent.filter(s2 => {
          const k2 = s2.replace(/[가-힣]+상품|이 (상품|제품)/g, '').slice(0, 60);
          return k2 === k;
        });
        for (const m of matched) console.log('    →', JSON.stringify(m));
      }
      process.exit(0);
    }
  }
}
console.log('no dup found in current build');
