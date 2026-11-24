import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Check,
  Copy,
  GripHorizontal,
  Highlighter,
  MoveHorizontal,
  ShieldAlert,
  StickyNote,
  Strikethrough,
  Trash2,
  Underline,
  X,
} from 'lucide-react';
import type {
  PdfAnnotation,
  PdfCharBox,
  PdfEditableTextBlock,
  PdfFormField,
  PdfPageGeometry,
  PdfPoint,
  PdfRect,
  SearchMatch,
} from '@pdf-studio/platform-contracts';
import {
  applyFormFieldMask,
  cssPointToPdf,
  getCssScale,
  getEffectivePageSizePt,
  mapMetricFamilyToStandardFont,
  pdfRectToSvg,
  ptToMm,
  type RenderPriority,
  sharedPdfEngine,
  simplifyInkPoints,
} from '@pdf-studio/pdf-engine';
import {
  AddAnnotationCommand,
  BinaryDocumentMutationCommand,
  DeleteAnnotationCommand,
  type DocumentTabState,
  UpdateAnnotationCommand,
  UpdateFormFieldCommand,
  usePdfStudioStore,
} from '@pdf-studio/editor-core';
import { usePlatformActions } from '../context/PlatformContext';
import { createDraftFromTextBlock } from '../utils/textBlockCommit';
import { RichTextBlockEditor } from './RichTextBlockEditor';

export function PageStackView({
  tab,
  geometry,
  priority,
}: {
  tab: DocumentTabState;
  geometry: PdfPageGeometry;
  priority: RenderPriority;
}) {
  const { platform } = usePlatformActions();
  const activeTool = usePdfStudioStore((s) => s.activeTool);
  const workMode = usePdfStudioStore((s) => s.workMode);
  const toolStyle = usePdfStudioStore((s) => s.toolStyle);
  const executeCommand = usePdfStudioStore((s) => s.executeCommand);
  const upsertAnnotationDirect = usePdfStudioStore((s) => s.upsertAnnotationDirect);
  const removeAnnotationDirect = usePdfStudioStore((s) => s.removeAnnotationDirect);
  const setFormFieldsDirect = usePdfStudioStore((s) => s.setFormFieldsDirect);
  const updateTabState = usePdfStudioStore((s) => s.updateTabState);
  const openRightInspector = usePdfStudioStore((s) => s.openRightInspector);
  const showToast = usePdfStudioStore((s) => s.showToast);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [bitmapLoaded, setBitmapLoaded] = useState(false);
  const [chars, setChars] = useState<PdfCharBox[]>([]);
  const [textBlocks, setTextBlocks] = useState<PdfEditableTextBlock[]>([]);

  // Interações temporárias na Camada 3
  const [draftRect, setDraftRect] = useState<{ start: PdfPoint; current: PdfPoint } | null>(
    null
  );
  const [inkStrokePts, setInkStrokePts] = useState<PdfPoint[]>([]);
  const [draggingAnnot, setDraggingAnnot] = useState<{
    orig: PdfAnnotation;
    startPdf: PdfPoint;
    currentRect: PdfRect;
  } | null>(null);

  // Cápsula flutuante de seleção de texto
  const [textSelectionPopup, setTextSelectionPopup] = useState<{
    text: string;
    pdfRect: PdfRect;
    cssX: number;
    cssY: number;
  } | null>(null);

  const effSize = useMemo(() => getEffectivePageSizePt(geometry), [geometry]);
  const cssScale = getCssScale(tab.zoom);
  const widthCss = Math.round(effSize.widthPt * cssScale);
  const heightCss = Math.round(effSize.heightPt * cssScale);

  const showBaseLayer =
    tab.layers.find((l) => l.id === 'layer-content')?.visible ?? true;
  const showAnnotLayer =
    tab.layers.find((l) => l.id === 'layer-annotations')?.visible ?? true;
  const showFormsLayer =
    tab.layers.find((l) => l.id === 'layer-forms')?.visible ?? true;

  const pageAnnotations = tab.annotationsByPage[geometry.pageIndex] ?? [];
  const pageFormFields = tab.formFields.filter((f) => f.pageIndex === geometry.pageIndex);
  const pageMatches: SearchMatch[] = tab.searchMatches.filter(
    (m) => m.pageIndex === geometry.pageIndex
  );

  const mutator = useMemo(
    () => ({
      upsertAnnotation: upsertAnnotationDirect,
      removeAnnotation: removeAnnotationDirect,
    }),
    [upsertAnnotationDirect, removeAnnotationDirect]
  );

  // CAMADA 1: Renderização HiDPI + Tile Rendering Automático (> 150% ou > 4 MP)
  useEffect(() => {
    let cancelled = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.max(1, Math.round(widthCss * dpr));
    const targetH = Math.max(1, Math.round(heightCss * dpr));
    const totalPixels = targetW * targetH;
    const useTiles = tab.zoom > 1.5 && totalPixels > 4_000_000;

    if (!showBaseLayer) {
      const c = canvasRef.current;
      if (c) {
        const ctx = c.getContext('2d');
        ctx?.clearRect(0, 0, c.width, c.height);
      }
      setBitmapLoaded(true);
      return;
    }

    if (!useTiles) {
      void sharedPdfEngine
        .requestPageBitmap({
          docId: tab.docId,
          pageIndex: geometry.pageIndex,
          widthPx: targetW,
          heightPx: targetH,
          priority,
        })
        .then((bmp) => {
          if (cancelled || !bmp || !canvasRef.current) return;
          const c = canvasRef.current;
          c.width = bmp.width;
          c.height = bmp.height;
          const ctx = c.getContext('2d');
          ctx?.drawImage(bmp, 0, 0);
          setBitmapLoaded(true);
        })
        .catch(() => {});
    } else {
      // Tile Rendering em quadrantes de 512x512 px
      const tileSize = 512;
      const c = canvasRef.current;
      if (c) {
        c.width = targetW;
        c.height = targetH;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, targetW, targetH);
        }
      }

      const scaleX = targetW / Math.max(1, effSize.widthPt);
      const scaleY = targetH / Math.max(1, effSize.heightPt);

      for (let ty = 0; ty < targetH; ty += tileSize) {
        for (let tx = 0; tx < targetW; tx += tileSize) {
          const tw = Math.min(tileSize, targetW - tx);
          const th = Math.min(tileSize, targetH - ty);
          void sharedPdfEngine
            .requestTileBitmap({
              docId: tab.docId,
              pageIndex: geometry.pageIndex,
              scaleX,
              scaleY,
              tileX: tx,
              tileY: ty,
              tileWidthPx: tw,
              tileHeightPx: th,
              priority,
            })
            .then((tileBmp) => {
              if (cancelled || !tileBmp || !canvasRef.current) return;
              const ctx = canvasRef.current.getContext('2d');
              ctx?.drawImage(tileBmp, tx, ty);
              setBitmapLoaded(true);
            })
            .catch(() => {});
        }
      }
    }

    return () => {
      cancelled = true;
    };
  }, [
    tab.docId,
    tab.bytes,
    geometry.pageIndex,
    geometry.rotation,
    widthCss,
    heightCss,
    tab.zoom,
    priority,
    showBaseLayer,
    effSize.widthPt,
    effSize.heightPt,
  ]);

  // CAMADA 2: Carrega caixas de caracteres para seleção e busca
  useEffect(() => {
    let cancelled = false;
    void sharedPdfEngine
      .getPageChars(tab.docId, geometry.pageIndex)
      .then((res) => {
        if (!cancelled) setChars(res.chars);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tab.docId, tab.bytes, geometry.pageIndex]);

  // CAMADA 4: Quando ferramenta edit-text está ativa, reconstrói blocos de parágrafo
  useEffect(() => {
    if (activeTool !== 'edit-text' && workMode !== 'edit') {
      setTextBlocks([]);
      return;
    }
    let cancelled = false;
    void sharedPdfEngine
      .analyzeTextBlocks(tab.docId, geometry.pageIndex)
      .then((blocks) => {
        if (cancelled) return;
        setTextBlocks(blocks);
        const latestTab = usePdfStudioStore
          .getState()
          .tabs.find((t) => t.tabId === tab.tabId);
        updateTabState(tab.tabId, {
          editableBlocksByPage: {
            ...(latestTab?.editableBlocksByPage ?? {}),
            [geometry.pageIndex]: blocks,
          },
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeTool, workMode, tab.docId, tab.bytes, geometry.pageIndex]);

  const activeEditingBlock = textBlocks.find((b) => b.id === tab.activeEditingBlockId);
  const activeDraft =
    tab.activeTextBlockDraft && tab.activeTextBlockDraft.pageIndex === geometry.pageIndex
      ? tab.activeTextBlockDraft
      : null;

  const activateTextBlockForEditing = (block: PdfEditableTextBlock) => {
    const draft = createDraftFromTextBlock(block);
    updateTabState(tab.tabId, {
      activeEditingBlockId: block.id,
      activeTextBlockDraft: draft,
    });
    openRightInspector('auto');
  };

  type BlockHandleMode = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

  const startBlockTransform = (e: React.PointerEvent, mode: BlockHandleMode) => {
    e.preventDefault();
    e.stopPropagation();
    const currentTab = usePdfStudioStore
      .getState()
      .tabs.find((t) => t.tabId === tab.tabId);
    const startDraft = currentTab?.activeTextBlockDraft;
    if (!startDraft) return;

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startRect = { ...startDraft.rect };

    const onMove = (ev: PointerEvent) => {
      const dxPt = (ev.clientX - startClientX) / cssScale;
      const dyPt = -(ev.clientY - startClientY) / cssScale;
      const nextRect: PdfRect = { ...startRect };
      const minW = 28;
      const minH = Math.max(14, startDraft.fontSizePt * 1.15);

      if (mode === 'move') {
        nextRect.left = startRect.left + dxPt;
        nextRect.right = startRect.right + dxPt;
        nextRect.bottom = startRect.bottom + dyPt;
        nextRect.top = startRect.top + dyPt;
      } else {
        if (mode.includes('e')) {
          nextRect.right = Math.max(startRect.left + minW, startRect.right + dxPt);
        }
        if (mode.includes('w')) {
          nextRect.left = Math.min(startRect.right - minW, startRect.left + dxPt);
        }
        if (mode.includes('n')) {
          nextRect.top = Math.max(startRect.bottom + minH, startRect.top + dyPt);
        }
        if (mode.includes('s')) {
          nextRect.bottom = Math.min(startRect.top - minH, startRect.bottom + dyPt);
        }
      }

      const latest = usePdfStudioStore
        .getState()
        .tabs.find((t) => t.tabId === tab.tabId)?.activeTextBlockDraft;
      if (!latest) return;
      updateTabState(tab.tabId, {
        activeTextBlockDraft: {
          ...latest,
          rect: nextRect,
        },
      });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Agrupa caracteres da Camada 2 em linhas leves para seleção fluida de texto
  const selectableLines = useMemo(() => {
    if (chars.length === 0) return [];
    const lines: Array<{ text: string; rect: PdfRect; fontSizePt: number }> = [];
    for (const ch of chars) {
      const prev = lines[lines.length - 1];
      if (prev && Math.abs(prev.rect.bottom - ch.rect.bottom) <= ch.fontSizePt * 0.45) {
        const gap = ch.rect.left - prev.rect.right;
        prev.text += (gap > ch.fontSizePt * 0.22 ? ' ' : '') + ch.char;
        prev.rect = {
          left: Math.min(prev.rect.left, ch.rect.left),
          bottom: Math.min(prev.rect.bottom, ch.rect.bottom),
          right: Math.max(prev.rect.right, ch.rect.right),
          top: Math.max(prev.rect.top, ch.rect.top),
        };
      } else {
        lines.push({
          text: ch.char,
          rect: { ...ch.rect },
          fontSizePt: ch.fontSizePt,
        });
      }
    }
    return lines;
  }, [chars]);

  const getLocalPdfPoint = (e: React.PointerEvent | MouseEvent): PdfPoint => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return cssPointToPdf(
      { x: e.clientX - r.left, y: e.clientY - r.top },
      geometry,
      tab.zoom
    );
  };

  const isDrawingTool = [
    'highlight',
    'underline',
    'strikethrough',
    'sticky-note',
    'free-text',
    'add-text',
    'rect',
    'ellipse',
    'arrow',
    'measure-distance',
    'stamp',
    'link',
    'redact',
    'form-text',
    'form-checkbox',
    'form-signature',
  ].includes(activeTool);

  const handleOverlayPointerDown = async (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setTextSelectionPopup(null);

    if (activeTool === 'add-image') {
      const imgs = await platform.fileSystem.openImageDialog(false);
      if (imgs.length > 0) {
        const pt = getLocalPdfPoint(e);
        const blob = new Blob([new Uint8Array(imgs[0].bytes)]);
        const dataUrl = await new Promise<string>((res) => {
          const reader = new FileReader();
          reader.onload = () => res(String(reader.result));
          reader.readAsDataURL(blob);
        });
        const imgAnnot: PdfAnnotation = {
          id: `img-${Date.now()}`,
          pageIndex: geometry.pageIndex,
          type: 'image',
          rect: { left: pt.x - 70, bottom: pt.y - 50, right: pt.x + 70, top: pt.y + 50 },
          color: '#1B2952',
          opacity: 1,
          zIndex: pageAnnotations.length + 1,
          imageDataUrl: dataUrl,
          contents: imgs[0].name,
          createdAt: new Date().toISOString(),
        };
        await executeCommand(
          tab.tabId,
          new AddAnnotationCommand(tab.tabId, imgAnnot, mutator, 'Inserir imagem')
        );
        updateTabState(tab.tabId, { selectedAnnotationId: imgAnnot.id });
        usePdfStudioStore.getState().setActiveTool('select');
      }
      return;
    }

    if (activeTool === 'ink') {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const pt = getLocalPdfPoint(e);
      setInkStrokePts([pt]);
      const c = inkCanvasRef.current;
      if (c) {
        c.width = widthCss;
        c.height = heightCss;
        const ctx = c.getContext('2d')!;
        const r = containerRef.current!.getBoundingClientRect();
        ctx.strokeStyle = toolStyle.strokeColor;
        ctx.lineWidth = Math.max(1.5, toolStyle.strokeWidthPt * cssScale * (e.pressure || 0.7));
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
      }
      return;
    }

    if (isDrawingTool) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const pt = getLocalPdfPoint(e);
      setDraftRect({ start: pt, current: pt });
      return;
    }

    if (activeTool === 'select') {
      updateTabState(tab.tabId, { selectedAnnotationId: null });
    }
  };

  const handleOverlayPointerMove = (e: React.PointerEvent) => {
    if (activeTool === 'ink' && inkStrokePts.length > 0) {
      const pt = getLocalPdfPoint(e);
      setInkStrokePts((prev) => [...prev, pt]);
      const c = inkCanvasRef.current;
      if (c && containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        const ctx = c.getContext('2d')!;
        ctx.lineTo(e.clientX - r.left, e.clientY - r.top);
        ctx.stroke();
      }
      return;
    }

    if (draftRect) {
      setDraftRect({ ...draftRect, current: getLocalPdfPoint(e) });
    }
  };

  const handleOverlayPointerUp = async () => {
    if (activeTool === 'ink' && inkStrokePts.length > 1) {
      const simplified = simplifyInkPoints(inkStrokePts, 0.65);
      const xs = simplified.map((p) => p.x);
      const ys = simplified.map((p) => p.y);
      const rect: PdfRect = {
        left: Math.min(...xs) - 2,
        right: Math.max(...xs) + 2,
        bottom: Math.min(...ys) - 2,
        top: Math.max(...ys) + 2,
      };
      const annot: PdfAnnotation = {
        id: `ink-${Date.now()}`,
        pageIndex: geometry.pageIndex,
        type: 'ink',
        rect,
        inkPaths: [simplified],
        color: toolStyle.strokeColor,
        strokeColor: toolStyle.strokeColor,
        strokeWidthPt: toolStyle.strokeWidthPt,
        opacity: toolStyle.opacity,
        zIndex: pageAnnotations.length + 1,
        createdAt: new Date().toISOString(),
      };
      await executeCommand(
        tab.tabId,
        new AddAnnotationCommand(tab.tabId, annot, mutator, 'Desenho à mão livre')
      );
      setInkStrokePts([]);
      if (inkCanvasRef.current) {
        const ctx = inkCanvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, inkCanvasRef.current.width, inkCanvasRef.current.height);
      }
      return;
    }

    if (!draftRect) return;
    const { start, current } = draftRect;
    setDraftRect(null);

    let left = Math.min(start.x, current.x);
    let right = Math.max(start.x, current.x);
    let bottom = Math.min(start.y, current.y);
    let top = Math.max(start.y, current.y);

    // Se foi apenas um clique simples para nota, carimbo, texto ou campo de formulário, usa dimensão padrão
    if (right - left < 6 && top - bottom < 6) {
      if (activeTool === 'sticky-note') {
        right = left + 24;
        top = bottom + 24;
      } else if (activeTool === 'stamp') {
        right = left + 125;
        top = bottom + 36;
      } else if (activeTool === 'free-text' || activeTool === 'add-text') {
        right = left + 180;
        top = bottom + 32;
      } else if (activeTool.startsWith('form-')) {
        right = left + (activeTool === 'form-checkbox' ? 18 : 160);
        top = bottom + (activeTool === 'form-checkbox' ? 18 : 24);
      } else {
        return;
      }
    }

    const finalRect: PdfRect = { left, bottom, right, top };

    // Criação de campo de formulário AcroForm
    if (
      activeTool === 'form-text' ||
      activeTool === 'form-checkbox' ||
      activeTool === 'form-signature'
    ) {
      const fType =
        activeTool === 'form-checkbox'
          ? 'checkbox'
          : activeTool === 'form-signature'
          ? 'signature'
          : 'text';
      const newField: PdfFormField = {
        id: `fld-${Date.now()}`,
        name: `campo_${tab.formFields.length + 1}`,
        pageIndex: geometry.pageIndex,
        type: fType,
        rect: finalRect,
        value: fType === 'checkbox' ? false : '',
        tabOrder: tab.formFields.length,
      };
      const prev = [...tab.formFields];
      const next = [...prev, newField];
      await executeCommand(
        tab.tabId,
        new UpdateFormFieldCommand(
          tab.tabId,
          prev,
          next,
          setFormFieldsDirect,
          'Criar campo de formulário'
        )
      );
      return;
    }

    const mappedType: PdfAnnotation['type'] =
      activeTool === 'add-text' ? 'free-text' : (activeTool as PdfAnnotation['type']);

    const distPt = Math.hypot(current.x - start.x, current.y - start.y);
    const distMm = ptToMm(distPt);

    const newAnnot: PdfAnnotation = {
      id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      pageIndex: geometry.pageIndex,
      type: mappedType,
      rect: finalRect,
      points:
        mappedType === 'arrow' || mappedType === 'measure-distance'
          ? [start, current]
          : undefined,
      color:
        mappedType === 'redaction'
          ? '#DC2626'
          : mappedType === 'sticky-note'
          ? '#FDE047'
          : toolStyle.highlightColor,
      strokeColor:
        mappedType === 'redaction' ? '#DC2626' : toolStyle.strokeColor,
      strokeWidthPt: toolStyle.strokeWidthPt,
      opacity: mappedType === 'highlight' ? 0.35 : toolStyle.opacity,
      zIndex: pageAnnotations.length + 1,
      fontSizePt: toolStyle.fontSizePt,
      fontFamily: toolStyle.fontFamily,
      contents:
        mappedType === 'free-text'
          ? 'Novo texto editável'
          : mappedType === 'sticky-note'
          ? 'Nova nota de revisão'
          : mappedType === 'measure-distance'
          ? `${distMm} mm`
          : mappedType === 'link'
          ? 'https://'
          : '',
      stampLabel:
        mappedType === 'stamp' ? toolStyle.stampPreset || 'APROVADO' : undefined,
      stampSubLabel:
        mappedType === 'stamp'
          ? new Date().toLocaleDateString('pt-BR')
          : undefined,
      linkUrl: mappedType === 'link' ? 'https://exemplo.com.br' : undefined,
      createdAt: new Date().toISOString(),
    };

    await executeCommand(tab.tabId, new AddAnnotationCommand(tab.tabId, newAnnot, mutator));
    updateTabState(tab.tabId, { selectedAnnotationId: newAnnot.id });
    if (mappedType === 'free-text' || mappedType === 'sticky-note' || mappedType === 'link') {
      openRightInspector('auto');
    }
  };

  // Captura seleção nativa de texto na Camada 2 para abrir a Cápsula Flutuante
  const handleTextMouseUp = () => {
    if (activeTool !== 'select') return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim() || !containerRef.current) {
      setTextSelectionPopup(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rangeRect = range.getBoundingClientRect();
    const pageRect = containerRef.current.getBoundingClientRect();
    if (
      rangeRect.width < 2 ||
      rangeRect.top < pageRect.top - 10 ||
      rangeRect.bottom > pageRect.bottom + 10
    ) {
      return;
    }

    const p1 = cssPointToPdf(
      { x: rangeRect.left - pageRect.left, y: rangeRect.bottom - pageRect.top },
      geometry,
      tab.zoom
    );
    const p2 = cssPointToPdf(
      { x: rangeRect.right - pageRect.left, y: rangeRect.top - pageRect.top },
      geometry,
      tab.zoom
    );

    setTextSelectionPopup({
      text: sel.toString(),
      pdfRect: {
        left: Math.min(p1.x, p2.x),
        bottom: Math.min(p1.y, p2.y),
        right: Math.max(p1.x, p2.x),
        top: Math.max(p1.y, p2.y),
      },
      cssX: Math.max(24, rangeRect.left - pageRect.left + rangeRect.width / 2),
      cssY: Math.max(8, rangeRect.top - pageRect.top - 38),
    });
  };

  const createSelectionMarkup = async (
    type: 'highlight' | 'underline' | 'strikethrough' | 'sticky-note' | 'redaction',
    color = '#FACC15'
  ) => {
    if (!textSelectionPopup) return;
    const annot: PdfAnnotation = {
      id: `sel-${Date.now()}`,
      pageIndex: geometry.pageIndex,
      type,
      rect: textSelectionPopup.pdfRect,
      color: type === 'redaction' ? '#DC2626' : color,
      strokeColor: type === 'redaction' ? '#DC2626' : color,
      opacity: type === 'highlight' ? 0.35 : 1,
      zIndex: pageAnnotations.length + 1,
      contents: type === 'sticky-note' ? textSelectionPopup.text : '',
      createdAt: new Date().toISOString(),
    };
    await executeCommand(tab.tabId, new AddAnnotationCommand(tab.tabId, annot, mutator));
    window.getSelection()?.removeAllRanges();
    setTextSelectionPopup(null);
  };

  const selectedAnnotOnPage = pageAnnotations.find(
    (a) => a.id === tab.selectedAnnotationId
  );

  // Filtro CSS de Tema Independente da Folha (Normal / Noturno / Sépia)
  const pageThemeFilter =
    tab.pageTheme === 'night'
      ? 'invert(0.92) hue-rotate(180deg) contrast(1.05)'
      : tab.pageTheme === 'sepia'
      ? 'sepia(0.38) brightness(0.97)'
      : 'none';

  return (
    <div
      ref={containerRef}
      style={{ width: widthCss, height: heightCss }}
      onMouseUp={handleTextMouseUp}
      className="relative mx-auto select-none bg-white shadow-[0_2px_12px_rgba(15,23,42,0.14)] ring-1 ring-black/5"
    >
      {/* Skeleton sutil enquanto o Worker PDFium finaliza a renderização */}
      {!bitmapLoaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white via-slate-100 to-white" />
      )}

      {/* CAMADA 1 (Base): Canvas HTML5 HiDPI / Tiles */}
      <canvas
        ref={canvasRef}
        style={{ filter: pageThemeFilter }}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      {/* CAMADA 2: Texto Transparente Selecionável + Destaques de Busca */}
      <div
        className={`absolute inset-0 overflow-hidden ${
          activeTool === 'select' ? 'pointer-events-auto select-text' : 'pointer-events-none'
        }`}
      >
        {/* Realces de Busca Global */}
        {pageMatches.map((m) =>
          m.rects.map((r, rIdx) => {
            const box = pdfRectToSvg(r, effSize.heightPt, geometry.cropBox);
            const isCurrentMatch =
              tab.searchMatches[tab.activeSearchMatchIndex]?.id === m.id;
            return (
              <div
                key={`${m.id}-${rIdx}`}
                style={{
                  left: box.x * cssScale,
                  top: box.y * cssScale,
                  width: box.width * cssScale,
                  height: box.height * cssScale,
                }}
                className={`pointer-events-none absolute rounded-sm ${
                  isCurrentMatch
                    ? 'bg-orange-500/45 ring-2 ring-orange-500'
                    : 'bg-yellow-400/40'
                }`}
              />
            );
          })
        )}

        {/* Spans invisíveis mapeados pelas coordenadas dos caracteres do PDFium */}
        {selectableLines.map((ln, idx) => {
          const box = pdfRectToSvg(ln.rect, effSize.heightPt, geometry.cropBox);
          return (
            <span
              key={idx}
              style={{
                left: box.x * cssScale,
                top: box.y * cssScale,
                width: box.width * cssScale,
                height: box.height * cssScale,
                fontSize: Math.max(6, ln.fontSizePt * cssScale * 0.92),
                lineHeight: `${box.height * cssScale}px`,
              }}
              className="absolute whitespace-pre text-transparent selection:bg-[#1B2952]/20 selection:text-transparent"
            >
              {ln.text}
            </span>
          );
        })}
      </div>

      {/* CAMADA 3: SVG Normalizado em Pontos PDF + Canvas Efêmero de Tinta */}
      {showAnnotLayer && (
        <svg
          viewBox={`0 0 ${effSize.widthPt} ${effSize.heightPt}`}
          onPointerDown={handleOverlayPointerDown}
          onPointerMove={(e) => {
            handleOverlayPointerMove(e);
            if (draggingAnnot) {
              const cur = getLocalPdfPoint(e);
              const dx = cur.x - draggingAnnot.startPdf.x;
              const dy = cur.y - draggingAnnot.startPdf.y;
              setDraggingAnnot({
                ...draggingAnnot,
                currentRect: {
                  left: draggingAnnot.orig.rect.left + dx,
                  right: draggingAnnot.orig.rect.right + dx,
                  bottom: draggingAnnot.orig.rect.bottom + dy,
                  top: draggingAnnot.orig.rect.top + dy,
                },
              });
            }
          }}
          onPointerUp={async () => {
            await handleOverlayPointerUp();
            if (draggingAnnot) {
              const moved = draggingAnnot;
              setDraggingAnnot(null);
              if (
                Math.abs(moved.currentRect.left - moved.orig.rect.left) > 0.5 ||
                Math.abs(moved.currentRect.bottom - moved.orig.rect.bottom) > 0.5
              ) {
                await executeCommand(
                  tab.tabId,
                  new UpdateAnnotationCommand(
                    tab.tabId,
                    moved.orig,
                    { ...moved.orig, rect: moved.currentRect },
                    mutator,
                    'Mover anotação'
                  )
                );
              }
            }
          }}
          className={`absolute inset-0 h-full w-full ${
            isDrawingTool || activeTool === 'ink' || activeTool === 'eraser' || activeTool === 'add-image'
              ? 'pointer-events-auto cursor-crosshair'
              : 'pointer-events-none'
          }`}
        >
          <defs>
            <marker
              id={`arrow-${geometry.pageIndex}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#1B2952" />
            </marker>
          </defs>

          {[...pageAnnotations]
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((annot) => {
              const effectiveRect =
                draggingAnnot?.orig.id === annot.id
                  ? draggingAnnot.currentRect
                  : annot.rect;
              const box = pdfRectToSvg(effectiveRect, effSize.heightPt, geometry.cropBox);
              const isSelected = tab.selectedAnnotationId === annot.id;

              return (
                <g
                  key={annot.id}
                  style={{ pointerEvents: 'auto' }}
                  className={
                    activeTool === 'eraser' ? 'cursor-pointer' : 'cursor-move'
                  }
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (activeTool === 'eraser') {
                      void executeCommand(
                        tab.tabId,
                        new DeleteAnnotationCommand(tab.tabId, annot, mutator)
                      );
                      return;
                    }
                    updateTabState(tab.tabId, { selectedAnnotationId: annot.id });
                    setDraggingAnnot({
                      orig: annot,
                      startPdf: getLocalPdfPoint(e),
                      currentRect: annot.rect,
                    });
                  }}
                >
                  {annot.type === 'highlight' && (
                    <rect
                      x={box.x}
                      y={box.y}
                      width={box.width}
                      height={box.height}
                      fill={annot.color}
                      fillOpacity={annot.opacity}
                      style={{ mixBlendMode: 'multiply' }}
                    />
                  )}

                  {annot.type === 'underline' && (
                    <line
                      x1={box.x}
                      y1={box.y + box.height}
                      x2={box.x + box.width}
                      y2={box.y + box.height}
                      stroke={annot.strokeColor ?? annot.color}
                      strokeWidth={1.6}
                    />
                  )}

                  {annot.type === 'strikethrough' && (
                    <line
                      x1={box.x}
                      y1={box.y + box.height / 2}
                      x2={box.x + box.width}
                      y2={box.y + box.height / 2}
                      stroke={annot.strokeColor ?? annot.color}
                      strokeWidth={1.6}
                    />
                  )}

                  {annot.type === 'rect' && (
                    <rect
                      x={box.x}
                      y={box.y}
                      width={box.width}
                      height={box.height}
                      fill={annot.color}
                      fillOpacity={0.14}
                      stroke={annot.strokeColor ?? annot.color}
                      strokeWidth={annot.strokeWidthPt ?? 1.8}
                    />
                  )}

                  {annot.type === 'ellipse' && (
                    <ellipse
                      cx={box.x + box.width / 2}
                      cy={box.y + box.height / 2}
                      rx={box.width / 2}
                      ry={box.height / 2}
                      fill={annot.color}
                      fillOpacity={0.12}
                      stroke={annot.strokeColor ?? annot.color}
                      strokeWidth={annot.strokeWidthPt ?? 1.8}
                    />
                  )}

                  {(annot.type === 'arrow' || annot.type === 'measure-distance') && (
                    <g>
                      <line
                        x1={
                          annot.points
                            ? annot.points[0].x - geometry.cropBox.left
                            : box.x
                        }
                        y1={
                          annot.points
                            ? effSize.heightPt - (annot.points[0].y - geometry.cropBox.bottom)
                            : box.y + box.height
                        }
                        x2={
                          annot.points
                            ? annot.points[1].x - geometry.cropBox.left
                            : box.x + box.width
                        }
                        y2={
                          annot.points
                            ? effSize.heightPt - (annot.points[1].y - geometry.cropBox.bottom)
                            : box.y
                        }
                        stroke={annot.strokeColor ?? '#1B2952'}
                        strokeWidth={annot.strokeWidthPt ?? 2}
                        markerEnd={`url(#arrow-${geometry.pageIndex})`}
                      />
                      {annot.type === 'measure-distance' && annot.contents && (
                        <text
                          x={box.x + box.width / 2}
                          y={box.y + box.height / 2 - 4}
                          fontSize={9}
                          fontWeight="bold"
                          textAnchor="middle"
                          fill="#1B2952"
                        >
                          {annot.contents}
                        </text>
                      )}
                    </g>
                  )}

                  {annot.type === 'ink' &&
                    (annot.inkPaths ?? []).map((path, pIdx) => {
                      const d = path
                        .map((pt, i) => {
                          const sx = pt.x - geometry.cropBox.left;
                          const sy = effSize.heightPt - (pt.y - geometry.cropBox.bottom);
                          return `${i === 0 ? 'M' : 'L'} ${sx.toFixed(1)} ${sy.toFixed(1)}`;
                        })
                        .join(' ');
                      return (
                        <path
                          key={pIdx}
                          d={d}
                          fill="none"
                          stroke={annot.strokeColor ?? annot.color}
                          strokeWidth={annot.strokeWidthPt ?? 2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={annot.opacity}
                        />
                      );
                    })}

                  {annot.type === 'sticky-note' && (
                    <g>
                      <rect
                        x={box.x}
                        y={box.y}
                        width={Math.max(20, box.width)}
                        height={Math.max(20, box.height)}
                        rx={3}
                        fill={annot.color || '#FDE047'}
                        stroke="#CA8A04"
                        strokeWidth={1}
                      />
                      <text
                        x={box.x + 5}
                        y={box.y + 14}
                        fontSize={10}
                        fontWeight="bold"
                        fill="#713F12"
                      >
                        ★
                      </text>
                    </g>
                  )}

                  {annot.type === 'free-text' && (
                    <g>
                      <rect
                        x={box.x}
                        y={box.y}
                        width={box.width}
                        height={box.height}
                        fill="rgba(255,255,255,0.82)"
                        stroke="rgba(27,41,82,0.25)"
                        strokeWidth={0.75}
                      />
                      <text
                        x={box.x + 4}
                        y={box.y + (annot.fontSizePt ?? 12) + 2}
                        fontSize={annot.fontSizePt ?? 12}
                        fill={annot.color || '#1B2952'}
                      >
                        {annot.contents || 'Texto'}
                      </text>
                    </g>
                  )}

                  {annot.type === 'stamp' && (
                    <g>
                      <rect
                        x={box.x}
                        y={box.y}
                        width={box.width}
                        height={box.height}
                        rx={4}
                        fill={annot.color}
                        fillOpacity={0.12}
                        stroke={annot.strokeColor ?? annot.color}
                        strokeWidth={2}
                      />
                      <text
                        x={box.x + box.width / 2}
                        y={box.y + box.height / 2 + 3}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight="bold"
                        fill={annot.strokeColor ?? annot.color}
                      >
                        {annot.stampLabel || 'APROVADO'}
                      </text>
                    </g>
                  )}

                  {(annot.type === 'signature-visual' || annot.type === 'image') &&
                    annot.imageDataUrl && (
                      <image
                        href={annot.imageDataUrl}
                        x={box.x}
                        y={box.y}
                        width={box.width}
                        height={box.height}
                        preserveAspectRatio="contain"
                        opacity={annot.opacity}
                      />
                    )}

                  {annot.type === 'link' && (
                    <rect
                      x={box.x}
                      y={box.y}
                      width={box.width}
                      height={box.height}
                      fill="rgba(47,77,143,0.1)"
                      stroke="#2F4D8F"
                      strokeDasharray="3 2"
                      strokeWidth={1}
                    />
                  )}

                  {annot.type === 'redaction' && (
                    <rect
                      x={box.x}
                      y={box.y}
                      width={box.width}
                      height={box.height}
                      fill="rgba(220, 38, 38, 0.26)"
                      stroke="#DC2626"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                    />
                  )}

                  {isSelected && (
                    <rect
                      x={box.x - 1.5}
                      y={box.y - 1.5}
                      width={box.width + 3}
                      height={box.height + 3}
                      fill="none"
                      stroke="#1B2952"
                      strokeWidth={1.3}
                      strokeDasharray="3 2"
                    />
                  )}
                </g>
              );
            })}

          {/* Retângulo de rascunho durante arraste de criação */}
          {draftRect && (
            <rect
              {...pdfRectToSvg(
                {
                  left: Math.min(draftRect.start.x, draftRect.current.x),
                  right: Math.max(draftRect.start.x, draftRect.current.x),
                  bottom: Math.min(draftRect.start.y, draftRect.current.y),
                  top: Math.max(draftRect.start.y, draftRect.current.y),
                },
                effSize.heightPt,
                geometry.cropBox
              )}
              fill={
                activeTool === 'redact'
                  ? 'rgba(220,38,38,0.22)'
                  : 'rgba(27,41,82,0.12)'
              }
              stroke={activeTool === 'redact' ? '#DC2626' : '#2F4D8F'}
              strokeWidth={1.2}
              strokeDasharray="3 2"
            />
          )}
        </svg>
      )}

      {/* Canvas Efêmero de Caneta Livre a 60 FPS */}
      <canvas
        ref={inkCanvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      {/* Controles Interativos de Formulário AcroForm */}
      {showFormsLayer &&
        (workMode === 'forms' || pageFormFields.length > 0) &&
        pageFormFields.map((field) => {
          const box = pdfRectToSvg(field.rect, effSize.heightPt, geometry.cropBox);
          return (
            <div
              key={field.id}
              style={{
                left: box.x * cssScale,
                top: box.y * cssScale,
                width: box.width * cssScale,
                height: box.height * cssScale,
              }}
              className="pointer-events-auto absolute"
            >
              {field.type === 'checkbox' ? (
                <input
                  type="checkbox"
                  checked={Boolean(field.value)}
                  onChange={(e) => {
                    const next = tab.formFields.map((f) =>
                      f.id === field.id ? { ...f, value: e.target.checked } : f
                    );
                    void executeCommand(
                      tab.tabId,
                      new UpdateFormFieldCommand(tab.tabId, tab.formFields, next, setFormFieldsDirect)
                    );
                  }}
                  className="h-full w-full cursor-pointer accent-[#1B2952]"
                />
              ) : (
                <input
                  type="text"
                  value={String(field.value ?? '')}
                  placeholder={field.name}
                  onChange={(e) => {
                    const formatted = applyFormFieldMask(e.target.value, field.mask);
                    const next = tab.formFields.map((f) =>
                      f.id === field.id ? { ...f, value: formatted } : f
                    );
                    setFormFieldsDirect(tab.tabId, next);
                  }}
                  style={{ fontSize: Math.max(9, 10.5 * cssScale) }}
                  className="h-full w-full rounded-sm border border-[#2F4D8F]/50 bg-blue-50/75 px-1.5 text-slate-900 outline-none focus:border-[#1B2952] focus:bg-white"
                />
              )}
            </div>
          );
        })}

      {/* CAMADA 4 (Topo): Editor DOM Expansível e Reposicionável de Blocos de Texto */}
      {activeTool === 'edit-text' &&
        textBlocks.map((block) => {
          const origBox = pdfRectToSvg(block.rect, effSize.heightPt, geometry.cropBox);
          const isEditingThis =
            tab.activeEditingBlockId === block.id && activeDraft?.blockId === block.id;

          if (isEditingThis && activeDraft) {
            return (
              <RichTextBlockEditor
                key={block.id}
                tab={tab}
                block={block}
                draft={activeDraft}
                geometry={geometry}
                effSize={effSize}
                cssScale={cssScale}
                onStartTransform={startBlockTransform}
              />
            );
          }

          return (
            <div
              key={block.id}
              title="Clique para editar, mover ou expandir este bloco de texto além do padrão original"
              onClick={(e) => {
                e.stopPropagation();
                activateTextBlockForEditing(block);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                activateTextBlockForEditing(block);
              }}
              style={{
                left: origBox.x * cssScale - 2,
                top: origBox.y * cssScale - 2,
                width: origBox.width * cssScale + 4,
                height: origBox.height * cssScale + 4,
              }}
              className="pointer-events-auto absolute cursor-pointer rounded border border-dashed border-[#2F4D8F]/55 transition hover:border-[#1B2952] hover:bg-[#1B2952]/8"
            />
          );
        })}

      {/* CÁPSULA FLUTUANTE DE SELEÇÃO DE TEXTO (Inline Floating Toolbar) */}
      {textSelectionPopup && (
        <div
          style={{
            left: textSelectionPopup.cssX,
            top: textSelectionPopup.cssY,
            transform: 'translateX(-50%)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute z-40 flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-800 shadow-xl"
        >
          <button
            onClick={() => {
              void navigator.clipboard.writeText(textSelectionPopup.text);
              showToast('Texto copiado.', 'info');
              setTextSelectionPopup(null);
            }}
            title="Copiar texto (Ctrl+C)"
            className="rounded-full p-1 hover:bg-slate-100"
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <div className="h-3.5 w-px bg-slate-200" />
          {['#FACC15', '#4ADE80', '#60A5FA', '#F87171'].map((col) => (
            <button
              key={col}
              onClick={() => void createSelectionMarkup('highlight', col)}
              title="Marca-texto rápido"
              style={{ backgroundColor: col }}
              className="h-3.5 w-3.5 rounded-full border border-black/15 hover:scale-110"
            />
          ))}
          <button
            onClick={() => void createSelectionMarkup('underline', '#1B2952')}
            title="Sublinhar"
            className="rounded-full p-1 hover:bg-slate-100"
          >
            <Underline className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => void createSelectionMarkup('strikethrough', '#DC2626')}
            title="Tachar"
            className="rounded-full p-1 hover:bg-slate-100"
          >
            <Strikethrough className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => void createSelectionMarkup('sticky-note', '#FDE047')}
            title="Adicionar Nota"
            className="rounded-full p-1 hover:bg-slate-100"
          >
            <StickyNote className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => void createSelectionMarkup('redaction', '#DC2626')}
            title="Marcar para Tarjamento Definitivo"
            className="rounded-full p-1 text-red-600 hover:bg-red-50"
          >
            <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* CÁPSULA FLUTUANTE DE OBJETO / ANOTAÇÃO SELECIONADA */}
      {selectedAnnotOnPage && activeEditingBlock === undefined && (
        <div
          style={{
            left: Math.max(
              30,
              pdfRectToSvg(selectedAnnotOnPage.rect, effSize.heightPt, geometry.cropBox).x *
                cssScale
            ),
            top: Math.max(
              4,
              pdfRectToSvg(selectedAnnotOnPage.rect, effSize.heightPt, geometry.cropBox).y *
                cssScale -
                34
            ),
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute z-40 flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-700 shadow-lg"
        >
          {['#FACC15', '#4ADE80', '#60A5FA', '#DC2626', '#1B2952'].map((col) => (
            <button
              key={col}
              onClick={() =>
                void executeCommand(
                  tab.tabId,
                  new UpdateAnnotationCommand(
                    tab.tabId,
                    selectedAnnotOnPage,
                    { ...selectedAnnotOnPage, color: col, strokeColor: col },
                    mutator,
                    'Alterar cor'
                  )
                )
              }
              style={{ backgroundColor: col }}
              className="h-3.5 w-3.5 rounded-full border border-black/20"
            />
          ))}
          <div className="h-3.5 w-px bg-slate-200" />
          <button
            onClick={() =>
              void executeCommand(
                tab.tabId,
                new UpdateAnnotationCommand(
                  tab.tabId,
                  selectedAnnotOnPage,
                  { ...selectedAnnotOnPage, zIndex: selectedAnnotOnPage.zIndex + 5 },
                  mutator,
                  'Trazer para frente'
                )
              )
            }
            title="Trazer para frente"
            className="rounded p-0.5 hover:bg-slate-100"
          >
            <ArrowUpToLine className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={() =>
              void executeCommand(
                tab.tabId,
                new UpdateAnnotationCommand(
                  tab.tabId,
                  selectedAnnotOnPage,
                  { ...selectedAnnotOnPage, zIndex: Math.max(0, selectedAnnotOnPage.zIndex - 5) },
                  mutator,
                  'Enviar para trás'
                )
              )
            }
            title="Enviar para trás"
            className="rounded p-0.5 hover:bg-slate-100"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => {
              const dup: PdfAnnotation = {
                ...selectedAnnotOnPage,
                id: `dup-${Date.now()}`,
                rect: {
                  left: selectedAnnotOnPage.rect.left + 14,
                  right: selectedAnnotOnPage.rect.right + 14,
                  bottom: selectedAnnotOnPage.rect.bottom - 14,
                  top: selectedAnnotOnPage.rect.top - 14,
                },
              };
              void executeCommand(
                tab.tabId,
                new AddAnnotationCommand(tab.tabId, dup, mutator, 'Duplicar anotação')
              );
            }}
            title="Duplicar"
            className="rounded p-0.5 hover:bg-slate-100"
          >
            <Highlighter className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={() =>
              void executeCommand(
                tab.tabId,
                new DeleteAnnotationCommand(tab.tabId, selectedAnnotOnPage, mutator)
              )
            }
            title="Excluir (Delete)"
            className="rounded p-0.5 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
}
