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

interface DesktopBridge {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<boolean>;
  isMaximized: () => Promise<boolean>;
  close: () => Promise<void>;
  openPdfDialog: (multiple: boolean) => Promise<OpenedFileResult[]>;
  openImageDialog: (multiple: boolean) => Promise<OpenedFileResult[]>;
  readFileByPath: (filePath: string) => Promise<OpenedFileResult | null>;
  savePdf: (payload: {
    bytes: Uint8Array;
    suggestedName: string;
    existingPath?: string;
  }) => Promise<SaveFileResult>;
  exportFile: (payload: {
    data: Uint8Array | string;
    suggestedName: string;
  }) => Promise<boolean>;
  revealInExplorer: (filePath: string) => Promise<void>;
  loadSystemFont: (payload: {
    family: MetricFontFamily;
    bold?: boolean;
    italic?: boolean;
  }) => Promise<Uint8Array | null>;
  saveRecovery: (snap: RecoverySnapshot) => Promise<void>;
  removeRecovery: (tabId: string) => Promise<void>;
  listRecovery: () => Promise<RecoverableSessionEntry[]>;
  loadRecovery: (tabId: string) => Promise<RecoverySnapshot | null>;
  clearRecovery: () => Promise<void>;
  onExternalFile: (cb: (file: OpenedFileResult) => void) => () => void;
}

const RECENTS_KEY = 'pdf_studio_desktop_recents_v1';
const SIGNATURES_KEY = 'pdf_studio_desktop_sigs_v1';

function getBridge(): DesktopBridge | undefined {
  return (window as Window & { pdfStudioDesktop?: DesktopBridge }).pdfStudioDesktop;
}

export function createDesktopWindowsAdapter(): IPlatformAdapter {
  const bridge = getBridge();

  return {
    platformType: 'desktop-windows',

    fileSystem: {
      async openPdfDialog(multiple = true): Promise<OpenedFileResult[]> {
        if (bridge) return await bridge.openPdfDialog(multiple);
        return [];
      },

      async openImageDialog(multiple = true): Promise<OpenedFileResult[]> {
        if (bridge) return await bridge.openImageDialog(multiple);
        return [];
      },

      async readFileByPath(filePath: string): Promise<OpenedFileResult | null> {
        if (bridge) return await bridge.readFileByPath(filePath);
        return null;
      },

      async savePdf(bytes, options): Promise<SaveFileResult> {
        if (bridge) {
          return await bridge.savePdf({
            bytes,
            suggestedName: options.suggestedName,
            existingPath: options.existingPath,
          });
        }
        return { saved: false };
      },

      async savePdfAs(bytes, suggestedName): Promise<SaveFileResult> {
        if (bridge) {
          return await bridge.savePdf({ bytes, suggestedName });
        }
        return { saved: false };
      },

      async exportBlobFile(bytes, suggestedName): Promise<boolean> {
        if (bridge) {
          return await bridge.exportFile({ data: bytes, suggestedName });
        }
        return false;
      },

      async revealInExplorer(filePath: string): Promise<void> {
        if (bridge) await bridge.revealInExplorer(filePath);
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
        localStorage.setItem(RECENTS_KEY, JSON.stringify(entries));
      },
    },

    recoveryStore: {
      async saveSnapshot(snapshot: RecoverySnapshot): Promise<void> {
        if (bridge) await bridge.saveRecovery(snapshot);
      },
      async removeSnapshot(tabId: string): Promise<void> {
        if (bridge) await bridge.removeRecovery(tabId);
      },
      async listRecoverableSessions(): Promise<RecoverableSessionEntry[]> {
        if (bridge) return await bridge.listRecovery();
        return [];
      },
      async loadSnapshot(tabId: string): Promise<RecoverySnapshot | null> {
        if (bridge) return await bridge.loadRecovery(tabId);
        return null;
      },
      async clearAllSnapshots(): Promise<void> {
        if (bridge) await bridge.clearRecovery();
      },
    },

    printer: {
      async printPdf(bytes: Uint8Array, documentTitle: string): Promise<void> {
        const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.title = documentTitle;
        iframe.src = url;
        document.body.appendChild(iframe);
        iframe.onload = () => {
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
          { name: 'Arial / Segoe UI (Windows Nativa)', family: 'sans' },
          { name: 'Times New Roman (Windows Nativa)', family: 'serif' },
          { name: 'Courier New / Consolas (Windows Nativa)', family: 'mono' },
          { name: 'Calibri (Windows Nativa)', family: 'calibri' },
        ];
      },
      async loadFallbackFontBytes(
        family: MetricFontFamily,
        options?: { bold?: boolean; italic?: boolean }
      ): Promise<Uint8Array | null> {
        if (bridge) {
          return await bridge.loadSystemFont({
            family,
            bold: options?.bold,
            italic: options?.italic,
          });
        }
        return null;
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
      isDesktop: Boolean(bridge),
      async minimize() {
        await bridge?.minimize();
      },
      async toggleMaximize() {
        return (await bridge?.toggleMaximize()) ?? false;
      },
      async close() {
        await bridge?.close();
      },
      async isMaximized() {
        return (await bridge?.isMaximized()) ?? false;
      },
      onOpenExternalFile(cb) {
        return bridge ? bridge.onExternalFile(cb) : () => {};
      },
    },
  };
}
