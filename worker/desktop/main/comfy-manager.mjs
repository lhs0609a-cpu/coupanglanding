/**
 * 포터블 ComfyUI 생명주기 관리: 임베디드 파이썬으로 백그라운드 실행 →
 * /system_stats 헬스 대기 → 트리 종료.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { comfyRoot } from './bootstrap.mjs';
import { checkHealth } from '../runtime/comfyui-client.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ComfyManager {
  constructor(installDir, { port = 8188, onLog = () => {} } = {}) {
    this.installDir = installDir;
    this.port = port;
    this.onLog = onLog;
    this.proc = null;
    this.url = `http://127.0.0.1:${port}`;
  }

  async isUp() {
    try { await checkHealth(this.url); return true; } catch { return false; }
  }

  /** 실행 + 헬스 대기. 이미 떠 있으면 그대로 사용. */
  async start({ timeoutMs = 180_000 } = {}) {
    if (await this.isUp()) { this.onLog('ComfyUI 이미 실행 중'); return this.url; }

    const root = comfyRoot(this.installDir);
    const python = join(root, 'python_embeded', 'python.exe');
    const args = ['-s', join('ComfyUI', 'main.py'), '--port', String(this.port), '--disable-auto-launch'];
    this.onLog(`ComfyUI 시작: ${python} ${args.join(' ')}`);
    this.proc = spawn(python, args, { cwd: root, windowsHide: true });
    this.proc.stdout?.on('data', (d) => this.onLog(String(d).trimEnd()));
    this.proc.stderr?.on('data', (d) => this.onLog(String(d).trimEnd()));
    this.proc.on('exit', (code) => { this.onLog(`ComfyUI 종료 (code=${code})`); this.proc = null; });

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.isUp()) { this.onLog('✅ ComfyUI 준비 완료'); return this.url; }
      if (!this.proc) throw new Error('ComfyUI 프로세스가 비정상 종료되었습니다 (로그 확인).');
      await sleep(2000);
    }
    throw new Error('ComfyUI 헬스 대기 타임아웃');
  }

  async stop() {
    if (!this.proc) return;
    const pid = this.proc.pid;
    this.proc = null;
    if (process.platform === 'win32') {
      // 임베디드 파이썬 자식까지 트리 강제 종료
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    } else {
      try { process.kill(pid, 'SIGTERM'); } catch { /* ignore */ }
    }
  }
}
