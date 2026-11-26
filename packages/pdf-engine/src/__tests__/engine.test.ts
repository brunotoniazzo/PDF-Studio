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
import fs from 'node:fs';
import path from 'node:path';
import { init } from '@embedpdf/pdfium';
import { __pdfiumWorkerTestHooks } from '../workers/pdfium.worker';

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

describe('Worker PDFium: Análise de Blocos, Espaçamento Exato e Reflow Anti-Sobreposição', () => {
  it('agrupa palavras fragmentadas por kerning sem inserir espaços falsos e preserva espaçamento e reflow no commit', async () => {
    const wasmPath = path.resolve(
      __dirname,
      '../../../../node_modules/@embedpdf/pdfium/dist/pdfium.wasm'
    );
    const wasmBinary = fs.readFileSync(wasmPath);
    const mod = await init({ wasmBinary });
    mod.PDFiumExt_Init();

    // Cria PDF com palavra fragmentada ("Admi" + "nistracao"), outra linha logo abaixo e bloco vizinho à direita
    const docPtr = mod.FPDF_CreateNewDocument();
    const pagePtr = mod.FPDFPage_New(docPtr, 0, 595, 842);
    const fontPtr = mod.FPDFText_LoadStandardFont(docPtr, 'Helvetica');

    const insertText = (txt: string, x: number, y: number, fs = 12) => {
      const obj = mod.FPDFPageObj_CreateTextObj(docPtr, fontPtr, fs);
      const u16 = mod.pdfium.wasmExports.malloc((txt.length + 1) * 2);
      mod.pdfium.stringToUTF16(txt, u16, (txt.length + 1) * 2);
      mod.FPDFText_SetText(obj, u16);
      mod.pdfium.wasmExports.free(u16);
      mod.FPDFPageObj_Transform(obj, 1, 0, 0, 1, x, y);
      mod.FPDFPage_InsertObject(pagePtr, obj);
    };

    // Mede avanço exato de "Admi" via PDFium e posiciona "nistracao" apenas com ~0.8pt de kerning (gap < espaço)
    const tmpObj = mod.FPDFPageObj_CreateTextObj(docPtr, fontPtr, 12);
    const uTmp = mod.pdfium.wasmExports.malloc(10);
    mod.pdfium.stringToUTF16('Admi', uTmp, 10);
    mod.FPDFText_SetText(tmpObj, uTmp);
    const bPtr = mod.pdfium.wasmExports.malloc(16);
    mod.FPDFPageObj_GetBounds(tmpObj, bPtr, bPtr + 4, bPtr + 8, bPtr + 12);
    const pdfiumHeap = mod.pdfium as unknown as { HEAPU8: Uint8Array; HEAPF32: Float32Array };
    const admiRight = pdfiumHeap.HEAPF32[(bPtr + 8) >> 2];
    mod.pdfium.wasmExports.free(uTmp);
    mod.pdfium.wasmExports.free(bPtr);
    mod.FPDFPageObj_Destroy(tmpObj);

    insertText('Admi', 60, 740, 12);
    insertText('nistracao', 60 + admiRight + 0.6, 740, 12);
    insertText('Geral', 148, 740, 12);
    // Linha imediatamente abaixo dentro da área de colisão potencial se o bloco crescer para baixo
    insertText('Paragrafo inferior intacto', 60, 718, 12);
    mod.FPDFPage_GenerateContent(pagePtr);

    // Salva em bytes
    const chunks: Uint8Array[] = [];
    const adapter = {
      WriteBlock: (_pThis: number, pData: number, size: number) => {
        chunks.push(new Uint8Array(pdfiumHeap.HEAPU8.subarray(pData, pData + size)));
        return 1;
      },
    };
    const fileWritePtr = mod.pdfium.addFunction(adapter.WriteBlock, 'iiii');
    const structPtr = mod.pdfium.wasmExports.malloc(8);
    new DataView(pdfiumHeap.HEAPU8.buffer).setInt32(structPtr, 1, true);
    new DataView(pdfiumHeap.HEAPU8.buffer).setInt32(structPtr + 4, fileWritePtr, true);
    mod.FPDF_SaveAsCopy(docPtr, structPtr, 0);
    mod.pdfium.removeFunction(fileWritePtr);
    mod.pdfium.wasmExports.free(structPtr);
    mod.FPDF_ClosePage(pagePtr);
    mod.FPDF_CloseDocument(docPtr);

    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const pdfBytes = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      pdfBytes.set(c, offset);
      offset += c.length;
    }

    const docId = 'test-doc-spacing-reflow';
    __pdfiumWorkerTestHooks.loadDocIntoHeap(mod, { docId, bytes: pdfBytes });
    try {
      const blocks = __pdfiumWorkerTestHooks.analyzeEditableTextBlocks(mod, docId, 0);
      const topBlock = blocks.find((b) => b.originalText.includes('Admin'))!;
      expect(topBlock).toBeDefined();
      // NÃO pode inserir espaço falso entre "Admi" e "nistracao"
      expect(topBlock.originalText).toContain('Administracao');
      expect(topBlock.originalText).toContain('Geral');

      // Agora edita o bloco mantendo "Administracao " e destacando "Geral" em negrito em 2 linhas, forçando crescimento vertical
      const committed = __pdfiumWorkerTestHooks.commitEditedTextBlockInWorker(mod, {
        docId,
        pageIndex: 0,
        oldObjectIndices: topBlock.objectIndices,
        lines: ['Administracao Geral', 'Segunda linha expandida'],
        styledLines: [
          {
            segments: [
              {
                text: 'Administracao ',
                fontKey: 'sans:rn',
                standardFontName: 'Helvetica',
                fontSizePt: 12,
                isUnderline: false,
                rgba: [0, 0, 0, 255],
              },
              {
                text: 'Geral',
                fontKey: 'sans:bn',
                standardFontName: 'Helvetica-Bold',
                fontSizePt: 12,
                isUnderline: false,
                rgba: [0, 0, 0, 255],
              },
            ],
          },
          {
            segments: [
              {
                text: 'Segunda linha expandida',
                fontKey: 'sans:rn',
                standardFontName: 'Helvetica',
                fontSizePt: 12,
                isUnderline: false,
                rgba: [0, 0, 0, 255],
              },
            ],
          },
        ],
        style: {
          xPt: topBlock.rect.left,
          boxWidthPt: 260,
          boxTopYPt: topBlock.rect.top,
          boxBottomYPt: topBlock.rect.top - 34,
          origRect: topBlock.rect,
          wasManuallyMoved: false,
          autoCoverBackgroundRgba: [255, 255, 255, 255],
          topBaselineYPt: topBlock.lines[0].baselineYPt,
          lineHeightPt: 15,
          fontSizePt: 12,
          alignment: 'left',
          rgba: [0, 0, 0, 255],
          backgroundFillRgba: null,
          standardFontName: 'Helvetica',
        },
      });

      const afterBlocks = __pdfiumWorkerTestHooks.analyzeEditableTextBlocks(mod, docId, 0);
      const editedSecondLine = afterBlocks.find((b) =>
        b.originalText.includes('Segunda linha expandida')
      )!;
      const lowerParagraph = afterBlocks.find((b) =>
        b.originalText.includes('Paragrafo inferior intacto')
      )!;
      expect(editedSecondLine).toBeDefined();
      expect(lowerParagraph).toBeDefined();
      // O parágrafo inferior DEVE ter sido empurrado para baixo (top < editedBottom), sem sobreposição!
      expect(lowerParagraph.rect.top).toBeLessThan(editedSecondLine.rect.bottom);
    } finally {
      __pdfiumWorkerTestHooks.closeDocHandle(mod, docId);
    }
  });
});
