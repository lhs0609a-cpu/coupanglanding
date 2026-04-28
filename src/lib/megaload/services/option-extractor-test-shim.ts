// 테스트 전용: option-extractor의 pure 추출 함수만 노출 (DB/AI 의존성 제거)
//
// 이 파일은 audit/test 스크립트가 빠른 검증을 위해 사용한다.
// production 코드는 option-extractor.ts의 실제 함수를 사용한다.

/* eslint-disable */

interface CompositeResult {
  volume?: { value: number; unit: string };
  weight?: { value: number; unit: string };
  count?: number;
  perCount?: number;
}

export function extractComposite(name: string): CompositeResult {
  const result: CompositeResult = {};
  const DOSE_UNIT_AFTER_COUNT = /^(?:포(?!기|인)|정|캡슐|알|타블렛|소프트젤)/;

  const vm = name.match(/(\d+(?:\.\d+)?)\s*(ml|mL|ML|㎖)\s*[xX×]\s*(\d+)/i);
  if (vm) {
    result.volume = { value: parseFloat(vm[1]), unit: 'ml' };
    const afterCount = name.slice(vm.index! + vm[0].length).trimStart();
    if (!DOSE_UNIT_AFTER_COUNT.test(afterCount)) {
      result.count = parseInt(vm[3], 10);
    }
  }

  const vmL = name.match(/(?<![a-zA-Z])(\d+(?:\.\d+)?)\s*(L|리터|ℓ)\s*[xX×]\s*(\d+)/);
  if (vmL && !result.volume) {
    let val = parseFloat(vmL[1]);
    if (!(vmL[2] === 'L' && (val < 0.1 || val > 20))) {
      val *= 1000;
      result.volume = { value: val, unit: 'ml' };
      const afterCount = name.slice(vmL.index! + vmL[0].length).trimStart();
      if (!DOSE_UNIT_AFTER_COUNT.test(afterCount)) {
        result.count = parseInt(vmL[3], 10);
      }
    }
  }

  const wm = name.match(/(\d+(?:\.\d+)?)\s*(g|kg|KG|㎏)\s*[xX×]\s*(\d+)/i);
  if (wm) {
    let wVal = parseFloat(wm[1]);
    if (/kg/i.test(wm[2])) wVal *= 1000;
    result.weight = { value: wVal, unit: 'g' };
    const afterCount = name.slice(wm.index! + wm[0].length).trimStart();
    if (!DOSE_UNIT_AFTER_COUNT.test(afterCount)) {
      result.count = parseInt(wm[3], 10);
    }
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

interface CountResult { value: number; found: boolean; }

export function extractCountRaw(name: string, composite: CompositeResult, excludeSachet = false): CountResult {
  if (composite.count) return { value: composite.count, found: true };
  const unitPattern = excludeSachet
    ? /(\d+)\s*(개(?!입|월)|팩|세트|박스|봉|병|통|족|켤레|롤|포대|캔|호|갑|자루|종|묶음|입(?!체)|EA|ea|P|ct|pcs|pc)(?!\s*[xX×]\s*\d)/gi
    : /(\d+)\s*(개(?!입|월)|팩|세트|박스|봉|병|통|족|켤레|롤|포대|포(?!기|인|대)|캔|호|갑|자루|종|묶음|입(?!체)|EA|ea|P|ct|pcs|pc)(?!\s*[xX×]\s*\d)/gi;
  const allMatches: { value: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = unitPattern.exec(name)) !== null) {
    allMatches.push({ value: parseInt(m[1], 10) });
  }
  if (allMatches.length > 0) {
    return { value: allMatches[allMatches.length - 1].value, found: true };
  }
  const ipMatch = name.match(/(\d+)\s*입(?!\s*[xX×]\s*\d)/);
  if (ipMatch && !name.includes(ipMatch[1] + '개입')) {
    return { value: parseInt(ipMatch[1], 10), found: true };
  }
  if (!composite.perCount) {
    const sheetMatch = name.match(/(\d+)\s*(매|장)(?!\s*[xX×]\s*\d)/);
    if (sheetMatch) return { value: parseInt(sheetMatch[1], 10), found: true };
  }
  const hasVolumeOrWeight = /\d+\s*(ml|mL|ML|㎖|L|리터|ℓ|g|kg|㎏)/i.test(name);
  if (hasVolumeOrWeight) {
    const gaepipMatch = name.match(/(\d+)\s*개입/);
    if (gaepipMatch) return { value: parseInt(gaepipMatch[1], 10), found: true };
  }
  return { value: 1, found: false };
}

export function extractCount(name: string, composite: CompositeResult, excludeSachet = false): number {
  return extractCountRaw(name, composite, excludeSachet).value;
}

export function extractVolumeMl(name: string, composite: CompositeResult): number | null {
  if (composite.volume) return composite.volume.value;
  const literRe = /(\d+(?:\.\d+)?)\s*(리터|ℓ)(?!\s*[xX×]\s*\d)/gi;
  const literMatches: number[] = [];
  let lm: RegExpExecArray | null;
  while ((lm = literRe.exec(name)) !== null) literMatches.push(parseFloat(lm[1]) * 1000);
  if (literMatches.length > 0) return literMatches[literMatches.length - 1];

  const lRe = /(\d+(?:\.\d+)?)\s*L(?!\s*[xX×a-zA-Z])/g;
  const lMatches: number[] = [];
  let lm2: RegExpExecArray | null;
  while ((lm2 = lRe.exec(name)) !== null) {
    const val = parseFloat(lm2[1]);
    if (val >= 0.1 && val <= 20) lMatches.push(val * 1000);
  }
  if (lMatches.length > 0) return lMatches[lMatches.length - 1];

  const mlRe = /(\d+(?:\.\d+)?)\s*(ml|mL|ML|㎖)(?!\s*[xX×]\s*\d)/gi;
  const mlMatches: number[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = mlRe.exec(name)) !== null) mlMatches.push(parseFloat(mm[1]));
  if (mlMatches.length > 0) return mlMatches[mlMatches.length - 1];
  return null;
}

export function extractWeightG(name: string, composite: CompositeResult): number | null {
  if (composite.weight) return composite.weight.value;
  const normalized = name.replace(/(\d),(\d{1,2})(?=\s*(?:kg|KG|㎏|g|그램))/g, '$1.$2');
  const kgRe = /(\d+(?:\.\d+)?)\s*(kg|KG|㎏)(?!\s*[xX×]\s*\d)/gi;
  const kgMatches: number[] = [];
  let km: RegExpExecArray | null;
  while ((km = kgRe.exec(normalized)) !== null) kgMatches.push(parseFloat(km[1]) * 1000);
  if (kgMatches.length > 0) return kgMatches[kgMatches.length - 1];

  const gRe = /(?<![mkμ])(\d+(?:\.\d+)?)\s*(g|그램)(?!\s*[xX×]\s*\d)/gi;
  const gMatches: number[] = [];
  let gm: RegExpExecArray | null;
  while ((gm = gRe.exec(normalized)) !== null) gMatches.push(parseFloat(gm[1]));
  if (gMatches.length > 0) return gMatches[gMatches.length - 1];
  return null;
}

export function extractPerCount(name: string, composite: CompositeResult): number | null {
  if (composite.perCount) return composite.perCount;
  const gaepipMatch = name.match(/(\d+)\s*개입/);
  if (gaepipMatch) {
    const stripped = name.replace(gaepipMatch[0], '');
    const hasOtherCount = /\d+\s*(개(?!입|월|년)|팩|세트|박스|봉|병|통|족|켤레|롤)/.test(stripped);
    if (hasOtherCount) return parseInt(gaepipMatch[1], 10);
    const hasVolumeOrWeight = /\d+\s*(ml|mL|ML|㎖|L|리터|ℓ|g|kg|㎏)/i.test(name);
    if (hasVolumeOrWeight) return null;
    return parseInt(gaepipMatch[1], 10);
  }
  const sheetMatch = name.match(/(\d+)\s*매(?!\s*[xX×]\s*\d)/);
  if (sheetMatch) return parseInt(sheetMatch[1], 10);
  return null;
}

export function extractTabletCount(name: string): number | null {
  const TABLET_RE = /(\d+)\s*(베지캡슐|베지캡|연질캡슐|연질캡|소프트젤|소프트캡슐|츄어블정?|츄잉정|트로키|구미정?|타블렛|정|캡슐|알|softgel(?:s)?|vcap(?:s|sule)?|tab(?:let)?(?:s)?|cap(?:s|sule)?(?![a-z])|T(?![a-zA-Z]))/gi;
  const DOSAGE_PREFIX_RE = /(?:1일|하루|매일|일일)\s*$/;
  const DOSAGE_POSTFIX_RE = /^\s*[xX×]\s*\d+\s*(?:일|회)/;
  const matches: { value: number; index: number }[] = [];
  let m: RegExpExecArray | null;
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

export function extractSachetCount(name: string): number | null {
  const SACHET_RE = /(\d+)\s*포(?!기|인|대)/g;
  const DOSAGE_PREFIX_RE = /(?:1일|하루|매일|일일)\s*$/;
  const COMPOSITE_BEFORE_RE = /[xX×]\s*$/;
  const COMPOSITE_AFTER_RE = /^\s*[xX×]/;
  const matches: { value: number; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = SACHET_RE.exec(name)) !== null) {
    const prefix = name.slice(Math.max(0, m.index - 10), m.index);
    if (DOSAGE_PREFIX_RE.test(prefix)) continue;
    if (COMPOSITE_BEFORE_RE.test(prefix)) continue;
    const postfix = name.slice(m.index + m[0].length, m.index + m[0].length + 10);
    if (COMPOSITE_AFTER_RE.test(postfix)) continue;
    matches.push({ value: parseInt(m[1], 10), index: m.index });
  }
  if (matches.length === 0) return null;
  const reasonable = matches.filter(x => x.value <= 500);
  if (reasonable.length > 0) return reasonable[reasonable.length - 1].value;
  return matches[matches.length - 1].value;
}

// ─── 단순화된 extractOptionsFromDetails (테스트용) ───────────
// production 함수와 동일한 핵심 로직, AI/OCR/마이닝 레이어 제외

export interface BuyOptionSpec { name: string; unit?: string; required?: boolean; choose1?: boolean; }
export interface ExtractedOptions {
  buyOptions: { name: string; value: string; unit?: string }[];
  warnings: string[];
}

function normalizeOptionName(name: string): string {
  let n = name.replace(/\(택\d+\)\s*/g, '').trim();
  if (n === '총 수량') n = '수량';
  return n;
}

export function extractOptionsFromDetailsSimple(productName: string, buyOpts: BuyOptionSpec[]): ExtractedOptions {
  if (!buyOpts || buyOpts.length === 0) return { buyOptions: [], warnings: [] };
  const composite = extractComposite(productName);
  const warnings: string[] = [];
  const extracted = new Map<string, { value: string; unit?: string }>();

  const hasTabletOpt = buyOpts.some(o => {
    const n = normalizeOptionName(o.name);
    return n.includes('캡슐') || n.includes('정');
  });

  let tabletFromSachet = false;

  for (const opt of buyOpts) {
    const name = normalizeOptionName(opt.name);
    const unit = opt.unit;
    let value: string | null = null;

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
      const tabletCount = extractTabletCount(productName);
      if (tabletCount !== null) {
        value = String(tabletCount);
      } else {
        const sachetCount = extractSachetCount(productName);
        if (sachetCount !== null) {
          value = String(sachetCount);
          tabletFromSachet = true;
        }
      }
    }

    if (value !== null) {
      extracted.set(opt.name, { value, unit });
    }
  }

  if (hasTabletOpt && !tabletFromSachet) {
    let tabletKey: string | null = null;
    let tabletVal = 0;
    for (const [key, entry] of extracted) {
      const n = normalizeOptionName(key);
      if (n.includes('캡슐') || n.includes('정')) {
        tabletKey = key;
        tabletVal = parseInt(entry.value, 10) || 0;
        break;
      }
    }
    let countKey: string | null = null;
    let countVal = 0;
    for (const [key, entry] of extracted) {
      if (normalizeOptionName(key) === '수량') {
        countKey = key;
        countVal = parseInt(entry.value, 10) || 0;
        break;
      }
    }
    if (tabletKey && countKey && tabletVal >= 1 && countVal > 1) {
      const totalTablets = tabletVal * countVal;
      const tabletEntry = extracted.get(tabletKey)!;
      extracted.set(tabletKey, { value: String(totalTablets), unit: tabletEntry.unit });
      extracted.set(countKey, { value: '1', unit: '개' });
    }
  }

  const choose1Opts = buyOpts.filter((o) => o.choose1);
  const result: { name: string; value: string; unit?: string }[] = [];

  if (choose1Opts.length > 0) {
    const priority = ['용량', '캡슐', '정', '중량', '수량'];
    const sorted = [...choose1Opts].sort((a, b) => {
      const rawA = priority.findIndex(p => normalizeOptionName(a.name).includes(p));
      const rawB = priority.findIndex(p => normalizeOptionName(b.name).includes(p));
      return (rawA === -1 ? 99 : rawA) - (rawB === -1 ? 99 : rawB);
    });
    for (const opt of sorted) {
      const ext = extracted.get(opt.name);
      if (ext) {
        result.push({ name: opt.name, value: ext.value, unit: ext.unit });
      }
    }
  }

  for (const opt of buyOpts) {
    if (opt.choose1) continue;
    const ext = extracted.get(opt.name);
    if (ext) {
      result.push({ name: opt.name, value: ext.value, unit: ext.unit });
    } else if (opt.required) {
      warnings.push(`필수 옵션 '${opt.name}' 추출 실패`);
    }
  }

  return { buyOptions: result, warnings };
}
