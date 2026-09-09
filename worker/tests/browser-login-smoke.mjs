import { existsSync } from 'node:fs';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { browserCandidates } from '../desktop/main/modules/naver-ingest/browser-discovery.mjs';
import { ChromeBrowser } from '../desktop/main/modules/naver-ingest/chrome-cdp.mjs';
const root = await mkdtemp(resolve('worker/tests/browser-smoke-'));
for (const kind of ['chrome', 'edge']) {
  const candidate = browserCandidates().find((p) => p.kind === kind && existsSync(p.path));
  if (!candidate) { console.log(kind, 'not-installed'); continue; }
  const profileDir = join(root, '한글 프로필', kind);
  await mkdir(profileDir, { recursive: true });
  const browser = new ChromeBrowser({ profileDir, executablePath: candidate.path });
  try {
    await browser.launch();
    await browser.send('Storage.setCookies', { cookies: [{
      name: 'MEGALOAD_LOGIN_PROBE', value: 'local-test-only', domain: 'example.invalid',
      path: '/', secure: true, httpOnly: true, expires: Math.floor(Date.now()/1000)+600,
    }] });
    await browser.close();
    await browser.launch();
    const { cookies } = await browser.send('Storage.getCookies');
    if (!cookies.some((c) => c.name === 'MEGALOAD_LOGIN_PROBE')) throw Error('profile persistence failed: '+kind);
    const page = await browser.newPage();
    await page.bringToFront();
    await page.close();
    console.log(kind, 'launch / unicode profile / cookie persistence / foreground / close: PASS');
  } finally { await browser.close(); }
}
