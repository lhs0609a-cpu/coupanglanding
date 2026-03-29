import json
import re

with open('../src/lib/megaload/services/category-matcher.ts', 'r', encoding='utf-8') as f:
    matcher_content = f.read()

direct_map_match = re.search(r'const DIRECT_CODE_MAP[^=]*=\s*{([\s\S]*?)^};', matcher_content, re.MULTILINE)
if not direct_map_match:
    print("Could not find DIRECT_CODE_MAP")
    exit(1)

direct_map_code = direct_map_match.group(1)

test_cases = {
    '바이오틴': {
        'code': '73132',
        'products': [
            '[종근당] 비오틴 5000mcg 90정 3개월분',
            '네이처메이드 바이오틴 구미 60정 2박스',
            '맥주효모 비오틴 플러스 1000mg x 60정',
        ],
    },
}

test_script = f"""const DIRECT_CODE_MAP = {{{direct_map_code}}};

const SYNONYM_MAP = {{
  '비오틴': ['비오틴', '바이오틴'],
  '바이오틴': ['바이오틴', '비오틴'],
  '맥주효모': ['맥주효모', '바이오틴', '비오틴'],
}};

const PRODUCT_TO_CATEGORY_ALIAS = {{
  '비오틴': ['바이오틴'],
  '맥주효모': ['바이오틴'],
}};

const NOISE_WORDS = new Set(['mg', 'mcg', 'iu', 'ml', 'g', 'kg', 'l', '정', '개', '병', '통', '캡슐', '포', '박스', '봉', '팩', '세트', '매', '장', '알', 'ea', 'pcs', '프리미엄', '고함량', '저분자', '먹는', '국내', '해외', '추천', '인기', '베스트', '대용량', '소용량', '순수', '천연', '식물성']);

const NOISE_PATTERNS = [/^\d+$/, /^\d+\+\d+$/, /^\d+(개월|일|주)분?$/, /^\d+(ml|g|kg|mg|l|ea)$/i, /^\d+(정|개|병|통|캡슐|포|봉|팩|매|장|알|입|갑|회|포기|줄|켤레)$/, /^\d+x\d+$/i, /^\d+%$/];

function cleanProductName(name) {{
  let cleaned = name;
  cleaned = cleaned.replace(/[\[\(【][^\]\)】]*[\]\)】]/g, ' ');
  cleaned = cleaned.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ');
  const words = cleaned.split(/\s+/).filter(Boolean);
  const seen = new Set();
  const unique = [];
  for (const w of words) {{
    const lower = w.toLowerCase();
    if (!seen.has(lower)) {{
      seen.add(lower);
      unique.push(w);
    }}
  }}
  return unique.join(' ');
}}

function tokenize(productName) {{
  const cleaned = cleanProductName(productName);
  return cleaned.split(/\s+/).map((w) => w.toLowerCase()).filter((w) => {{
    if (w.length === 0) return false;
    if (w.length === 1) return /[가-힣]/.test(w);
    if (NOISE_WORDS.has(w)) return false;
    if (NOISE_PATTERNS.some((p) => p.test(w))) return false;
    return true;
  }});
}}

function buildCompoundTokens(tokens) {{
  const compounds = [...tokens];
  for (let i = 0; i < tokens.length - 1; i++) {{
    compounds.push(tokens[i] + tokens[i + 1]);
  }}
  const expanded = [...compounds];
  for (const t of compounds) {{
    const synonyms = SYNONYM_MAP[t];
    if (synonyms) {{
      for (const syn of synonyms) {{
        if (!expanded.includes(syn)) expanded.push(syn);
      }}
    }}
  }}
  const withAliases = [...expanded];
  for (const t of expanded) {{
    const aliases = PRODUCT_TO_CATEGORY_ALIAS[t];
    if (aliases) {{
      for (const alias of aliases) {{
        if (!withAliases.includes(alias)) withAliases.push(alias);
      }}
    }}
  }}
  return withAliases;
}}

function matchDirect(productName) {{
  const tokens = tokenize(productName);
  const compoundTokens = buildCompoundTokens(tokens);
  for (const t of compoundTokens) {{
    const direct = DIRECT_CODE_MAP[t];
    if (direct) {{
      return {{ categoryCode: direct.code, categoryPath: direct.path, matchedToken: t }};
    }}
  }}
  return null;
}}

const TEST_CASES = {json.dumps(test_cases, ensure_ascii=False, indent=2)};

console.log('Testing category matching...');
let total = 0;
let passed = 0;
for (const [cat, data] of Object.entries(TEST_CASES)) {{
  console.log(`\n=== ${{cat}} (${{data.code}}) ===`);
  for (const product of data.products) {{
    total++;
    const result = matchDirect(product);
    if (result && result.categoryCode === data.code) {{
      passed++;
      console.log(`✅ ${{product}} → ${{result.categoryCode}} (via ${{result.matchedToken}})`);
    }} else {{
      console.log(`❌ ${{product}} → ${{result ? result.categoryCode : 'NO_MATCH'}}`);
    }}
  }}
}}
console.log(`\n=== SUMMARY: ${{passed}}/${{total}} passed ===`);
"""

with open('test-category-matching.cjs', 'w', encoding='utf-8') as f:
    f.write(test_script)

print("Generated test-category-matching.cjs")
