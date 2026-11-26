import React, { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  Droplets,
  FileSignature,
  FileText,
  Hash,
  Italic,
  Minimize2,
  MoveHorizontal,
  ScanText,
  Shield,
  ShieldAlert,
  Trash2,
  Underline,
  X,
} from 'lucide-react';
import type {
  BatesConfig,
  CompressionConfig,
  HeaderFooterConfig,
  MetricFontFamily,
  PdfAnnotation,
  PdfRect,
  ReviewStatus,
  SavedVisualSignature,
  WatermarkConfig,
} from '@pdf-studio/platform-contracts';
import {
  applyBatesNumberingToPdf,
  applyHeaderFooterToPdf,
  applyWatermarkToPdf,
  estimatePdfCompression,
  getEffectivePageSizePt,
  optimizeAndCompressPdf,
  ptToMm,
  runSearchableOcrOnPdf,
  sanitizePdfDocument,
  sharedPdfEngine,
} from '@pdf-studio/pdf-engine';
import {
  type ActiveTextBlockDraft,
  AddAnnotationCommand,
  BinaryDocumentMutationCommand,
  DeleteAnnotationCommand,
  describeAnnotType,
  type DocumentTabState,
  UpdateAnnotationCommand,
  usePdfStudioStore,
} from '@pdf-studio/editor-core';
import { usePlatformActions } from '../context/PlatformContext';
import {
  getEffectiveRichStyle,
  getSelectedTextPreview,
  hasActiveSubstringSelection,
} from '../utils/richTextRuns';
import { autoFitDraftRect, commitTextBlockDraftToPdf } from '../utils/textBlockCommit';
import { applyPatchToDraft } from './RichTextBlockEditor';
import {
  DirectionAwareTabs,
  HaloInput,
  HaloSelect,
  MinimalCard,
  NeumorphEyebrow,
  TextureButton,
  TextureCard,
  TextureSeparator,
} from './cult/CultUiPrimitives';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}\u00A0B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}\u00A0KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}\u00A0MB`;
}

const INSPECTOR_FLOWS = [
  { id: 'auto' as const, label: 'Seleção', shortLabel: 'Seleção' },
  { id: 'watermark' as const, label: "Marca d'Água", shortLabel: "Marca d'Água" },
  { id: 'bates' as const, label: 'Bates', shortLabel: 'Bates' },
  { id: 'compress' as const, label: 'Comprimir', shortLabel: 'Comprimir' },
  { id: 'redact' as const, label: 'Tarjar', shortLabel: 'Tarjar' },
  { id: 'signature' as const, label: 'Assinar', shortLabel: 'Assinar' },
  { id: 'ocr' as const, label: 'OCR', shortLabel: 'OCR' },
];

export function RightPropertyInspector({ tab }: { tab: DocumentTabState }) {
  const { platform, applyStructuralMutation } = usePlatformActions();
  const rightInspectorOpen = usePdfStudioStore((s) => s.rightInspectorOpen);
  const rightInspectorFlow = usePdfStudioStore((s) => s.rightInspectorFlow);
  const rightInspectorWidth = usePdfStudioStore((s) => s.rightInspectorWidth);
  const closeRightInspector = usePdfStudioStore((s) => s.closeRightInspector);
  const openRightInspector = usePdfStudioStore((s) => s.openRightInspector);
  const executeCommand = usePdfStudioStore((s) => s.executeCommand);
  const upsertAnnotationDirect = usePdfStudioStore((s) => s.upsertAnnotationDirect);
  const removeAnnotationDirect = usePdfStudioStore((s) => s.removeAnnotationDirect);
  const updateTabState = usePdfStudioStore((s) => s.updateTabState);
  const upsertBackgroundTask = usePdfStudioStore((s) => s.upsertBackgroundTask);
  const removeBackgroundTask = usePdfStudioStore((s) => s.removeBackgroundTask);
  const showToast = usePdfStudioStore((s) => s.showToast);

  // Estados de Fluxos Assistidos
  const [watermark, setWatermark] = useState<WatermarkConfig>({
    text: 'CONFIDENCIAL',
    fontSizePt: 46,
    colorHex: '#171717',
    opacity: 0.18,
    angleDeg: 38,
    pageRange: 'all',
  });

  const [headerFooter, setHeaderFooter] = useState<HeaderFooterConfig>({
    headerLeft: tab.fileName.replace(/\.pdf$/i, ''),
    headerRight: '{date}',
    footerCenter: 'Página {page} de {total}',
    includePageNumbers: true,
    startNumber: 1,
    fontSizePt: 9.5,
    marginPt: 28,
    colorHex: '#334155',
  });

  const [bates, setBates] = useState<BatesConfig>({
    prefix: 'PROC-',
    suffix: '',
    startNumber: 1,
    digits: 6,
    position: 'top-right',
    fontSizePt: 10,
    colorHex: '#171717',
  });

  const [compression, setCompression] = useState<CompressionConfig>({
    qualityPreset: 'balanced',
    targetDpi: 150,
    grayscale: false,
    stripMetadata: false,
    removeUnusedObjects: true,
  });

  const [ocrLang, setOcrLang] = useState<'por' | 'eng' | 'por+eng'>('por+eng');
  const [ocrScope, setOcrScope] = useState<'current' | 'all'>('current');
  const [isRunningOcr, setIsRunningOcr] = useState(false);

  // Assinaturas visuais salvas no perfil local
  const [savedSignatures, setSavedSignatures] = useState<SavedVisualSignature[]>([]);
  const [typedSigText, setTypedSigText] = useState('');
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawingSig, setIsDrawingSig] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [flowSlideDir, setFlowSlideDir] = useState<1 | -1>(1);

  useEffect(() => {
    if (rightInspectorOpen && rightInspectorFlow === 'signature') {
      void platform.certificateStore
        .listSavedVisualSignatures()
        .then(setSavedSignatures)
        .catch(() => {});
    }
  }, [rightInspectorOpen, rightInspectorFlow, platform]);

  if (!rightInspectorOpen) return null;

  const mutator = {
    upsertAnnotation: upsertAnnotationDirect,
    removeAnnotation: removeAnnotationDirect,
  };

  const selectedAnnotation: PdfAnnotation | undefined = Object.values(tab.annotationsByPage)
    .flat()
    .find((a) => a.id === tab.selectedAnnotationId);

  const activeTextBlock =
    tab.activeTextBlockDraft?.sourceBlock ??
    Object.values(tab.editableBlocksByPage)
      .flat()
      .find((b) => b.id === tab.activeEditingBlockId);

  const updateSelectedAnnot = (patch: Partial<PdfAnnotation>, label?: string) => {
    if (!selectedAnnotation) return;
    const next: PdfAnnotation = { ...selectedAnnotation, ...patch };
    void executeCommand(
      tab.tabId,
      new UpdateAnnotationCommand(tab.tabId, selectedAnnotation, next, mutator, label)
    );
  };

  const markPatternForRedaction = async (
    patternLabel: string,
    regexSource: string
  ) => {
    const matches = await sharedPdfEngine.searchDocument({
      docId: tab.docId,
      query: regexSource,
      caseSensitive: false,
      wholeWord: false,
      useRegex: true,
    });

    if (matches.length === 0) {
      showToast(`Nenhuma ocorrência de ${patternLabel} encontrada no PDF.`, 'info');
      return;
    }

    let count = 0;
    for (const m of matches) {
      for (const r of m.rects) {
        const annot: PdfAnnotation = {
          id: `redact-${Date.now()}-${count++}`,
          pageIndex: m.pageIndex,
          type: 'redaction',
          rect: {
            left: r.left - 1.5,
            bottom: r.bottom - 1.5,
            right: r.right + 1.5,
            top: r.top + 1.5,
          },
          color: '#DC2626',
          strokeColor: '#DC2626',
          opacity: 0.35,
          zIndex: 999,
          contents: `Tarja automática (${patternLabel})`,
          createdAt: new Date().toISOString(),
        };
        await executeCommand(
          tab.tabId,
          new AddAnnotationCommand(tab.tabId, annot, mutator, `Marcar ${patternLabel} para tarja`)
        );
      }
    }
    showToast(`${count} área(s) de ${patternLabel} marcada(s) para revisão de tarjamento.`, 'warning');
  };

  const applyAllPendingRedactions = async () => {
    const pending = Object.values(tab.annotationsByPage)
      .flat()
      .filter((a) => a.type === 'redaction' && !a.redactionApplied);
    if (pending.length === 0) {
      showToast('Desenhe ou busque áreas para tarjar antes de aplicar.', 'info');
      return;
    }

    const redactionsByPage: Record<number, PdfRect[]> = {};
    for (const p of pending) {
      if (!redactionsByPage[p.pageIndex]) redactionsByPage[p.pageIndex] = [];
      redactionsByPage[p.pageIndex].push(p.rect);
    }

    const prevBytes = new Uint8Array(tab.bytes);
    const res = await sharedPdfEngine.applyRedactions({
      docId: tab.docId,
      redactionsByPage,
    });

    const cleaned: typeof tab.annotationsByPage = {};
    for (const [k, list] of Object.entries(tab.annotationsByPage)) {
      cleaned[Number(k)] = list.filter((a) => a.type !== 'redaction');
    }

    await executeCommand(
      tab.tabId,
      new BinaryDocumentMutationCommand(
        `Tarjamento definitivo (${pending.length} áreas)`,
        tab.tabId,
        prevBytes,
        res.bytes,
        async (id, b) => {
          await usePdfStudioStore.getState().reloadTabBytesDirect(id, b);
        }
      )
    );
    updateTabState(tab.tabId, { annotationsByPage: cleaned });
    showToast('Tarjamento definitivo aplicado: bytes originais removidos.', 'success');
  };

  const clearSignaturePad = () => {
    const c = sigCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx?.clearRect(0, 0, c.width, c.height);
  };

  const saveDrawnSignatureAndStamp = async () => {
    const c = sigCanvasRef.current;
    if (!c) return;
    const dataUrl = c.toDataURL('image/png');
    const saved: SavedVisualSignature = {
      id: `vsig-${Date.now()}`,
      label: `Assinatura ${savedSignatures.length + 1}`,
      dataUrl,
      createdAt: new Date().toISOString(),
    };
    await platform.certificateStore.saveVisualSignature(saved);
    setSavedSignatures((prev) => [saved, ...prev]);
    await stampVisualSignatureOnPage(dataUrl);
    clearSignaturePad();
  };

  const createTypedSignatureAndStamp = async () => {
    if (!typedSigText.trim()) return;
    const c = document.createElement('canvas');
    c.width = 420;
    c.height = 120;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#171717';
    ctx.font = 'italic 42px Georgia, "Times New Roman", serif';
    ctx.fillText(typedSigText.trim(), 18, 76);
    const dataUrl = c.toDataURL('image/png');
    await stampVisualSignatureOnPage(dataUrl);
    setTypedSigText('');
  };

  const stampVisualSignatureOnPage = async (dataUrl: string) => {
    const geo = tab.geometries[tab.currentPage];
    const cx = (geo?.widthPt ?? 595) / 2;
    const cy = (geo?.heightPt ?? 842) / 3;
    const annot: PdfAnnotation = {
      id: `sig-annot-${Date.now()}`,
      pageIndex: tab.currentPage,
      type: 'signature-visual',
      rect: { left: cx - 85, bottom: cy - 28, right: cx + 85, top: cy + 28 },
      color: '#171717',
      opacity: 1,
      zIndex: 500,
      imageDataUrl: dataUrl,
      contents: 'Assinatura Visual',
      createdAt: new Date().toISOString(),
    };
    await executeCommand(
      tab.tabId,
      new AddAnnotationCommand(tab.tabId, annot, mutator, 'Inserir Assinatura Visual')
    );
    updateTabState(tab.tabId, { selectedAnnotationId: annot.id });
    showToast(`Assinatura inserida na página ${tab.currentPage + 1}. Arraste para posicionar.`, 'success');
  };

  const handleRunOcr = async () => {
    if (isRunningOcr) return;
    setIsRunningOcr(true);
    const taskId = `ocr-${Date.now()}`;
    upsertBackgroundTask({
      id: taskId,
      label: 'OCR em execução',
      progress: 5,
      detail: 'Inicializando motor OCR…',
      status: 'running',
    });

    try {
      const targetPages =
        ocrScope === 'current'
          ? [tab.currentPage]
          : tab.geometries.map((g) => g.pageIndex);

      await applyStructuralMutation(
        tab.tabId,
        `Executar OCR (${ocrLang})`,
        async (bytes) => {
          const res = await runSearchableOcrOnPdf(bytes, tab.docId, sharedPdfEngine, {
            language: ocrLang,
            pageIndices: targetPages,
            onProgress: (done, total, detail) => {
              upsertBackgroundTask({
                id: taskId,
                label: 'OCR em execução',
                progress: Math.round((done / Math.max(1, total)) * 100),
                detail,
                status: 'running',
              });
            },
          });
          return res.bytes;
        }
      );
      showToast('Camada de texto pesquisável OCR adicionada ao PDF!', 'success');
    } catch (err) {
      showToast(`Erro no OCR: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      removeBackgroundTask(taskId);
      setIsRunningOcr(false);
    }
  };

  const compEstimate = estimatePdfCompression(tab.bytes, compression);
  const currentTabFlow =
    INSPECTOR_FLOWS.some((f) => f.id === rightInspectorFlow)
      ? (rightInspectorFlow as (typeof INSPECTOR_FLOWS)[number]['id'])
      : 'auto';

  return (
    <aside
      style={{ width: rightInspectorWidth }}
      className="z-20 flex shrink-0 flex-col border-l border-black/[0.08] bg-[#FAFAFA] text-xs text-neutral-700 dark:border-white/[0.08] dark:bg-[#161716] dark:text-neutral-200"
    >
      <div className="flex h-10 shrink-0 items-center justify-between px-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-500 dark:text-neutral-400">
          Inspetor de Propriedades
        </span>
        <TextureButton
          variant="minimal"
          size="icon"
          onClick={closeRightInspector}
          title="Fechar inspetor"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.6} />
        </TextureButton>
      </div>

      <TextureSeparator />

      {/* Seletor rápido de assistentes em trilho DirectionAwareTabs */}
      <div className="border-b border-black/[0.06] bg-neutral-100/60 px-2.5 py-2 dark:border-white/[0.06] dark:bg-[#141514]">
        <DirectionAwareTabs
          compact
          ariaLabel="Fluxos do inspetor"
          items={INSPECTOR_FLOWS}
          value={currentTabFlow}
          className="w-full flex-wrap justify-start rounded-[12px]"
          onChange={(next, dir) => {
            setFlowSlideDir(dir);
            openRightInspector(next);
          }}
        />
      </div>

      <div
        key={rightInspectorFlow}
        className={`flex-1 space-y-4 overflow-y-auto p-3.5 ${
          flowSlideDir >= 0 ? 'cult-anim-slide-right' : 'cult-anim-slide-left'
        }`}
      >
        {/* 1. FLUXO AUTO */}
        {rightInspectorFlow === 'auto' && (
          <>
            {activeTextBlock && tab.activeTextBlockDraft ? (
              (() => {
                const draft = tab.activeTextBlockDraft;
                const patchDraft = (patch: Partial<ActiveTextBlockDraft>) => {
                  updateTabState(tab.tabId, {
                    activeTextBlockDraft: { ...draft, ...patch },
                  });
                };
                const curGeo = tab.geometries[draft.pageIndex];
                const effPage = curGeo
                  ? getEffectivePageSizePt(curGeo)
                  : { widthPt: 595.28, heightPt: 841.89 };
                const boxWidthPt = Math.round(draft.rect.right - draft.rect.left);
                const boxHeightPt = Math.round(draft.rect.top - draft.rect.bottom);

                const effStyle = getEffectiveRichStyle(
                  draft.runs,
                  draft.selection,
                  draft.defaultStyle
                );
                const hasSelection = hasActiveSubstringSelection(draft.selection);
                const selectedSnippet = getSelectedTextPreview(draft.runs, draft.selection);

                return (
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between">
                      <NeumorphEyebrow>Bloco Expansível</NeumorphEyebrow>
                      <TextureButton
                        variant="minimal"
                        size="xs"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          void commitTextBlockDraftToPdf({
                            tab,
                            block: activeTextBlock,
                            draft,
                            platform,
                            deleteBlockOnly: true,
                          })
                        }
                        title="Excluir este bloco de texto do PDF"
                      >
                        <Trash2 className="h-3 w-3 text-red-500" strokeWidth={1.6} />
                        Excluir
                      </TextureButton>
                    </div>

                    {/* Indicador Claro de Escopo */}
                    <div
                      className={`flex items-center justify-between gap-2 rounded-[10px] border px-2.5 py-2 text-[11px] ${
                        hasSelection
                          ? 'border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-200'
                          : 'border-black/10 bg-white/70 text-neutral-600 dark:border-white/10 dark:bg-[#1E1F1E] dark:text-neutral-300'
                      }`}
                    >
                      <span className="truncate">
                        {hasSelection ? (
                          <>
                            Formatando trecho:{' '}
                            <strong>
                              &ldquo;{selectedSnippet.slice(0, 22)}
                              {selectedSnippet.length > 22 ? '…' : ''}&rdquo;
                            </strong>
                          </>
                        ) : (
                          'Sem seleção: formatando o bloco inteiro'
                        )}
                      </span>
                      {hasSelection && (
                        <button
                          type="button"
                          onClick={() =>
                            patchDraft({
                              selection: {
                                start: draft.selection.end,
                                end: draft.selection.end,
                              },
                              formatRevision: draft.formatRevision + 1,
                            })
                          }
                          className="shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium hover:bg-sky-500/25"
                          title="Desmarcar seleção para voltar a formatar o bloco inteiro"
                        >
                          Bloco todo
                        </button>
                      )}
                    </div>

                    {/* Geometria e Expansão Livre do Bloco */}
                    <TextureCard variant="compact">
                      <div className="space-y-2.5 p-3">
                        <div className="flex items-center justify-between text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
                          <span>Dimensões do Bloco</span>
                          <div className="flex items-center gap-1.5">
                            {(draft.hasManualWidthResize || draft.hasManualHeightResize) && (
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() =>
                                  patchDraft({
                                    hasManualWidthResize: false,
                                    hasManualHeightResize: false,
                                    rect: autoFitDraftRect(
                                      {
                                        ...draft,
                                        hasManualWidthResize: false,
                                        hasManualHeightResize: false,
                                      },
                                      draft.runs,
                                      draft.lineHeightPt,
                                      curGeo
                                    ),
                                  })
                                }
                                title="Restaurar ajuste automático de largura e altura"
                                className="rounded bg-[#1A94FF]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#1A94FF] hover:bg-[#1A94FF]/25"
                              >
                                Auto
                              </button>
                            )}
                            <span className="font-mono tabular-nums">
                              {ptToMm(boxWidthPt)} × {ptToMm(boxHeightPt)} mm
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">
                              Largura (pt)
                            </label>
                            <HaloInput
                              type="number"
                              min={28}
                              max={1600}
                              value={boxWidthPt}
                              onChange={(e) => {
                                const nextW = Math.max(28, Number(e.target.value) || 28);
                                patchDraft({
                                  hasManualWidthResize: true,
                                  rect: {
                                    ...draft.rect,
                                    right: draft.rect.left + nextW,
                                  },
                                });
                              }}
                              className="h-7 tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">
                              Altura mín. (pt)
                            </label>
                            <HaloInput
                              type="number"
                              min={16}
                              max={1600}
                              value={boxHeightPt}
                              onChange={(e) => {
                                const nextH = Math.max(16, Number(e.target.value) || 16);
                                patchDraft({
                                  hasManualHeightResize: true,
                                  rect: {
                                    ...draft.rect,
                                    bottom: draft.rect.top - nextH,
                                  },
                                });
                              }}
                              className="h-7 tabular-nums"
                            />
                          </div>
                        </div>

                        <TextureButton
                          variant="secondary"
                          size="xs"
                          className="w-full"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            const margin = 36;
                            const x0 = curGeo?.cropBox.left ?? 0;
                            const nextRect = {
                              ...draft.rect,
                              left: x0 + margin,
                              right: x0 + effPage.widthPt - margin,
                            };
                            patchDraft({
                              hasManualWidthResize: true,
                              rect: autoFitDraftRect(
                                { ...draft, rect: nextRect, hasManualWidthResize: true },
                                draft.runs,
                                draft.lineHeightPt,
                                curGeo
                              ),
                            });
                          }}
                        >
                          <MoveHorizontal className="h-3.5 w-3.5" strokeWidth={1.6} />
                          Expandir à Largura Útil da Página
                        </TextureButton>
                      </div>
                    </TextureCard>

                    {/* Tipografia e Estilo */}
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                        Família da Fonte {hasSelection ? '(Trecho)' : '(Bloco)'}
                      </label>
                      <HaloSelect
                        value={effStyle.fontFamily}
                        onChange={(e) =>
                          applyPatchToDraft(tab.tabId, draft, {
                            fontFamily: e.target.value as MetricFontFamily,
                          })
                        }
                      >
                        <option value="sans">Sans-Serif (Arial / Liberation Sans)</option>
                        <option value="serif">Serifada (Times / Liberation Serif)</option>
                        <option value="mono">Monoespaçada (Courier / Liberation Mono)</option>
                        <option value="calibri">Humanista (Calibri / Carlito)</option>
                      </HaloSelect>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                          Tamanho {hasSelection ? '(Trecho)' : '(pt)'}
                        </label>
                        <HaloInput
                          type="number"
                          min={6}
                          max={96}
                          step={0.5}
                          value={effStyle.fontSizePt}
                          onChange={(e) => {
                            const fs = Math.max(6, Number(e.target.value) || 11);
                            applyPatchToDraft(tab.tabId, draft, { fontSizePt: fs });
                            if (!hasSelection) {
                              const latest = usePdfStudioStore
                                .getState()
                                .tabs.find((t) => t.tabId === tab.tabId)?.activeTextBlockDraft;
                              if (latest) {
                                const nextLh = Math.round(fs * 1.25 * 10) / 10;
                                updateTabState(tab.tabId, {
                                  activeTextBlockDraft: {
                                    ...latest,
                                    lineHeightPt: nextLh,
                                    rect: autoFitDraftRect(latest, latest.runs, nextLh, curGeo),
                                  },
                                });
                              }
                            }
                          }}
                          className="tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                          Entrelinha (pt)
                        </label>
                        <HaloInput
                          type="number"
                          min={6}
                          max={120}
                          step={0.5}
                          value={draft.lineHeightPt}
                          onChange={(e) => {
                            const nextLh = Math.max(6, Number(e.target.value) || 14);
                            patchDraft({
                              lineHeightPt: nextLh,
                              rect: autoFitDraftRect(draft, draft.runs, nextLh, curGeo),
                            });
                          }}
                          className="tabular-nums"
                        />
                      </div>
                    </div>

                    {/* Negrito, Itálico, Sublinhado e Alinhamento */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <TextureButton
                          variant={effStyle.isBold ? 'primary' : 'minimal'}
                          size="icon"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() =>
                            applyPatchToDraft(tab.tabId, draft, {
                              isBold: !effStyle.isBold,
                            })
                          }
                          title={
                            hasSelection
                              ? 'Negrito apenas no trecho selecionado (Ctrl+B)'
                              : 'Negrito no bloco inteiro (Ctrl+B)'
                          }
                        >
                          <Bold className="h-3.5 w-3.5" strokeWidth={2} />
                        </TextureButton>
                        <TextureButton
                          variant={effStyle.isItalic ? 'primary' : 'minimal'}
                          size="icon"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() =>
                            applyPatchToDraft(tab.tabId, draft, {
                              isItalic: !effStyle.isItalic,
                            })
                          }
                          title={
                            hasSelection
                              ? 'Itálico apenas no trecho selecionado (Ctrl+I)'
                              : 'Itálico no bloco inteiro (Ctrl+I)'
                          }
                        >
                          <Italic className="h-3.5 w-3.5" strokeWidth={1.8} />
                        </TextureButton>
                        <TextureButton
                          variant={effStyle.isUnderline ? 'primary' : 'minimal'}
                          size="icon"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() =>
                            applyPatchToDraft(tab.tabId, draft, {
                              isUnderline: !effStyle.isUnderline,
                            })
                          }
                          title={
                            hasSelection
                              ? 'Sublinhado apenas no trecho selecionado (Ctrl+U)'
                              : 'Sublinhado no bloco inteiro (Ctrl+U)'
                          }
                        >
                          <Underline className="h-3.5 w-3.5" strokeWidth={1.8} />
                        </TextureButton>
                      </div>

                      <div className="flex items-center gap-1">
                        {(
                          [
                            ['left', AlignLeft, 'Alinhar à esquerda'],
                            ['center', AlignCenter, 'Centralizar no bloco'],
                            ['right', AlignRight, 'Alinhar à direita'],
                          ] as const
                        ).map(([al, IconComp, lbl]) => (
                          <TextureButton
                            key={al}
                            variant={draft.alignment === al ? 'primary' : 'minimal'}
                            size="icon"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => patchDraft({ alignment: al })}
                            title={lbl}
                          >
                            <IconComp className="h-3.5 w-3.5" strokeWidth={1.6} />
                          </TextureButton>
                        ))}
                      </div>
                    </div>

                    {/* Cor do Texto */}
                    <div>
                      <label className="mb-1.5 block text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                        Cor do Texto {hasSelection ? '(Trecho selecionado)' : '(Bloco inteiro)'}
                      </label>
                      <div className="flex items-center gap-1.5">
                        {['#0F172A', '#171717', '#2563EB', '#DC2626', '#047857', '#64748B'].map(
                          (c) => (
                            <button
                              key={c}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() =>
                                applyPatchToDraft(tab.tabId, draft, { colorHex: c })
                              }
                              style={{ backgroundColor: c }}
                              className={`h-5 w-5 rounded-full border transition-transform ${
                                effStyle.colorHex.toLowerCase() === c.toLowerCase()
                                  ? 'scale-110 ring-2 ring-[#1A94FF] ring-offset-1 ring-offset-white dark:ring-offset-[#161716]'
                                  : 'border-black/20 dark:border-white/20'
                              }`}
                            />
                          )
                        )}
                        <input
                          type="color"
                          value={effStyle.colorHex}
                          onChange={(e) =>
                            applyPatchToDraft(tab.tabId, draft, {
                              colorHex: e.target.value,
                            })
                          }
                          className="ml-auto h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                        />
                      </div>
                    </div>

                    {/* Cobertura Opcional de Fundo */}
                    <div className="flex items-center justify-between rounded-[10px] border border-black/[0.08] bg-white px-2.5 py-2 dark:border-white/[0.08] dark:bg-[#1E1F1E]">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={draft.opaqueBackground}
                          onChange={(e) =>
                            patchDraft({ opaqueBackground: e.target.checked })
                          }
                          className="accent-neutral-900 dark:accent-neutral-100"
                        />
                        <span>Cobrir fundo sob o bloco</span>
                      </label>
                      {draft.opaqueBackground && (
                        <input
                          type="color"
                          value={draft.backgroundColorHex}
                          onChange={(e) =>
                            patchDraft({ backgroundColorHex: e.target.value })
                          }
                          className="h-5 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                        />
                      )}
                    </div>

                    <TextureButton
                      variant="primary"
                      size="md"
                      className="w-full"
                      onClick={() =>
                        void commitTextBlockDraftToPdf({
                          tab,
                          block: activeTextBlock,
                          draft,
                          platform,
                        })
                      }
                    >
                      <Check className="h-4 w-4" strokeWidth={1.7} />
                      Aplicar no PDF (Ctrl+Enter)
                    </TextureButton>
                  </div>
                );
              })()
            ) : selectedAnnotation ? (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <NeumorphEyebrow>{describeAnnotType(selectedAnnotation.type)}</NeumorphEyebrow>
                  <TextureButton
                    variant="minimal"
                    size="xs"
                    onClick={() =>
                      void executeCommand(
                        tab.tabId,
                        new DeleteAnnotationCommand(tab.tabId, selectedAnnotation, mutator)
                      )
                    }
                  >
                    <Trash2 className="h-3 w-3 text-red-500" strokeWidth={1.6} />
                    Excluir
                  </TextureButton>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                    Cor Principal
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      '#FACC15',
                      '#4ADE80',
                      '#38BDF8',
                      '#F87171',
                      '#DC2626',
                      '#171717',
                      '#525252',
                    ].map((c) => (
                      <button
                        key={c}
                        onClick={() =>
                          updateSelectedAnnot({ color: c, strokeColor: c }, 'Alterar cor')
                        }
                        style={{ backgroundColor: c }}
                        className={`h-5 w-5 rounded-full border ${
                          selectedAnnotation.color === c
                            ? 'ring-2 ring-[#1A94FF] ring-offset-1 ring-offset-white dark:ring-offset-[#161716]'
                            : 'border-black/20 dark:border-white/20'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 flex justify-between text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                    <span>Opacidade</span>
                    <span className="font-mono tabular-nums">
                      {Math.round(selectedAnnotation.opacity * 100)}%
                    </span>
                  </label>
                  <input
                    type="range"
                    min={0.15}
                    max={1}
                    step={0.05}
                    value={selectedAnnotation.opacity}
                    onChange={(e) =>
                      updateSelectedAnnot(
                        { opacity: parseFloat(e.target.value) },
                        'Ajustar opacidade'
                      )
                    }
                    className="w-full accent-neutral-900 dark:accent-neutral-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                    Texto / Comentário Vinculado
                  </label>
                  <textarea
                    rows={3}
                    value={selectedAnnotation.contents ?? ''}
                    onChange={(e) =>
                      updateSelectedAnnot({ contents: e.target.value }, 'Editar nota')
                    }
                    placeholder="Escreva uma observação de revisão…"
                    className="w-full rounded-[8px] border border-black/10 bg-white p-2 text-xs text-neutral-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] outline-none focus:border-[#1A94FF] dark:border-white/10 dark:bg-[#111211] dark:text-neutral-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                    Status de Revisão
                  </label>
                  <HaloSelect
                    value={selectedAnnotation.reviewStatus ?? 'none'}
                    onChange={(e) =>
                      updateSelectedAnnot(
                        { reviewStatus: e.target.value as ReviewStatus },
                        'Alterar status de revisão'
                      )
                    }
                  >
                    <option value="none">Sem status</option>
                    <option value="approved">Aprovado</option>
                    <option value="rejected">Rejeitado</option>
                    <option value="completed">Concluído</option>
                  </HaloSelect>
                </div>

                {/* Respostas Encadeadas */}
                <TextureSeparator />
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-500 dark:text-neutral-400">
                    Respostas ({selectedAnnotation.replies?.length ?? 0})
                  </div>
                  {(selectedAnnotation.replies ?? []).map((rep) => (
                    <MinimalCard key={rep.id} className="rounded-[10px] p-2 text-[11px]">
                      <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {rep.author}
                      </div>
                      <div className="mt-0.5 text-neutral-600 dark:text-neutral-300">
                        {rep.text}
                      </div>
                    </MinimalCard>
                  ))}
                  <div className="flex gap-1.5">
                    <HaloInput
                      type="text"
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      placeholder="Responder comentário…"
                      className="h-7 flex-1"
                    />
                    <TextureButton
                      variant="primary"
                      size="xs"
                      onClick={() => {
                        if (!replyDraft.trim()) return;
                        updateSelectedAnnot(
                          {
                            replies: [
                              ...(selectedAnnotation.replies ?? []),
                              {
                                id: `rep-${Date.now()}`,
                                author: 'Revisor Local',
                                text: replyDraft.trim(),
                                createdAt: new Date().toISOString(),
                              },
                            ],
                          },
                          'Adicionar resposta'
                        );
                        setReplyDraft('');
                      }}
                    >
                      Enviar
                    </TextureButton>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-10 text-center text-neutral-500 dark:text-neutral-400">
                Selecione uma anotação, forma, carimbo ou bloco de texto na página para editar suas
                propriedades em tempo real.
              </div>
            )}
          </>
        )}

        {/* 2. ASSISTENTE DE MARCA D'ÁGUA */}
        {rightInspectorFlow === 'watermark' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-neutral-100">
              <Droplets className="h-4 w-4 text-neutral-600 dark:text-neutral-300" strokeWidth={1.6} />
              <span>Marca d&apos;Água em Lote</span>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">
                Texto da Marca d&apos;Água
              </label>
              <HaloInput
                type="text"
                value={watermark.text}
                onChange={(e) => setWatermark({ ...watermark, text: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">
                  Tamanho (pt)
                </label>
                <HaloInput
                  type="number"
                  value={watermark.fontSizePt}
                  onChange={(e) =>
                    setWatermark({ ...watermark, fontSizePt: Number(e.target.value) || 36 })
                  }
                  className="tabular-nums"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">
                  Ângulo (°)
                </label>
                <HaloInput
                  type="number"
                  value={watermark.angleDeg}
                  onChange={(e) =>
                    setWatermark({ ...watermark, angleDeg: Number(e.target.value) || 0 })
                  }
                  className="tabular-nums"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 flex justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
                <span>Opacidade</span>
                <span className="font-mono tabular-nums">
                  {Math.round(watermark.opacity * 100)}%
                </span>
              </label>
              <input
                type="range"
                min={0.05}
                max={0.8}
                step={0.05}
                value={watermark.opacity}
                onChange={(e) =>
                  setWatermark({ ...watermark, opacity: parseFloat(e.target.value) })
                }
                className="w-full accent-neutral-900 dark:accent-neutral-100"
              />
            </div>
            <TextureButton
              variant="primary"
              size="md"
              className="w-full"
              onClick={() =>
                void applyStructuralMutation(
                  tab.tabId,
                  `Aplicar marca d'água "${watermark.text}"`,
                  (b) => applyWatermarkToPdf(b, watermark)
                )
              }
            >
              Aplicar Marca d&apos;Água
            </TextureButton>
          </div>
        )}

        {/* 3. CABEÇALHO E RODAPÉ */}
        {rightInspectorFlow === 'header-footer' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-neutral-100">
              <FileText className="h-4 w-4 text-neutral-600 dark:text-neutral-300" strokeWidth={1.6} />
              <span>Cabeçalho e Rodapé Dinâmicos</span>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">
                Cabeçalho Esquerdo
              </label>
              <HaloInput
                type="text"
                value={headerFooter.headerLeft ?? ''}
                onChange={(e) =>
                  setHeaderFooter({ ...headerFooter, headerLeft: e.target.value })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">
                Rodapé Central (suporta {'{page}'}, {'{total}'}, {'{date}'})
              </label>
              <HaloInput
                type="text"
                value={headerFooter.footerCenter ?? ''}
                onChange={(e) =>
                  setHeaderFooter({ ...headerFooter, footerCenter: e.target.value })
                }
              />
            </div>
            <TextureButton
              variant="primary"
              size="md"
              className="w-full"
              onClick={() =>
                void applyStructuralMutation(
                  tab.tabId,
                  'Inserir cabeçalho e rodapé',
                  (b) => applyHeaderFooterToPdf(b, headerFooter)
                )
              }
            >
              Aplicar em Todas as Páginas
            </TextureButton>
          </div>
        )}

        {/* 4. NUMERAÇÃO BATES JURÍDICA */}
        {rightInspectorFlow === 'bates' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-neutral-100">
              <Hash className="h-4 w-4 text-neutral-600 dark:text-neutral-300" strokeWidth={1.6} />
              <span>Numeração Jurídica Bates</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">
                  Prefixo
                </label>
                <HaloInput
                  type="text"
                  value={bates.prefix}
                  onChange={(e) => setBates({ ...bates, prefix: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">
                  Dígitos
                </label>
                <HaloInput
                  type="number"
                  min={3}
                  max={10}
                  value={bates.digits}
                  onChange={(e) => setBates({ ...bates, digits: Number(e.target.value) || 6 })}
                  className="tabular-nums"
                />
              </div>
            </div>
            <div className="rounded-[8px] border border-black/[0.06] bg-neutral-100 p-2.5 font-mono text-[11px] text-neutral-800 dark:border-white/[0.06] dark:bg-[#111211] dark:text-neutral-200">
              Prévia: {bates.prefix}
              {String(bates.startNumber).padStart(bates.digits, '0')}
              {bates.suffix}
            </div>
            <TextureButton
              variant="primary"
              size="md"
              className="w-full"
              onClick={() =>
                void applyStructuralMutation(
                  tab.tabId,
                  'Aplicar numeração Bates',
                  (b) => applyBatesNumberingToPdf(b, bates)
                )
              }
            >
              Estampar Numeração Bates
            </TextureButton>
          </div>
        )}

        {/* 5. COMPRESSÃO INTELIGENTE */}
        {rightInspectorFlow === 'compress' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-neutral-100">
              <Minimize2 className="h-4 w-4 text-neutral-600 dark:text-neutral-300" strokeWidth={1.6} />
              <span>Compressão e Otimização</span>
            </div>

            <TextureCard variant="compact">
              <div className="space-y-1.5 p-3 tabular-nums">
                <div className="flex justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400">Peso atual:</span>
                  <strong>{formatBytes(compEstimate.originalBytes)}</strong>
                </div>
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Peso estimado:</span>
                  <strong>~{formatBytes(compEstimate.estimatedBytes)}</strong>
                </div>
              </div>
            </TextureCard>

            <div>
              <label className="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">
                Nível de Compressão
              </label>
              <HaloSelect
                value={compression.qualityPreset}
                onChange={(e) =>
                  setCompression({
                    ...compression,
                    qualityPreset: e.target.value as CompressionConfig['qualityPreset'],
                  })
                }
              >
                <option value="high">Alta Qualidade (220 DPI)</option>
                <option value="balanced">Equilibrado Recomendado (150 DPI)</option>
                <option value="low">Compressão Máxima (72 DPI)</option>
              </HaloSelect>
            </div>

            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={compression.stripMetadata}
                onChange={(e) =>
                  setCompression({ ...compression, stripMetadata: e.target.checked })
                }
                className="accent-neutral-900 dark:accent-neutral-100"
              />
              <span>Remover metadados ocultos e objetos órfãos</span>
            </label>

            <TextureButton
              variant="primary"
              size="md"
              className="w-full"
              onClick={async () => {
                await applyStructuralMutation(tab.tabId, 'Comprimir e otimizar PDF', (b) =>
                  optimizeAndCompressPdf(b, compression)
                );
                showToast('Documento otimizado e reescrito com sucesso.', 'success');
              }}
            >
              Comprimir Documento
            </TextureButton>
          </div>
        )}

        {/* 6. TARJAMENTO DEFINITIVO (LGPD) */}
        {rightInspectorFlow === 'redact' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-red-600 dark:text-red-400">
              <ShieldAlert className="h-4 w-4" strokeWidth={1.6} />
              <span>Tarjamento Definitivo (LGPD)</span>
            </div>
            <p className="text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400">
              Arraste sobre a página para marcar áreas ou localize dados sensíveis em lote abaixo.
              Ao confirmar, os textos e vetores sob a tarja são destruídos fisicamente.
            </p>

            <div className="space-y-2">
              <div className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
                Marcar Padrões Automaticamente:
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <TextureButton
                  variant="secondary"
                  size="xs"
                  onClick={() =>
                    void markPatternForRedaction('CPF', '\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}')
                  }
                >
                  Buscar CPFs
                </TextureButton>
                <TextureButton
                  variant="secondary"
                  size="xs"
                  onClick={() =>
                    void markPatternForRedaction(
                      'CNPJ',
                      '\\d{2}\\.\\d{3}\\.\\d{3}\\/\\d{4}-\\d{2}'
                    )
                  }
                >
                  Buscar CNPJs
                </TextureButton>
                <TextureButton
                  variant="secondary"
                  size="xs"
                  onClick={() =>
                    void markPatternForRedaction(
                      'E-mail',
                      '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}'
                    )
                  }
                >
                  Buscar E-mails
                </TextureButton>
                <TextureButton
                  variant="secondary"
                  size="xs"
                  onClick={() =>
                    void markPatternForRedaction(
                      'Telefone',
                      '\\(\\d{2}\\)\\s?\\d{4,5}-\\d{4}'
                    )
                  }
                >
                  Buscar Telefones
                </TextureButton>
              </div>
            </div>

            <TextureButton
              variant="destructive"
              size="md"
              className="w-full"
              onClick={() => void applyAllPendingRedactions()}
            >
              Aplicar Tarjamento Permanente
            </TextureButton>
          </div>
        )}

        {/* 7. ASSINATURA VISUAL RÁPIDA */}
        {rightInspectorFlow === 'signature' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-neutral-100">
              <FileSignature className="h-4 w-4 text-neutral-600 dark:text-neutral-300" strokeWidth={1.6} />
              <span>Assinatura Eletrônica Visual</span>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Desenhar Rubrica / Assinatura:
                </span>
                <button
                  onClick={clearSignaturePad}
                  className="text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400"
                >
                  Limpar
                </button>
              </div>
              <canvas
                ref={sigCanvasRef}
                width={250}
                height={95}
                onPointerDown={(e) => {
                  const c = sigCanvasRef.current;
                  if (!c) return;
                  const r = c.getBoundingClientRect();
                  const ctx = c.getContext('2d')!;
                  ctx.strokeStyle = '#171717';
                  ctx.lineWidth = 2.2;
                  ctx.lineCap = 'round';
                  ctx.beginPath();
                  ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
                  setIsDrawingSig(true);
                }}
                onPointerMove={(e) => {
                  if (!isDrawingSig || !sigCanvasRef.current) return;
                  const r = sigCanvasRef.current.getBoundingClientRect();
                  const ctx = sigCanvasRef.current.getContext('2d')!;
                  ctx.lineTo(e.clientX - r.left, e.clientY - r.top);
                  ctx.stroke();
                }}
                onPointerUp={() => setIsDrawingSig(false)}
                onPointerLeave={() => setIsDrawingSig(false)}
                className="w-full touch-none rounded-[10px] border border-black/15 bg-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] cursor-crosshair"
              />
              <TextureButton
                variant="primary"
                size="sm"
                className="mt-2 w-full"
                onClick={() => void saveDrawnSignatureAndStamp()}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={1.6} />
                Salvar e Inserir na Página
              </TextureButton>
            </div>

            <TextureSeparator />

            <div>
              <label className="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">
                Ou digitar nome manuscrito:
              </label>
              <div className="flex gap-1.5">
                <HaloInput
                  type="text"
                  value={typedSigText}
                  onChange={(e) => setTypedSigText(e.target.value)}
                  placeholder="Seu Nome Completo"
                  className="flex-1"
                />
                <TextureButton
                  variant="primary"
                  size="sm"
                  onClick={() => void createTypedSignatureAndStamp()}
                >
                  Inserir
                </TextureButton>
              </div>
            </div>

            {savedSignatures.length > 0 && (
              <>
                <TextureSeparator />
                <div className="space-y-1.5">
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Assinaturas Salvas no Perfil:
                  </div>
                  {savedSignatures.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => void stampVisualSignatureOnPage(s.dataUrl)}
                      className="flex cursor-pointer items-center justify-between rounded-[10px] border border-black/10 bg-white p-1.5 hover:border-black/30"
                    >
                      <img src={s.dataUrl} alt={s.label} className="h-8 object-contain" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void platform.certificateStore.deleteVisualSignature(s.id);
                          setSavedSignatures((prev) => prev.filter((x) => x.id !== s.id));
                        }}
                        className="p-1 text-neutral-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* 8. OCR PESQUISÁVEL */}
        {rightInspectorFlow === 'ocr' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-neutral-100">
              <ScanText className="h-4 w-4 text-neutral-600 dark:text-neutral-300" strokeWidth={1.6} />
              <span>OCR — Reconhecimento Óptico</span>
            </div>
            <p className="text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400">
              Converte páginas digitalizadas em texto selecionável e pesquisável preservando a
              aparência visual original.
            </p>
            <div>
              <label className="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">
                Idioma do Documento
              </label>
              <HaloSelect
                value={ocrLang}
                onChange={(e) => setOcrLang(e.target.value as 'por' | 'eng' | 'por+eng')}
              >
                <option value="por+eng">Português + Inglês</option>
                <option value="por">Português (Brasil)</option>
                <option value="eng">Inglês</option>
              </HaloSelect>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">
                Intervalo
              </label>
              <HaloSelect
                value={ocrScope}
                onChange={(e) => setOcrScope(e.target.value as 'current' | 'all')}
              >
                <option value="current">Página atual ({tab.currentPage + 1})</option>
                <option value="all">Todas as páginas ({tab.geometries.length})</option>
              </HaloSelect>
            </div>
            <TextureButton
              variant="primary"
              size="md"
              disabled={isRunningOcr}
              onClick={() => void handleRunOcr()}
              className="w-full"
            >
              {isRunningOcr ? 'Processando OCR…' : 'Iniciar OCR Pesquisável'}
            </TextureButton>
          </div>
        )}

        {/* 9. SANITIZAÇÃO */}
        {rightInspectorFlow === 'sanitize' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-neutral-100">
              <Shield className="h-4 w-4 text-neutral-600 dark:text-neutral-300" strokeWidth={1.6} />
              <span>Sanitização de Privacidade</span>
            </div>
            <p className="text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400">
              Remove metadados ocultos (Autor, Criador, Produtor, XMP), ações de abertura e
              scripts JavaScript embutidos antes de compartilhar o PDF.
            </p>
            <TextureButton
              variant="primary"
              size="md"
              className="w-full"
              onClick={async () => {
                await applyStructuralMutation(tab.tabId, 'Sanitizar documento PDF', (b) =>
                  sanitizePdfDocument(b)
                );
                showToast('Metadados ocultos e scripts removidos com sucesso.', 'success');
              }}
            >
              Limpar e Sanitizar Documento
            </TextureButton>
          </div>
        )}
      </div>
    </aside>
  );
}
