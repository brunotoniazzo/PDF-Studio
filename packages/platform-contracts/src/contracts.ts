import type {
  MetricFontFamily,
  PdfSignatureInfo,
  RecentDocumentEntry,
  RecoverableSessionEntry,
} from './domain';

export interface OpenedFileResult {
  name: string;
  path?: string;
  bytes: Uint8Array;
  sizeBytes: number;
  handleId?: string;
}

export interface SaveFileResult {
  saved: boolean;
  path?: string;
  name?: string;
  handleId?: string;
}

export interface IFileSystem {
  openPdfDialog(multiple?: boolean): Promise<OpenedFileResult[]>;
  openImageDialog(multiple?: boolean): Promise<OpenedFileResult[]>;
  readFileByPath?(filePath: string): Promise<OpenedFileResult | null>;
  savePdf(
    bytes: Uint8Array,
    options: { suggestedName: string; existingPath?: string; handleId?: string }
  ): Promise<SaveFileResult>;
  savePdfAs(bytes: Uint8Array, suggestedName: string): Promise<SaveFileResult>;
  exportBlobFile(
    bytes: Uint8Array | string,
    suggestedName: string,
    mimeType: string
  ): Promise<boolean>;
  revealInExplorer?(filePath: string): Promise<void>;
  getRecentDocuments(): Promise<RecentDocumentEntry[]>;
  saveRecentDocuments(entries: RecentDocumentEntry[]): Promise<void>;
}

export interface RecoverySnapshot {
  tabId: string;
  fileName: string;
  savedAt: string;
  pageCount: number;
  bytes: Uint8Array;
}

export interface IRecoveryStore {
  saveSnapshot(snapshot: RecoverySnapshot): Promise<void>;
  removeSnapshot(tabId: string): Promise<void>;
  listRecoverableSessions(): Promise<RecoverableSessionEntry[]>;
  loadSnapshot(tabId: string): Promise<RecoverySnapshot | null>;
  clearAllSnapshots(): Promise<void>;
}

export interface IPrinter {
  printPdf(bytes: Uint8Array, documentTitle: string): Promise<void>;
}

export interface SystemFontDescriptor {
  name: string;
  family: MetricFontFamily;
  path?: string;
}

export interface IFontRepository {
  listAvailableFonts(): Promise<SystemFontDescriptor[]>;
  loadFallbackFontBytes(
    family: MetricFontFamily,
    options?: { bold?: boolean; italic?: boolean }
  ): Promise<Uint8Array | null>;
}

export interface SavedVisualSignature {
  id: string;
  label: string;
  dataUrl: string;
  createdAt: string;
}

export interface ICertificateStore {
  listSavedVisualSignatures(): Promise<SavedVisualSignature[]>;
  saveVisualSignature(sig: SavedVisualSignature): Promise<void>;
  deleteVisualSignature(id: string): Promise<void>;
  inspectDocumentSignatures(bytes: Uint8Array): Promise<PdfSignatureInfo[]>;
}

export interface HeavyJobProgress {
  progress: number;
  detail: string;
}

export interface IHeavyJobRunner {
  readonly maxConcurrency: number;
  hasNativeSidecar(tool: 'qpdf' | 'tesseract'): Promise<boolean>;
}

export interface IWindowControls {
  readonly isDesktop: boolean;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<boolean>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  onOpenExternalFile?(callback: (file: OpenedFileResult) => void): () => void;
  onMaximizedChange?(callback: (isMaximized: boolean) => void): () => void;
}

export interface IPlatformAdapter {
  readonly platformType: 'desktop-windows' | 'web-pwa';
  readonly fileSystem: IFileSystem;
  readonly recoveryStore: IRecoveryStore;
  readonly printer: IPrinter;
  readonly fontRepository: IFontRepository;
  readonly certificateStore: ICertificateStore;
  readonly heavyJobRunner: IHeavyJobRunner;
  readonly windowControls: IWindowControls;
}
