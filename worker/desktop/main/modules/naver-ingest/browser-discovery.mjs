import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { win32, posix } from 'node:path';

export function browserCandidates({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  const paths = [];
  const add = (kind, path) => { if (path) paths.push({ kind, path }); };
  add('custom', env.MEGALOAD_BROWSER_PATH);
  if (platform === 'win32') {
    const roots = [env.ProgramW6432, env.ProgramFiles || 'C:\\Program Files',
      env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', env.LOCALAPPDATA].filter(Boolean);
    for (const root of roots) add('chrome', win32.join(root, 'Google/Chrome/Application/chrome.exe'));
    for (const root of roots) add('edge', win32.join(root, 'Microsoft/Edge/Application/msedge.exe'));
  } else if (platform === 'darwin') {
    for (const root of ['/Applications', posix.join(home, 'Applications')])
      add('chrome', posix.join(root, 'Google Chrome.app/Contents/MacOS/Google Chrome'));
    for (const root of ['/Applications', posix.join(home, 'Applications')])
      add('edge', posix.join(root, 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge'));
  } else {
    for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'])
      for (const root of (env.PATH || '/usr/bin:/usr/local/bin').split(':').filter(Boolean))
        add(name.startsWith('microsoft') ? 'edge' : 'chrome', posix.join(root, name));
  }
  return paths.filter((item, i) => paths.findIndex((p) => p.path === item.path) === i);
}

export function findBrowser(options = {}) {
  return browserCandidates(options).find((item) => (options.exists || existsSync)(item.path)) || null;
}
