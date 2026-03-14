/**
 * build-category-db.js
 * Reads parsed Coupang category JSON (54k rows, 16k unique codes),
 * deduplicates by code (merging all option variations),
 * parses option strings, and outputs a compact JSON DB.
 * Usage: node scripts/build-category-db.js
 */
const fs = require('fs');
const path = require('path');

const INPUT = 'C:/Users/lhs06/Downloads/coupang_all_categories.json';
const OUTPUT = path.join(__dirname, '..', 'src', 'lib', 'sellerhub', 'data', 'coupang-category-db.json');

function parseBuyOption(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.replace(/\n/g, ' ').trim();
  if (!s) return null;
  const result = {};
  const takMatch = s.match(/^\(택(\d+)\)\s*/);
  if (takMatch) { result.group = parseInt(takMatch[1], 10); s = s.slice(takMatch[0].length); }
  const unitMatch = s.match(/\[기본단위:\s*([^\]]+)\]/);
  if (unitMatch) { result.unit = unitMatch[1].trim(); s = s.replace(unitMatch[0], ''); }
  const reqMatch = s.match(/\[(필수|선택필수|선택)\]/);
  result.required = reqMatch ? (reqMatch[1] === '필수' || reqMatch[1] === '선택필수') : false;
  if (reqMatch) s = s.replace(reqMatch[0], '');
  result.name = s.trim();
  return result;
}

function parseSearchOption(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.replace(/\n/g, ' ').trim();
  if (!s || s.startsWith('선택해주세요')) return null;
  const result = {};
  const unitMatch = s.match(/\[기본단위:\s*([^\]]+)\]/);
  if (unitMatch) { result.unit = unitMatch[1].trim(); s = s.replace(unitMatch[0], ''); }
  const reqMatch = s.match(/\[(필수|선택필수|선택)\]/);
  result.required = reqMatch ? (reqMatch[1] === '필수' || reqMatch[1] === '선택필수') : false;
  if (reqMatch) s = s.replace(reqMatch[0], '');
  result.name = s.trim();
  return result;
}

function tokenizePath(pathStr) {
  return [...new Set(
    pathStr.split('>').map(s => s.trim())
      .flatMap(s => s.split(/[\/]/))
      .map(s => s.trim())
      .filter(s => s.length >= 1)
  )];
}

console.log('Reading', INPUT, '...');
const raw = JSON.parse(fs.readFileSync(INPUT, 'utf-8'));
console.log('  ' + raw.length + ' rows loaded');

const map = new Map();
for (const row of raw) {
  const code = row.code;
  if (!map.has(code)) {
    map.set(code, {
      code, path: row.path, parts: row.parts,
      depth: row.depth, commission: row.commission,
      bo: new Set(row.buyOptions || []),
      so: new Set(row.searchOptions || []),
    });
  } else {
    const existing = map.get(code);
    (row.buyOptions || []).forEach(o => existing.bo.add(o));
    (row.searchOptions || []).forEach(o => existing.so.add(o));
  }
}
console.log('  ' + map.size + ' unique categories after dedup');

const categories = [];
for (const [, entry] of map) {
  categories.push({
    code: entry.code,
    path: entry.path,
    leaf: entry.parts[entry.parts.length - 1],
    depth: entry.depth,
    commission: entry.commission ? parseFloat(entry.commission) : 0,
    buyOptions: [...entry.bo].map(parseBuyOption).filter(Boolean),
    searchOptions: [...entry.so].map(parseSearchOption).filter(Boolean),
    noticeCategory: null,
    keywords: tokenizePath(entry.path),
  });
}
categories.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
const json = JSON.stringify(categories);
fs.writeFileSync(OUTPUT, json, 'utf-8');

const sizeMB = (Buffer.byteLength(json, 'utf-8') / 1048576).toFixed(2);
console.log('');
console.log('Output: ' + OUTPUT);
console.log('  Categories: ' + categories.length);
console.log('  File size: ' + sizeMB + ' MB');
console.log('');
console.log('Sample entry:');
console.log(JSON.stringify(categories[0], null, 2));
console.log('');
const dd = {};
categories.forEach(c => { dd[c.depth] = (dd[c.depth] || 0) + 1; });
console.log('Depth distribution:', JSON.stringify(dd));
const comms = categories.map(c => c.commission).filter(c => !isNaN(c));
console.log('Commission range: ' + Math.min(...comms) + '% - ' + Math.max(...comms) + '%');
const totalBuy = categories.reduce((s, c) => s + c.buyOptions.length, 0);
const totalSearch = categories.reduce((s, c) => s + c.searchOptions.length, 0);
console.log('Total buyOptions: ' + totalBuy + ' (avg ' + (totalBuy / categories.length).toFixed(1) + ' per cat)');
console.log('Total searchOptions: ' + totalSearch + ' (avg ' + (totalSearch / categories.length).toFixed(1) + ' per cat)');
console.log('Done!');