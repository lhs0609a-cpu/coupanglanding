import { readFileSync } from 'fs';
const c = readFileSync('.env.local', 'utf8');
for (const raw of c.split(/\r?\n/)) {
  if (raw.includes('NAVER_AD_ACCESS')) {
    const eq = raw.indexOf('=');
    const v = raw.slice(eq + 1);
    console.log('raw len:', v.length);
    const codes = [];
    for (let i = 0; i < v.length; i++) codes.push(v.charCodeAt(i));
    console.log('first 6:', codes.slice(0, 6));
    console.log('last 6:', codes.slice(-6));
    console.log('contains backslash:', v.includes('\\'));
    console.log('actual last 8:', JSON.stringify(v.slice(-8)));
  }
}
