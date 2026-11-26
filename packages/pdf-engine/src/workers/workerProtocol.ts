import type {
  PdfAnnotation,
  PdfAttachmentInfo,
  PdfBookmarkNode,
  PdfCharBox,
  PdfDocumentMetadata,
  PdfEditableTextBlock,
  PdfPageGeometry,
  PdfRect,
  PdfSignatureInfo,
  SearchMatch,
} from '@pdf-studio/platform-contracts';

export type RenderPriority = 'high' | 'medium' | 'low';

export interface OpenDocumentPayload {
  docId: string;
  bytes: Uint8Array;
  password?: string;
}

export interface OpenDocumentResponse {
  docId: string;
  metadata: PdfDocumentMetadata;
  geometries: PdfPageGeometry[];
  bookmarks: PdfBookmarkNode[];
  signatures: PdfSignatureInfo[];
  attachments: PdfAttachmentInfo[];
  existingAnnotationsByPage: Record<number, PdfAnnotation[]>;
}

export interface RenderPagePayload {
  docId: string;
  pageIndex: number;
  widthPx: number;
  heightPx: number;
  extraRotation?: 0 | 1 | 2 | 3;
  includeAnnotations?: boolean;
  generation: number;
}

export interface RenderTilePayload {
  docId: string;
  pageIndex: number;
  scaleX: number;
  scaleY: number;
  tileX: number;
  tileY: number;
  tileWidthPx: number;
  tileHeightPx: number;
  includeAnnotations?: boolean;
  generation: number;
}

export interface CommitStyledSegment {
  text: string;
  fontKey: string;
  standardFontName: string;
  fontSizePt: number;
  isUnderline?: boolean;
  rgba: [number, number, number, number];
}

export interface CommitStyledLine {
  segments: CommitStyledSegment[];
}

export interface CommitTextBlockPayload {
  docId: string;
  pageIndex: number;
  oldObjectIndices: number[];
  lines: string[];
  styledLines?: CommitStyledLine[];
  fontBinariesByKey?: Record<string, Uint8Array | null | undefined>;
  style: {
    xPt: number;
    boxWidthPt?: number;
    boxBottomYPt?: number;
    boxTopYPt?: number;
    origRect?: PdfRect;
    wasManuallyMoved?: boolean;
    autoCoverBackgroundRgba?: [number, number, number, number] | null;
    topBaselineYPt: number;
    lineHeightPt: number;
    fontSizePt: number;
    alignment?: 'left' | 'center' | 'right';
    rgba: [number, number, number, number];
    backgroundFillRgba?: [number, number, number, number] | null;
    standardFontName: string;
    fontBytes?: Uint8Array | null;
  };
}

export interface ApplyRedactionsPayload {
  docId: string;
  redactionsByPage: Record<number, PdfRect[]>;
}

export interface SearchDocumentPayload {
  docId: string;
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}

export type WorkerRequestMessage =
  | { id: string; type: 'init'; wasmUrl: string }
  | { id: string; type: 'updateGeneration'; generation: number }
  | { id: string; type: 'openDocument'; payload: OpenDocumentPayload }
  | { id: string; type: 'replaceDocumentBytes'; payload: OpenDocumentPayload }
  | { id: string; type: 'closeDocument'; docId: string }
  | { id: string; type: 'renderPage'; payload: RenderPagePayload }
  | { id: string; type: 'renderTile'; payload: RenderTilePayload }
  | { id: string; type: 'extractPageChars'; docId: string; pageIndex: number }
  | { id: string; type: 'extractAllText'; docId: string }
  | { id: string; type: 'analyzeTextBlocks'; docId: string; pageIndex: number }
  | { id: string; type: 'commitTextBlock'; payload: CommitTextBlockPayload }
  | { id: string; type: 'applyRedactions'; payload: ApplyRedactionsPayload }
  | { id: string; type: 'searchDocument'; payload: SearchDocumentPayload }
  | { id: string; type: 'exportBytes'; docId: string };

export type WorkerResponseMessage =
  | { id: string; ok: true; result: unknown; cancelled?: boolean }
  | { id: string; ok: false; error: string; errorCode?: string };

export type PageCharsResult = {
  pageIndex: number;
  fullText: string;
  chars: PdfCharBox[];
};

export type CommitMutationResult = {
  bytes: Uint8Array;
  geometries: PdfPageGeometry[];
  verticalShiftBelowPt?: number;
  shiftedBelowThresholdYPt?: number;
};
