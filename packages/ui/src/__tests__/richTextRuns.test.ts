import { describe, expect, it } from 'vitest';
import type { RichTextRun, RichTextStyle } from '@pdf-studio/platform-contracts';
import {
  applyStylePatchToRuns,
  getEffectiveRichStyle,
  runsToPlainText,
} from '../utils/richTextRuns';
import { layoutRichRunsToStyledLines } from '../utils/textBlockCommit';

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
});
