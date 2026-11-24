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

function PageThumbnailCard({
  docId,
  pageIndex,
  widthPt,
  heightPt,
  isCurrent,
  darkMode,
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
  darkMode: boolean;
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
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={onSelect}
      className={`group relative flex cursor-pointer flex-col items-center rounded-lg border p-2 transition ${
        isCurrent
          ? 'border-[#1B2952] bg-[#1B2952]/10 ring-1 ring-[#1B2952] dark:border-blue-400 dark:bg-blue-500/15 dark:ring-blue-400'
          : darkMode
          ? 'border-transparent hover:bg-[#262E3D]'
          : 'border-transparent hover:bg-slate-100'
      }`}
    >
      <div className="relative overflow-hidden rounded border border-slate-300 bg-white shadow-sm dark:border-slate-600">
        <canvas ref={canvasRef} className="block max-h-44 w-[116px] object-contain" />
        <div className="absolute right-1 top-1 hidden items-center gap-0.5 rounded bg-slate-900/80 p-0.5 text-white group-hover:flex">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRotate();
            }}
            title="Rotacionar 90°"
            className="rounded p-1 hover:bg-white/20"
          >
            <RotateCw className="h-3 w-3" strokeWidth={1.5} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            title="Duplicar página"
            className="rounded p-1 hover:bg-white/20"
          >
            <Copy className="h-3 w-3" strokeWidth={1.5} />
          </button>
          {canDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Excluir página"
              className="rounded p-1 text-red-300 hover:bg-red-600 hover:text-white"
            >
              <Trash2 className="h-3 w-3" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>
      <span className="mt-1.5 text-[11px] font-medium tabular-nums">
        {pageIndex + 1}
      </span>
    </div>
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
  const darkMode = usePdfStudioStore((s) => s.darkMode);
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
    <aside
      className={`z-20 flex shrink-0 select-none border-r ${
        darkMode
          ? 'border-[#334155] bg-[#1E2430] text-slate-200'
          : 'border-[#E2E8F0] bg-[#F8FAFC] text-slate-700'
      }`}
    >
      {/* Trilho Vertical Fixo (44 px) */}
      <div
        className={`flex w-[44px] shrink-0 flex-col items-center gap-1 border-r py-2 ${
          darkMode ? 'border-[#334155] bg-[#1E2430]' : 'border-[#E2E8F0] bg-white'
        }`}
      >
        {RAIL_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = leftSidebarOpen && leftSidebarPanel === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setLeftSidebarPanel(item.id)}
              title={item.label}
              className={`relative flex h-8 w-8 items-center justify-center rounded-md transition ${
                active
                  ? 'bg-[#1B2952] text-white dark:bg-[#2F4D8F]'
                  : 'opacity-75 hover:bg-slate-500/15 hover:opacity-100'
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
              {item.id === 'comments' && allAnnotations.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[#2F4D8F] px-1 text-[9px] font-bold text-white">
                  {allAnnotations.length}
                </span>
              )}
              {item.id === 'signatures' && tab.signatures.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500" />
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
          <div
            className={`flex h-9 shrink-0 items-center justify-between border-b px-3 text-xs font-semibold ${
              darkMode ? 'border-[#334155]' : 'border-[#E2E8F0]'
            }`}
          >
            <span className="truncate">
              {RAIL_ITEMS.find((r) => r.id === leftSidebarPanel)?.label}
            </span>
            {leftSidebarPanel === 'bookmarks' && (
              <button
                onClick={addBookmarkForCurrentPage}
                title="Adicionar marcador na página atual"
                className="rounded p-1 hover:bg-slate-500/15"
              >
                <BookmarkPlus className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 text-xs">
            {/* 1. MINIATURAS */}
            {leftSidebarPanel === 'thumbnails' && (
              <div className="space-y-2">
                {tab.geometries.map((geo) => (
                  <PageThumbnailCard
                    key={`${tab.bytes.byteLength}-${geo.pageIndex}-${geo.rotation}`}
                    docId={tab.docId}
                    pageIndex={geo.pageIndex}
                    widthPt={geo.widthPt}
                    heightPt={geo.heightPt}
                    isCurrent={tab.currentPage === geo.pageIndex}
                    darkMode={darkMode}
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
                      className="mx-auto mb-2 h-6 w-6 opacity-40"
                      strokeWidth={1.5}
                    />
                    <p className="opacity-70">Este documento ainda não possui marcadores.</p>
                    <button
                      onClick={addBookmarkForCurrentPage}
                      className="mt-3 rounded bg-[#1B2952] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2F4D8F]"
                    >
                      Adicionar marcador na página atual
                    </button>
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
                          className={`flex cursor-pointer items-center justify-between rounded px-2 py-1.5 ${
                            tab.currentPage === bm.pageIndex
                              ? 'bg-[#1B2952]/15 font-semibold text-[#1B2952] dark:bg-blue-500/20 dark:text-blue-300'
                              : 'hover:bg-slate-500/10'
                          }`}
                        >
                          {editingBookmarkId === bm.id ? (
                            <input
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
                              className="w-full rounded border px-1 py-0.5 text-xs text-slate-900"
                            />
                          ) : (
                            <>
                              <span className="truncate">{bm.title}</span>
                              <span className="ml-2 shrink-0 opacity-50 tabular-nums">
                                p. {bm.pageIndex + 1}
                              </span>
                            </>
                          )}
                        </div>
                        {bm.children.map((child) => (
                          <div
                            key={child.id}
                            onClick={() => onScrollToPage(child.pageIndex)}
                            className="ml-4 flex cursor-pointer items-center justify-between rounded px-2 py-1 opacity-85 hover:bg-slate-500/10"
                          >
                            <span className="truncate">{child.title}</span>
                            <span className="ml-2 opacity-50 tabular-nums">
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
                      className="mx-auto mb-2 h-6 w-6 opacity-40"
                      strokeWidth={1.5}
                    />
                    <p className="opacity-70">Nenhuma anotação encontrada.</p>
                    <button
                      onClick={() => {
                        setWorkMode('comment');
                        setActiveTool('highlight');
                      }}
                      className="mt-3 rounded bg-[#1B2952] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2F4D8F]"
                    >
                      Ativar Marca-texto
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-1">
                      <select
                        value={commentFilter}
                        onChange={(e) => setCommentFilter(e.target.value)}
                        className={`h-7 flex-1 rounded border px-1.5 text-xs ${
                          darkMode
                            ? 'border-[#334155] bg-[#111827] text-slate-100'
                            : 'border-slate-200 bg-white text-slate-800'
                        }`}
                      >
                        <option value="all">Todos os status ({allAnnotations.length})</option>
                        <option value="approved">Aprovados</option>
                        <option value="rejected">Rejeitados</option>
                        <option value="completed">Concluídos</option>
                      </select>
                      <button
                        onClick={() => void exportCommentsSummary()}
                        title="Exportar relatório de comentários"
                        className="flex h-7 items-center gap-1 rounded border border-slate-500/30 px-2 hover:bg-slate-500/10"
                      >
                        <Download className="h-3 w-3" strokeWidth={1.5} />
                      </button>
                    </div>

                    {filteredComments.map((annot) => (
                      <div
                        key={annot.id}
                        onClick={() => {
                          onScrollToPage(annot.pageIndex);
                          updateTabState(tab.tabId, { selectedAnnotationId: annot.id });
                          openRightInspector('auto');
                        }}
                        className={`cursor-pointer rounded-lg border p-2.5 transition ${
                          tab.selectedAnnotationId === annot.id
                            ? 'border-[#1B2952] bg-[#1B2952]/10 dark:border-blue-400'
                            : darkMode
                            ? 'border-[#334155] bg-[#262E3D]/60 hover:bg-[#262E3D]'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">
                            {describeAnnotType(annot.type)}
                          </span>
                          <span className="opacity-60 tabular-nums">
                            Pág. {annot.pageIndex + 1}
                          </span>
                        </div>
                        {annot.contents && (
                          <p className="mt-1 line-clamp-2 opacity-80">{annot.contents}</p>
                        )}
                        {annot.reviewStatus && annot.reviewStatus !== 'none' && (
                          <span className="mt-1.5 inline-block rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                            {annot.reviewStatus === 'approved'
                              ? 'Aprovado'
                              : annot.reviewStatus === 'rejected'
                              ? 'Rejeitado'
                              : 'Concluído'}
                          </span>
                        )}
                      </div>
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
                      className="mx-auto mb-2 h-6 w-6 opacity-40"
                      strokeWidth={1.5}
                    />
                    <p className="opacity-70">Nenhum arquivo embutido neste PDF.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tab.attachments.map((att) => (
                      <div
                        key={att.id}
                        className={`flex items-center justify-between rounded border p-2 ${
                          darkMode ? 'border-[#334155] bg-[#262E3D]' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">{att.name}</div>
                          <div className="text-[10px] opacity-60">
                            {(att.sizeBytes / 1024).toFixed(1)} KB
                          </div>
                        </div>
                        {att.data && (
                          <button
                            onClick={() =>
                              void platform.fileSystem.exportBlobFile(
                                att.data!,
                                att.name,
                                att.mimeType
                              )
                            }
                            className="rounded p-1 hover:bg-slate-500/15"
                            title="Salvar anexo no disco"
                          >
                            <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
                          </button>
                        )}
                      </div>
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
                    className={`flex cursor-pointer items-center gap-2.5 rounded border p-2.5 ${
                      darkMode ? 'border-[#334155] bg-[#262E3D]' : 'border-slate-200 bg-white'
                    }`}
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
                      className="h-3.5 w-3.5 accent-[#1B2952]"
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
                      className="mx-auto mb-2 h-6 w-6 opacity-40"
                      strokeWidth={1.5}
                    />
                    <p className="opacity-70">
                      Este documento não possui assinaturas digitais criptográficas.
                    </p>
                    <button
                      onClick={() => {
                        setWorkMode('protect');
                        setActiveTool('signature-visual');
                        openRightInspector('signature');
                      }}
                      className="mt-3 rounded bg-[#1B2952] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2F4D8F]"
                    >
                      Assinar documento
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {tab.signatures.map((sig) => (
                      <div
                        key={sig.id}
                        className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3"
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
                          <ShieldCheck className="h-4 w-4" strokeWidth={1.5} />
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
            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-[#2F4D8F]/40"
          />
        </div>
      )}
    </aside>
  );
}
