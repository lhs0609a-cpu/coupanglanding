import test from 'node:test';
import assert from 'node:assert/strict';
import { browserCandidates, findBrowser } from '../desktop/main/modules/naver-ingest/browser-discovery.mjs';
import { ManualLogin } from '../desktop/main/modules/naver-ingest/manual-login.mjs';
import { ChromeBrowser, ChromePage } from '../desktop/main/modules/naver-ingest/chrome-cdp.mjs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Chrome absent on Windows: discover Edge and per-user installations', () => {
  const env = { ProgramFiles: 'C:/Program Files', LOCALAPPDATA: 'C:/Users/test/AppData/Local' };
  const result = findBrowser({ platform: 'win32', env, exists: (p) => p.includes('Microsoft') });
  assert.equal(result.kind, 'edge');
  assert.ok(browserCandidates({ platform: 'win32', env }).some((p) => p.path.includes('Users')));
});
test('macOS user Applications and explicit custom browser path are discovered', () => {
  const result = findBrowser({ platform: 'darwin', env: {}, home: '/Users/test', exists: (p) => p.startsWith('/Users/test') });
  assert.equal(result.path, '/Users/test/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  assert.equal(findBrowser({ platform: 'win32', env: { MEGALOAD_BROWSER_PATH: 'D:/Browser/chrome.exe' }, exists: () => true }).kind, 'custom');
});
test('Missing browser returns an actionable absence, not a guessed executable', () => {
  assert.equal(findBrowser({ platform: 'win32', env: {}, exists: () => false }), null);
});
function fixture() {
  const calls = { created: 0, focus: 0, navigated: 0, persisted: 0 };
  let loggedIn = false, fail = false;
  const pages = [];
  function page() {
    const p = { targetId: String(pages.length), closed: false,
      browser: { alive: true, send: async () => { if (p.closed) throw Error('closed'); return {}; } },
      goto: async () => { calls.navigated++; if (fail) throw Error('network unavailable'); return 'https://nid.naver.com/nidlogin.login'; },
      evaluate: async () => 'https://nid.naver.com/nidlogin.login',
      setMediaBlocked: async () => {}, bringToFront: async () => { calls.focus++; } };
    pages.push(p); return p;
  }
  const flow = new ManualLogin({ pollMs: 5, newPage: async () => { calls.created++; return page(); },
    state: async () => ({ loggedIn }), persist: async () => { calls.persisted++; } });
  return { flow, calls, pages, page, login: () => { loggedIn = true; }, fail: (value) => { fail = value; } };
}
test('Concurrent login clicks share one page; repeated click raises the same page', async () => {
  const f = fixture();
  await Promise.all([f.flow.start(), f.flow.start()]);
  assert.equal(f.calls.created, 1);
  await f.flow.start();
  assert.equal(f.calls.focus, 2);
  const done = f.flow.active.done; f.login();
  assert.equal((await done).ok, true);
  assert.equal(f.calls.persisted, 1);
});
test('Closing login tab releases waiting state and next click opens a fresh tab', async () => {
  const f = fixture(); await f.flow.start();
  const first = f.flow.active.done; f.pages[0].closed = true;
  assert.equal((await first).reason, 'window-closed');
  assert.equal(f.flow.waiting, false);
  await f.flow.start(); assert.equal(f.calls.created, 2);
  const next = f.flow.active.done; f.login(); await next;
});
test('Adopting CAPTCHA or QR tab preserves the current page without another navigation', async () => {
  const f = fixture(); const p = f.page();
  await f.flow.start({ page: p });
  assert.equal(f.calls.created, 0); assert.equal(f.calls.navigated, 0);
  const done = f.flow.active.done; f.login(); assert.equal((await done).ok, true);
});
test('A closed automatic login tab is replaced when handed to manual login', async () => {
  const f = fixture(); const p = f.page(); p.closed = true;
  await f.flow.start({ page: p });
  assert.equal(f.calls.created, 1); assert.equal(f.calls.navigated, 1);
  const done = f.flow.active.done; f.login(); await done;
});
test('Manual login during automatic startup navigates an adopted blank tab', async () => {
  const f = fixture(); const p = f.page(); p.evaluate = async () => 'about:blank';
  await f.flow.start({ page: p });
  assert.equal(f.calls.navigated, 1);
  const done = f.flow.active.done; f.login(); await done;
});
test('Failed browser navigation returns an error and next click can recover', async () => {
  const f = fixture(); f.fail(true);
  assert.equal((await f.flow.start()).reason, 'open-failed');
  assert.equal(f.flow.waiting, false); f.fail(false);
  await f.flow.start(); const done = f.flow.active.done; f.login(); await done;
});
test('Human timeout keeps page and permits another login attempt', async () => {
  const f = fixture(); await f.flow.start({ waitMs: 12 });
  assert.equal((await f.flow.active.done).reason, 'human-timeout');
  assert.equal(f.pages[0].closed, false);
  f.login(); assert.equal((await f.flow.start()).loggedIn, true);
  assert.equal(f.calls.created, 1);
  assert.equal(f.flow.last.ok, true);
});
test('Browser executable launch error is handled without unhandled child error', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'megaload-browser-test-'));
  const browser = new ChromeBrowser({ profileDir: dir, executablePath: join(dir, 'missing-browser.exe') });
  await assert.rejects(browser.launch(), /ENOENT|EACCES|EPERM/);
  assert.equal(browser.alive, false);
});
test('Browser navigation errors are surfaced immediately', async () => {
  const p = new ChromePage({ send: async () => ({ errorText: 'net::ERR_CERT_AUTHORITY_INVALID' }) }, 'session', 'target');
  await assert.rejects(p.goto('https://nid.naver.com/nidlogin.login'), /ERR_CERT_AUTHORITY_INVALID/);
});
