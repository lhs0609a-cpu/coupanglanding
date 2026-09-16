// Custom ESM loader hooks:
// 1. Resolve extensionless imports → .ts/.json
// 2. Auto-add "type: json" for .json imports
import { resolve as nodeResolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function resolve(specifier, context, nextResolve) {
  // Handle @/* path alias.
  //   ⚠️ 예전엔 './src/...' 로 바꿔 넘겨서 **import 한 파일 기준**으로 풀렸다.
  //      루트의 .mjs 가 부를 땐 맞았지만, src 안쪽 파일이 '@/lib/...' 를 부르면
  //      src/lib/assistant/kb/src/lib/... 처럼 경로가 겹쳐 깨졌다.
  //      프로젝트 루트 기준 절대 경로(file://)로 바꿔 넘긴다.
  if (specifier.startsWith('@/')) {
    const abs = nodeResolve(process.cwd(), 'src', specifier.slice(2));
    const asUrl = pathToFileURL(abs).href;
    if (existsSync(abs + '.ts')) return nextResolve(asUrl + '.ts', context);
    if (existsSync(abs + '.tsx')) return nextResolve(asUrl + '.tsx', context);
    if (existsSync(abs + '.json')) {
      return nextResolve(asUrl + '.json', {
        ...context,
        importAttributes: { ...context.importAttributes, type: 'json' },
      });
    }
    if (existsSync(nodeResolve(abs, 'index.ts'))) {
      return nextResolve(pathToFileURL(nodeResolve(abs, 'index.ts')).href, context);
    }
    return nextResolve(asUrl, context);
  }

  // Only handle relative imports without file extensions
  if (specifier.startsWith('.') && !specifier.match(/\.\w+$/)) {
    const parentPath = context.parentURL
      ? fileURLToPath(context.parentURL)
      : process.cwd();
    const parentDir = parentPath.endsWith('/') || parentPath.endsWith('\\')
      ? parentPath
      : nodeResolve(parentPath, '..');

    const fullPath = nodeResolve(parentDir, specifier);

    // Try .ts extension
    if (existsSync(fullPath + '.ts')) {
      return nextResolve(specifier + '.ts', context);
    }
    // Try .json extension — auto-add import attribute
    if (existsSync(fullPath + '.json')) {
      return nextResolve(specifier + '.json', {
        ...context,
        importAttributes: { ...context.importAttributes, type: 'json' },
      });
    }
    // Try /index.ts
    if (existsSync(fullPath + '/index.ts')) {
      return nextResolve(specifier + '/index.ts', context);
    }
  }

  // Auto-add type:json for explicit .json imports too
  if (specifier.endsWith('.json')) {
    if (!context.importAttributes?.type) {
      return nextResolve(specifier, {
        ...context,
        importAttributes: { ...context.importAttributes, type: 'json' },
      });
    }
  }

  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  // For .json files, ensure the type attribute is set
  if (url.endsWith('.json')) {
    return nextLoad(url, {
      ...context,
      importAttributes: { ...context.importAttributes, type: 'json' },
    });
  }
  return nextLoad(url, context);
}
