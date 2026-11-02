import { readFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Successful text outputs survive child-process / PC restarts. A changed input
// or generation setting gets a new key instead of silently reusing old output.
export function generationCheckpoint(file, settings) {
  const key = (product) => createHash('sha256').update(JSON.stringify([settings, product])).digest('hex');
  const entries = new Map();
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      try { const row = JSON.parse(line); if (row.key && row.record) entries.set(row.key, row.record); } catch {}
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return {
    get: (product) => entries.get(key(product)),
    put(product, record) {
      const k = key(product);
      // Leading newline isolates any torn final append from a previous crash.
      appendFileSync(file, '\n' + JSON.stringify({ key: k, record }) + '\n', { flush: true });
      entries.set(k, record);
    },
  };
}
