import type {
  MetricFontFamily,
  RichTextRun,
  RichTextStyle,
} from '@pdf-studio/platform-contracts';

export interface TextSelectionRange {
  start: number;
  end: number;
}

export function cssFontStackForMetric(family: MetricFontFamily): string {
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

export function areRichStylesEqual(a: RichTextStyle, b: RichTextStyle): boolean {
  return (
    a.fontFamily === b.fontFamily &&
    Math.abs(a.fontSizePt - b.fontSizePt) < 0.05 &&
    a.isBold === b.isBold &&
    a.isItalic === b.isItalic &&
    Boolean(a.isUnderline) === Boolean(b.isUnderline) &&
    a.colorHex.toLowerCase() === b.colorHex.toLowerCase()
  );
}

export function normalizeRichRuns(
  runs: RichTextRun[],
  fallbackStyle: RichTextStyle
): RichTextRun[] {
  const merged: RichTextRun[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const prev = merged[merged.length - 1];
    if (prev && areRichStylesEqual(prev.style, r.style)) {
      prev.text += r.text;
    } else {
      merged.push({
        text: r.text,
        style: { ...r.style, isUnderline: Boolean(r.style.isUnderline) },
      });
    }
  }
  if (merged.length === 0) {
    return [{ text: '', style: { ...fallbackStyle } }];
  }
  return merged;
}

export function runsToPlainText(runs: RichTextRun[]): string {
  return runs.map((r) => r.text).join('');
}

export function hasActiveSubstringSelection(selection: TextSelectionRange): boolean {
  return selection.end > selection.start;
}

export function getSelectedTextPreview(
  runs: RichTextRun[],
  selection: TextSelectionRange
): string {
  if (!hasActiveSubstringSelection(selection)) return '';
  const plain = runsToPlainText(runs);
  return plain.slice(selection.start, selection.end);
}

/**
 * Inspeciona o estilo efetivo para exibir nos botões (Bold, Italic, Underline, Fonte, Tamanho, Cor):
 * - Se há seleção ativa (end > start): avalia SOMENTE os caracteres selecionados.
 * - Se não há seleção (end === start): avalia o bloco inteiro.
 */
export function getEffectiveRichStyle(
  runs: RichTextRun[],
  selection: TextSelectionRange,
  fallbackStyle: RichTextStyle
): RichTextStyle {
  const slices: RichTextRun[] = [];

  if (hasActiveSubstringSelection(selection)) {
    let offset = 0;
    for (const r of runs) {
      const rStart = offset;
      const rEnd = offset + r.text.length;
      offset = rEnd;
      const overlapStart = Math.max(rStart, selection.start);
      const overlapEnd = Math.min(rEnd, selection.end);
      if (overlapEnd > overlapStart) {
        const sub = r.text.slice(overlapStart - rStart, overlapEnd - rStart);
        if (sub.length > 0) {
          slices.push({ text: sub, style: r.style });
        }
      }
    }
  } else {
    for (const r of runs) {
      if (r.text.replace(/\n/g, '').length > 0) {
        slices.push(r);
      }
    }
  }

  if (slices.length === 0) {
    return { ...fallbackStyle };
  }

  const first = slices[0].style;
  const nonWsSlices = slices.filter((s) => s.text.replace(/\s/g, '').length > 0);
  const checkSet = nonWsSlices.length > 0 ? nonWsSlices : slices;

  return {
    fontFamily: first.fontFamily,
    fontSizePt: first.fontSizePt,
    colorHex: first.colorHex,
    isBold: checkSet.every((s) => s.style.isBold),
    isItalic: checkSet.every((s) => s.style.isItalic),
    isUnderline: checkSet.every((s) => Boolean(s.style.isUnderline)),
  };
}

/**
 * Regra Central pedida pelo usuário:
 * - Se HÁ seleção de palavra/trecho (selection.end > selection.start): formata SOMENTE o trecho selecionado!
 * - Se NÃO HÁ seleção (selection.end <= selection.start): formata o BLOCO INTEIRO!
 */
export function applyStylePatchToRuns(
  runs: RichTextRun[],
  selection: TextSelectionRange,
  patch: Partial<RichTextStyle>,
  fallbackStyle: RichTextStyle
): { runs: RichTextRun[]; defaultStyle: RichTextStyle } {
  if (!hasActiveSubstringSelection(selection)) {
    // Sem seleção específica -> aplica ao bloco inteiro
    const nextDefault: RichTextStyle = { ...fallbackStyle, ...patch };
    const updatedAll = runs.map((r) => ({
      text: r.text,
      style: { ...r.style, ...patch },
    }));
    return {
      runs: normalizeRichRuns(updatedAll, nextDefault),
      defaultStyle: nextDefault,
    };
  }

  // Com seleção de palavra/trecho -> divide runs nos limites exatos [start, end)
  const result: RichTextRun[] = [];
  let offset = 0;

  for (const r of runs) {
    const len = r.text.length;
    const rStart = offset;
    const rEnd = offset + len;
    offset = rEnd;

    if (rEnd <= selection.start || rStart >= selection.end) {
      // Fora da seleção: mantém intacto!
      result.push({ text: r.text, style: { ...r.style } });
      continue;
    }

    // Parte anterior à seleção dentro deste run
    if (rStart < selection.start) {
      result.push({
        text: r.text.slice(0, selection.start - rStart),
        style: { ...r.style },
      });
    }

    // Parte selecionada -> recebe o novo estilo!
    const selStartInRun = Math.max(0, selection.start - rStart);
    const selEndInRun = Math.min(len, selection.end - rStart);
    if (selEndInRun > selStartInRun) {
      result.push({
        text: r.text.slice(selStartInRun, selEndInRun),
        style: { ...r.style, ...patch },
      });
    }

    // Parte posterior à seleção dentro deste run
    if (rEnd > selection.end) {
      result.push({
        text: r.text.slice(selection.end - rStart),
        style: { ...r.style },
      });
    }
  }

  return {
    runs: normalizeRichRuns(result, fallbackStyle),
    defaultStyle: fallbackStyle,
  };
}

/** Renderiza RichTextRun[] em spans estilizados dentro de um elemento contentEditable */
export function renderRunsIntoEditableDom(
  container: HTMLElement,
  runs: RichTextRun[],
  cssScale: number
): void {
  container.innerHTML = '';
  for (const run of runs) {
    const span = document.createElement('span');
    span.dataset.fontFamily = run.style.fontFamily;
    span.dataset.fontSizePt = String(run.style.fontSizePt);
    span.dataset.bold = run.style.isBold ? '1' : '0';
    span.dataset.italic = run.style.isItalic ? '1' : '0';
    span.dataset.underline = run.style.isUnderline ? '1' : '0';
    span.dataset.colorHex = run.style.colorHex;

    span.style.fontFamily = cssFontStackForMetric(run.style.fontFamily);
    span.style.fontSize = `${Math.max(9, run.style.fontSizePt * cssScale)}px`;
    span.style.fontWeight = run.style.isBold ? '700' : '400';
    span.style.fontStyle = run.style.isItalic ? 'italic' : 'normal';
    span.style.textDecoration = run.style.isUnderline ? 'underline' : 'none';
    span.style.color = run.style.colorHex;

    span.textContent = run.text;
    container.appendChild(span);
  }
}

/** Extrai RichTextRun[] a partir do DOM editado no contentEditable preservando estilos por trecho */
export function parseEditableDomToRuns(
  container: HTMLElement,
  fallbackStyle: RichTextStyle
): RichTextRun[] {
  const extracted: RichTextRun[] = [];

  const resolveNodeStyle = (node: Node, inherited: RichTextStyle): RichTextStyle => {
    if (node.nodeType !== Node.ELEMENT_NODE) return inherited;
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();
    const next: RichTextStyle = { ...inherited };

    if (el.dataset.fontFamily) {
      next.fontFamily = el.dataset.fontFamily as MetricFontFamily;
    }
    if (el.dataset.fontSizePt) {
      const parsed = parseFloat(el.dataset.fontSizePt);
      if (!Number.isNaN(parsed) && parsed > 1) next.fontSizePt = parsed;
    }
    if (el.dataset.bold !== undefined) {
      next.isBold = el.dataset.bold === '1';
    }
    if (el.dataset.italic !== undefined) {
      next.isItalic = el.dataset.italic === '1';
    }
    if (el.dataset.underline !== undefined) {
      next.isUnderline = el.dataset.underline === '1';
    }
    if (el.dataset.colorHex) {
      next.colorHex = el.dataset.colorHex;
    }

    if (tag === 'B' || tag === 'STRONG') next.isBold = true;
    if (tag === 'I' || tag === 'EM') next.isItalic = true;
    if (tag === 'U') next.isUnderline = true;

    return next;
  };

  const walk = (node: Node, currentStyle: RichTextStyle, isFirstChildOfContainer = false) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const val = node.nodeValue ?? '';
      if (val.length > 0) {
        extracted.push({ text: val, style: { ...currentStyle } });
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    if (tag === 'BR') {
      extracted.push({ text: '\n', style: { ...currentStyle } });
      return;
    }

    const isBlock = tag === 'DIV' || tag === 'P';
    if (isBlock && !isFirstChildOfContainer && extracted.length > 0) {
      const last = extracted[extracted.length - 1];
      if (!last.text.endsWith('\n')) {
        extracted.push({ text: '\n', style: { ...currentStyle } });
      }
    }

    const childStyle = resolveNodeStyle(el, currentStyle);
    const children = Array.from(el.childNodes);
    children.forEach((child, idx) => {
      walk(child, childStyle, isFirstChildOfContainer && idx === 0);
    });
  };

  const topChildren = Array.from(container.childNodes);
  topChildren.forEach((child, idx) => {
    walk(child, fallbackStyle, idx === 0);
  });

  // Remove eventual '\n' solitário final inserido por navegadores após <br>
  const normalized = normalizeRichRuns(extracted, fallbackStyle);
  return normalized;
}

/** Lê os offsets de caractere [start, end] da seleção atual caso pertença ao container */
export function readSelectionOffsetsInDom(
  container: HTMLElement
): TextSelectionRange | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (
    !container.contains(range.startContainer) ||
    !container.contains(range.endContainer)
  ) {
    return null;
  }

  const preStart = range.cloneRange();
  preStart.selectNodeContents(container);
  preStart.setEnd(range.startContainer, range.startOffset);
  const start = preStart.toString().length;

  const preEnd = range.cloneRange();
  preEnd.selectNodeContents(container);
  preEnd.setEnd(range.endContainer, range.endOffset);
  const end = preEnd.toString().length;

  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

/** Restaura exatamente a seleção [start, end] nos nós de texto do container */
export function restoreSelectionOffsetsInDom(
  container: HTMLElement,
  selection: TextSelectionRange
): void {
  const sel = window.getSelection();
  if (!sel) return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;
  let startNode: Node | null = null;
  let startOff = 0;
  let endNode: Node | null = null;
  let endOff = 0;
  let lastTextNode: Text | null = null;

  let node = walker.nextNode() as Text | null;
  while (node) {
    lastTextNode = node;
    const len = node.nodeValue?.length ?? 0;
    if (!startNode && selection.start <= currentOffset + len) {
      startNode = node;
      startOff = Math.max(0, selection.start - currentOffset);
    }
    if (!endNode && selection.end <= currentOffset + len) {
      endNode = node;
      endOff = Math.max(0, selection.end - currentOffset);
      break;
    }
    currentOffset += len;
    node = walker.nextNode() as Text | null;
  }

  if (!startNode && lastTextNode) {
    startNode = lastTextNode;
    startOff = lastTextNode.nodeValue?.length ?? 0;
  }
  if (!endNode && lastTextNode) {
    endNode = lastTextNode;
    endOff = lastTextNode.nodeValue?.length ?? 0;
  }

  const range = document.createRange();
  if (startNode && endNode) {
    range.setStart(startNode, startOff);
    range.setEnd(endNode, endOff);
  } else {
    range.selectNodeContents(container);
    range.collapse(false);
  }

  sel.removeAllRanges();
  sel.addRange(range);
}
