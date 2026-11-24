import { describe, expect, it } from 'vitest';
import {
  applyBatesNumberingToPdf,
  applyFormFieldMask,
  applyHeaderFooterToPdf,
  applyWatermarkToPdf,
  createBlankPdf,
  createSampleShowcasePdf,
  cssPointToPdf,
  deletePdfPages,
  detectPaperSizeLabel,
  duplicatePdfPage,
  extractAcroFormFields,
  mergePdfDocuments,
  optimizeAndCompressPdf,
  pdfPointToCss,
  pdfRectToSvg,
  resolveMetricFallbackFamily,
  rotatePdfPages,
  sanitizePdfDocument,
  simplifyInkPoints,
  splitPdfDocument,
  stripSubsetFontPrefix,
  svgRectToPdf,
} from '../index';
import type { PdfPageGeometry } from '@pdf-studio/platform-contracts';

describe('Matemática de Coordenadas PDF <-> CSS / SVG e Ramer-Douglas-Peucker', () => {
  const a4Geometry: PdfPageGeometry = {
    pageIndex: 0,
    widthPt: 595.28,
    heightPt: 841.89,
    cropBox: { left: 0, bottom: 0, right: 595.28, top: 841.89 },
    rotation: 0,
  };

  it('converte bidirecionalmente pontos PDF e pixels CSS sem perda', () => {
    const original = { x: 120.5, y: 640.25 };
    const css = pdfPointToCss(original, a4Geometry, 1.5);
    const roundtrip = cssPointToPdf(css, a4Geometry, 1.5);
    expect(roundtrip.x).toBeCloseTo(original.x, 4);
    expect(roundtrip.y).toBeCloseTo(original.y, 4);
  });

  it('converte retângulos PDF para SVG normalizado e vice-versa', () => {
    const rect = { left: 48, bottom: 390, right: 331.46, top: 531.73 };
    const svg = pdfRectToSvg(rect, a4Geometry.heightPt, a4Geometry.cropBox);
    const back = svgRectToPdf(svg, a4Geometry.heightPt, a4Geometry.cropBox);
    expect(back.left).toBeCloseTo(rect.left, 4);
    expect(back.bottom).toBeCloseTo(rect.bottom, 4);
    expect(back.right).toBeCloseTo(rect.right, 4);
    expect(back.top).toBeCloseTo(rect.top, 4);
  });

  it('detecta formato A4 em milímetros e remove prefixo de subset de fontes', () => {
    expect(detectPaperSizeLabel(595.28, 841.89)).toBe('210 × 297 mm — A4');
    const stripped = stripSubsetFontPrefix('XKJZQA+TimesNewRomanPSMT');
    expect(stripped).toEqual({ cleanName: 'TimesNewRomanPSMT', isSubset: true });
    expect(resolveMetricFallbackFamily(stripped.cleanName)).toBe('serif');
  });

  it('simplifica traços de caneta livre com Ramer-Douglas-Peucker', () => {
    const collinear = Array.from({ length: 50 }, (_, i) => ({ x: i * 2, y: i * 2 }));
    const simplified = simplifyInkPoints(collinear, 0.5);
    expect(simplified.length).toBe(2);
  });
});

describe('Operações Estruturais PDF, Formulários AcroForm e Segurança', () => {
  it('gera PDF demonstrativo de 3 páginas com campos AcroForm extraíveis', async () => {
    const sampleBytes = await createSampleShowcasePdf();
    expect(sampleBytes.byteLength).toBeGreaterThan(1500);

    const fields = await extractAcroFormFields(sampleBytes);
    expect(fields.length).toBeGreaterThanOrEqual(4);
    expect(fields.some((f) => f.name === 'razao_social')).toBe(true);
  });

  it('executa rotação, duplicação, exclusão, mesclagem, divisão, marca d’água, Bates e sanitização', async () => {
    const blank1 = await createBlankPdf({
      preset: 'A4',
      orientation: 'portrait',
      pageCount: 2,
    });
    const blank2 = await createBlankPdf({
      preset: 'Letter',
      orientation: 'landscape',
      pageCount: 1,
    });

    const merged = await mergePdfDocuments([blank1, blank2]);
    const duplicated = await duplicatePdfPage(merged, 0);
    const rotated = await rotatePdfPages(duplicated, [0, 1], 90);
    const afterDelete = await deletePdfPages(rotated, [3]);

    const watermarked = await applyWatermarkToPdf(afterDelete, {
      text: 'CONFIDENCIAL',
      fontSizePt: 40,
      colorHex: '#1B2952',
      opacity: 0.2,
      angleDeg: 45,
      pageRange: 'all',
    });

    const headed = await applyHeaderFooterToPdf(watermarked, {
      headerLeft: 'PDF Studio',
      footerCenter: 'Pág {page}/{total}',
      includePageNumbers: true,
      startNumber: 1,
      fontSizePt: 9,
      marginPt: 24,
      colorHex: '#1B2952',
    });

    const bated = await applyBatesNumberingToPdf(headed, {
      prefix: 'PROC-',
      suffix: '',
      startNumber: 1,
      digits: 6,
      position: 'top-right',
      fontSizePt: 10,
      colorHex: '#1B2952',
    });

    const sanitized = await sanitizePdfDocument(bated);
    const compressed = await optimizeAndCompressPdf(sanitized, {
      qualityPreset: 'balanced',
      targetDpi: 150,
      grayscale: false,
      stripMetadata: true,
      removeUnusedObjects: true,
    });

    const parts = await splitPdfDocument(compressed, {
      mode: 'every-n',
      everyN: 1,
    });
    expect(parts.length).toBe(3);
  });

  it('aplica máscaras brasileiras de CPF, CNPJ, data e moeda', () => {
    expect(applyFormFieldMask('41892031744', 'cpf')).toBe('418.920.317-44');
    expect(applyFormFieldMask('33641890000112', 'cnpj')).toBe('33.641.890/0001-12');
    expect(applyFormFieldMask('24112026', 'date')).toBe('24/11/2026');
  });
});
