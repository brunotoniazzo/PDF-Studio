import type {
  IPlatformAdapter,
  MetricFontFamily,
  PdfEditableTextBlock,
  PdfPageGeometry,
  PdfRect,
  RichTextRun,
  RichTextStyle,
} from '@pdf-studio/platform-contracts';
import {
  type CommitStyledLine,
  type CommitStyledSegment,
  mapMetricFamilyToStandardFont,
  sharedPdfEngine,
} from '@pdf-studio/pdf-engine';
import {
  type ActiveTextBlockDraft,
  BinaryDocumentMutationCommand,
  type DocumentTabState,
  usePdfStudioStore,
} from '@pdf-studio/editor-core';
import {
  areRichStylesEqual,
  cssFontStackForMetric,
  normalizeRichRuns,
  runsToPlainText,
} from './richTextRuns';

export function hexToRgbaTuple(hex: string, alpha = 255): [number, number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
      : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [27, 41, 82, alpha];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255, alpha];
}

export function makeFontVariantKey(
  family: MetricFontFamily,
  bold: boolean,
  italic: boolean
): string {
  return `${family}:${bold ? 'b' : 'r'}${italic ? 'i' : 'n'}`;
}

interface StyledToken {
  text: string;
  isWhitespace: boolean;
  style: RichTextStyle;
  widthPt: number;
}

let cachedMeasureCtx: CanvasRenderingContext2D | null | undefined;

export function measureStyledTextWidthPt(txt: string, st: RichTextStyle): number {
  if (!txt) return 0;
  if (typeof document === 'undefined') {
    return txt.length * st.fontSizePt * (st.isBold ? 0.56 : 0.52);
  }
  if (cachedMeasureCtx === undefined) {
    cachedMeasureCtx = document.createElement('canvas').getContext('2d') ?? null;
  }
  if (!cachedMeasureCtx) {
    return txt.length * st.fontSizePt * (st.isBold ? 0.56 : 0.52);
  }
  const weight = st.isBold ? 'bold' : 'normal';
  const italic = st.isItalic ? 'italic' : 'normal';
  cachedMeasureCtx.font = `${italic} ${weight} ${st.fontSizePt}px ${cssFontStackForMetric(st.fontFamily)}`;
  return cachedMeasureCtx.measureText(txt).width;
}

/**
 * Realiza quebra de linhas multi-estilo (RichTextRun[]) respeitando exatamente
 * a largura expandida/ajustada do bloco (boxWidthPt), preservando Negrito, Itálico,
 * Sublinhado, Fonte, Tamanho e Cor individualmente em cada palavra!
 */
export function layoutRichRunsToStyledLines(
  runs: RichTextRun[],
  boxWidthPt: number
): CommitStyledLine[] {
  const safeMaxWidthPt = Math.max(24, boxWidthPt + 1.5);
  const measureTokenPt = (txt: string, st: RichTextStyle): number =>
    measureStyledTextWidthPt(txt, st);

  // 1. Divide runs em parágrafos explícitos por '\n'
  const paragraphs: RichTextRun[][] = [[]];
  for (const run of runs) {
    const parts = run.text.replace(/\r\n/g, '\n').split('\n');
    parts.forEach((part, idx) => {
      if (idx > 0) {
        paragraphs.push([]);
      }
      if (part.length > 0) {
        paragraphs[paragraphs.length - 1].push({
          text: part,
          style: { ...run.style },
        });
      }
    });
  }

  const finalLines: CommitStyledLine[] = [];

  const tokensToCommitLine = (tokens: StyledToken[]): CommitStyledLine => {
    // Remove espaços em branco residuais no fim da linha visual
    let endIdx = tokens.length;
    while (endIdx > 0 && tokens[endIdx - 1].isWhitespace) {
      endIdx--;
    }
    const trimmed = tokens.slice(0, endIdx);
    const mergedRuns: RichTextRun[] = [];
    for (const tk of trimmed) {
      const prev = mergedRuns[mergedRuns.length - 1];
      if (prev && areRichStylesEqual(prev.style, tk.style)) {
        prev.text += tk.text;
      } else {
        mergedRuns.push({ text: tk.text, style: { ...tk.style } });
      }
    }

    const segments: CommitStyledSegment[] = mergedRuns.map((mr) => ({
      text: mr.text,
      fontKey: makeFontVariantKey(
        mr.style.fontFamily,
        mr.style.isBold,
        mr.style.isItalic
      ),
      standardFontName: mapMetricFamilyToStandardFont(
        mr.style.fontFamily,
        mr.style.isBold,
        mr.style.isItalic
      ),
      fontSizePt: mr.style.fontSizePt,
      isUnderline: Boolean(mr.style.isUnderline),
      rgba: hexToRgbaTuple(mr.style.colorHex, 255),
    }));

    return { segments };
  };

  for (const paraRuns of paragraphs) {
    if (paraRuns.length === 0) {
      finalLines.push({ segments: [] });
      continue;
    }

    // Tokeniza mantendo palavras e espaços com o estilo exato de cada trecho
    const tokens: StyledToken[] = [];
    for (const r of paraRuns) {
      const matches = r.text.match(/\S+|\s+/g) ?? [];
      for (const m of matches) {
        tokens.push({
          text: m,
          isWhitespace: /^\s+$/.test(m),
          style: r.style,
          widthPt: measureTokenPt(m, r.style),
        });
      }
    }

    let currentTokens: StyledToken[] = [];
    let currentWidth = 0;

    for (const tk of tokens) {
      if (currentTokens.length === 0 && tk.isWhitespace) {
        // Ignora espaço inicial após quebra automática de linha
        continue;
      }

      if (currentWidth + tk.widthPt <= safeMaxWidthPt || currentTokens.length === 0) {
        // Se uma palavra única for maior que a largura total da caixa, quebra por caracteres
        if (!tk.isWhitespace && tk.widthPt > safeMaxWidthPt && currentTokens.length === 0) {
          let chunk = '';
          let chunkW = 0;
          for (const ch of tk.text) {
            const cw = measureTokenPt(ch, tk.style);
            if (chunk && chunkW + cw > safeMaxWidthPt) {
              finalLines.push(
                tokensToCommitLine([
                  { text: chunk, isWhitespace: false, style: tk.style, widthPt: chunkW },
                ])
              );
              chunk = ch;
              chunkW = cw;
            } else {
              chunk += ch;
              chunkW += cw;
            }
          }
          if (chunk) {
            currentTokens = [
              { text: chunk, isWhitespace: false, style: tk.style, widthPt: chunkW },
            ];
            currentWidth = chunkW;
          }
        } else {
          currentTokens.push(tk);
          currentWidth += tk.widthPt;
        }
      } else {
        finalLines.push(tokensToCommitLine(currentTokens));
        if (tk.isWhitespace) {
          currentTokens = [];
          currentWidth = 0;
        } else {
          currentTokens = [tk];
          currentWidth = tk.widthPt;
        }
      }
    }

    if (currentTokens.length > 0) {
      finalLines.push(tokensToCommitLine(currentTokens));
    }
  }

  return finalLines;
}

/**
 * Calcula largura/altura ideais do bloco conforme o texto digitado e estilos aplicados,
 * expandindo blocos de linha única até a margem útil da página e preservando largura
 * de coluna em parágrafos originalmente multi-linha.
 */
export function autoFitDraftRect(
  draft: ActiveTextBlockDraft,
  runs: RichTextRun[],
  lineHeightPt: number,
  pageGeometry?: PdfPageGeometry | null
): PdfRect {
  // Calcula largura natural de cada parágrafo explícito e da maior palavra isolada
  let maxNaturalLineWidthPt = 0;
  let maxSingleTokenWidthPt = 0;
  let currentParaWidthPt = 0;
  for (const r of runs) {
    const parts = r.text.replace(/\r\n/g, '\n').split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        maxNaturalLineWidthPt = Math.max(maxNaturalLineWidthPt, currentParaWidthPt);
        currentParaWidthPt = 0;
      }
      if (parts[i]) {
        currentParaWidthPt += measureStyledTextWidthPt(parts[i], r.style);
        const words = parts[i].match(/\S+/g) ?? [];
        for (const w of words) {
          maxSingleTokenWidthPt = Math.max(
            maxSingleTokenWidthPt,
            measureStyledTextWidthPt(w, r.style)
          );
        }
      }
    }
  }
  maxNaturalLineWidthPt = Math.max(maxNaturalLineWidthPt, currentParaWidthPt);

  const baseOrigWidthPt = Math.max(
    28,
    draft.calibratedOrigWidthPt ??
      draft.sourceBlock.rect.right - draft.sourceBlock.rect.left
  );
  const currentWidthPt = Math.max(28, draft.rect.right - draft.rect.left);
  const isOriginallyMultiLine = draft.sourceBlock.lines.length > 1;

  let nextRight = draft.rect.left + currentWidthPt;
  if (!draft.hasManualWidthResize) {
    const pageLeft = pageGeometry?.cropBox.left ?? 0;
    const pageRight =
      pageGeometry?.cropBox.right ?? pageLeft + (pageGeometry?.widthPt ?? 595.28);
    const maxAvailWidthPt = Math.max(64, pageRight - 28 - draft.rect.left);

    if (isOriginallyMultiLine) {
      const colWidthPt = Math.min(
        maxAvailWidthPt,
        Math.max(baseOrigWidthPt, maxSingleTokenWidthPt + 6)
      );
      nextRight = draft.rect.left + colWidthPt;
    } else {
      const paddedNaturalWidthPt = maxNaturalLineWidthPt + 8;
      const minBaselineWidthPt = draft.alignment !== 'left' ? baseOrigWidthPt : 44;
      const targetWidthPt = Math.min(
        maxAvailWidthPt,
        Math.max(minBaselineWidthPt, paddedNaturalWidthPt)
      );
      nextRight = draft.rect.left + targetWidthPt;
    }
  }

  const finalBoxWidthPt = Math.max(28, nextRight - draft.rect.left);
  const styledLines = layoutRichRunsToStyledLines(runs, finalBoxWidthPt);
  const effectiveLineCount = Math.max(1, styledLines.length);
  const effectiveStepY = Math.max(lineHeightPt, draft.fontSizePt * 1.0);
  const minFitHeightPt = Math.max(
    16,
    (effectiveLineCount - 1) * effectiveStepY + Math.max(lineHeightPt, draft.fontSizePt * 1.2)
  );

  const currentHeightPt = Math.max(16, draft.rect.top - draft.rect.bottom);
  const nextHeightPt = draft.hasManualHeightResize
    ? Math.max(currentHeightPt, minFitHeightPt)
    : minFitHeightPt;

  return {
    left: draft.rect.left,
    right: nextRight,
    top: draft.rect.top,
    bottom: draft.rect.top - nextHeightPt,
  };
}

export function createDraftFromTextBlock(block: PdfEditableTextBlock): ActiveTextBlockDraft {
  const defaultStyle: RichTextStyle = {
    fontFamily: block.fallbackFontFamily,
    fontSizePt: block.fontSizePt,
    isBold: Boolean(block.isBold),
    isItalic: Boolean(block.isItalic),
    isUnderline: false,
    colorHex: block.colorHex,
  };

  const initialRuns =
    block.runs && block.runs.length > 0
      ? normalizeRichRuns(block.runs, defaultStyle)
      : [{ text: block.originalText, style: { ...defaultStyle } }];

  const rawWidthPt = Math.max(28, block.rect.right - block.rect.left);
  const maxMeasuredLinePt = block.lines.reduce(
    (maxW, line) => Math.max(maxW, measureStyledTextWidthPt(line.text, defaultStyle)),
    0
  );
  const calibratedOrigWidthPt = Math.max(rawWidthPt, maxMeasuredLinePt + 2);

  return {
    blockId: block.id,
    sourceBlock: block,
    pageIndex: block.pageIndex,
    text: runsToPlainText(initialRuns),
    runs: initialRuns,
    defaultStyle,
    selection: { start: 0, end: 0 },
    formatRevision: 1,
    rect: {
      ...block.rect,
      right: block.rect.left + calibratedOrigWidthPt,
    },
    calibratedOrigWidthPt,
    hasUserEdited: false,
    fontSizePt: block.fontSizePt,
    lineHeightPt: block.lineHeightPt,
    fontFamily: block.fallbackFontFamily,
    isBold: Boolean(block.isBold),
    isItalic: Boolean(block.isItalic),
    alignment: block.alignment ?? 'left',
    colorHex: block.colorHex,
    rgba: [...block.rgba] as [number, number, number, number],
    opaqueBackground: false,
    backgroundColorHex: block.backgroundColorHex ?? '#FFFFFF',
  };
}

export async function commitTextBlockDraftToPdf(params: {
  tab: DocumentTabState;
  block: PdfEditableTextBlock;
  draft: ActiveTextBlockDraft;
  platform: IPlatformAdapter;
  deleteBlockOnly?: boolean;
}): Promise<void> {
  const { tab, block, draft, platform, deleteBlockOnly } = params;
  const store = usePdfStudioStore.getState();

  const defaultBlockStyle: RichTextStyle = {
    fontFamily: block.fallbackFontFamily,
    fontSizePt: block.fontSizePt,
    isBold: Boolean(block.isBold),
    isItalic: Boolean(block.isItalic),
    isUnderline: false,
    colorHex: block.colorHex,
  };

  const normalizedDraftRuns = deleteBlockOnly
    ? []
    : normalizeRichRuns(draft.runs, defaultBlockStyle);
  const normalizedOrigRuns = normalizeRichRuns(
    block.runs && block.runs.length > 0
      ? block.runs
      : [{ text: block.originalText, style: { ...defaultBlockStyle } }],
    defaultBlockStyle
  );

  const manualRectChanged =
    Boolean(draft.hasManualWidthResize || draft.hasManualHeightResize) ||
    Math.abs(draft.rect.left - block.rect.left) > 1.5 ||
    Math.abs(draft.rect.top - block.rect.top) > 1.5;

  const runsChanged =
    normalizedDraftRuns.length !== normalizedOrigRuns.length ||
    normalizedDraftRuns.some(
      (r, idx) =>
        r.text !== normalizedOrigRuns[idx]?.text ||
        !areRichStylesEqual(r.style, normalizedOrigRuns[idx].style)
    );
  const blockPropsChanged =
    Math.abs(draft.lineHeightPt - block.lineHeightPt) > 0.2 ||
    draft.alignment !== (block.alignment ?? 'left') ||
    draft.opaqueBackground;

  if (
    !deleteBlockOnly &&
    (!draft.hasUserEdited || (!runsChanged && !manualRectChanged && !blockPropsChanged))
  ) {
    store.updateTabState(tab.tabId, {
      activeEditingBlockId: null,
      activeTextBlockDraft: null,
    });
    return;
  }

  const boxWidthPt = Math.max(24, draft.rect.right - draft.rect.left);
  const styledLines = deleteBlockOnly
    ? []
    : layoutRichRunsToStyledLines(draft.runs, boxWidthPt);

  // Carrega os binários TrueType nativos para todas as variações (família + bold + italic) usadas nos trechos!
  const fontBinariesByKey: Record<string, Uint8Array | null> = {};
  const uniqueStyles = new Map<
    string,
    { family: MetricFontFamily; bold: boolean; italic: boolean }
  >();
  for (const r of draft.runs) {
    const key = makeFontVariantKey(r.style.fontFamily, r.style.isBold, r.style.isItalic);
    if (!uniqueStyles.has(key)) {
      uniqueStyles.set(key, {
        family: r.style.fontFamily,
        bold: r.style.isBold,
        italic: r.style.isItalic,
      });
    }
  }
  await Promise.all(
    Array.from(uniqueStyles.entries()).map(async ([key, spec]) => {
      fontBinariesByKey[key] = await platform.fontRepository.loadFallbackFontBytes(
        spec.family,
        { bold: spec.bold, italic: spec.italic }
      );
    })
  );

  const maxFirstLineFontPt =
    styledLines[0]?.segments.reduce(
      (m, s) => Math.max(m, s.fontSizePt),
      draft.defaultStyle.fontSizePt
    ) ?? draft.defaultStyle.fontSizePt;

  const topMoved = Math.abs(draft.rect.top - block.rect.top) > 1.5;
  const wasManuallyMoved =
    Math.abs(draft.rect.left - block.rect.left) > 1.5 || topMoved;
  const firstSizeChanged = Math.abs(maxFirstLineFontPt - block.fontSizePt) > 0.2;
  const topBaselineYPt =
    !topMoved && !firstSizeChanged && block.lines[0]?.baselineYPt
      ? block.lines[0].baselineYPt
      : draft.rect.top - maxFirstLineFontPt * 0.86;

  const prevBytes = new Uint8Array(tab.bytes);
  const stdDefaultFont = mapMetricFamilyToStandardFont(
    draft.defaultStyle.fontFamily,
    draft.defaultStyle.isBold,
    draft.defaultStyle.isItalic
  );
  const autoCoverBackgroundRgba = hexToRgbaTuple(
    draft.backgroundColorHex || block.backgroundColorHex || '#FFFFFF',
    255
  );
  const backgroundFillRgba = draft.opaqueBackground
    ? autoCoverBackgroundRgba
    : null;

  const committed = await sharedPdfEngine.commitTextBlock({
    docId: tab.docId,
    pageIndex: draft.pageIndex,
    oldObjectIndices: block.objectIndices,
    lines: styledLines.map((sl) => sl.segments.map((s) => s.text).join('')),
    styledLines,
    fontBinariesByKey,
    style: {
      xPt: draft.rect.left,
      boxWidthPt,
      boxBottomYPt: Math.min(
        draft.rect.bottom,
        topBaselineYPt - Math.max(1, styledLines.length) * draft.lineHeightPt
      ),
      boxTopYPt: draft.rect.top,
      origRect: block.rect,
      wasManuallyMoved,
      autoCoverBackgroundRgba,
      topBaselineYPt,
      lineHeightPt: draft.lineHeightPt,
      fontSizePt: draft.defaultStyle.fontSizePt,
      alignment: draft.alignment,
      rgba: hexToRgbaTuple(draft.defaultStyle.colorHex, 255),
      backgroundFillRgba,
      standardFontName: stdDefaultFont,
      fontBytes: null,
    },
  });

  const cmd = new BinaryDocumentMutationCommand(
    deleteBlockOnly
      ? 'Excluir bloco de texto do PDF'
      : 'Editar bloco de texto com formatação rica',
    tab.tabId,
    prevBytes,
    committed.bytes,
    async (id, b) => {
      await usePdfStudioStore.getState().reloadTabBytesDirect(id, b);
    }
  );
  await store.executeCommand(tab.tabId, cmd);
  store.updateTabState(tab.tabId, {
    activeEditingBlockId: null,
    activeTextBlockDraft: null,
  });
  store.showToast(
    deleteBlockOnly
      ? 'Bloco de texto removido da página.'
      : 'Texto atualizado preservando formatação individual dos trechos!',
    'success'
  );
}
