import { contextBridge, ipcRenderer } from 'electron';

// 셸이 등록한 모듈/채널 목록을 동기로 가져와 allowlist 구성 (모듈 추가 시 자동 반영)
const manifest = ipcRenderer.sendSync('shell:manifest') || { modules: [], invokable: [], events: [] };
const invokable = new Set(manifest.invokable);
const events = new Set(manifest.events);

contextBridge.exposeInMainWorld('api', {
  manifest,
  invoke: (channel, payload) => {
    if (!invokable.has(channel)) throw new Error(`허용되지 않은 채널: ${channel}`);
    return ipcRenderer.invoke(channel, payload);
  },
  on: (channel, cb) => {
    if (!events.has(channel)) throw new Error(`허용되지 않은 이벤트: ${channel}`);
    const listener = (_e, data) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
