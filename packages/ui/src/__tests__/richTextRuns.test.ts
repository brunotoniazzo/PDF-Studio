import { describe, expect, it } from 'vitest';
import type { RichTextRun, RichTextStyle } from '@pdf-studio/platform-contracts';
import {
  applyStylePatchToRuns,
  getEffectiveRichStyle,
  runsToPlainText,
} from '../utils/richTextRuns';
import {
  autoFitDraftRect,
  createDraftFromTextBlock,
  layoutRichRunsToStyledLines,
} from '../utils/textBlockCommit';

const baseStyle: RichTextStyle = {
  fontFamily: 'sans',
  fontSizePt: 11,
  isBold: false,
  isItalic: false,
  isUnderline: false,
  colorHex: '#1E293B',
};

describe('Formatação Rica por Seleção de Palavra vs. Bloco Inteiro', () => {
  it('aplica Negrito e Cor SOMENTE à palavra selecionada mantendo o restante intacto', () => {
    const initial: RichTextRun[] = [
      { text: 'Este documento possui uma palavra destacada hoje.', style: { ...baseStyle } },
    ];
    const start = 'Este documento possui uma '.length;
    const end = start + 'palavra'.length;

    const { runs: afterBold } = applyStylePatchToRuns(
      initial,
      { start, end },
      { isBold: true, colorHex: '#DC2626' },
      baseStyle
    );

    expect(runsToPlainText(afterBold)).toBe(
      'Este documento possui uma palavra destacada hoje.'
    );
    expect(afterBold).toHaveLength(3);
    expect(afterBold[0]).toMatchObject({
      text: 'Este documento possui uma ',
      style: { isBold: false, colorHex: '#1E293B' },
    });
    expect(afterBold[1]).toMatchObject({
      text: 'palavra',
      style: { isBold: true, colorHex: '#DC2626' },
    });
    expect(afterBold[2]).toMatchObject({
      text: ' destacada hoje.',
      style: { isBold: false, colorHex: '#1E293B' },
    });

    // O estilo efetivo na seleção reporta isBold = true, enquanto fora dela reporta false
    expect(getEffectiveRichStyle(afterBold, { start, end }, baseStyle).isBold).toBe(true);
    expect(getEffectiveRichStyle(afterBold, { start: 0, end: 4 }, baseStyle).isBold).toBe(
      false
    );
  });

  it('aplica a formatação ao BLOCO INTEIRO somente quando não há seleção específica (start === end)', () => {
    const mixed: RichTextRun[] = [
      { text: 'Parte normal e ', style: { ...baseStyle, isBold: false } },
      { text: 'parte negrito', style: { ...baseStyle, isBold: true } },
    ];

    // Cursor posicionado sem seleção (start === end === 3) -> formata o bloco inteiro!
    const { runs: wholeBold } = applyStylePatchToRuns(
      mixed,
      { start: 3, end: 3 },
      { isBold: true },
      baseStyle
    );

    expect(wholeBold).toHaveLength(1);
    expect(wholeBold[0].text).toBe('Parte normal e parte negrito');
    expect(wholeBold[0].style.isBold).toBe(true);
  });

  it('empacota múltiplos segmentos estilizados na mesma linha para gravação no PDFium', () => {
    const runs: RichTextRun[] = [
      { text: 'Valor Total: ', style: { ...baseStyle, isBold: false } },
      {
        text: 'R$ 9.500,00',
        style: { ...baseStyle, isBold: true, colorHex: '#DC2626', isUnderline: true },
      },
      { text: ' aprovado', style: { ...baseStyle, isItalic: true } },
    ];

    const lines = layoutRichRunsToStyledLines(runs, 450);
    expect(lines).toHaveLength(1);
    expect(lines[0].segments).toHaveLength(3);
    expect(lines[0].segments[0].standardFontName).toBe('Helvetica');
    expect(lines[0].segments[1].standardFontName).toBe('Helvetica-Bold');
    expect(lines[0].segments[1].isUnderline).toBe(true);
    expect(lines[0].segments[2].standardFontName).toBe('Helvetica-Oblique');
  });

  it('autoajusta a largura do bloco curto sem quebrar linha prematuramente e expande altura em múltiplas linhas', () => {
    const shortBlock = {
      id: 'blk-1',
      pageIndex: 0,
      rect: { left: 60, bottom: 700, right: 135, top: 716 },
      lines: [{ text: 'Empresa XYZ', rect: { left: 60, bottom: 700, right: 135, top: 716 }, baselineYPt: 702 }],
      objectIndices: [0],
      rawFontName: 'Helvetica',
      cleanFontName: 'Helvetica',
      fallbackFontFamily: 'sans' as const,
      isSubsetFont: false,
      fontSizePt: 11,
      lineHeightPt: 14,
      colorHex: '#1E293B',
      rgba: [30, 41, 59, 255] as [number, number, number, number],
      alignment: 'left' as const,
      originalText: 'Empresa XYZ',
    };
    const draft = createDraftFromTextBlock(shortBlock);
    const expandedRuns: RichTextRun[] = [
      { text: 'Empresa Brasileira de Tecnologia Ltda', style: { ...baseStyle } },
    ];
    const pageGeo = {
      pageIndex: 0,
      widthPt: 595,
      heightPt: 842,
      cropBox: { left: 0, bottom: 0, right: 595, top: 842 },
      rotation: 0 as const,
    };

    const fitted = autoFitDraftRect(draft, expandedRuns, 14, pageGeo);
    // Deve ter expandido horizontalmente para além dos 75 pt originais sem quebrar linha
    expect(fitted.right - fitted.left).toBeGreaterThan(180);
    const wrapped = layoutRichRunsToStyledLines(expandedRuns, fitted.right - fitted.left);
    expect(wrapped).toHaveLength(1);

    // Texto longo que excede a margem útil da página deve expandir para baixo automaticamente
    const longRuns: RichTextRun[] = [
      {
        text: 'Este texto é intencionalmente muito longo para caber em uma única linha até a margem direita da página A4 e portanto precisa aumentar a altura do bloco automaticamente em múltiplas linhas sem truncar nem sobrepor.',
        style: { ...baseStyle },
      },
    ];
    const tallFit = autoFitDraftRect(draft, longRuns, 14, pageGeo);
    expect(tallFit.right).toBeLessThanOrEqual(595 - 28 + 0.5);
    expect(tallFit.top - tallFit.bottom).toBeGreaterThan(26);
  });
});
