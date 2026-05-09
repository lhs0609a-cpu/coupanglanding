import fs from 'fs';
const c = fs.readFileSync('.env.local', 'utf8');
for (const line of c.split('\n')) {
  if (line.includes('NAVER_AD')) {
    const eq = line.indexOf('=');
    const k = line.slice(0, eq);
    const v = line.slice(eq + 1);
    console.log(k, '| len:', v.length, '| start/end:', JSON.stringify(v.slice(0, 4)), JSON.stringify(v.slice(-4)));
  }
}
