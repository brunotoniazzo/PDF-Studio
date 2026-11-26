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
import {
  CollabDivider,
  FloatingPanelSurface,
  HaloSegmented,
} from './cult/CultUiPrimitives';

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

  return (
    <footer className="z-30 flex h-[32px] shrink-0 select-none items-center justify-between border-t border-black/[0.08] bg-[#F4F4F5] px-3 text-[11px] tabular-nums text-neutral-600 dark:border-white/[0.08] dark:bg-[#111211] dark:text-neutral-300">
      {/* Esquerda: Dimensões Físicas + DynamicIsland-style Task Pill */}
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="truncate font-mono text-[10.5px]">{paperInfo}</span>
        {runningTask && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#161716] px-2.5 py-0.5 text-[10.5px] font-medium text-neutral-100 shadow-sm">
            <Loader2 className="h-3 w-3 animate-spin text-sky-400" strokeWidth={1.7} />
            <span className="max-w-[220px] truncate">
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
            className="rounded-full p-0.5 hover:bg-neutral-500/15 disabled:opacity-30"
          >
            <ChevronsLeft className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
          <button
            disabled={tab.currentPage <= 0}
            onClick={() => onScrollToPage(tab.currentPage - 1)}
            title="Página anterior (PageUp)"
            className="rounded-full p-0.5 hover:bg-neutral-500/15 disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.6} />
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
              className="h-5 w-10 rounded-[6px] border border-black/15 bg-white text-center font-mono text-[11px] text-neutral-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] outline-none focus:border-[#1A94FF] dark:border-white/15 dark:bg-[#1E1F1E] dark:text-neutral-100"
            />
            <span className="font-mono text-[11px] opacity-70">
              / {tab.geometries.length}
            </span>
          </form>

          <button
            disabled={tab.currentPage >= tab.geometries.length - 1}
            onClick={() => onScrollToPage(tab.currentPage + 1)}
            title="Próxima página (PageDown)"
            className="rounded-full p-0.5 hover:bg-neutral-500/15 disabled:opacity-30"
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
          <button
            disabled={tab.currentPage >= tab.geometries.length - 1}
            onClick={() => onScrollToPage(tab.geometries.length - 1)}
            title="Última página (End)"
            className="rounded-full p-0.5 hover:bg-neutral-500/15 disabled:opacity-30"
          >
            <ChevronsRight className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
        </div>
      )}

      {/* Direita: Layout de Leitura, Tema da Folha, Ajustes e Controle de Zoom */}
      {tab && tab.geometries.length > 0 ? (
        <div className="flex items-center gap-1.5">
          <div className="hidden sm:block">
            <HaloSegmented<ViewLayoutMode>
              value={tab.viewLayout === 'dual-cover' ? 'dual-book' : tab.viewLayout}
              onChange={(layout) => setViewLayout(tab.tabId, layout)}
              options={[
                {
                  id: 'single',
                  label: '',
                  title: 'Página única',
                  icon: <File className="h-3 w-3" strokeWidth={1.6} />,
                },
                {
                  id: 'continuous',
                  label: '',
                  title: 'Rolagem contínua',
                  icon: <ScrollText className="h-3 w-3" strokeWidth={1.6} />,
                },
                {
                  id: 'dual-book',
                  label: '',
                  title: 'Página dupla (Modo Livro)',
                  icon: <BookOpen className="h-3 w-3" strokeWidth={1.6} />,
                },
              ]}
            />
          </div>

          <CollabDivider />

          {/* Tema Independente da Folha */}
          <button
            onClick={cyclePageTheme}
            title={`Tema da página: ${
              tab.pageTheme === 'normal'
                ? 'Original'
                : tab.pageTheme === 'night'
                ? 'Noturno (Alto Contraste)'
                : 'Sépia Conforto'
            }`}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
              tab.pageTheme !== 'normal'
                ? 'border-black/15 bg-neutral-900 text-white dark:border-white/15 dark:bg-neutral-100 dark:text-neutral-950'
                : 'border-transparent hover:bg-neutral-500/15'
            }`}
          >
            <Contrast className="h-3 w-3" strokeWidth={1.6} />
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
            className="rounded-full p-1 hover:bg-neutral-500/15"
          >
            <MoveHorizontal className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
          <button
            onClick={onFitPage}
            title="Ajustar à página inteira (Ctrl+1)"
            className="rounded-full p-1 hover:bg-neutral-500/15"
          >
            <Maximize className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>

          <CollabDivider />

          {/* Controle de Zoom */}
          <button
            onClick={() => setZoom(tab.tabId, tab.zoom - 0.15)}
            title="Reduzir zoom (Ctrl+-)"
            className="rounded-full p-0.5 hover:bg-neutral-500/15"
          >
            <Minus className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>

          <input
            type="range"
            min={0.25}
            max={4}
            step={0.05}
            value={tab.zoom}
            onChange={(e) => setZoom(tab.tabId, parseFloat(e.target.value))}
            className="hidden h-1.5 w-20 cursor-pointer accent-neutral-900 dark:accent-neutral-100 md:block"
          />

          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setZoomMenuOpen((v) => !v);
              }}
              className="w-12 rounded-md px-1 py-0.5 text-center font-mono font-medium hover:bg-neutral-500/15"
              title="Predefinições de zoom"
            >
              {Math.round(tab.zoom * 100)}%
            </button>
            {zoomMenuOpen && (
              <FloatingPanelSurface
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-8 right-0 z-50 w-24"
                innerClassName="py-1"
              >
                {ZOOM_PRESETS.map((z) => (
                  <button
                    key={z}
                    onClick={() => {
                      setZoom(tab.tabId, z);
                      setZoomMenuOpen(false);
                    }}
                    className="block w-full px-3 py-1 text-right font-mono text-[11px] hover:bg-neutral-100 dark:hover:bg-[#232423]"
                  >
                    {Math.round(z * 100)}%
                  </button>
                ))}
              </FloatingPanelSurface>
            )}
          </div>

          <button
            onClick={() => setZoom(tab.tabId, tab.zoom + 0.15)}
            title="Ampliar zoom (Ctrl++)"
            className="rounded-full p-0.5 hover:bg-neutral-500/15"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
        </div>
      ) : (
        <span className="font-mono text-[10.5px] opacity-65">PDFium WASM · Beta</span>
      )}
    </footer>
  );
}
