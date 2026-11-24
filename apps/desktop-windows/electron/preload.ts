import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('pdfStudioDesktop', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  close: () => ipcRenderer.invoke('window:close'),

  openPdfDialog: (multiple: boolean) => ipcRenderer.invoke('dialog:openPdf', multiple),
  openImageDialog: (multiple: boolean) => ipcRenderer.invoke('dialog:openImage', multiple),
  readFileByPath: (filePath: string) => ipcRenderer.invoke('fs:readByPath', filePath),
  savePdf: (payload: { bytes: Uint8Array; suggestedName: string; existingPath?: string }) =>
    ipcRenderer.invoke('fs:savePdf', payload),
  exportFile: (payload: { data: Uint8Array | string; suggestedName: string }) =>
    ipcRenderer.invoke('fs:exportFile', payload),
  revealInExplorer: (filePath: string) => ipcRenderer.invoke('fs:revealInExplorer', filePath),

  loadSystemFont: (family: string) => ipcRenderer.invoke('fonts:loadSystemFont', family),

  saveRecovery: (snap: unknown) => ipcRenderer.invoke('recovery:save', snap),
  removeRecovery: (tabId: string) => ipcRenderer.invoke('recovery:remove', tabId),
  listRecovery: () => ipcRenderer.invoke('recovery:list'),
  loadRecovery: (tabId: string) => ipcRenderer.invoke('recovery:load', tabId),
  clearRecovery: () => ipcRenderer.invoke('recovery:clear'),

  onExternalFile: (cb: (file: unknown) => void) => {
    const handler = (_ev: unknown, file: unknown) => cb(file);
    ipcRenderer.on('desktop:external-file', handler);
    return () => ipcRenderer.removeListener('desktop:external-file', handler);
  },
});
