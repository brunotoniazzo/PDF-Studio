import type {
  CssRect,
  MetricFontFamily,
  PdfPageGeometry,
  PdfPoint,
  PdfRect,
} from '@pdf-studio/platform-contracts';

/** Relação padrão CSS (96 DPI) sobre pontos tipográficos PDF (72 pt/pol) */
export const PDF_TO_CSS_DPI_RATIO = 96 / 72;

/** Calcula o fator de escala CSS s = zoom * (96 / 72) */
export function getCssScale(zoom: number): number {
  return zoom * PDF_TO_CSS_DPI_RATIO;
}

/** Dimensões efetivas da página em pontos PDF já considerando rotação e CropBox */
export function getEffectivePageSizePt(geometry: PdfPageGeometry): {
  widthPt: number;
  heightPt: number;
} {
  const cropWidth = geometry.cropBox.right - geometry.cropBox.left || geometry.widthPt;
  const cropHeight = geometry.cropBox.top - geometry.cropBox.bottom || geometry.heightPt;
  if (geometry.rotation === 90 || geometry.rotation === 270) {
    return { widthPt: cropHeight, heightPt: cropWidth };
  }
  return { widthPt: cropWidth, heightPt: cropHeight };
}

/**
 * Converte ponto PDF (origem inferior esquerda) para pixels CSS (origem superior esquerda):
 * x_css = (x_pdf - x_0) * s
 * y_css = (H_pt - (y_pdf - y_0)) * s
 */
export function pdfPointToCss(
  point: PdfPoint,
  geometry: PdfPageGeometry,
  zoom: number
): { x: number; y: number } {
  const s = getCssScale(zoom);
  const { left: x0, bottom: y0 } = geometry.cropBox;
  const { heightPt } = getEffectivePageSizePt(geometry);

  return {
    x: (point.x - x0) * s,
    y: (heightPt - (point.y - y0)) * s,
  };
}

/**
 * Conversão inversa: clique do mouse em pixels CSS para coordenadas PDF:
 * x_pdf = x_css / s + x_0
 * y_pdf = H_pt - y_css / s + y_0
 */
export function cssPointToPdf(
  cssPoint: { x: number; y: number },
  geometry: PdfPageGeometry,
  zoom: number
): PdfPoint {
  const s = getCssScale(zoom);
  const { left: x0, bottom: y0 } = geometry.cropBox;
  const { heightPt } = getEffectivePageSizePt(geometry);

  return {
    x: cssPoint.x / s + x0,
    y: heightPt - cssPoint.y / s + y0,
  };
}

/** Converte PdfRect para coordenadas do SVG normalizado em pontos PDF (viewBox="0 0 W H") */
export function pdfRectToSvg(rect: PdfRect, pageHeightPt: number, cropBox?: PdfRect): CssRect {
  const x0 = cropBox?.left ?? 0;
  const y0 = cropBox?.bottom ?? 0;
  const left = Math.min(rect.left, rect.right);
  const right = Math.max(rect.left, rect.right);
  const bottom = Math.min(rect.bottom, rect.top);
  const top = Math.max(rect.bottom, rect.top);

  return {
    x: left - x0,
    y: pageHeightPt - (top - y0),
    width: Math.max(0.5, right - left),
    height: Math.max(0.5, top - bottom),
  };
}

/** Converte retângulo SVG normalizado de volta para PdfRect */
export function svgRectToPdf(svgRect: CssRect, pageHeightPt: number, cropBox?: PdfRect): PdfRect {
  const x0 = cropBox?.left ?? 0;
  const y0 = cropBox?.bottom ?? 0;
  const left = svgRect.x + x0;
  const right = left + svgRect.width;
  const top = pageHeightPt - svgRect.y + y0;
  const bottom = top - svgRect.height;

  return { left, bottom, right, top };
}

/** Converte pontos PDF para milímetros físicos */
export function ptToMm(pt: number): number {
  return Math.round((pt * 25.4) / 72);
}

/** Detecta nome amigável do formato de papel (A4, Carta, A3, Ofício) */
export function detectPaperSizeLabel(widthPt: number, heightPt: number): string {
  const wMm = ptToMm(widthPt);
  const hMm = ptToMm(heightPt);
  const minSide = Math.min(wMm, hMm);
  const maxSide = Math.max(wMm, hMm);

  const approx = (a: number, b: number) => Math.abs(a - b) <= 4;
  let format = 'Personalizado';
  if (approx(minSide, 210) && approx(maxSide, 297)) format = 'A4';
  else if (approx(minSide, 216) && approx(maxSide, 279)) format = 'Carta';
  else if (approx(minSide, 297) && approx(maxSide, 420)) format = 'A3';
  else if (approx(minSide, 216) && approx(maxSide, 356)) format = 'Ofício';
  else if (approx(minSide, 148) && approx(maxSide, 210)) format = 'A5';

  return `${wMm} × ${hMm} mm — ${format}`;
}

/** Remove prefixo de subset de 6 letras maiúsculas (ex: XKJZQA+Arial-BoldMT -> Arial-BoldMT) */
export function stripSubsetFontPrefix(rawFontName: string): {
  cleanName: string;
  isSubset: boolean;
} {
  const match = /^[A-Z]{6}\+(.+)$/.exec(rawFontName.trim());
  if (match) {
    return { cleanName: match[1], isSubset: true };
  }
  return { cleanName: rawFontName.trim() || 'Helvetica', isSubset: false };
}

/** Resolve família métrica compatível (Liberation Sans / Serif / Mono / Carlito) */
export function resolveMetricFallbackFamily(cleanFontName: string): MetricFontFamily {
  const lower = cleanFontName.toLowerCase();
  if (lower.includes('courier') || lower.includes('mono') || lower.includes('consolas')) {
    return 'mono';
  }
  if (lower.includes('times') || lower.includes('georgia') || lower.includes('garamond') || lower.includes('serif') && !lower.includes('sans')) {
    return 'serif';
  }
  if (lower.includes('calibri') || lower.includes('carlito') || lower.includes('segoe')) {
    return 'calibri';
  }
  return 'sans';
}

/**
 * Algoritmo Ramer-Douglas-Peucker para simplificação de traços de caneta livre (Windows Ink)
 * reduzindo milhares de pontos de pointermove para curvas leves em coordenadas PDF.
 */
export function simplifyInkPoints(points: PdfPoint[], epsilon = 0.75): PdfPoint[] {
  if (points.length <= 2) return points;

  const first = points[0];
  const last = points[points.length - 1];
  let maxDist = 0;
  let index = 0;

  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const magSq = dx * dx + dy * dy;

  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    let dist: number;
    if (magSq === 0) {
      dist = Math.hypot(p.x - first.x, p.y - first.y);
    } else {
      const u = Math.max(0, Math.min(1, ((p.x - first.x) * dx + (p.y - first.y) * dy) / magSq));
      const projX = first.x + u * dx;
      const projY = first.y + u * dy;
      dist = Math.hypot(p.x - projX, p.y - projY);
    }
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyInkPoints(points.slice(0, index + 1), epsilon);
    const right = simplifyInkPoints(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}
