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
import { commitTextBlockDraftToPdf } from '../utils/textBlockCommit';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function RightPropertyInspector({ tab }: { tab: DocumentTabState }) {
  const { platform, applyStructuralMutation } = usePlatformActions();
  const darkMode = usePdfStudioStore((s) => s.darkMode);
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
    colorHex: '#1B2952',
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
    colorHex: '#1B2952',
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

  // Busca automática de padrões LGPD para Tarjamento em Lote
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
    ctx.fillStyle = '#1B2952';
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
      color: '#1B2952',
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
      detail: 'Inicializando motor OCR...',
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

  return (
    <aside
      style={{ width: rightInspectorWidth }}
      className={`z-20 flex shrink-0 flex-col border-l text-xs ${
        darkMode
          ? 'border-[#334155] bg-[#1E2430] text-slate-200'
          : 'border-[#E2E8F0] bg-white text-slate-700'
      }`}
    >
      <div
        className={`flex h-9 shrink-0 items-center justify-between border-b px-3 font-semibold ${
          darkMode ? 'border-[#334155]' : 'border-[#E2E8F0]'
        }`}
      >
        <span>Inspetor de Propriedades</span>
        <button
          onClick={closeRightInspector}
          className="rounded p-1 opacity-70 hover:bg-slate-500/15 hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {/* Seletor rápido de assistentes quando nenhum objeto está focado */}
      <div
        className={`flex gap-1 overflow-x-auto border-b px-2 py-1.5 ${
          darkMode ? 'border-[#334155] bg-[#262E3D]' : 'border-slate-100 bg-slate-50'
        }`}
      >
        {[
          { id: 'auto' as const, label: 'Seleção' },
          { id: 'watermark' as const, label: "Marca d'Água" },
          { id: 'bates' as const, label: 'Bates' },
          { id: 'compress' as const, label: 'Comprimir' },
          { id: 'redact' as const, label: 'Tarjar' },
          { id: 'signature' as const, label: 'Assinar' },
          { id: 'ocr' as const, label: 'OCR' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => openRightInspector(f.id)}
            className={`shrink-0 rounded px-2 py-1 text-[11px] font-medium ${
              rightInspectorFlow === f.id
                ? 'bg-[#1B2952] text-white dark:bg-[#2F4D8F]'
                : 'opacity-75 hover:bg-slate-500/15 hover:opacity-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3.5">
        {/* 1. FLUXO AUTO: PROPRIEDADES DO BLOCO DE TEXTO OU ANOTAÇÃO SELECIONADA */}
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

                return (
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#1B2952] dark:text-blue-400">
                        Bloco de Texto Expansível
                      </span>
                      <button
                        onClick={() =>
                          void commitTextBlockDraftToPdf({
                            tab,
                            block: activeTextBlock,
                            draft,
                            platform,
                            deleteBlockOnly: true,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-red-600 hover:bg-red-500/10 dark:text-red-400"
                        title="Excluir este bloco de texto do PDF"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Excluir
                      </button>
                    </div>

                    {/* Geometria e Expansão Livre do Bloco */}
                    <div className="rounded-lg border border-slate-500/20 p-2.5 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-medium opacity-80">
                        <span>Dimensões do Bloco</span>
                        <span className="tabular-nums">
                          {ptToMm(boxWidthPt)} × {ptToMm(boxHeightPt)} mm
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-0.5 block text-[11px] opacity-70">
                            Largura (pt)
                          </label>
                          <input
                            type="number"
                            min={28}
                            max={1600}
                            value={boxWidthPt}
                            onChange={(e) => {
                              const nextW = Math.max(28, Number(e.target.value) || 28);
                              patchDraft({
                                rect: {
                                  ...draft.rect,
                                  right: draft.rect.left + nextW,
                                },
                              });
                            }}
                            className={`h-7 w-full rounded border px-2 tabular-nums ${
                              darkMode
                                ? 'border-[#334155] bg-[#111827]'
                                : 'border-slate-200 bg-slate-50'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[11px] opacity-70">
                            Altura mín. (pt)
                          </label>
                          <input
                            type="number"
                            min={16}
                            max={1600}
                            value={boxHeightPt}
                            onChange={(e) => {
                              const nextH = Math.max(16, Number(e.target.value) || 16);
                              patchDraft({
                                rect: {
                                  ...draft.rect,
                                  bottom: draft.rect.top - nextH,
                                },
                              });
                            }}
                            className={`h-7 w-full rounded border px-2 tabular-nums ${
                              darkMode
                                ? 'border-[#334155] bg-[#111827]'
                                : 'border-slate-200 bg-slate-50'
                            }`}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const margin = 36;
                          const x0 = curGeo?.cropBox.left ?? 0;
                          patchDraft({
                            rect: {
                              ...draft.rect,
                              left: x0 + margin,
                              right: x0 + effPage.widthPt - margin,
                            },
                          });
                        }}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-[#2F4D8F]/40 bg-[#1B2952]/5 py-1.5 text-[11px] font-medium text-[#1B2952] hover:bg-[#1B2952]/10 dark:border-blue-400/40 dark:bg-blue-500/10 dark:text-blue-300"
                      >
                        <MoveHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Expandir à Largura Útil da Página
                      </button>
                    </div>

                    {/* Tipografia e Estilo */}
                    <div>
                      <label className="mb-1 block opacity-75">
                        Família da Fonte (Original: {activeTextBlock.cleanFontName})
                      </label>
                      <select
                        value={draft.fontFamily}
                        onChange={(e) =>
                          patchDraft({ fontFamily: e.target.value as MetricFontFamily })
                        }
                        className={`h-8 w-full rounded border px-2 ${
                          darkMode
                            ? 'border-[#334155] bg-[#111827]'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <option value="sans">Sans-Serif (Arial / Liberation Sans)</option>
                        <option value="serif">Serifada (Times / Liberation Serif)</option>
                        <option value="mono">Monoespaçada (Courier / Liberation Mono)</option>
                        <option value="calibri">Humanista (Calibri / Carlito)</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block opacity-75">Tamanho (pt)</label>
                        <input
                          type="number"
                          min={6}
                          max={96}
                          step={0.5}
                          value={draft.fontSizePt}
                          onChange={(e) => {
                            const fs = Math.max(6, Number(e.target.value) || 11);
                            patchDraft({
                              fontSizePt: fs,
                              lineHeightPt: Math.round(fs * 1.25 * 10) / 10,
                            });
                          }}
                          className={`h-8 w-full rounded border px-2 tabular-nums ${
                            darkMode
                              ? 'border-[#334155] bg-[#111827]'
                              : 'border-slate-200 bg-slate-50'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block opacity-75">Entrelinha (pt)</label>
                        <input
                          type="number"
                          min={6}
                          max={120}
                          step={0.5}
                          value={draft.lineHeightPt}
                          onChange={(e) =>
                            patchDraft({
                              lineHeightPt: Math.max(6, Number(e.target.value) || 14),
                            })
                          }
                          className={`h-8 w-full rounded border px-2 tabular-nums ${
                            darkMode
                              ? 'border-[#334155] bg-[#111827]'
                              : 'border-slate-200 bg-slate-50'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Negrito, Itálico e Alinhamento */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => patchDraft({ isBold: !draft.isBold })}
                          title="Negrito"
                          className={`flex h-8 w-8 items-center justify-center rounded border ${
                            draft.isBold
                              ? 'border-[#1B2952] bg-[#1B2952] text-white'
                              : 'border-slate-500/30 hover:bg-slate-500/10'
                          }`}
                        >
                          <Bold className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          onClick={() => patchDraft({ isItalic: !draft.isItalic })}
                          title="Itálico"
                          className={`flex h-8 w-8 items-center justify-center rounded border ${
                            draft.isItalic
                              ? 'border-[#1B2952] bg-[#1B2952] text-white'
                              : 'border-slate-500/30 hover:bg-slate-500/10'
                          }`}
                        >
                          <Italic className="h-3.5 w-3.5" strokeWidth={1.8} />
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        {(
                          [
                            ['left', AlignLeft, 'Alinhar à esquerda'],
                            ['center', AlignCenter, 'Centralizar no bloco'],
                            ['right', AlignRight, 'Alinhar à direita'],
                          ] as const
                        ).map(([al, IconComp, lbl]) => (
                          <button
                            key={al}
                            type="button"
                            onClick={() => patchDraft({ alignment: al })}
                            title={lbl}
                            className={`flex h-8 w-8 items-center justify-center rounded border ${
                              draft.alignment === al
                                ? 'border-[#1B2952] bg-[#1B2952] text-white'
                                : 'border-slate-500/30 hover:bg-slate-500/10'
                            }`}
                          >
                            <IconComp className="h-3.5 w-3.5" strokeWidth={1.5} />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Cor do Texto */}
                    <div>
                      <label className="mb-1.5 block opacity-75">Cor do Texto</label>
                      <div className="flex items-center gap-1.5">
                        {['#0F172A', '#1B2952', '#2F4D8F', '#DC2626', '#047857', '#64748B'].map(
                          (c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => patchDraft({ colorHex: c })}
                              style={{ backgroundColor: c }}
                              className={`h-5 w-5 rounded-full border ${
                                draft.colorHex.toLowerCase() === c.toLowerCase()
                                  ? 'ring-2 ring-[#1B2952] dark:ring-white'
                                  : 'border-black/20'
                              }`}
                            />
                          )
                        )}
                        <input
                          type="color"
                          value={draft.colorHex}
                          onChange={(e) => patchDraft({ colorHex: e.target.value })}
                          className="ml-auto h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                        />
                      </div>
                    </div>

                    {/* Cobertura Opcional de Fundo (ao expandir sobre linhas/tabelas) */}
                    <div className="flex items-center justify-between rounded border border-slate-500/20 p-2">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={draft.opaqueBackground}
                          onChange={(e) =>
                            patchDraft({ opaqueBackground: e.target.checked })
                          }
                          className="accent-[#1B2952]"
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

                    <button
                      type="button"
                      onClick={() =>
                        void commitTextBlockDraftToPdf({
                          tab,
                          block: activeTextBlock,
                          draft,
                          platform,
                        })
                      }
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-[#1B2952] py-2 font-medium text-white shadow-sm hover:bg-[#2F4D8F]"
                    >
                      <Check className="h-4 w-4" strokeWidth={1.5} />
                      Aplicar no PDF (Ctrl+Enter)
                    </button>
                  </div>
                );
              })()
            ) : selectedAnnotation ? (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {describeAnnotType(selectedAnnotation.type)}
                  </span>
                  <button
                    onClick={() =>
                      void executeCommand(
                        tab.tabId,
                        new DeleteAnnotationCommand(tab.tabId, selectedAnnotation, mutator)
                      )
                    }
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-red-600 hover:bg-red-500/10 dark:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Excluir
                  </button>
                </div>

                <div>
                  <label className="mb-1.5 block opacity-75">Cor Principal</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      '#FACC15',
                      '#4ADE80',
                      '#60A5FA',
                      '#F87171',
                      '#C084FC',
                      '#1B2952',
                      '#0F172A',
                    ].map((c) => (
                      <button
                        key={c}
                        onClick={() =>
                          updateSelectedAnnot({ color: c, strokeColor: c }, 'Alterar cor')
                        }
                        style={{ backgroundColor: c }}
                        className={`h-5 w-5 rounded-full border ${
                          selectedAnnotation.color === c
                            ? 'ring-2 ring-[#1B2952] dark:ring-white'
                            : 'border-black/20'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 flex justify-between opacity-75">
                    <span>Opacidade</span>
                    <span className="tabular-nums">
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
                    className="w-full accent-[#1B2952]"
                  />
                </div>

                <div>
                  <label className="mb-1 block opacity-75">Texto / Comentário Vinculado</label>
                  <textarea
                    rows={3}
                    value={selectedAnnotation.contents ?? ''}
                    onChange={(e) =>
                      updateSelectedAnnot({ contents: e.target.value }, 'Editar nota')
                    }
                    placeholder="Escreva uma observação de revisão..."
                    className={`w-full rounded border p-2 text-xs outline-none ${
                      darkMode
                        ? 'border-[#334155] bg-[#111827] text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className="mb-1 block opacity-75">Status de Revisão</label>
                  <select
                    value={selectedAnnotation.reviewStatus ?? 'none'}
                    onChange={(e) =>
                      updateSelectedAnnot(
                        { reviewStatus: e.target.value as ReviewStatus },
                        'Alterar status de revisão'
                      )
                    }
                    className={`h-8 w-full rounded border px-2 ${
                      darkMode
                        ? 'border-[#334155] bg-[#111827]'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <option value="none">Sem status</option>
                    <option value="approved">Aprovado</option>
                    <option value="rejected">Rejeitado</option>
                    <option value="completed">Concluído</option>
                  </select>
                </div>

                {/* Respostas Encadeadas */}
                <div className="space-y-2 border-t border-slate-500/20 pt-3">
                  <div className="font-medium">Respostas ({selectedAnnotation.replies?.length ?? 0})</div>
                  {(selectedAnnotation.replies ?? []).map((rep) => (
                    <div
                      key={rep.id}
                      className="rounded bg-slate-500/10 p-2 text-[11px]"
                    >
                      <div className="font-semibold">{rep.author}</div>
                      <div>{rep.text}</div>
                    </div>
                  ))}
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      placeholder="Responder comentário..."
                      className={`h-7 flex-1 rounded border px-2 ${
                        darkMode
                          ? 'border-[#334155] bg-[#111827]'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    />
                    <button
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
                      className="rounded bg-[#1B2952] px-2.5 text-white hover:bg-[#2F4D8F]"
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-10 text-center opacity-65">
                Selecione uma anotação, forma, carimbo ou bloco de texto na página para editar suas
                propriedades em tempo real.
              </div>
            )}
          </>
        )}

        {/* 2. ASSISTENTE DE MARCA D'ÁGUA */}
        {rightInspectorFlow === 'watermark' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              <Droplets className="h-4 w-4 text-[#1B2952] dark:text-blue-400" strokeWidth={1.5} />
              <span>Marca d&apos;Água em Lote</span>
            </div>
            <div>
              <label className="mb-1 block opacity-75">Texto da Marca d&apos;Água</label>
              <input
                type="text"
                value={watermark.text}
                onChange={(e) => setWatermark({ ...watermark, text: e.target.value })}
                className={`h-8 w-full rounded border px-2 ${
                  darkMode ? 'border-[#334155] bg-[#111827]' : 'border-slate-200 bg-slate-50'
                }`}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block opacity-75">Tamanho (pt)</label>
                <input
                  type="number"
                  value={watermark.fontSizePt}
                  onChange={(e) =>
                    setWatermark({ ...watermark, fontSizePt: Number(e.target.value) || 36 })
                  }
                  className={`h-8 w-full rounded border px-2 ${
                    darkMode ? 'border-[#334155] bg-[#111827]' : 'border-slate-200 bg-slate-50'
                  }`}
                />
              </div>
              <div>
                <label className="mb-1 block opacity-75">Ângulo (°)</label>
                <input
                  type="number"
                  value={watermark.angleDeg}
                  onChange={(e) =>
                    setWatermark({ ...watermark, angleDeg: Number(e.target.value) || 0 })
                  }
                  className={`h-8 w-full rounded border px-2 ${
                    darkMode ? 'border-[#334155] bg-[#111827]' : 'border-slate-200 bg-slate-50'
                  }`}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block opacity-75">
                Opacidade ({Math.round(watermark.opacity * 100)}%)
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
                className="w-full accent-[#1B2952]"
              />
            </div>
            <button
              onClick={() =>
                void applyStructuralMutation(
                  tab.tabId,
                  `Aplicar marca d'água "${watermark.text}"`,
                  (b) => applyWatermarkToPdf(b, watermark)
                )
              }
              className="w-full rounded-md bg-[#1B2952] py-2 font-medium text-white hover:bg-[#2F4D8F]"
            >
              Aplicar Marca d&apos;Água
            </button>
          </div>
        )}

        {/* 3. CABEÇALHO E RODAPÉ */}
        {rightInspectorFlow === 'header-footer' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              <FileText className="h-4 w-4 text-[#1B2952] dark:text-blue-400" strokeWidth={1.5} />
              <span>Cabeçalho e Rodapé Dinâmicos</span>
            </div>
            <div>
              <label className="mb-1 block opacity-75">Cabeçalho Esquerdo</label>
              <input
                type="text"
                value={headerFooter.headerLeft ?? ''}
                onChange={(e) =>
                  setHeaderFooter({ ...headerFooter, headerLeft: e.target.value })
                }
                className={`h-8 w-full rounded border px-2 ${
                  darkMode ? 'border-[#334155] bg-[#111827]' : 'border-slate-200 bg-slate-50'
                }`}
              />
            </div>
            <div>
              <label className="mb-1 block opacity-75">
                Rodapé Central (suporta {'{page}'}, {'{total}'}, {'{date}'})
              </label>
              <input
                type="text"
                value={headerFooter.footerCenter ?? ''}
                onChange={(e) =>
                  setHeaderFooter({ ...headerFooter, footerCenter: e.target.value })
                }
                className={`h-8 w-full rounded border px-2 ${
                  darkMode ? 'border-[#334155] bg-[#111827]' : 'border-slate-200 bg-slate-50'
                }`}
              />
            </div>
            <button
              onClick={() =>
                void applyStructuralMutation(
                  tab.tabId,
                  'Inserir cabeçalho e rodapé',
                  (b) => applyHeaderFooterToPdf(b, headerFooter)
                )
              }
              className="w-full rounded-md bg-[#1B2952] py-2 font-medium text-white hover:bg-[#2F4D8F]"
            >
              Aplicar em Todas as Páginas
            </button>
          </div>
        )}

        {/* 4. NUMERAÇÃO BATES JURÍDICA */}
        {rightInspectorFlow === 'bates' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              <Hash className="h-4 w-4 text-[#1B2952] dark:text-blue-400" strokeWidth={1.5} />
              <span>Numeração Jurídica Bates</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block opacity-75">Prefixo</label>
                <input
                  type="text"
                  value={bates.prefix}
                  onChange={(e) => setBates({ ...bates, prefix: e.target.value })}
                  className={`h-8 w-full rounded border px-2 ${
                    darkMode ? 'border-[#334155] bg-[#111827]' : 'border-slate-200 bg-slate-50'
                  }`}
                />
              </div>
              <div>
                <label className="mb-1 block opacity-75">Dígitos</label>
                <input
                  type="number"
                  min={3}
                  max={10}
                  value={bates.digits}
                  onChange={(e) => setBates({ ...bates, digits: Number(e.target.value) || 6 })}
                  className={`h-8 w-full rounded border px-2 ${
                    darkMode ? 'border-[#334155] bg-[#111827]' : 'border-slate-200 bg-slate-50'
                  }`}
                />
              </div>
            </div>
            <div className="rounded bg-slate-500/10 p-2 font-mono text-[11px]">
              Prévia: {bates.prefix}
              {String(bates.startNumber).padStart(bates.digits, '0')}
              {bates.suffix}
            </div>
            <button
              onClick={() =>
                void applyStructuralMutation(
                  tab.tabId,
                  'Aplicar numeração Bates',
                  (b) => applyBatesNumberingToPdf(b, bates)
                )
              }
              className="w-full rounded-md bg-[#1B2952] py-2 font-medium text-white hover:bg-[#2F4D8F]"
            >
              Estampar Numeração Bates
            </button>
          </div>
        )}

        {/* 5. COMPRESSÃO INTELIGENTE */}
        {rightInspectorFlow === 'compress' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              <Minimize2 className="h-4 w-4 text-[#1B2952] dark:text-blue-400" strokeWidth={1.5} />
              <span>Compressão e Otimização</span>
            </div>

            <div className="rounded-lg border border-slate-500/20 p-3 space-y-1.5 tabular-nums">
              <div className="flex justify-between">
                <span className="opacity-70">Peso atual:</span>
                <strong>{formatBytes(compEstimate.originalBytes)}</strong>
              </div>
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Peso estimado:</span>
                <strong>~{formatBytes(compEstimate.estimatedBytes)}</strong>
              </div>
            </div>

            <div>
              <label className="mb-1 block opacity-75">Nível de Compressão</label>
              <select
                value={compression.qualityPreset}
                onChange={(e) =>
                  setCompression({
                    ...compression,
                    qualityPreset: e.target.value as CompressionConfig['qualityPreset'],
                  })
                }
                className={`h-8 w-full rounded border px-2 ${
                  darkMode ? 'border-[#334155] bg-[#111827]' : 'border-slate-200 bg-white'
                }`}
              >
                <option value="high">Alta Qualidade (220 DPI)</option>
                <option value="balanced">Equilibrado Recomendado (150 DPI)</option>
                <option value="low">Compressão Máxima (72 DPI)</option>
              </select>
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={compression.stripMetadata}
                onChange={(e) =>
                  setCompression({ ...compression, stripMetadata: e.target.checked })
                }
                className="accent-[#1B2952]"
              />
              <span>Remover metadados ocultos e objetos órfãos</span>
            </label>

            <button
              onClick={async () => {
                await applyStructuralMutation(tab.tabId, 'Comprimir e otimizar PDF', (b) =>
                  optimizeAndCompressPdf(b, compression)
                );
                showToast('Documento otimizado e reescrito com sucesso.', 'success');
              }}
              className="w-full rounded-md bg-[#1B2952] py-2 font-medium text-white hover:bg-[#2F4D8F]"
            >
              Comprimir Documento
            </button>
          </div>
        )}

        {/* 6. TARJAMENTO DEFINITIVO (REDACTION) + BUSCA DE PADRÕES LGPD */}
        {rightInspectorFlow === 'redact' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-red-600 dark:text-red-400">
              <ShieldAlert className="h-4 w-4" strokeWidth={1.5} />
              <span>Tarjamento Definitivo (LGPD)</span>
            </div>
            <p className="text-[11px] opacity-80">
              Arraste sobre a página para marcar áreas ou localize dados sensíveis em lote abaixo.
              Ao confirmar, os textos e vetores sob a tarja são destruídos fisicamente.
            </p>

            <div className="space-y-1.5">
              <div className="font-medium opacity-80">Marcar Padrões Automaticamente:</div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() =>
                    void markPatternForRedaction('CPF', '\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}')
                  }
                  className="rounded border border-slate-500/30 py-1.5 font-medium hover:bg-slate-500/10"
                >
                  Buscar CPFs
                </button>
                <button
                  onClick={() =>
                    void markPatternForRedaction(
                      'CNPJ',
                      '\\d{2}\\.\\d{3}\\.\\d{3}\\/\\d{4}-\\d{2}'
                    )
                  }
                  className="rounded border border-slate-500/30 py-1.5 font-medium hover:bg-slate-500/10"
                >
                  Buscar CNPJs
                </button>
                <button
                  onClick={() =>
                    void markPatternForRedaction(
                      'E-mail',
                      '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}'
                    )
                  }
                  className="rounded border border-slate-500/30 py-1.5 font-medium hover:bg-slate-500/10"
                >
                  Buscar E-mails
                </button>
                <button
                  onClick={() =>
                    void markPatternForRedaction(
                      'Telefone',
                      '\\(\\d{2}\\)\\s?\\d{4,5}-\\d{4}'
                    )
                  }
                  className="rounded border border-slate-500/30 py-1.5 font-medium hover:bg-slate-500/10"
                >
                  Buscar Telefones
                </button>
              </div>
            </div>

            <button
              onClick={() => void applyAllPendingRedactions()}
              className="w-full rounded-md bg-red-600 py-2 font-semibold text-white shadow-sm hover:bg-red-700"
            >
              Aplicar Tarjamento Permanente
            </button>
          </div>
        )}

        {/* 7. ASSINATURA VISUAL RÁPIDA */}
        {rightInspectorFlow === 'signature' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              <FileSignature
                className="h-4 w-4 text-[#1B2952] dark:text-blue-400"
                strokeWidth={1.5}
              />
              <span>Assinatura Eletrônica Visual</span>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="opacity-75">Desenhar Rubrica / Assinatura:</span>
                <button
                  onClick={clearSignaturePad}
                  className="text-[11px] text-blue-600 hover:underline dark:text-blue-400"
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
                  ctx.strokeStyle = '#1B2952';
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
                className="w-full cursor-crosshair rounded border border-slate-300 bg-white touch-none"
              />
              <button
                onClick={() => void saveDrawnSignatureAndStamp()}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded bg-[#1B2952] py-1.5 font-medium text-white hover:bg-[#2F4D8F]"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                Salvar e Inserir na Página
              </button>
            </div>

            <div className="border-t border-slate-500/20 pt-3">
              <label className="mb-1 block opacity-75">Ou digitar nome manuscrito:</label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={typedSigText}
                  onChange={(e) => setTypedSigText(e.target.value)}
                  placeholder="Seu Nome Completo"
                  className={`h-8 flex-1 rounded border px-2 ${
                    darkMode ? 'border-[#334155] bg-[#111827]' : 'border-slate-200 bg-slate-50'
                  }`}
                />
                <button
                  onClick={() => void createTypedSignatureAndStamp()}
                  className="rounded bg-[#1B2952] px-3 text-white hover:bg-[#2F4D8F]"
                >
                  Inserir
                </button>
              </div>
            </div>

            {savedSignatures.length > 0 && (
              <div className="space-y-1.5 border-t border-slate-500/20 pt-3">
                <div className="opacity-75">Assinaturas Salvas no Perfil:</div>
                {savedSignatures.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => void stampVisualSignatureOnPage(s.dataUrl)}
                    className="flex cursor-pointer items-center justify-between rounded border border-slate-300 bg-white p-1.5 hover:border-[#1B2952]"
                  >
                    <img src={s.dataUrl} alt={s.label} className="h-8 object-contain" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void platform.certificateStore.deleteVisualSignature(s.id);
                        setSavedSignatures((prev) => prev.filter((x) => x.id !== s.id));
                      }}
                      className="p-1 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 8. OCR PESQUISÁVEL */}
        {rightInspectorFlow === 'ocr' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              <ScanText className="h-4 w-4 text-[#1B2952] dark:text-blue-400" strokeWidth={1.5} />
              <span>OCR — Reconhecimento Óptico</span>
            </div>
            <p className="text-[11px] opacity-80">
              Converte páginas digitalizadas em texto selecionável e pesquisável preservando a
              aparência visual original.
            </p>
            <div>
              <label className="mb-1 block opacity-75">Idioma do Documento</label>
              <select
                value={ocrLang}
                onChange={(e) => setOcrLang(e.target.value as 'por' | 'eng' | 'por+eng')}
                className={`h-8 w-full rounded border px-2 ${
                  darkMode ? 'border-[#334155] bg-[#111827]' : 'border-slate-200 bg-white'
                }`}
              >
                <option value="por+eng">Português + Inglês</option>
                <option value="por">Português (Brasil)</option>
                <option value="eng">Inglês</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block opacity-75">Intervalo</label>
              <select
                value={ocrScope}
                onChange={(e) => setOcrScope(e.target.value as 'current' | 'all')}
                className={`h-8 w-full rounded border px-2 ${
                  darkMode ? 'border-[#334155] bg-[#111827]' : 'border-slate-200 bg-white'
                }`}
              >
                <option value="current">Página atual ({tab.currentPage + 1})</option>
                <option value="all">Todas as páginas ({tab.geometries.length})</option>
              </select>
            </div>
            <button
              disabled={isRunningOcr}
              onClick={() => void handleRunOcr()}
              className="w-full rounded-md bg-[#1B2952] py-2 font-medium text-white hover:bg-[#2F4D8F] disabled:opacity-50"
            >
              {isRunningOcr ? 'Processando OCR...' : 'Iniciar OCR Pesquisável'}
            </button>
          </div>
        )}

        {/* 9. SANITIZAÇÃO */}
        {rightInspectorFlow === 'sanitize' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              <Shield className="h-4 w-4 text-[#1B2952] dark:text-blue-400" strokeWidth={1.5} />
              <span>Sanitização de Privacidade</span>
            </div>
            <p className="text-[11px] opacity-80">
              Remove metadados ocultos (Autor, Criador, Produtor, XMP), ações de abertura e
              scripts JavaScript embutidos antes de compartilhar o PDF.
            </p>
            <button
              onClick={async () => {
                await applyStructuralMutation(tab.tabId, 'Sanitizar documento PDF', (b) =>
                  sanitizePdfDocument(b)
                );
                showToast('Metadados ocultos e scripts removidos com sucesso.', 'success');
              }}
              className="w-full rounded-md bg-[#1B2952] py-2 font-medium text-white hover:bg-[#2F4D8F]"
            >
              Limpar e Sanitizar Documento
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
