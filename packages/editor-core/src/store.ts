import { create } from 'zustand';
import type {
  BackgroundTaskInfo,
  EditorTool,
  LeftSidebarPanel,
  MetricFontFamily,
  PageTheme,
  PdfAnnotation,
  PdfAttachmentInfo,
  PdfBookmarkNode,
  PdfDocumentMetadata,
  PdfEditableTextBlock,
  PdfFormField,
  PdfLayerInfo,
  PdfPageGeometry,
  PdfRect,
  PdfSignatureInfo,
  RecentDocumentEntry,
  RecoverableSessionEntry,
  RichTextRun,
  RichTextStyle,
  RightInspectorFlow,
  SearchMatch,
  ViewLayoutMode,
  WorkMode,
} from '@pdf-studio/platform-contracts';
import {
  extractAcroFormFields,
  sharedPdfEngine,
} from '@pdf-studio/pdf-engine';
import type { EditorCommand } from './commands';

export interface ActiveTextBlockDraft {
  blockId: string;
  sourceBlock: PdfEditableTextBlock;
  pageIndex: number;
  text: string;
  runs: RichTextRun[];
  defaultStyle: RichTextStyle;
  selection: { start: number; end: number };
  formatRevision: number;
  rect: PdfRect;
  fontSizePt: number;
  lineHeightPt: number;
  fontFamily: MetricFontFamily;
  isBold: boolean;
  isItalic: boolean;
  alignment: 'left' | 'center' | 'right';
  colorHex: string;
  rgba: [number, number, number, number];
  opaqueBackground: boolean;
  backgroundColorHex: string;
  hasManualWidthResize?: boolean;
  hasManualHeightResize?: boolean;
}

export interface DocumentTabState {
  tabId: string;
  docId: string;
  fileName: string;
  filePath?: string;
  handleId?: string;
  bytes: Uint8Array;
  isLoading: boolean;
  requiresPassword: boolean;
  passwordError?: string;
  password?: string;
  loadError?: string;
  isDirty: boolean;
  splitView: boolean;
  metadata: PdfDocumentMetadata | null;
  geometries: PdfPageGeometry[];
  bookmarks: PdfBookmarkNode[];
  signatures: PdfSignatureInfo[];
  attachments: PdfAttachmentInfo[];
  layers: PdfLayerInfo[];
  annotationsByPage: Record<number, PdfAnnotation[]>;
  formFields: PdfFormField[];
  editableBlocksByPage: Record<number, PdfEditableTextBlock[]>;
  currentPage: number;
  zoom: number;
  viewLayout: ViewLayoutMode;
  pageTheme: PageTheme;
  selectedAnnotationId: string | null;
  activeEditingBlockId: string | null;
  activeTextBlockDraft: ActiveTextBlockDraft | null;
  selectedOrganizePages: number[];
  searchQuery: string;
  searchCaseSensitive: boolean;
  searchWholeWord: boolean;
  searchRegex: boolean;
  searchMatches: SearchMatch[];
  activeSearchMatchIndex: number;
  isSearchOpen: boolean;
  dismissedSignedBanner: boolean;
  dismissedOcrBanner: boolean;
  undoStack: EditorCommand[];
  redoStack: EditorCommand[];
}

export interface ClosedTabSnapshot {
  fileName: string;
  filePath?: string;
  bytes: Uint8Array;
}

export interface ToolStyleConfig {
  highlightColor: string;
  strokeColor: string;
  fillColor: string;
  strokeWidthPt: number;
  opacity: number;
  fontSizePt: number;
  fontFamily: MetricFontFamily;
  stampPreset: string;
}

const LAYOUT_STORAGE_KEY = 'pdf_studio_layout_prefs_v1';

interface PersistedLayoutPrefs {
  darkMode: boolean;
  leftSidebarOpen: boolean;
  leftSidebarPanel: LeftSidebarPanel;
  leftSidebarWidth: number;
  rightInspectorWidth: number;
  defaultViewLayout: ViewLayoutMode;
}

function loadLayoutPrefs(): PersistedLayoutPrefs {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (raw) {
      return {
        darkMode: false,
        leftSidebarOpen: true,
        leftSidebarPanel: 'thumbnails',
        leftSidebarWidth: 248,
        rightInspectorWidth: 292,
        defaultViewLayout: 'continuous',
        ...JSON.parse(raw),
      };
    }
  } catch {
    // ignora ambiente sem localStorage
  }
  return {
    darkMode: false,
    leftSidebarOpen: true,
    leftSidebarPanel: 'thumbnails',
    leftSidebarWidth: 248,
    rightInspectorWidth: 292,
    defaultViewLayout: 'continuous',
  };
}

function saveLayoutPrefs(partial: Partial<PersistedLayoutPrefs>): void {
  try {
    const prev = loadLayoutPrefs();
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ ...prev, ...partial }));
  } catch {
    // ignora
  }
}

export interface PdfStudioStore {
  darkMode: boolean;
  leftSidebarOpen: boolean;
  leftSidebarPanel: LeftSidebarPanel;
  leftSidebarWidth: number;
  rightInspectorOpen: boolean;
  rightInspectorFlow: RightInspectorFlow;
  rightInspectorWidth: number;

  workMode: WorkMode;
  activeTool: EditorTool;
  toolStyle: ToolStyleConfig;

  activeTabId: string; // 'home' ou tabId de um PDF
  tabs: DocumentTabState[];
  closedTabs: ClosedTabSnapshot[];
  pendingCloseTabId: string | null;

  recentDocuments: RecentDocumentEntry[];
  recoverableSessions: RecoverableSessionEntry[];
  backgroundTasks: BackgroundTaskInfo[];
  toast: { id: string; text: string; tone: 'info' | 'success' | 'warning' | 'error' } | null;

  // Ações de UI / Layout
  toggleDarkMode: () => void;
  setLeftSidebarPanel: (panel: LeftSidebarPanel) => void;
  toggleLeftSidebar: (force?: boolean) => void;
  setLeftSidebarWidth: (width: number) => void;
  openRightInspector: (flow?: RightInspectorFlow) => void;
  closeRightInspector: () => void;
  setRightInspectorWidth: (width: number) => void;

  // Modos e Ferramentas
  setWorkMode: (mode: WorkMode) => void;
  setActiveTool: (tool: EditorTool) => void;
  updateToolStyle: (patch: Partial<ToolStyleConfig>) => void;

  // Gerenciamento de Abas e Documentos
  setActiveTab: (tabId: string) => void;
  openDocumentInTab: (params: {
    fileName: string;
    bytes: Uint8Array;
    filePath?: string;
    handleId?: string;
    markDirty?: boolean;
  }) => Promise<string>;
  unlockTabWithPassword: (tabId: string, password: string) => Promise<boolean>;
  requestCloseTab: (tabId: string) => void;
  cancelPendingCloseTab: () => void;
  forceCloseTab: (tabId: string) => Promise<void>;
  closeOtherTabs: (keepTabId: string) => Promise<void>;
  closeTabsToRight: (tabId: string) => Promise<void>;
  reorderTabs: (fromIdx: number, toIdx: number) => void;
  reopenLastClosedTab: () => Promise<void>;

  // Navegação, Zoom e Estado por Aba
  updateTabState: (tabId: string, patch: Partial<DocumentTabState>) => void;
  setCurrentPage: (tabId: string, pageIndex: number) => void;
  setZoom: (tabId: string, zoom: number) => void;
  setPageTheme: (tabId: string, theme: PageTheme) => void;
  setViewLayout: (tabId: string, layout: ViewLayoutMode) => void;
  toggleSplitView: (tabId: string) => void;

  // Anotações, Blocos de Texto, Formulários e Histórico Command Pattern
  upsertAnnotationDirect: (tabId: string, annot: PdfAnnotation) => void;
  removeAnnotationDirect: (tabId: string, pageIndex: number, annotId: string) => void;
  setFormFieldsDirect: (tabId: string, fields: PdfFormField[]) => void;
  reloadTabBytesDirect: (tabId: string, bytes: Uint8Array) => Promise<void>;
  executeCommand: (tabId: string, command: EditorCommand) => Promise<void>;
  undo: (tabId: string) => Promise<void>;
  redo: (tabId: string) => Promise<void>;

  // Listas globais e notificações
  setRecentDocuments: (entries: RecentDocumentEntry[]) => void;
  setRecoverableSessions: (entries: RecoverableSessionEntry[]) => void;
  upsertBackgroundTask: (task: BackgroundTaskInfo) => void;
  removeBackgroundTask: (id: string) => void;
  showToast: (
    text: string,
    tone?: 'info' | 'success' | 'warning' | 'error'
  ) => void;
  clearToast: () => void;
}

const initialPrefs = loadLayoutPrefs();

export const usePdfStudioStore = create<PdfStudioStore>((set, get) => ({
  darkMode: initialPrefs.darkMode,
  leftSidebarOpen: initialPrefs.leftSidebarOpen,
  leftSidebarPanel: initialPrefs.leftSidebarPanel,
  leftSidebarWidth: initialPrefs.leftSidebarWidth,
  rightInspectorOpen: false,
  rightInspectorFlow: 'auto',
  rightInspectorWidth: initialPrefs.rightInspectorWidth,

  workMode: 'view',
  activeTool: 'select',
  toolStyle: {
    highlightColor: '#FACC15',
    strokeColor: '#1B2952',
    fillColor: '#DBEAFE',
    strokeWidthPt: 2,
    opacity: 1,
    fontSizePt: 12,
    fontFamily: 'sans',
    stampPreset: 'APROVADO',
  },

  activeTabId: 'home',
  tabs: [],
  closedTabs: [],
  pendingCloseTabId: null,

  recentDocuments: [],
  recoverableSessions: [],
  backgroundTasks: [],
  toast: null,

  toggleDarkMode: () => {
    const next = !get().darkMode;
    saveLayoutPrefs({ darkMode: next });
    set({ darkMode: next });
  },

  setLeftSidebarPanel: (panel) => {
    const { leftSidebarOpen, leftSidebarPanel } = get();
    if (leftSidebarOpen && leftSidebarPanel === panel) {
      saveLayoutPrefs({ leftSidebarOpen: false });
      set({ leftSidebarOpen: false });
    } else {
      saveLayoutPrefs({ leftSidebarOpen: true, leftSidebarPanel: panel });
      set({ leftSidebarOpen: true, leftSidebarPanel: panel });
    }
  },

  toggleLeftSidebar: (force) => {
    const next = force ?? !get().leftSidebarOpen;
    saveLayoutPrefs({ leftSidebarOpen: next });
    set({ leftSidebarOpen: next });
  },

  setLeftSidebarWidth: (width) => {
    const clamped = Math.max(220, Math.min(380, Math.round(width)));
    saveLayoutPrefs({ leftSidebarWidth: clamped });
    set({ leftSidebarWidth: clamped });
  },

  openRightInspector: (flow = 'auto') => {
    set({ rightInspectorOpen: true, rightInspectorFlow: flow });
  },

  closeRightInspector: () => {
    set({ rightInspectorOpen: false, rightInspectorFlow: 'auto' });
  },

  setRightInspectorWidth: (width) => {
    const clamped = Math.max(260, Math.min(340, Math.round(width)));
    saveLayoutPrefs({ rightInspectorWidth: clamped });
    set({ rightInspectorWidth: clamped });
  },

  setWorkMode: (mode) => {
    const defaultToolByMode: Record<WorkMode, EditorTool> = {
      view: 'select',
      comment: 'highlight',
      edit: 'edit-text',
      organize: 'select',
      forms: 'form-fill',
      protect: 'redact',
      convert: 'select',
    };
    const nextTool = defaultToolByMode[mode];
    const autoFlow: Record<WorkMode, RightInspectorFlow | null> = {
      view: null,
      comment: null,
      edit: 'auto',
      organize: null,
      forms: null,
      protect: 'redact',
      convert: 'compress',
    };
    const flow = autoFlow[mode];
    set({
      workMode: mode,
      activeTool: nextTool,
      ...(flow
        ? { rightInspectorOpen: true, rightInspectorFlow: flow }
        : { rightInspectorFlow: 'auto' }),
    });
  },

  setActiveTool: (tool) => {
    set((s) => ({
      activeTool: tool,
      rightInspectorOpen:
        tool === 'redact' ||
        tool === 'signature-visual' ||
        tool === 'stamp' ||
        tool === 'edit-text' ||
        tool === 'add-text'
          ? true
          : s.rightInspectorOpen,
      rightInspectorFlow:
        tool === 'redact'
          ? 'redact'
          : tool === 'signature-visual'
          ? 'signature'
          : 'auto',
    }));
  },

  updateToolStyle: (patch) => {
    set((s) => ({ toolStyle: { ...s.toolStyle, ...patch } }));
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  openDocumentInTab: async ({ fileName, bytes, filePath, handleId, markDirty }) => {
    // Se já houver aba com o mesmo caminho de disco, foca nela (Single Instance / Reuso)
    if (filePath) {
      const existing = get().tabs.find((t) => t.filePath === filePath);
      if (existing) {
        set({ activeTabId: existing.tabId });
        return existing.tabId;
      }
    }

    const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const docId = `doc-${tabId}`;
    const safeBytes = new Uint8Array(bytes);

    const newTab: DocumentTabState = {
      tabId,
      docId,
      fileName,
      filePath,
      handleId,
      bytes: safeBytes,
      isLoading: true,
      requiresPassword: false,
      isDirty: Boolean(markDirty),
      splitView: false,
      metadata: null,
      geometries: [],
      bookmarks: [],
      signatures: [],
      attachments: [],
      layers: [
        { id: 'layer-content', name: 'Conteúdo Base da Página', visible: true },
        { id: 'layer-annotations', name: 'Anotações e Revisões', visible: true },
        { id: 'layer-forms', name: 'Campos de Formulário', visible: true },
      ],
      annotationsByPage: {},
      formFields: [],
      editableBlocksByPage: {},
      currentPage: 0,
      zoom: 1,
      viewLayout: loadLayoutPrefs().defaultViewLayout,
      pageTheme: 'normal',
      selectedAnnotationId: null,
      activeEditingBlockId: null,
      activeTextBlockDraft: null,
      selectedOrganizePages: [],
      searchQuery: '',
      searchCaseSensitive: false,
      searchWholeWord: false,
      searchRegex: false,
      searchMatches: [],
      activeSearchMatchIndex: 0,
      isSearchOpen: false,
      dismissedSignedBanner: false,
      dismissedOcrBanner: false,
      undoStack: [],
      redoStack: [],
    };

    set((s) => ({
      tabs: [...s.tabs, newTab],
      activeTabId: tabId,
    }));

    try {
      const [opened, formFields] = await Promise.all([
        sharedPdfEngine.openDocument({ docId, bytes: safeBytes }),
        extractAcroFormFields(safeBytes),
      ]);

      get().updateTabState(tabId, {
        isLoading: false,
        requiresPassword: false,
        metadata: opened.metadata,
        geometries: opened.geometries,
        bookmarks: opened.bookmarks,
        signatures: opened.signatures,
        attachments: opened.attachments,
        annotationsByPage: opened.existingAnnotationsByPage,
        formFields,
      });
    } catch (err) {
      const code = (err as Error & { code?: string })?.code;
      if (code === 'PASSWORD_REQUIRED' || String(err).includes('PASSWORD_REQUIRED')) {
        get().updateTabState(tabId, {
          isLoading: false,
          requiresPassword: true,
          metadata: {
            title: fileName,
            author: '',
            subject: '',
            keywords: '',
            creator: '',
            producer: '',
            creationDate: '',
            modificationDate: '',
            pdfVersion: '1.7',
            pageCount: 0,
            fileSizeBytes: safeBytes.byteLength,
            isEncrypted: true,
            isLinearized: false,
            hasAcroForm: false,
            hasSignatures: false,
            isScannedCandidate: false,
          },
        });
      } else {
        get().updateTabState(tabId, {
          isLoading: false,
          loadError: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return tabId;
  },

  unlockTabWithPassword: async (tabId, password) => {
    const tab = get().tabs.find((t) => t.tabId === tabId);
    if (!tab) return false;

    get().updateTabState(tabId, { isLoading: true, passwordError: undefined });
    try {
      const [opened, formFields] = await Promise.all([
        sharedPdfEngine.openDocument({
          docId: tab.docId,
          bytes: tab.bytes,
          password,
        }),
        extractAcroFormFields(tab.bytes),
      ]);
      get().updateTabState(tabId, {
        isLoading: false,
        requiresPassword: false,
        password,
        passwordError: undefined,
        metadata: opened.metadata,
        geometries: opened.geometries,
        bookmarks: opened.bookmarks,
        signatures: opened.signatures,
        attachments: opened.attachments,
        annotationsByPage: opened.existingAnnotationsByPage,
        formFields,
      });
      return true;
    } catch {
      get().updateTabState(tabId, {
        isLoading: false,
        requiresPassword: true,
        passwordError: 'Senha incorreta. Verifique os caracteres e tente novamente.',
      });
      return false;
    }
  },

  requestCloseTab: (tabId) => {
    const tab = get().tabs.find((t) => t.tabId === tabId);
    if (!tab) return;
    if (tab.isDirty) {
      set({ pendingCloseTabId: tabId });
      return;
    }
    void get().forceCloseTab(tabId);
  },

  cancelPendingCloseTab: () => {
    set({ pendingCloseTabId: null });
  },

  forceCloseTab: async (tabId) => {
    const { tabs, activeTabId, closedTabs } = get();
    const idx = tabs.findIndex((t) => t.tabId === tabId);
    if (idx === -1) return;
    const closing = tabs[idx];

    const nextTabs = tabs.filter((t) => t.tabId !== tabId);
    let nextActive = activeTabId;
    if (activeTabId === tabId) {
      nextActive = nextTabs[idx]?.tabId ?? nextTabs[idx - 1]?.tabId ?? 'home';
    }

    const snapshot: ClosedTabSnapshot = {
      fileName: closing.fileName,
      filePath: closing.filePath,
      bytes: closing.bytes,
    };

    set({
      tabs: nextTabs,
      activeTabId: nextActive,
      pendingCloseTabId: null,
      closedTabs: [snapshot, ...closedTabs].slice(0, 10),
    });

    await sharedPdfEngine.closeDocument(closing.docId).catch(() => {});
  },

  closeOtherTabs: async (keepTabId) => {
    const toClose = get().tabs.filter((t) => t.tabId !== keepTabId && !t.isDirty);
    for (const t of toClose) {
      await get().forceCloseTab(t.tabId);
    }
    set({ activeTabId: keepTabId });
  },

  closeTabsToRight: async (tabId) => {
    const { tabs } = get();
    const idx = tabs.findIndex((t) => t.tabId === tabId);
    if (idx === -1) return;
    const rightTabs = tabs.slice(idx + 1).filter((t) => !t.isDirty);
    for (const t of rightTabs) {
      await get().forceCloseTab(t.tabId);
    }
  },

  reorderTabs: (fromIdx, toIdx) => {
    set((s) => {
      if (
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= s.tabs.length ||
        toIdx >= s.tabs.length ||
        fromIdx === toIdx
      ) {
        return s;
      }
      const copy = [...s.tabs];
      const [moved] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, moved);
      return { tabs: copy };
    });
  },

  reopenLastClosedTab: async () => {
    const [last, ...rest] = get().closedTabs;
    if (!last) return;
    set({ closedTabs: rest });
    await get().openDocumentInTab({
      fileName: last.fileName,
      filePath: last.filePath,
      bytes: last.bytes,
    });
  },

  updateTabState: (tabId, patch) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.tabId === tabId ? { ...t, ...patch } : t)),
    }));
  },

  setCurrentPage: (tabId, pageIndex) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.tabId !== tabId) return t;
        const max = Math.max(0, t.geometries.length - 1);
        return { ...t, currentPage: Math.max(0, Math.min(max, pageIndex)) };
      }),
    }));
  },

  setZoom: (tabId, zoom) => {
    const clamped = Math.max(0.25, Math.min(4.0, Math.round(zoom * 100) / 100));
    sharedPdfEngine.bumpRenderGeneration();
    get().updateTabState(tabId, { zoom: clamped });
  },

  setPageTheme: (tabId, pageTheme) => {
    get().updateTabState(tabId, { pageTheme });
  },

  setViewLayout: (tabId, viewLayout) => {
    saveLayoutPrefs({ defaultViewLayout: viewLayout });
    get().updateTabState(tabId, { viewLayout });
  },

  toggleSplitView: (tabId) => {
    const tab = get().tabs.find((t) => t.tabId === tabId);
    if (!tab) return;
    get().updateTabState(tabId, { splitView: !tab.splitView });
  },

  upsertAnnotationDirect: (tabId, annot) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.tabId !== tabId) return t;
        const list = t.annotationsByPage[annot.pageIndex] ?? [];
        const exists = list.some((a) => a.id === annot.id);
        const nextList = exists
          ? list.map((a) => (a.id === annot.id ? { ...annot, fromOriginalPdf: false } : a))
          : [...list, { ...annot, fromOriginalPdf: false }];
        return {
          ...t,
          isDirty: true,
          annotationsByPage: {
            ...t.annotationsByPage,
            [annot.pageIndex]: nextList,
          },
        };
      }),
    }));
  },

  removeAnnotationDirect: (tabId, pageIndex, annotId) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.tabId !== tabId) return t;
        const list = t.annotationsByPage[pageIndex] ?? [];
        return {
          ...t,
          isDirty: true,
          selectedAnnotationId:
            t.selectedAnnotationId === annotId ? null : t.selectedAnnotationId,
          annotationsByPage: {
            ...t.annotationsByPage,
            [pageIndex]: list.filter((a) => a.id !== annotId),
          },
        };
      }),
    }));
  },

  setFormFieldsDirect: (tabId, fields) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.tabId === tabId ? { ...t, isDirty: true, formFields: fields } : t
      ),
    }));
  },

  reloadTabBytesDirect: async (tabId, nextBytes) => {
    const tab = get().tabs.find((t) => t.tabId === tabId);
    if (!tab) return;
    const safeCopy = new Uint8Array(nextBytes);
    const [opened, formFields] = await Promise.all([
      sharedPdfEngine.replaceDocumentBytes({
        docId: tab.docId,
        bytes: safeCopy,
        password: tab.password,
      }),
      extractAcroFormFields(safeCopy),
    ]);

    const maxPage = Math.max(0, opened.geometries.length - 1);
    get().updateTabState(tabId, {
      bytes: safeCopy,
      isDirty: true,
      metadata: opened.metadata,
      geometries: opened.geometries,
      bookmarks: opened.bookmarks,
      signatures: opened.signatures,
      attachments: opened.attachments,
      formFields,
      editableBlocksByPage: {},
      activeEditingBlockId: null,
      activeTextBlockDraft: null,
      currentPage: Math.min(tab.currentPage, maxPage),
      selectedOrganizePages: tab.selectedOrganizePages.filter((p) => p <= maxPage),
    });
  },

  executeCommand: async (tabId, command) => {
    await command.execute();
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.tabId === tabId
          ? {
              ...t,
              isDirty: true,
              undoStack: [...t.undoStack.slice(-49), command],
              redoStack: [],
            }
          : t
      ),
    }));
  },

  undo: async (tabId) => {
    const tab = get().tabs.find((t) => t.tabId === tabId);
    if (!tab || tab.undoStack.length === 0) return;
    const cmd = tab.undoStack[tab.undoStack.length - 1];
    await cmd.undo();
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.tabId === tabId
          ? {
              ...t,
              undoStack: t.undoStack.slice(0, -1),
              redoStack: [...t.redoStack, cmd],
            }
          : t
      ),
    }));
  },

  redo: async (tabId) => {
    const tab = get().tabs.find((t) => t.tabId === tabId);
    if (!tab || tab.redoStack.length === 0) return;
    const cmd = tab.redoStack[tab.redoStack.length - 1];
    await cmd.execute();
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.tabId === tabId
          ? {
              ...t,
              undoStack: [...t.undoStack, cmd],
              redoStack: t.redoStack.slice(0, -1),
            }
          : t
      ),
    }));
  },

  setRecentDocuments: (recentDocuments) => set({ recentDocuments }),
  setRecoverableSessions: (recoverableSessions) => set({ recoverableSessions }),

  upsertBackgroundTask: (task) => {
    set((s) => {
      const exists = s.backgroundTasks.some((b) => b.id === task.id);
      return {
        backgroundTasks: exists
          ? s.backgroundTasks.map((b) => (b.id === task.id ? task : b))
          : [...s.backgroundTasks, task],
      };
    });
  },

  removeBackgroundTask: (id) => {
    set((s) => ({
      backgroundTasks: s.backgroundTasks.filter((b) => b.id !== id),
    }));
  },

  showToast: (text, tone = 'info') => {
    const id = `toast-${Date.now()}`;
    set({ toast: { id, text, tone } });
    setTimeout(() => {
      if (get().toast?.id === id) {
        set({ toast: null });
      }
    }, 3800);
  },

  clearToast: () => set({ toast: null }),
}));
