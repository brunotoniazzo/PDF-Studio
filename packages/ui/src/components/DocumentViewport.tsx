import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  RotateCw,
  ScanText,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  deletePdfPages,
  duplicatePdfPage,
  getCssScale,
  getEffectivePageSizePt,
  reorderPdfPages,
  rotatePdfPages,
  sharedPdfEngine,
} from '@pdf-studio/pdf-engine';
import {
  type DocumentTabState,
  usePdfStudioStore,
} from '@pdf-studio/editor-core';
import { usePlatformActions } from '../context/PlatformContext';
import { PageStackView } from './PageStackView';

export interface DocumentViewportHandle {
  scrollToPage: (pageIndex: number) => void;
  fitWidth: () => void;
  fitPage: () => void;
}

function OrganizeGridThumb({
  docId,
  pageIndex,
  widthPt,
  heightPt,
  selected,
  darkMode,
  onClick,
  onRotate,
  onDuplicate,
  onDelete,
  canDelete,
  onDragStart,
  onDrop,
}: {
  docId: string;
  pageIndex: number;
  widthPt: number;
  heightPt: number;
  selected: boolean;
  darkMode: boolean;
  onClick: (e: React.MouseEvent) => void;
  onRotate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canDelete: boolean;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const w = 190;
    const h = Math.max(120, Math.round((heightPt / Math.max(1, widthPt)) * w));
    void sharedPdfEngine
      .requestPageBitmap({
        docId,
        pageIndex,
        widthPx: w,
        heightPx: h,
        priority: 'low',
        useLatestGeneration: false,
      })
      .then((bmp) => {
        if (cancelled || !bmp || !canvasRef.current) return;
        const c = canvasRef.current;
        c.width = bmp.width;
        c.height = bmp.height;
        c.getContext('2d')?.drawImage(bmp, 0, 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [docId, pageIndex, widthPt, heightPt]);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={onClick}
      className={`group flex cursor-pointer flex-col items-center rounded-xl border p-3 transition ${
        selected
          ? 'border-[#1B2952] bg-[#1B2952]/10 ring-2 ring-[#1B2952] dark:border-blue-400 dark:bg-blue-500/15 dark:ring-blue-400'
          : darkMode
          ? 'border-[#334155] bg-[#1E2430] hover:border-slate-500'
          : 'border-slate-200 bg-white shadow-sm hover:border-slate-400'
      }`}
    >
      <div className="relative w-full overflow-hidden rounded border border-slate-300 bg-white shadow-sm">
        <canvas ref={canvasRef} className="mx-auto block max-h-52 w-full object-contain" />
        <div className="absolute right-1.5 top-1.5 hidden gap-1 rounded-md bg-slate-900/85 p-1 text-white group-hover:flex">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRotate();
            }}
            title="Girar 90°"
            className="rounded p-1 hover:bg-white/20"
          >
            <RotateCw className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            title="Duplicar"
            className="rounded p-1 hover:bg-white/20"
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          {canDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Excluir"
              className="rounded p-1 text-red-300 hover:bg-red-600 hover:text-white"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>
      <span className="mt-2 text-xs font-semibold tabular-nums">
        Página {pageIndex + 1}
      </span>
    </div>
  );
}

export const DocumentViewport = React.forwardRef<
  DocumentViewportHandle,
  { tab: DocumentTabState }
>(function DocumentViewport({ tab }, ref) {
  const { applyStructuralMutation } = usePlatformActions();
  const darkMode = usePdfStudioStore((s) => s.darkMode);
  const workMode = usePdfStudioStore((s) => s.workMode);
  const activeTool = usePdfStudioStore((s) => s.activeTool);
  const setCurrentPage = usePdfStudioStore((s) => s.setCurrentPage);
  const setZoom = usePdfStudioStore((s) => s.setZoom);
  const updateTabState = usePdfStudioStore((s) => s.updateTabState);
  const unlockTabWithPassword = usePdfStudioStore((s) => s.unlockTabWithPassword);
  const setWorkMode = usePdfStudioStore((s) => s.setWorkMode);
  const openRightInspector = usePdfStudioStore((s) => s.openRightInspector);

  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [panState, setPanState] = useState<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  const [pwdInput, setPwdInput] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [dragGridIdx, setDragGridIdx] = useState<number | null>(null);

  const cssScale = getCssScale(tab.zoom);

  const virtualizer = useVirtualizer({
    count: tab.viewLayout === 'continuous' ? tab.geometries.length : 0,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => {
      const geo = tab.geometries[index];
      if (!geo) return 860;
      const eff = getEffectivePageSizePt(geo);
      return Math.round(eff.heightPt * cssScale) + 28;
    },
    overscan: 2,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [tab.zoom, tab.geometries, virtualizer]);

  const scrollToPage = useCallback(
    (pageIndex: number) => {
      const bounded = Math.max(0, Math.min(tab.geometries.length - 1, pageIndex));
      setCurrentPage(tab.tabId, bounded);
      if (tab.viewLayout === 'continuous') {
        virtualizer.scrollToIndex(bounded, { align: 'start' });
      }
    },
    [tab.geometries.length, tab.tabId, tab.viewLayout, setCurrentPage, virtualizer]
  );

  const fitWidth = useCallback(() => {
    const el = scrollParentRef.current;
    const geo = tab.geometries[tab.currentPage];
    if (!el || !geo) return;
    const eff = getEffectivePageSizePt(geo);
    const availableW = Math.max(240, el.clientWidth - 64);
    const targetZoom = availableW / (eff.widthPt * (96 / 72));
    setZoom(tab.tabId, targetZoom);
  }, [tab.geometries, tab.currentPage, tab.tabId, setZoom]);

  const fitPage = useCallback(() => {
    const el = scrollParentRef.current;
    const geo = tab.geometries[tab.currentPage];
    if (!el || !geo) return;
    const eff = getEffectivePageSizePt(geo);
    const availW = Math.max(200, el.clientWidth - 64);
    const availH = Math.max(200, el.clientHeight - 48);
    const zW = availW / (eff.widthPt * (96 / 72));
    const zH = availH / (eff.heightPt * (96 / 72));
    setZoom(tab.tabId, Math.min(zW, zH));
  }, [tab.geometries, tab.currentPage, tab.tabId, setZoom]);

  useImperativeHandle(ref, () => ({ scrollToPage, fitWidth, fitPage }), [
    scrollToPage,
    fitWidth,
    fitPage,
  ]);

  // Auto-ajusta à largura ao abrir documento se a janela atual for estreita (ex: tela dividida Windows)
  const autoFittedRef = useRef<string | null>(null);
  useEffect(() => {
    if (tab.isLoading || tab.geometries.length === 0) return;
    if (autoFittedRef.current === tab.tabId) return;
    autoFittedRef.current = tab.tabId;
    const el = scrollParentRef.current;
    const geo = tab.geometries[0];
    if (!el || !geo) return;
    const eff = getEffectivePageSizePt(geo);
    const neededCss = eff.widthPt * (96 / 72) + 48;
    if (el.clientWidth > 240 && el.clientWidth < neededCss) {
      const targetZoom = Math.max(0.5, (el.clientWidth - 48) / (eff.widthPt * (96 / 72)));
      setZoom(tab.tabId, targetZoom);
    }
  }, [tab.isLoading, tab.geometries, tab.tabId, setZoom]);

  // Atalho temporário: segurar Barra de Espaço ativa a ferramenta Mão (Pan)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      if (e.code === 'Space') {
        setSpacePressed(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
        setPanState(null);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Zoom centrado no cursor via Ctrl + Roda do Mouse
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const el = scrollParentRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const offsetX = e.clientX - rect.left + el.scrollLeft;
      const offsetY = e.clientY - rect.top + el.scrollTop;

      const delta = e.deltaY < 0 ? 0.12 : -0.12;
      const nextZoom = Math.max(0.25, Math.min(4.0, Math.round((tab.zoom + delta) * 100) / 100));
      const ratio = nextZoom / tab.zoom;
      setZoom(tab.tabId, nextZoom);

      requestAnimationFrame(() => {
        el.scrollLeft = offsetX * ratio - (e.clientX - rect.left);
        el.scrollTop = offsetY * ratio - (e.clientY - rect.top);
      });
    }
  };

  // Executa Busca Global Assíncrona no Worker PDFium
  const runSearch = async (
    query: string,
    opts?: { caseSensitive?: boolean; wholeWord?: boolean; useRegex?: boolean }
  ) => {
    const cs = opts?.caseSensitive ?? tab.searchCaseSensitive;
    const ww = opts?.wholeWord ?? tab.searchWholeWord;
    const rx = opts?.useRegex ?? tab.searchRegex;

    updateTabState(tab.tabId, {
      searchQuery: query,
      searchCaseSensitive: cs,
      searchWholeWord: ww,
      searchRegex: rx,
    });

    if (!query.trim()) {
      updateTabState(tab.tabId, { searchMatches: [], activeSearchMatchIndex: 0 });
      return;
    }

    const matches = await sharedPdfEngine.searchDocument({
      docId: tab.docId,
      query,
      caseSensitive: cs,
      wholeWord: ww,
      useRegex: rx,
    });
    updateTabState(tab.tabId, { searchMatches: matches, activeSearchMatchIndex: 0 });
    if (matches[0]) {
      scrollToPage(matches[0].pageIndex);
    }
  };

  const stepSearchMatch = (dir: 1 | -1) => {
    const total = tab.searchMatches.length;
    if (total === 0) return;
    const nextIdx = (((tab.activeSearchMatchIndex + dir) % total) + total) % total;
    updateTabState(tab.tabId, { activeSearchMatchIndex: nextIdx });
    scrollToPage(tab.searchMatches[nextIdx].pageIndex);
  };

  // 1. Estado de Carregamento Inicial
  if (tab.isLoading) {
    return (
      <div
        className={`flex flex-1 flex-col items-center justify-center gap-3 ${
          darkMode ? 'bg-[#111827] text-slate-300' : 'bg-[#E5E7EB] text-slate-700'
        }`}
      >
        <Loader2 className="h-7 w-7 animate-spin text-[#1B2952] dark:text-blue-400" />
        <span className="text-xs font-medium">Carregando estrutura XRef e motor PDFium WASM...</span>
      </div>
    );
  }

  // 2. Estado de Documento Protegido por Senha (isolado dentro da própria aba!)
  if (tab.requiresPassword) {
    return (
      <div
        className={`flex flex-1 items-center justify-center p-6 ${
          darkMode ? 'bg-[#111827]' : 'bg-[#E5E7EB]'
        }`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void unlockTabWithPassword(tab.tabId, pwdInput);
          }}
          className={`w-full max-w-sm rounded-xl border p-6 shadow-xl ${
            darkMode
              ? 'border-[#334155] bg-[#1E2430] text-slate-100'
              : 'border-slate-200 bg-white text-slate-800'
          }`}
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
            <Lock className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <h2 className="text-sm font-semibold">Documento Protegido por Senha</h2>
          <p className="mt-1 text-xs opacity-75">
            Digite a senha de abertura para descriptografar <strong>{tab.fileName}</strong>.
          </p>

          <div className="relative mt-4">
            <input
              autoFocus
              type={showPwd ? 'text' : 'password'}
              value={pwdInput}
              onChange={(e) => setPwdInput(e.target.value)}
              placeholder="Senha do PDF..."
              className={`h-9 w-full rounded-md border pl-3 pr-9 text-xs outline-none ${
                darkMode
                  ? 'border-[#334155] bg-[#111827] text-white'
                  : 'border-slate-300 bg-slate-50 text-slate-900'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100"
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {tab.passwordError && (
            <p className="mt-2 text-xs font-medium text-red-500">{tab.passwordError}</p>
          )}

          <button
            type="submit"
            className="mt-4 h-9 w-full rounded-md bg-[#1B2952] text-xs font-medium text-white hover:bg-[#2F4D8F]"
          >
            Desbloquear Documento
          </button>
        </form>
      </div>
    );
  }

  // 3. Modo "Organizar" — Mesa de Luz Responsiva (Grade de Páginas em Tela Cheia)
  if (workMode === 'organize') {
    return (
      <div
        className={`flex-1 overflow-y-auto p-6 ${
          darkMode ? 'bg-[#111827] text-slate-100' : 'bg-[#E5E7EB] text-slate-800'
        }`}
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex items-center justify-between text-xs">
            <span className="font-medium opacity-80">
              Mesa de Luz de Organização — Clique com Ctrl/Shift para seleção múltipla ou arraste
              para reordenar páginas.
            </span>
            <span className="tabular-nums opacity-75">
              {tab.selectedOrganizePages.length > 0
                ? `${tab.selectedOrganizePages.length} página(s) selecionada(s)`
                : `${tab.geometries.length} páginas no total`}
            </span>
          </div>

          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(176px, 1fr))' }}
          >
            {tab.geometries.map((geo) => {
              const isSel = tab.selectedOrganizePages.includes(geo.pageIndex);
              return (
                <OrganizeGridThumb
                  key={`${tab.bytes.byteLength}-${geo.pageIndex}-${geo.rotation}`}
                  docId={tab.docId}
                  pageIndex={geo.pageIndex}
                  widthPt={geo.widthPt}
                  heightPt={geo.heightPt}
                  selected={isSel}
                  darkMode={darkMode}
                  canDelete={tab.geometries.length > 1}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                      const next = isSel
                        ? tab.selectedOrganizePages.filter((p) => p !== geo.pageIndex)
                        : [...tab.selectedOrganizePages, geo.pageIndex];
                      updateTabState(tab.tabId, { selectedOrganizePages: next });
                    } else {
                      updateTabState(tab.tabId, {
                        selectedOrganizePages: [geo.pageIndex],
                        currentPage: geo.pageIndex,
                      });
                    }
                  }}
                  onRotate={() =>
                    void applyStructuralMutation(
                      tab.tabId,
                      `Rotacionar página ${geo.pageIndex + 1}`,
                      (b) => rotatePdfPages(b, [geo.pageIndex], 90)
                    )
                  }
                  onDuplicate={() =>
                    void applyStructuralMutation(
                      tab.tabId,
                      `Duplicar página ${geo.pageIndex + 1}`,
                      (b) => duplicatePdfPage(b, geo.pageIndex)
                    )
                  }
                  onDelete={() =>
                    void applyStructuralMutation(
                      tab.tabId,
                      `Excluir página ${geo.pageIndex + 1}`,
                      (b) => deletePdfPages(b, [geo.pageIndex])
                    )
                  }
                  onDragStart={() => setDragGridIdx(geo.pageIndex)}
                  onDrop={() => {
                    if (dragGridIdx !== null && dragGridIdx !== geo.pageIndex) {
                      const order = tab.geometries.map((g) => g.pageIndex);
                      const [moved] = order.splice(dragGridIdx, 1);
                      order.splice(geo.pageIndex, 0, moved);
                      void applyStructuralMutation(
                        tab.tabId,
                        'Reordenar páginas na Mesa de Luz',
                        (b) => reorderPdfPages(b, order)
                      );
                    }
                    setDragGridIdx(null);
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const isHandActive = activeTool === 'hand' || spacePressed;
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="relative flex flex-1 overflow-hidden">
      {/* Barra Flutuante de Busca Global (Ctrl+F) */}
      {tab.isSearchOpen && (
        <div
          className={`absolute right-5 top-3 z-40 w-80 rounded-xl border p-2.5 text-xs shadow-2xl ${
            darkMode
              ? 'border-[#334155] bg-[#1E2430] text-slate-100'
              : 'border-slate-200 bg-white text-slate-800'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 opacity-60" strokeWidth={1.5} />
            <input
              autoFocus
              type="text"
              value={tab.searchQuery}
              onChange={(e) => void runSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  stepSearchMatch(e.shiftKey ? -1 : 1);
                } else if (e.key === 'Escape') {
                  updateTabState(tab.tabId, { isSearchOpen: false });
                }
              }}
              placeholder="Buscar no PDF..."
              className="flex-1 bg-transparent outline-none"
            />
            <span className="shrink-0 opacity-65 tabular-nums">
              {tab.searchMatches.length > 0
                ? `${tab.activeSearchMatchIndex + 1}/${tab.searchMatches.length}`
                : '0/0'}
            </span>
            <button
              onClick={() => stepSearchMatch(-1)}
              className="rounded p-0.5 hover:bg-slate-500/15"
              title="Anterior (Shift+Enter)"
            >
              <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => stepSearchMatch(1)}
              className="rounded p-0.5 hover:bg-slate-500/15"
              title="Próximo (Enter / F3)"
            >
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => updateTabState(tab.tabId, { isSearchOpen: false })}
              className="rounded p-0.5 hover:bg-slate-500/15"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2 border-t border-slate-500/15 pt-1.5 text-[11px]">
            <button
              onClick={() =>
                void runSearch(tab.searchQuery, {
                  caseSensitive: !tab.searchCaseSensitive,
                })
              }
              className={`rounded px-1.5 py-0.5 ${
                tab.searchCaseSensitive
                  ? 'bg-[#1B2952] text-white'
                  : 'opacity-70 hover:bg-slate-500/15'
              }`}
            >
              Aa
            </button>
            <button
              onClick={() =>
                void runSearch(tab.searchQuery, { wholeWord: !tab.searchWholeWord })
              }
              className={`rounded px-1.5 py-0.5 ${
                tab.searchWholeWord
                  ? 'bg-[#1B2952] text-white'
                  : 'opacity-70 hover:bg-slate-500/15'
              }`}
            >
              Palavra inteira
            </button>
            <button
              onClick={() =>
                void runSearch(tab.searchQuery, { useRegex: !tab.searchRegex })
              }
              className={`rounded px-1.5 py-0.5 font-mono ${
                tab.searchRegex
                  ? 'bg-[#1B2952] text-white'
                  : 'opacity-70 hover:bg-slate-500/15'
              }`}
            >
              .*
            </button>
          </div>

          {tab.searchQuery.trim() && tab.searchMatches.length === 0 && (
            <div className="mt-2 rounded bg-slate-500/10 p-2 text-[11px]">
              Nenhum trecho encontrado para o termo digitado.
              {tab.metadata?.isScannedCandidate && (
                <button
                  onClick={() => {
                    setWorkMode('convert');
                    openRightInspector('ocr');
                  }}
                  className="mt-1.5 flex items-center gap-1 font-semibold text-[#1B2952] hover:underline dark:text-blue-400"
                >
                  <ScanText className="h-3 w-3" />
                  Executar OCR para tornar pesquisável?
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Container Principal de Rolagem Virtualizada */}
      <div
        ref={scrollParentRef}
        onWheel={handleWheel}
        onScroll={(e) => {
          if (tab.viewLayout !== 'continuous') return;
          const items = virtualizer.getVirtualItems();
          if (items.length === 0) return;
          const scrollMid =
            e.currentTarget.scrollTop + e.currentTarget.clientHeight * 0.35;
          const visible =
            items.find((it) => it.start <= scrollMid && it.end >= scrollMid) ?? items[0];
          if (visible && visible.index !== tab.currentPage) {
            setCurrentPage(tab.tabId, visible.index);
          }
        }}
        onPointerDown={(e) => {
          if (!isHandActive || !scrollParentRef.current) return;
          setPanState({
            startX: e.clientX,
            startY: e.clientY,
            scrollLeft: scrollParentRef.current.scrollLeft,
            scrollTop: scrollParentRef.current.scrollTop,
          });
        }}
        onPointerMove={(e) => {
          if (!panState || !scrollParentRef.current) return;
          scrollParentRef.current.scrollLeft =
            panState.scrollLeft - (e.clientX - panState.startX);
          scrollParentRef.current.scrollTop =
            panState.scrollTop - (e.clientY - panState.startY);
        }}
        onPointerUp={() => setPanState(null)}
        className={`flex-1 overflow-auto py-5 transition-colors ${
          darkMode ? 'bg-[#111827]' : 'bg-[#E5E7EB]'
        } ${isHandActive ? (panState ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
      >
        {/* Rolagem Contínua Virtualizada */}
        {tab.viewLayout === 'continuous' && (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((vItem) => {
              const geo = tab.geometries[vItem.index];
              if (!geo) return null;
              const dist = Math.abs(vItem.index - tab.currentPage);
              const prio = dist === 0 ? 'high' : 'medium';

              return (
                <div
                  key={vItem.key}
                  data-index={vItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vItem.start}px)`,
                    paddingBottom: 24,
                  }}
                >
                  <PageStackView tab={tab} geometry={geo} priority={prio} />
                </div>
              );
            })}
          </div>
        )}

        {/* Página Única */}
        {tab.viewLayout === 'single' && tab.geometries[tab.currentPage] && (
          <div className="flex min-h-full items-center justify-center px-4">
            <PageStackView
              tab={tab}
              geometry={tab.geometries[tab.currentPage]}
              priority="high"
            />
          </div>
        )}

        {/* Página Dupla (Modo Livro) */}
        {(tab.viewLayout === 'dual-book' || tab.viewLayout === 'dual-cover') && (
          <div className="flex flex-wrap items-start justify-center gap-6 px-6">
            {tab.geometries[tab.currentPage] && (
              <PageStackView
                tab={tab}
                geometry={tab.geometries[tab.currentPage]}
                priority="high"
              />
            )}
            {tab.geometries[tab.currentPage + 1] && (
              <PageStackView
                tab={tab}
                geometry={tab.geometries[tab.currentPage + 1]}
                priority="high"
              />
            )}
          </div>
        )}
      </div>

      {/* Visualização Dividida (Split View do mesmo documento) */}
      {tab.splitView && tab.geometries[Math.min(tab.geometries.length - 1, tab.currentPage + 1)] && (
        <div
          className={`hidden w-1/2 overflow-auto border-l py-5 lg:block ${
            darkMode ? 'border-[#334155] bg-[#111827]' : 'border-slate-300 bg-[#E5E7EB]'
          }`}
        >
          <PageStackView
            tab={tab}
            geometry={
              tab.geometries[Math.min(tab.geometries.length - 1, tab.currentPage + 1)]
            }
            priority="high"
          />
        </div>
      )}
    </div>
  );
});
