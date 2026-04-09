/**
 * 전체 카테고리 옵션 추출 검증 스크립트 v2
 * 16,259개 카테고리 × 20개 임의 상품명 → 옵션 추출 → 쿠팡 등록 가능성 검증
 *
 * 검증 기준:
 * 1. choose1 그룹: 반드시 1개 추출 (상품명에 스펙 삽입 → 추출 확인)
 * 2. 숫자 필수 옵션: 상품명에 스펙이 있으면 반드시 추출
 * 3. 쿠팡 API 호환: 단위형 옵션은 숫자만, 텍스트형은 비어있지 않을 것
 * 4. 폴백 허용: getRequiredFallback이 처리하는 옵션은 "1" 폴백 OK
 */
import { readFileSync } from 'fs';

// ═══════════════════════════════════════════════════════════════
// 추출 함수 복제 (option-extractor.ts)
// ═══════════════════════════════════════════════════════════════

function extractComposite(name) {
  const result = {};
  const volumeCountMatch = name.match(/(\d+(?:\.\d+)?)\s*(ml|mL|ML|㎖)\s*[xX×]\s*(\d+)\s*(개|입|팩|봉|병|통|EA|ea)?/i);
  if (volumeCountMatch) {
    result.volume = { value: parseFloat(volumeCountMatch[1]), unit: 'ml' };
    result.count = parseInt(volumeCountMatch[3], 10);
  }
  const weightCountMatch = name.match(/(\d+(?:\.\d+)?)\s*(g|kg|KG|㎏)\s*[xX×]\s*(\d+)\s*(개|입|팩|봉|병|통|EA|ea)?/i);
  if (weightCountMatch) {
    let wVal = parseFloat(weightCountMatch[1]);
    if (/kg/i.test(weightCountMatch[2])) wVal *= 1000;
    result.weight = { value: wVal, unit: 'g' };
    result.count = parseInt(weightCountMatch[3], 10);
  }
  const sheetPackMatch = name.match(/(\d+)\s*(매|장|매입)\s*[xX×]\s*(\d+)\s*(팩|개|입|봉|통)/i);
  if (sheetPackMatch) {
    result.perCount = parseInt(sheetPackMatch[1], 10);
    result.count = parseInt(sheetPackMatch[3], 10);
  }
  const plusMatch = name.match(/(\d+)\s*\+\s*(\d+)(?!\s*(?:ml|g|kg|mg|l|정|캡슐))/i);
  if (plusMatch && !result.count) {
    result.count = parseInt(plusMatch[1], 10) + parseInt(plusMatch[2], 10);
  }
  return result;
}

function extractCount(name, composite, excludeSachet = false) {
  if (composite.count) return composite.count;
  const unitPattern = excludeSachet
    ? /(\d+)\s*(개(?!입|월)|팩|세트|박스|봉|병|통|족|켤레|롤|EA|ea|P)(?!\s*[xX×])/gi
    : /(\d+)\s*(개(?!입|월)|팩|세트|박스|봉|병|통|족|켤레|롤|포(?!기)|EA|ea|P)(?!\s*[xX×])/gi;
  const allMatches = [];
  let m;
  while ((m = unitPattern.exec(name)) !== null) {
    allMatches.push({ value: parseInt(m[1], 10) });
  }
  if (allMatches.length > 0) return allMatches[allMatches.length - 1].value;
  if (!composite.perCount) {
    const sheetMatch = name.match(/(\d+)\s*(매|장)(?!\s*[xX×])/);
    if (sheetMatch) return parseInt(sheetMatch[1], 10);
  }
  return 1;
}

function extractVolumeMl(name, composite) {
  if (composite.volume) return composite.volume.value;
  const literMatch = name.match(/(\d+(?:\.\d+)?)\s*(리터|ℓ)(?!\s*[xX×])/i);
  if (literMatch) return parseFloat(literMatch[1]) * 1000;
  const lMatch = name.match(/(\d+(?:\.\d+)?)\s*L(?!\s*[xX×a-zA-Z])/);
  if (lMatch) { const val = parseFloat(lMatch[1]); if (val >= 0.1 && val <= 20) return val * 1000; }
  const mlMatch = name.match(/(\d+(?:\.\d+)?)\s*(ml|mL|ML|㎖)(?!\s*[xX×])/i);
  if (mlMatch) return parseFloat(mlMatch[1]);
  return null;
}

function extractWeightG(name, composite) {
  if (composite.weight) return composite.weight.value;
  const kgMatch = name.match(/(\d+(?:\.\d+)?)\s*(kg|KG|㎏)(?!\s*[xX×])/i);
  if (kgMatch) return parseFloat(kgMatch[1]) * 1000;
  const gMatch = name.match(/(?<![mkμ])(\d+(?:\.\d+)?)\s*(g|그램)(?!\s*[xX×])/i);
  if (gMatch) return parseFloat(gMatch[1]);
  return null;
}

function extractTabletCount(name) {
  const TABLET_RE = /(\d+)\s*(정|캡슐|알|타블렛|소프트젤)/g;
  const DOSAGE_PREFIX_RE = /(?:1일|하루|매일|일일)\s*$/;
  const DOSAGE_POSTFIX_RE = /^\s*[xX×]\s*\d+\s*(?:일|회)/;
  const matches = [];
  let m;
  while ((m = TABLET_RE.exec(name)) !== null) {
    const prefix = name.slice(Math.max(0, m.index - 10), m.index);
    if (DOSAGE_PREFIX_RE.test(prefix)) continue;
    const postfix = name.slice(m.index + m[0].length, m.index + m[0].length + 15);
    if (DOSAGE_POSTFIX_RE.test(postfix)) continue;
    const dosePrefix2 = name.slice(Math.max(0, m.index - 8), m.index);
    if (/\d+\s*회\s*$/.test(dosePrefix2)) continue;
    matches.push({ value: parseInt(m[1], 10), index: m.index });
  }
  if (matches.length === 0) return null;
  const reasonable = matches.filter(x => x.value <= 500);
  if (reasonable.length > 0) return reasonable[reasonable.length - 1].value;
  return matches[matches.length - 1].value;
}

function extractSachetCount(name) {
  const SACHET_RE = /(\d+)\s*포(?!기|인)/g;
  const DOSAGE_PREFIX_RE = /(?:1일|하루|매일|일일)\s*$/;
  const matches = [];
  let m;
  while ((m = SACHET_RE.exec(name)) !== null) {
    const prefix = name.slice(Math.max(0, m.index - 10), m.index);
    if (DOSAGE_PREFIX_RE.test(prefix)) continue;
    matches.push({ value: parseInt(m[1], 10), index: m.index });
  }
  if (matches.length === 0) return null;
  const reasonable = matches.filter(x => x.value <= 500);
  if (reasonable.length > 0) return reasonable[reasonable.length - 1].value;
  return matches[matches.length - 1].value;
}

function extractPerCount(name, composite) {
  if (composite.perCount) return composite.perCount;
  const match = name.match(/(\d+)\s*개입/);
  if (match) return parseInt(match[1], 10);
  return null;
}

const SIZE_PATTERN = /\b(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL|FREE|F|프리)\b/i;
function extractSize(name) {
  const match = name.match(SIZE_PATTERN);
  if (match) return match[1].toUpperCase();
  return null;
}

const KNOWN_COLORS = ['블랙','화이트','레드','블루','그린','옐로우','핑크','퍼플','오렌지','그레이','브라운','네이비','베이지','아이보리','민트','카키','검정','흰색','빨강','파랑','초록','노랑','분홍','보라','주황','회색','갈색','남색','골드','실버','로즈골드','크림','와인'];
function extractColor(name) {
  for (const c of KNOWN_COLORS) { if (name.includes(c)) return c; }
  return null;
}

function normalizeOptionName(name) {
  let n = name.replace(/\(택\d+\)\s*/g, '').trim();
  if (n === '총 수량') n = '수량';
  return n;
}

// getRequiredFallback 시뮬레이션 (폴백 값 반환)
function getRequiredFallback(optName, productName, unit) {
  const n = optName.toLowerCase();
  const numericFallback = unit ? '1' : '상세페이지 참조';

  if ((n.includes('색상') || n.includes('컬러') || n === '색') && !unit) return extractColor(productName) || '상세페이지 참조';
  if (n.includes('모델') || n.includes('품번')) return '자체제작';
  if ((n.includes('사이즈') || n.includes('크기')) && !unit) return extractSize(productName) || 'FREE';
  if (n.includes('구성')) return '본품';
  if (n.includes('맛') || n.includes('향')) return '상세페이지 참조';
  if (n === '용량') { const ml = extractVolumeMl(productName, {}); return ml !== null ? String(ml) : numericFallback; }
  if (n === '중량') { const g = extractWeightG(productName, {}); return g !== null ? String(g) : numericFallback; }
  if (n.includes('길이')) {
    const mMatch = productName.match(/(\d+(?:\.\d+)?)\s*m(?!m|l|g)/);
    if (mMatch) return mMatch[1];
    const cmMatch = productName.match(/(\d+(?:\.\d+)?)\s*cm/i);
    if (cmMatch) return cmMatch[1];
    const mmMatch = productName.match(/(\d+)\s*mm/i);
    if (mmMatch) return mmMatch[1];
    return numericFallback;
  }
  if (n.includes('차종')) return '공용';
  if (n.includes('인원')) return unit ? '1' : '상세페이지 참조';
  if (n.includes('가로') || n.includes('세로')) {
    const dimMatch = productName.match(/(\d+)\s*[xX×]\s*(\d+)/);
    if (dimMatch) return n.includes('가로') ? dimMatch[1] : dimMatch[2];
    return numericFallback;
  }
  if (n.includes('신발')) {
    const shoeMatch = productName.match(/(\d{3})\s*(mm)?/);
    if (shoeMatch) return shoeMatch[1];
    return '250';
  }
  if (n.includes('총') && n.includes('수량')) return String(extractCount(productName, {}));
  if (n.includes('단계')) return unit ? '1' : '상세페이지 참조';
  if (n.includes('원료') || n.includes('주원료')) return '상세페이지 참조';
  if (n.includes('ram') || n.includes('메모리') || n.includes('저장')) {
    const memMatch = productName.match(/(\d+)\s*(GB|TB|MB)/i);
    if (memMatch) return memMatch[1];
    return numericFallback;
  }
  if (n.includes('전구') && n.includes('색상')) return '상세페이지 참조';
  if ((n.includes('수산물') || n.includes('농산물')) && n.includes('중량')) {
    const wt = extractWeightG(productName, {});
    if (wt !== null) return String(wt);
    return numericFallback;
  }
  if (n === '개당 수량') return numericFallback || '1';
  if (n.includes('출고') && n.includes('일')) return '주문 확인 후 순차배송';
  if (n.includes('쌀') && n.includes('등급')) return '상등급';
  if (n.includes('계란') && n.includes('구수')) {
    const eggMatch = productName.match(/(\d+)\s*(구|개|알)/);
    if (eggMatch) return eggMatch[1];
    return '30';
  }
  if (n.includes('분쇄')) return '홀빈';
  // 매칭 안 되는 옵션: 단위형 → "1", 텍스트형 → "상세페이지 참조"
  return unit ? '1' : '상세페이지 참조';
}

// ═══════════════════════════════════════════════════════════════
// 전체 추출 시뮬레이션
// ═══════════════════════════════════════════════════════════════

function simulateFullExtraction(productName, buyOpts) {
  const composite = extractComposite(productName);
  const hasTabletOpt = buyOpts.some(o => {
    const n = normalizeOptionName(o.n);
    return n.includes('캡슐') || n.includes('정');
  });
  let tabletFromSachet = false;
  const extracted = new Map();

  // Layer 1
  for (const opt of buyOpts) {
    const name = normalizeOptionName(opt.n);
    const unit = opt.u;
    let value = null;
    if ((name === '수량' || name === '총 수량') && unit === '개') {
      value = String(extractCount(productName, composite, hasTabletOpt));
    } else if (name.includes('용량') && unit === 'ml') {
      const ml = extractVolumeMl(productName, composite);
      if (ml !== null) value = String(ml);
    } else if (name.includes('중량') && unit === 'g') {
      const g = extractWeightG(productName, composite);
      if (g !== null) value = String(g);
    } else if (name.includes('수량') && name !== '수량' && unit === '개') {
      const perCount = extractPerCount(productName, composite);
      if (perCount !== null) value = String(perCount);
    } else if (name.includes('캡슐') || name.includes('정')) {
      const tc = extractTabletCount(productName);
      if (tc !== null) { value = String(tc); }
      else { const sc = extractSachetCount(productName); if (sc !== null) { value = String(sc); tabletFromSachet = true; } }
    } else if ((name === '사이즈' || name.includes('사이즈') || name === '크기') && !opt.u) {
      // 단위형(cm, mm 등)은 텍스트 사이즈(S/M/L) 부적합
      value = extractSize(productName);
    } else if ((name === '색상' || name.includes('색상') || name === '컬러' || name.includes('컬러')) && !opt.u) {
      // 단위형(개 등)은 색상명 부적합
      value = extractColor(productName);
    }
    if (value !== null) extracted.set(opt.n, { value, unit });
  }

  // Step 1.5
  if (hasTabletOpt && !tabletFromSachet) {
    let tabletKey = null, tabletVal = 0;
    for (const [key, entry] of extracted) {
      const n = normalizeOptionName(key);
      if (n.includes('캡슐') || n.includes('정')) { tabletKey = key; tabletVal = parseInt(entry.value, 10) || 0; break; }
    }
    let countKey = null, countVal = 0;
    for (const [key, entry] of extracted) {
      if (normalizeOptionName(key) === '수량') { countKey = key; countVal = parseInt(entry.value, 10) || 0; break; }
    }
    if (tabletKey && countKey && tabletVal >= 1 && countVal > 1) {
      extracted.set(tabletKey, { value: String(tabletVal * countVal), unit: extracted.get(tabletKey).unit });
      extracted.set(countKey, { value: '1', unit: '개' });
    }
  }

  // Choose1
  const choose1Opts = buyOpts.filter(o => o.c1);
  let choose1Filled = false;
  const result = [];

  if (choose1Opts.length > 0) {
    const priority = ['용량', '캡슐', '정', '중량', '수량'];
    const sorted = [...choose1Opts].sort((a, b) => {
      const rawA = priority.findIndex(p => normalizeOptionName(a.n).includes(p));
      const rawB = priority.findIndex(p => normalizeOptionName(b.n).includes(p));
      return (rawA === -1 ? 99 : rawA) - (rawB === -1 ? 99 : rawB);
    });
    for (const opt of sorted) {
      if (choose1Filled) break;
      const ext = extracted.get(opt.n);
      if (ext) { result.push({ name: opt.n, value: ext.value, unit: ext.u }); choose1Filled = true; }
    }
  }

  // Non-choose1 + fallback
  for (const opt of buyOpts) {
    if (opt.c1) continue;
    const ext = extracted.get(opt.n);
    if (ext) {
      result.push({ name: opt.n, value: ext.value, unit: opt.u });
    } else if (opt.r) {
      const fallback = getRequiredFallback(opt.n, productName, opt.u);
      if (fallback) {
        if (opt.u) {
          const numMatch = fallback.match(/(\d+(?:\.\d+)?)/);
          const safeValue = numMatch ? numMatch[1] : '1';
          result.push({ name: opt.n, value: safeValue, unit: opt.u });
        } else {
          result.push({ name: opt.n, value: fallback, unit: opt.u });
        }
      }
    }
  }

  // Choose1 fallback
  if (choose1Opts.length > 0 && !choose1Filled) {
    const first = choose1Opts[0];
    if (first.r) {
      result.push({ name: first.n, value: first.u ? '1' : '상세페이지 참조', unit: first.u });
      choose1Filled = true;
    }
  }

  return { result, choose1Filled };
}

// ═══════════════════════════════════════════════════════════════
// 상품명 생성기 v2 — 모든 옵션 타입 커버
// ═══════════════════════════════════════════════════════════════

const ML = [5,10,15,20,30,50,80,100,120,150,200,250,300,500,1000,30,50,100,200,50];
const GV = [3,5,10,20,30,50,80,100,150,200,250,300,500,1000,2000,30,50,100,200,50];
const TB = [10,20,30,50,60,90,100,120,150,180,200,240,300,360,500,30,60,90,120,180];
const SC = [7,10,14,15,20,25,28,30,50,60,90,100,30,20,14,10,7,50,60,30];
const CT = [1,2,3,4,5,6,8,10,12,15,20,24,30,50,100,1,2,3,5,10];
const PC = [10,20,30,40,50,60,72,80,100,120,150,200,80,100,50,30,20,60,40,72];
const SZ = ['S','M','L','XL','XXL','FREE','S','M','L','XL','XXL','FREE','S','M','L','XL','FREE','M','L','XL'];
const CL = ['블랙','화이트','네이비','베이지','그레이','핑크','레드','블루','브라운','민트','골드','실버','아이보리','카키','퍼플','블랙','화이트','네이비','그레이','핑크'];
const GB = [32,64,128,256,512,1024,32,64,128,256,512,128,256,64,128,256,512,128,64,256];
const RAM = [4,8,16,32,64,4,8,16,32,8,16,4,8,16,32,8,16,8,16,32];
const CM = [10,15,20,25,30,40,50,60,80,100,120,150,10,20,30,50,80,100,120,150];

function getCatPrefix(path) {
  if (path.includes('뷰티')) return ['프리미엄 세럼','모이스처 크림','선크림 SPF50','클렌징 오일','토너 패드','립밤 수분','파운데이션','아이크림','바디로션','헤어에센스','마스크팩','필링젤','미스트 로즈','앰플 비타민','네일 컬러','BB크림','수분크림','쿠션팩트','미백에센스','클렌징폼'];
  if (path.includes('건강식품')) return ['비타민C 1000mg','오메가3 EPA DHA','프로바이오틱스','루테인 지아잔틴','밀크씨슬','콜라겐 저분자','마그네슘','아연 셀레늄','철분 엽산','종합비타민','홍삼 면역력','프로폴리스','칼슘 비타민D','글루코사민','식이섬유','코엔자임Q10','크릴오일','가르시니아','스피루리나','엽산'];
  if (path.includes('커피') || path.includes('차')) return ['원두커피 에티오피아','캡슐커피','녹차 우전','루이보스티','보리차 국산','커피믹스 모카','홍차 잉글리시','둥굴레차','옥수수차','말차 가루','디카페인','보이차','생강차 꿀','허브티','우롱차','자스민차','히비스커스','페퍼민트','콤부차','옥수수수염차'];
  if (path.includes('식품')) return ['유기농 현미','천일염','올리브오일','참기름','벌꿀 천연','견과류 믹스넛','김치 포기','두부 국산콩','계란 무항생제','쌀 신동진','라면','과자 혼합','치즈 슬라이스','소시지','양념장','간장 양조','식초 사과','고추장','된장','참치캔'];
  if (path.includes('생활용품')) return ['물티슈 캡형','화장지 3겹','세탁세제','주방세제','섬유유연제','방향제','욕실매트','쓰레기봉투','키친타올','면도기','칫솔 미세모','핸드워시','수세미','고무장갑','빨래건조대','수납박스','행거','다리미','제습제','살충제'];
  if (path.includes('패션') || path.includes('의류')) return ['티셔츠 면','청바지 슬림','후드집업','패딩점퍼','원피스','니트','슬랙스','트레이닝','코트 울','스커트','잠바 방수','조끼','셔츠','레깅스','양말 면','모자 캡','장갑 터치','스카프','벨트 가죽','지갑'];
  if (path.includes('가전') || path.includes('디지털') || path.includes('컴퓨터')) return ['블루투스 이어폰','보조배터리','USB 케이블','무선마우스','노트북','보호필름','케이스','충전기 PD','스피커','웹캠 FHD','키보드 기계식','허브 USB','삼각대','SD카드','멀티탭','모니터','SSD','외장하드','공유기','태블릿'];
  if (path.includes('완구') || path.includes('퍼즐')) return ['레고 블록','직소퍼즐','곰돌이 인형','보드게임','색연필','점토 클레이','코딩로봇','드론','피규어','스티커북','슬라임','자석블록','큐브 3x3','비눗방울','공놀이','퍼즐판','블럭세트','칼라점토','미니카','워터비즈'];
  if (path.includes('문구') || path.includes('오피스')) return ['볼펜 0.5mm','A4용지','파일 바인더','메모지','스테이플러','포스트잇','수정테이프','풀 딱풀','색연필 12색','마커펜','노트 스프링','연필 HB','네임펜','형광펜','가위','자 30cm','클립','테이프','지우개','샤프'];
  if (path.includes('스포츠') || path.includes('골프')) return ['요가매트','덤벨 네오프렌','러닝화','수영복','텐트','배드민턴','축구공','헬멧','등산스틱','골프공 3피스','낚시대','스키장갑','킥보드','농구화','권투글러브','자전거','수영고글','탁구라켓','볼링공','스케이트보드'];
  if (path.includes('가구')) return ['책상 컴퓨터','의자 사무용','수납장 3단','침대프레임','옷걸이','벽선반','쿠션','암막커튼','러그','LED조명','전신거울','접이식테이블','서랍장 5단','행거','화분','매트리스','책장','옷장','소파','식탁'];
  if (path.includes('반려') || path.includes('애완')) return ['사료 닭고기','간식 연어','장난감','모래 두부','패드 흡수','하네스','캔 참치','목줄','침대 쿠션','샴푸','이빨 껌','고양이캔','스크래쳐','급수기','배변패드','이동장','옷 방수','영양제','빗 브러쉬','모래삽'];
  return ['프리미엄 제품','고급 상품','인기 제품','베스트','신상품','기획 세트','특가','한정판','프로 시리즈','클래식','에센셜','울트라','스페셜','디럭스','플래티넘','스탠다드','엘리트','마스터','시그니처','리미티드'];
}

function generateName(buyOpts, catPath, idx) {
  const prefixes = getCatPrefix(catPath);
  const prefix = prefixes[idx % prefixes.length];
  const parts = [prefix];

  // choose1: 라운드로빈으로 각 옵션 번갈아 테스트
  const c1Opts = buyOpts.filter(o => o.c1);
  if (c1Opts.length > 0) {
    const target = c1Opts[idx % c1Opts.length];
    const n = normalizeOptionName(target.n);
    if (n.includes('용량') && target.u === 'ml') parts.push(`${ML[idx % ML.length]}ml`);
    else if (n.includes('중량') && target.u === 'g') parts.push(`${GV[idx % GV.length]}g`);
    else if (n.includes('캡슐') || n.includes('정')) parts.push(`${TB[idx % TB.length]}${idx % 2 === 0 ? '정' : '캡슐'}`);
    else if (n.includes('수량') && target.u === '개') parts.push(`${PC[idx % PC.length]}개입`);
    else if (target.u === 'cm') parts.push(`${CM[idx % CM.length]}cm`);
  }

  // non-choose1 required
  for (const opt of buyOpts) {
    if (opt.c1 || !opt.r) continue;
    const n = normalizeOptionName(opt.n);
    if ((n === '수량' || n === '총 수량') && opt.u === '개') parts.push(`${CT[idx % CT.length]}개`);
    else if (n.includes('용량') && opt.u === 'ml' && !parts.some(p => /ml/i.test(p))) parts.push(`${ML[idx % ML.length]}ml`);
    else if (n.includes('중량') && opt.u === 'g' && !parts.some(p => /\d+g\b/.test(p))) parts.push(`${GV[idx % GV.length]}g`);
    else if (n === '개당 수량' && opt.u === '개') parts.push(`${PC[idx % PC.length]}개입`);
    else if (n.includes('사이즈') || n === '크기') parts.push(SZ[idx % SZ.length]);
    else if (n.includes('색상') || n.includes('컬러') || n === '색') parts.push(CL[idx % CL.length]);
    else if (n.includes('길이') && opt.u === 'cm') parts.push(`${CM[idx % CM.length]}cm`);
    else if (n.includes('신발')) parts.push(`${230 + (idx % 10) * 5}mm`);
    else if (n.includes('저장') && opt.u) parts.push(`${GB[idx % GB.length]}GB`);
    else if ((n.includes('ram') || n.toLowerCase().includes('ram') || n.includes('메모리')) && opt.u) parts.push(`${RAM[idx % RAM.length]}GB RAM`);
    else if (n.includes('두께') && opt.u === 'cm') parts.push(`${(idx % 5 + 1) * 0.5}cm`);
    else if (n.includes('높이') && opt.u === 'cm') parts.push(`${CM[idx % CM.length]}cm`);
    else if (n.includes('가로') && opt.u === 'cm') parts.push(`${30 + idx * 5}x${20 + idx * 3}`);
    else if (n.includes('세로') && opt.u === 'cm') parts.push(`${30 + idx * 5}x${20 + idx * 3}`);
    else if (n.includes('단 수') && opt.u === '개') parts.push(`${idx % 5 + 2}단`);
    else if (n.includes('조각 수') && opt.u === '개') parts.push(`${(idx % 5 + 1) * 100}조각`);
    else if (n.includes('칸 수') && opt.u === '개') parts.push(`${(idx % 4 + 1) * 8}칸`);
    else if (n.includes('매수') && opt.u === '개') parts.push(`${(idx % 10 + 1) * 10}매`);
    else if (n.includes('출력') && opt.u === 'W') parts.push(`${(idx % 10 + 1) * 50}W`);
    else if (n.includes('계란') && n.includes('구수')) parts.push(`${(idx % 3 + 1) * 10}구`);
    else if (n.includes('평량') && opt.u === 'g') parts.push(`${(idx % 5 + 1) * 20}g`);
    else if (n.includes('화면') && opt.u) parts.push(`${(idx % 6 + 5) * 2.54}cm`);
    else if (n.includes('지름') && opt.u === 'cm') parts.push(`${CM[idx % CM.length]}cm`);
    else if (n.includes('로프트') && opt.u) parts.push(`${9 + idx % 10}도`);
    else if (n.includes('심 굵기') && opt.u === 'cm') parts.push(`0.${(idx % 5 + 3) * 1}mm`);
    else if (n.includes('서랍') && opt.u === '개') parts.push(`${idx % 5 + 2}서랍`);
    else if (n.includes('소켓') && opt.u === '개') parts.push(`${idx % 3 + 1}소켓`);
    else if (n.includes('렌즈') && opt.u === 'cm') parts.push(`${CM[idx % CM.length]}cm`);
    else if (n.includes('사용기간') && opt.u) parts.push(`${(idx % 4 + 1) * 7}일`);
    else if (n.includes('주판') && opt.u === '개') parts.push(`${idx % 5 + 5}선`);
    else if (n.includes('천공') && opt.u === '개') parts.push(`${idx % 4 + 1}공`);
    else if (n.includes('최대 매수') && opt.u === '개') parts.push(`${(idx % 5 + 1) * 10}매`);
    else if (n.includes('구성품개수') && opt.u === '개') parts.push(`${idx % 5 + 2}개입`);
    else if (n.includes('음판 수')) parts.push(`${(idx % 3 + 1) * 8}음`);
  }

  return parts.join(' ');
}

// ═══════════════════════════════════════════════════════════════
// 검증 v2 — 쿠팡 등록 가능성 기준
// ═══════════════════════════════════════════════════════════════

function verify(productName, buyOpts, result, choose1Filled) {
  const errors = [];
  const c1Opts = buyOpts.filter(o => o.c1);

  // 1. choose1: 반드시 1개 선택되어야 함
  if (c1Opts.length > 0 && !choose1Filled) {
    errors.push(`choose1 전체 실패`);
  }
  // choose1에서 값이 "1"인데 상품명에 해당 스펙이 있는 경우 = 추출 실패
  if (c1Opts.length > 0 && choose1Filled) {
    const c1Names = new Set(c1Opts.map(o => o.n));
    const filled = result.filter(r => c1Names.has(r.name));
    for (const f of filled) {
      if (f.value === '1' && f.unit) {
        // 실제 스펙이 상품명에 있는지 확인
        if (/\d{2,}\s*(ml|mL)/i.test(productName) && normalizeOptionName(f.name).includes('용량')) {
          errors.push(`choose1 ${f.name}: ml 있는데 "1" 추출`);
        }
        if (/(?<![mkμ])\d{2,}\s*g\b/i.test(productName) && normalizeOptionName(f.name).includes('중량')) {
          errors.push(`choose1 ${f.name}: g 있는데 "1" 추출`);
        }
      }
    }
  }

  // 2. 필수 옵션 모두 있는지 (choose1 제외)
  for (const opt of buyOpts) {
    if (!opt.r || opt.c1) continue;
    const found = result.find(r => r.name === opt.n);
    if (!found) {
      errors.push(`필수옵션 ${opt.n} 누락`);
    } else {
      // 숫자형: 빈값/NaN 체크
      if (opt.u) {
        const num = parseFloat(found.value);
        if (isNaN(num)) {
          errors.push(`${opt.n}: 숫자 아닌 값 "${found.value}"`);
        }
      }
      // 텍스트형: 빈값 체크
      if (!opt.u && (!found.value || found.value.trim() === '')) {
        errors.push(`${opt.n}: 빈 텍스트`);
      }
    }
  }

  // 3. 쿠팡 API 호환: 단위형에 순수 숫자만
  for (const r of result) {
    if (r.unit && r.unit !== '') {
      if (!/^\d+(\.\d+)?$/.test(r.value)) {
        errors.push(`API에러위험: ${r.name}="${r.value}" (unit:${r.unit})`);
      }
    }
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════
// 메인 실행
// ═══════════════════════════════════════════════════════════════

const data = JSON.parse(readFileSync('./src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

const N = 20;
let totalCat = 0, testedCat = 0, totalTests = 0, totalPass = 0, totalFail = 0;
const failPatterns = {};

for (const [code, cat] of Object.entries(data)) {
  totalCat++;
  const buyOpts = cat.b || [];
  if (!buyOpts.some(o => o.r)) continue;
  testedCat++;

  for (let i = 0; i < N; i++) {
    totalTests++;
    const name = generateName(buyOpts, cat.p || '', i);
    const { result, choose1Filled } = simulateFullExtraction(name, buyOpts);
    const errors = verify(name, buyOpts, result, choose1Filled);

    if (errors.length === 0) {
      totalPass++;
    } else {
      totalFail++;
      for (const e of errors) {
        const pattern = e.replace(/\d+/g, 'N').replace(/"[^"]*"/g, '"..."');
        if (!failPatterns[pattern]) failPatterns[pattern] = { count: 0, samples: [] };
        failPatterns[pattern].count++;
        if (failPatterns[pattern].samples.length < 2) {
          failPatterns[pattern].samples.push({ path: cat.p, name, result: result.map(r => `${r.name}=${r.value}${r.unit||''}`).join(', ') });
        }
      }
    }
  }
}

console.log('═══════════════════════════════════════════════════════');
console.log('  구매옵션 추출 전체 카테고리 검증 결과 v2');
console.log('═══════════════════════════════════════════════════════');
console.log(`  전체 카테고리:     ${totalCat.toLocaleString()}`);
console.log(`  테스트 카테고리:   ${testedCat.toLocaleString()}`);
console.log(`  총 테스트 수:      ${totalTests.toLocaleString()}`);
console.log(`  통과:              ${totalPass.toLocaleString()}`);
console.log(`  실패:              ${totalFail.toLocaleString()}`);
console.log(`  성공률:            ${(totalPass / totalTests * 100).toFixed(4)}%`);
console.log('═══════════════════════════════════════════════════════');

if (Object.keys(failPatterns).length > 0) {
  console.log('\n=== 실패 패턴 ===');
  Object.entries(failPatterns)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([pattern, info]) => {
      console.log(`\n[${info.count}건] ${pattern}`);
      info.samples.forEach(s => {
        console.log(`  카테고리: ${s.path}`);
        console.log(`  상품명:   ${s.name}`);
        console.log(`  추출:     ${s.result}`);
      });
    });
} else {
  console.log('\n✅ 실패 패턴 없음! 100% 통과');
}
