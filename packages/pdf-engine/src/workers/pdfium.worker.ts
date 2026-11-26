import { init, type WrappedPdfiumModule } from '@embedpdf/pdfium';
import type {
  AnnotationType,
  PageRotation,
  PdfAnnotation,
  PdfAttachmentInfo,
  PdfBookmarkNode,
  PdfCharBox,
  PdfDocumentMetadata,
  PdfEditableTextBlock,
  PdfPageGeometry,
  PdfRect,
  PdfSignatureInfo,
  PdfTextLine,
  RichTextRun,
  SearchMatch,
} from '@pdf-studio/platform-contracts';
import {
  resolveMetricFallbackFamily,
  stripSubsetFontPrefix,
} from '../coordinates';
import type {
  ApplyRedactionsPayload,
  CommitMutationResult,
  CommitTextBlockPayload,
  OpenDocumentPayload,
  OpenDocumentResponse,
  PageCharsResult,
  RenderPagePayload,
  RenderTilePayload,
  SearchDocumentPayload,
  WorkerRequestMessage,
  WorkerResponseMessage,
} from './workerProtocol';

const FPDF_ANNOT = 0x01;
const FPDF_LCD_TEXT = 0x02;
const FPDF_REVERSE_BYTE_ORDER = 0x10;
const FPDF_BITMAP_BGRA = 4;
const FPDF_PAGEOBJ_TEXT = 1;
const FPDF_PAGEOBJ_PATH = 2;
const FPDF_FONT_TRUETYPE = 2;
const FPDF_ERR_PASSWORD = 4;

interface LoadedDocHandle {
  docId: string;
  docPtr: number;
  dataPtr: number;
  byteLength: number;
  password: string;
}

let pdfiumMod: WrappedPdfiumModule | null = null;
let latestGeneration = 0;
const openDocs = new Map<string, LoadedDocHandle>();

async function loadWasmBytes(url: string): Promise<Uint8Array> {
  if (url.startsWith('file:')) {
    return await new Promise<Uint8Array>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = () => {
        if (xhr.response && xhr.response.byteLength > 0) {
          resolve(new Uint8Array(xhr.response));
        } else {
          reject(new Error(`Falha ao carregar pdfium.wasm via file:// (${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error('Erro XHR ao carregar pdfium.wasm'));
      xhr.send(null);
    });
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha HTTP ${res.status} ao carregar pdfium.wasm`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function ensurePdfiumInitialized(wasmUrl?: string): Promise<WrappedPdfiumModule> {
  if (pdfiumMod) return pdfiumMod;
  if (!wasmUrl) {
    throw new Error('PDFium Worker ainda não inicializado com wasmUrl.');
  }
  const wasmBinary = await loadWasmBytes(wasmUrl);
  const mod = await init({ wasmBinary });
  mod.PDFiumExt_Init();
  pdfiumMod = mod;
  return mod;
}

function malloc(mod: WrappedPdfiumModule, size: number): number {
  const ptr = mod.pdfium.wasmExports.malloc(Math.max(4, size));
  if (!ptr) throw new Error(`Falha de alocação na heap WASM (${size} bytes)`);
  return ptr;
}

function free(mod: WrappedPdfiumModule, ptr: number): void {
  if (ptr) {
    mod.pdfium.wasmExports.free(ptr);
  }
}

function heapU8(mod: WrappedPdfiumModule): Uint8Array {
  return (mod.pdfium as unknown as { HEAPU8: Uint8Array }).HEAPU8;
}

function view(mod: WrappedPdfiumModule): DataView {
  return new DataView(heapU8(mod).buffer);
}

function decodeUtf16LE(mod: WrappedPdfiumModule, ptr: number, byteLen: number): string {
  if (!ptr || byteLen <= 2) return '';
  const slice = heapU8(mod).subarray(ptr, ptr + byteLen);
  let end = slice.length;
  // Remove terminador duplo nulo (\0\0)
  while (end >= 2 && slice[end - 2] === 0 && slice[end - 1] === 0) {
    end -= 2;
  }
  if (end <= 0) return '';
  return new TextDecoder('utf-16le').decode(slice.subarray(0, end));
}

function encodeUtf16LE(mod: WrappedPdfiumModule, text: string): number {
  const byteLen = (text.length + 1) * 2;
  const ptr = malloc(mod, byteLen);
  const dv = view(mod);
  for (let i = 0; i < text.length; i++) {
    dv.setUint16(ptr + i * 2, text.charCodeAt(i), true);
  }
  dv.setUint16(ptr + text.length * 2, 0, true);
  return ptr;
}

function readMetaTag(mod: WrappedPdfiumModule, docPtr: number, tag: string): string {
  const needed = mod.FPDF_GetMetaText(docPtr, tag, 0, 0);
  if (needed <= 2) return '';
  const buf = malloc(mod, needed);
  try {
    mod.FPDF_GetMetaText(docPtr, tag, buf, needed);
    return decodeUtf16LE(mod, buf, needed);
  } finally {
    free(mod, buf);
  }
}

function closeDocHandle(mod: WrappedPdfiumModule, docId: string): void {
  const existing = openDocs.get(docId);
  if (!existing) return;
  openDocs.delete(docId);
  try {
    if (existing.docPtr) mod.FPDF_CloseDocument(existing.docPtr);
  } finally {
    if (existing.dataPtr) free(mod, existing.dataPtr);
  }
}

function loadDocIntoHeap(
  mod: WrappedPdfiumModule,
  payload: OpenDocumentPayload
): LoadedDocHandle {
  closeDocHandle(mod, payload.docId);

  const byteLength = payload.bytes.byteLength;
  const dataPtr = malloc(mod, byteLength);
  heapU8(mod).set(payload.bytes, dataPtr);

  const password = payload.password ?? '';
  const docPtr = mod.FPDF_LoadMemDocument(dataPtr, byteLength, password);
  if (!docPtr) {
    const errCode = mod.FPDF_GetLastError();
    free(mod, dataPtr);
    if (errCode === FPDF_ERR_PASSWORD) {
      const pwdErr = new Error('PASSWORD_REQUIRED');
      (pwdErr as Error & { code?: string }).code = 'PASSWORD_REQUIRED';
      throw pwdErr;
    }
    throw new Error(`Não foi possível abrir o PDF (código PDFium ${errCode}).`);
  }

  const handle: LoadedDocHandle = {
    docId: payload.docId,
    docPtr,
    dataPtr,
    byteLength,
    password,
  };
  openDocs.set(payload.docId, handle);
  return handle;
}

function extractGeometries(mod: WrappedPdfiumModule, docPtr: number): PdfPageGeometry[] {
  const pageCount = mod.FPDF_GetPageCount(docPtr);
  const geometries: PdfPageGeometry[] = [];
  const boxPtr = malloc(mod, 24); // 6 floats de folga

  try {
    for (let i = 0; i < pageCount; i++) {
      let widthPt = 595.28;
      let heightPt = 841.89;
      if (mod.FPDF_GetPageSizeByIndexF(docPtr, i, boxPtr)) {
        const dv = view(mod);
        widthPt = dv.getFloat32(boxPtr, true) || widthPt;
        heightPt = dv.getFloat32(boxPtr + 4, true) || heightPt;
      }

      let rotation: PageRotation = 0;
      let cropBox: PdfRect = { left: 0, bottom: 0, right: widthPt, top: heightPt };

      const pagePtr = mod.FPDF_LoadPage(docPtr, i);
      if (pagePtr) {
        try {
          const rotIdx = mod.FPDFPage_GetRotation(pagePtr);
          const deg = (((rotIdx % 4) + 4) % 4) * 90;
          rotation = (deg === 90 || deg === 180 || deg === 270 ? deg : 0) as PageRotation;

          const hasMedia = mod.FPDFPage_GetMediaBox(
            pagePtr,
            boxPtr,
            boxPtr + 4,
            boxPtr + 8,
            boxPtr + 12
          );
          if (hasMedia) {
            const dv = view(mod);
            const mLeft = dv.getFloat32(boxPtr, true);
            const mBottom = dv.getFloat32(boxPtr + 4, true);
            const mRight = dv.getFloat32(boxPtr + 8, true);
            const mTop = dv.getFloat32(boxPtr + 12, true);
            if (mRight > mLeft && mTop > mBottom) {
              cropBox = { left: mLeft, bottom: mBottom, right: mRight, top: mTop };
            }
          }

          const hasCrop = mod.FPDFPage_GetCropBox(
            pagePtr,
            boxPtr,
            boxPtr + 4,
            boxPtr + 8,
            boxPtr + 12
          );
          if (hasCrop) {
            const dv = view(mod);
            const left = dv.getFloat32(boxPtr, true);
            const bottom = dv.getFloat32(boxPtr + 4, true);
            const right = dv.getFloat32(boxPtr + 8, true);
            const top = dv.getFloat32(boxPtr + 12, true);
            if (right > left && top > bottom) {
              cropBox = { left, bottom, right, top };
            }
          }
        } finally {
          mod.FPDF_ClosePage(pagePtr);
        }
      }

      geometries.push({
        pageIndex: i,
        widthPt,
        heightPt,
        cropBox,
        rotation,
      });
    }
  } finally {
    free(mod, boxPtr);
  }

  return geometries;
}

function extractBookmarks(
  mod: WrappedPdfiumModule,
  docPtr: number,
  parentPtr = 0,
  depth = 0
): PdfBookmarkNode[] {
  if (depth > 16) return [];
  const nodes: PdfBookmarkNode[] = [];
  let bookmarkPtr = mod.FPDFBookmark_GetFirstChild(docPtr, parentPtr);
  let seq = 0;

  while (bookmarkPtr) {
    const titleLen = mod.FPDFBookmark_GetTitle(bookmarkPtr, 0, 0);
    let title = 'Marcador';
    if (titleLen > 2) {
      const buf = malloc(mod, titleLen);
      try {
        mod.FPDFBookmark_GetTitle(bookmarkPtr, buf, titleLen);
        title = decodeUtf16LE(mod, buf, titleLen) || title;
      } finally {
        free(mod, buf);
      }
    }

    let destPtr = mod.FPDFBookmark_GetDest(docPtr, bookmarkPtr);
    if (!destPtr) {
      const actionPtr = mod.FPDFBookmark_GetAction(bookmarkPtr);
      if (actionPtr) {
        destPtr = mod.FPDFAction_GetDest(docPtr, actionPtr);
      }
    }

    let pageIndex = 0;
    if (destPtr) {
      const resolved = mod.FPDFDest_GetDestPageIndex(docPtr, destPtr);
      if (resolved >= 0) pageIndex = resolved;
    }

    const children = extractBookmarks(mod, docPtr, bookmarkPtr, depth + 1);
    nodes.push({
      id: `bm-${depth}-${seq++}-${pageIndex}`,
      title,
      pageIndex,
      expanded: depth === 0,
      children,
    });

    bookmarkPtr = mod.FPDFBookmark_GetNextSibling(docPtr, bookmarkPtr);
  }

  return nodes;
}

function extractSignatures(mod: WrappedPdfiumModule, docPtr: number): PdfSignatureInfo[] {
  const count = mod.FPDF_GetSignatureCount(docPtr);
  const result: PdfSignatureInfo[] = [];

  const readAsciiOrUtf16 = (
    fn: (sigPtr: number, bufPtr: number, len: number) => number,
    sigPtr: number,
    utf16: boolean
  ): string => {
    const len = fn(sigPtr, 0, 0);
    if (len <= 1) return '';
    const buf = malloc(mod, len);
    try {
      fn(sigPtr, buf, len);
      if (utf16) return decodeUtf16LE(mod, buf, len);
      const bytes = heapU8(mod).subarray(buf, buf + len - 1);
      return new TextDecoder('utf-8').decode(bytes);
    } finally {
      free(mod, buf);
    }
  };

  for (let i = 0; i < count; i++) {
    const sigPtr = mod.FPDF_GetSignatureObject(docPtr, i);
    if (!sigPtr) continue;
    const reason = readAsciiOrUtf16(mod.FPDFSignatureObj_GetReason, sigPtr, true);
    const subFilter = readAsciiOrUtf16(mod.FPDFSignatureObj_GetSubFilter, sigPtr, false);
    const signedAt = readAsciiOrUtf16(mod.FPDFSignatureObj_GetTime, sigPtr, false);

    result.push({
      id: `sig-${i}`,
      signerName: `Assinatura Digital #${i + 1}`,
      issuer: subFilter.includes('CAdES') || subFilter.includes('pkcs7')
        ? 'Certificado Criptográfico PKCS#7 / ICP-Brasil'
        : subFilter || 'Padrão ISO 32000',
      reason: reason || 'Integridade documental',
      location: 'Documento local',
      signedAt: signedAt || 'Carimbo embutido no dicionário /Sig',
      status: 'valid',
      subFilter: subFilter || 'adbe.pkcs7.detached',
      hasTimestamp: Boolean(signedAt),
    });
  }

  return result;
}

function extractAttachments(mod: WrappedPdfiumModule, docPtr: number): PdfAttachmentInfo[] {
  const count = mod.FPDFDoc_GetAttachmentCount(docPtr);
  const list: PdfAttachmentInfo[] = [];
  const outLenPtr = malloc(mod, 8);

  try {
    for (let i = 0; i < count; i++) {
      const attPtr = mod.FPDFDoc_GetAttachment(docPtr, i);
      if (!attPtr) continue;

      const nameBytes = mod.FPDFAttachment_GetName(attPtr, 0, 0);
      let name = `anexo-${i + 1}`;
      if (nameBytes > 2) {
        const nameBuf = malloc(mod, nameBytes);
        try {
          mod.FPDFAttachment_GetName(attPtr, nameBuf, nameBytes);
          name = decodeUtf16LE(mod, nameBuf, nameBytes) || name;
        } finally {
          free(mod, nameBuf);
        }
      }

      let sizeBytes = 0;
      let data: Uint8Array | undefined;
      if (mod.FPDFAttachment_GetFile(attPtr, 0, 0, outLenPtr)) {
        sizeBytes = view(mod).getUint32(outLenPtr, true);
        if (sizeBytes > 0 && sizeBytes <= 32 * 1024 * 1024) {
          const fileBuf = malloc(mod, sizeBytes);
          try {
            if (mod.FPDFAttachment_GetFile(attPtr, fileBuf, sizeBytes, outLenPtr)) {
              data = new Uint8Array(sizeBytes);
              data.set(heapU8(mod).subarray(fileBuf, fileBuf + sizeBytes));
            }
          } finally {
            free(mod, fileBuf);
          }
        }
      }

      list.push({
        id: `att-${i}`,
        name,
        sizeBytes,
        mimeType: 'application/octet-stream',
        data,
      });
    }
  } finally {
    free(mod, outLenPtr);
  }

  return list;
}

function mapPdfiumSubtype(subtype: number): AnnotationType | null {
  // Subtipos oficiais fpdf_annot.h:
  // 1=TEXT, 3=FREETEXT, 5=SQUARE, 6=CIRCLE, 9=HIGHLIGHT, 10=UNDERLINE, 11=SQUIGGLY, 12=STRIKEOUT, 13=STAMP, 15=INK
  switch (subtype) {
    case 1:
      return 'sticky-note';
    case 3:
      return 'free-text';
    case 5:
      return 'rect';
    case 6:
      return 'ellipse';
    case 9:
      return 'highlight';
    case 10:
      return 'underline';
    case 11:
      return 'squiggly';
    case 12:
      return 'strikethrough';
    case 13:
      return 'stamp';
    case 15:
      return 'ink';
    default:
      return null;
  }
}

function extractExistingAnnotations(
  mod: WrappedPdfiumModule,
  docPtr: number,
  pageCount: number
): Record<number, PdfAnnotation[]> {
  const byPage: Record<number, PdfAnnotation[]> = {};
  const rectPtr = malloc(mod, 16); // FS_RECTF: left, top, right, bottom (4 floats)
  const rgbaPtr = malloc(mod, 16); // 4 uint32

  try {
    const maxScanPages = Math.min(pageCount, 200);
    for (let p = 0; p < maxScanPages; p++) {
      const pagePtr = mod.FPDF_LoadPage(docPtr, p);
      if (!pagePtr) continue;
      try {
        const annotCount = mod.FPDFPage_GetAnnotCount(pagePtr);
        if (annotCount <= 0) continue;
        const pageAnnots: PdfAnnotation[] = [];

        for (let a = 0; a < annotCount; a++) {
          const annotPtr = mod.FPDFPage_GetAnnot(pagePtr, a);
          if (!annotPtr) continue;
          try {
            const subtype = mod.FPDFAnnot_GetSubtype(annotPtr);
            const mapped = mapPdfiumSubtype(subtype);
            if (!mapped) continue;

            if (!mod.FPDFAnnot_GetRect(annotPtr, rectPtr)) continue;
            const dv = view(mod);
            // FS_RECTF em PDFium: left, top, right, bottom
            const left = dv.getFloat32(rectPtr, true);
            const top = dv.getFloat32(rectPtr + 4, true);
            const right = dv.getFloat32(rectPtr + 8, true);
            const bottom = dv.getFloat32(rectPtr + 12, true);

            let color = '#FACC15';
            if (
              mod.FPDFAnnot_GetColor(
                annotPtr,
                0,
                rgbaPtr,
                rgbaPtr + 4,
                rgbaPtr + 8,
                rgbaPtr + 12
              )
            ) {
              const dvCol = view(mod);
              const r = dvCol.getUint32(rgbaPtr, true) & 0xff;
              const g = dvCol.getUint32(rgbaPtr + 4, true) & 0xff;
              const b = dvCol.getUint32(rgbaPtr + 8, true) & 0xff;
              color = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
            }

            let contents = '';
            const cLen = mod.FPDFAnnot_GetStringValue(annotPtr, 'Contents', 0, 0);
            if (cLen > 2) {
              const cBuf = malloc(mod, cLen);
              try {
                mod.FPDFAnnot_GetStringValue(annotPtr, 'Contents', cBuf, cLen);
                contents = decodeUtf16LE(mod, cBuf, cLen);
              } finally {
                free(mod, cBuf);
              }
            }

            pageAnnots.push({
              id: `orig-annot-${p}-${a}`,
              pageIndex: p,
              type: mapped,
              rect: {
                left: Math.min(left, right),
                right: Math.max(left, right),
                bottom: Math.min(bottom, top),
                top: Math.max(bottom, top),
              },
              color,
              strokeColor: color,
              strokeWidthPt: 1.5,
              opacity: mapped === 'highlight' ? 0.35 : 1,
              zIndex: a,
              contents,
              author: 'Documento PDF',
              createdAt: new Date().toISOString(),
              fromOriginalPdf: true,
            });
          } finally {
            mod.FPDFPage_CloseAnnot(annotPtr);
          }
        }

        if (pageAnnots.length > 0) {
          byPage[p] = pageAnnots;
        }
      } finally {
        mod.FPDF_ClosePage(pagePtr);
      }
    }
  } finally {
    free(mod, rectPtr);
    free(mod, rgbaPtr);
  }

  return byPage;
}

function inspectAndOpenDocument(
  mod: WrappedPdfiumModule,
  payload: OpenDocumentPayload
): OpenDocumentResponse {
  const handle = loadDocIntoHeap(mod, payload);
  const { docPtr } = handle;

  const pageCount = mod.FPDF_GetPageCount(docPtr);
  const geometries = extractGeometries(mod, docPtr);
  const bookmarks = extractBookmarks(mod, docPtr);
  const signatures = extractSignatures(mod, docPtr);
  const attachments = extractAttachments(mod, docPtr);
  const existingAnnotationsByPage = extractExistingAnnotations(mod, docPtr, pageCount);

  const verPtr = malloc(mod, 4);
  let pdfVersion = '1.7';
  try {
    if (mod.FPDF_GetFileVersion(docPtr, verPtr)) {
      const v = view(mod).getInt32(verPtr, true);
      if (v > 0) pdfVersion = `${Math.floor(v / 10)}.${v % 10}`;
    }
  } finally {
    free(mod, verPtr);
  }

  // Verifica se as primeiras páginas possuem texto selecionável (detecção de PDF escaneado)
  let sampledChars = 0;
  const checkPages = Math.min(pageCount, 3);
  for (let i = 0; i < checkPages; i++) {
    const pPtr = mod.FPDF_LoadPage(docPtr, i);
    if (!pPtr) continue;
    let tPtr = 0;
    try {
      tPtr = mod.FPDFText_LoadPage(pPtr);
      if (tPtr) {
        sampledChars += Math.max(0, mod.FPDFText_CountChars(tPtr));
      }
    } finally {
      if (tPtr) mod.FPDFText_ClosePage(tPtr);
      mod.FPDF_ClosePage(pPtr);
    }
  }

  // Verifica também se há imagem nas primeiras páginas quando sampledChars === 0
  let hasImageObjects = false;
  if (sampledChars === 0 && pageCount > 0) {
    const pPtr = mod.FPDF_LoadPage(docPtr, 0);
    if (pPtr) {
      try {
        const objCount = mod.FPDFPage_CountObjects(pPtr);
        for (let o = 0; o < objCount; o++) {
          const obj = mod.FPDFPage_GetObject(pPtr, o);
          if (obj && mod.FPDFPageObj_GetType(obj) === 3 /* FPDF_PAGEOBJ_IMAGE */) {
            hasImageObjects = true;
            break;
          }
        }
      } finally {
        mod.FPDF_ClosePage(pPtr);
      }
    }
  }

  const metadata: PdfDocumentMetadata = {
    title: readMetaTag(mod, docPtr, 'Title'),
    author: readMetaTag(mod, docPtr, 'Author'),
    subject: readMetaTag(mod, docPtr, 'Subject'),
    keywords: readMetaTag(mod, docPtr, 'Keywords'),
    creator: readMetaTag(mod, docPtr, 'Creator'),
    producer: readMetaTag(mod, docPtr, 'Producer'),
    creationDate: readMetaTag(mod, docPtr, 'CreationDate'),
    modificationDate: readMetaTag(mod, docPtr, 'ModDate'),
    pdfVersion,
    pageCount,
    fileSizeBytes: payload.bytes.byteLength,
    isEncrypted: mod.EPDF_IsEncrypted(docPtr),
    isLinearized: false,
    hasAcroForm: mod.FPDF_GetFormType(docPtr) > 0,
    hasSignatures: signatures.length > 0,
    isScannedCandidate: pageCount > 0 && sampledChars < 5 && hasImageObjects,
  };

  return {
    docId: payload.docId,
    metadata,
    geometries,
    bookmarks,
    signatures,
    attachments,
    existingAnnotationsByPage,
  };
}

async function renderPageToBitmap(
  mod: WrappedPdfiumModule,
  req: RenderPagePayload
): Promise<ImageBitmap | null> {
  if (req.generation < latestGeneration) {
    return null;
  }
  const handle = openDocs.get(req.docId);
  if (!handle) throw new Error(`Documento ${req.docId} não está aberto no Worker.`);

  const widthPx = Math.max(1, Math.round(req.widthPx));
  const heightPx = Math.max(1, Math.round(req.heightPx));
  const pagePtr = mod.FPDF_LoadPage(handle.docPtr, req.pageIndex);
  if (!pagePtr) throw new Error(`Falha ao carregar página ${req.pageIndex}`);

  const stride = widthPx * 4;
  const byteLength = stride * heightPx;
  const bufferPtr = malloc(mod, byteLength);
  let bitmapPtr = 0;

  try {
    bitmapPtr = mod.FPDFBitmap_CreateEx(
      widthPx,
      heightPx,
      FPDF_BITMAP_BGRA,
      bufferPtr,
      stride
    );
    mod.FPDFBitmap_FillRect(bitmapPtr, 0, 0, widthPx, heightPx, 0xffffffff);

    // Regra anti-duplicidade: Camada 1 omite FPDF_ANNOT por padrão pois a Camada 3 renderiza anotações interativamente
    const flags =
      FPDF_REVERSE_BYTE_ORDER |
      FPDF_LCD_TEXT |
      (req.includeAnnotations ? FPDF_ANNOT : 0);

    mod.FPDF_RenderPageBitmap(
      bitmapPtr,
      pagePtr,
      0,
      0,
      widthPx,
      heightPx,
      req.extraRotation ?? 0,
      flags
    );

    const rgbaCopy = new Uint8ClampedArray(byteLength);
    rgbaCopy.set(heapU8(mod).subarray(bufferPtr, bufferPtr + byteLength));

    const imageData = new ImageData(rgbaCopy, widthPx, heightPx);
    return await createImageBitmap(imageData);
  } finally {
    if (bitmapPtr) mod.FPDFBitmap_Destroy(bitmapPtr);
    free(mod, bufferPtr);
    mod.FPDF_ClosePage(pagePtr);
  }
}

async function renderTileToBitmap(
  mod: WrappedPdfiumModule,
  req: RenderTilePayload
): Promise<ImageBitmap | null> {
  if (req.generation < latestGeneration) {
    return null;
  }
  const handle = openDocs.get(req.docId);
  if (!handle) throw new Error(`Documento ${req.docId} não está aberto no Worker.`);

  const wPx = Math.max(1, Math.round(req.tileWidthPx));
  const hPx = Math.max(1, Math.round(req.tileHeightPx));
  const pagePtr = mod.FPDF_LoadPage(handle.docPtr, req.pageIndex);
  if (!pagePtr) throw new Error(`Falha ao carregar página ${req.pageIndex}`);

  const stride = wPx * 4;
  const byteLength = stride * hPx;
  const bufferPtr = malloc(mod, byteLength);
  const matrixPtr = malloc(mod, 24); // FS_MATRIX (6 floats)
  const clipPtr = malloc(mod, 16); // FS_RECTF (4 floats)
  let bitmapPtr = 0;

  try {
    const dv = view(mod);
    // FS_MATRIX: [a, b, c, d, e, f]
    dv.setFloat32(matrixPtr + 0, req.scaleX, true);
    dv.setFloat32(matrixPtr + 4, 0, true);
    dv.setFloat32(matrixPtr + 8, 0, true);
    dv.setFloat32(matrixPtr + 12, req.scaleY, true);
    dv.setFloat32(matrixPtr + 16, -req.tileX, true);
    dv.setFloat32(matrixPtr + 20, -req.tileY, true);

    // FS_RECTF: [left, top, right, bottom] em pixels do bitmap do tile
    dv.setFloat32(clipPtr + 0, 0, true);
    dv.setFloat32(clipPtr + 4, 0, true);
    dv.setFloat32(clipPtr + 8, wPx, true);
    dv.setFloat32(clipPtr + 12, hPx, true);

    bitmapPtr = mod.FPDFBitmap_CreateEx(wPx, hPx, FPDF_BITMAP_BGRA, bufferPtr, stride);
    mod.FPDFBitmap_FillRect(bitmapPtr, 0, 0, wPx, hPx, 0xffffffff);

    const flags =
      FPDF_REVERSE_BYTE_ORDER |
      FPDF_LCD_TEXT |
      (req.includeAnnotations ? FPDF_ANNOT : 0);

    mod.FPDF_RenderPageBitmapWithMatrix(bitmapPtr, pagePtr, matrixPtr, clipPtr, flags);

    const rgbaCopy = new Uint8ClampedArray(byteLength);
    rgbaCopy.set(heapU8(mod).subarray(bufferPtr, bufferPtr + byteLength));

    const imageData = new ImageData(rgbaCopy, wPx, hPx);
    return await createImageBitmap(imageData);
  } finally {
    if (bitmapPtr) mod.FPDFBitmap_Destroy(bitmapPtr);
    free(mod, clipPtr);
    free(mod, matrixPtr);
    free(mod, bufferPtr);
    mod.FPDF_ClosePage(pagePtr);
  }
}

function extractPageChars(
  mod: WrappedPdfiumModule,
  docId: string,
  pageIndex: number
): PageCharsResult {
  const handle = openDocs.get(docId);
  if (!handle) throw new Error(`Documento ${docId} não aberto.`);

  const pagePtr = mod.FPDF_LoadPage(handle.docPtr, pageIndex);
  if (!pagePtr) return { pageIndex, fullText: '', chars: [] };

  let textPagePtr = 0;
  // FPDFText_GetCharBox usa 4 doubles (left, right, bottom, top) = 32 bytes!
  const boxPtr = malloc(mod, 32);

  try {
    textPagePtr = mod.FPDFText_LoadPage(pagePtr);
    if (!textPagePtr) return { pageIndex, fullText: '', chars: [] };

    const count = mod.FPDFText_CountChars(textPagePtr);
    const chars: PdfCharBox[] = [];
    const textParts: string[] = [];

    for (let i = 0; i < count; i++) {
      const code = mod.FPDFText_GetUnicode(textPagePtr, i);
      if (code <= 0) continue;
      const ch = String.fromCodePoint(code);
      textParts.push(ch);

      if (ch.trim().length === 0 && ch !== ' ') continue;

      if (
        mod.FPDFText_GetCharBox(
          textPagePtr,
          i,
          boxPtr,
          boxPtr + 8,
          boxPtr + 16,
          boxPtr + 24
        )
      ) {
        const dv = view(mod);
        const left = dv.getFloat64(boxPtr, true);
        const right = dv.getFloat64(boxPtr + 8, true);
        const bottom = dv.getFloat64(boxPtr + 16, true);
        const top = dv.getFloat64(boxPtr + 24, true);
        const fontSizePt = mod.FPDFText_GetFontSize(textPagePtr, i) || Math.max(8, top - bottom);

        if (right > left && top > bottom) {
          chars.push({
            index: i,
            char: ch,
            rect: { left, bottom, right, top },
            fontSizePt,
          });
        }
      }
    }

    return {
      pageIndex,
      fullText: textParts.join(''),
      chars,
    };
  } finally {
    // Invariante crítica: fechar FPDF_TEXTPAGE SEMPRE antes de FPDF_ClosePage!
    if (textPagePtr) mod.FPDFText_ClosePage(textPagePtr);
    free(mod, boxPtr);
    mod.FPDF_ClosePage(pagePtr);
  }
}

function searchDocumentInWorker(
  mod: WrappedPdfiumModule,
  payload: SearchDocumentPayload
): SearchMatch[] {
  const handle = openDocs.get(payload.docId);
  if (!handle || !payload.query.trim()) return [];

  const pageCount = mod.FPDF_GetPageCount(handle.docPtr);
  const matches: SearchMatch[] = [];

  let regex: RegExp;
  try {
    const escaped = payload.useRegex
      ? payload.query
      : payload.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = payload.wholeWord ? `\\b${escaped}\\b` : escaped;
    regex = new RegExp(pattern, payload.caseSensitive ? 'g' : 'gi');
  } catch {
    return [];
  }

  const boxPtr = malloc(mod, 32);
  try {
    for (let p = 0; p < pageCount; p++) {
      const pagePtr = mod.FPDF_LoadPage(handle.docPtr, p);
      if (!pagePtr) continue;
      let textPagePtr = 0;
      try {
        textPagePtr = mod.FPDFText_LoadPage(pagePtr);
        if (!textPagePtr) continue;
        const charCount = mod.FPDFText_CountChars(textPagePtr);
        if (charCount <= 0) continue;

        const strChars: string[] = [];
        const charIndexMap: number[] = [];
        for (let i = 0; i < charCount; i++) {
          const code = mod.FPDFText_GetUnicode(textPagePtr, i);
          if (code <= 0) continue;
          const ch = String.fromCodePoint(code);
          for (let k = 0; k < ch.length; k++) {
            strChars.push(ch[k]);
            charIndexMap.push(i);
          }
        }

        const pageText = strChars.join('');
        regex.lastIndex = 0;
        let m: RegExpExecArray | null;
        let safety = 0;
        while ((m = regex.exec(pageText)) !== null && safety++ < 500) {
          if (m[0].length === 0) {
            regex.lastIndex++;
            continue;
          }
          const startStrIdx = m.index;
          const endStrIdx = m.index + m[0].length - 1;
          const startCharIdx = charIndexMap[startStrIdx] ?? 0;
          const endCharIdx = charIndexMap[endStrIdx] ?? startCharIdx;

          // Agrupa retângulos por linha para destaques precisos
          const lineRects: PdfRect[] = [];
          for (let ci = startCharIdx; ci <= endCharIdx; ci++) {
            if (
              mod.FPDFText_GetCharBox(
                textPagePtr,
                ci,
                boxPtr,
                boxPtr + 8,
                boxPtr + 16,
                boxPtr + 24
              )
            ) {
              const dv = view(mod);
              const left = dv.getFloat64(boxPtr, true);
              const right = dv.getFloat64(boxPtr + 8, true);
              const bottom = dv.getFloat64(boxPtr + 16, true);
              const top = dv.getFloat64(boxPtr + 24, true);
              if (right <= left || top <= bottom) continue;

              const prev = lineRects[lineRects.length - 1];
              if (prev && Math.abs(prev.bottom - bottom) < (top - bottom) * 0.5) {
                prev.left = Math.min(prev.left, left);
                prev.right = Math.max(prev.right, right);
                prev.bottom = Math.min(prev.bottom, bottom);
                prev.top = Math.max(prev.top, top);
              } else {
                lineRects.push({ left, bottom, right, top });
              }
            }
          }

          const ctxStart = Math.max(0, startStrIdx - 28);
          const ctxEnd = Math.min(pageText.length, endStrIdx + 32);
          const snippet = pageText.slice(ctxStart, ctxEnd).replace(/\s+/g, ' ').trim();

          matches.push({
            id: `match-${p}-${matches.length}`,
            pageIndex: p,
            snippet,
            rects: lineRects,
          });
        }
      } finally {
        if (textPagePtr) mod.FPDFText_ClosePage(textPagePtr);
        mod.FPDF_ClosePage(pagePtr);
      }
    }
  } finally {
    free(mod, boxPtr);
  }

  return matches;
}

/**
 * Etapa 1 do Pipeline de Edição de Texto Existente:
 * Varre FPDF_PAGEOBJ_TEXT, extrai bounds, fonte, cor e texto UTF-16LE e reconstrói
 * linhas (|dy| <= 0.35 * fontSize, dx < 2.5 * spaceWidth) e parágrafos (<= 1.6 * fontSize).
 */
function analyzeEditableTextBlocks(
  mod: WrappedPdfiumModule,
  docId: string,
  pageIndex: number
): PdfEditableTextBlock[] {
  const handle = openDocs.get(docId);
  if (!handle) throw new Error(`Documento ${docId} não aberto.`);

  const pagePtr = mod.FPDF_LoadPage(handle.docPtr, pageIndex);
  if (!pagePtr) return [];

  let textPagePtr = 0;
  const boundsPtr = malloc(mod, 16); // 4 float32: left, bottom, right, top
  const fontSizePtr = malloc(mod, 8);
  const rgbaPtr = malloc(mod, 16); // 4 uint32
  const originPtr = malloc(mod, 16); // 2 float64: x, y
  const charBoxPtr = malloc(mod, 32); // 4 float64: left, right, bottom, top
  const looseBoxPtr = malloc(mod, 16); // FS_RECTF: 4 float32: left, top, right, bottom

  interface RawCharEntry {
    unicode: number;
    ch: string;
    isGenerated: boolean;
    originX: number;
    originY: number;
    hasOrigin: boolean;
    inkLeft: number;
    inkRight: number;
    hasInkBox: boolean;
    looseLeft: number;
    looseRight: number;
    hasLooseBox: boolean;
  }

  interface FillRectCandidate {
    rect: PdfRect;
    rgba: [number, number, number, number];
    area: number;
  }

  interface RawFragment {
    objectIndex: number;
    rect: PdfRect;
    baselineYPt: number;
    looseLeft: number;
    looseRight: number;
    text: string;
    fontSizePt: number;
    rawFontName: string;
    cleanFontName: string;
    isSubsetFont: boolean;
    fallbackFontFamily: ReturnType<typeof resolveMetricFallbackFamily>;
    rgba: [number, number, number, number];
    colorHex: string;
  }

  try {
    textPagePtr = mod.FPDFText_LoadPage(pagePtr);
    const objCount = mod.FPDFPage_CountObjects(pagePtr);
    const dv = view(mod);

    // Mapeia ponteiros FPDF_PAGEOBJECT -> índice na página para associar caracteres exatos do textPage
    const objPtrToIndex = new Map<number, number>();
    const fillRects: FillRectCandidate[] = [];

    for (let idx = 0; idx < objCount; idx++) {
      const objPtr = mod.FPDFPage_GetObject(pagePtr, idx);
      if (!objPtr) continue;
      const objType = mod.FPDFPageObj_GetType(objPtr);
      if (objType === FPDF_PAGEOBJ_TEXT) {
        objPtrToIndex.set(objPtr, idx);
      } else if (objType === FPDF_PAGEOBJ_PATH) {
        if (
          mod.FPDFPageObj_GetBounds(
            objPtr,
            boundsPtr,
            boundsPtr + 4,
            boundsPtr + 8,
            boundsPtr + 12
          ) &&
          mod.FPDFPageObj_GetFillColor(
            objPtr,
            rgbaPtr,
            rgbaPtr + 4,
            rgbaPtr + 8,
            rgbaPtr + 12
          )
        ) {
          const l = dv.getFloat32(boundsPtr, true);
          const b = dv.getFloat32(boundsPtr + 4, true);
          const r = dv.getFloat32(boundsPtr + 8, true);
          const t = dv.getFloat32(boundsPtr + 12, true);
          const br = dv.getUint32(rgbaPtr, true) & 0xff;
          const bg = dv.getUint32(rgbaPtr + 4, true) & 0xff;
          const bb = dv.getUint32(rgbaPtr + 8, true) & 0xff;
          const ba = dv.getUint32(rgbaPtr + 12, true) & 0xff;
          if (ba > 200 && r - l >= 12 && t - b >= 8) {
            fillRects.push({
              rect: { left: l, bottom: b, right: r, top: t },
              rgba: [br, bg, bb, ba],
              area: (r - l) * (t - b),
            });
          }
        }
      }
    }

    // Coleta stream tipográfico por objeto (com baseline real e caixas loose/ink para eliminar espaços falsos)
    const charsByObjectIndex = new Map<number, RawCharEntry[]>();
    if (textPagePtr) {
      const charCount = mod.FPDFText_CountChars(textPagePtr);
      for (let c = 0; c < charCount; c++) {
        const u = mod.FPDFText_GetUnicode(textPagePtr, c);
        if (u === 10 || u === 13) continue;
        const cObjPtr = mod.FPDFText_GetTextObject(textPagePtr, c);
        const mappedIdx = cObjPtr ? objPtrToIndex.get(cObjPtr) : undefined;
        if (mappedIdx === undefined) continue;

        const isGenerated = mod.FPDFText_IsGenerated(textPagePtr, c) !== 0;
        let originX = 0;
        let originY = 0;
        const hasOrigin = mod.FPDFText_GetCharOrigin(
          textPagePtr,
          c,
          originPtr,
          originPtr + 8
        );
        if (hasOrigin) {
          originX = dv.getFloat64(originPtr, true);
          originY = dv.getFloat64(originPtr + 8, true);
        }

        let inkLeft = 0;
        let inkRight = 0;
        const hasInkBox = mod.FPDFText_GetCharBox(
          textPagePtr,
          c,
          charBoxPtr,
          charBoxPtr + 8,
          charBoxPtr + 16,
          charBoxPtr + 24
        );
        if (hasInkBox) {
          inkLeft = dv.getFloat64(charBoxPtr, true);
          inkRight = dv.getFloat64(charBoxPtr + 8, true);
        }

        let looseLeft = inkLeft;
        let looseRight = inkRight;
        const hasLooseBox = mod.FPDFText_GetLooseCharBox(textPagePtr, c, looseBoxPtr);
        if (hasLooseBox) {
          looseLeft = dv.getFloat32(looseBoxPtr, true);
          looseRight = dv.getFloat32(looseBoxPtr + 8, true);
        }

        const list = charsByObjectIndex.get(mappedIdx) ?? [];
        list.push({
          unicode: u,
          ch: String.fromCodePoint(u),
          isGenerated,
          originX,
          originY,
          hasOrigin,
          inkLeft,
          inkRight,
          hasInkBox,
          looseLeft,
          looseRight,
          hasLooseBox,
        });
        charsByObjectIndex.set(mappedIdx, list);
      }
    }

    const fragments: RawFragment[] = [];

    for (let idx = 0; idx < objCount; idx++) {
      const objPtr = mod.FPDFPage_GetObject(pagePtr, idx);
      if (!objPtr) continue;
      if (mod.FPDFPageObj_GetType(objPtr) !== FPDF_PAGEOBJ_TEXT) continue;

      if (
        !mod.FPDFPageObj_GetBounds(
          objPtr,
          boundsPtr,
          boundsPtr + 4,
          boundsPtr + 8,
          boundsPtr + 12
        )
      ) {
        continue;
      }
      const left = dv.getFloat32(boundsPtr, true);
      const bottom = dv.getFloat32(boundsPtr + 4, true);
      const right = dv.getFloat32(boundsPtr + 8, true);
      const top = dv.getFloat32(boundsPtr + 12, true);
      if (right <= left || top <= bottom) continue;

      let fontSizePt = Math.max(8, Math.round((top - bottom) * 0.85 * 10) / 10);
      if (mod.FPDFTextObj_GetFontSize(objPtr, fontSizePtr)) {
        const fs = dv.getFloat32(fontSizePtr, true);
        if (fs > 1 && fs < 300) {
          const matrixPtr = malloc(mod, 24);
          try {
            if (mod.FPDFPageObj_GetMatrix(objPtr, matrixPtr)) {
              const mdv = view(mod);
              const d = Math.abs(mdv.getFloat32(matrixPtr + 12, true)) || 1;
              fontSizePt = Math.round(fs * d * 10) / 10;
            } else {
              fontSizePt = Math.round(fs * 10) / 10;
            }
          } finally {
            free(mod, matrixPtr);
          }
        }
      }

      let rawFontName = 'Helvetica';
      const fontPtr = mod.FPDFTextObj_GetFont(objPtr);
      if (fontPtr) {
        const nameLen = mod.FPDFFont_GetBaseFontName(fontPtr, 0, 0);
        if (nameLen > 1) {
          const nameBuf = malloc(mod, nameLen);
          try {
            mod.FPDFFont_GetBaseFontName(fontPtr, nameBuf, nameLen);
            const bytes = heapU8(mod).subarray(nameBuf, nameBuf + nameLen - 1);
            rawFontName = new TextDecoder('utf-8').decode(bytes) || rawFontName;
          } finally {
            free(mod, nameBuf);
          }
        }
      }

      const { cleanName, isSubset } = stripSubsetFontPrefix(rawFontName);
      const fallbackFontFamily = resolveMetricFallbackFamily(cleanName);

      let rgba: [number, number, number, number] = [20, 24, 31, 255];
      if (
        mod.FPDFPageObj_GetFillColor(
          objPtr,
          rgbaPtr,
          rgbaPtr + 4,
          rgbaPtr + 8,
          rgbaPtr + 12
        )
      ) {
        rgba = [
          dv.getUint32(rgbaPtr, true) & 0xff,
          dv.getUint32(rgbaPtr + 4, true) & 0xff,
          dv.getUint32(rgbaPtr + 8, true) & 0xff,
          dv.getUint32(rgbaPtr + 12, true) & 0xff,
        ];
      }
      const colorHex = `#${rgba
        .slice(0, 3)
        .map((c) => c.toString(16).padStart(2, '0'))
        .join('')}`;

      const objChars = charsByObjectIndex.get(idx);
      let text = '';
      let baselineYPt = bottom;
      let looseLeft = left;
      let looseRight = right;

      if (objChars && objChars.length > 0) {
        const realChars = objChars.filter((c) => !c.isGenerated && c.hasOrigin);
        if (realChars.length > 0) {
          baselineYPt = realChars[0].originY;
        }
        const boundedLoose = objChars.filter((c) => c.hasLooseBox && !c.isGenerated);
        if (boundedLoose.length > 0) {
          looseLeft = boundedLoose[0].looseLeft;
          looseRight = boundedLoose[boundedLoose.length - 1].looseRight;
        }

        // Reconstrói string filtrando espaços sintéticos de kerning (FPDFText_IsGenerated)
        const kept: string[] = [];
        for (let i = 0; i < objChars.length; i++) {
          const entry = objChars[i];
          if (entry.isGenerated && entry.unicode === 32) {
            const prev = objChars[i - 1];
            const next = objChars[i + 1];
            if (!prev || !next) continue;
            const inkGap =
              prev.hasInkBox && next.hasInkBox ? next.inkLeft - prev.inkRight : 0;
            const lGap =
              prev.hasLooseBox && next.hasLooseBox ? next.looseLeft - prev.looseRight : 0;
            if (inkGap > fontSizePt * 0.22 && lGap > fontSizePt * 0.1) {
              kept.push(' ');
            }
            continue;
          }
          kept.push(entry.ch);
        }
        text = kept.join('');
      } else if (textPagePtr) {
        const txtBytes = mod.FPDFTextObj_GetText(objPtr, textPagePtr, 0, 0);
        if (txtBytes > 2) {
          const txtBuf = malloc(mod, txtBytes);
          try {
            mod.FPDFTextObj_GetText(objPtr, textPagePtr, txtBuf, txtBytes);
            text = decodeUtf16LE(mod, txtBuf, txtBytes);
          } finally {
            free(mod, txtBuf);
          }
        }
      }
      if (!text.trim()) continue;

      fragments.push({
        objectIndex: idx,
        rect: { left, bottom, right, top },
        baselineYPt,
        looseLeft,
        looseRight,
        text,
        fontSizePt,
        rawFontName,
        cleanFontName: cleanName,
        isSubsetFont: isSubset,
        fallbackFontFamily,
        rgba,
        colorHex,
      });
    }

    // Ordena por baseline real (descendentes como ç, g, p, q, y não embaralham a linha)
    fragments.sort((a, b) => {
      const dy = b.baselineYPt - a.baselineYPt;
      if (Math.abs(dy) > Math.min(a.fontSizePt, b.fontSizePt) * 0.35) {
        return dy;
      }
      return a.rect.left - b.rect.left;
    });

    interface GroupedLine {
      fragments: RawFragment[];
      runs: RichTextRun[];
      rect: PdfRect;
      baselineYPt: number;
      looseRight: number;
      fontSizePt: number;
      fallbackFontFamily: RawFragment['fallbackFontFamily'];
      cleanFontName: string;
      rawFontName: string;
      isSubsetFont: boolean;
      colorHex: string;
      rgba: [number, number, number, number];
      text: string;
    }

    const fragToRun = (f: RawFragment, prefix = ''): RichTextRun => {
      const lf = f.cleanFontName.toLowerCase();
      return {
        text: prefix + f.text,
        style: {
          fontFamily: f.fallbackFontFamily,
          fontSizePt: f.fontSizePt,
          isBold: lf.includes('bold') || lf.includes('black'),
          isItalic: lf.includes('italic') || lf.includes('oblique'),
          isUnderline: false,
          colorHex: f.colorHex,
        },
      };
    };

    const lines: GroupedLine[] = [];
    for (const frag of fragments) {
      const lastLine = lines[lines.length - 1];
      const maxFs = lastLine ? Math.max(lastLine.fontSizePt, frag.fontSizePt) : frag.fontSizePt;
      const avgFs = lastLine ? (lastLine.fontSizePt + frag.fontSizePt) * 0.5 : frag.fontSizePt;
      if (
        lastLine &&
        Math.abs(lastLine.baselineYPt - frag.baselineYPt) <= maxFs * 0.38 &&
        frag.rect.left - lastLine.rect.right < avgFs * 2.4 &&
        frag.rect.left >= lastLine.rect.left - avgFs * 0.4
      ) {
        const inkGap = frag.rect.left - lastLine.rect.right;
        const looseGap = frag.looseLeft - lastLine.looseRight;
        const needsSpace =
          inkGap > avgFs * 0.22 &&
          looseGap > avgFs * 0.1 &&
          !lastLine.text.endsWith(' ') &&
          !frag.text.startsWith(' ');
        const sep = needsSpace ? ' ' : '';
        lastLine.text += sep + frag.text;
        lastLine.fragments.push(frag);
        lastLine.runs.push(fragToRun(frag, sep));
        lastLine.looseRight = Math.max(lastLine.looseRight, frag.looseRight);
        lastLine.rect = {
          left: Math.min(lastLine.rect.left, frag.rect.left),
          bottom: Math.min(lastLine.rect.bottom, frag.rect.bottom),
          right: Math.max(lastLine.rect.right, frag.rect.right),
          top: Math.max(lastLine.rect.top, frag.rect.top),
        };
      } else {
        lines.push({
          fragments: [frag],
          runs: [fragToRun(frag)],
          rect: { ...frag.rect },
          baselineYPt: frag.baselineYPt,
          looseRight: frag.looseRight,
          fontSizePt: frag.fontSizePt,
          fallbackFontFamily: frag.fallbackFontFamily,
          cleanFontName: frag.cleanFontName,
          rawFontName: frag.rawFontName,
          isSubsetFont: frag.isSubsetFont,
          colorHex: frag.colorHex,
          rgba: frag.rgba,
          text: frag.text,
        });
      }
    }

    const detectBlockBgHex = (rect: PdfRect): string => {
      const cx = (rect.left + rect.right) * 0.5;
      const cy = (rect.bottom + rect.top) * 0.5;
      let best: FillRectCandidate | null = null;
      for (const cand of fillRects) {
        if (
          cx >= cand.rect.left &&
          cx <= cand.rect.right &&
          cy >= cand.rect.bottom &&
          cy <= cand.rect.top
        ) {
          if (!best || cand.area <= best.area) {
            best = cand;
          }
        }
      }
      if (!best) return '#FFFFFF';
      return `#${best.rgba
        .slice(0, 3)
        .map((c) => c.toString(16).padStart(2, '0'))
        .join('')}`;
    };

    // Agrupa linhas consecutivas em blocos de parágrafo preservando runs individuais por palavra/trecho
    const blocks: PdfEditableTextBlock[] = [];
    for (const line of lines) {
      const prevBlock = blocks[blocks.length - 1];
      const prevLine = prevBlock?.lines[prevBlock.lines.length - 1];
      const baselineGap = prevLine ? prevLine.baselineYPt - line.baselineYPt : Infinity;
      const alignedLeft =
        prevBlock ? Math.abs(prevBlock.rect.left - line.rect.left) <= line.fontSizePt * 1.5 : false;

      if (
        prevBlock &&
        prevLine &&
        prevBlock.fallbackFontFamily === line.fallbackFontFamily &&
        Math.abs(prevBlock.fontSizePt - line.fontSizePt) <= 2.2 &&
        baselineGap > 0 &&
        baselineGap <= line.fontSizePt * 1.65 &&
        alignedLeft
      ) {
        prevBlock.lines.push({
          text: line.text,
          rect: line.rect,
          baselineYPt: line.baselineYPt,
        });
        const prevRuns = prevBlock.runs ?? [];
        const fallbackStyle = prevRuns[prevRuns.length - 1]?.style ?? line.runs[0].style;
        prevBlock.runs = [...prevRuns, { text: '\n', style: fallbackStyle }, ...line.runs];
        prevBlock.objectIndices.push(...line.fragments.map((f) => f.objectIndex));
        prevBlock.rect = {
          left: Math.min(prevBlock.rect.left, line.rect.left),
          bottom: Math.min(prevBlock.rect.bottom, line.rect.bottom),
          right: Math.max(prevBlock.rect.right, line.rect.right),
          top: Math.max(prevBlock.rect.top, line.rect.top),
        };
        prevBlock.originalText = prevBlock.lines.map((l) => l.text).join('\n');
        prevBlock.lineHeightPt = Math.max(
          prevBlock.fontSizePt * 1.15,
          Math.round(baselineGap * 10) / 10
        );
        prevBlock.backgroundColorHex = detectBlockBgHex(prevBlock.rect);
      } else {
        const lowerFont = line.cleanFontName.toLowerCase();
        blocks.push({
          id: `txtblk-${pageIndex}-${blocks.length}`,
          pageIndex,
          rect: { ...line.rect },
          lines: [
            {
              text: line.text,
              rect: line.rect,
              baselineYPt: line.baselineYPt,
            },
          ],
          runs: [...line.runs],
          objectIndices: line.fragments.map((f) => f.objectIndex),
          rawFontName: line.rawFontName,
          cleanFontName: line.cleanFontName,
          fallbackFontFamily: line.fallbackFontFamily,
          isSubsetFont: line.isSubsetFont,
          fontSizePt: line.fontSizePt,
          lineHeightPt: Math.round(line.fontSizePt * 1.25 * 10) / 10,
          colorHex: line.colorHex,
          rgba: line.rgba,
          alignment: 'left',
          originalText: line.text,
          isBold: lowerFont.includes('bold') || lowerFont.includes('black'),
          isItalic: lowerFont.includes('italic') || lowerFont.includes('oblique'),
          backgroundColorHex: detectBlockBgHex(line.rect),
        });
      }
    }

    return blocks;
  } finally {
    if (textPagePtr) mod.FPDFText_ClosePage(textPagePtr);
    free(mod, looseBoxPtr);
    free(mod, charBoxPtr);
    free(mod, originPtr);
    free(mod, rgbaPtr);
    free(mod, fontSizePtr);
    free(mod, boundsPtr);
    mod.FPDF_ClosePage(pagePtr);
  }
}

function saveDocCopyBytes(mod: WrappedPdfiumModule, docPtr: number): Uint8Array {
  const writerPtr = mod.PDFiumExt_OpenFileWriter();
  if (!writerPtr) throw new Error('Falha ao abrir PDFiumExt_OpenFileWriter');
  try {
    const saved = mod.PDFiumExt_SaveAsCopy(docPtr, writerPtr);
    if (!saved) throw new Error('Falha em PDFiumExt_SaveAsCopy');
    const size = mod.PDFiumExt_GetFileWriterSize(writerPtr);
    if (size <= 0) throw new Error('Arquivo salvo pelo PDFium retornou 0 bytes');
    const outPtr = malloc(mod, size);
    try {
      mod.PDFiumExt_GetFileWriterData(writerPtr, outPtr, size);
      const out = new Uint8Array(size);
      out.set(heapU8(mod).subarray(outPtr, outPtr + size));
      return out;
    } finally {
      free(mod, outPtr);
    }
  } finally {
    mod.PDFiumExt_CloseFileWriter(writerPtr);
  }
}

/**
 * Etapa 4 do Pipeline de Edição de Texto Existente:
 * Remove os FPDF_PAGEOBJECT antigos em ordem ESTRITAMENTE DECRESCENTE,
 * carrega a fonte TrueType CID (ou Standard Font compatível), grava os novos objetos
 * linha a linha em UTF-16LE e regenera o stream com FPDFPage_GenerateContent.
 */
function commitEditedTextBlockInWorker(
  mod: WrappedPdfiumModule,
  payload: CommitTextBlockPayload
): CommitMutationResult {
  const handle = openDocs.get(payload.docId);
  if (!handle) throw new Error(`Documento ${payload.docId} não aberto.`);

  const pagePtr = mod.FPDF_LoadPage(handle.docPtr, payload.pageIndex);
  if (!pagePtr) throw new Error(`Falha ao abrir página ${payload.pageIndex}`);

  const allocatedFontBuffers: number[] = [];
  const fontPtrCache = new Map<string, number>();
  let verticalShiftBelowPt = 0;
  let shiftedBelowThresholdYPt: number | undefined;

  const resolvePdfiumFont = (fontKey: string, standardFontName: string): number => {
    const cacheId = `${fontKey}::${standardFontName}`;
    if (fontPtrCache.has(cacheId)) return fontPtrCache.get(cacheId)!;

    let ptr = 0;
    const customBytes =
      payload.fontBinariesByKey?.[fontKey] ??
      (fontKey === 'default' ? payload.style.fontBytes : null);

    if (customBytes && customBytes.byteLength > 0) {
      const fBuf = malloc(mod, customBytes.byteLength);
      allocatedFontBuffers.push(fBuf);
      heapU8(mod).set(customBytes, fBuf);
      ptr = mod.FPDFText_LoadFont(
        handle.docPtr,
        fBuf,
        customBytes.byteLength,
        FPDF_FONT_TRUETYPE,
        true
      );
    }
    if (!ptr) {
      ptr = mod.FPDFText_LoadStandardFont(
        handle.docPtr,
        standardFontName || 'Helvetica'
      );
    }
    fontPtrCache.set(cacheId, ptr);
    return ptr;
  };

  try {
    // 1. Remove objetos antigos em ordem decrescente de índice (invariante obrigatória!)
    const sortedDesc = [...new Set(payload.oldObjectIndices)].sort((a, b) => b - a);
    for (const idx of sortedDesc) {
      const oldObj = mod.FPDFPage_GetObject(pagePtr, idx);
      if (oldObj && mod.FPDFPage_RemoveObject(pagePtr, oldObj)) {
        mod.FPDFPageObj_Destroy(oldObj);
      }
    }

    // 2. Normaliza linhas e coalesce segmentos adjacentes com estilo idêntico (zero kerning quebrado)
    const rawStyledLines =
      payload.styledLines && payload.styledLines.length > 0
        ? payload.styledLines
        : payload.lines.map((lineText) => ({
            segments: lineText
              ? [
                  {
                    text: lineText,
                    fontKey: 'default',
                    standardFontName: payload.style.standardFontName || 'Helvetica',
                    fontSizePt: payload.style.fontSizePt,
                    isUnderline: false,
                    rgba: payload.style.rgba,
                  },
                ]
              : [],
          }));

    const effectiveStyledLines = rawStyledLines.map((lineObj) => {
      const merged: typeof lineObj.segments = [];
      for (const seg of lineObj.segments) {
        if (!seg.text) continue;
        const prev = merged[merged.length - 1];
        if (
          prev &&
          prev.fontKey === seg.fontKey &&
          prev.standardFontName === seg.standardFontName &&
          Math.abs(prev.fontSizePt - seg.fontSizePt) < 0.05 &&
          Boolean(prev.isUnderline) === Boolean(seg.isUnderline) &&
          prev.rgba.join(',') === seg.rgba.join(',')
        ) {
          prev.text += seg.text;
        } else {
          merged.push({ ...seg });
        }
      }
      return { segments: merged };
    });

    const measureBoundsPtr = malloc(mod, 16);
    const boxRectPtr = malloc(mod, 16);
    const sentinelAdvanceCache = new Map<string, number>();

    const measureInkBoundsForString = (
      fontPtr: number,
      standardFontName: string,
      fontSizePt: number,
      str: string
    ): { ok: boolean; left: number; bottom: number; right: number; top: number } => {
      const obj = fontPtr
        ? mod.FPDFPageObj_CreateTextObj(handle.docPtr, fontPtr, fontSizePt)
        : mod.FPDFPageObj_NewTextObj(
            handle.docPtr,
            standardFontName || 'Helvetica',
            fontSizePt
          );
      if (!obj) return { ok: false, left: 0, bottom: 0, right: 0, top: 0 };
      const utf16Ptr = encodeUtf16LE(mod, str);
      try {
        mod.FPDFText_SetText(obj, utf16Ptr);
        const ok = mod.FPDFPageObj_GetBounds(
          obj,
          measureBoundsPtr,
          measureBoundsPtr + 4,
          measureBoundsPtr + 8,
          measureBoundsPtr + 12
        );
        if (!ok) return { ok: false, left: 0, bottom: 0, right: 0, top: 0 };
        const mdv = view(mod);
        return {
          ok: true,
          left: mdv.getFloat32(measureBoundsPtr, true),
          bottom: mdv.getFloat32(measureBoundsPtr + 4, true),
          right: mdv.getFloat32(measureBoundsPtr + 8, true),
          top: mdv.getFloat32(measureBoundsPtr + 12, true),
        };
      } finally {
        free(mod, utf16Ptr);
        mod.FPDFPageObj_Destroy(obj);
      }
    };

    const measureExactAdvancePt = (
      fontKey: string,
      fontPtr: number,
      standardFontName: string,
      fontSizePt: number,
      str: string
    ): number => {
      const baseKey = `${fontKey}::${standardFontName}::${fontSizePt}`;
      let baseWidth = sentinelAdvanceCache.get(baseKey);
      if (baseWidth === undefined) {
        const hh = measureInkBoundsForString(fontPtr, standardFontName, fontSizePt, 'HH');
        baseWidth = hh.ok ? hh.right : fontSizePt * 1.4;
        sentinelAdvanceCache.set(baseKey, baseWidth);
      }
      const wrapped = measureInkBoundsForString(
        fontPtr,
        standardFontName,
        fontSizePt,
        `H${str}H`
      );
      if (wrapped.ok && wrapped.right >= baseWidth) {
        return Math.max(0, wrapped.right - baseWidth);
      }
      return str.length * fontSizePt * 0.45;
    };

    try {
      interface PreparedSeg {
        textObj: number;
        inkLeft: number;
        advancePt: number;
        fontSizePt: number;
        isUnderline: boolean;
        rgba: [number, number, number, number];
      }

      interface PreparedLineLayout {
        baselineY: number;
        startXPt: number;
        totalWidthPt: number;
        maxFs: number;
        items: PreparedSeg[];
      }

      const preparedLines: PreparedLineLayout[] = [];
      let currentBaselineY = payload.style.topBaselineYPt;

      effectiveStyledLines.forEach((lineObj, lineIdx) => {
        if (lineIdx > 0) {
          const maxFsOnLine = lineObj.segments.reduce(
            (m, s) => Math.max(m, s.fontSizePt),
            payload.style.fontSizePt
          );
          const stepY = Math.max(payload.style.lineHeightPt, maxFsOnLine * 1.2);
          currentBaselineY -= stepY;
        }
        if (lineObj.segments.length === 0) return;

        const prepared: PreparedSeg[] = [];
        let totalLineWidthPt = 0;
        let maxFsLine = payload.style.fontSizePt;

        for (const seg of lineObj.segments) {
          if (!seg.text) continue;
          maxFsLine = Math.max(maxFsLine, seg.fontSizePt);
          const fontPtr = resolvePdfiumFont(seg.fontKey, seg.standardFontName);
          const advancePt = measureExactAdvancePt(
            seg.fontKey,
            fontPtr,
            seg.standardFontName,
            seg.fontSizePt,
            seg.text
          );

          if (seg.text.trim().length === 0) {
            totalLineWidthPt += advancePt;
            prepared.push({
              textObj: 0,
              inkLeft: 0,
              advancePt,
              fontSizePt: seg.fontSizePt,
              isUnderline: Boolean(seg.isUnderline),
              rgba: seg.rgba,
            });
            continue;
          }

          const textObj = fontPtr
            ? mod.FPDFPageObj_CreateTextObj(handle.docPtr, fontPtr, seg.fontSizePt)
            : mod.FPDFPageObj_NewTextObj(
                handle.docPtr,
                seg.standardFontName || 'Helvetica',
                seg.fontSizePt
              );
          if (!textObj) continue;

          const utf16Ptr = encodeUtf16LE(mod, seg.text);
          try {
            mod.FPDFText_SetText(textObj, utf16Ptr);
          } finally {
            free(mod, utf16Ptr);
          }

          const [sr, sg, sb, sa] = seg.rgba;
          mod.FPDFPageObj_SetFillColor(textObj, sr, sg, sb, sa);

          let inkLeft = 0;
          if (
            mod.FPDFPageObj_GetBounds(
              textObj,
              measureBoundsPtr,
              measureBoundsPtr + 4,
              measureBoundsPtr + 8,
              measureBoundsPtr + 12
            )
          ) {
            inkLeft = Math.max(0, view(mod).getFloat32(measureBoundsPtr, true));
          }

          totalLineWidthPt += advancePt;
          prepared.push({
            textObj,
            inkLeft,
            advancePt,
            fontSizePt: seg.fontSizePt,
            isUnderline: Boolean(seg.isUnderline),
            rgba: seg.rgba,
          });
        }

        const align = payload.style.alignment ?? 'left';
        const boxW = payload.style.boxWidthPt ?? 0;
        let startXPt = payload.style.xPt;
        if (align === 'center' && boxW > 0) {
          startXPt = payload.style.xPt + Math.max(0, (boxW - totalLineWidthPt) / 2);
        } else if (align === 'right' && boxW > 0) {
          startXPt = payload.style.xPt + Math.max(0, boxW - totalLineWidthPt);
        }

        preparedLines.push({
          baselineY: currentBaselineY,
          startXPt,
          totalWidthPt: totalLineWidthPt,
          maxFs: maxFsLine,
          items: prepared,
        });
      });

      // 3. Mede bounds exatos do novo conteúdo + executa Reflow Horizontal & Vertical anti-sobreposição
      const mdv = view(mod);
      let mbLeft = 0;
      let mbBottom = 0;
      let mbRight = 595;
      let mbTop = 842;
      if (
        mod.FPDFPage_GetMediaBox(
          pagePtr,
          boxRectPtr,
          boxRectPtr + 4,
          boxRectPtr + 8,
          boxRectPtr + 12
        )
      ) {
        mbLeft = mdv.getFloat32(boxRectPtr, true);
        mbBottom = mdv.getFloat32(boxRectPtr + 4, true);
        mbRight = mdv.getFloat32(boxRectPtr + 8, true);
        mbTop = mdv.getFloat32(boxRectPtr + 12, true);
      }
      const pageW = Math.max(100, mbRight - mbLeft);
      const pageH = Math.max(100, mbTop - mbBottom);

      const contentMinX =
        preparedLines.length > 0
          ? Math.min(...preparedLines.map((l) => l.startXPt))
          : payload.style.xPt;
      const contentMaxX =
        preparedLines.length > 0
          ? Math.max(...preparedLines.map((l) => l.startXPt + l.totalWidthPt))
          : payload.style.xPt + (payload.style.boxWidthPt ?? 0);
      const contentTopY =
        preparedLines.length > 0
          ? Math.max(
              payload.style.boxTopYPt ?? -Infinity,
              preparedLines[0].baselineY + preparedLines[0].maxFs * 0.9
            )
          : (payload.style.boxTopYPt ?? payload.style.topBaselineYPt);
      const lastPrepared = preparedLines[preparedLines.length - 1];
      const contentBottomY = lastPrepared
        ? Math.min(
            payload.style.boxBottomYPt ?? Infinity,
            lastPrepared.baselineY - lastPrepared.maxFs * 0.28
          )
        : (payload.style.boxBottomYPt ?? payload.style.topBaselineYPt);

      const origRect = payload.style.origRect;

      // Remove eventuais micro-objetos órfãos remanescentes dentro de origRect (ex.: pontuação fragmentada)
      if (origRect && preparedLines.length > 0) {
        const orphanIndices: number[] = [];
        const remCount = mod.FPDFPage_CountObjects(pagePtr);
        for (let idx = 0; idx < remCount; idx++) {
          const obj = mod.FPDFPage_GetObject(pagePtr, idx);
          if (!obj || mod.FPDFPageObj_GetType(obj) !== FPDF_PAGEOBJ_TEXT) continue;
          if (
            !mod.FPDFPageObj_GetBounds(
              obj,
              measureBoundsPtr,
              measureBoundsPtr + 4,
              measureBoundsPtr + 8,
              measureBoundsPtr + 12
            )
          ) {
            continue;
          }
          const l = mdv.getFloat32(measureBoundsPtr, true);
          const b = mdv.getFloat32(measureBoundsPtr + 4, true);
          const r = mdv.getFloat32(measureBoundsPtr + 8, true);
          const t = mdv.getFloat32(measureBoundsPtr + 12, true);
          const cx = (l + r) * 0.5;
          const cy = (b + t) * 0.5;
          if (
            cx >= origRect.left - 0.5 &&
            cx <= origRect.right + 0.5 &&
            cy >= origRect.bottom - 0.5 &&
            cy <= origRect.top + 0.5 &&
            r - l <= origRect.right - origRect.left + 2 &&
            t - b <= origRect.top - origRect.bottom + 2
          ) {
            orphanIndices.push(idx);
          }
        }
        for (const oIdx of orphanIndices.sort((a, b) => b - a)) {
          const orphanObj = mod.FPDFPage_GetObject(pagePtr, oIdx);
          if (orphanObj && mod.FPDFPage_RemoveObject(pagePtr, orphanObj)) {
            mod.FPDFPageObj_Destroy(orphanObj);
          }
        }
      }

      const scanRemainingBounds = () => {
        const entries: Array<{
          objPtr: number;
          type: number;
          left: number;
          bottom: number;
          right: number;
          top: number;
          isPageBg: boolean;
        }> = [];
        const cnt = mod.FPDFPage_CountObjects(pagePtr);
        for (let i = 0; i < cnt; i++) {
          const o = mod.FPDFPage_GetObject(pagePtr, i);
          if (!o) continue;
          if (
            !mod.FPDFPageObj_GetBounds(
              o,
              measureBoundsPtr,
              measureBoundsPtr + 4,
              measureBoundsPtr + 8,
              measureBoundsPtr + 12
            )
          ) {
            continue;
          }
          const l = mdv.getFloat32(measureBoundsPtr, true);
          const b = mdv.getFloat32(measureBoundsPtr + 4, true);
          const r = mdv.getFloat32(measureBoundsPtr + 8, true);
          const t = mdv.getFloat32(measureBoundsPtr + 12, true);
          const isPageBg = (r - l) > pageW * 0.85 && (t - b) > pageH * 0.85;
          entries.push({
            objPtr: o,
            type: mod.FPDFPageObj_GetType(o),
            left: l,
            bottom: b,
            right: r,
            top: t,
            isPageBg,
          });
        }
        return entries;
      };

      const movedObjPtrs = new Set<number>();

      if (origRect && !payload.style.wasManuallyMoved && preparedLines.length > 0) {
        const growRightPt = Math.max(0, contentMaxX - origRect.right);
        const growDownPt = Math.max(0, origRect.bottom - contentBottomY);

        // 3a. Reflow horizontal: empurra objetos à direita na mesma faixa Y se o bloco alargou
        if (growRightPt > 1) {
          const objs = scanRemainingBounds();
          const sameRowColliders = objs.filter(
            (o) =>
              !o.isPageBg &&
              o.top > Math.min(origRect.bottom, contentBottomY) + 1 &&
              o.bottom < origRect.top - 1 &&
              o.left >= origRect.right - 2 &&
              o.left < contentMaxX + 6
          );
          if (sameRowColliders.length > 0) {
            const minColliderLeft = Math.min(...sameRowColliders.map((o) => o.left));
            const rowTail = objs.filter(
              (o) =>
                !o.isPageBg &&
                o.top > Math.min(origRect.bottom, contentBottomY) + 1 &&
                o.bottom < origRect.top - 1 &&
                o.left >= minColliderLeft - 1
            );
            const neededShiftX = contentMaxX + 6 - minColliderLeft;
            const maxTailRight = Math.max(...rowTail.map((o) => o.right));
            const availShiftX = Math.max(0, mbRight - 14 - maxTailRight);
            const dxShift = Math.min(neededShiftX, availShiftX);
            if (dxShift > 0.5) {
              for (const target of rowTail) {
                mod.FPDFPageObj_Transform(target.objPtr, 1, 0, 0, 1, dxShift, 0);
                movedObjPtrs.add(target.objPtr);
              }
            }
          }
        }

        // 3b. Reflow vertical: empurra objetos abaixo de origRect para baixo preservando espaçamento
        if (growDownPt > 1) {
          const objs = scanRemainingBounds();
          const origWidth = origRect.right - origRect.left;
          const fullBand = origWidth > pageW * 0.42 || contentMaxX - contentMinX > pageW * 0.42;
          const xBandMin = fullBand ? mbLeft : Math.min(origRect.left, contentMinX) - 10;
          const xBandMax = fullBand ? mbRight : Math.max(origRect.right, contentMaxX) + 10;

          const belowThreshold = objs.filter(
            (o) =>
              !o.isPageBg &&
              !movedObjPtrs.has(o.objPtr) &&
              o.top <= origRect.bottom + 2 &&
              o.right >= xBandMin &&
              o.left <= xBandMax
          );

          const hasVerticalCollision = belowThreshold.some(
            (o) => o.top > contentBottomY - 6
          );

          if (hasVerticalCollision && belowThreshold.length > 0) {
            let minShiftedBottom = Infinity;
            for (const target of belowThreshold) {
              mod.FPDFPageObj_Transform(target.objPtr, 1, 0, 0, 1, 0, -growDownPt);
              minShiftedBottom = Math.min(minShiftedBottom, target.bottom - growDownPt);
              movedObjPtrs.add(target.objPtr);
            }
            verticalShiftBelowPt = -growDownPt;
            shiftedBelowThresholdYPt = origRect.bottom + 2;

            // Expande MediaBox/CropBox para baixo caso o conteúdo empurrado ultrapasse a borda inferior
            if (minShiftedBottom < mbBottom + 20) {
              const expandedBottom = Math.floor(minShiftedBottom - 24);
              mod.FPDFPage_SetMediaBox(pagePtr, mbLeft, expandedBottom, mbRight, mbTop);
              if (
                mod.FPDFPage_GetCropBox(
                  pagePtr,
                  boxRectPtr,
                  boxRectPtr + 4,
                  boxRectPtr + 8,
                  boxRectPtr + 12
                )
              ) {
                const cbL = mdv.getFloat32(boxRectPtr, true);
                const cbB = mdv.getFloat32(boxRectPtr + 4, true);
                const cbR = mdv.getFloat32(boxRectPtr + 8, true);
                const cbT = mdv.getFloat32(boxRectPtr + 12, true);
                mod.FPDFPage_SetCropBox(
                  pagePtr,
                  cbL,
                  Math.min(cbB, expandedBottom),
                  cbR,
                  cbT
                );
              }
            }
          }
        }
      }

      // 4. Fundo protetor: usa o explícito do usuário, ou ativa automaticamente se houve deslocamento manual ou colisão residual
      const remainingAfterReflow = scanRemainingBounds();
      const hasResidualCollision =
        preparedLines.length > 0 &&
        remainingAfterReflow.some(
          (o) =>
            !o.isPageBg &&
            o.right > contentMinX - 2 &&
            o.left < contentMaxX + 2 &&
            o.top > contentBottomY - 2 &&
            o.bottom < contentTopY + 2
        );

      const coverRgba =
        payload.style.backgroundFillRgba ??
        (payload.style.wasManuallyMoved || hasResidualCollision
          ? payload.style.autoCoverBackgroundRgba ?? [255, 255, 255, 255]
          : null);

      if (coverRgba && preparedLines.length > 0) {
        const [br, bg, bb, ba] = coverRgba;
        const padX = 3;
        const padY = 2.5;
        const rectLeft = Math.min(payload.style.xPt, contentMinX) - padX;
        const rectRight = Math.max(
          payload.style.xPt + (payload.style.boxWidthPt ?? 0),
          contentMaxX
        ) + padX;
        const rectBottom = contentBottomY - padY;
        const rectTop = contentTopY + padY;
        const bgRectObj = mod.FPDFPageObj_CreateNewRect(
          rectLeft,
          rectBottom,
          Math.max(4, rectRight - rectLeft),
          Math.max(4, rectTop - rectBottom)
        );
        if (bgRectObj) {
          mod.FPDFPageObj_SetFillColor(bgRectObj, br, bg, bb, ba);
          mod.FPDFPath_SetDrawMode(bgRectObj, 1, false);
          mod.FPDFPage_InsertObject(pagePtr, bgRectObj);
        }
      }

      // 5. Insere os novos objetos de texto e sublinhados sobre a página já ajustada
      for (const line of preparedLines) {
        let cursorXPt = line.startXPt;
        for (const item of line.items) {
          if (item.textObj) {
            mod.FPDFPageObj_Transform(
              item.textObj,
              1,
              0,
              0,
              1,
              cursorXPt,
              line.baselineY
            );
            mod.FPDFPage_InsertObject(pagePtr, item.textObj);
          }

          if (item.isUnderline && item.advancePt > 0.5) {
            const ulThickness = Math.max(0.75, item.fontSizePt * 0.07);
            const ulObj = mod.FPDFPageObj_CreateNewRect(
              cursorXPt + item.inkLeft,
              line.baselineY - item.fontSizePt * 0.14,
              Math.max(1, item.advancePt - item.inkLeft),
              ulThickness
            );
            if (ulObj) {
              const [ur, ug, ub, ua] = item.rgba;
              mod.FPDFPageObj_SetFillColor(ulObj, ur, ug, ub, ua);
              mod.FPDFPath_SetDrawMode(ulObj, 1, false);
              mod.FPDFPage_InsertObject(pagePtr, ulObj);
            }
          }

          cursorXPt += item.advancePt;
        }
      }
    } finally {
      free(mod, boxRectPtr);
      free(mod, measureBoundsPtr);
    }

    // 6. OBRIGATÓRIO: regenera o content stream da página
    const ok = mod.FPDFPage_GenerateContent(pagePtr);
    if (!ok) {
      throw new Error('FPDFPage_GenerateContent falhou ao gravar edição de texto.');
    }
  } finally {
    for (const ptr of allocatedFontBuffers) {
      free(mod, ptr);
    }
    mod.FPDF_ClosePage(pagePtr);
  }

  const bytes = saveDocCopyBytes(mod, handle.docPtr);
  // Recarrega o handle em memória para manter XRef e índices consistentes
  loadDocIntoHeap(mod, { docId: payload.docId, bytes, password: handle.password });
  const refreshed = openDocs.get(payload.docId)!;
  return {
    bytes,
    geometries: extractGeometries(mod, refreshed.docPtr),
    verticalShiftBelowPt,
    shiftedBelowThresholdYPt,
  };
}

/**
 * Tarjamento Definitivo Real (Redaction):
 * Aplica EPDFText_RedactInRect + remove fisicamente objetos interceptados em ordem decrescente
 * + grava bloco opaco preto no content stream e exporta novo binário limpo.
 */
function applyRedactionsInWorker(
  mod: WrappedPdfiumModule,
  payload: ApplyRedactionsPayload
): CommitMutationResult {
  const handle = openDocs.get(payload.docId);
  if (!handle) throw new Error(`Documento ${payload.docId} não aberto.`);

  const rectPtr = malloc(mod, 16);
  const boundsPtr = malloc(mod, 16);

  try {
    for (const [pageStr, rects] of Object.entries(payload.redactionsByPage)) {
      const pageIndex = Number(pageStr);
      if (!rects || rects.length === 0) continue;

      const pagePtr = mod.FPDF_LoadPage(handle.docPtr, pageIndex);
      if (!pagePtr) continue;

      try {
        // 1. Tenta redaction nativo de caracteres do @embedpdf/pdfium
        for (const r of rects) {
          const dv = view(mod);
          // FS_RECTF: left, top, right, bottom
          dv.setFloat32(rectPtr + 0, r.left, true);
          dv.setFloat32(rectPtr + 4, r.top, true);
          dv.setFloat32(rectPtr + 8, r.right, true);
          dv.setFloat32(rectPtr + 12, r.bottom, true);
          try {
            mod.EPDFText_RedactInRect(pagePtr, rectPtr, true, true);
          } catch {
            // fallback abaixo garante remoção física de objetos
          }
        }

        // 2. Varre objetos em ordem decrescente e remove objetos contidos na área tarjada
        const objCount = mod.FPDFPage_CountObjects(pagePtr);
        for (let idx = objCount - 1; idx >= 0; idx--) {
          const objPtr = mod.FPDFPage_GetObject(pagePtr, idx);
          if (!objPtr) continue;
          const objType = mod.FPDFPageObj_GetType(objPtr);
          if (objType !== FPDF_PAGEOBJ_TEXT && objType !== FPDF_PAGEOBJ_PATH) continue;

          if (
            mod.FPDFPageObj_GetBounds(
              objPtr,
              boundsPtr,
              boundsPtr + 4,
              boundsPtr + 8,
              boundsPtr + 12
            )
          ) {
            const dv = view(mod);
            const oL = dv.getFloat32(boundsPtr, true);
            const oB = dv.getFloat32(boundsPtr + 4, true);
            const oR = dv.getFloat32(boundsPtr + 8, true);
            const oT = dv.getFloat32(boundsPtr + 12, true);
            const cx = (oL + oR) / 2;
            const cy = (oB + oT) / 2;

            const intersects = rects.some((r) => {
              const overlapW = Math.min(oR, r.right) - Math.max(oL, r.left);
              const overlapH = Math.min(oT, r.top) - Math.max(oB, r.bottom);
              const centerInside =
                cx >= r.left && cx <= r.right && cy >= r.bottom && cy <= r.top;
              return centerInside || (overlapW > 2 && overlapH > 2 && objType === FPDF_PAGEOBJ_TEXT);
            });

            if (intersects && mod.FPDFPage_RemoveObject(pagePtr, objPtr)) {
              mod.FPDFPageObj_Destroy(objPtr);
            }
          }
        }

        // 3. Grava retângulos opacos pretos definitivos no stream da página
        for (const r of rects) {
          const w = Math.max(1, r.right - r.left);
          const h = Math.max(1, r.top - r.bottom);
          const blackBox = mod.FPDFPageObj_CreateNewRect(r.left, r.bottom, w, h);
          if (blackBox) {
            mod.FPDFPageObj_SetFillColor(blackBox, 0, 0, 0, 255);
            mod.FPDFPath_SetDrawMode(blackBox, 1, false);
            mod.FPDFPage_InsertObject(pagePtr, blackBox);
          }
        }

        mod.FPDFPage_GenerateContent(pagePtr);
      } finally {
        mod.FPDF_ClosePage(pagePtr);
      }
    }
  } finally {
    free(mod, boundsPtr);
    free(mod, rectPtr);
  }

  const bytes = saveDocCopyBytes(mod, handle.docPtr);
  loadDocIntoHeap(mod, { docId: payload.docId, bytes, password: handle.password });
  const refreshed = openDocs.get(payload.docId)!;
  return {
    bytes,
    geometries: extractGeometries(mod, refreshed.docPtr),
  };
}

export const __pdfiumWorkerTestHooks = {
  loadDocIntoHeap,
  closeDocHandle,
  analyzeEditableTextBlocks,
  commitEditedTextBlockInWorker,
};

const workerScope =
  typeof self !== 'undefined' ? (self as unknown as DedicatedWorkerGlobalScope) : null;

if (workerScope) {
  workerScope.onmessage = async (event: MessageEvent<WorkerRequestMessage>) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case 'init': {
        await ensurePdfiumInitialized(msg.wasmUrl);
        const resp: WorkerResponseMessage = { id: msg.id, ok: true, result: true };
        workerScope.postMessage(resp);
        break;
      }
      case 'updateGeneration': {
        latestGeneration = Math.max(latestGeneration, msg.generation);
        const resp: WorkerResponseMessage = { id: msg.id, ok: true, result: latestGeneration };
        workerScope.postMessage(resp);
        break;
      }
      case 'openDocument':
      case 'replaceDocumentBytes': {
        const mod = await ensurePdfiumInitialized();
        const opened = inspectAndOpenDocument(mod, msg.payload);
        const resp: WorkerResponseMessage = { id: msg.id, ok: true, result: opened };
        workerScope.postMessage(resp);
        break;
      }
      case 'closeDocument': {
        if (pdfiumMod) {
          closeDocHandle(pdfiumMod, msg.docId);
        }
        const resp: WorkerResponseMessage = { id: msg.id, ok: true, result: true };
        workerScope.postMessage(resp);
        break;
      }
      case 'renderPage': {
        const mod = await ensurePdfiumInitialized();
        const bitmap = await renderPageToBitmap(mod, msg.payload);
        if (!bitmap) {
          const resp: WorkerResponseMessage = {
            id: msg.id,
            ok: true,
            result: null,
            cancelled: true,
          };
          workerScope.postMessage(resp);
        } else {
          const resp: WorkerResponseMessage = { id: msg.id, ok: true, result: bitmap };
          workerScope.postMessage(resp, [bitmap]);
        }
        break;
      }
      case 'renderTile': {
        const mod = await ensurePdfiumInitialized();
        const bitmap = await renderTileToBitmap(mod, msg.payload);
        if (!bitmap) {
          const resp: WorkerResponseMessage = {
            id: msg.id,
            ok: true,
            result: null,
            cancelled: true,
          };
          workerScope.postMessage(resp);
        } else {
          const resp: WorkerResponseMessage = { id: msg.id, ok: true, result: bitmap };
          workerScope.postMessage(resp, [bitmap]);
        }
        break;
      }
      case 'extractPageChars': {
        const mod = await ensurePdfiumInitialized();
        const res = extractPageChars(mod, msg.docId, msg.pageIndex);
        workerScope.postMessage({ id: msg.id, ok: true, result: res } satisfies WorkerResponseMessage);
        break;
      }
      case 'extractAllText': {
        const mod = await ensurePdfiumInitialized();
        const handle = openDocs.get(msg.docId);
        if (!handle) throw new Error('Documento não aberto');
        const count = mod.FPDF_GetPageCount(handle.docPtr);
        const pages: { pageIndex: number; text: string }[] = [];
        for (let i = 0; i < count; i++) {
          const r = extractPageChars(mod, msg.docId, i);
          pages.push({ pageIndex: i, text: r.fullText });
        }
        workerScope.postMessage({ id: msg.id, ok: true, result: pages } satisfies WorkerResponseMessage);
        break;
      }
      case 'analyzeTextBlocks': {
        const mod = await ensurePdfiumInitialized();
        const blocks = analyzeEditableTextBlocks(mod, msg.docId, msg.pageIndex);
        workerScope.postMessage({ id: msg.id, ok: true, result: blocks } satisfies WorkerResponseMessage);
        break;
      }
      case 'commitTextBlock': {
        const mod = await ensurePdfiumInitialized();
        const res = commitEditedTextBlockInWorker(mod, msg.payload);
        workerScope.postMessage(
          { id: msg.id, ok: true, result: res } satisfies WorkerResponseMessage,
          [res.bytes.buffer]
        );
        break;
      }
      case 'applyRedactions': {
        const mod = await ensurePdfiumInitialized();
        const res = applyRedactionsInWorker(mod, msg.payload);
        workerScope.postMessage(
          { id: msg.id, ok: true, result: res } satisfies WorkerResponseMessage,
          [res.bytes.buffer]
        );
        break;
      }
      case 'searchDocument': {
        const mod = await ensurePdfiumInitialized();
        const matches = searchDocumentInWorker(mod, msg.payload);
        workerScope.postMessage({ id: msg.id, ok: true, result: matches } satisfies WorkerResponseMessage);
        break;
      }
      case 'exportBytes': {
        const mod = await ensurePdfiumInitialized();
        const handle = openDocs.get(msg.docId);
        if (!handle) throw new Error('Documento não aberto');
        const bytes = saveDocCopyBytes(mod, handle.docPtr);
        workerScope.postMessage(
          { id: msg.id, ok: true, result: bytes } satisfies WorkerResponseMessage,
          [bytes.buffer]
        );
        break;
      }
    }
  } catch (err) {
    const errorObj = err as Error & { code?: string };
    const resp: WorkerResponseMessage = {
      id: msg.id,
      ok: false,
      error: errorObj?.message ?? String(err),
      errorCode: errorObj?.code,
    };
    workerScope.postMessage(resp);
  }
  };
}
