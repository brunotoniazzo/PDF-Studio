import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  Columns2,
  Copy,
  FileText,
  FolderOpen,
  Home,
  Lock,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  Plus,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { usePdfStudioStore } from '@pdf-studio/editor-core';
import { usePlatformActions } from '../context/PlatformContext';
import {
  CultBrandMark,
  FloatingPanelSurface,
  HaloInput,
  NeumorphEyebrow,
  TextureSeparator,
} from './cult/CultUiPrimitives';

export function TopTitleTabsBar() {
  const { platform, openPdfFromDisk } = usePlatformActions();
  const darkMode = usePdfStudioStore((s) => s.darkMode);
  const toggleDarkMode = usePdfStudioStore((s) => s.toggleDarkMode);
  const activeTabId = usePdfStudioStore((s) => s.activeTabId);
  const tabs = usePdfStudioStore((s) => s.tabs);
  const setActiveTab = usePdfStudioStore((s) => s.setActiveTab);
  const requestCloseTab = usePdfStudioStore((s) => s.requestCloseTab);
  const closeOtherTabs = usePdfStudioStore((s) => s.closeOtherTabs);
  const closeTabsToRight = usePdfStudioStore((s) => s.closeTabsToRight);
  const reorderTabs = usePdfStudioStore((s) => s.reorderTabs);
  const toggleSplitView = usePdfStudioStore((s) => s.toggleSplitView);
  const showToast = usePdfStudioStore((s) => s.showToast);

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    tabId: string;
    x: number;
    y: number;
  } | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [overflowSearch, setOverflowSearch] = useState('');
  const [isMaximized, setIsMaximized] = useState(false);

  const isDesktop = platform.windowControls.isDesktop;
  const closeShortcutHint = isDesktop ? 'Ctrl+W' : 'Alt+W';
  const dragStyle = isDesktop ? ({ WebkitAppRegion: 'drag' } as React.CSSProperties) : undefined;
  const noDragStyle = isDesktop
    ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties)
    : undefined;

  useEffect(() => {
    if (!isDesktop) return;
    void platform.windowControls.isMaximized().then(setIsMaximized).catch(() => {});
    return platform.windowControls.onMaximizedChange?.(setIsMaximized);
  }, [isDesktop, platform.windowControls]);

  useEffect(() => {
    const closeMenus = () => {
      setContextMenu(null);
      setOverflowOpen(false);
    };
    window.addEventListener('click', closeMenus);
    return () => window.removeEventListener('click', closeMenus);
  }, []);

  const contextTab = tabs.find((t) => t.tabId === contextMenu?.tabId);

  return (
    <header
      className="relative z-40 flex h-[40px] shrink-0 select-none items-center border-b border-black/[0.08] bg-[#F4F4F5] px-2 text-neutral-700 dark:border-white/[0.08] dark:bg-[#111211] dark:text-neutral-200"
      style={dragStyle}
    >
      {/* Identidade Cult UI do aplicativo */}
      <div className="flex h-full shrink-0 items-center gap-2 pl-1 pr-2.5">
        <CultBrandMark />
        <div className="hidden items-center gap-1.5 sm:flex">
          <span className="text-xs font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            PDF Studio
          </span>
          <NeumorphEyebrow tone="crimson">BETA</NeumorphEyebrow>
        </div>
      </div>

      {/* Faixa de abas: compacta até o limite do conteúdo, mantendo região arrastável livre */}
      <div
        data-testid="titlebar-tabs-strip"
        onWheel={(e) => {
          if (e.deltaY !== 0) {
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
        className="flex h-full min-w-0 shrink items-end gap-1 overflow-x-auto pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={noDragStyle}
      >
        {/* Aba Fixa Início */}
        <button
          onClick={() => setActiveTab('home')}
          title="Tela Inicial — Documentos Recentes e Ações Rápidas"
          className={`flex h-[32px] shrink-0 items-center gap-1.5 rounded-t-[10px] border-x border-t px-3 text-xs font-medium transition-[background-color,color,box-shadow,border-color] duration-150 ${
            activeTabId === 'home'
              ? 'border-black/[0.08] bg-white text-neutral-950 shadow-[0_1px_0_#ffffff_inset] dark:border-white/[0.09] dark:bg-[#1C1D1C] dark:text-white dark:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]'
              : 'border-transparent text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-[#1E1F1E]/70 dark:hover:text-neutral-100'
          }`}
        >
          <Home className="h-3.5 w-3.5" strokeWidth={1.6} />
          <span>Início</span>
        </button>

        {/* Abas dos PDFs Abertos */}
        {tabs.map((tab, idx) => {
          const isActive = activeTabId === tab.tabId;
          const tooltip = tab.filePath ? `${tab.fileName}\n${tab.filePath}` : tab.fileName;

          return (
            <div
              key={tab.tabId}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIdx !== null && dragIdx !== idx) {
                  reorderTabs(dragIdx, idx);
                }
                setDragIdx(null);
              }}
              onClick={() => setActiveTab(tab.tabId)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  requestCloseTab(tab.tabId);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ tabId: tab.tabId, x: e.clientX, y: e.clientY });
              }}
              title={tooltip}
              className={`group relative flex h-[32px] min-w-[126px] max-w-[220px] cursor-pointer items-center justify-between gap-1.5 rounded-t-[10px] border-x border-t px-2.5 text-xs transition-[background-color,color,box-shadow,border-color] duration-150 ${
                isActive
                  ? 'border-black/[0.08] bg-white font-medium text-neutral-950 shadow-[0_1px_0_#ffffff_inset] dark:border-white/[0.09] dark:bg-[#1C1D1C] dark:text-white dark:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]'
                  : 'border-transparent text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-[#1E1F1E]/70 dark:hover:text-neutral-100'
              }`}
            >
              {isActive && (
                <span className="pointer-events-none absolute inset-x-3 top-0 h-[2px] rounded-b-full bg-neutral-900 dark:bg-neutral-100" />
              )}

              <div className="flex min-w-0 items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 shrink-0 opacity-75" strokeWidth={1.6} />
                <span className="truncate">{tab.fileName}</span>
                {tab.metadata?.isEncrypted && (
                  <Lock className="h-3 w-3 shrink-0 text-amber-500" strokeWidth={1.6} />
                )}
                {tab.signatures.length > 0 && (
                  <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-500" strokeWidth={1.6} />
                )}
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  requestCloseTab(tab.tabId);
                }}
                title={`Fechar aba (${closeShortcutHint})`}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-neutral-500/20"
              >
                {tab.isDirty ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-red-600 group-hover:hidden dark:bg-red-400" />
                    <X className="hidden h-3 w-3 group-hover:block" strokeWidth={1.6} />
                  </>
                ) : (
                  <X
                    className={`h-3 w-3 ${
                      isActive ? 'opacity-80' : 'opacity-0 group-hover:opacity-80'
                    }`}
                    strokeWidth={1.6}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Botão Nova Aba / Abrir PDF */}
      <button
        onClick={() => void openPdfFromDisk(true)}
        title="Abrir novo PDF em aba (Ctrl+O)"
        style={noDragStyle}
        className="mb-1 ml-1 flex h-6 w-6 shrink-0 items-center justify-center self-end rounded-full border border-black/10 bg-white/80 text-neutral-700 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-[background-color,transform] duration-120 hover:bg-white active:scale-95 dark:border-white/10 dark:bg-[#222322] dark:text-neutral-200 dark:hover:bg-[#2A2B2A]"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.7} />
      </button>

      {/* Área livre arrastável da janela no Desktop */}
      <div
        data-testid="titlebar-drag-region"
        style={dragStyle}
        className="h-full min-w-[56px] flex-1 shrink-0"
      />

      {/* Bloco Direito: Lista suspensa de abas, Tema da UI e Controles da Janela Windows */}
      <div className="flex h-full shrink-0 items-center gap-1" style={noDragStyle}>
        {tabs.length > 1 && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOverflowOpen((v) => !v);
              }}
              title="Listar todas as abas abertas"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-black/[0.06] bg-white/70 hover:bg-white dark:border-white/[0.08] dark:bg-[#1E1F1E] dark:hover:bg-[#282928]"
            >
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
            {overflowOpen && (
              <FloatingPanelSurface
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-9 z-50 w-64"
                innerClassName="p-2"
              >
                <HaloInput
                  type="text"
                  value={overflowSearch}
                  onChange={(e) => setOverflowSearch(e.target.value)}
                  placeholder="Filtrar abas abertas…"
                  className="mb-2 h-7"
                />
                <div className="max-h-56 space-y-0.5 overflow-y-auto">
                  {tabs
                    .filter((t) =>
                      t.fileName.toLowerCase().includes(overflowSearch.toLowerCase())
                    )
                    .map((t) => (
                      <button
                        key={t.tabId}
                        onClick={() => {
                          setActiveTab(t.tabId);
                          setOverflowOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-[7px] px-2.5 py-1.5 text-left text-xs transition-colors ${
                          activeTabId === t.tabId
                            ? 'bg-neutral-900 font-medium text-white dark:bg-neutral-100 dark:text-neutral-950'
                            : 'hover:bg-neutral-100 dark:hover:bg-[#232423]'
                        }`}
                      >
                        <span className="truncate">{t.fileName}</span>
                        {t.isDirty && (
                          <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                        )}
                      </button>
                    ))}
                </div>
              </FloatingPanelSurface>
            )}
          </div>
        )}

        <button
          onClick={toggleDarkMode}
          title={
            darkMode
              ? 'Alternar para Modo Claro da Interface'
              : 'Alternar para Modo Escuro da Interface'
          }
          className="flex h-7 w-7 items-center justify-center rounded-full border border-black/[0.06] bg-white/75 text-neutral-700 shadow-[0_1px_1px_rgba(0,0,0,0.04)] transition-[background-color,transform] duration-120 hover:bg-white active:scale-95 dark:border-white/[0.08] dark:bg-[#1E1F1E] dark:text-neutral-200 dark:hover:bg-[#282928]"
        >
          {darkMode ? (
            <Sun className="h-3.5 w-3.5 text-amber-400" strokeWidth={1.6} />
          ) : (
            <Moon className="h-3.5 w-3.5" strokeWidth={1.6} />
          )}
        </button>

        {/* Controles Nativos do Windows 11 (exibidos somente no Desktop Shell) */}
        {isDesktop && (
          <div className="ml-1 flex h-full items-center">
            <button
              onClick={() => void platform.windowControls.minimize()}
              title="Minimizar"
              className="flex h-full w-10 items-center justify-center rounded-md transition-colors hover:bg-neutral-500/15"
            >
              <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={async () => {
                const max = await platform.windowControls.toggleMaximize();
                setIsMaximized(max);
              }}
              title={isMaximized ? 'Restaurar tamanho' : 'Maximizar'}
              className="flex h-full w-10 items-center justify-center rounded-md transition-colors hover:bg-neutral-500/15"
            >
              {isMaximized ? (
                <Minimize2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              )}
            </button>
            <button
              onClick={() => void platform.windowControls.close()}
              title="Fechar aplicativo"
              className="flex h-full w-11 items-center justify-center rounded-md transition-colors hover:bg-red-600 hover:text-white"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>

      {/* Menu de Contexto da Aba */}
      {contextMenu && contextTab && (
        <FloatingPanelSurface
          onClick={(e) => e.stopPropagation()}
          style={{ left: contextMenu.x, top: contextMenu.y, ...noDragStyle }}
          className="fixed z-50 w-60"
          innerClassName="py-1 text-xs"
        >
          <button
            onClick={() => {
              requestCloseTab(contextTab.tabId);
              setContextMenu(null);
            }}
            className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-[#232423]"
          >
            <span>Fechar aba</span>
            <span className="font-mono text-[10px] opacity-55">{closeShortcutHint}</span>
          </button>
          <button
            onClick={() => {
              void closeOtherTabs(contextTab.tabId);
              setContextMenu(null);
            }}
            className="flex w-full items-center px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-[#232423]"
          >
            Fechar outras abas
          </button>
          <button
            onClick={() => {
              void closeTabsToRight(contextTab.tabId);
              setContextMenu(null);
            }}
            className="flex w-full items-center px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-[#232423]"
          >
            Fechar abas à direita
          </button>
          <TextureSeparator className="my-1" />
          <button
            onClick={() => {
              toggleSplitView(contextTab.tabId);
              setActiveTab(contextTab.tabId);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-[#232423]"
          >
            <Columns2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span>
              {contextTab.splitView
                ? 'Desativar visualização dividida'
                : 'Duplicar em visualização dividida'}
            </span>
          </button>
          {contextTab.filePath && platform.fileSystem.revealInExplorer && (
            <button
              onClick={() => {
                void platform.fileSystem.revealInExplorer!(contextTab.filePath!);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-[#232423]"
            >
              <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Abrir local no Explorer</span>
            </button>
          )}
          <button
            onClick={() => {
              void navigator.clipboard.writeText(contextTab.filePath ?? contextTab.fileName);
              showToast('Caminho/nome copiado para a área de transferência.', 'info');
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-[#232423]"
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span>Copiar caminho/nome</span>
          </button>
        </FloatingPanelSurface>
      )}
    </header>
  );
}
