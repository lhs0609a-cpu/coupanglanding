import { NextResponse } from 'next/server';
import detailsData from '@/lib/megaload/data/coupang-cat-details.json';

export const maxDuration = 30;


export const runtime = 'nodejs';
// 카테고리 데이터는 정적이라 캐싱 강력. 매 요청마다 16k 엔트리 직렬화 회피.
export const revalidate = 86400; // 24h

interface CategoryDetail {
  p?: string; // path "L1>L2>L3>L4"
}

interface CategoryNode {
  name: string;
  fullPath: string;
  code: string | null; // leaf 일 때만 존재
  children: Record<string, CategoryNode>;
}

let _cachedTree: CategoryNode | null = null;

function buildTree(): CategoryNode {
  if (_cachedTree) return _cachedTree;
  const details = detailsData as Record<string, CategoryDetail>;
  const root: CategoryNode = { name: '', fullPath: '', code: null, children: {} };

  for (const [code, detail] of Object.entries(details)) {
    const path = detail.p;
    if (!path) continue;
    const parts = path.split('>').map(p => p.trim()).filter(Boolean);
    let cursor = root;
    let cumulative = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      cumulative = cumulative ? `${cumulative}>${part}` : part;
      if (!cursor.children[part]) {
        cursor.children[part] = {
          name: part,
          fullPath: cumulative,
          code: null,
          children: {},
        };
      }
      cursor = cursor.children[part];
      // leaf 표시 — 마지막 part 인 경우 code 설정
      if (i === parts.length - 1) {
        cursor.code = code;
      }
    }
  }

  _cachedTree = root;
  return root;
}

/**
 * GET — 쿠팡 카테고리 트리 반환.
 *
 * 응답 형식:
 *   {
 *     children: { '식품': { name, fullPath, code|null, children: {...} }, ... }
 *   }
 *
 * 16k leaf → 트리 구조는 ~5k 노드. JSON 직렬화 결과 ~500KB.
 * 24h 캐싱으로 사실상 한 번만 직렬화.
 */
export async function GET() {
  try {
    const root = buildTree();
    return NextResponse.json(root, {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'tree build failed' },
      { status: 500 },
    );
  }
}
