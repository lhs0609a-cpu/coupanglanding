/**
 * 소싱 → 올인원 배턴터치 검증.
 * 추출 → 폴더 굽기 → **올인원 스캐너가 실제로 읽는지**까지 한 번에 확인한다.
 * 폴더 규격이 한 글자만 달라도 올인원은 조용히 0개를 읽는다 — 그래서 스캐너로 되읽어 본다.
 */
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { withProbeTab, say } from './_probe-tab.mjs';
import { extractDetailJs, writeProductFolder, ensureRoot } from '../main/modules/naver-ingest/detail-extract.mjs';

const URL_ARG = process.argv.find((a) => a.startsWith('https://'));

withProbeTab(async (tab) => {
  const { scanFolder } = await import('../runtime/folder-scanner.mjs');

  const root = ensureRoot(join(tmpdir(), 'mgl-pipeline-probe'));
  try { rmSync(root, { recursive: true, force: true }); } catch { /* 없으면 그만 */ }
  ensureRoot(root);

  const nav = await tab.gotoViaClick(URL_ARG, { timeoutMs: 20000 });
  if (!nav.ok) { say('❌ 이동 실패: ' + (nav.error || 'unknown')); return 1; }
  await new Promise((r) => { const t = setTimeout(r, 3000); t.unref?.(); });
  const data = await tab.evaluate(extractDetailJs).catch((e) => ({ error: String(e?.message || e) }));
  if (!data || data.error) { say('❌ 추출 실패: ' + (data && data.error)); return 1; }

  say('추출 완료 — 폴더를 굽습니다…');
  const saved = await writeProductFolder(root, data, { onLog: (m) => say('  ' + m) });
  say(`폴더: ${saved.folder}`);
  say(`저장: 대표 ${saved.mainImages}장 · 상세 ${saved.detailImages}장 · 리뷰 ${saved.reviewImages}장`);

  say('\n── 올인원 스캐너가 읽은 결과 ──');
  const products = scanFolder(root);
  say('상품 수: ' + products.length);
  for (const p of products) {
    say('  원본상품명 : ' + String(p.originalName || p.name || '').slice(0, 50));
    say('  가격       : ' + (p.price ?? '-'));
    say('  대표 후보  : ' + (p.mainImages || []).length + '장');
    say('  상세 이미지: ' + (p.detailImages || []).length + '장');
    say('  리뷰 이미지: ' + (p.reviewImages || []).length + '장');
    say('  옵션       : ' + ((p.options || []).length) + '개');
    say('  설명 길이  : ' + String(p.description || '').length + '자');
    say('  기타 키    : ' + Object.keys(p).filter((k) => !['mainImages','detailImages','reviewImages'].includes(k)).slice(0, 18).join(', '));
  }
  return products.length ? 0 : 1;
})
  .then((code) => process.exit(code ?? 0))
  .catch((e) => { say('❌ ' + (e?.stack || e)); process.exit(1); });
