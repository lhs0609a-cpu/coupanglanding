import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface DirEntry {
  name: string;
  path: string;
  hasProducts: boolean;
}

/**
 * GET /api/megaload/products/bulk-register/browse-folders
 *
 * - path 없음 → Windows 드라이브 목록 (A-Z accessSync 스캔)
 * - path=J:\소싱 → 하위 디렉토리 목록 (파일 제외)
 */
export async function GET(req: NextRequest) {
  try {
    const requestedPath = req.nextUrl.searchParams.get('path');

    // 드라이브 목록
    if (!requestedPath) {
      const drives: DirEntry[] = [];
      for (let code = 65; code <= 90; code++) {
        const letter = String.fromCharCode(code);
        const drivePath = `${letter}:\\`;
        try {
          fs.accessSync(drivePath, fs.constants.R_OK);
          drives.push({ name: `${letter}:`, path: drivePath, hasProducts: false });
        } catch {
          // 접근 불가 드라이브 스킵
        }
      }
      return NextResponse.json({
        entries: drives,
        currentPath: null,
        parentPath: null,
      });
    }

    // 경로 정규화
    const normalizedPath = path.resolve(requestedPath);

    // 경로 존재 확인
    if (!fs.existsSync(normalizedPath)) {
      return NextResponse.json({ error: '경로를 찾을 수 없습니다.' }, { status: 404 });
    }

    const stat = fs.statSync(normalizedPath);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: '디렉토리가 아닙니다.' }, { status: 400 });
    }

    // 하위 디렉토리 목록
    const dirents = fs.readdirSync(normalizedPath, { withFileTypes: true });
    const entries: DirEntry[] = [];

    for (const dirent of dirents) {
      // 파일 제외, 숨김 폴더 제외
      if (!dirent.isDirectory()) continue;
      if (dirent.name.startsWith('.')) continue;
      // Windows 시스템 폴더 제외
      if (['$RECYCLE.BIN', 'System Volume Information', '$WinREAgent'].includes(dirent.name)) continue;

      const fullPath = path.join(normalizedPath, dirent.name);

      // product_* 하위 폴더 존재 여부 확인
      let hasProducts = false;
      try {
        const subDirents = fs.readdirSync(fullPath, { withFileTypes: true });
        hasProducts = subDirents.some(
          (d) => d.isDirectory() && d.name.startsWith('product_'),
        );
      } catch {
        // 접근 불가 폴더는 hasProducts=false
      }

      entries.push({
        name: dirent.name,
        path: fullPath,
        hasProducts,
      });

      if (entries.length >= 200) break;
    }

    // product_* 포함 폴더 우선 정렬, 그 다음 이름순
    entries.sort((a, b) => {
      if (a.hasProducts !== b.hasProducts) return a.hasProducts ? -1 : 1;
      // product_ 자체 폴더 우선
      const aIsProduct = a.name.startsWith('product_');
      const bIsProduct = b.name.startsWith('product_');
      if (aIsProduct !== bIsProduct) return aIsProduct ? -1 : 1;
      return a.name.localeCompare(b.name, 'ko');
    });

    // 상위 경로 계산
    const parsed = path.parse(normalizedPath);
    const parentPath = parsed.dir === normalizedPath ? null : parsed.dir || null;

    return NextResponse.json({
      entries,
      currentPath: normalizedPath,
      parentPath,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '폴더 탐색 실패' },
      { status: 500 },
    );
  }
}
