const fs = require('fs');
const path = require('path');
const dataDir = path.join(process.cwd(), 'src', 'lib', 'sellerhub', 'data');
const index = JSON.parse(fs.readFileSync(path.join(dataDir, 'coupang-cat-index.json')));
const details = JSON.parse(fs.readFileSync(path.join(dataDir, 'coupang-cat-details.json')));

// ===== 매칭 엔진 =====
const NW = new Set(['mg','mcg','iu','ml','g','kg','l','ea','pcs','프리미엄','고함량','저분자','먹는','국내','해외','추천','인기','베스트','대용량','소용량','순수','천연','식물성','무료배송','당일발송','특가','할인','증정','사은품','함유','효능','효과','예방','개선','new','box','haccp']);
const NP = [/^\d+$/, /^\d+\+\d+$/, /^\d+(개월|일|주)분?$/, /^\d+(ml|g|kg|mg|l|ea)$/i];
function clean(n){return[...new Set(n.replace(/[\[\(【][^\]\)】]*[\]\)】]/g,' ').replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g,' ').split(/\s+/).filter(Boolean).map(w=>w.toLowerCase()))].join(' ');}
function tok(n){return clean(n).split(/\s+/).filter(w=>{if(!w)return false;if(w.length===1)return/[가-힣]/.test(w);if(NW.has(w))return false;return!NP.some(p=>p.test(w));});}
const SYN={선크림:['선크림','선로션','자외선차단'],수분크림:['수분크림','데이크림'],레티놀:['레티놀','주름개선','안티에이징크림'],오메가3:['오메가3','오메가3지방산'],프로바이오틱스:['프로바이오틱스','유산균'],유산균:['유산균','프로바이오틱스'],종합비타민:['종합비타민','멀티비타민'],콜라겐:['콜라겐','히알루론산','피쉬콜라겐'],밀크씨슬:['밀크씨슬','간건강'],아몬드:['아몬드','견과류','견과'],꿀:['벌꿀','꿀','아카시아꿀'],화장지:['화장지','두루마리','휴지'],주방세제:['주방세제','식기세척'],섬유유연제:['섬유유연제','유연제'],양말:['양말','남성양말','여성양말','스포츠양말'],슬랙스:['슬랙스','정장바지','팬츠'],도마:['도마','항균도마','나무도마'],텀블러:['텀블러','보온텀블러','보냉텀블러'],충전케이블:['충전케이블','데이터케이블'],이불:['이불','차렵이불','극세사이불'],극세사:['극세사','극세사이불'],아령:['아령','덤벨'],덤벨:['덤벨','아령'],와이퍼:['와이퍼','와이퍼블레이드'],기저귀:['기저귀','일회용기저귀'],분유:['분유','조제분유'],보조배터리:['보조배터리','휴대용배터리']};
function cmp(t){const c=[...t];for(let i=0;i<t.length-1;i++)c.push(t[i]+t[i+1]);const ex=[...c];for(const x of c){const s=SYN[x];if(s)for(const y of s)if(!ex.includes(y))ex.push(y);}return ex;}
const DC={오메가3:{c:'73134',p:'식품>건강식품>기타건강식품>오메가3,6,9'},밀크씨슬:{c:'58926',p:'식품>건강식품>기타건강식품>밀크시슬'},밀크시슬:{c:'58926',p:'식품>건강식품>기타건강식품>밀크시슬'},화장지:{c:'63900',p:'생활용품>화장지물티슈>일반롤화장지'},휴지:{c:'63900',p:'생활용품>화장지물티슈>일반롤화장지'},주방세제:{c:'63961',p:'생활용품>세제>주방세제>일반주방세제'},섬유유연제:{c:'63950',p:'생활용품>세제>섬유유연제>일반 섬유유연제'},와이퍼:{c:'78710',p:'자동차용품>실외용품>와이퍼>플랫와이퍼'},접이식테이블:{c:'77950',p:'가구>주방가구>식탁테이블>접이식식탁'},꿀:{c:'58900',p:'식품>가공즉석식품>시럽>일반꿀'},벌꿀:{c:'58900',p:'식품>가공즉석식품>시럽>일반꿀'},충전케이블:{c:'62691',p:'가전/디지털>휴대폰액세서리>충전 케이블'},데이터케이블:{c:'62691',p:'가전/디지털>휴대폰액세서리>충전 케이블'},레티놀:{c:'56171',p:'뷰티>스킨>에센스/세럼/앰플>에센스/세럼'},접이식:{c:'77950',p:'가구>주방가구>식탁테이블>접이식식탁'}};
function directMatch(tokens){const ct=cmp(tokens);for(const t of ct){const d=DC[t];if(d)return{entry:[d.c,'',d.p.split('>').pop(),4],score:50,direct:true,path:d.p};}return null;}
function lm(tokens){if(!tokens.length)return null;const dm=directMatch(tokens);if(dm)return dm;const cs=new Set(cmp(tokens));const ms=new Set(tokens.filter(t=>t.length>=2));let best=null;
for(const e of index){const[,cts,leaf,depth]=e;const cl=cts.split(' ');const ll=leaf.toLowerCase();let sc=0,ls=0;
for(const t of cmp(tokens)){if(t.length>=2&&t===ll){ls=20;break;}}
if(!ls){const lw=ll.split(/[\/\s]/).filter(Boolean);let wc=0;for(const t of cmp(tokens)){if(t.length>=2&&lw.some(l=>l===t))wc++;}if(wc>0)ls=6+wc*3;}
if(!ls){for(const t of cmp(tokens)){if(t.length>=2&&ll.includes(t)){ls=Math.min(6,t.length+1);break;}}}
sc+=ls;let mc=0;for(const c of cl){if(cs.has(c)||ms.has(c)){sc+=3;mc++;}}
if(mc>=4)sc+=25;else if(mc>=3)sc+=18;else if(mc>=2)sc+=10;
if(cl.length>0&&mc>0)sc+=Math.round((mc/cl.length)*5);
if(ls>0&&mc<=1)sc-=3;if(mc>=2)sc+=Math.round(depth*0.5);
if(sc>0&&(!best||sc>best.score))best={entry:e,score:sc};}
return best&&best.score>=12?best:null;}

// ===== 옵션 추출 =====
function xC(n){const r={};const vc=n.match(/(\d+(?:\.\d+)?)\s*(ml|mL)\s*[xX×]\s*(\d+)/i);if(vc){r.volume={value:parseFloat(vc[1])};r.count=parseInt(vc[3]);}const wc=n.match(/(\d+(?:\.\d+)?)\s*(g|kg)\s*[xX×]\s*(\d+)/i);if(wc){let v=parseFloat(wc[1]);if(/kg/i.test(wc[2]))v*=1000;r.weight={value:v};r.count=parseInt(wc[3]);}const sp=n.match(/(\d+)\s*(매|장)\s*[xX×]\s*(\d+)/i);if(sp){r.perCount=parseInt(sp[1]);r.count=parseInt(sp[3]);}const pm=n.match(/(\d+)\s*\+\s*(\d+)(?!\s*(?:ml|g|kg|mg|l|정|캡슐))/i);if(pm&&!r.count)r.count=parseInt(pm[1])+parseInt(pm[2]);return r;}
function xCnt(n,c){if(c.count)return c.count;const m=n.match(/(\d+)\s*(개(?!입|월)|팩|세트|박스|봉|병|통|족|켤레|롤|EA|ea|P)(?!\s*[xX×])/i);if(m)return parseInt(m[1]);if(!c.perCount){const s=n.match(/(\d+)\s*(매|장)(?!\s*[xX×])/);if(s)return parseInt(s[1]);}return 1;}
function xV(n,c){if(c.volume)return c.volume.value;const ll=n.match(/(\d+(?:\.\d+)?)\s*(리터|ℓ)/i);if(ll)return parseFloat(ll[1])*1000;const l=n.match(/(\d+(?:\.\d+)?)\s*L(?!\s*[xX×a-zA-Z])/);if(l){const v=parseFloat(l[1]);if(v>=0.1&&v<=20)return v*1000;}const m=n.match(/(\d+(?:\.\d+)?)\s*(ml|mL|ML)(?!\s*[xX×])/i);return m?parseFloat(m[1]):null;}
function xW(n,c){if(c.weight)return c.weight.value;const k=n.match(/(\d+(?:\.\d+)?)\s*(kg|KG)(?!\s*[xX×])/i);if(k)return parseFloat(k[1])*1000;const g=n.match(/(?<![mk])(\d+(?:\.\d+)?)\s*(g|그램)(?!\s*[xX×])/i);return g?parseFloat(g[1]):null;}
function xT(n){const m=n.match(/(\d+)\s*(정|캡슐|알|타블렛|소프트젤|포(?!기|인))/);return m?parseInt(m[1]):null;}
function xPC(n,c){if(c.perCount)return c.perCount;const m=n.match(/(\d+)\s*개입/);return m?parseInt(m[1]):null;}

function fallback(optName,prodName){const n=optName.toLowerCase();
  if(n.includes('색상')||n.includes('컬러')){const colors=['블랙','화이트','레드','블루','핑크','그린','네이비','베이지','그레이','브라운','골드','실버','로즈골드'];for(const c of colors)if(prodName.includes(c))return c;return'상세페이지 참조';}
  if(n.includes('모델')||n.includes('품번'))return'자체제작';
  if(n.includes('구성'))return'본품';
  if(n.includes('맛')||n.includes('향'))return'상세페이지 참조';
  if(n.includes('사이즈')||n.includes('크기')){const sm=prodName.match(/\b(FREE|F|S|M|L|XL|XXL)\b/i);if(sm)return sm[1].toUpperCase();return'FREE';}
  if(n.includes('신발')){const sh=prodName.match(/(\d{3})\s*(mm)?/);return sh?sh[1]:'상세페이지 참조';}
  if(n.includes('단계')){if(prodName.includes('대형'))return'대형';if(prodName.match(/(\d)\s*단계/))return prodName.match(/(\d)\s*단계/)[1]+'단계';return'상세페이지 참조';}
  if(n.includes('총')&&n.includes('수량')){const m=prodName.match(/(\d+)\s*(매|장|개)/);return m?m[1]:'1';}
  if(n.includes('전구')&&n.includes('색상')){if(prodName.includes('주광색'))return'주광색';if(prodName.includes('전구색'))return'전구색';return'상세페이지 참조';}
  if((n.includes('수산물')||n.includes('농산물'))&&n.includes('중량'))return'상세페이지 참조';
  if(n.includes('ram')||n.includes('메모리')){const mm=prodName.match(/(\d+)\s*(GB|TB|MB)/i);return mm?mm[1]+mm[2].toUpperCase():'상세페이지 참조';}
  if(n.includes('용량')){const ml=prodName.match(/(\d+(?:\.\d+)?)\s*(ml|mL|L)/i);if(ml){let v=parseFloat(ml[1]);if(/^L$/i.test(ml[2]))v*=1000;return String(v);}return'상세페이지 참조';}
  if(n==='중량'){const k=prodName.match(/(\d+(?:\.\d+)?)\s*(kg|KG)/i);if(k)return parseFloat(k[1])+'kg';const g=prodName.match(/(?<![mk])(\d+(?:\.\d+)?)\s*(g|그램)/i);if(g)return g[1]+'g';return'상세페이지 참조';}
  if(n.includes('길이')||n==='길이'){const mm=prodName.match(/(\d+)\s*mm/i);if(mm)return mm[1]+'mm';const m=prodName.match(/(\d+(?:\.\d+)?)\s*m(?!m|l|g|A|B|a|b)/);if(m)return m[1]+'m';const cm=prodName.match(/(\d+(?:\.\d+)?)\s*cm/i);if(cm)return cm[1]+'cm';return'상세페이지 참조';}
  if(n.includes('차종'))return'공용';
  if(n.includes('인원'))return'상세페이지 참조';
  if(n.includes('가로')||n.includes('세로')){const d=prodName.match(/(\d+)\s*[xX×]\s*(\d+)/);if(d)return n.includes('가로')?d[1]+'mm':d[2]+'mm';return'상세페이지 참조';}
  if(n.includes('원료')||n.includes('주원료'))return'상세페이지 참조';
  if(n==='개당 수량')return'상세페이지 참조';
  return null;}
function extractOpts(name,code){
  const d=details[code];if(!d)return{opts:[],warns:['DB없음'],conf:0};
  const bo=d.b;if(!bo||!bo.length)return{opts:[],warns:[],conf:100};
  const cp=xC(name);const ext=new Map();
  for(const o of bo){let v=null;
    if(o.n==='수량'&&o.u==='개')v=String(xCnt(name,cp));
    else if(o.n==='개당 용량'&&o.u==='ml'){const ml=xV(name,cp);if(ml!==null)v=String(ml);}
    else if(o.n==='개당 중량'&&o.u==='g'){const g=xW(name,cp);if(g!==null)v=String(g);}
    else if(o.n==='개당 수량'&&o.u==='개'){const pc=xPC(name,cp);if(pc!==null)v=String(pc);}
    else if(o.n.includes('캡슐')||o.n.includes('정')){const t=xT(name);if(t!==null)v=String(t);}
    if(v!==null)ext.set(o.n,{value:v,unit:o.u});}
  const c1=bo.filter(o=>o.c1);let c1f=false;const res=[];const warns=[];
  if(c1.length>0){const pri=['개당 용량','개당 캡슐','개당 정','개당 중량'];
    const sorted=[...c1].sort((a,b)=>{const ai=pri.findIndex(p=>a.n.includes(p));const bi=pri.findIndex(p=>b.n.includes(p));return(ai<0?99:ai)-(bi<0?99:bi);});
    for(const o of sorted){if(c1f)break;const e=ext.get(o.n);if(e){res.push({name:o.n,value:e.value,unit:e.unit});c1f=true;}}}
  for(const o of bo){if(o.c1)continue;const e=ext.get(o.n);if(e)res.push({name:o.n,value:e.value,unit:e.unit});else if(o.r){
    const fb=fallback(o.n,name);if(fb){res.push({name:o.n,value:fb,unit:o.u});warns.push(o.n+'→기본값');}else warns.push(o.n);}}
  if(c1.length>0&&!c1f&&c1.some(o=>o.r))warns.push('택1그룹');
  const nc1r=bo.filter(o=>o.r&&!o.c1);let tr=nc1r.length,fr=0;
  if(c1.some(o=>o.r)){tr++;if(c1f)fr++;}
  for(const r of nc1r){if(res.some(x=>x.name===r.n))fr++;}
  return{opts:res,warns,conf:tr>0?Math.round(fr/tr*100):100};}

// ===== 50개 네이버 실제 상품명 =====
const prods = [
  '바이오 리프팅 넥 크림 50ml','히알루론산 세럼 30ml 보습 에센스','선크림 SPF50 톤업 50ml',
  '클렌징 오일 200ml 딥클렌징','레티놀 주름개선 크림 50g','수분크림 100ml 민감성',
  '비타민C 1000mg 120정 3개월분','오메가3 1200mg 90캡슐 3개','프로바이오틱스 500mg 60캡슐 1+1',
  '루테인 20mg 90정 눈건강','종합비타민 미네랄 90정','콜라겐 피쉬콜라겐 2000mg 30포',
  '밀크씨슬 130mg 120정 3개월분','닭가슴살 100g x 30팩 냉동','아몬드 1kg 구운 무염',
  '프로틴바 40g x 12개','현미 10kg 2023년산','유기농 꿀 500g 국산',
  '물티슈 80매 x 10팩 캡형','화장지 30롤 3겹','주방세제 500ml x 3개',
  '섬유유연제 2.5L 라벤더향','핸드워시 250ml 리필 3개','강아지 사료 10kg 대형견',
  '고양이 캔 참치 24개입','강아지 간식 100g x 5개','블루투스 이어폰 무선 노이즈캔슬링',
  '보조배터리 10000mAh 고속충전','아이폰 15 프로 케이스 투명','USB-C 충전케이블 1m 2개',
  'LED 전구 12W E26 주광색 4개','남성 운동화 에어쿠션 블랙 270mm','여성 원피스 플라워 프리사이즈',
  '면 양말 10족 세트 블랙','남성 슬랙스 스판 L 네이비','스텐 냄비세트 3종 IH',
  '도마 항균 대나무 대형','텀블러 보온 보냉 500ml','기저귀 팬티형 대형 60매',
  '유아 물티슈 80매 x 12팩','분유 3단계 800g','접이식 테이블 600x400mm',
  'LED 스탠드 책상 조명','극세사 이불 퀸 겨울','요가매트 6mm TPE 183cm',
  '아령 3kg 2개 세트','등산화 고어텍스 남성 275','블랙박스 전후방 FHD',
  '차량용 충전기 USB-C PD 30W','와이퍼 블레이드 600mm 2개',
];

let catOK=0,catFail=0,optFull=0,optPart=0,optBad=0;
for(const name of prods){
  const tokens=tok(name);const match=lm(tokens);
  if(!match){catFail++;console.log('❌ '+name+' → 카테고리 매칭 실패\n');continue;}
  catOK++;
  const[code,,leaf]=match.entry;const p=match.path||details[code]?.p||leaf;
  const ex=extractOpts(name,code);
  const mark=ex.conf===100?'✅':ex.conf>=50?'⚠️':'❌';
  if(ex.conf===100)optFull++;else if(ex.conf>=50)optPart++;else optBad++;
  console.log(mark+' '+name);
  console.log('  카테고리: '+p);
  if(ex.opts.length>0)console.log('  옵션: '+ex.opts.map(o=>o.name+'='+o.value+(o.unit||'')).join(' | '));
  const dd=details[code];const reqOpts=dd?.b?.filter(o=>o.r)||[];
  if(reqOpts.length>0)console.log('  필수: '+reqOpts.map(o=>o.n+(o.c1?' [택1]':'')).join(', '));
  if(ex.warns.length>0)console.log('  누락: '+ex.warns.join(', '));
  console.log('');
}
console.log('================================================');
console.log('카테고리 매칭: '+catOK+'/'+prods.length+' ('+Math.round(catOK/prods.length*100)+'%)');
console.log('  성공: '+catOK+' | 실패: '+catFail);
console.log('옵션 추출 (매칭 '+catOK+'개 중):');
console.log('  완벽(100%): '+optFull+' | 부분(50%+): '+optPart+' | 부족: '+optBad);
console.log('전체 등록가능: '+optFull+'/'+prods.length+' ('+Math.round(optFull/prods.length*100)+'%)');
