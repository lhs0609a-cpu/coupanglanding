// Custom ESM loader hooks:
// 1. Resolve extensionless imports → .ts/.json
// 2. Auto-add "type: json" for .json imports
import { resolve as nodeResolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function resolve(specifier, context, nextResolve) {
  // Handle @/* path alias
  if (specifier.startsWith('@/')) {
    const mapped = specifier.replace('@/', './src/');
    return resolve(mapped, context, nextResolve);
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
