/**
 * 올인원 배치 CLI (순수 node + ollama)
 * ---------------------------------------------------------------------------
 * 실행: node run-batch.mjs <products.json> [모델=exaone3.5:7.8b] [sellerId]
 *   products.json: [{ "originalName":"...", "brand":"", "features":[], "id":"" }, ...]
 * 출력: <products>.generated.jsonl (레코드별 1줄) + 콘솔 진행/요약
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { isUp } from './lib/local-llm.mjs';
import { generateBatch } from './lib/ai-batch.mjs';

const FILE = process.argv[2];
const MODEL = process.argv[3] || 'exaone3.5:7.8b';
const SELLER = process.argv[4] || 'seller-A';

if (!FILE) { console.error('사용법: node run-batch.mjs <products.json> [모델] [sellerId]'); process.exit(1); }

async function main() {
  if (!(await isUp())) { console.error('ollama 미응답 (http://127.0.0.1:11434)'); process.exit(1); }
  const products = JSON.parse(readFileSync(FILE, 'utf8'));
  const arr = Array.isArray(products) ? products : (products.products || []);
  const outFile = FILE.replace(/\.json$/i, '') + '.generated.jsonl';
  writeFileSync(outFile, '');
  console.log(`배치 생성: ${arr.length}개 (모델 ${MODEL}) → ${outFile}\n`);

  const allRecords = [];
  const { summary } = await generateBatch(arr, {
    model: MODEL, sellerId: SELLER, maxDetailTokens: 800,
    onItem: (i, total, rec) => {
      appendFileSync(outFile, JSON.stringify(rec) + '\n');
      allRecords.push(rec);
      const flag = rec.needsReview ? '⚠️검수' : '✅';
      console.log(`[${i + 1}/${total}] ${flag} ${rec.displayName}  | ${rec.categoryPath} [${rec.categoryCode || '-'}] | ${(rec.ms / 1000).toFixed(1)}s`);
    },
  });
  const htmlFile = FILE.replace(/\.json$/i, '') + '.review.html';
  writeFileSync(htmlFile, buildReviewHtml(allRecords, summary), 'utf8');
  console.log(`검수화면: ${htmlFile}`);
  console.log(`\n=== 요약 ===`);
  console.log(`총 ${summary.total} · 통과 ${summary.ok} · 검수필요 ${summary.needsReview}`);
  console.log(`상품당 평균 ${(summary.avgMs / 1000).toFixed(1)}s · 전체 ${(summary.wallMs / 1000 / 60).toFixed(1)}분 · 후보=${summary.candidateSource}`);
  console.log(`결과: ${outFile}`);
}
/** 검수화면 HTML 생성 — 카드(대표이미지·노출명·링크·가격·옵션·상세클릭·승인) + 선택분 내보내기 */
function buildReviewHtml(records, summary) {
  const data = JSON.stringify(records).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>올인원 생성 검수 (${records.length}건)</title>
<style>
 body{font-family:'Malgun Gothic',sans-serif;margin:0;background:#f5f6f8;color:#1a1a1a}
 header{position:sticky;top:0;background:#fff;border-bottom:1px solid #e5e5e5;padding:12px 20px;display:flex;gap:16px;align-items:center;z-index:10}
 header h1{font-size:16px;margin:0}.muted{color:#888;font-size:13px}
 button{cursor:pointer;border:1px solid #ccc;background:#fff;border-radius:6px;padding:8px 14px;font-size:14px}
 .primary{background:#346aff;color:#fff;border-color:#346aff}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:14px;padding:18px}
 .card{background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px}
 .card.review{border-color:#f5a623;box-shadow:0 0 0 2px #fff3df inset}
 .row{display:flex;gap:10px}.thumb{width:84px;height:84px;object-fit:cover;border-radius:8px;background:#eee;flex:0 0 84px}
 .name{font-weight:700;font-size:15px;line-height:1.35}
 .price{font-size:16px;font-weight:700;color:#e0245e}.src{font-size:12px;color:#999;text-decoration:line-through}
 .cat{font-size:12px;color:#346aff}.opt{font-size:12px;background:#f0f3ff;border-radius:4px;padding:2px 6px;margin:2px 2px 0 0;display:inline-block}
 .kw{font-size:11px;color:#777}
 a.link{font-size:12px;color:#0a7;word-break:break-all}
 .detail{display:none;white-space:pre-wrap;font-size:13px;line-height:1.6;background:#fafafa;border:1px solid #eee;border-radius:6px;padding:10px;margin-top:6px;max-height:340px;overflow:auto}
 .flag{font-size:11px;background:#f5a623;color:#fff;border-radius:4px;padding:1px 6px}
 label.appr{font-size:13px;display:flex;gap:6px;align-items:center}
</style></head><body>
<header>
 <h1>🧩 올인원 생성 검수</h1>
 <span class="muted">총 ${summary.total} · 통과 ${summary.ok} · 검수필요 ${summary.needsReview} · 평균 ${(summary.avgMs/1000).toFixed(1)}s · 후보=${summary.candidateSource}</span>
 <span style="flex:1"></span>
 <span class="muted">승인 <b id="cnt">0</b>건</span>
 <button class="primary" onclick="exportSel()">선택분 등록 payload 내보내기(JSON)</button>
</header>
<div class="grid" id="grid"></div>
<script>
const R = ${data};
const won = n => n==null?'-':Number(n).toLocaleString()+'원';
const esc = s => String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const grid = document.getElementById('grid');
R.forEach((r,i)=>{
  const opts = (r.options||[]).map(o=>'<span class=opt>'+esc(o.name)+': '+esc(o.value)+(o.unit?esc(o.unit):'')+'</span>').join('');
  const kw = (r.keywords||[]).map(esc).join(', ');
  const el = document.createElement('div');
  el.className='card'+(r.needsReview?' review':'');
  el.innerHTML =
   '<div class=row>'+
     (r.mainImage?'<img class=thumb src="'+esc(r.mainImage)+'">':'<div class=thumb></div>')+
     '<div style="flex:1;min-width:0">'+
       (r.needsReview?'<span class=flag>검수필요</span> ':'')+
       '<div class=name>'+esc(r.displayName)+'</div>'+
       '<div class=cat>'+esc(r.categoryPath)+(r.categoryCode?' ['+esc(r.categoryCode)+']':'')+'</div>'+
       '<div><span class=price>'+won(r.sellingPrice)+'</span> '+(r.sourcePrice?'<span class=src>'+won(r.sourcePrice)+'</span>':'')+'</div>'+
     '</div>'+
   '</div>'+
   '<div>'+opts+'</div>'+
   '<div class=kw>키워드: '+esc(kw)+'</div>'+
   (r.sourceUrl?'<a class=link href="'+esc(r.sourceUrl)+'" target=_blank>원본: '+esc(r.sourceUrl)+'</a>':'')+
   '<div><button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\\'block\\'?\\'none\\':\\'block\\'">상세페이지 보기 ▾</button>'+
     '<div class=detail>'+esc(r.detail)+'</div></div>'+
   '<label class=appr><input type=checkbox data-i="'+i+'" onchange="upd()" '+(r.needsReview?'':'checked')+'> 등록 승인</label>';
  grid.appendChild(el);
});
function selected(){return [...document.querySelectorAll('input[type=checkbox]:checked')].map(c=>R[+c.dataset.i]);}
function upd(){document.getElementById('cnt').textContent=selected().length;}
function exportSel(){const sel=selected();const blob=new Blob([JSON.stringify(sel,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='approved-products.json';a.click();}
upd();
</script></body></html>`;
}

main().catch((e) => { console.error('배치 오류:', e.message); process.exit(1); });
