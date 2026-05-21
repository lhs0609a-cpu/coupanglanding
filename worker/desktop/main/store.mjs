/** userData 디렉토리의 settings.json 영속 저장소 (자격증명 포함 — 로컬 전용) */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export class Store {
  constructor(userDataDir) {
    this.path = join(userDataDir, 'settings.json');
    this.data = {};
    if (existsSync(this.path)) {
      try { this.data = JSON.parse(readFileSync(this.path, 'utf8')); } catch { this.data = {}; }
    }
  }
  get(key, fallback) { return this.data[key] ?? fallback; }
  set(key, value) { this.data[key] = value; this._flush(); }
  merge(obj) { Object.assign(this.data, obj); this._flush(); }
  _flush() {
    try { writeFileSync(this.path, JSON.stringify(this.data, null, 2)); } catch { /* ignore */ }
  }
}
