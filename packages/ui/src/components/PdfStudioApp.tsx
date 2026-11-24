import React, { useEffect, useRef, useState } from 'react';
import type {
  BlankPageOptions,
  IPlatformAdapter,
  SplitOptions,
} from '@pdf-studio/platform-contracts';
import { rotatePdfPages, splitPdfDocument } from '@pdf-studio/pdf-engine';
import {
  DeleteAnnotationCommand,
  usePdfStudioStore,
} from '@pdf-studio/editor-core';
import { PlatformProvider, usePlatformActions } from '../context/PlatformContext';
import { TopTitleTabsBar } from './TopTitleTabsBar';
import { ContextualToolbar } from './ContextualToolbar';
import { DocumentBanner } from './DocumentBanner';
import { LeftNavigationSidebar } from './LeftNavigationSidebar';
import { DocumentViewport, type DocumentViewportHandle } from './DocumentViewport';
import { RightPropertyInspector } from './RightPropertyInspector';
import { BottomStatusBar } from './BottomStatusBar';
import { HomeStartView } from './HomeStartView';

function PdfStudioInnerShell() {
  const {
    platform,
    openPdfFromDisk,
    openLoadedFiles,
    createNewBlankDocument,
    saveTab,
    printTab,
    applyStructuralMutation,
  } = usePlatformActions();

  const darkMode = usePdfStudioStore((s) => s.darkMode);
  const activeTabId = usePdfStudioStore((s) => s.activeTabId);
  const tabs = usePdfStudioStore((s) => s.tabs);
  const pendingCloseTabId = usePdfStudioStore((s) => s.pendingCloseTabId);
  const toast = usePdfStudioStore((s) => s.toast);

  const setActiveTab = usePdfStudioStore((s) => s.setActiveTab);
  const requestCloseTab = usePdfStudioStore((s) => s.requestCloseTab);
  const cancelPendingCloseTab = usePdfStudioStore((s) => s.cancelPendingCloseTab);
  const forceCloseTab = usePdfStudioStore((s) => s.forceCloseTab);
  const reopenLastClosedTab = usePdfStudioStore((s) => s.reopenLastClosedTab);
  const setWorkMode = usePdfStudioStore((s) => s.setWorkMode);
  const setActiveTool = usePdfStudioStore((s) => s.setActiveTool);
  const setZoom = usePdfStudioStore((s) => s.setZoom);
  const updateTabState = usePdfStudioStore((s) => s.updateTabState);
  const undo = usePdfStudioStore((s) => s.undo);
  const redo = usePdfStudioStore((s) => s.redo);
  const executeCommand = usePdfStudioStore((s) => s.executeCommand);
  const upsertAnnotationDirect = usePdfStudioStore((s) => s.upsertAnnotationDirect);
  const removeAnnotationDirect = usePdfStudioStore((s) => s.removeAnnotationDirect);
  const showToast = usePdfStudioStore((s) => s.showToast);

  const viewportRef = useRef<DocumentViewportHandle | null>(null);
  const activeTab = tabs.find((t) => t.tabId === activeTabId);
  const pendingCloseTab = tabs.find((t) => t.tabId === pendingCloseTabId);

  const [newBlankModalOpen, setNewBlankModalOpen] = useState(false);
  const [blankOptions, setBlankOptions] = useState<BlankPageOptions>({
    preset: 'A4',
    orientation: 'portrait',
    pageCount: 1,
  });

  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [splitMode, setSplitMode] = useState<SplitOptions['mode']>('range');
  const [splitRange, setSplitRange] = useState('1-2');
  const [splitEveryN, setSplitEveryN] = useState(1);

  const [propertiesModalOpen, setPropertiesModalOpen] = useState(false);
  const [goToPageModalOpen, setGoToPageModalOpen] = useState(false);
  const [goToPageInput, setGoToPageInput] = useState('1');

  // Mapa Completo de Atalhos de Teclado Windows + Adaptação Web (Alt+W, Alt+N, etc.)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      const ctrl = e.ctrlKey || e.metaKey;

      // Abrir PDF (Ctrl+O)
      if (ctrl && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void openPdfFromDisk(true);
        return;
      }

      // Novo PDF em branco (Ctrl+N no Desktop ou Alt+N na Web)
      if ((ctrl && e.key.toLowerCase() === 'n') || (e.altKey && e.key.toLowerCase() === 'n')) {
        e.preventDefault();
        setNewBlankModalOpen(true);
        return;
      }

      // Salvar / Salvar como (Ctrl+S / Ctrl+Shift+S)
      if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (activeTab) {
          void saveTab(activeTab.tabId, e.shiftKey);
        }
        return;
      }

      // Imprimir (Ctrl+P)
      if (ctrl && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        if (activeTab) void printTab(activeTab.tabId);
        return;
      }

      // Propriedades do documento (Ctrl+D)
      if (ctrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (activeTab) setPropertiesModalOpen(true);
        return;
      }

      // Fechar aba (Ctrl+W no Desktop / Alt+W na Web)
      if (
        (e.altKey && e.key.toLowerCase() === 'w') ||
        (platform.windowControls.isDesktop && ctrl && e.key.toLowerCase() === 'w')
      ) {
        e.preventDefault();
        if (activeTab) requestCloseTab(activeTab.tabId);
        return;
      }

      // Reabrir última aba fechada (Ctrl+Shift+T ou Alt+Shift+T)
      if ((ctrl || e.altKey) && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        void reopenLastClosedTab();
        return;
      }

      // Alternar abas (Ctrl+Tab / Ctrl+Shift+Tab)
      if (ctrl && e.key === 'Tab' && tabs.length > 0) {
        e.preventDefault();
        const idx = tabs.findIndex((t) => t.tabId === activeTabId);
        const dir = e.shiftKey ? -1 : 1;
        const nextIdx = (((idx + dir) % tabs.length) + tabs.length) % tabs.length;
        setActiveTab(tabs[nextIdx].tabId);
        return;
      }

      // Buscar no documento (Ctrl+F)
      if (ctrl && e.key.toLowerCase() === 'f') {
        if (activeTab) {
          e.preventDefault();
          updateTabState(activeTab.tabId, { isSearchOpen: true });
        }
        return;
      }

      // Ir para página (Ctrl+G)
      if (ctrl && e.key.toLowerCase() === 'g' && activeTab) {
        e.preventDefault();
        setGoToPageInput(String(activeTab.currentPage + 1));
        setGoToPageModalOpen(true);
        return;
      }

      if (isTyping) return;

      // Desfazer / Refazer (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
      if (ctrl && e.key.toLowerCase() === 'z' && activeTab) {
        e.preventDefault();
        if (e.shiftKey) void redo(activeTab.tabId);
        else void undo(activeTab.tabId);
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'y' && activeTab) {
        e.preventDefault();
        void redo(activeTab.tabId);
        return;
      }

      // Zoom e Ajuste (Ctrl++, Ctrl+-, Ctrl+0, Ctrl+1, Ctrl+2)
      if (ctrl && activeTab) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          if (e.shiftKey) {
            void applyStructuralMutation(activeTab.tabId, 'Girar página à direita', (b) =>
              rotatePdfPages(b, [activeTab.currentPage], 90)
            );
          } else {
            setZoom(activeTab.tabId, activeTab.zoom + 0.15);
          }
          return;
        }
        if (e.key === '-') {
          e.preventDefault();
          if (e.shiftKey) {
            void applyStructuralMutation(activeTab.tabId, 'Girar página à esquerda', (b) =>
              rotatePdfPages(b, [activeTab.currentPage], -90)
            );
          } else {
            setZoom(activeTab.tabId, activeTab.zoom - 0.15);
          }
          return;
        }
        if (e.key === '0') {
          e.preventDefault();
          setZoom(activeTab.tabId, 1.0);
          return;
        }
        if (e.key === '1') {
          e.preventDefault();
          viewportRef.current?.fitPage();
          return;
        }
        if (e.key === '2') {
          e.preventDefault();
          viewportRef.current?.fitWidth();
          return;
        }
      }

      // Navegação de Página (PageUp / PageDown / Home / End)
      if (activeTab && !ctrl && !e.altKey) {
        if (e.key === 'PageDown') {
          e.preventDefault();
          viewportRef.current?.scrollToPage(activeTab.currentPage + 1);
          return;
        }
        if (e.key === 'PageUp') {
          e.preventDefault();
          viewportRef.current?.scrollToPage(activeTab.currentPage - 1);
          return;
        }
        if (e.key === 'Home') {
          e.preventDefault();
          viewportRef.current?.scrollToPage(0);
          return;
        }
        if (e.key === 'End') {
          e.preventDefault();
          viewportRef.current?.scrollToPage(activeTab.geometries.length - 1);
          return;
        }
        if (e.key === 'Delete' && activeTab.selectedAnnotationId) {
          const found = Object.values(activeTab.annotationsByPage)
            .flat()
            .find((a) => a.id === activeTab.selectedAnnotationId);
          if (found) {
            e.preventDefault();
            void executeCommand(
              activeTab.tabId,
              new DeleteAnnotationCommand(tabIdOrEmpty(activeTab.tabId), found, {
                upsertAnnotation: upsertAnnotationDirect,
                removeAnnotation: removeAnnotationDirect,
              })
            );
          }
          return;
        }
        if (e.key === 'Escape') {
          setActiveTool('select');
          updateTabState(activeTab.tabId, {
            selectedAnnotationId: null,
            activeEditingBlockId: null,
            activeTextBlockDraft: null,
            isSearchOpen: false,
          });
          return;
        }

        // Ferramentas Rápidas por Tecla Única (V, H, U, C, T, D)
        const lower = e.key.toLowerCase();
        if (lower === 'v') setActiveTool('select');
        else if (lower === 'h') setActiveTool('hand');
        else if (lower === 'u') {
          setWorkMode('comment');
          setActiveTool('highlight');
        } else if (lower === 'c') {
          setWorkMode('comment');
          setActiveTool('sticky-note');
        } else if (lower === 't') {
          setWorkMode('comment');
          setActiveTool('free-text');
        } else if (lower === 'd') {
          setWorkMode('comment');
          setActiveTool('ink');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeTab,
    activeTabId,
    tabs,
    openPdfFromDisk,
    saveTab,
    printTab,
    requestCloseTab,
    reopenLastClosedTab,
    setActiveTab,
    updateTabState,
    undo,
    redo,
    setZoom,
    setActiveTool,
    setWorkMode,
    applyStructuralMutation,
    executeCommand,
    upsertAnnotationDirect,
    removeAnnotationDirect,
    platform.windowControls.isDesktop,
  ]);

  const handleGlobalFileDrop = async (e: React.DragEvent) => {
    if (activeTabId === 'home') return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.name.toLowerCase().endsWith('.pdf')
    );
    if (files.length === 0) return;
    const loaded = await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        path: (f as File & { path?: string }).path,
        bytes: new Uint8Array(await f.arrayBuffer()),
        sizeBytes: f.size,
      }))
    );
    await openLoadedFiles(loaded);
  };

  const handleExecuteSplit = async () => {
    if (!activeTab) return;
    try {
      const outputs = await splitPdfDocument(activeTab.bytes, {
        mode: splitMode,
        rangeSpec: splitRange,
        everyN: splitEveryN,
        selectedPages:
          activeTab.selectedOrganizePages.length > 0
            ? activeTab.selectedOrganizePages
            : [activeTab.currentPage],
      });
      const base = activeTab.fileName.replace(/\.pdf$/i, '');
      for (const out of outputs) {
        await usePdfStudioStore.getState().openDocumentInTab({
          fileName: `${base}-${out.nameSuffix}.pdf`,
          bytes: out.bytes,
          markDirty: true,
        });
      }
      setSplitModalOpen(false);
      showToast(`${outputs.length} documento(s) extraído(s) em novas abas.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleGlobalFileDrop}
      className={`${darkMode ? 'dark' : ''} flex h-screen w-screen flex-col overflow-hidden`}
      style={{
        fontFamily:
          '"Segoe UI Variable", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      {/* ZONA 1: Faixa Superior (Título + Abas Multi-Documento) */}
      <TopTitleTabsBar />

      {/* ZONA 2: Barra de Ferramentas Contextual (Nível 1 + Nível 2) */}
      <ContextualToolbar
        onOpenNewBlankModal={() => setNewBlankModalOpen(true)}
        onOpenSplitModal={() => setSplitModalOpen(true)}
        onOpenPropertiesModal={() => setPropertiesModalOpen(true)}
      />

      {/* ZONA 3: Banner Dinâmico Contextual do Documento */}
      {activeTabId !== 'home' && activeTab && <DocumentBanner tab={activeTab} />}

      {/* CORPO CENTRAL: Zona 4 (Esquerda) + Zona 5 (Viewport) + Zona 6 (Inspetor Direito) */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {activeTabId === 'home' || !activeTab ? (
          <HomeStartView onRequestNewBlankModal={() => setNewBlankModalOpen(true)} />
        ) : (
          <>
            <LeftNavigationSidebar
              tab={activeTab}
              onScrollToPage={(p) => viewportRef.current?.scrollToPage(p)}
            />
            <DocumentViewport ref={viewportRef} tab={activeTab} />
            <RightPropertyInspector tab={activeTab} />
          </>
        )}
      </div>

      {/* ZONA 7: Barra de Status Inferior */}
      <BottomStatusBar
        tab={activeTabId === 'home' ? undefined : activeTab}
        onScrollToPage={(p) => viewportRef.current?.scrollToPage(p)}
        onFitWidth={() => viewportRef.current?.fitWidth()}
        onFitPage={() => viewportRef.current?.fitPage()}
      />

      {/* MODAL DE PROTEÇÃO DE ALTERAÇÕES NÃO SALVAS AO FECHAR ABA */}
      {pendingCloseTab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div
            className={`w-full max-w-md rounded-xl border p-5 shadow-2xl ${
              darkMode
                ? 'border-[#334155] bg-[#1E2430] text-slate-100'
                : 'border-slate-200 bg-white text-slate-800'
            }`}
          >
            <h3 className="text-sm font-semibold">Salvar alterações antes de fechar?</h3>
            <p className="mt-1.5 text-xs opacity-80">
              O documento <strong>{pendingCloseTab.fileName}</strong> possui modificações não
              salvas que serão perdidas se você descartá-las.
            </p>
            <div className="mt-5 flex justify-end gap-2 text-xs">
              <button
                onClick={cancelPendingCloseTab}
                className="rounded-md border border-slate-500/30 px-3 py-1.5 hover:bg-slate-500/10"
              >
                Cancelar
              </button>
              <button
                onClick={() => void forceCloseTab(pendingCloseTab.tabId)}
                className="rounded-md bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700"
              >
                Descartar alterações
              </button>
              <button
                onClick={async () => {
                  const ok = await saveTab(pendingCloseTab.tabId, false);
                  if (ok) await forceCloseTab(pendingCloseTab.tabId);
                }}
                className="rounded-md bg-[#1B2952] px-3.5 py-1.5 font-medium text-white hover:bg-[#2F4D8F]"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CRIAR PDF EM BRANCO */}
      {newBlankModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div
            className={`w-full max-w-sm rounded-xl border p-5 text-xs shadow-2xl ${
              darkMode
                ? 'border-[#334155] bg-[#1E2430] text-slate-100'
                : 'border-slate-200 bg-white text-slate-800'
            }`}
          >
            <h3 className="text-sm font-semibold">Criar Novo PDF em Branco</h3>
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block opacity-75">Formato do Papel</label>
                <select
                  value={blankOptions.preset}
                  onChange={(e) =>
                    setBlankOptions({
                      ...blankOptions,
                      preset: e.target.value as BlankPageOptions['preset'],
                    })
                  }
                  className={`h-8 w-full rounded border px-2 ${
                    darkMode ? 'border-[#334155] bg-[#111827]' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <option value="A4">A4 (210 × 297 mm)</option>
                  <option value="Letter">Carta (216 × 279 mm)</option>
                  <option value="A3">A3 (297 × 420 mm)</option>
                  <option value="Legal">Ofício (216 × 356 mm)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block opacity-75">Orientação</label>
                  <select
                    value={blankOptions.orientation}
                    onChange={(e) =>
                      setBlankOptions({
                        ...blankOptions,
                        orientation: e.target.value as BlankPageOptions['orientation'],
                      })
                    }
                    className={`h-8 w-full rounded border px-2 ${
                      darkMode ? 'border-[#334155] bg-[#111827]' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <option value="portrait">Retrato</option>
                    <option value="landscape">Paisagem</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block opacity-75">Páginas</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={blankOptions.pageCount}
                    onChange={(e) =>
                      setBlankOptions({
                        ...blankOptions,
                        pageCount: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className={`h-8 w-full rounded border px-2 ${
                      darkMode ? 'border-[#334155] bg-[#111827]' : 'border-slate-200 bg-slate-50'
                    }`}
                  />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setNewBlankModalOpen(false)}
                className="rounded border border-slate-500/30 px-3 py-1.5 hover:bg-slate-500/10"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setNewBlankModalOpen(false);
                  void createNewBlankDocument(blankOptions);
                }}
                className="rounded bg-[#1B2952] px-4 py-1.5 font-medium text-white hover:bg-[#2F4D8F]"
              >
                Criar Documento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DIVIDIR / EXTRAIR PÁGINAS */}
      {splitModalOpen && activeTab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div
            className={`w-full max-w-sm rounded-xl border p-5 text-xs shadow-2xl ${
              darkMode
                ? 'border-[#334155] bg-[#1E2430] text-slate-100'
                : 'border-slate-200 bg-white text-slate-800'
            }`}
          >
            <h3 className="text-sm font-semibold">Dividir ou Extrair Páginas</h3>
            <div className="mt-3 space-y-3">
              <select
                value={splitMode}
                onChange={(e) => setSplitMode(e.target.value as SplitOptions['mode'])}
                className={`h-8 w-full rounded border px-2 ${
                  darkMode ? 'border-[#334155] bg-[#111827]' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <option value="range">Por intervalo de páginas (ex: 1-2, 4)</option>
                <option value="every-n">Dividir a cada N páginas</option>
                <option value="extract-selected">Extrair páginas selecionadas</option>
              </select>

              {splitMode === 'range' && (
                <input
                  type="text"
                  value={splitRange}
                  onChange={(e) => setSplitRange(e.target.value)}
                  placeholder="Ex: 1-2, 4"
                  className={`h-8 w-full rounded border px-2 ${
                    darkMode ? 'border-[#334155] bg-[#111827]' : 'border-slate-200 bg-slate-50'
                  }`}
                />
              )}

              {splitMode === 'every-n' && (
                <input
                  type="number"
                  min={1}
                  max={activeTab.geometries.length}
                  value={splitEveryN}
                  onChange={(e) => setSplitEveryN(Math.max(1, Number(e.target.value) || 1))}
                  className={`h-8 w-full rounded border px-2 ${
                    darkMode ? 'border-[#334155] bg-[#111827]' : 'border-slate-200 bg-slate-50'
                  }`}
                />
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setSplitModalOpen(false)}
                className="rounded border border-slate-500/30 px-3 py-1.5 hover:bg-slate-500/10"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleExecuteSplit()}
                className="rounded bg-[#1B2952] px-4 py-1.5 font-medium text-white hover:bg-[#2F4D8F]"
              >
                Extrair em Novas Abas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PROPRIEDADES TÉCNICAS DO DOCUMENTO (Ctrl+D) */}
      {propertiesModalOpen && activeTab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div
            className={`w-full max-w-md rounded-xl border p-5 text-xs shadow-2xl ${
              darkMode
                ? 'border-[#334155] bg-[#1E2430] text-slate-100'
                : 'border-slate-200 bg-white text-slate-800'
            }`}
          >
            <h3 className="text-sm font-semibold">Inspetor Técnico — Propriedades do PDF</h3>
            <div className="mt-3 space-y-2 rounded-lg border border-slate-500/20 p-3">
              {[
                ['Arquivo', activeTab.fileName],
                ['Título', activeTab.metadata?.title || '—'],
                ['Autor', activeTab.metadata?.author || '—'],
                ['Assunto', activeTab.metadata?.subject || '—'],
                ['Criador', activeTab.metadata?.creator || '—'],
                ['Produtor', activeTab.metadata?.producer || '—'],
                ['Versão ISO PDF', activeTab.metadata?.pdfVersion || '1.7'],
                ['Total de Páginas', String(activeTab.geometries.length)],
                [
                  'Tamanho em Memória',
                  `${(activeTab.bytes.byteLength / 1024).toFixed(1)} KB`,
                ],
                [
                  'Criptografado',
                  activeTab.metadata?.isEncrypted ? 'Sim (AES)' : 'Não',
                ],
                [
                  'Formulário AcroForm',
                  activeTab.metadata?.hasAcroForm ? 'Presente' : 'Ausente',
                ],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <span className="opacity-65">{k}:</span>
                  <span className="truncate font-medium">{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setPropertiesModalOpen(false)}
                className="rounded bg-[#1B2952] px-4 py-1.5 font-medium text-white hover:bg-[#2F4D8F]"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: IR PARA PÁGINA (Ctrl+G) */}
      {goToPageModalOpen && activeTab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const num = parseInt(goToPageInput, 10);
              if (!Number.isNaN(num)) {
                viewportRef.current?.scrollToPage(num - 1);
              }
              setGoToPageModalOpen(false);
            }}
            className={`w-full max-w-xs rounded-xl border p-4 text-xs shadow-2xl ${
              darkMode
                ? 'border-[#334155] bg-[#1E2430] text-slate-100'
                : 'border-slate-200 bg-white text-slate-800'
            }`}
          >
            <h3 className="text-sm font-semibold">Ir para Página</h3>
            <input
              autoFocus
              type="number"
              min={1}
              max={activeTab.geometries.length}
              value={goToPageInput}
              onChange={(e) => setGoToPageInput(e.target.value)}
              className={`mt-2.5 h-8 w-full rounded border px-2 tabular-nums ${
                darkMode ? 'border-[#334155] bg-[#111827]' : 'border-slate-200 bg-slate-50'
              }`}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setGoToPageModalOpen(false)}
                className="rounded px-3 py-1 hover:bg-slate-500/10"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded bg-[#1B2952] px-3 py-1 font-medium text-white"
              >
                Ir
              </button>
            </div>
          </form>
        </div>
      )}

      {/* NOTIFICAÇÃO DISCRETA (TOAST) */}
      {toast && (
        <div
          className={`fixed bottom-10 right-5 z-50 rounded-lg border px-4 py-2.5 text-xs font-medium shadow-xl transition-all ${
            toast.tone === 'error'
              ? 'border-red-500/40 bg-red-600 text-white'
              : toast.tone === 'warning'
              ? 'border-amber-500/40 bg-amber-600 text-white'
              : toast.tone === 'success'
              ? 'border-emerald-500/40 bg-emerald-700 text-white'
              : 'border-slate-600 bg-[#1B2952] text-white'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function tabIdOrEmpty(id: string): string {
  return id;
}

export function PdfStudioApp({ platform }: { platform: IPlatformAdapter }) {
  return (
    <PlatformProvider platform={platform}>
      <PdfStudioInnerShell />
    </PlatformProvider>
  );
}
