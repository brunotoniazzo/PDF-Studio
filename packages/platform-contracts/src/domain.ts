export type PageRotation = 0 | 90 | 180 | 270;

/** Ponto em coordenadas PDF (origem no canto inferior esquerdo, 1 pt = 1/72 pol) */
export interface PdfPoint {
  x: number;
  y: number;
}

/** Retângulo em coordenadas PDF (left <= right, bottom <= top) */
export interface PdfRect {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

/** Retângulo em pixels CSS ou unidades SVG (origem no canto superior esquerdo) */
export interface CssRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPageGeometry {
  pageIndex: number;
  widthPt: number;
  heightPt: number;
  cropBox: PdfRect;
  rotation: PageRotation;
}

export interface PdfDocumentMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  creationDate: string;
  modificationDate: string;
  pdfVersion: string;
  pageCount: number;
  fileSizeBytes: number;
  isEncrypted: boolean;
  isLinearized: boolean;
  hasAcroForm: boolean;
  hasSignatures: boolean;
  isScannedCandidate: boolean;
}

export interface PdfBookmarkNode {
  id: string;
  title: string;
  pageIndex: number;
  topPt?: number;
  expanded?: boolean;
  children: PdfBookmarkNode[];
}

export interface PdfAttachmentInfo {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  data?: Uint8Array;
}

export interface PdfLayerInfo {
  id: string;
  name: string;
  visible: boolean;
}

export interface PdfSignatureInfo {
  id: string;
  signerName: string;
  issuer: string;
  reason: string;
  location: string;
  signedAt: string;
  status: 'valid' | 'unknown' | 'corrupted';
  subFilter: string;
  hasTimestamp: boolean;
}

export interface PdfCharBox {
  index: number;
  char: string;
  rect: PdfRect;
  fontSizePt: number;
}

export interface PdfTextLine {
  text: string;
  rect: PdfRect;
  baselineYPt: number;
}

export type MetricFontFamily = 'sans' | 'serif' | 'mono' | 'calibri';

export interface RichTextStyle {
  fontFamily: MetricFontFamily;
  fontSizePt: number;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  colorHex: string;
}

export interface RichTextRun {
  text: string;
  style: RichTextStyle;
}

export interface PdfEditableTextBlock {
  id: string;
  pageIndex: number;
  rect: PdfRect;
  lines: PdfTextLine[];
  objectIndices: number[];
  rawFontName: string;
  cleanFontName: string;
  fallbackFontFamily: MetricFontFamily;
  isSubsetFont: boolean;
  fontSizePt: number;
  lineHeightPt: number;
  colorHex: string;
  rgba: [number, number, number, number];
  alignment: 'left' | 'center' | 'right';
  originalText: string;
  runs?: RichTextRun[];
  editedText?: string;
  isBold?: boolean;
  isItalic?: boolean;
  backgroundColorHex?: string;
}

export type AnnotationType =
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'squiggly'
  | 'sticky-note'
  | 'callout'
  | 'free-text'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'ink'
  | 'stamp'
  | 'signature-visual'
  | 'image'
  | 'link'
  | 'measure-distance'
  | 'redaction';

export type ReviewStatus = 'none' | 'approved' | 'rejected' | 'completed';

export interface AnnotationReply {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface PdfAnnotation {
  id: string;
  pageIndex: number;
  type: AnnotationType;
  rect: PdfRect;
  quadPoints?: PdfRect[];
  inkPaths?: PdfPoint[][];
  points?: [PdfPoint, PdfPoint];
  color: string;
  strokeColor?: string;
  strokeWidthPt?: number;
  strokeStyle?: 'solid' | 'dashed';
  opacity: number;
  zIndex: number;
  contents?: string;
  author?: string;
  createdAt: string;
  reviewStatus?: ReviewStatus;
  replies?: AnnotationReply[];
  fontFamily?: MetricFontFamily;
  fontSizePt?: number;
  fontBold?: boolean;
  fontItalic?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  stampLabel?: string;
  stampSubLabel?: string;
  imageDataUrl?: string;
  linkUrl?: string;
  linkTargetPage?: number;
  measureScaleRatio?: number;
  measureUnit?: string;
  redactionApplied?: boolean;
  fromOriginalPdf?: boolean;
}

export type PdfFormFieldType =
  | 'text'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'date'
  | 'signature';

export type PdfFormMask = 'none' | 'cpf' | 'cnpj' | 'date' | 'currency';

export interface PdfFormField {
  id: string;
  name: string;
  pageIndex: number;
  type: PdfFormFieldType;
  rect: PdfRect;
  value: string | boolean;
  options?: string[];
  required?: boolean;
  readOnly?: boolean;
  tabOrder: number;
  mask?: PdfFormMask;
  fontSizePt?: number;
}

export interface WatermarkConfig {
  text: string;
  fontSizePt: number;
  colorHex: string;
  opacity: number;
  angleDeg: number;
  pageRange: 'all' | 'even' | 'odd' | 'custom';
  customRange?: string;
}

export interface HeaderFooterConfig {
  headerLeft?: string;
  headerCenter?: string;
  headerRight?: string;
  footerLeft?: string;
  footerCenter?: string;
  footerRight?: string;
  includePageNumbers: boolean;
  startNumber: number;
  fontSizePt: number;
  marginPt: number;
  colorHex: string;
}

export interface BatesConfig {
  prefix: string;
  suffix: string;
  startNumber: number;
  digits: number;
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  fontSizePt: number;
  colorHex: string;
}

export interface CompressionConfig {
  qualityPreset: 'low' | 'balanced' | 'high';
  targetDpi: 72 | 150 | 220;
  grayscale: boolean;
  stripMetadata: boolean;
  removeUnusedObjects: boolean;
}

export interface CompressionEstimate {
  originalBytes: number;
  estimatedBytes: number;
  imagesSharePct: number;
  fontsSharePct: number;
  streamsSharePct: number;
  metadataSharePct: number;
}

export interface BlankPageOptions {
  preset: 'A4' | 'Letter' | 'A3' | 'Legal';
  orientation: 'portrait' | 'landscape';
  pageCount: number;
}

export interface SplitOptions {
  mode: 'range' | 'every-n' | 'extract-selected';
  rangeSpec?: string;
  everyN?: number;
  selectedPages?: number[];
}

export type WorkMode =
  | 'view'
  | 'comment'
  | 'edit'
  | 'organize'
  | 'forms'
  | 'protect'
  | 'convert';

export type EditorTool =
  | 'select'
  | 'hand'
  | 'zoom-area'
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'sticky-note'
  | 'callout'
  | 'free-text'
  | 'rect'
  | 'ellipse'
  | 'arrow'
  | 'ink'
  | 'eraser'
  | 'stamp'
  | 'measure-distance'
  | 'edit-text'
  | 'add-text'
  | 'add-image'
  | 'link'
  | 'crop'
  | 'form-fill'
  | 'form-text'
  | 'form-checkbox'
  | 'form-dropdown'
  | 'form-signature'
  | 'signature-visual'
  | 'redact';

export type PageTheme = 'normal' | 'night' | 'sepia';

export type ViewLayoutMode = 'single' | 'continuous' | 'dual-book' | 'dual-cover';

export type LeftSidebarPanel =
  | 'thumbnails'
  | 'bookmarks'
  | 'comments'
  | 'attachments'
  | 'layers'
  | 'signatures';

export type RightInspectorFlow =
  | 'auto'
  | 'watermark'
  | 'header-footer'
  | 'bates'
  | 'compress'
  | 'redact'
  | 'signature'
  | 'ocr'
  | 'sanitize'
  | 'metadata';

export interface SearchMatch {
  id: string;
  pageIndex: number;
  snippet: string;
  rects: PdfRect[];
}

export interface BackgroundTaskInfo {
  id: string;
  label: string;
  progress: number;
  detail?: string;
  status: 'running' | 'completed' | 'cancelled' | 'error';
}

export interface RecentDocumentEntry {
  id: string;
  name: string;
  pathOrOrigin: string;
  sizeBytes: number;
  openedAt: string;
  pinned: boolean;
  pageCount?: number;
}

export interface RecoverableSessionEntry {
  tabId: string;
  fileName: string;
  savedAt: string;
  pageCount: number;
  sizeBytes: number;
}
