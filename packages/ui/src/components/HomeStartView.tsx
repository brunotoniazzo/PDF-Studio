import React, { useMemo, useState } from 'react';
import {
  Clock,
  FilePlus2,
  FileSpreadsheet,
  Files,
  FileText,
  FolderOpen,
  ImagePlus,
  Minimize2,
  Pin,
  RotateCcw,
  ScanText,
  Scissors,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { usePdfStudioStore } from '@pdf-studio/editor-core';
import { usePlatformActions } from '../context/PlatformContext';
import {
  CultBrandMark,
  HaloInput,
  MinimalCard,
  MinimalCardFrame,
  NeumorphEyebrow,
  TextureButton,
  TextureCard,
  TextureCardContent,
  TextureCardHeader,
  TextureSeparator,
} from './cult/CultUiPrimitives';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}\u00A0B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}\u00A0KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}\u00A0MB`;
}

export function HomeStartView({
  onRequestNewBlankModal,
}: {
  onRequestNewBlankModal: () => void;
}) {
  const {
    platform,
    openPdfFromDisk,
    openLoadedFiles,
    openSampleDocument,
    mergeExternalPdfsFlow,
    convertImagesToPdfFlow,
  } = usePlatformActions();

  const recentDocuments = usePdfStudioStore((s) => s.recentDocuments);
  const recoverableSessions = usePdfStudioStore((s) => s.recoverableSessions);
  const setRecentDocuments = usePdfStudioStore((s) => s.setRecentDocuments);
  const setRecoverableSessions = usePdfStudioStore((s) => s.setRecoverableSessions);
  const setWorkMode = usePdfStudioStore((s) => s.setWorkMode);
  const openRightInspector = usePdfStudioStore((s) => s.openRightInspector);

  const [filterQuery, setFilterQuery] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const filteredRecents = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    const sorted = [...recentDocuments].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.openedAt.localeCompare(a.openedAt);
    });
    if (!q) return sorted;
    return sorted.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.pathOrOrigin.toLowerCase().includes(q)
    );
  }, [recentDocuments, filterQuery]);

  const togglePin = async (id: string) => {
    const next = recentDocuments.map((r) =>
      r.id === id ? { ...r, pinned: !r.pinned } : r
    );
    setRecentDocuments(next);
    await platform.fileSystem.saveRecentDocuments(next);
  };

  const clearHistory = async () => {
    const pinnedOnly = recentDocuments.filter((r) => r.pinned);
    setRecentDocuments(pinnedOnly);
    await platform.fileSystem.saveRecentDocuments(pinnedOnly);
  };

  const handleRestoreAllSessions = async () => {
    for (const s of recoverableSessions) {
      const snap = await platform.recoveryStore.loadSnapshot(s.tabId);
      if (snap) {
        await usePdfStudioStore.getState().openDocumentInTab({
          fileName: snap.fileName,
          bytes: snap.bytes,
          markDirty: true,
        });
      }
    }
    await platform.recoveryStore.clearAllSnapshots();
    setRecoverableSessions([]);
    usePdfStudioStore
      .getState()
      .showToast('Sessões anteriores restauradas com sucesso.', 'success');
  };

  const handleDiscardRecovery = async () => {
    await platform.recoveryStore.clearAllSnapshots();
    setRecoverableSessions([]);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const fileList = Array.from(e.dataTransfer.files).filter((f) =>
      f.name.toLowerCase().endsWith('.pdf')
    );
    if (fileList.length === 0) return;
    const loaded = await Promise.all(
      fileList.map(async (f) => ({
        name: f.name,
        path: (f as File & { path?: string }).path,
        bytes: new Uint8Array(await f.arrayBuffer()),
        sizeBytes: f.size,
      }))
    );
    await openLoadedFiles(loaded);
  };

  return (
    <div className="cult-dot-grid flex-1 overflow-y-auto px-6 py-7 text-neutral-900 dark:text-neutral-100">
      <div className="mx-auto max-w-5xl space-y-7">
        {/* Banner de Recuperação Automática Pós-Queda */}
        {recoverableSessions.length > 0 && (
          <TextureCard variant="compact">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-50/70 px-4 py-3 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
              <div className="flex items-center gap-2.5">
                <RotateCcw className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={1.6} />
                <span>
                  Encontramos <strong className="tabular-nums">{recoverableSessions.length}</strong>{' '}
                  documento(s) com alterações salvas automaticamente em sessão anterior.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <TextureButton variant="primary" size="xs" onClick={handleRestoreAllSessions}>
                  Restaurar todos
                </TextureButton>
                <TextureButton variant="minimal" size="xs" onClick={handleDiscardRecovery}>
                  Descartar
                </TextureButton>
              </div>
            </div>
          </TextureCard>
        )}

        {/* Hero Dropzone em TextureCard (5 camadas concêntricas Cult UI + grade halftone) */}
        <TextureCard>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={handleDrop}
            className={`cult-dot-grid relative px-6 py-9 text-center transition-colors duration-150 ${
              isDraggingOver
                ? 'bg-sky-50/80 ring-2 ring-inset ring-[#1A94FF] dark:bg-sky-950/30'
                : ''
            }`}
          >
            <div className="mb-4 flex items-center justify-center gap-2">
              <NeumorphEyebrow tone="crimson">PDF Studio Beta</NeumorphEyebrow>
              <NeumorphEyebrow>Local-First · PDFium WASM</NeumorphEyebrow>
            </div>

            <div className="mx-auto mb-3.5 flex items-center justify-center">
              <MinimalCardFrame className="p-2.5">
                <CultBrandMark className="h-8 w-8 rounded-[9px]" />
              </MinimalCardFrame>
            </div>

            <h1 className="mx-auto max-w-xl text-2xl font-medium tracking-[-0.04em] text-neutral-900 dark:text-neutral-50 [text-wrap:balance]">
              <span className="font-semibold">PDF Studio,</span>{' '}
              <span className="font-normal text-neutral-500 dark:text-neutral-400">
                reconstruído com precisão tátil.
              </span>
            </h1>

            <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
              Arraste e solte um ou mais arquivos PDF aqui, ou selecione uma ação abaixo. Todo o
              processamento ocorre localmente no seu dispositivo com privacidade total.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
              <TextureButton
                variant="primary"
                size="md"
                onClick={() => void openPdfFromDisk(true)}
              >
                <FolderOpen className="h-4 w-4" strokeWidth={1.6} />
                Abrir arquivo PDF (Ctrl+O)
              </TextureButton>
              <TextureButton
                variant="secondary"
                size="md"
                onClick={onRequestNewBlankModal}
              >
                <FilePlus2 className="h-4 w-4" strokeWidth={1.6} />
                Criar PDF em branco (Ctrl+N)
              </TextureButton>
              <TextureButton
                variant="minimal"
                size="md"
                onClick={() => void openSampleDocument()}
              >
                <Sparkles className="h-4 w-4 text-sky-500" strokeWidth={1.6} />
                Abrir PDF Demonstrativo Interativo
              </TextureButton>
            </div>
          </div>
        </TextureCard>

        {/* Faixa de Ações Rápidas Diretas em MinimalCard */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
              Ferramentas Rápidas Diretas
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {[
              {
                label: 'Mesclar PDFs',
                desc: 'Unir vários arquivos',
                icon: Files,
                onClick: () => void mergeExternalPdfsFlow(),
              },
              {
                label: 'Imagens para PDF',
                desc: 'PNG, JPG ou WebP',
                icon: ImagePlus,
                onClick: () => void convertImagesToPdfFlow(),
              },
              {
                label: 'Comprimir PDF',
                desc: 'Reduzir tamanho',
                icon: Minimize2,
                onClick: async () => {
                  await openPdfFromDisk(false);
                  setWorkMode('convert');
                  openRightInspector('compress');
                },
              },
              {
                label: 'Dividir / Extrair',
                desc: 'Separar páginas',
                icon: Scissors,
                onClick: async () => {
                  await openPdfFromDisk(false);
                  setWorkMode('organize');
                },
              },
              {
                label: 'OCR Pesquisável',
                desc: 'Digitalizações em texto',
                icon: ScanText,
                onClick: async () => {
                  await openPdfFromDisk(false);
                  setWorkMode('convert');
                  openRightInspector('ocr');
                },
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <MinimalCard
                  key={item.label}
                  role="button"
                  tabIndex={0}
                  onClick={item.onClick}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      item.onClick();
                    }
                  }}
                  className="group flex cursor-pointer items-center gap-3 active:scale-[0.99]"
                >
                  <MinimalCardFrame className="flex h-9 w-9 shrink-0 items-center justify-center text-neutral-800 dark:text-neutral-100">
                    <Icon className="h-4 w-4 transition-transform duration-150 group-hover:scale-105" strokeWidth={1.6} />
                  </MinimalCardFrame>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      {item.label}
                    </div>
                    <div className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                      {item.desc}
                    </div>
                  </div>
                </MinimalCard>
              );
            })}
          </div>
        </div>

        {/* Tabela Tátil de Documentos Recentes em TextureCard compact */}
        <TextureCard variant="compact">
          <TextureCardHeader className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-900 dark:text-neutral-100">
              <Clock className="h-4 w-4 text-neutral-500" strokeWidth={1.6} />
              <span>Documentos Recentes</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400"
                  strokeWidth={1.6}
                />
                <HaloInput
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Filtrar histórico…"
                  className="h-7 w-48 pl-8 pr-2.5"
                />
              </div>
              {recentDocuments.length > 0 && (
                <TextureButton
                  variant="minimal"
                  size="xs"
                  onClick={() => void clearHistory()}
                  title="Limpar não fixados"
                >
                  <Trash2 className="h-3 w-3 text-red-500" strokeWidth={1.6} />
                  Limpar
                </TextureButton>
              )}
            </div>
          </TextureCardHeader>

          <TextureSeparator />

          <TextureCardContent className="p-0">
            {filteredRecents.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-neutral-500 dark:text-neutral-400">
                <FileSpreadsheet className="mx-auto mb-2 h-6 w-6 opacity-45" strokeWidth={1.5} />
                Os documentos abertos recentemente aparecerão listados aqui para acesso instantâneo.
              </div>
            ) : (
              <div className="divide-y divide-neutral-200/70 dark:divide-white/[0.06]">
                {filteredRecents.map((entry) => (
                  <div
                    key={entry.id}
                    onClick={async () => {
                      if (
                        entry.pathOrOrigin &&
                        entry.pathOrOrigin !== 'Sessão Local' &&
                        platform.fileSystem.readFileByPath
                      ) {
                        const file = await platform.fileSystem.readFileByPath(entry.pathOrOrigin);
                        if (file) {
                          await openLoadedFiles([file]);
                          return;
                        }
                      }
                      await openPdfFromDisk(false);
                    }}
                    className="flex cursor-pointer items-center justify-between gap-4 px-4 py-2.5 text-xs transition-colors hover:bg-neutral-100/80 dark:hover:bg-[#222322]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-black/10 bg-neutral-100 text-neutral-800 dark:border-white/10 dark:bg-[#262726] dark:text-neutral-200">
                        <FileText className="h-3.5 w-3.5" strokeWidth={1.6} />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-neutral-900 dark:text-neutral-100">
                          {entry.name}
                        </div>
                        <div className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                          {entry.pathOrOrigin}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 tabular-nums text-neutral-500 dark:text-neutral-400">
                      <span className="hidden sm:inline">{formatBytes(entry.sizeBytes)}</span>
                      <span className="hidden md:inline">
                        {new Date(entry.openedAt).toLocaleDateString('pt-BR')}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void togglePin(entry.id);
                        }}
                        className={`rounded-full p-1 transition-colors ${
                          entry.pinned
                            ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-950'
                            : 'opacity-45 hover:bg-neutral-200/70 hover:opacity-100 dark:hover:bg-white/10'
                        }`}
                        title={entry.pinned ? 'Desafixar do topo' : 'Fixar no topo'}
                      >
                        <Pin className="h-3 w-3" strokeWidth={1.6} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TextureCardContent>
        </TextureCard>
      </div>
    </div>
  );
}
