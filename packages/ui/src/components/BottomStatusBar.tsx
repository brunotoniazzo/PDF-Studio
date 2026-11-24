import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Contrast,
  File,
  Loader2,
  Maximize,
  Minus,
  MoveHorizontal,
  Plus,
  ScrollText,
} from 'lucide-react';
import type { PageTheme, ViewLayoutMode } from '@pdf-studio/platform-contracts';
import {
  detectPaperSizeLabel,
  getEffectivePageSizePt,
} from '@pdf-studio/pdf-engine';
import {
  type DocumentTabState,
  usePdfStudioStore,
} from '@pdf-studio/editor-core';

const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export function BottomStatusBar({
  tab,
  onScrollToPage,
  onFitWidth,
  onFitPage,
}: {
  tab: DocumentTabState | undefined;
  onScrollToPage: (pageIndex: number) => void;
  onFitWidth: () => void;
  onFitPage: () => void;
}) {
  const darkMode = usePdfStudioStore((s) => s.darkMode);
  const backgroundTasks = usePdfStudioStore((s) => s.backgroundTasks);
  const setZoom = usePdfStudioStore((s) => s.setZoom);
  const setPageTheme = usePdfStudioStore((s) => s.setPageTheme);
  const setViewLayout = usePdfStudioStore((s) => s.setViewLayout);

  const [pageInput, setPageInput] = useState('1');
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);

  useEffect(() => {
    if (tab) {
      setPageInput(String(tab.currentPage + 1));
    }
  }, [tab?.currentPage, tab?.tabId]);

  useEffect(() => {
    const close = () => setZoomMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const runningTask = backgroundTasks.find((t) => t.status === 'running');
  const currentGeo = tab?.geometries[tab.currentPage];
  const paperInfo = currentGeo
    ? (() => {
        const eff = getEffectivePageSizePt(currentGeo);
        return detectPaperSizeLabel(eff.widthPt, eff.heightPt);
      })()
    : 'Pronto · Local-First';

  const cyclePageTheme = () => {
    if (!tab) return;
    const order: PageTheme[] = ['normal', 'night', 'sepia'];
    const next = order[(order.indexOf(tab.pageTheme) + 1) % order.length];
    setPageTheme(tab.tabId, next);
  };

  const cycleViewLayout = (layout: ViewLayoutMode) => {
    if (!tab) return;
    setViewLayout(tab.tabId, layout);
  };

  return (
    <footer
      className={`z-30 flex h-[30px] shrink-0 select-none items-center justify-between border-t px-3 text-[11px] tabular-nums ${
        darkMode
          ? 'border-[#334155] bg-[#1E2430] text-slate-300'
          : 'border-[#E2E8F0] bg-[#F8FAFC] text-slate-600'
      }`}
    >
      {/* Esquerda: Dimensões Físicas da Página + Indicador de Tarefas em Segundo Plano */}
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate">{paperInfo}</span>
        {runningTask && (
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
            <span className="max-w-[240px] truncate">
              {runningTask.detail ?? runningTask.label} ({Math.round(runningTask.progress)}%)
            </span>
          </div>
        )}
      </div>

      {/* Centro: Navegação de Página Editável */}
      {tab && tab.geometries.length > 0 && (
        <div className="flex items-center gap-1">
          <button
            disabled={tab.currentPage <= 0}
            onClick={() => onScrollToPage(0)}
            title="Primeira página (Home)"
            className="rounded p-0.5 hover:bg-slate-500/15 disabled:opacity-30"
          >
            <ChevronsLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <button
            disabled={tab.currentPage <= 0}
            onClick={() => onScrollToPage(tab.currentPage - 1)}
            title="Página anterior (PageUp)"
            className="rounded p-0.5 hover:bg-slate-500/15 disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const parsed = parseInt(pageInput, 10);
              if (!Number.isNaN(parsed)) {
                onScrollToPage(
                  Math.max(0, Math.min(tab.geometries.length - 1, parsed - 1))
                );
              }
            }}
            className="flex items-center gap-1"
          >
            <input
              type="text"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              aria-label="Página atual"
              className={`h-5 w-10 rounded border text-center text-[11px] outline-none ${
                darkMode
                  ? 'border-[#334155] bg-[#111827] text-white'
                  : 'border-slate-300 bg-white text-slate-900'
              }`}
            />
            <span className="opacity-70">/ {tab.geometries.length}</span>
          </form>

          <button
            disabled={tab.currentPage >= tab.geometries.length - 1}
            onClick={() => onScrollToPage(tab.currentPage + 1)}
            title="Próxima página (PageDown)"
            className="rounded p-0.5 hover:bg-slate-500/15 disabled:opacity-30"
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <button
            disabled={tab.currentPage >= tab.geometries.length - 1}
            onClick={() => onScrollToPage(tab.geometries.length - 1)}
            title="Última página (End)"
            className="rounded p-0.5 hover:bg-slate-500/15 disabled:opacity-30"
          >
            <ChevronsRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* Direita: Layout de Leitura, Tema da Folha, Ajustes e Controle de Zoom */}
      {tab && tab.geometries.length > 0 ? (
        <div className="flex items-center gap-1.5">
          {/* Modos de Exibição */}
          <div className="hidden items-center gap-0.5 sm:flex">
            <button
              onClick={() => cycleViewLayout('single')}
              title="Página única"
              className={`rounded p-1 ${
                tab.viewLayout === 'single'
                  ? 'bg-[#1B2952] text-white dark:bg-[#2F4D8F]'
                  : 'hover:bg-slate-500/15'
              }`}
            >
              <File className="h-3 w-3" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => cycleViewLayout('continuous')}
              title="Rolagem contínua"
              className={`rounded p-1 ${
                tab.viewLayout === 'continuous'
                  ? 'bg-[#1B2952] text-white dark:bg-[#2F4D8F]'
                  : 'hover:bg-slate-500/15'
              }`}
            >
              <ScrollText className="h-3 w-3" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => cycleViewLayout('dual-book')}
              title="Página dupla (Modo Livro)"
              className={`rounded p-1 ${
                tab.viewLayout === 'dual-book'
                  ? 'bg-[#1B2952] text-white dark:bg-[#2F4D8F]'
                  : 'hover:bg-slate-500/15'
              }`}
            >
              <BookOpen className="h-3 w-3" strokeWidth={1.5} />
            </button>
          </div>

          <div className="hidden h-3.5 w-px bg-slate-500/20 sm:block" />

          {/* Tema Independente da Folha (Normal / Noturno / Sépia) */}
          <button
            onClick={cyclePageTheme}
            title={`Tema da página: ${
              tab.pageTheme === 'normal'
                ? 'Original'
                : tab.pageTheme === 'night'
                ? 'Noturno (Alto Contraste)'
                : 'Sépia Conforto'
            }`}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${
              tab.pageTheme !== 'normal'
                ? 'bg-[#1B2952] text-white dark:bg-[#2F4D8F]'
                : 'hover:bg-slate-500/15'
            }`}
          >
            <Contrast className="h-3 w-3" strokeWidth={1.5} />
            <span className="hidden md:inline">
              {tab.pageTheme === 'normal'
                ? 'Folha Original'
                : tab.pageTheme === 'night'
                ? 'Folha Noturna'
                : 'Folha Sépia'}
            </span>
          </button>

          <button
            onClick={onFitWidth}
            title="Ajustar à largura (Ctrl+2)"
            className="rounded p-1 hover:bg-slate-500/15"
          >
            <MoveHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={onFitPage}
            title="Ajustar à página inteira (Ctrl+1)"
            className="rounded p-1 hover:bg-slate-500/15"
          >
            <Maximize className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>

          <div className="h-3.5 w-px bg-slate-500/20" />

          {/* Controle de Zoom */}
          <button
            onClick={() => setZoom(tab.tabId, tab.zoom - 0.15)}
            title="Reduzir zoom (Ctrl+-)"
            className="rounded p-0.5 hover:bg-slate-500/15"
          >
            <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>

          <input
            type="range"
            min={0.25}
            max={4}
            step={0.05}
            value={tab.zoom}
            onChange={(e) => setZoom(tab.tabId, parseFloat(e.target.value))}
            className="hidden h-1.5 w-20 cursor-pointer accent-[#1B2952] md:block"
          />

          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setZoomMenuOpen((v) => !v);
              }}
              className="w-12 rounded px-1 py-0.5 text-center font-medium hover:bg-slate-500/15"
              title="Predefinições de zoom"
            >
              {Math.round(tab.zoom * 100)}%
            </button>
            {zoomMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className={`absolute bottom-7 right-0 z-50 w-24 rounded-md border py-1 shadow-xl ${
                  darkMode
                    ? 'border-[#334155] bg-[#1E2430] text-slate-100'
                    : 'border-slate-200 bg-white text-slate-800'
                }`}
              >
                {ZOOM_PRESETS.map((z) => (
                  <button
                    key={z}
                    onClick={() => {
                      setZoom(tab.tabId, z);
                      setZoomMenuOpen(false);
                    }}
                    className="block w-full px-3 py-1 text-right hover:bg-slate-500/10"
                  >
                    {Math.round(z * 100)}%
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setZoom(tab.tabId, tab.zoom + 0.15)}
            title="Ampliar zoom (Ctrl++)"
            className="rounded p-0.5 hover:bg-slate-500/15"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      ) : (
        <span className="opacity-60">PDFium WASM · ISO 32000</span>
      )}
    </footer>
  );
}
