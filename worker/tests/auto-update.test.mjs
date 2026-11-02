import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

async function harness({ malformed = false, working = false } = {}) {
  let now = 1000000;
  const timers = [], intervals = [], installs = [], files = new Map(), callbacks = {};
  const payload = Buffer.from('verified installer');
  const sha = createHash('sha512').update(payload).digest('base64');
  const feed = `version: 0.6.15\npath: MegaloadDesktop-Setup-0.6.15.exe\nsha512: ${malformed ? 'bad' : sha}\n`;
  let requests = 0, quit = 0;
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({ Buffer, AbortSignal, console, process: { platform: 'win32' }, Date: Clock,
    fetch: async url => { requests++; return url.endsWith('latest.yml') ? new Response(feed) : new Response(payload); },
    setTimeout: (fn, delay) => { const job = { fn, at: now + delay, unref() {} }; timers.push(job); return job; },
    clearTimeout: job => { job.canceled = true; },
    setInterval: (fn, delay) => intervals.push({ fn, delay }),
  });
  const electron = { app: { isPackaged: true, getVersion: () => '0.6.14', on: (name, fn) => { callbacks[name] = fn; }, quit: () => { quit++; } },
    dialog: { showMessageBox: async () => ({ response: 0 }) }, Notification: class { show() {} },
    shell: { openPath: async path => { installs.push(path); return ''; } } };
  const stubs = {
    electron,
    'node:fs': { writeFileSync: (path, buf) => files.set(path, buf), appendFileSync: () => {},
      renameSync: (from, to) => { files.set(to, files.get(from)); files.delete(from); }, unlinkSync: path => files.delete(path) },
    'node:path': { join: (...parts) => parts.join('/') },
    'node:os': { tmpdir: () => '/test' },
    'node:child_process': { spawn: () => { throw Error('unexpected fallback'); } },
    'node:crypto': { createHash },
  };
  const module = new vm.SourceTextModule(readFileSync(new URL('../desktop/main/auto-update.mjs', import.meta.url), 'utf8'), { context });
  await module.link(spec => new vm.SyntheticModule(Object.keys(stubs[spec]), function () {
    for (const [key, value] of Object.entries(stubs[spec])) this.setExport(key, value);
  }, { context }));
  await module.evaluate();
  module.namespace.setupAutoUpdate({ getWindow: () => null, isBusy: () => working });
  const tick = async () => {
    timers.sort((a, b) => a.at - b.at);
    let job; do { job = timers.shift(); } while (job?.canceled);
    if (!job) return false;
    now = job.at; await job.fn();
    // launchInstaller is started from a timer without awaiting; flush its microtasks.
    await Promise.resolve(); await Promise.resolve(); return true;
  };
  return { timers, intervals, installs, files, callbacks, tick, idle: () => { working = false; }, requests: () => requests, quit: () => quit };
}

test('idle Windows installs verified update without a click and checks every five minutes', async () => {
  const h = await harness();
  for (let i = 0; i < 5; i++) await h.tick();
  assert.equal(h.installs.length, 1); assert.equal(h.quit(), 1);
  assert.equal(h.intervals[0].delay, 5 * 60000);
  assert.equal(h.files.has('/test/MegaloadDesktop-Setup-0.6.15.exe'), true);
  assert.equal(h.files.has('/test/MegaloadDesktop-Setup-0.6.15.exe.partial'), false);
});

test('active work defers installation, then idle automatically resumes it', async () => {
  const h = await harness({ working: true });
  for (let i = 0; i < 5; i++) await h.tick();
  assert.equal(h.installs.length, 0);
  h.idle();
  for (let i = 0; i < 5; i++) await h.tick();
  assert.equal(h.installs.length, 1);
});

test('missing or malformed digest never installs a file', async () => {
  const h = await harness({ malformed: true });
  await h.tick();
  assert.equal(h.requests(), 1); assert.equal(h.installs.length, 0); assert.equal(h.files.size, 0);
});
