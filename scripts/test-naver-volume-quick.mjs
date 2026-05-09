import { readFileSync, existsSync } from 'fs';
import crypto from 'crypto';

if (existsSync('.env.local')) {
  const content = readFileSync('.env.local', 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const m = rawLine.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      v = v.replace(/\\[rn]+$/g, '').replace(/[\r\n\t]+$/g, '').trim();
      process.env[m[1]] = v;
    }
  }
}

const sig = (ts, m, p, s) =>
  crypto.createHmac('sha256', s).update(`${ts}.${m}.${p}`).digest('base64');

const ts = Date.now();
const path = '/keywordstool';
const params = new URLSearchParams({ hintKeywords: '비타민', showDetail: '1' });
const res = await fetch(`https://api.searchad.naver.com${path}?${params}`, {
  headers: {
    'X-API-KEY': process.env.NAVER_AD_ACCESS_KEY,
    'X-CUSTOMER': process.env.NAVER_AD_CUSTOMER_ID,
    'X-Timestamp': String(ts),
    'X-Signature': sig(ts, 'GET', path, process.env.NAVER_AD_SECRET_KEY),
  },
});
console.log('status:', res.status);
const data = await res.json();
console.log('keywordList length:', (data.keywordList || []).length);
console.log('sample top 5:', JSON.stringify((data.keywordList || []).slice(0, 5), null, 2));
