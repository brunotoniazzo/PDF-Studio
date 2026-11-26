import type {
  IPlatformAdapter,
  MetricFontFamily,
  OpenedFileResult,
  RecentDocumentEntry,
  RecoverableSessionEntry,
  RecoverySnapshot,
  SavedVisualSignature,
  SaveFileResult,
} from '@pdf-studio/platform-contracts';

const RECENTS_KEY = 'pdf_studio_recent_docs_v1';
const SIGNATURES_KEY = 'pdf_studio_saved_sigs_v1';
const DB_NAME = 'pdf_studio_recovery_db_v1';
const STORE_NAME = 'snapshots';

// Mapa de FileSystemFileHandle (File System Access API) em memória na sessão
const fileHandles = new Map<string, FileSystemFileHandle>();

function openRecoveryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'tabId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function pickFilesViaInput(accept: string, multiple: boolean): Promise<File[]> {
  return await new Promise<File[]>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => {
      resolve(input.files ? Array.from(input.files) : []);
    };
    input.oncancel = () => resolve([]);
    input.click();
  });
}

function triggerBrowserDownload(
  bytes: Uint8Array | string,
  suggestedName: string,
  mimeType: string
): void {
  const blob =
    typeof bytes === 'string'
      ? new Blob([bytes], { type: mimeType })
      : new Blob([new Uint8Array(bytes)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const webFontCache = new Map<string, Uint8Array | null>();

export function createBrowserPlatformAdapter(): IPlatformAdapter {
  return {
    platformType: 'web-pwa',

    fileSystem: {
      async openPdfDialog(multiple = true): Promise<OpenedFileResult[]> {
        const win = window as Window & {
          showOpenFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle[]>;
        };
        if (typeof win.showOpenFilePicker === 'function') {
          try {
            const handles = await win.showOpenFilePicker({
              multiple,
              types: [
                {
                  description: 'Documentos PDF',
                  accept: { 'application/pdf': ['.pdf'] },
                },
              ],
            });
            const results: OpenedFileResult[] = [];
            for (const h of handles) {
              const file = await h.getFile();
              const handleId = `fsa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              fileHandles.set(handleId, h);
              results.push({
                name: file.name,
                bytes: new Uint8Array(await file.arrayBuffer()),
                sizeBytes: file.size,
                handleId,
              });
            }
            return results;
          } catch (err) {
            if ((err as Error)?.name === 'AbortError') return [];
          }
        }

        const files = await pickFilesViaInput('application/pdf,.pdf', multiple);
        return await Promise.all(
          files.map(async (f) => ({
            name: f.name,
            bytes: new Uint8Array(await f.arrayBuffer()),
            sizeBytes: f.size,
          }))
        );
      },

      async openImageDialog(multiple = true): Promise<OpenedFileResult[]> {
        const files = await pickFilesViaInput('image/png,image/jpeg,image/webp', multiple);
        return await Promise.all(
          files.map(async (f) => ({
            name: f.name,
            bytes: new Uint8Array(await f.arrayBuffer()),
            sizeBytes: f.size,
          }))
        );
      },

      async savePdf(bytes, options): Promise<SaveFileResult> {
        if (options.handleId && fileHandles.has(options.handleId)) {
          try {
            const handle = fileHandles.get(options.handleId)!;
            const writable = await handle.createWritable();
            await writable.write(new Uint8Array(bytes));
            await writable.close();
            return {
              saved: true,
              name: handle.name,
              handleId: options.handleId,
            };
          } catch {
            // fallback para download direto
          }
        }
        return await this.savePdfAs(bytes, options.suggestedName);
      },

      async savePdfAs(bytes, suggestedName): Promise<SaveFileResult> {
        const win = window as Window & {
          showSaveFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle>;
        };
        if (typeof win.showSaveFilePicker === 'function') {
          try {
            const handle = await win.showSaveFilePicker({
              suggestedName,
              types: [
                {
                  description: 'Documento PDF',
                  accept: { 'application/pdf': ['.pdf'] },
                },
              ],
            });
            const writable = await handle.createWritable();
            await writable.write(new Uint8Array(bytes));
            await writable.close();
            const handleId = `fsa-${Date.now()}`;
            fileHandles.set(handleId, handle);
            return { saved: true, name: handle.name, handleId };
          } catch (err) {
            if ((err as Error)?.name === 'AbortError') return { saved: false };
          }
        }

        triggerBrowserDownload(bytes, suggestedName, 'application/pdf');
        return { saved: true, name: suggestedName };
      },

      async exportBlobFile(bytes, suggestedName, mimeType): Promise<boolean> {
        triggerBrowserDownload(bytes, suggestedName, mimeType);
        return true;
      },

      async getRecentDocuments(): Promise<RecentDocumentEntry[]> {
        try {
          const raw = localStorage.getItem(RECENTS_KEY);
          return raw ? JSON.parse(raw) : [];
        } catch {
          return [];
        }
      },

      async saveRecentDocuments(entries: RecentDocumentEntry[]): Promise<void> {
        try {
          localStorage.setItem(RECENTS_KEY, JSON.stringify(entries));
        } catch {
          // ignora
        }
      },
    },

    recoveryStore: {
      async saveSnapshot(snapshot: RecoverySnapshot): Promise<void> {
        const db = await openRecoveryDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put(snapshot);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      },

      async removeSnapshot(tabId: string): Promise<void> {
        const db = await openRecoveryDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).delete(tabId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      },

      async listRecoverableSessions(): Promise<RecoverableSessionEntry[]> {
        try {
          const db = await openRecoveryDb();
          return await new Promise<RecoverableSessionEntry[]>((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).getAll();
            req.onsuccess = () => {
              const items = (req.result as RecoverySnapshot[]) ?? [];
              resolve(
                items.map((s) => ({
                  tabId: s.tabId,
                  fileName: s.fileName,
                  savedAt: s.savedAt,
                  pageCount: s.pageCount,
                  sizeBytes: s.bytes.byteLength,
                }))
              );
            };
            req.onerror = () => resolve([]);
          });
        } catch {
          return [];
        }
      },

      async loadSnapshot(tabId: string): Promise<RecoverySnapshot | null> {
        const db = await openRecoveryDb();
        return await new Promise<RecoverySnapshot | null>((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const req = tx.objectStore(STORE_NAME).get(tabId);
          req.onsuccess = () => resolve((req.result as RecoverySnapshot) ?? null);
          req.onerror = () => resolve(null);
        });
      },

      async clearAllSnapshots(): Promise<void> {
        const db = await openRecoveryDb();
        await new Promise<void>((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        });
      },
    },

    printer: {
      async printPdf(bytes: Uint8Array, documentTitle: string): Promise<void> {
        const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.title = documentTitle;
        iframe.src = url;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            iframe.remove();
            URL.revokeObjectURL(url);
          }, 60_000);
        };
      },
    },

    fontRepository: {
      async listAvailableFonts() {
        return [
          { name: 'Arial / Liberation Sans (Helvetica)', family: 'sans' },
          { name: 'Times New Roman / Liberation Serif', family: 'serif' },
          { name: 'Courier New / Liberation Mono', family: 'mono' },
          { name: 'Calibri / Carlito', family: 'calibri' },
        ];
      },
      async loadFallbackFontBytes(
        family: MetricFontFamily,
        options?: { bold?: boolean; italic?: boolean }
      ): Promise<Uint8Array | null> {
        const bold = Boolean(options?.bold);
        const italic = Boolean(options?.italic);
        const cacheKey = `${family}:${bold ? 'b' : 'r'}${italic ? 'i' : 'n'}`;
        if (webFontCache.has(cacheKey)) {
          return webFontCache.get(cacheKey) ?? null;
        }
        try {
          const resp = await fetch(
            `/__pdf_studio_font?family=${encodeURIComponent(family)}&bold=${bold ? '1' : '0'}&italic=${italic ? '1' : '0'}`
          );
          if (!resp.ok) {
            webFontCache.set(cacheKey, null);
            return null;
          }
          const buf = new Uint8Array(await resp.arrayBuffer());
          if (buf.byteLength < 1024) {
            webFontCache.set(cacheKey, null);
            return null;
          }
          webFontCache.set(cacheKey, buf);
          return buf;
        } catch {
          webFontCache.set(cacheKey, null);
          return null;
        }
      },
    },

    certificateStore: {
      async listSavedVisualSignatures(): Promise<SavedVisualSignature[]> {
        try {
          const raw = localStorage.getItem(SIGNATURES_KEY);
          return raw ? JSON.parse(raw) : [];
        } catch {
          return [];
        }
      },
      async saveVisualSignature(sig: SavedVisualSignature): Promise<void> {
        const prev = await this.listSavedVisualSignatures();
        localStorage.setItem(SIGNATURES_KEY, JSON.stringify([sig, ...prev].slice(0, 12)));
      },
      async deleteVisualSignature(id: string): Promise<void> {
        const prev = await this.listSavedVisualSignatures();
        localStorage.setItem(
          SIGNATURES_KEY,
          JSON.stringify(prev.filter((s) => s.id !== id))
        );
      },
      async inspectDocumentSignatures() {
        return [];
      },
    },

    heavyJobRunner: {
      maxConcurrency: Math.max(2, Math.min(8, navigator.hardwareConcurrency || 4)),
      async hasNativeSidecar() {
        return false;
      },
    },

    windowControls: {
      isDesktop: false,
      async minimize() {},
      async toggleMaximize() {
        return false;
      },
      async close() {},
      async isMaximized() {
        return false;
      },
    },
  };
}
