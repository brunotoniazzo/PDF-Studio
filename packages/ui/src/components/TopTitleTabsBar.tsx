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
  Square,
  Sun,
  X,
} from 'lucide-react';
import { usePdfStudioStore } from '@pdf-studio/editor-core';
import { usePlatformActions } from '../context/PlatformContext';

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
      className={`relative z-40 flex h-[38px] shrink-0 select-none items-center border-b px-1.5 ${
        darkMode
          ? 'border-[#334155] bg-[#1E2430] text-slate-200'
          : 'border-[#E2E8F0] bg-[#F8FAFC] text-slate-700'
      }`}
      style={dragStyle}
    >
      {/* Identidade do aplicativo (arrastável como parte da barra de título) */}
      <div className="flex h-full shrink-0 items-center gap-1.5 px-2 text-xs font-bold tracking-tight text-[#1B2952] dark:text-blue-400">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-[#1B2952] text-[10px] font-extrabold text-white">
          PDF
        </div>
        <span className="hidden sm:inline">Studio</span>
      </div>

      {/* Faixa de abas: ocupa apenas o espaço das abas abertas e rola quando necessário */}
      <div
        data-testid="titlebar-tabs-strip"
        onWheel={(e) => {
          if (e.deltaY !== 0) {
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
        className="flex h-full min-w-0 shrink items-end gap-0.5 overflow-x-auto pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={noDragStyle}
      >
        {/* Aba Fixa Início */}
        <button
          onClick={() => setActiveTab('home')}
          title="Tela Inicial — Documentos Recentes e Ações Rápidas"
          className={`flex h-[31px] shrink-0 items-center gap-1.5 rounded-t-md border-x border-t px-3 text-xs font-medium transition ${
            activeTabId === 'home'
              ? darkMode
                ? 'border-[#334155] bg-[#262E3D] text-white shadow-sm'
                : 'border-[#E2E8F0] bg-white text-[#1B2952] shadow-sm'
              : darkMode
              ? 'border-transparent text-slate-400 hover:bg-[#262E3D]/60 hover:text-slate-200'
              : 'border-transparent text-slate-500 hover:bg-slate-200/60 hover:text-slate-800'
          }`}
        >
          <Home className="h-3.5 w-3.5" strokeWidth={1.5} />
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
              className={`group relative flex h-[31px] min-w-[120px] max-w-[215px] cursor-pointer items-center justify-between gap-1.5 rounded-t-md border-x border-t px-2.5 text-xs transition ${
                isActive
                  ? darkMode
                    ? 'border-[#334155] border-t-2 border-t-[#60A5FA] bg-[#262E3D] font-medium text-white'
                    : 'border-[#E2E8F0] border-t-2 border-t-[#1B2952] bg-white font-medium text-[#1B2952]'
                  : darkMode
                  ? 'border-transparent text-slate-400 hover:bg-[#262E3D]/50 hover:text-slate-200'
                  : 'border-transparent text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
              }`}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 shrink-0 opacity-75" strokeWidth={1.5} />
                <span className="truncate">{tab.fileName}</span>
                {tab.metadata?.isEncrypted && (
                  <Lock className="h-3 w-3 shrink-0 text-amber-500" strokeWidth={1.5} />
                )}
                {tab.signatures.length > 0 && (
                  <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-500" strokeWidth={1.5} />
                )}
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  requestCloseTab(tab.tabId);
                }}
                title={`Fechar aba (${closeShortcutHint})`}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-slate-500/20"
              >
                {tab.isDirty ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-[#1B2952] group-hover:hidden dark:bg-[#60A5FA]" />
                    <X className="hidden h-3 w-3 group-hover:block" strokeWidth={1.5} />
                  </>
                ) : (
                  <X
                    className={`h-3 w-3 ${
                      isActive ? 'opacity-80' : 'opacity-0 group-hover:opacity-80'
                    }`}
                    strokeWidth={1.5}
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
        className="mb-1 ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center self-end rounded hover:bg-slate-500/15"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>

      {/* Área livre arrastável da janela no Desktop (expande por todo espaço vazio) */}
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
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-slate-500/15"
            >
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
            {overflowOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className={`absolute right-0 top-8 z-50 w-64 rounded-lg border p-2 shadow-xl ${
                  darkMode
                    ? 'border-[#334155] bg-[#1E2430] text-slate-100'
                    : 'border-slate-200 bg-white text-slate-800'
                }`}
              >
                <input
                  type="text"
                  value={overflowSearch}
                  onChange={(e) => setOverflowSearch(e.target.value)}
                  placeholder="Filtrar abas abertas..."
                  className={`mb-1.5 h-7 w-full rounded border px-2 text-xs outline-none ${
                    darkMode
                      ? 'border-[#334155] bg-[#111827]'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                />
                <div className="max-h-56 overflow-y-auto">
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
                        className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs ${
                          activeTabId === t.tabId
                            ? 'bg-[#1B2952] text-white'
                            : 'hover:bg-slate-500/10'
                        }`}
                      >
                        <span className="truncate">{t.fileName}</span>
                        {t.isDirty && (
                          <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                        )}
                      </button>
                    ))}
                </div>
              </div>
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
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-slate-500/15"
        >
          {darkMode ? (
            <Sun className="h-3.5 w-3.5 text-amber-400" strokeWidth={1.5} />
          ) : (
            <Moon className="h-3.5 w-3.5" strokeWidth={1.5} />
          )}
        </button>

        {/* Controles Nativos do Windows 11 (exibidos somente no Desktop Shell) */}
        {isDesktop && (
          <div className="ml-1 flex h-full items-center">
            <button
              onClick={() => void platform.windowControls.minimize()}
              title="Minimizar"
              className="flex h-full w-10 items-center justify-center hover:bg-slate-500/15"
            >
              <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={async () => {
                const max = await platform.windowControls.toggleMaximize();
                setIsMaximized(max);
              }}
              title={isMaximized ? 'Restaurar tamanho' : 'Maximizar'}
              className="flex h-full w-10 items-center justify-center hover:bg-slate-500/15"
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
              className="flex h-full w-11 items-center justify-center hover:bg-red-600 hover:text-white"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>

      {/* Menu de Contexto da Aba */}
      {contextMenu && contextTab && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ left: contextMenu.x, top: contextMenu.y, ...noDragStyle }}
          className={`fixed z-50 w-56 rounded-lg border py-1 text-xs shadow-xl ${
            darkMode
              ? 'border-[#334155] bg-[#1E2430] text-slate-100'
              : 'border-slate-200 bg-white text-slate-800'
          }`}
        >
          <button
            onClick={() => {
              requestCloseTab(contextTab.tabId);
              setContextMenu(null);
            }}
            className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-slate-500/10"
          >
            <span>Fechar aba</span>
            <span className="opacity-50">{closeShortcutHint}</span>
          </button>
          <button
            onClick={() => {
              void closeOtherTabs(contextTab.tabId);
              setContextMenu(null);
            }}
            className="flex w-full items-center px-3 py-1.5 hover:bg-slate-500/10"
          >
            Fechar outras abas
          </button>
          <button
            onClick={() => {
              void closeTabsToRight(contextTab.tabId);
              setContextMenu(null);
            }}
            className="flex w-full items-center px-3 py-1.5 hover:bg-slate-500/10"
          >
            Fechar abas à direita
          </button>
          <div className="my-1 border-t border-slate-500/20" />
          <button
            onClick={() => {
              toggleSplitView(contextTab.tabId);
              setActiveTab(contextTab.tabId);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-500/10"
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
              className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-500/10"
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
            className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-500/10"
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span>Copiar caminho/nome</span>
          </button>
        </div>
      )}
    </header>
  );
}
