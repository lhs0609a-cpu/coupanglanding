// ============================================================
// Preload — renderer ↔ main 안전 통신 bridge
// contextIsolation 환경에서 window.megaload API 노출
// ============================================================

import { contextBridge, ipcRenderer } from 'electron';

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  getStats: (): Promise<{
    totalChecked: number;
    lastCheckAt?: string;
    isLoggedIn: boolean;
    autoLaunch: boolean;
  }> => ipcRenderer.invoke('app:get-stats'),
  setAutoLaunch: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('app:set-auto-launch', enabled),
  hideWindow: (): Promise<void> => ipcRenderer.invoke('app:hide-window'),
};

contextBridge.exposeInMainWorld('megaload', api);

export type MegaloadAPI = typeof api;
