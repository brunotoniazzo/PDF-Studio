import React, { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  CheckSquare,
  Circle,
  Crop,
  Download,
  Droplets,
  Eraser,
  Eye,
  FileCode2,
  FileImage,
  FileInput,
  FileOutput,
  FilePlus2,
  Files,
  FileSignature,
  FileText,
  FolderOpen,
  FormInput,
  Hand,
  Hash,
  Highlighter,
  ImagePlus,
  Info,
  LayoutGrid,
  Link2,
  type LucideIcon,
  Menu,
  MessageSquarePlus,
  Minimize2,
  MousePointer,
  PanelRight,
  PenLine,
  PenTool,
  Printer,
  Redo2,
  RotateCw,
  Ruler,
  Save,
  ScanText,
  Scissors,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  Square,
  Stamp,
  StickyNote,
  Strikethrough,
  Type,
  Underline,
  Undo2,
} from 'lucide-react';
import type { EditorTool, WorkMode } from '@pdf-studio/platform-contracts';
import {
  cropPdfPages,
  deletePdfPages,
  duplicatePdfPage,
  insertBlankPageAt,
  rotatePdfPages,
} from '@pdf-studio/pdf-engine';
import { usePdfStudioStore } from '@pdf-studio/editor-core';
import { usePlatformActions } from '../context/PlatformContext';

const WORK_MODES: Array<{
  id: WorkMode;
  label: string;
  icon: LucideIcon;
}> = [
  { id: 'view', label: 'Visualizar', icon: Eye },
  { id: 'comment', label: 'Comentar', icon: MessageSquarePlus },
  { id: 'edit', label: 'Editar', icon: PenLine },
  { id: 'organize', label: 'Organizar', icon: LayoutGrid },
  { id: 'forms', label: 'Formulários', icon: FormInput },
  { id: 'protect', label: 'Proteger', icon: Shield },
  { id: 'convert', label: 'Converter e Otimizar', icon: Sparkles },
];

export function ContextualToolbar({
  onOpenNewBlankModal,
  onOpenSplitModal,
  onOpenPropertiesModal,
}: {
  onOpenNewBlankModal: () => void;
  onOpenSplitModal: () => void;
  onOpenPropertiesModal: () => void;
}) {
  const {
    openPdfFromDisk,
    openSampleDocument,
    saveTab,
    printTab,
    applyStructuralMutation,
    mergeExternalPdfsFlow,
    convertImagesToPdfFlow,
    exportCurrentPageAsPng,
    exportDocumentAsTextOrMarkdown,
    buildMergedPdfBytesForTab,
  } = usePlatformActions();

  const darkMode = usePdfStudioStore((s) => s.darkMode);
  const workMode = usePdfStudioStore((s) => s.workMode);
  const activeTool = usePdfStudioStore((s) => s.activeTool);
  const toolStyle = usePdfStudioStore((s) => s.toolStyle);
  const activeTabId = usePdfStudioStore((s) => s.activeTabId);
  const tabs = usePdfStudioStore((s) => s.tabs);
  const rightInspectorOpen = usePdfStudioStore((s) => s.rightInspectorOpen);

  const setWorkMode = usePdfStudioStore((s) => s.setWorkMode);
  const setActiveTool = usePdfStudioStore((s) => s.setActiveTool);
  const updateToolStyle = usePdfStudioStore((s) => s.updateToolStyle);
  const openRightInspector = usePdfStudioStore((s) => s.openRightInspector);
  const closeRightInspector = usePdfStudioStore((s) => s.closeRightInspector);
  const updateTabState = usePdfStudioStore((s) => s.updateTabState);
  const undo = usePdfStudioStore((s) => s.undo);
  const redo = usePdfStudioStore((s) => s.redo);
  const showToast = usePdfStudioStore((s) => s.showToast);

  const activeTab = tabs.find((t) => t.tabId === activeTabId);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  useEffect(() => {
    const close = () => {
      setAppMenuOpen(false);
      setExportMenuOpen(false);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const lastUndoLabel =
    activeTab && activeTab.undoStack.length > 0
      ? activeTab.undoStack[activeTab.undoStack.length - 1].label
      : null;
  const lastRedoLabel =
    activeTab && activeTab.redoStack.length > 0
      ? activeTab.redoStack[activeTab.redoStack.length - 1].label
      : null;

  const ToolBtn = ({
    tool,
    label,
    shortcut,
    icon: Icon,
    onClick,
    activeOverride,
  }: {
    tool?: EditorTool;
    label: string;
    shortcut?: string;
    icon: LucideIcon;
    onClick?: () => void;
    activeOverride?: boolean;
  }) => {
    const isSelected = activeOverride ?? (tool ? activeTool === tool : false);
    return (
      <button
        onClick={() => {
          if (onClick) onClick();
          else if (tool) setActiveTool(tool);
        }}
        title={shortcut ? `${label} (${shortcut})` : label}
        className={`inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition ${
          isSelected
            ? 'bg-[#1B2952] text-white dark:bg-[#2F4D8F]'
            : darkMode
            ? 'text-slate-200 hover:bg-[#334155]'
            : 'text-slate-700 hover:bg-slate-200/70'
        }`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
        <span className="hidden xl:inline">{label}</span>
      </button>
    );
  };

  return (
    <div
      className={`z-30 shrink-0 select-none border-b ${
        darkMode
          ? 'border-[#334155] bg-[#1E2430] text-slate-100'
          : 'border-[#E2E8F0] bg-white text-slate-800'
      }`}
    >
      {/* NÍVEL 1 — Barra Principal Fixa (44 px) */}
      <div className="flex h-[44px] items-center justify-between gap-2 px-2.5">
        {/* Esquerda: Menu do Aplicativo + Salvar + Undo / Redo */}
        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setAppMenuOpen((v) => !v);
              }}
              title="Menu do Aplicativo"
              className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium hover:bg-slate-500/15"
            >
              <Menu className="h-4 w-4" strokeWidth={1.5} />
              <span className="hidden md:inline">Arquivo</span>
            </button>

            {appMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className={`absolute left-0 top-9 z-50 w-60 rounded-lg border py-1.5 text-xs shadow-xl ${
                  darkMode
                    ? 'border-[#334155] bg-[#1E2430] text-slate-100'
                    : 'border-slate-200 bg-white text-slate-800'
                }`}
              >
                <button
                  onClick={() => {
                    onOpenNewBlankModal();
                    setAppMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-slate-500/10"
                >
                  <span className="flex items-center gap-2">
                    <FilePlus2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Novo PDF em branco
                  </span>
                  <span className="opacity-50">Ctrl+N</span>
                </button>
                <button
                  onClick={() => {
                    void openPdfFromDisk(true);
                    setAppMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-slate-500/10"
                >
                  <span className="flex items-center gap-2">
                    <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Abrir PDF...
                  </span>
                  <span className="opacity-50">Ctrl+O</span>
                </button>
                <button
                  onClick={() => {
                    void openSampleDocument();
                    setAppMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-500/10"
                >
                  <Sparkles className="h-3.5 w-3.5 text-blue-500" strokeWidth={1.5} />
                  Abrir PDF Demonstrativo
                </button>
                <div className="my-1 border-t border-slate-500/20" />
                <button
                  disabled={!activeTab}
                  onClick={() => {
                    if (activeTab) void saveTab(activeTab.tabId, false);
                    setAppMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-slate-500/10 disabled:opacity-40"
                >
                  <span className="flex items-center gap-2">
                    <Save className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Salvar
                  </span>
                  <span className="opacity-50">Ctrl+S</span>
                </button>
                <button
                  disabled={!activeTab}
                  onClick={() => {
                    if (activeTab) void saveTab(activeTab.tabId, true);
                    setAppMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-slate-500/10 disabled:opacity-40"
                >
                  <span className="flex items-center gap-2">
                    <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Salvar como...
                  </span>
                  <span className="opacity-50">Ctrl+Shift+S</span>
                </button>
                <button
                  disabled={!activeTab}
                  onClick={() => {
                    if (activeTab) void printTab(activeTab.tabId);
                    setAppMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-slate-500/10 disabled:opacity-40"
                >
                  <span className="flex items-center gap-2">
                    <Printer className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Imprimir...
                  </span>
                  <span className="opacity-50">Ctrl+P</span>
                </button>
                <div className="my-1 border-t border-slate-500/20" />
                <button
                  disabled={!activeTab}
                  onClick={() => {
                    onOpenPropertiesModal();
                    setAppMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-slate-500/10 disabled:opacity-40"
                >
                  <span className="flex items-center gap-2">
                    <Info className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Propriedades do documento
                  </span>
                  <span className="opacity-50">Ctrl+D</span>
                </button>
              </div>
            )}
          </div>

          <button
            disabled={!activeTab}
            onClick={() => activeTab && void saveTab(activeTab.tabId, false)}
            title="Salvar documento (Ctrl+S)"
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-500/15 disabled:opacity-35"
          >
            <Save className="h-4 w-4" strokeWidth={1.5} />
          </button>

          <div className="mx-0.5 h-5 w-px bg-slate-500/20" />

          <button
            disabled={!activeTab || activeTab.undoStack.length === 0}
            onClick={() => activeTab && void undo(activeTab.tabId)}
            title={
              lastUndoLabel
                ? `Desfazer: ${lastUndoLabel} (${activeTab?.undoStack.length}) — Ctrl+Z`
                : 'Desfazer (Ctrl+Z)'
            }
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-500/15 disabled:opacity-35"
          >
            <Undo2 className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            disabled={!activeTab || activeTab.redoStack.length === 0}
            onClick={() => activeTab && void redo(activeTab.tabId)}
            title={
              lastRedoLabel
                ? `Refazer: ${lastRedoLabel} (${activeTab?.redoStack.length}) — Ctrl+Y`
                : 'Refazer (Ctrl+Y)'
            }
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-500/15 disabled:opacity-35"
          >
            <Redo2 className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Centro: Alternador de 7 Modos de Trabalho */}
        <nav
          aria-label="Modos de trabalho"
          className={`flex items-center gap-0.5 rounded-lg p-1 ${
            darkMode ? 'bg-[#111827]' : 'bg-slate-100'
          }`}
        >
          {WORK_MODES.map((m) => {
            const Icon = m.icon;
            const isSelected = workMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setWorkMode(m.id)}
                title={`Modo ${m.label}`}
                className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition ${
                  isSelected
                    ? 'bg-[#1B2952] text-white shadow-sm dark:bg-[#2F4D8F]'
                    : darkMode
                    ? 'text-slate-300 hover:bg-[#1E2430]'
                    : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                <span className="hidden lg:inline">{m.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Direita: Ferramentas Rápidas de Visualização, Busca, Exportar e Inspetor */}
        <div className="flex items-center gap-1">
          {workMode === 'view' && activeTab && (
            <div className="mr-1 hidden items-center gap-0.5 sm:flex">
              <button
                onClick={() => setActiveTool('select')}
                title="Selecionar texto e objetos (V)"
                className={`flex h-8 w-8 items-center justify-center rounded-md ${
                  activeTool === 'select'
                    ? 'bg-[#1B2952] text-white dark:bg-[#2F4D8F]'
                    : 'hover:bg-slate-500/15'
                }`}
              >
                <MousePointer className="h-4 w-4" strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setActiveTool('hand')}
                title="Ferramenta Mão / Arrastar (H ou segure Espaço)"
                className={`flex h-8 w-8 items-center justify-center rounded-md ${
                  activeTool === 'hand'
                    ? 'bg-[#1B2952] text-white dark:bg-[#2F4D8F]'
                    : 'hover:bg-slate-500/15'
                }`}
              >
                <Hand className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
          )}

          <button
            disabled={!activeTab}
            onClick={() => {
              if (!activeTab) return;
              updateTabState(activeTab.tabId, { isSearchOpen: !activeTab.isSearchOpen });
            }}
            title="Buscar no documento (Ctrl+F)"
            className={`flex h-8 w-8 items-center justify-center rounded-md disabled:opacity-35 ${
              activeTab?.isSearchOpen
                ? 'bg-[#1B2952] text-white dark:bg-[#2F4D8F]'
                : 'hover:bg-slate-500/15'
            }`}
          >
            <Search className="h-4 w-4" strokeWidth={1.5} />
          </button>

          <div className="relative">
            <button
              disabled={!activeTab}
              onClick={(e) => {
                e.stopPropagation();
                setExportMenuOpen((v) => !v);
              }}
              title="Exportar ou salvar cópia rápida"
              className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium hover:bg-slate-500/15 disabled:opacity-35"
            >
              <Download className="h-4 w-4" strokeWidth={1.5} />
              <span className="hidden xl:inline">Exportar</span>
            </button>

            {exportMenuOpen && activeTab && (
              <div
                onClick={(e) => e.stopPropagation()}
                className={`absolute right-0 top-9 z-50 w-56 rounded-lg border py-1.5 text-xs shadow-xl ${
                  darkMode
                    ? 'border-[#334155] bg-[#1E2430] text-slate-100'
                    : 'border-slate-200 bg-white text-slate-800'
                }`}
              >
                <button
                  onClick={() => {
                    void saveTab(activeTab.tabId, true);
                    setExportMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-500/10"
                >
                  <FileOutput className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Salvar PDF atualizado...
                </button>
                <button
                  onClick={() => {
                    void exportCurrentPageAsPng(activeTab.tabId);
                    setExportMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-500/10"
                >
                  <FileImage className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Exportar página atual (PNG)
                </button>
                <button
                  onClick={() => {
                    void exportDocumentAsTextOrMarkdown(activeTab.tabId, 'txt');
                    setExportMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-500/10"
                >
                  <FileText className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Exportar texto puro (.TXT)
                </button>
                <button
                  onClick={() => {
                    void exportDocumentAsTextOrMarkdown(activeTab.tabId, 'md');
                    setExportMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-500/10"
                >
                  <FileCode2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Exportar estruturado (.MD)
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() =>
              rightInspectorOpen ? closeRightInspector() : openRightInspector('auto')
            }
            title="Alternar Inspetor Direito de Propriedades"
            className={`flex h-8 w-8 items-center justify-center rounded-md ${
              rightInspectorOpen
                ? 'bg-[#1B2952] text-white dark:bg-[#2F4D8F]'
                : 'hover:bg-slate-500/15'
            }`}
          >
            <PanelRight className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* NÍVEL 2 — Sub-barra Contextual (40 px — Oculta no modo Visualizar!) */}
      {workMode !== 'view' && activeTabId !== 'home' && activeTab && (
        <div
          className={`flex h-[40px] items-center gap-1.5 overflow-x-auto border-t px-3 ${
            darkMode
              ? 'border-[#334155] bg-[#262E3D]'
              : 'border-[#E2E8F0] bg-[#F8FAFC]'
          }`}
        >
          {workMode === 'comment' && (
            <>
              <ToolBtn tool="select" label="Selecionar" shortcut="V" icon={MousePointer} />
              <div className="h-4 w-px bg-slate-500/20" />
              <ToolBtn tool="highlight" label="Marca-texto" shortcut="U" icon={Highlighter} />
              <ToolBtn tool="underline" label="Sublinhado" icon={Underline} />
              <ToolBtn tool="strikethrough" label="Tachado" icon={Strikethrough} />
              <div className="h-4 w-px bg-slate-500/20" />
              <ToolBtn tool="sticky-note" label="Nota" shortcut="C" icon={StickyNote} />
              <ToolBtn tool="free-text" label="Caixa de Texto" shortcut="T" icon={Type} />
              <ToolBtn tool="rect" label="Retângulo" icon={Square} />
              <ToolBtn tool="ellipse" label="Elipse" icon={Circle} />
              <ToolBtn tool="arrow" label="Seta" icon={ArrowUpRight} />
              <div className="h-4 w-px bg-slate-500/20" />
              <ToolBtn tool="ink" label="Caneta Livre" shortcut="D" icon={PenTool} />
              <ToolBtn tool="eraser" label="Borracha" icon={Eraser} />
              <ToolBtn tool="stamp" label="Carimbo" icon={Stamp} />
              <ToolBtn tool="measure-distance" label="Medir (mm)" icon={Ruler} />
              <div className="ml-auto flex items-center gap-1.5 pl-2">
                {['#FACC15', '#4ADE80', '#60A5FA', '#F87171', '#C084FC', '#1B2952'].map((col) => (
                  <button
                    key={col}
                    onClick={() =>
                      updateToolStyle({ highlightColor: col, strokeColor: col })
                    }
                    title={`Cor ${col}`}
                    style={{ backgroundColor: col }}
                    className={`h-4 w-4 rounded-full border ${
                      toolStyle.highlightColor === col
                        ? 'scale-110 ring-2 ring-[#1B2952] dark:ring-white'
                        : 'border-black/20 opacity-80 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </>
          )}

          {workMode === 'edit' && (
            <>
              <ToolBtn
                tool="edit-text"
                label="Editar Texto Existente"
                icon={PenLine}
              />
              <ToolBtn tool="add-text" label="Adicionar Texto" shortcut="T" icon={Type} />
              <ToolBtn tool="add-image" label="Inserir Imagem" icon={ImagePlus} />
              <ToolBtn tool="link" label="Hiperlink" icon={Link2} />
              <div className="h-4 w-px bg-slate-500/20" />
              <ToolBtn
                label="Cabeçalho e Rodapé"
                icon={FileText}
                onClick={() => openRightInspector('header-footer')}
              />
              <ToolBtn
                label="Numeração Bates"
                icon={Hash}
                onClick={() => openRightInspector('bates')}
              />
              <ToolBtn
                label="Marca d'Água"
                icon={Droplets}
                onClick={() => openRightInspector('watermark')}
              />
              <ToolBtn
                label="Recortar Margens"
                icon={Crop}
                onClick={() => {
                  void applyStructuralMutation(
                    activeTab.tabId,
                    'Recortar margens (24 pt)',
                    (bytes) =>
                      cropPdfPages(bytes, [activeTab.currentPage], {
                        top: 24,
                        right: 24,
                        bottom: 24,
                        left: 24,
                      })
                  );
                }}
              />
            </>
          )}

          {workMode === 'organize' && (
            <>
              <ToolBtn
                label="Girar 90°"
                icon={RotateCw}
                onClick={() => {
                  const targets =
                    activeTab.selectedOrganizePages.length > 0
                      ? activeTab.selectedOrganizePages
                      : [activeTab.currentPage];
                  void applyStructuralMutation(
                    activeTab.tabId,
                    'Rotacionar página(s) em 90°',
                    (b) => rotatePdfPages(b, targets, 90)
                  );
                }}
              />
              <ToolBtn
                label="Inserir em Branco"
                icon={FilePlus2}
                onClick={() => {
                  void applyStructuralMutation(
                    activeTab.tabId,
                    'Inserir página em branco',
                    (b) => insertBlankPageAt(b, activeTab.currentPage + 1)
                  );
                }}
              />
              <ToolBtn
                label="Duplicar Página"
                icon={Files}
                onClick={() => {
                  void applyStructuralMutation(
                    activeTab.tabId,
                    `Duplicar página ${activeTab.currentPage + 1}`,
                    (b) => duplicatePdfPage(b, activeTab.currentPage)
                  );
                }}
              />
              <ToolBtn
                label="Dividir / Extrair"
                icon={Scissors}
                onClick={onOpenSplitModal}
              />
              <ToolBtn
                label="Mesclar com Outro PDF"
                icon={FileInput}
                onClick={() => void mergeExternalPdfsFlow()}
              />
              <button
                onClick={() => {
                  const targets =
                    activeTab.selectedOrganizePages.length > 0
                      ? activeTab.selectedOrganizePages
                      : [activeTab.currentPage];
                  if (targets.length >= activeTab.geometries.length) {
                    showToast('O documento deve manter pelo menos 1 página.', 'warning');
                    return;
                  }
                  void applyStructuralMutation(
                    activeTab.tabId,
                    `Excluir ${targets.length} página(s)`,
                    (b) => deletePdfPages(b, targets)
                  );
                }}
                className="inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
              >
                Excluir Selecionadas
              </button>
            </>
          )}

          {workMode === 'forms' && (
            <>
              <ToolBtn tool="form-fill" label="Preencher Campos" icon={FormInput} />
              <div className="h-4 w-px bg-slate-500/20" />
              <ToolBtn tool="form-text" label="Novo Campo Texto" icon={Type} />
              <ToolBtn tool="form-checkbox" label="Caixa de Seleção" icon={CheckSquare} />
              <ToolBtn tool="form-signature" label="Campo Assinatura" icon={FileSignature} />
              <div className="h-4 w-px bg-slate-500/20" />
              <ToolBtn
                label="Exportar Dados JSON"
                icon={FileOutput}
                onClick={() => {
                  const data = Object.fromEntries(
                    activeTab.formFields.map((f) => [f.name, f.value])
                  );
                  const base = activeTab.fileName.replace(/\.pdf$/i, '');
                  const blob = new Blob([JSON.stringify(data, null, 2)], {
                    type: 'application/json',
                  });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `${base}-formulario.json`;
                  a.click();
                  showToast('Dados do formulário exportados em JSON.', 'success');
                }}
              />
              <ToolBtn
                label="Achatar Formulário (Flatten)"
                icon={Shield}
                onClick={async () => {
                  await applyStructuralMutation(
                    activeTab.tabId,
                    'Achatar campos de formulário (Flatten)',
                    async () => await buildMergedPdfBytesForTab(activeTab, { flatten: true })
                  );
                  updateTabState(activeTab.tabId, { formFields: [] });
                  showToast('Formulário achatado permanentemente nas páginas.', 'success');
                }}
              />
            </>
          )}

          {workMode === 'protect' && (
            <>
              <ToolBtn
                tool="signature-visual"
                label="Assinatura Rápida"
                icon={FileSignature}
                onClick={() => {
                  setActiveTool('signature-visual');
                  openRightInspector('signature');
                }}
              />
              <ToolBtn
                tool="redact"
                label="Marcar para Tarjamento"
                icon={ShieldAlert}
                onClick={() => {
                  setActiveTool('redact');
                  openRightInspector('redact');
                }}
              />
              <ToolBtn
                label="Sanitizar Metadados"
                icon={Shield}
                onClick={() => openRightInspector('sanitize')}
              />
              <ToolBtn
                label="Inspecionar Assinaturas ICP-Brasil"
                icon={Info}
                onClick={() => {
                  usePdfStudioStore.getState().setLeftSidebarPanel('signatures');
                }}
              />
            </>
          )}

          {workMode === 'convert' && (
            <>
              <ToolBtn
                label="OCR Pesquisável"
                icon={ScanText}
                onClick={() => openRightInspector('ocr')}
              />
              <ToolBtn
                label="Comprimir PDF"
                icon={Minimize2}
                onClick={() => openRightInspector('compress')}
              />
              <div className="h-4 w-px bg-slate-500/20" />
              <ToolBtn
                label="Imagens → PDF"
                icon={ImagePlus}
                onClick={() => void convertImagesToPdfFlow()}
              />
              <ToolBtn
                label="Exportar PNG"
                icon={FileImage}
                onClick={() => void exportCurrentPageAsPng(activeTab.tabId)}
              />
              <ToolBtn
                label="Exportar Texto (.TXT)"
                icon={FileText}
                onClick={() => void exportDocumentAsTextOrMarkdown(activeTab.tabId, 'txt')}
              />
              <ToolBtn
                label="Exportar Markdown (.MD)"
                icon={FileCode2}
                onClick={() => void exportDocumentAsTextOrMarkdown(activeTab.tabId, 'md')}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
