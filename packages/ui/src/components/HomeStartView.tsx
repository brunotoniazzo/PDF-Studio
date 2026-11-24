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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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

  const darkMode = usePdfStudioStore((s) => s.darkMode);
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
    <div
      className={`flex-1 overflow-y-auto px-6 py-7 transition-colors ${
        darkMode ? 'bg-[#111827] text-slate-100' : 'bg-[#F8FAFC] text-slate-800'
      }`}
    >
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Banner de Recuperação Automática Pós-Queda */}
        {recoverableSessions.length > 0 && (
          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
              darkMode
                ? 'border-amber-700/60 bg-amber-950/40 text-amber-200'
                : 'border-amber-300 bg-amber-50 text-amber-950'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <RotateCcw className="h-4 w-4 shrink-0 text-amber-600" strokeWidth={1.5} />
              <span>
                Encontramos <strong>{recoverableSessions.length}</strong> documento(s) com alterações
                salvas automaticamente em sessão anterior.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRestoreAllSessions}
                className="rounded bg-[#1B2952] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2F4D8F]"
              >
                Restaurar todos
              </button>
              <button
                onClick={handleDiscardRecovery}
                className="rounded px-2.5 py-1.5 text-xs opacity-80 hover:opacity-100"
              >
                Descartar
              </button>
            </div>
          </div>
        )}

        {/* Cabeçalho e Zona de Soltura (Dropzone) */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
          className={`rounded-xl border-2 border-dashed p-8 text-center transition-all ${
            isDraggingOver
              ? 'border-[#2F4D8F] bg-[#1B2952]/10'
              : darkMode
              ? 'border-[#334155] bg-[#1E2430]'
              : 'border-slate-300 bg-white shadow-sm'
          }`}
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#1B2952]/10 text-[#1B2952] dark:bg-blue-500/15 dark:text-blue-400">
            <FileText className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">
            PDF Studio — Leitor e Editor Profissional Local-First
          </h1>
          <p
            className={`mx-auto mt-1 max-w-xl text-xs ${
              darkMode ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            Arraste e solte um ou vários arquivos PDF aqui, ou escolha uma ação abaixo. Todo o
            processamento ocorre 100% na sua máquina com privacidade total.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => void openPdfFromDisk(true)}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#1B2952] px-4 text-xs font-medium text-white shadow-sm transition hover:bg-[#2F4D8F]"
            >
              <FolderOpen className="h-4 w-4" strokeWidth={1.5} />
              Abrir arquivo PDF (Ctrl+O)
            </button>
            <button
              onClick={onRequestNewBlankModal}
              className={`inline-flex h-9 items-center gap-2 rounded-md border px-4 text-xs font-medium transition ${
                darkMode
                  ? 'border-[#334155] bg-[#262E3D] text-slate-100 hover:bg-[#334155]'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <FilePlus2 className="h-4 w-4" strokeWidth={1.5} />
              Criar PDF em branco (Ctrl+N)
            </button>
            <button
              onClick={() => void openSampleDocument()}
              className={`inline-flex h-9 items-center gap-2 rounded-md border px-4 text-xs font-medium transition ${
                darkMode
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20'
                  : 'border-[#2F4D8F]/30 bg-[#1B2952]/5 text-[#1B2952] hover:bg-[#1B2952]/10'
              }`}
            >
              <Sparkles className="h-4 w-4" strokeWidth={1.5} />
              Abrir PDF Demonstrativo Interativo
            </button>
          </div>
        </div>

        {/* Faixa de Ações Rápidas Diretas */}
        <div>
          <h2
            className={`mb-2.5 text-xs font-semibold uppercase tracking-wider ${
              darkMode ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            Ferramentas Rápidas Diretas
          </h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
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
                <button
                  key={item.label}
                  onClick={item.onClick}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${
                    darkMode
                      ? 'border-[#334155] bg-[#1E2430] hover:border-blue-400/50 hover:bg-[#262E3D]'
                      : 'border-slate-200 bg-white hover:border-[#2F4D8F]/50 hover:shadow-sm'
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#1B2952]/10 text-[#1B2952] dark:bg-blue-500/15 dark:text-blue-400">
                    <Icon className="h-4 w-4" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold">{item.label}</div>
                    <div
                      className={`truncate text-[11px] ${
                        darkMode ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      {item.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tabela Limpa de Documentos Recentes */}
        <div
          className={`rounded-xl border ${
            darkMode ? 'border-[#334155] bg-[#1E2430]' : 'border-slate-200 bg-white'
          }`}
        >
          <div
            className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 ${
              darkMode ? 'border-[#334155]' : 'border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Clock className="h-4 w-4 opacity-70" strokeWidth={1.5} />
              <span>Documentos Recentes</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-50"
                  strokeWidth={1.5}
                />
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Filtrar histórico..."
                  className={`h-7 rounded-md border pl-8 pr-2.5 text-xs outline-none ${
                    darkMode
                      ? 'border-[#334155] bg-[#111827] text-slate-100 focus:border-blue-400'
                      : 'border-slate-200 bg-slate-50 text-slate-800 focus:border-[#1B2952]'
                  }`}
                />
              </div>
              {recentDocuments.length > 0 && (
                <button
                  onClick={() => void clearHistory()}
                  className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs opacity-70 hover:bg-red-500/10 hover:text-red-500 hover:opacity-100"
                  title="Limpar não fixados"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Limpar
                </button>
              )}
            </div>
          </div>

          {filteredRecents.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs opacity-60">
              <FileSpreadsheet className="mx-auto mb-2 h-6 w-6 opacity-50" strokeWidth={1.5} />
              Os documentos abertos recentemente aparecerão listados aqui para acesso instantâneo.
            </div>
          ) : (
            <div className="divide-y divide-slate-200/60 dark:divide-slate-700/50">
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
                  className={`flex cursor-pointer items-center justify-between gap-4 px-4 py-2.5 text-xs transition ${
                    darkMode ? 'hover:bg-[#262E3D]' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText
                      className="h-4 w-4 shrink-0 text-[#1B2952] dark:text-blue-400"
                      strokeWidth={1.5}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{entry.name}</div>
                      <div className="truncate text-[11px] opacity-60">
                        {entry.pathOrOrigin}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 tabular-nums">
                    <span className="hidden opacity-65 sm:inline">
                      {formatBytes(entry.sizeBytes)}
                    </span>
                    <span className="hidden opacity-65 md:inline">
                      {new Date(entry.openedAt).toLocaleDateString('pt-BR')}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void togglePin(entry.id);
                      }}
                      className={`rounded p-1 transition ${
                        entry.pinned
                          ? 'text-[#1B2952] opacity-100 dark:text-blue-400'
                          : 'opacity-40 hover:opacity-100'
                      }`}
                      title={entry.pinned ? 'Desafixar do topo' : 'Fixar no topo'}
                    >
                      <Pin className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
