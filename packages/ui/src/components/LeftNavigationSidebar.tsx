import React, { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  BookmarkPlus,
  Copy,
  Download,
  FileImage,
  Layers,
  type LucideIcon,
  MessageSquare,
  Paperclip,
  RotateCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { LeftSidebarPanel, PdfBookmarkNode } from '@pdf-studio/platform-contracts';
import {
  deletePdfPages,
  duplicatePdfPage,
  reorderPdfPages,
  rotatePdfPages,
  sharedPdfEngine,
} from '@pdf-studio/pdf-engine';
import {
  describeAnnotType,
  type DocumentTabState,
  usePdfStudioStore,
} from '@pdf-studio/editor-core';
import { usePlatformActions } from '../context/PlatformContext';
import {
  CollabToolbar,
  HaloBadge,
  HaloInput,
  HaloSelect,
  MinimalCard,
  MinimalCardFrame,
  TextureButton,
  TextureSeparator,
} from './cult/CultUiPrimitives';

function PageThumbnailCard({
  docId,
  pageIndex,
  widthPt,
  heightPt,
  isCurrent,
  onSelect,
  onRotate,
  onDuplicate,
  onDelete,
  canDelete,
  onDragStart,
  onDrop,
}: {
  docId: string;
  pageIndex: number;
  widthPt: number;
  heightPt: number;
  isCurrent: boolean;
  onSelect: () => void;
  onRotate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canDelete: boolean;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const thumbW = 140;
    const thumbH = Math.max(80, Math.round((heightPt / Math.max(1, widthPt)) * thumbW));

    void sharedPdfEngine
      .requestPageBitmap({
        docId,
        pageIndex,
        widthPx: thumbW,
        heightPx: thumbH,
        priority: 'low',
        useLatestGeneration: false,
      })
      .then((bmp) => {
        if (cancelled || !bmp || !canvasRef.current) return;
        const c = canvasRef.current;
        c.width = bmp.width;
        c.height = bmp.height;
        const ctx = c.getContext('2d');
        ctx?.drawImage(bmp, 0, 0);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [docId, pageIndex, widthPt, heightPt]);

  return (
    <MinimalCard
      draggable
      active={isCurrent}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={onSelect}
      className="group relative flex cursor-pointer flex-col items-center p-2"
    >
      <MinimalCardFrame className="relative rounded-[10px]">
        <canvas ref={canvasRef} className="block max-h-44 w-[124px] object-contain" />
        <div className="absolute right-1.5 top-1.5 hidden group-hover:flex">
          <CollabToolbar darkSurface className="gap-0.5 p-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRotate();
              }}
              title="Rotacionar 90°"
              className="rounded-full p-1 hover:bg-white/15"
            >
              <RotateCw className="h-3 w-3" strokeWidth={1.6} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
              }}
              title="Duplicar página"
              className="rounded-full p-1 hover:bg-white/15"
            >
              <Copy className="h-3 w-3" strokeWidth={1.6} />
            </button>
            {canDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                title="Excluir página"
                className="rounded-full p-1 text-red-400 hover:bg-red-600 hover:text-white"
              >
                <Trash2 className="h-3 w-3" strokeWidth={1.6} />
              </button>
            )}
          </CollabToolbar>
        </div>
      </MinimalCardFrame>
      <span
        className={`mt-2 text-[11px] font-medium tabular-nums ${
          isCurrent
            ? 'font-semibold text-neutral-950 dark:text-white'
            : 'text-neutral-500 dark:text-neutral-400'
        }`}
      >
        {pageIndex + 1}
      </span>
    </MinimalCard>
  );
}

const RAIL_ITEMS: Array<{
  id: LeftSidebarPanel;
  label: string;
  icon: LucideIcon;
}> = [
  { id: 'thumbnails', label: 'Miniaturas de Páginas', icon: FileImage },
  { id: 'bookmarks', label: 'Sumário (Marcadores)', icon: Bookmark },
  { id: 'comments', label: 'Comentários e Revisões', icon: MessageSquare },
  { id: 'attachments', label: 'Anexos Embutidos', icon: Paperclip },
  { id: 'layers', label: 'Camadas (OCG)', icon: Layers },
  { id: 'signatures', label: 'Assinaturas Digitais', icon: ShieldCheck },
];

export function LeftNavigationSidebar({
  tab,
  onScrollToPage,
}: {
  tab: DocumentTabState;
  onScrollToPage: (pageIndex: number) => void;
}) {
  const { platform, applyStructuralMutation } = usePlatformActions();
  const leftSidebarOpen = usePdfStudioStore((s) => s.leftSidebarOpen);
  const leftSidebarPanel = usePdfStudioStore((s) => s.leftSidebarPanel);
  const leftSidebarWidth = usePdfStudioStore((s) => s.leftSidebarWidth);
  const setLeftSidebarPanel = usePdfStudioStore((s) => s.setLeftSidebarPanel);
  const setLeftSidebarWidth = usePdfStudioStore((s) => s.setLeftSidebarWidth);
  const updateTabState = usePdfStudioStore((s) => s.updateTabState);
  const setWorkMode = usePdfStudioStore((s) => s.setWorkMode);
  const setActiveTool = usePdfStudioStore((s) => s.setActiveTool);
  const openRightInspector = usePdfStudioStore((s) => s.openRightInspector);
  const showToast = usePdfStudioStore((s) => s.showToast);

  const [dragThumbIdx, setDragThumbIdx] = useState<number | null>(null);
  const [commentFilter, setCommentFilter] = useState<string>('all');
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
  const [editingBookmarkTitle, setEditingBookmarkTitle] = useState('');

  const allAnnotations = Object.values(tab.annotationsByPage).flat();
  const filteredComments = allAnnotations.filter((a) => {
    if (commentFilter === 'all') return true;
    return (a.reviewStatus ?? 'none') === commentFilter;
  });

  const addBookmarkForCurrentPage = () => {
    const newNode: PdfBookmarkNode = {
      id: `bm-custom-${Date.now()}`,
      title: `Seção — Página ${tab.currentPage + 1}`,
      pageIndex: tab.currentPage,
      expanded: true,
      children: [],
    };
    updateTabState(tab.tabId, {
      isDirty: true,
      bookmarks: [...tab.bookmarks, newNode],
    });
    showToast(`Marcador adicionado para a página ${tab.currentPage + 1}.`, 'success');
  };

  const exportCommentsSummary = async () => {
    const lines = [
      `# Relatório de Comentários e Revisões — ${tab.fileName}`,
      '',
      ...allAnnotations.map(
        (a, idx) =>
          `${idx + 1}. **Página ${a.pageIndex + 1}** · *${describeAnnotType(a.type)}* · Status: \`${
            a.reviewStatus ?? 'pendente'
          }\`\n   - Nota: ${a.contents || '(Sem texto adicional)'}`
      ),
    ];
    await platform.fileSystem.exportBlobFile(
      lines.join('\n'),
      `${tab.fileName.replace(/\.pdf$/i, '')}-comentarios.md`,
      'text/markdown;charset=utf-8'
    );
    showToast('Resumo de comentários exportado em Markdown.', 'success');
  };

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftSidebarWidth;
    const onMove = (ev: PointerEvent) => {
      setLeftSidebarWidth(startW + (ev.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <aside className="z-20 flex shrink-0 select-none border-r border-black/[0.08] bg-[#FAFAFA] text-neutral-700 dark:border-white/[0.08] dark:bg-[#161716] dark:text-neutral-200">
      {/* Trilho Vertical Fixo Cult UI (46 px) */}
      <div className="flex w-[46px] shrink-0 flex-col items-center gap-1.5 border-r border-black/[0.06] bg-white py-2.5 dark:border-white/[0.06] dark:bg-[#1C1D1C]">
        {RAIL_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = leftSidebarOpen && leftSidebarPanel === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setLeftSidebarPanel(item.id)}
              title={item.label}
              className={`relative flex h-8 w-8 items-center justify-center rounded-[9px] border transition-[background-color,color,box-shadow,transform] duration-150 active:scale-95 ${
                active
                  ? 'border-black/15 bg-gradient-to-b from-neutral-800 to-neutral-950 text-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] dark:border-white/15 dark:from-neutral-100 dark:to-neutral-200 dark:text-neutral-950'
                  : 'border-transparent text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-[#262726] dark:hover:text-neutral-100'
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.6} />
              {item.id === 'comments' && allAnnotations.length > 0 && (
                <HaloBadge
                  tone="sky"
                  className="absolute -right-1 -top-1 min-w-[15px] px-1 text-[9px]"
                >
                  {allAnnotations.length}
                </HaloBadge>
              )}
              {item.id === 'signatures' && tab.signatures.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#1C1D1C]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Gaveta Redimensionável (220 a 380 px) */}
      {leftSidebarOpen && (
        <div
          style={{ width: leftSidebarWidth }}
          className="relative flex h-full flex-col overflow-hidden"
        >
          <div className="flex h-10 shrink-0 items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-500 dark:text-neutral-400">
            <span className="truncate">
              {RAIL_ITEMS.find((r) => r.id === leftSidebarPanel)?.label}
            </span>
            {leftSidebarPanel === 'bookmarks' && (
              <TextureButton
                variant="minimal"
                size="icon"
                onClick={addBookmarkForCurrentPage}
                title="Adicionar marcador na página atual"
              >
                <BookmarkPlus className="h-3.5 w-3.5" strokeWidth={1.6} />
              </TextureButton>
            )}
          </div>

          <TextureSeparator />

          <div className="flex-1 overflow-y-auto p-3 text-xs">
            {/* 1. MINIATURAS */}
            {leftSidebarPanel === 'thumbnails' && (
              <div className="space-y-3">
                {tab.geometries.map((geo) => (
                  <PageThumbnailCard
                    key={`${tab.bytes.byteLength}-${geo.pageIndex}-${geo.rotation}`}
                    docId={tab.docId}
                    pageIndex={geo.pageIndex}
                    widthPt={geo.widthPt}
                    heightPt={geo.heightPt}
                    isCurrent={tab.currentPage === geo.pageIndex}
                    onSelect={() => onScrollToPage(geo.pageIndex)}
                    onRotate={() => {
                      void applyStructuralMutation(
                        tab.tabId,
                        `Rotacionar página ${geo.pageIndex + 1}`,
                        (b) => rotatePdfPages(b, [geo.pageIndex], 90)
                      );
                    }}
                    onDuplicate={() => {
                      void applyStructuralMutation(
                        tab.tabId,
                        `Duplicar página ${geo.pageIndex + 1}`,
                        (b) => duplicatePdfPage(b, geo.pageIndex)
                      );
                    }}
                    onDelete={() => {
                      void applyStructuralMutation(
                        tab.tabId,
                        `Excluir página ${geo.pageIndex + 1}`,
                        (b) => deletePdfPages(b, [geo.pageIndex])
                      );
                    }}
                    canDelete={tab.geometries.length > 1}
                    onDragStart={() => setDragThumbIdx(geo.pageIndex)}
                    onDrop={() => {
                      if (dragThumbIdx !== null && dragThumbIdx !== geo.pageIndex) {
                        const order = tab.geometries.map((g) => g.pageIndex);
                        const [moved] = order.splice(dragThumbIdx, 1);
                        order.splice(geo.pageIndex, 0, moved);
                        void applyStructuralMutation(
                          tab.tabId,
                          'Reordenar páginas via miniaturas',
                          (b) => reorderPdfPages(b, order)
                        );
                      }
                      setDragThumbIdx(null);
                    }}
                  />
                ))}
              </div>
            )}

            {/* 2. SUMÁRIO / BOOKMARKS */}
            {leftSidebarPanel === 'bookmarks' && (
              <div>
                {tab.bookmarks.length === 0 ? (
                  <div className="py-8 text-center">
                    <Bookmark
                      className="mx-auto mb-2 h-6 w-6 opacity-35"
                      strokeWidth={1.5}
                    />
                    <p className="text-neutral-500 dark:text-neutral-400">
                      Este documento ainda não possui marcadores.
                    </p>
                    <TextureButton
                      variant="primary"
                      size="xs"
                      className="mt-3"
                      onClick={addBookmarkForCurrentPage}
                    >
                      Adicionar marcador na página atual
                    </TextureButton>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {tab.bookmarks.map((bm) => (
                      <div key={bm.id} className="space-y-1">
                        <div
                          onClick={() => onScrollToPage(bm.pageIndex)}
                          onDoubleClick={() => {
                            setEditingBookmarkId(bm.id);
                            setEditingBookmarkTitle(bm.title);
                          }}
                          className={`flex cursor-pointer items-center justify-between rounded-[8px] px-2.5 py-1.5 transition-colors ${
                            tab.currentPage === bm.pageIndex
                              ? 'bg-neutral-900 font-medium text-white dark:bg-neutral-100 dark:text-neutral-950'
                              : 'hover:bg-neutral-200/70 dark:hover:bg-[#232423]'
                          }`}
                        >
                          {editingBookmarkId === bm.id ? (
                            <HaloInput
                              autoFocus
                              value={editingBookmarkTitle}
                              onChange={(e) => setEditingBookmarkTitle(e.target.value)}
                              onBlur={() => {
                                updateTabState(tab.tabId, {
                                  bookmarks: tab.bookmarks.map((n) =>
                                    n.id === bm.id ? { ...n, title: editingBookmarkTitle } : n
                                  ),
                                });
                                setEditingBookmarkId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                              }}
                              className="h-6 px-1.5"
                            />
                          ) : (
                            <>
                              <span className="truncate">{bm.title}</span>
                              <span className="ml-2 shrink-0 text-[11px] opacity-60 tabular-nums">
                                p. {bm.pageIndex + 1}
                              </span>
                            </>
                          )}
                        </div>
                        {bm.children.map((child) => (
                          <div
                            key={child.id}
                            onClick={() => onScrollToPage(child.pageIndex)}
                            className="ml-4 flex cursor-pointer items-center justify-between rounded-[7px] px-2 py-1 opacity-85 hover:bg-neutral-200/60 dark:hover:bg-[#232423]"
                          >
                            <span className="truncate">{child.title}</span>
                            <span className="ml-2 text-[11px] opacity-55 tabular-nums">
                              p. {child.pageIndex + 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. COMENTÁRIOS E REVISÕES */}
            {leftSidebarPanel === 'comments' && (
              <div>
                {allAnnotations.length === 0 ? (
                  <div className="py-8 text-center">
                    <MessageSquare
                      className="mx-auto mb-2 h-6 w-6 opacity-35"
                      strokeWidth={1.5}
                    />
                    <p className="text-neutral-500 dark:text-neutral-400">
                      Nenhuma anotação encontrada.
                    </p>
                    <TextureButton
                      variant="primary"
                      size="xs"
                      className="mt-3"
                      onClick={() => {
                        setWorkMode('comment');
                        setActiveTool('highlight');
                      }}
                    >
                      Ativar Marca-texto
                    </TextureButton>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <HaloSelect
                        value={commentFilter}
                        onChange={(e) => setCommentFilter(e.target.value)}
                        className="h-7 flex-1"
                      >
                        <option value="all">Todos os status ({allAnnotations.length})</option>
                        <option value="approved">Aprovados</option>
                        <option value="rejected">Rejeitados</option>
                        <option value="completed">Concluídos</option>
                      </HaloSelect>
                      <TextureButton
                        variant="minimal"
                        size="icon"
                        onClick={() => void exportCommentsSummary()}
                        title="Exportar relatório de comentários"
                      >
                        <Download className="h-3 w-3" strokeWidth={1.6} />
                      </TextureButton>
                    </div>

                    {filteredComments.map((annot) => (
                      <MinimalCard
                        key={annot.id}
                        active={tab.selectedAnnotationId === annot.id}
                        onClick={() => {
                          onScrollToPage(annot.pageIndex);
                          updateTabState(tab.tabId, { selectedAnnotationId: annot.id });
                          openRightInspector('auto');
                        }}
                        className="cursor-pointer rounded-[12px] p-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {describeAnnotType(annot.type)}
                          </span>
                          <span className="text-[11px] text-neutral-500 tabular-nums dark:text-neutral-400">
                            Pág. {annot.pageIndex + 1}
                          </span>
                        </div>
                        {annot.contents && (
                          <p className="mt-1 line-clamp-2 text-neutral-600 dark:text-neutral-300">
                            {annot.contents}
                          </p>
                        )}
                        {annot.reviewStatus && annot.reviewStatus !== 'none' && (
                          <HaloBadge tone="emerald" className="mt-1.5">
                            {annot.reviewStatus === 'approved'
                              ? 'Aprovado'
                              : annot.reviewStatus === 'rejected'
                              ? 'Rejeitado'
                              : 'Concluído'}
                          </HaloBadge>
                        )}
                      </MinimalCard>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 4. ANEXOS EMBUTIDOS */}
            {leftSidebarPanel === 'attachments' && (
              <div>
                {tab.attachments.length === 0 ? (
                  <div className="py-8 text-center">
                    <Paperclip
                      className="mx-auto mb-2 h-6 w-6 opacity-35"
                      strokeWidth={1.5}
                    />
                    <p className="text-neutral-500 dark:text-neutral-400">
                      Nenhum arquivo embutido neste PDF.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tab.attachments.map((att) => (
                      <MinimalCard
                        key={att.id}
                        className="flex items-center justify-between rounded-[12px] p-2.5"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-neutral-900 dark:text-neutral-100">
                            {att.name}
                          </div>
                          <div className="text-[10px] text-neutral-500 tabular-nums dark:text-neutral-400">
                            {(att.sizeBytes / 1024).toFixed(1)} KB
                          </div>
                        </div>
                        {att.data && (
                          <TextureButton
                            variant="minimal"
                            size="icon"
                            onClick={() =>
                              void platform.fileSystem.exportBlobFile(
                                att.data!,
                                att.name,
                                att.mimeType
                              )
                            }
                            title="Salvar anexo no disco"
                          >
                            <Download className="h-3.5 w-3.5" strokeWidth={1.6} />
                          </TextureButton>
                        )}
                      </MinimalCard>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 5. CAMADAS (OCG) */}
            {leftSidebarPanel === 'layers' && (
              <div className="space-y-2">
                {tab.layers.map((layer) => (
                  <label
                    key={layer.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-black/[0.07] bg-white px-3 py-2 text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-neutral-50 dark:border-white/[0.08] dark:bg-[#1E1F1E] dark:text-neutral-100 dark:hover:bg-[#252625]"
                  >
                    <input
                      type="checkbox"
                      checked={layer.visible}
                      onChange={(e) => {
                        updateTabState(tab.tabId, {
                          layers: tab.layers.map((l) =>
                            l.id === layer.id ? { ...l, visible: e.target.checked } : l
                          ),
                        });
                      }}
                      className="h-3.5 w-3.5 accent-neutral-900 dark:accent-neutral-100"
                    />
                    <span>{layer.name}</span>
                  </label>
                ))}
              </div>
            )}

            {/* 6. ASSINATURAS DIGITAIS */}
            {leftSidebarPanel === 'signatures' && (
              <div>
                {tab.signatures.length === 0 ? (
                  <div className="py-8 text-center">
                    <ShieldCheck
                      className="mx-auto mb-2 h-6 w-6 opacity-35"
                      strokeWidth={1.5}
                    />
                    <p className="text-neutral-500 dark:text-neutral-400">
                      Este documento não possui assinaturas digitais criptográficas.
                    </p>
                    <TextureButton
                      variant="primary"
                      size="xs"
                      className="mt-3"
                      onClick={() => {
                        setWorkMode('protect');
                        setActiveTool('signature-visual');
                        openRightInspector('signature');
                      }}
                    >
                      Assinar documento
                    </TextureButton>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {tab.signatures.map((sig) => (
                      <div
                        key={sig.id}
                        className="rounded-[12px] border border-emerald-500/35 bg-emerald-500/10 p-3"
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
                          <ShieldCheck className="h-4 w-4" strokeWidth={1.6} />
                          <span>{sig.signerName}</span>
                        </div>
                        <div className="mt-1.5 space-y-1 text-[11px] opacity-85">
                          <div>Emissor: {sig.issuer}</div>
                          <div>Motivo: {sig.reason}</div>
                          <div>Padrão: {sig.subFilter}</div>
                          <div>Data: {sig.signedAt}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Alça de Redimensionamento Lateral */}
          <div
            onPointerDown={startResize}
            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-[#1A94FF]/40"
          />
        </div>
      )}
    </aside>
  );
}
