import type {
  IPlatformAdapter,
  MetricFontFamily,
  PdfEditableTextBlock,
} from '@pdf-studio/platform-contracts';
import {
  mapMetricFamilyToStandardFont,
  sharedPdfEngine,
} from '@pdf-studio/pdf-engine';
import {
  type ActiveTextBlockDraft,
  BinaryDocumentMutationCommand,
  type DocumentTabState,
  usePdfStudioStore,
} from '@pdf-studio/editor-core';

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

function cssFontForFamily(family: MetricFontFamily): string {
  switch (family) {
    case 'serif':
      return '"Times New Roman", Times, Georgia, serif';
    case 'mono':
      return '"Courier New", Courier, Consolas, monospace';
    case 'calibri':
      return 'Calibri, "Segoe UI", Arial, sans-serif';
    default:
      return 'Arial, Helvetica, sans-serif';
  }
}

/**
 * Quebra linhas com medição real em pontos PDF (via HTML5 Canvas 2D) respeitando
 * exatamente a NOVA largura expandida ou reduzida pelo usuário (boxWidthPt).
 */
export function wrapTextToWidthPt(
  text: string,
  boxWidthPt: number,
  fontSizePt: number,
  fontFamily: MetricFontFamily,
  isBold: boolean,
  isItalic: boolean
): string[] {
  const safeMaxWidth = Math.max(24, boxWidthPt - 4);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const weight = isBold ? 'bold' : 'normal';
    const style = isItalic ? 'italic' : 'normal';
    ctx.font = `${style} ${weight} ${fontSizePt}px ${cssFontForFamily(fontFamily)}`;
  }

  const measurePt = (str: string): number => {
    if (!ctx) return str.length * fontSizePt * 0.52;
    return ctx.measureText(str).width;
  };

  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
  const outLines: string[] = [];

  for (const para of paragraphs) {
    if (!para.trim()) {
      outLines.push('');
      continue;
    }
    if (measurePt(para) <= safeMaxWidth) {
      outLines.push(para);
      continue;
    }

    const words = para.split(' ');
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (measurePt(candidate) <= safeMaxWidth) {
        currentLine = candidate;
      } else {
        if (currentLine) {
          outLines.push(currentLine);
          currentLine = '';
        }
        // Caso uma única palavra seja maior que a caixa estreita, divide por caracteres
        if (measurePt(word) > safeMaxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (measurePt(chunk + ch) > safeMaxWidth && chunk) {
              outLines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          currentLine = chunk;
        } else {
          currentLine = word;
        }
      }
    }

    if (currentLine) {
      outLines.push(currentLine);
    }
  }

  return outLines;
}

export function createDraftFromTextBlock(block: PdfEditableTextBlock): ActiveTextBlockDraft {
  return {
    blockId: block.id,
    sourceBlock: block,
    pageIndex: block.pageIndex,
    text: block.originalText,
    rect: { ...block.rect },
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

  const finalText = deleteBlockOnly ? '' : draft.text;
  const rectChanged =
    Math.abs(draft.rect.left - block.rect.left) > 0.5 ||
    Math.abs(draft.rect.right - block.rect.right) > 0.5 ||
    Math.abs(draft.rect.bottom - block.rect.bottom) > 0.5 ||
    Math.abs(draft.rect.top - block.rect.top) > 0.5;
  const styleChanged =
    Math.abs(draft.fontSizePt - block.fontSizePt) > 0.2 ||
    Math.abs(draft.lineHeightPt - block.lineHeightPt) > 0.2 ||
    draft.fontFamily !== block.fallbackFontFamily ||
    draft.isBold !== Boolean(block.isBold) ||
    draft.isItalic !== Boolean(block.isItalic) ||
    draft.alignment !== (block.alignment ?? 'left') ||
    draft.colorHex.toLowerCase() !== block.colorHex.toLowerCase() ||
    draft.opaqueBackground;

  if (!deleteBlockOnly && finalText === block.originalText && !rectChanged && !styleChanged) {
    store.updateTabState(tab.tabId, {
      activeEditingBlockId: null,
      activeTextBlockDraft: null,
    });
    return;
  }

  const boxWidthPt = Math.max(24, draft.rect.right - draft.rect.left);
  const wrappedLines = deleteBlockOnly
    ? []
    : wrapTextToWidthPt(
        finalText,
        boxWidthPt,
        draft.fontSizePt,
        draft.fontFamily,
        draft.isBold,
        draft.isItalic
      );

  const fontBytes = await platform.fontRepository.loadFallbackFontBytes(draft.fontFamily);
  const stdFont = mapMetricFamilyToStandardFont(
    draft.fontFamily,
    draft.isBold,
    draft.isItalic
  );

  // Calcula linha de base superior a partir do topo da caixa (editada/movida ou original)
  const topMoved = Math.abs(draft.rect.top - block.rect.top) > 0.5;
  const sizeChanged = Math.abs(draft.fontSizePt - block.fontSizePt) > 0.2;
  const topBaselineYPt =
    !topMoved && !sizeChanged && block.lines[0]?.baselineYPt
      ? block.lines[0].baselineYPt
      : draft.rect.top - draft.fontSizePt * 0.86;

  const prevBytes = new Uint8Array(tab.bytes);
  const rgba = hexToRgbaTuple(draft.colorHex, 255);
  const backgroundFillRgba = draft.opaqueBackground
    ? hexToRgbaTuple(draft.backgroundColorHex || '#FFFFFF', 255)
    : null;

  const committed = await sharedPdfEngine.commitTextBlock({
    docId: tab.docId,
    pageIndex: draft.pageIndex,
    oldObjectIndices: block.objectIndices,
    lines: wrappedLines,
    style: {
      xPt: draft.rect.left,
      boxWidthPt,
      boxBottomYPt: Math.min(
        draft.rect.bottom,
        topBaselineYPt - Math.max(1, wrappedLines.length) * draft.lineHeightPt
      ),
      boxTopYPt: draft.rect.top,
      topBaselineYPt,
      lineHeightPt: draft.lineHeightPt,
      fontSizePt: draft.fontSizePt,
      alignment: draft.alignment,
      rgba,
      backgroundFillRgba,
      standardFontName: stdFont,
      fontBytes,
    },
  });

  const cmd = new BinaryDocumentMutationCommand(
    deleteBlockOnly ? 'Excluir bloco de texto do PDF' : 'Editar/Redimensionar bloco de texto',
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
      : 'Bloco de texto atualizado com as novas dimensões e estilo!',
    'success'
  );
}
