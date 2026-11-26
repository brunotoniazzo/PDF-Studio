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
  Trash2,
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
import {
  CollabDivider,
  CollabToolbar,
  DirectionAwareTabs,
  FloatingPanelSurface,
  TextureButton,
  TextureSeparator,
} from './cult/CultUiPrimitives';

const WORK_MODES: Array<{
  id: WorkMode;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}> = [
  { id: 'view', label: 'Visualizar', shortLabel: 'Visualizar', icon: Eye },
  { id: 'comment', label: 'Comentar', shortLabel: 'Comentar', icon: MessageSquarePlus },
  { id: 'edit', label: 'Editar', shortLabel: 'Editar', icon: PenLine },
  { id: 'organize', label: 'Organizar', shortLabel: 'Organizar', icon: LayoutGrid },
  { id: 'forms', label: 'Formulários', shortLabel: 'Formulários', icon: FormInput },
  { id: 'protect', label: 'Proteger', shortLabel: 'Proteger', icon: Shield },
  {
    id: 'convert',
    label: 'Converter e Otimizar',
    shortLabel: 'Converter',
    icon: Sparkles,
  },
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
  const [modeSlideDir, setModeSlideDir] = useState<1 | -1>(1);

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
    tone = 'default',
  }: {
    tool?: EditorTool;
    label: string;
    shortcut?: string;
    icon: LucideIcon;
    onClick?: () => void;
    activeOverride?: boolean;
    tone?: 'default' | 'danger';
  }) => {
    const isSelected = activeOverride ?? (tool ? activeTool === tool : false);
    return (
      <button
        type="button"
        onClick={() => {
          if (onClick) onClick();
          else if (tool) setActiveTool(tool);
        }}
        title={shortcut ? `${label} (${shortcut})` : label}
        className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-[background-color,color,box-shadow,transform] duration-120 active:scale-[0.97] ${
          isSelected
            ? 'bg-neutral-900 text-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] dark:bg-neutral-100 dark:text-neutral-950'
            : tone === 'danger'
            ? 'text-red-600 hover:bg-red-500/10 dark:text-red-400'
            : 'text-neutral-700 hover:bg-neutral-200/75 dark:text-neutral-300 dark:hover:bg-[#2B2C2B]'
        }`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
        <span className="hidden xl:inline">{label}</span>
      </button>
    );
  };

  return (
    <div className="z-30 shrink-0 select-none border-b border-black/[0.08] bg-white text-neutral-800 dark:border-white/[0.08] dark:bg-[#1C1D1C] dark:text-neutral-100">
      {/* NÍVEL 1 — Barra Principal Tátil (46 px) */}
      <div className="flex h-[46px] items-center justify-between gap-2 px-3">
        {/* Esquerda: Menu do Aplicativo + Salvar + Undo / Redo */}
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <TextureButton
              variant="minimal"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setAppMenuOpen((v) => !v);
                setExportMenuOpen(false);
              }}
              title="Menu do Aplicativo"
            >
              <Menu className="h-3.5 w-3.5" strokeWidth={1.6} />
              <span className="hidden md:inline">Arquivo</span>
            </TextureButton>

            {appMenuOpen && (
              <FloatingPanelSurface
                onClick={(e) => e.stopPropagation()}
                className="absolute left-0 top-10 z-50 w-64"
                innerClassName="py-1.5 text-xs"
              >
                <button
                  onClick={() => {
                    onOpenNewBlankModal();
                    setAppMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-[#232423]"
                >
                  <span className="flex items-center gap-2">
                    <FilePlus2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Novo PDF em branco
                  </span>
                  <span className="font-mono text-[10px] opacity-50">Ctrl+N</span>
                </button>
                <button
                  onClick={() => {
                    void openPdfFromDisk(true);
                    setAppMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-[#232423]"
                >
                  <span className="flex items-center gap-2">
                    <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Abrir PDF…
                  </span>
                  <span className="font-mono text-[10px] opacity-50">Ctrl+O</span>
                </button>
                <button
                  onClick={() => {
                    void openSampleDocument();
                    setAppMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-[#232423]"
                >
                  <Sparkles className="h-3.5 w-3.5 text-sky-500" strokeWidth={1.5} />
                  Abrir PDF Demonstrativo
                </button>
                <TextureSeparator className="my-1" />
                <button
                  disabled={!activeTab}
                  onClick={() => {
                    if (activeTab) void saveTab(activeTab.tabId, false);
                    setAppMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-[#232423]"
                >
                  <span className="flex items-center gap-2">
                    <Save className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Salvar
                  </span>
                  <span className="font-mono text-[10px] opacity-50">Ctrl+S</span>
                </button>
                <button
                  disabled={!activeTab}
                  onClick={() => {
                    if (activeTab) void saveTab(activeTab.tabId, true);
                    setAppMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-[#232423]"
                >
                  <span className="flex items-center gap-2">
                    <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Salvar como…
                  </span>
                  <span className="font-mono text-[10px] opacity-50">Ctrl+Shift+S</span>
                </button>
                <button
                  disabled={!activeTab}
                  onClick={() => {
                    if (activeTab) void printTab(activeTab.tabId);
                    setAppMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-[#232423]"
                >
                  <span className="flex items-center gap-2">
                    <Printer className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Imprimir…
                  </span>
                  <span className="font-mono text-[10px] opacity-50">Ctrl+P</span>
                </button>
                <TextureSeparator className="my-1" />
                <button
                  disabled={!activeTab}
                  onClick={() => {
                    onOpenPropertiesModal();
                    setAppMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-[#232423]"
                >
                  <span className="flex items-center gap-2">
                    <Info className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Propriedades do documento
                  </span>
                  <span className="font-mono text-[10px] opacity-50">Ctrl+D</span>
                </button>
              </FloatingPanelSurface>
            )}
          </div>

          <TextureButton
            variant="minimal"
            size="icon"
            disabled={!activeTab}
            onClick={() => activeTab && void saveTab(activeTab.tabId, false)}
            title="Salvar documento (Ctrl+S)"
          >
            <Save className="h-3.5 w-3.5" strokeWidth={1.6} />
          </TextureButton>

          <CollabDivider />

          <TextureButton
            variant="minimal"
            size="icon"
            disabled={!activeTab || activeTab.undoStack.length === 0}
            onClick={() => activeTab && void undo(activeTab.tabId)}
            title={
              lastUndoLabel
                ? `Desfazer: ${lastUndoLabel} (${activeTab?.undoStack.length}) — Ctrl+Z`
                : 'Desfazer (Ctrl+Z)'
            }
          >
            <Undo2 className="h-3.5 w-3.5" strokeWidth={1.6} />
          </TextureButton>
          <TextureButton
            variant="minimal"
            size="icon"
            disabled={!activeTab || activeTab.redoStack.length === 0}
            onClick={() => activeTab && void redo(activeTab.tabId)}
            title={
              lastRedoLabel
                ? `Refazer: ${lastRedoLabel} (${activeTab?.redoStack.length}) — Ctrl+Y`
                : 'Refazer (Ctrl+Y)'
            }
          >
            <Redo2 className="h-3.5 w-3.5" strokeWidth={1.6} />
          </TextureButton>
        </div>

        {/* Centro: Direction Aware Tabs para os 7 Modos de Trabalho */}
        <DirectionAwareTabs
          ariaLabel="Modos de trabalho"
          items={WORK_MODES.map((m) => ({
            id: m.id,
            label: m.label,
            shortLabel: m.shortLabel,
            icon: m.icon,
            title: `Modo ${m.label}`,
          }))}
          value={workMode}
          onChange={(next, dir) => {
            setModeSlideDir(dir);
            setWorkMode(next);
          }}
        />

        {/* Direita: Ferramentas Rápidas, Busca, Exportar e Inspetor */}
        <div className="flex items-center gap-1.5">
          {workMode === 'view' && activeTab && (
            <div className="mr-0.5 hidden items-center rounded-full border border-black/[0.06] bg-neutral-100 p-0.5 sm:flex dark:border-white/[0.08] dark:bg-[#111211]">
              <button
                onClick={() => setActiveTool('select')}
                title="Selecionar texto e objetos (V)"
                className={`flex h-6 w-7 items-center justify-center rounded-full transition-colors ${
                  activeTool === 'select'
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-950'
                    : 'text-neutral-600 hover:text-neutral-950 dark:text-neutral-400'
                }`}
              >
                <MousePointer className="h-3.5 w-3.5" strokeWidth={1.6} />
              </button>
              <button
                onClick={() => setActiveTool('hand')}
                title="Ferramenta Mão / Arrastar (H ou segure Espaço)"
                className={`flex h-6 w-7 items-center justify-center rounded-full transition-colors ${
                  activeTool === 'hand'
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-950'
                    : 'text-neutral-600 hover:text-neutral-950 dark:text-neutral-400'
                }`}
              >
                <Hand className="h-3.5 w-3.5" strokeWidth={1.6} />
              </button>
            </div>
          )}

          <TextureButton
            variant={activeTab?.isSearchOpen ? 'primary' : 'minimal'}
            size="icon"
            disabled={!activeTab}
            onClick={() => {
              if (!activeTab) return;
              updateTabState(activeTab.tabId, { isSearchOpen: !activeTab.isSearchOpen });
            }}
            title="Buscar no documento (Ctrl+F)"
          >
            <Search className="h-3.5 w-3.5" strokeWidth={1.6} />
          </TextureButton>

          <div className="relative">
            <TextureButton
              variant="secondary"
              size="sm"
              disabled={!activeTab}
              onClick={(e) => {
                e.stopPropagation();
                setExportMenuOpen((v) => !v);
                setAppMenuOpen(false);
              }}
              title="Exportar ou salvar cópia rápida"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={1.6} />
              <span className="hidden xl:inline">Exportar</span>
            </TextureButton>

            {exportMenuOpen && activeTab && (
              <FloatingPanelSurface
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-10 z-50 w-56"
                innerClassName="py-1.5 text-xs"
              >
                <button
                  onClick={() => {
                    void saveTab(activeTab.tabId, true);
                    setExportMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-[#232423]"
                >
                  <FileOutput className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Salvar PDF atualizado…
                </button>
                <button
                  onClick={() => {
                    void exportCurrentPageAsPng(activeTab.tabId);
                    setExportMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-[#232423]"
                >
                  <FileImage className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Exportar página atual (PNG)
                </button>
                <button
                  onClick={() => {
                    void exportDocumentAsTextOrMarkdown(activeTab.tabId, 'txt');
                    setExportMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-[#232423]"
                >
                  <FileText className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Exportar texto puro (.TXT)
                </button>
                <button
                  onClick={() => {
                    void exportDocumentAsTextOrMarkdown(activeTab.tabId, 'md');
                    setExportMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-[#232423]"
                >
                  <FileCode2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Exportar estruturado (.MD)
                </button>
              </FloatingPanelSurface>
            )}
          </div>

          <TextureButton
            variant={rightInspectorOpen ? 'primary' : 'minimal'}
            size="icon"
            onClick={() =>
              rightInspectorOpen ? closeRightInspector() : openRightInspector('auto')
            }
            title="Alternar Inspetor Direito de Propriedades"
          >
            <PanelRight className="h-3.5 w-3.5" strokeWidth={1.6} />
          </TextureButton>
        </div>
      </div>

      {/* NÍVEL 2 — CollabToolbar Contextual Tátil (44 px — Oculta no modo Visualizar!) */}
      {workMode !== 'view' && activeTabId !== 'home' && activeTab && (
        <div className="flex h-[44px] items-center overflow-x-auto border-t border-black/[0.06] bg-neutral-50/90 px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-white/[0.06] dark:bg-[#161716]">
          <CollabToolbar
            key={workMode}
            className={`w-full justify-between ${
              modeSlideDir >= 0 ? 'cult-anim-slide-right' : 'cult-anim-slide-left'
            }`}
          >
            <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {workMode === 'comment' && (
                <>
                  <ToolBtn tool="select" label="Selecionar" shortcut="V" icon={MousePointer} />
                  <CollabDivider />
                  <ToolBtn tool="highlight" label="Marca-texto" shortcut="U" icon={Highlighter} />
                  <ToolBtn tool="underline" label="Sublinhado" icon={Underline} />
                  <ToolBtn tool="strikethrough" label="Tachado" icon={Strikethrough} />
                  <CollabDivider />
                  <ToolBtn tool="sticky-note" label="Nota" shortcut="C" icon={StickyNote} />
                  <ToolBtn tool="free-text" label="Caixa de Texto" shortcut="T" icon={Type} />
                  <ToolBtn tool="rect" label="Retângulo" icon={Square} />
                  <ToolBtn tool="ellipse" label="Elipse" icon={Circle} />
                  <ToolBtn tool="arrow" label="Seta" icon={ArrowUpRight} />
                  <CollabDivider />
                  <ToolBtn tool="ink" label="Caneta Livre" shortcut="D" icon={PenTool} />
                  <ToolBtn tool="eraser" label="Borracha" icon={Eraser} />
                  <ToolBtn tool="stamp" label="Carimbo" icon={Stamp} />
                  <ToolBtn tool="measure-distance" label="Medir (mm)" icon={Ruler} />
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
                  <CollabDivider />
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
                  <CollabDivider />
                  <ToolBtn
                    label="Excluir Selecionadas"
                    icon={Trash2}
                    tone="danger"
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
                  />
                </>
              )}

              {workMode === 'forms' && (
                <>
                  <ToolBtn tool="form-fill" label="Preencher Campos" icon={FormInput} />
                  <CollabDivider />
                  <ToolBtn tool="form-text" label="Novo Campo Texto" icon={Type} />
                  <ToolBtn tool="form-checkbox" label="Caixa de Seleção" icon={CheckSquare} />
                  <ToolBtn tool="form-signature" label="Campo Assinatura" icon={FileSignature} />
                  <CollabDivider />
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
                  <CollabDivider />
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

            {workMode === 'comment' && (
              <div className="flex shrink-0 items-center gap-1.5 pr-1.5">
                {['#FACC15', '#4ADE80', '#38BDF8', '#F87171', '#171717'].map((col) => (
                  <button
                    key={col}
                    onClick={() =>
                      updateToolStyle({ highlightColor: col, strokeColor: col })
                    }
                    title={`Cor ${col}`}
                    style={{ backgroundColor: col }}
                    className={`h-4 w-4 rounded-full border transition-transform ${
                      toolStyle.highlightColor === col
                        ? 'scale-110 ring-2 ring-[#1A94FF] ring-offset-1 ring-offset-white dark:ring-offset-[#1E1F1E]'
                        : 'border-black/20 opacity-85 hover:opacity-100 dark:border-white/25'
                    }`}
                  />
                ))}
              </div>
            )}
          </CollabToolbar>
        </div>
      )}
    </div>
  );
}
