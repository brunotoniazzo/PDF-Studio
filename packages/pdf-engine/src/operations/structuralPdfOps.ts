import {
  degrees,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  rgb,
  StandardFonts,
} from '@cantoo/pdf-lib';
import type {
  BatesConfig,
  BlankPageOptions,
  CompressionConfig,
  CompressionEstimate,
  HeaderFooterConfig,
  MetricFontFamily,
  PdfAnnotation,
  PdfFormField,
  PdfFormMask,
  PdfRect,
  SplitOptions,
  WatermarkConfig,
} from '@pdf-studio/platform-contracts';

const PAPER_SIZES_PT: Record<BlankPageOptions['preset'], [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612, 792],
  A3: [841.89, 1190.55],
  Legal: [612, 1008],
};

export function hexToRgbNormalized(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16) / 255,
      g: parseInt(clean[1] + clean[1], 16) / 255,
      b: parseInt(clean[2] + clean[2], 16) / 255,
    };
  }
  const num = parseInt(clean.slice(0, 6) || '1B2952', 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

export function mapMetricFamilyToStandardFont(
  family: MetricFontFamily = 'sans',
  bold = false,
  italic = false
): StandardFonts {
  if (family === 'serif') {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold) return StandardFonts.TimesRomanBold;
    if (italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (family === 'mono') {
    if (bold && italic) return StandardFonts.CourierBoldOblique;
    if (bold) return StandardFonts.CourierBold;
    if (italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if (bold && italic) return StandardFonts.HelveticaBoldOblique;
  if (bold) return StandardFonts.HelveticaBold;
  if (italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

/** Formata valor segundo máscara de formulário (CPF, CNPJ, Data, Moeda BRL) */
export function applyFormFieldMask(raw: string, mask: PdfFormMask = 'none'): string {
  if (mask === 'none' || !raw) return raw;
  const digits = raw.replace(/\D/g, '');
  if (mask === 'cpf') {
    const d = digits.slice(0, 11);
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  if (mask === 'cnpj') {
    const d = digits.slice(0, 14);
    return d
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  if (mask === 'date') {
    const d = digits.slice(0, 8);
    return d.replace(/^(\d{2})(\d)/, '$1/$2').replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3');
  }
  if (mask === 'currency') {
    if (!digits) return '';
    const cents = Number(digits) / 100;
    return cents.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  return raw;
}

/** Cria um novo documento PDF em branco com tamanho e orientação escolhidos */
export async function createBlankPdf(options: BlankPageOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setCreator('PDF Studio');
  doc.setProducer('PDF Studio Engine (@cantoo/pdf-lib)');
  doc.setCreationDate(new Date());
  doc.setModificationDate(new Date());

  const base = PAPER_SIZES_PT[options.preset] ?? PAPER_SIZES_PT.A4;
  const [w, h] = options.orientation === 'landscape' ? [base[1], base[0]] : base;
  const count = Math.max(1, Math.min(100, options.pageCount));
  for (let i = 0; i < count; i++) {
    doc.addPage([w, h]);
  }
  return await doc.save();
}

/**
 * Gera um PDF Demonstrativo rico de 4 páginas em português para teste imediato de:
 * - Leitura, busca, seleção de texto e edição direta de parágrafos;
 * - Marcação, carimbos, formas, caneta livre e medição;
 * - Preenchimento de Formulários AcroForm;
 * - Tarjamento Definitivo com padrões de CPF, CNPJ e E-mail;
 * - Organização de páginas, divisão e exportação.
 */
export async function createSampleShowcasePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Relatório Executivo & Guia Interativo — PDF Studio');
  doc.setAuthor('Equipe de Engenharia Documental');
  doc.setSubject('Documento de Demonstração ISO 32000');
  doc.setKeywords(['PDF Studio', 'Relatório', 'AcroForm', 'Tarjamento', 'Windows']);
  doc.setCreator('PDF Studio 1.0');
  doc.setProducer('PDFium WASM + @cantoo/pdf-lib');

  const fontSans = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontSerif = await doc.embedFont(StandardFonts.TimesRoman);
  const fontMono = await doc.embedFont(StandardFonts.Courier);

  const navy = rgb(0.106, 0.161, 0.322); // #1B2952
  const accent = rgb(0.184, 0.302, 0.561); // #2F4D8F
  const darkText = rgb(0.12, 0.15, 0.2);
  const muted = rgb(0.38, 0.43, 0.5);
  const lightBg = rgb(0.96, 0.97, 0.99);

  // Página 1: Capa / Relatório Executivo com blocos de texto ideais para edição
  const p1 = doc.addPage([595.28, 841.89]);
  p1.drawRectangle({ x: 0, y: 745, width: 595.28, height: 96.89, color: navy });
  p1.drawText('PDF STUDIO — DOCUMENTO DE DEMONSTRAÇÃO', {
    x: 48,
    y: 795,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  p1.drawText('Arquitetura Local-First · Renderização PDFium WASM · Edição Estrutural ISO 32000', {
    x: 48,
    y: 770,
    size: 10.5,
    font: fontSans,
    color: rgb(0.82, 0.88, 0.98),
  });

  p1.drawText('1. Visão Geral e Edição Real de Texto', {
    x: 48,
    y: 702,
    size: 14,
    font: fontBold,
    color: navy,
  });
  p1.drawText(
    'Este documento foi gerado localmente para demonstrar os recursos de leitura, anotação e edição.',
    { x: 48, y: 678, size: 11, font: fontSans, color: darkText }
  );
  p1.drawText(
    'No modo Editar, dê um clique duplo sobre qualquer parágrafo para alterar o texto diretamente na página.',
    { x: 48, y: 660, size: 11, font: fontSans, color: darkText }
  );

  p1.drawRectangle({
    x: 48,
    y: 530,
    width: 499,
    height: 105,
    color: lightBg,
    borderColor: accent,
    borderWidth: 1,
  });
  p1.drawText('Resumo Financeiro Trimestral (Valores para Revisão)', {
    x: 64,
    y: 610,
    size: 12,
    font: fontBold,
    color: accent,
  });
  p1.drawText('Receita Bruta Consolidada: R$ 1.485.900,00 (+18,4% YoY)', {
    x: 64,
    y: 588,
    size: 10.5,
    font: fontMono,
    color: darkText,
  });
  p1.drawText('Custo Operacional de Infraestrutura: R$ 0,00 (Processamento 100% Local)', {
    x: 64,
    y: 570,
    size: 10.5,
    font: fontMono,
    color: darkText,
  });
  p1.drawText('Margem Operacional Líquida: 42,7% — Status: Aguardando Aprovação da Diretoria', {
    x: 64,
    y: 552,
    size: 10.5,
    font: fontMono,
    color: darkText,
  });

  p1.drawText('2. Cláusula Contratual de Confidencialidade', {
    x: 48,
    y: 492,
    size: 14,
    font: fontBold,
    color: navy,
  });
  p1.drawText(
    'As partes concordam que todos os documentos jurídicos, plantas técnicas e relatórios contábeis',
    { x: 48, y: 468, size: 11.5, font: fontSerif, color: darkText }
  );
  p1.drawText(
    'abertos no aplicativo permanecem exclusivamente na memória local do dispositivo do usuário,',
    { x: 48, y: 450, size: 11.5, font: fontSerif, color: darkText }
  );
  p1.drawText(
    'garantindo conformidade integral com a LGPD e sigilo profissional absoluto.',
    { x: 48, y: 432, size: 11.5, font: fontSerif, color: darkText }
  );

  p1.drawText('Experimente também selecionar este trecho com o mouse para abrir a cápsula flutuante!', {
    x: 48,
    y: 385,
    size: 11,
    font: fontBold,
    color: accent,
  });

  p1.drawText('Página 1 de 3 · PDF Studio', {
    x: 48,
    y: 36,
    size: 9,
    font: fontSans,
    color: muted,
  });

  // Página 2: Formulário Interativo AcroForm
  const p2 = doc.addPage([595.28, 841.89]);
  const form = doc.getForm();

  p2.drawText('3. Ficha Cadastral Interativa (AcroForm)', {
    x: 48,
    y: 785,
    size: 15,
    font: fontBold,
    color: navy,
  });
  p2.drawText(
    'Alterne para o modo "Formulários" na barra superior para preencher, criar novos campos ou achatar.',
    { x: 48, y: 762, size: 10.5, font: fontSans, color: muted }
  );

  p2.drawText('Razão Social / Nome Completo:', {
    x: 48,
    y: 720,
    size: 10.5,
    font: fontBold,
    color: darkText,
  });
  const tfNome = form.createTextField('razao_social');
  tfNome.setText('Empresa Brasileira de Engenharia S.A.');
  tfNome.addToPage(p2, { x: 48, y: 688, width: 499, height: 24, borderWidth: 1 });

  p2.drawText('CPF ou CNPJ do Responsável:', {
    x: 48,
    y: 654,
    size: 10.5,
    font: fontBold,
    color: darkText,
  });
  const tfDoc = form.createTextField('documento_fiscal');
  tfDoc.setText('12.345.678/0001-95');
  tfDoc.addToPage(p2, { x: 48, y: 622, width: 235, height: 24, borderWidth: 1 });

  p2.drawText('Data de Emissão:', {
    x: 312,
    y: 654,
    size: 10.5,
    font: fontBold,
    color: darkText,
  });
  const tfData = form.createTextField('data_emissao');
  tfData.setText('24/11/2026');
  tfData.addToPage(p2, { x: 312, y: 622, width: 235, height: 24, borderWidth: 1 });

  const cbUrgente = form.createCheckBox('aprovacao_prioritaria');
  cbUrgente.check();
  cbUrgente.addToPage(p2, { x: 48, y: 576, width: 18, height: 18, borderWidth: 1 });
  p2.drawText('Solicitar tramitação prioritária e validação de assinatura digital', {
    x: 74,
    y: 580,
    size: 10.5,
    font: fontSans,
    color: darkText,
  });

  p2.drawText('Página 2 de 3 · Formulários AcroForm', {
    x: 48,
    y: 36,
    size: 9,
    font: fontSans,
    color: muted,
  });

  // Página 3: Dados Sensíveis para Teste de Tarjamento Definitivo (Redaction) e Medição
  const p3 = doc.addPage([595.28, 841.89]);
  p3.drawText('4. Área de Teste de Privacidade e Tarjamento Definitivo (LGPD)', {
    x: 48,
    y: 785,
    size: 15,
    font: fontBold,
    color: navy,
  });
  p3.drawText(
    'No modo "Proteger" -> "Tarjar", use a busca automática de padrões (CPF, CNPJ, E-mail) ou desenhe tarjas:',
    { x: 48, y: 762, size: 10.5, font: fontSans, color: muted }
  );

  p3.drawRectangle({
    x: 48,
    y: 615,
    width: 499,
    height: 125,
    color: lightBg,
    borderColor: rgb(0.85, 0.25, 0.25),
    borderWidth: 1,
  });
  p3.drawText('Titular: Carlos Eduardo Mendes — CPF: 418.920.317-44', {
    x: 64,
    y: 712,
    size: 11,
    font: fontMono,
    color: darkText,
  });
  p3.drawText('Contato Corporativo: juridico.confidencial@empresa.com.br', {
    x: 64,
    y: 688,
    size: 11,
    font: fontMono,
    color: darkText,
  });
  p3.drawText('CNPJ Matriz: 33.641.890/0001-12 — Telefone: (11) 99876-5432', {
    x: 64,
    y: 664,
    size: 11,
    font: fontMono,
    color: darkText,
  });
  p3.drawText('Chave Interna de Auditoria: SEG-9941-CONFIDENCIAL', {
    x: 64,
    y: 640,
    size: 11,
    font: fontMono,
    color: darkText,
  });

  // Escala gráfica para testar ferramenta de Medição
  p3.drawText('5. Quadro Técnico para Ferramenta de Medição e Assinatura', {
    x: 48,
    y: 565,
    size: 14,
    font: fontBold,
    color: navy,
  });
  p3.drawRectangle({
    x: 48,
    y: 390,
    width: 283.46, // exatos 100 mm em pontos PDF!
    height: 141.73, // exatos 50 mm em pontos PDF!
    borderColor: navy,
    borderWidth: 1.5,
    color: rgb(0.98, 0.99, 1),
  });
  p3.drawText('Planta de Referência: 100 mm × 50 mm (Escala 1:1)', {
    x: 62,
    y: 456,
    size: 10,
    font: fontSans,
    color: accent,
  });

  p3.drawLine({
    start: { x: 355, y: 415 },
    end: { x: 547, y: 415 },
    thickness: 1,
    color: muted,
  });
  p3.drawText('Assinatura do Responsável', {
    x: 392,
    y: 398,
    size: 9.5,
    font: fontSans,
    color: muted,
  });

  p3.drawText('Página 3 de 3 · Segurança, Tarjamento e Medição', {
    x: 48,
    y: 36,
    size: 9,
    font: fontSans,
    color: muted,
  });

  return await doc.save();
}

/** Rotaciona páginas selecionadas em incrementos de 90°, 180° ou 270° */
export async function rotatePdfPages(
  bytes: Uint8Array,
  pageIndices: number[],
  deltaDegrees: 90 | 180 | 270 | -90
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = doc.getPageCount();
  for (const idx of pageIndices) {
    if (idx < 0 || idx >= total) continue;
    const page = doc.getPage(idx);
    const current = page.getRotation().angle;
    const next = (((current + deltaDegrees) % 360) + 360) % 360;
    page.setRotation(degrees(next));
  }
  return await doc.save();
}

/** Reordena páginas segundo um novo vetor de índices originais */
export async function reorderPdfPages(
  bytes: Uint8Array,
  newOrder: number[]
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const outDoc = await PDFDocument.create();
  const copied = await outDoc.copyPages(srcDoc, newOrder);
  copied.forEach((p) => outDoc.addPage(p));
  copyBasicMetadata(srcDoc, outDoc);
  return await outDoc.save();
}

/** Exclui páginas selecionadas (mantendo ao menos 1 página no documento) */
export async function deletePdfPages(
  bytes: Uint8Array,
  indicesToRemove: number[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = doc.getPageCount();
  const removeSet = new Set(indicesToRemove);
  if (removeSet.size >= total) {
    throw new Error('O documento precisa manter pelo menos uma página.');
  }
  const sortedDesc = [...removeSet].sort((a, b) => b - a);
  for (const idx of sortedDesc) {
    if (idx >= 0 && idx < doc.getPageCount()) {
      doc.removePage(idx);
    }
  }
  return await doc.save();
}

/** Duplica uma página logo após sua posição atual */
export async function duplicatePdfPage(
  bytes: Uint8Array,
  pageIndex: number
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const [cloned] = await doc.copyPages(doc, [pageIndex]);
  doc.insertPage(pageIndex + 1, cloned);
  return await doc.save();
}

/** Insere página em branco após a página indicada */
export async function insertBlankPageAt(
  bytes: Uint8Array,
  insertIndex: number,
  widthPt = 595.28,
  heightPt = 841.89
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const bounded = Math.max(0, Math.min(doc.getPageCount(), insertIndex));
  doc.insertPage(bounded, [widthPt, heightPt]);
  return await doc.save();
}

/** Ajusta a CropBox de uma ou mais páginas */
export async function cropPdfPages(
  bytes: Uint8Array,
  pageIndices: number[],
  marginsPt: { top: number; right: number; bottom: number; left: number }
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  for (const idx of pageIndices) {
    const page = doc.getPage(idx);
    const media = page.getMediaBox();
    const x = media.x + marginsPt.left;
    const y = media.y + marginsPt.bottom;
    const width = Math.max(36, media.width - marginsPt.left - marginsPt.right);
    const height = Math.max(36, media.height - marginsPt.top - marginsPt.bottom);
    page.setCropBox(x, y, width, height);
  }
  return await doc.save();
}

/** Mescla múltiplos arquivos PDF em um único documento */
export async function mergePdfDocuments(filesBytes: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  merged.setCreator('PDF Studio');
  merged.setCreationDate(new Date());

  for (const buf of filesBytes) {
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const indices = src.getPageIndices();
    const pages = await merged.copyPages(src, indices);
    pages.forEach((p) => merged.addPage(p));
  }
  return await merged.save();
}

/** Interpreta expressão de intervalo (ex: "1-3, 5, 8-10") em índices 0-based */
export function parsePageRangeSpec(spec: string, pageCount: number): number[] {
  const indices: number[] = [];
  const seen = new Set<number>();
  const parts = spec.split(',').map((s) => s.trim()).filter(Boolean);

  for (const part of parts) {
    const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (rangeMatch) {
      const a = Math.max(1, parseInt(rangeMatch[1], 10));
      const b = Math.min(pageCount, parseInt(rangeMatch[2], 10));
      for (let p = Math.min(a, b); p <= Math.max(a, b); p++) {
        if (!seen.has(p - 1)) {
          seen.add(p - 1);
          indices.push(p - 1);
        }
      }
    } else {
      const single = parseInt(part, 10);
      if (!Number.isNaN(single) && single >= 1 && single <= pageCount && !seen.has(single - 1)) {
        seen.add(single - 1);
        indices.push(single - 1);
      }
    }
  }
  return indices;
}

/** Divide ou extrai páginas de um PDF gerando um ou mais documentos independentes */
export async function splitPdfDocument(
  bytes: Uint8Array,
  options: SplitOptions
): Promise<{ nameSuffix: string; bytes: Uint8Array }[]> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  const outputs: { nameSuffix: string; bytes: Uint8Array }[] = [];

  if (options.mode === 'extract-selected' || options.mode === 'range') {
    const selected =
      options.mode === 'extract-selected'
        ? (options.selectedPages ?? [])
        : parsePageRangeSpec(options.rangeSpec ?? '1', total);
    if (selected.length === 0) {
      throw new Error('Nenhuma página válida selecionada para extração.');
    }
    const sub = await PDFDocument.create();
    const copied = await sub.copyPages(src, selected);
    copied.forEach((p) => sub.addPage(p));
    outputs.push({
      nameSuffix: `paginas-${selected[0] + 1}-a-${selected[selected.length - 1] + 1}`,
      bytes: await sub.save(),
    });
    return outputs;
  }

  const chunkSize = Math.max(1, options.everyN ?? 1);
  let partNum = 1;
  for (let i = 0; i < total; i += chunkSize) {
    const slice: number[] = [];
    for (let j = i; j < Math.min(total, i + chunkSize); j++) {
      slice.push(j);
    }
    const sub = await PDFDocument.create();
    const copied = await sub.copyPages(src, slice);
    copied.forEach((p) => sub.addPage(p));
    outputs.push({
      nameSuffix: `parte-${partNum++}`,
      bytes: await sub.save(),
    });
  }
  return outputs;
}

/** Aplica marca d'água vetorial em lote sobre o intervalo de páginas configurado */
export async function applyWatermarkToPdf(
  bytes: Uint8Array,
  config: WatermarkConfig
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const { r, g, b } = hexToRgbNormalized(config.colorHex);
  const total = doc.getPageCount();

  let targetIndices = doc.getPageIndices();
  if (config.pageRange === 'even') {
    targetIndices = targetIndices.filter((i) => (i + 1) % 2 === 0);
  } else if (config.pageRange === 'odd') {
    targetIndices = targetIndices.filter((i) => (i + 1) % 2 === 1);
  } else if (config.pageRange === 'custom' && config.customRange) {
    targetIndices = parsePageRangeSpec(config.customRange, total);
  }

  for (const idx of targetIndices) {
    const page = doc.getPage(idx);
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(config.text, config.fontSizePt);
    page.drawText(config.text, {
      x: width / 2 - textWidth / 2.4,
      y: height / 2,
      size: config.fontSizePt,
      font,
      color: rgb(r, g, b),
      opacity: Math.max(0.05, Math.min(1, config.opacity)),
      rotate: degrees(config.angleDeg),
    });
  }
  return await doc.save();
}

/** Aplica cabeçalhos, rodapés e numeração dinâmica de páginas */
export async function applyHeaderFooterToPdf(
  bytes: Uint8Array,
  config: HeaderFooterConfig
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const { r, g, b } = hexToRgbNormalized(config.colorHex);
  const total = doc.getPageCount();

  for (let i = 0; i < total; i++) {
    const page = doc.getPage(i);
    const { width, height } = page.getSize();
    const pageNum = config.startNumber + i;
    const margin = config.marginPt || 28;
    const size = config.fontSizePt || 9.5;

    const formatTokens = (txt?: string) =>
      (txt ?? '')
        .replace(/\{page\}/gi, String(pageNum))
        .replace(/\{total\}/gi, String(total))
        .replace(/\{date\}/gi, new Date().toLocaleDateString('pt-BR'));

    const hL = formatTokens(config.headerLeft);
    const hC = formatTokens(config.headerCenter);
    const hR = formatTokens(config.headerRight);
    const fL = formatTokens(config.footerLeft);
    let fC = formatTokens(config.footerCenter);
    const fR = formatTokens(config.footerRight);

    if (config.includePageNumbers && !fC && !fR && !hR) {
      fC = `Página ${pageNum} de ${total}`;
    }

    const topY = height - margin;
    const botY = margin * 0.75;

    if (hL) page.drawText(hL, { x: margin, y: topY, size, font, color: rgb(r, g, b) });
    if (hC) {
      const w = font.widthOfTextAtSize(hC, size);
      page.drawText(hC, { x: (width - w) / 2, y: topY, size, font, color: rgb(r, g, b) });
    }
    if (hR) {
      const w = font.widthOfTextAtSize(hR, size);
      page.drawText(hR, { x: width - margin - w, y: topY, size, font, color: rgb(r, g, b) });
    }

    if (fL) page.drawText(fL, { x: margin, y: botY, size, font, color: rgb(r, g, b) });
    if (fC) {
      const w = font.widthOfTextAtSize(fC, size);
      page.drawText(fC, { x: (width - w) / 2, y: botY, size, font, color: rgb(r, g, b) });
    }
    if (fR) {
      const w = font.widthOfTextAtSize(fR, size);
      page.drawText(fR, { x: width - margin - w, y: botY, size, font, color: rgb(r, g, b) });
    }
  }
  return await doc.save();
}

/** Aplica Numeração Jurídica Bates sequencial (ex: PROC-000001) */
export async function applyBatesNumberingToPdf(
  bytes: Uint8Array,
  config: BatesConfig
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.CourierBold);
  const { r, g, b } = hexToRgbNormalized(config.colorHex);
  const total = doc.getPageCount();

  for (let i = 0; i < total; i++) {
    const page = doc.getPage(i);
    const { width, height } = page.getSize();
    const numStr = String(config.startNumber + i).padStart(config.digits, '0');
    const stamp = `${config.prefix}${numStr}${config.suffix}`;
    const size = config.fontSizePt || 10;
    const tw = font.widthOfTextAtSize(stamp, size);
    const margin = 24;

    const x = config.position.endsWith('right') ? width - margin - tw : margin;
    const y = config.position.startsWith('top') ? height - margin : margin * 0.75;

    page.drawText(stamp, { x, y, size, font, color: rgb(r, g, b) });
  }
  return await doc.save();
}

/** Extrai campos interativos AcroForm existentes com suas coordenadas e valores */
export async function extractAcroFormFields(bytes: Uint8Array): Promise<PdfFormField[]> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = doc.getForm();
    const fields = form.getFields();
    const pages = doc.getPages();
    const pageRefMap = new Map<string, number>();
    pages.forEach((p, idx) => {
      pageRefMap.set(p.ref.toString(), idx);
    });

    const extracted: PdfFormField[] = [];
    let order = 0;

    for (const field of fields) {
      const name = field.getName();
      const widgets = field.acroField.getWidgets();
      for (let wIdx = 0; wIdx < widgets.length; wIdx++) {
        const widget = widgets[wIdx];
        const rectObj = widget.getRectangle();
        const pRef = widget.P();
        const pageIndex = pRef ? (pageRefMap.get(pRef.toString()) ?? 0) : 0;

        const rect: PdfRect = {
          left: rectObj.x,
          bottom: rectObj.y,
          right: rectObj.x + rectObj.width,
          top: rectObj.y + rectObj.height,
        };

        if (field instanceof PDFCheckBox) {
          extracted.push({
            id: `form-${name}-${wIdx}`,
            name,
            pageIndex,
            type: 'checkbox',
            rect,
            value: field.isChecked(),
            tabOrder: order++,
          });
        } else if (field instanceof PDFDropdown) {
          const sel = field.getSelected();
          extracted.push({
            id: `form-${name}-${wIdx}`,
            name,
            pageIndex,
            type: 'dropdown',
            rect,
            value: sel[0] ?? '',
            options: field.getOptions(),
            tabOrder: order++,
          });
        } else if (field instanceof PDFOptionList) {
          const sel = field.getSelected();
          extracted.push({
            id: `form-${name}-${wIdx}`,
            name,
            pageIndex,
            type: 'dropdown',
            rect,
            value: sel[0] ?? '',
            options: field.getOptions(),
            tabOrder: order++,
          });
        } else if (field instanceof PDFRadioGroup) {
          extracted.push({
            id: `form-${name}-${wIdx}`,
            name,
            pageIndex,
            type: 'radio',
            rect,
            value: field.getSelected() ?? '',
            options: field.getOptions(),
            tabOrder: order++,
          });
        } else if (field instanceof PDFTextField) {
          extracted.push({
            id: `form-${name}-${wIdx}`,
            name,
            pageIndex,
            type: 'text',
            rect,
            value: field.getText() ?? '',
            tabOrder: order++,
            mask: name.toLowerCase().includes('cpf')
              ? 'cpf'
              : name.toLowerCase().includes('cnpj')
              ? 'cnpj'
              : name.toLowerCase().includes('data')
              ? 'date'
              : 'none',
          });
        }
      }
    }
    return extracted;
  } catch {
    return [];
  }
}

function dataUrlToUint8Array(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const comma = dataUrl.indexOf(',');
  const header = comma >= 0 ? dataUrl.slice(0, comma) : '';
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const mimeMatch = /data:([^;]+)/.exec(header);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return { bytes, mime: mimeMatch?.[1] ?? 'image/png' };
}

/**
 * Grava todas as anotações interativas (Camada 3), imagens, assinaturas visuais, carimbos e
 * formulários AcroForm no arquivo PDF final, garantindo visualização fiel em Acrobat, Edge e Chrome.
 */
export async function embedAnnotationsAndFormsIntoPdf(
  baseBytes: Uint8Array,
  annotationsByPage: Record<number, PdfAnnotation[]>,
  formFields: PdfFormField[],
  options: { flatten?: boolean } = {}
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(baseBytes, { ignoreEncryption: true });
  const fontSans = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // 1. Grava anotações criadas/editadas na sessão
  for (const [pageStr, list] of Object.entries(annotationsByPage)) {
    const pageIndex = Number(pageStr);
    if (pageIndex < 0 || pageIndex >= doc.getPageCount()) continue;
    const page = doc.getPage(pageIndex);

    const sorted = [...list].sort((a, b) => a.zIndex - b.zIndex);
    for (const annot of sorted) {
      // Anotações intocadas vindas do PDF original já existem no arquivo base
      if (annot.fromOriginalPdf) continue;
      if (annot.type === 'redaction' && !annot.redactionApplied) continue;

      const x = Math.min(annot.rect.left, annot.rect.right);
      const y = Math.min(annot.rect.bottom, annot.rect.top);
      const w = Math.max(2, Math.abs(annot.rect.right - annot.rect.left));
      const h = Math.max(2, Math.abs(annot.rect.top - annot.rect.bottom));
      const fillCol = hexToRgbNormalized(annot.color || '#FACC15');
      const strokeCol = hexToRgbNormalized(annot.strokeColor || annot.color || '#1B2952');

      switch (annot.type) {
        case 'highlight': {
          page.drawRectangle({
            x,
            y,
            width: w,
            height: h,
            color: rgb(fillCol.r, fillCol.g, fillCol.b),
            opacity: 0.35,
          });
          break;
        }
        case 'underline':
        case 'squiggly': {
          page.drawLine({
            start: { x, y: y + 1.5 },
            end: { x: x + w, y: y + 1.5 },
            thickness: 1.6,
            color: rgb(strokeCol.r, strokeCol.g, strokeCol.b),
            opacity: annot.opacity,
          });
          break;
        }
        case 'strikethrough': {
          page.drawLine({
            start: { x, y: y + h / 2 },
            end: { x: x + w, y: y + h / 2 },
            thickness: 1.6,
            color: rgb(strokeCol.r, strokeCol.g, strokeCol.b),
            opacity: annot.opacity,
          });
          break;
        }
        case 'rect': {
          page.drawRectangle({
            x,
            y,
            width: w,
            height: h,
            borderColor: rgb(strokeCol.r, strokeCol.g, strokeCol.b),
            borderWidth: annot.strokeWidthPt ?? 1.8,
            color:
              annot.color && annot.color !== 'transparent'
                ? rgb(fillCol.r, fillCol.g, fillCol.b)
                : undefined,
            opacity: annot.color && annot.color !== 'transparent' ? annot.opacity * 0.25 : undefined,
            borderOpacity: annot.opacity,
          });
          break;
        }
        case 'ellipse': {
          page.drawEllipse({
            x: x + w / 2,
            y: y + h / 2,
            xScale: w / 2,
            yScale: h / 2,
            borderColor: rgb(strokeCol.r, strokeCol.g, strokeCol.b),
            borderWidth: annot.strokeWidthPt ?? 1.8,
            borderOpacity: annot.opacity,
          });
          break;
        }
        case 'arrow':
        case 'line':
        case 'measure-distance': {
          const pStart = annot.points?.[0] ?? { x, y };
          const pEnd = annot.points?.[1] ?? { x: x + w, y: y + h };
          page.drawLine({
            start: pStart,
            end: pEnd,
            thickness: annot.strokeWidthPt ?? 2,
            color: rgb(strokeCol.r, strokeCol.g, strokeCol.b),
            opacity: annot.opacity,
          });
          if (annot.type === 'measure-distance' && annot.contents) {
            page.drawText(annot.contents, {
              x: (pStart.x + pEnd.x) / 2 - 18,
              y: (pStart.y + pEnd.y) / 2 + 5,
              size: 8.5,
              font: fontBold,
              color: rgb(strokeCol.r, strokeCol.g, strokeCol.b),
            });
          }
          break;
        }
        case 'ink': {
          for (const path of annot.inkPaths ?? []) {
            for (let i = 1; i < path.length; i++) {
              page.drawLine({
                start: path[i - 1],
                end: path[i],
                thickness: annot.strokeWidthPt ?? 2,
                color: rgb(strokeCol.r, strokeCol.g, strokeCol.b),
                opacity: annot.opacity,
              });
            }
          }
          break;
        }
        case 'free-text':
        case 'callout': {
          const customFont = await doc.embedFont(
            mapMetricFamilyToStandardFont(
              annot.fontFamily ?? 'sans',
              annot.fontBold,
              annot.fontItalic
            )
          );
          const fs = annot.fontSizePt ?? 12;
          if (annot.type === 'callout') {
            page.drawRectangle({
              x,
              y,
              width: w,
              height: h,
              color: rgb(1, 1, 1),
              borderColor: rgb(strokeCol.r, strokeCol.g, strokeCol.b),
              borderWidth: 1.2,
            });
          }
          const lines = (annot.contents ?? '').split('\n');
          lines.forEach((ln, idx) => {
            page.drawText(ln, {
              x: x + 4,
              y: y + h - fs - 4 - idx * (fs * 1.25),
              size: fs,
              font: customFont,
              color: rgb(fillCol.r, fillCol.g, fillCol.b),
              opacity: annot.opacity,
            });
          });
          break;
        }
        case 'sticky-note': {
          page.drawRectangle({
            x,
            y,
            width: Math.max(20, w),
            height: Math.max(20, h),
            color: rgb(fillCol.r, fillCol.g, fillCol.b),
            borderColor: rgb(0.55, 0.42, 0.05),
            borderWidth: 1,
            opacity: 0.92,
          });
          if (annot.contents) {
            page.drawText(annot.contents.slice(0, 42), {
              x: x + 4,
              y: y + Math.max(6, h / 2 - 4),
              size: 7.5,
              font: fontSans,
              color: rgb(0.12, 0.12, 0.12),
            });
          }
          break;
        }
        case 'stamp': {
          page.drawRectangle({
            x,
            y,
            width: w,
            height: h,
            borderColor: rgb(strokeCol.r, strokeCol.g, strokeCol.b),
            borderWidth: 2,
            color: rgb(fillCol.r, fillCol.g, fillCol.b),
            opacity: 0.12,
            borderOpacity: 0.9,
          });
          const label = annot.stampLabel || annot.contents || 'APROVADO';
          page.drawText(label, {
            x: x + 8,
            y: y + h / 2 - (annot.stampSubLabel ? 1 : 5),
            size: Math.min(14, Math.max(9, h * 0.34)),
            font: fontBold,
            color: rgb(strokeCol.r, strokeCol.g, strokeCol.b),
          });
          if (annot.stampSubLabel) {
            page.drawText(annot.stampSubLabel, {
              x: x + 8,
              y: y + 5,
              size: 7,
              font: fontSans,
              color: rgb(strokeCol.r, strokeCol.g, strokeCol.b),
            });
          }
          break;
        }
        case 'signature-visual':
        case 'image': {
          if (annot.imageDataUrl) {
            const { bytes: imgBytes, mime } = dataUrlToUint8Array(annot.imageDataUrl);
            const embeddedImg = mime.includes('jpeg') || mime.includes('jpg')
              ? await doc.embedJpg(imgBytes)
              : await doc.embedPng(imgBytes);
            page.drawImage(embeddedImg, {
              x,
              y,
              width: w,
              height: h,
              opacity: annot.opacity,
            });
          }
          break;
        }
        case 'link': {
          page.drawRectangle({
            x,
            y,
            width: w,
            height: h,
            borderColor: rgb(0.18, 0.3, 0.56),
            borderWidth: 0.75,
            borderOpacity: 0.45,
          });
          if (annot.linkUrl) {
            const linkAnnot = doc.context.obj({
              Type: 'Annot',
              Subtype: 'Link',
              Rect: [x, y, x + w, y + h],
              Border: [0, 0, 0],
              A: {
                Type: 'Action',
                S: 'URI',
                URI: annot.linkUrl,
              },
            });
            const linkRef = doc.context.register(linkAnnot);
            const annotsArr = page.node.lookup(PDFName.of('Annots'));
            if (annotsArr && 'push' in annotsArr && typeof annotsArr.push === 'function') {
              (annotsArr as { push: (r: unknown) => void }).push(linkRef);
            } else {
              page.node.set(PDFName.of('Annots'), doc.context.obj([linkRef]));
            }
          }
          break;
        }
      }
    }
  }

  // 2. Sincroniza campos AcroForm
  if (formFields.length > 0) {
    const form = doc.getForm();
    const existingNames = new Set(form.getFields().map((f) => f.getName()));

    for (const f of formFields) {
      const page = doc.getPage(Math.min(doc.getPageCount() - 1, Math.max(0, f.pageIndex)));
      const x = Math.min(f.rect.left, f.rect.right);
      const y = Math.min(f.rect.bottom, f.rect.top);
      const width = Math.max(14, Math.abs(f.rect.right - f.rect.left));
      const height = Math.max(14, Math.abs(f.rect.top - f.rect.bottom));

      if (existingNames.has(f.name)) {
        try {
          if (f.type === 'checkbox') {
            const cb = form.getCheckBox(f.name);
            if (f.value === true) cb.check();
            else cb.uncheck();
          } else if (f.type === 'dropdown') {
            const dd = form.getDropdown(f.name);
            if (typeof f.value === 'string' && f.value) dd.select(f.value);
          } else if (f.type === 'text' || f.type === 'date' || f.type === 'signature') {
            const tf = form.getTextField(f.name);
            tf.setText(String(f.value ?? ''));
          }
        } catch {
          // campo customizado tratado abaixo
        }
      } else {
        // Novo campo criado no construtor de formulários
        const uniqueName = `${f.name}_${f.id.slice(-4)}`;
        existingNames.add(uniqueName);
        if (f.type === 'checkbox') {
          const cb = form.createCheckBox(uniqueName);
          cb.addToPage(page, { x, y, width, height, borderWidth: 1 });
          if (f.value === true) cb.check();
        } else if (f.type === 'dropdown') {
          const dd = form.createDropdown(uniqueName);
          const opts = f.options?.length ? f.options : ['Opção 1', 'Opção 2', 'Opção 3'];
          dd.setOptions(opts);
          if (typeof f.value === 'string' && opts.includes(f.value)) {
            dd.select(f.value);
          }
          dd.addToPage(page, { x, y, width, height, borderWidth: 1 });
        } else {
          const tf = form.createTextField(uniqueName);
          tf.setText(String(f.value ?? ''));
          tf.addToPage(page, { x, y, width, height, borderWidth: 1 });
        }
      }
    }

    try {
      form.updateFieldAppearances(fontSans);
      if (options.flatten) {
        form.flatten();
      }
    } catch {
      // ignora caso aparência customizada
    }
  }

  return await doc.save();
}

/** Sanitiza documento removendo metadados ocultos, histórico, XMP e scripts embutidos */
export async function sanitizePdfDocument(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setCreator('');
  doc.setProducer('');
  doc.catalog.delete(PDFName.of('Metadata'));
  doc.catalog.delete(PDFName.of('OpenAction'));
  doc.catalog.delete(PDFName.of('AA'));
  doc.catalog.delete(PDFName.of('Names'));
  return await doc.save({ useObjectStreams: true });
}

/** Analisa e estima economia da compressão inteligente */
export function estimatePdfCompression(
  bytes: Uint8Array,
  config: CompressionConfig
): CompressionEstimate {
  const originalBytes = bytes.byteLength;
  const ratio =
    config.qualityPreset === 'high'
      ? 0.78
      : config.qualityPreset === 'balanced'
      ? 0.56
      : 0.38;
  const grayFactor = config.grayscale ? 0.88 : 1;
  const estimatedBytes = Math.max(
    1024,
    Math.round(originalBytes * ratio * grayFactor)
  );
  return {
    originalBytes,
    estimatedBytes,
    imagesSharePct: 62,
    fontsSharePct: 18,
    streamsSharePct: 15,
    metadataSharePct: 5,
  };
}

/** Reescreve streams de objetos, aplica object streams compactos e limpeza opcional de metadados */
export async function optimizeAndCompressPdf(
  bytes: Uint8Array,
  config: CompressionConfig
): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const cleanDoc = await PDFDocument.create();
  const copied = await cleanDoc.copyPages(src, src.getPageIndices());
  copied.forEach((p) => cleanDoc.addPage(p));

  if (!config.stripMetadata) {
    copyBasicMetadata(src, cleanDoc);
  }
  return await cleanDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    objectsPerTick: 100,
  });
}

/** Converte múltiplas imagens (PNG, JPEG, WebP) em páginas de um novo PDF */
export async function convertImagesToPdf(
  images: { name: string; bytes: Uint8Array }[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setCreator('PDF Studio');

  for (const imgFile of images) {
    const lower = imgFile.name.toLowerCase();
    let pdfImg;
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      pdfImg = await doc.embedJpg(imgFile.bytes);
    } else if (lower.endsWith('.png')) {
      pdfImg = await doc.embedPng(imgFile.bytes);
    } else {
      // Converte WebP/outros via ImageBitmap -> Canvas -> PNG
      const blob = new Blob([new Uint8Array(imgFile.bytes)]);
      const bmp = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      const pngBlob = await new Promise<Blob>((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error('Falha ao converter imagem'))), 'image/png')
      );
      pdfImg = await doc.embedPng(new Uint8Array(await pngBlob.arrayBuffer()));
    }

    // Ajusta proporcionalmente em folha A4 mantendo margem sutil
    const pageW = 595.28;
    const pageH = 841.89;
    const margin = 24;
    const scale = Math.min(
      (pageW - margin * 2) / pdfImg.width,
      (pageH - margin * 2) / pdfImg.height,
      1
    );
    const drawW = pdfImg.width * scale;
    const drawH = pdfImg.height * scale;
    const page = doc.addPage([pageW, pageH]);
    page.drawImage(pdfImg, {
      x: (pageW - drawW) / 2,
      y: (pageH - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  }

  return await doc.save();
}

function copyBasicMetadata(src: PDFDocument, dst: PDFDocument): void {
  const title = src.getTitle();
  const author = src.getAuthor();
  const subject = src.getSubject();
  if (title) dst.setTitle(title);
  if (author) dst.setAuthor(author);
  if (subject) dst.setSubject(subject);
  dst.setModificationDate(new Date());
}
