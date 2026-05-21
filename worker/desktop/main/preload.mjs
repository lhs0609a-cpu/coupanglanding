import { contextBridge, ipcRenderer } from 'electron';

const invokable = new Set([
  'state:get', 'gpu:check', 'settings:save', 'install:start',
  'auth:login', 'worker:start', 'worker:stop', 'comfy:stop', 'logs:openData',
]);
const events = new Set(['install:progress', 'worker:event', 'comfy:log']);

contextBridge.exposeInMainWorld('api', {
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
