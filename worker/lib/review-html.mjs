/**
 * 올인원 생성 검수화면 HTML 빌더 (공유)
 * ---------------------------------------------------------------------------
 * 카드: 대표이미지·노출상품명·카테고리(+코드)·판매가(원가취소선)·옵션·키워드·
 *       원본링크·상세페이지(클릭 토글)·등록 승인 체크박스 + 선택분 payload 내보내기.
 * run-batch.mjs / run-folder.mjs 가 공통 사용.
 *
 * 로컬 파일 경로(Windows 드라이브/역슬래시)는 브라우저 표시용 file:/// URL 로 변환.
 */

/** 로컬 절대경로 → file:/// URL (http/https/data 는 그대로) */
export function toDisplaySrc(p) {
  if (!p) return '';
  if (/^(https?:|data:|file:)/i.test(p)) return p;
  const norm = String(p).replace(/\\/g, '/');
  return 'file:///' + norm.replace(/^\/+/, '');
}

/** @param {Object[]} records @param {Object} summary @returns {string} HTML */
export function buildReviewHtml(records, summary) {
  // 표시용 mainImage 를 file:/// 로 정규화한 사본
  const view = records.map((r) => ({ ...r, mainImage: toDisplaySrc(r.mainImage) }));
  const data = JSON.stringify(view).replace(/</g, '\\u003c');
  const s = summary || { total: records.length, ok: 0, needsReview: 0, avgMs: 0, candidateSource: '-' };
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
 .imgflag{font-size:10px;color:#0a7}.imgwarn{font-size:10px;color:#c60}
 label.appr{font-size:13px;display:flex;gap:6px;align-items:center}
</style></head><body>
<header>
 <h1>🧩 올인원 생성 검수</h1>
 <span class="muted">총 ${s.total} · 통과 ${s.ok} · 검수필요 ${s.needsReview} · 평균 ${(s.avgMs/1000).toFixed(1)}s · 후보=${s.candidateSource}${s.thumbsProcessed!=null?` · 대표가공 ${s.thumbsProcessed}/${s.total}`:''}</span>
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
  const imgTag = r.thumbProcessed===true?'<div class=imgflag>✓ AI 가공 대표</div>':(r.thumbProcessed===false?'<div class=imgwarn>· 원본 사진(가공 폴백)</div>':'');
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
       imgTag+
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
