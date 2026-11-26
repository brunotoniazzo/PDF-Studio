import React, { useCallback, useEffect, useRef } from 'react';
import {
  Bold,
  Check,
  GripHorizontal,
  Italic,
  MoveHorizontal,
  Trash2,
  Underline,
  X,
} from 'lucide-react';
import type {
  PdfEditableTextBlock,
  PdfPageGeometry,
  RichTextStyle,
} from '@pdf-studio/platform-contracts';
import { pdfRectToSvg, ptToMm } from '@pdf-studio/pdf-engine';
import {
  type ActiveTextBlockDraft,
  type DocumentTabState,
  usePdfStudioStore,
} from '@pdf-studio/editor-core';
import { usePlatformActions } from '../context/PlatformContext';
import {
  applyStylePatchToRuns,
  getEffectiveRichStyle,
  hasActiveSubstringSelection,
  parseEditableDomToRuns,
  readSelectionOffsetsInDom,
  renderRunsIntoEditableDom,
  restoreSelectionOffsetsInDom,
  runsToPlainText,
} from '../utils/richTextRuns';
import { commitTextBlockDraftToPdf } from '../utils/textBlockCommit';
import { CollabDivider, CollabToolbar, TextureButton } from './cult/CultUiPrimitives';

export type BlockResizeMode =
  | 'move'
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se';

export function applyPatchToDraft(
  tabId: string,
  draft: ActiveTextBlockDraft,
  patch: Partial<RichTextStyle>
): void {
  const { runs, defaultStyle } = applyStylePatchToRuns(
    draft.runs,
    draft.selection,
    patch,
    draft.defaultStyle
  );
  usePdfStudioStore.getState().updateTabState(tabId, {
    activeTextBlockDraft: {
      ...draft,
      runs,
      defaultStyle,
      text: runsToPlainText(runs),
      formatRevision: draft.formatRevision + 1,
      fontSizePt: defaultStyle.fontSizePt,
      fontFamily: defaultStyle.fontFamily,
      isBold: defaultStyle.isBold,
      isItalic: defaultStyle.isItalic,
      colorHex: defaultStyle.colorHex,
    },
  });
}

export function RichTextBlockEditor({
  tab,
  block,
  draft,
  geometry,
  effSize,
  cssScale,
  onStartTransform,
}: {
  tab: DocumentTabState;
  block: PdfEditableTextBlock;
  draft: ActiveTextBlockDraft;
  geometry: PdfPageGeometry;
  effSize: { widthPt: number; heightPt: number };
  cssScale: number;
  onStartTransform: (e: React.PointerEvent, mode: BlockResizeMode) => void;
}) {
  const { platform } = usePlatformActions();
  const updateTabState = usePdfStudioStore((s) => s.updateTabState);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const isComposingRef = useRef(false);
  const lastRenderedRevRef = useRef<number>(-1);
  const lastRenderedScaleRef = useRef<number>(-1);

  const origBox = pdfRectToSvg(block.rect, effSize.heightPt, geometry.cropBox);
  const draftBox = pdfRectToSvg(draft.rect, effSize.heightPt, geometry.cropBox);
  const widthMm = ptToMm(draft.rect.right - draft.rect.left);
  const heightMm = ptToMm(draft.rect.top - draft.rect.bottom);

  const effectiveStyle = getEffectiveRichStyle(
    draft.runs,
    draft.selection,
    draft.defaultStyle
  );
  const isPartialSelection = hasActiveSubstringSelection(draft.selection);

  // Sincroniza o DOM apenas na montagem inicial, mudança de zoom ou comando de formatação
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const revChanged = lastRenderedRevRef.current !== draft.formatRevision;
    const scaleChanged = Math.abs(lastRenderedScaleRef.current - cssScale) > 0.001;
    if (!revChanged && !scaleChanged) return;

    const wasInitial = lastRenderedRevRef.current === -1;
    lastRenderedRevRef.current = draft.formatRevision;
    lastRenderedScaleRef.current = cssScale;

    renderRunsIntoEditableDom(el, draft.runs, cssScale);

    if (wasInitial) {
      el.focus();
      const totalLen = runsToPlainText(draft.runs).length;
      restoreSelectionOffsetsInDom(el, { start: totalLen, end: totalLen });
    } else if (document.activeElement === el || isPartialSelection) {
      el.focus();
      restoreSelectionOffsetsInDom(el, draft.selection);
    }
  }, [draft.formatRevision, draft.runs, draft.selection, cssScale, isPartialSelection]);

  // Monitora continuamente a seleção dentro do contentEditable
  useEffect(() => {
    const onSelectionChange = () => {
      const el = editorRef.current;
      if (!el || isComposingRef.current) return;
      const offsets = readSelectionOffsetsInDom(el);
      if (!offsets) return;

      const latestTab = usePdfStudioStore
        .getState()
        .tabs.find((t) => t.tabId === tab.tabId);
      const curDraft = latestTab?.activeTextBlockDraft;
      if (!curDraft || curDraft.blockId !== draft.blockId) return;

      if (
        curDraft.selection.start !== offsets.start ||
        curDraft.selection.end !== offsets.end
      ) {
        updateTabState(tab.tabId, {
          activeTextBlockDraft: {
            ...curDraft,
            selection: offsets,
          },
        });
      }
    };

    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [tab.tabId, draft.blockId, updateTabState]);

  const syncDomInputToDraft = useCallback(() => {
    const el = editorRef.current;
    if (!el || isComposingRef.current) return;
    const latestTab = usePdfStudioStore
      .getState()
      .tabs.find((t) => t.tabId === tab.tabId);
    const curDraft = latestTab?.activeTextBlockDraft;
    if (!curDraft) return;

    const parsedRuns = parseEditableDomToRuns(el, curDraft.defaultStyle);
    const offsets = readSelectionOffsetsInDom(el) ?? curDraft.selection;
    updateTabState(tab.tabId, {
      activeTextBlockDraft: {
        ...curDraft,
        runs: parsedRuns,
        text: runsToPlainText(parsedRuns),
        selection: offsets,
      },
    });
  }, [tab.tabId, updateTabState]);

  const toggleBold = () => {
    applyPatchToDraft(tab.tabId, draft, { isBold: !effectiveStyle.isBold });
  };
  const toggleItalic = () => {
    applyPatchToDraft(tab.tabId, draft, { isItalic: !effectiveStyle.isItalic });
  };
  const toggleUnderline = () => {
    applyPatchToDraft(tab.tabId, draft, { isUnderline: !effectiveStyle.isUnderline });
  };

  return (
    <>
      {/* Máscara sobre a posição original no canvas enquanto o bloco está em edição */}
      <div
        style={{
          left: origBox.x * cssScale - 2,
          top: origBox.y * cssScale - 2,
          width: origBox.width * cssScale + 4,
          height: origBox.height * cssScale + 4,
        }}
        className="pointer-events-none absolute z-20 bg-white/95"
      />

      {/* Caixa Interativa Expansível (8 alças) com estética Cult UI */}
      <div
        style={{
          left: Math.max(0, draftBox.x * cssScale - 4),
          top: Math.max(0, draftBox.y * cssScale - 2),
          width: Math.max(110, draftBox.width * cssScale + 16),
          minHeight: Math.max(36, draftBox.height * cssScale + 8),
          backgroundColor: draft.opaqueBackground
            ? draft.backgroundColorHex
            : 'rgba(255,255,255,0.97)',
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="pointer-events-auto absolute z-30 flex flex-col rounded-[8px] border-2 border-[#1A94FF] shadow-[0_10px_28px_rgba(17,24,28,0.18)]"
      >
        {/* Cápsula CollabToolbar Dark acima do bloco */}
        <div className="absolute -top-9 left-0">
          <CollabToolbar darkSurface className="whitespace-nowrap px-2 py-0.5 text-[10px]">
            <div
              onPointerDown={(e) => onStartTransform(e, 'move')}
              title="Arraste para mover este bloco para qualquer posição da página"
              className="flex cursor-move items-center gap-1 pr-1 text-neutral-200"
            >
              <GripHorizontal className="h-3 w-3 opacity-80" strokeWidth={1.6} />
              <span className="font-mono tabular-nums">
                {widthMm} × {heightMm} mm
              </span>
            </div>

            <CollabDivider darkSurface />

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleBold}
              title={
                isPartialSelection
                  ? 'Negrito apenas na palavra/trecho selecionado (Ctrl+B)'
                  : 'Negrito no bloco inteiro (Ctrl+B)'
              }
              className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${
                effectiveStyle.isBold
                  ? 'bg-white text-neutral-950'
                  : 'text-neutral-200 hover:bg-white/15'
              }`}
            >
              <Bold className="h-3 w-3" strokeWidth={2.2} />
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleItalic}
              title={
                isPartialSelection
                  ? 'Itálico apenas na palavra/trecho selecionado (Ctrl+I)'
                  : 'Itálico no bloco inteiro (Ctrl+I)'
              }
              className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${
                effectiveStyle.isItalic
                  ? 'bg-white text-neutral-950'
                  : 'text-neutral-200 hover:bg-white/15'
              }`}
            >
              <Italic className="h-3 w-3" strokeWidth={2} />
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleUnderline}
              title={
                isPartialSelection
                  ? 'Sublinhado apenas na palavra/trecho selecionado (Ctrl+U)'
                  : 'Sublinhado no bloco inteiro (Ctrl+U)'
              }
              className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${
                effectiveStyle.isUnderline
                  ? 'bg-white text-neutral-950'
                  : 'text-neutral-200 hover:bg-white/15'
              }`}
            >
              <Underline className="h-3 w-3" strokeWidth={2} />
            </button>

            {['#0F172A', '#DC2626', '#2563EB'].map((col) => (
              <button
                key={col}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyPatchToDraft(tab.tabId, draft, { colorHex: col })}
                title={
                  isPartialSelection
                    ? `Aplicar cor ${col} apenas ao trecho selecionado`
                    : `Aplicar cor ${col} ao bloco inteiro`
                }
                style={{ backgroundColor: col }}
                className="h-3.5 w-3.5 rounded-full border border-white/60 hover:scale-110"
              />
            ))}

            <CollabDivider darkSurface />

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const margin = 36;
                updateTabState(tab.tabId, {
                  activeTextBlockDraft: {
                    ...draft,
                    rect: {
                      ...draft.rect,
                      left: geometry.cropBox.left + margin,
                      right: geometry.cropBox.left + effSize.widthPt - margin,
                    },
                  },
                });
              }}
              title="Expandir bloco para toda a largura útil da página"
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-neutral-200 hover:bg-white/15"
            >
              <MoveHorizontal className="h-3 w-3" strokeWidth={1.6} />
              <span>Expandir largura</span>
            </button>
          </CollabToolbar>
        </div>

        {/* Editor Rich-Text ContentEditable */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
            syncDomInputToDraft();
          }}
          onInput={syncDomInputToDraft}
          onKeyDown={(e) => {
            const ctrl = e.ctrlKey || e.metaKey;
            if (ctrl && e.key.toLowerCase() === 'b') {
              e.preventDefault();
              toggleBold();
              return;
            }
            if (ctrl && e.key.toLowerCase() === 'i') {
              e.preventDefault();
              toggleItalic();
              return;
            }
            if (ctrl && e.key.toLowerCase() === 'u') {
              e.preventDefault();
              toggleUnderline();
              return;
            }
            if (ctrl && e.key === 'Enter') {
              e.preventDefault();
              void commitTextBlockDraftToPdf({
                tab,
                block,
                draft,
                platform,
              });
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              updateTabState(tab.tabId, {
                activeEditingBlockId: null,
                activeTextBlockDraft: null,
              });
              return;
            }
            if (e.key === 'Enter' && !ctrl) {
              e.preventDefault();
              const sel = window.getSelection();
              if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                const nl = document.createTextNode('\n');
                range.insertNode(nl);
                range.setStartAfter(nl);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
                syncDomInputToDraft();
              }
            }
          }}
          style={{
            lineHeight: `${Math.max(12, draft.lineHeightPt * cssScale)}px`,
            textAlign: draft.alignment,
            minHeight: Math.max(28, draftBox.height * cssScale),
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
          className="w-full flex-1 cursor-text p-1.5 outline-none selection:bg-[#1A94FF]/20"
        />

        {/* Barra Inferior Tátil */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-b-[6px] border-t border-black/[0.08] bg-neutral-100/95 px-2 py-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                void commitTextBlockDraftToPdf({
                  tab,
                  block,
                  draft,
                  platform,
                  deleteBlockOnly: true,
                })
              }
              title="Remover este bloco de texto da página"
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium text-red-600 hover:bg-red-500/10"
            >
              <Trash2 className="h-3 w-3" strokeWidth={1.6} />
              <span className="hidden sm:inline">Excluir</span>
            </button>
            <span className="hidden text-[10px] text-neutral-500 md:inline">
              {isPartialSelection
                ? 'Formatação: trecho selecionado'
                : 'Formatação: bloco inteiro'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <TextureButton
              variant="minimal"
              size="xs"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                updateTabState(tab.tabId, {
                  activeEditingBlockId: null,
                  activeTextBlockDraft: null,
                })
              }
            >
              <X className="h-3 w-3" strokeWidth={1.6} />
              Cancelar
            </TextureButton>
            <TextureButton
              variant="primary"
              size="xs"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                void commitTextBlockDraftToPdf({
                  tab,
                  block,
                  draft,
                  platform,
                })
              }
            >
              <Check className="h-3 w-3" strokeWidth={1.7} />
              Aplicar
            </TextureButton>
          </div>
        </div>

        {/* 8 Alças de Redimensionamento / Expansão Livre (Signal Blue Cult UI) */}
        <div
          onPointerDown={(e) => onStartTransform(e, 'nw')}
          className="absolute -left-1.5 -top-1.5 h-3 w-3 cursor-nwse-resize rounded-[3px] border border-white bg-[#171717] shadow"
        />
        <div
          onPointerDown={(e) => onStartTransform(e, 'n')}
          className="absolute -top-1.5 left-1/2 h-2.5 w-4 -translate-x-1/2 cursor-ns-resize rounded-[3px] border border-white bg-[#1A94FF] shadow"
        />
        <div
          onPointerDown={(e) => onStartTransform(e, 'ne')}
          className="absolute -right-1.5 -top-1.5 h-3 w-3 cursor-nesw-resize rounded-[3px] border border-white bg-[#171717] shadow"
        />
        <div
          onPointerDown={(e) => onStartTransform(e, 'e')}
          title="Arraste para expandir a largura do bloco à direita"
          className="absolute -right-1.5 top-1/2 h-5 w-2.5 -translate-y-1/2 cursor-ew-resize rounded-[3px] border border-white bg-[#1A94FF] shadow"
        />
        <div
          onPointerDown={(e) => onStartTransform(e, 'se')}
          title="Arraste para expandir largura e altura livremente"
          className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-[3px] border border-white bg-[#171717] shadow"
        />
        <div
          onPointerDown={(e) => onStartTransform(e, 's')}
          className="absolute -bottom-1.5 left-1/2 h-2.5 w-4 -translate-x-1/2 cursor-ns-resize rounded-[3px] border border-white bg-[#1A94FF] shadow"
        />
        <div
          onPointerDown={(e) => onStartTransform(e, 'sw')}
          className="absolute -bottom-1.5 -left-1.5 h-3 w-3 cursor-nesw-resize rounded-[3px] border border-white bg-[#171717] shadow"
        />
        <div
          onPointerDown={(e) => onStartTransform(e, 'w')}
          title="Arraste para expandir a largura do bloco à esquerda"
          className="absolute -left-1.5 top-1/2 h-5 w-2.5 -translate-y-1/2 cursor-ew-resize rounded-[3px] border border-white bg-[#1A94FF] shadow"
        />
      </div>
    </>
  );
}
