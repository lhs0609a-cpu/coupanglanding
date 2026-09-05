/**
 * 채널ID 폴백 검증 — performance 리소스 버퍼가 비어도 추출이 되는가.
 * 버퍼 소실은 리소스가 250개를 넘으면 실제로 일어나고, 그때 추출이 통째로 실패했다.
 * clearResourceTimings() 로 그 상황을 그대로 만든 뒤 추출을 돌린다.
 */
import { withProbeTab, say } from './_probe-tab.mjs';
import { extractDetailJs } from '../main/modules/naver-ingest/detail-extract.mjs';

const URL_ARG = process.argv.find((a) => a.startsWith('https://'));

withProbeTab(async (tab) => {
  const nav = await tab.gotoViaClick(URL_ARG, { timeoutMs: 20000 });
  if (!nav.ok) { say('❌ 이동 실패: ' + (nav.error || 'unknown')); return; }
  await new Promise((r) => { const t = setTimeout(r, 3000); t.unref?.(); });

  for (const mode of ['정상(버퍼 있음)', '버퍼 비움(장애 재현)']) {
    if (mode.startsWith('버퍼')) {
      await tab.evaluate('(()=>{performance.clearResourceTimings();return performance.getEntriesByType("resource").length})()')
        .then((n) => say(`\n[${mode}] 리소스 엔트리 ${n}개로 비움`))
        .catch((e) => say('clear err ' + e));
    } else { say(`[${mode}]`); }
    const d = await tab.evaluate(extractDetailJs).catch((e) => ({ error: String(e?.message || e) }));
    if (d?.error) { say('  ❌ ' + d.error); continue; }
    say(`  ✅ ${String(d.title || '').slice(0, 30)} | 채널 ${d.channelId} | 옵션 ${(d.options || []).length} · 상세 ${(d.detailImages || []).length}장 · 리뷰 ${(d.reviewImages || []).length}장 · 고시 ${d.notice ? 'O' : 'X'}`);
  }
})
  .then(() => process.exit(0))
  .catch((e) => { say('❌ ' + (e?.stack || e)); process.exit(1); });
