import { contextBridge, ipcRenderer } from 'electron';

const invokable = new Set([
  'state:get', 'gpu:check', 'install:start',
  'pair:open',
  'worker:start', 'worker:stop', 'comfy:stop', 'logs:openData',
  'ads:verify', 'ads:run-once', 'ads:start', 'ads:stop', 'ads:capture-open', 'ads:capture-save',
]);
const events = new Set(['install:progress', 'worker:event', 'comfy:log', 'pair:done', 'auto:started', 'ads:event']);

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
