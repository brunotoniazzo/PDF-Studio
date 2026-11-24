import { PDFDocument, rgb, StandardFonts } from '@cantoo/pdf-lib';
import { createWorker } from 'tesseract.js';
import type { PdfEngineClient } from '../pdfEngineClient';

export interface OcrRunOptions {
  language: 'por' | 'eng' | 'por+eng';
  pageIndices?: number[];
  onProgress?: (pageDone: number, totalPages: number, detail: string) => void;
}

/**
 * Motor OCR Local-First (Tesseract WASM):
 * Renderiza cada página sem texto em alta nitidez, executa reconhecimento óptico
 * e injeta camada de texto invisível pesquisável alinhada sobre a página original.
 */
export async function runSearchableOcrOnPdf(
  pdfBytes: Uint8Array,
  docId: string,
  engine: PdfEngineClient,
  options: OcrRunOptions
): Promise<{ bytes: Uint8Array; extractedTextByPage: Record<number, string> }> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const totalDocPages = pdfDoc.getPageCount();
  const targetPages =
    options.pageIndices && options.pageIndices.length > 0
      ? options.pageIndices
      : Array.from({ length: totalDocPages }, (_, i) => i);

  const worker = await createWorker(options.language);
  const extractedTextByPage: Record<number, string> = {};

  try {
    for (let idx = 0; idx < targetPages.length; idx++) {
      const pageIndex = targetPages[idx];
      options.onProgress?.(
        idx,
        targetPages.length,
        `Aplicando OCR na página ${pageIndex + 1} de ${totalDocPages}...`
      );

      const page = pdfDoc.getPage(pageIndex);
      const { width: widthPt, height: heightPt } = page.getSize();
      const scale = 2.0; // ~144-192 DPI para equilíbrio velocidade/precisão
      const widthPx = Math.round(widthPt * scale);
      const heightPx = Math.round(heightPt * scale);

      const bitmap = await engine.requestPageBitmap({
        docId,
        pageIndex,
        widthPx,
        heightPx,
        priority: 'low',
      });
      if (!bitmap) continue;

      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);

      const recognition = await worker.recognize(canvas);
      const fullText = recognition.data.text ?? '';
      extractedTextByPage[pageIndex] = fullText;

      // Injeta linhas reconhecidas como camada invisível pesquisável (opacity ~0.01)
      const lines = fullText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const stepY = heightPt / Math.max(lines.length + 2, 10);
      lines.forEach((lineText, lineIdx) => {
        const safeAscii = lineText.replace(/[^\x20-\xFF]/g, ' ');
        if (!safeAscii.trim()) return;
        page.drawText(safeAscii, {
          x: 24,
          y: Math.max(16, heightPt - 32 - lineIdx * stepY),
          size: 10,
          font,
          color: rgb(0, 0, 0),
          opacity: 0.01,
        });
      });
    }

    options.onProgress?.(targetPages.length, targetPages.length, 'OCR concluído com sucesso.');
    return {
      bytes: await pdfDoc.save(),
      extractedTextByPage,
    };
  } finally {
    await worker.terminate();
  }
}
