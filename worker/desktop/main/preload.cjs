// CommonJS preload — 렌더러 스크립트보다 "동기적으로 먼저" 실행돼 window.api 를 확실히 노출한다.
// (ESM(.mjs) preload 는 비동기 로드라 shell.js 가 window.api 없는 채로 먼저 실행→탭/연결 멈춤 버그가 있었음)
const { contextBridge, ipcRenderer } = require('electron');

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
