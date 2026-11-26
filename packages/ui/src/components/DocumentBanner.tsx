import React from 'react';
import {
  CopyPlus,
  ScanText,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { PdfRect } from '@pdf-studio/platform-contracts';
import { sharedPdfEngine } from '@pdf-studio/pdf-engine';
import {
  BinaryDocumentMutationCommand,
  type DocumentTabState,
  usePdfStudioStore,
} from '@pdf-studio/editor-core';
import { HaloBadge, TextureButton } from './cult/CultUiPrimitives';

export function DocumentBanner({ tab }: { tab: DocumentTabState }) {
  const updateTabState = usePdfStudioStore((s) => s.updateTabState);
  const openDocumentInTab = usePdfStudioStore((s) => s.openDocumentInTab);
  const openRightInspector = usePdfStudioStore((s) => s.openRightInspector);
  const setWorkMode = usePdfStudioStore((s) => s.setWorkMode);
  const executeCommand = usePdfStudioStore((s) => s.executeCommand);
  const showToast = usePdfStudioStore((s) => s.showToast);

  // Conta tarjas pendentes não aplicadas
  const pendingRedactions = Object.values(tab.annotationsByPage)
    .flat()
    .filter((a) => a.type === 'redaction' && !a.redactionApplied);

  const handleApplyDestructiveRedactions = async () => {
    if (pendingRedactions.length === 0) return;

    const redactionsByPage: Record<number, PdfRect[]> = {};
    for (const r of pendingRedactions) {
      if (!redactionsByPage[r.pageIndex]) redactionsByPage[r.pageIndex] = [];
      redactionsByPage[r.pageIndex].push(r.rect);
    }

    const prevBytes = new Uint8Array(tab.bytes);
    const res = await sharedPdfEngine.applyRedactions({
      docId: tab.docId,
      redactionsByPage,
    });

    const cleanedAnnots: typeof tab.annotationsByPage = {};
    for (const [pStr, arr] of Object.entries(tab.annotationsByPage)) {
      cleanedAnnots[Number(pStr)] = arr.filter((a) => a.type !== 'redaction');
    }

    const cmd = new BinaryDocumentMutationCommand(
      `Aplicar ${pendingRedactions.length} tarja(s) definitiva(s)`,
      tab.tabId,
      prevBytes,
      res.bytes,
      async (id, b) => {
        await usePdfStudioStore.getState().reloadTabBytesDirect(id, b);
      }
    );
    await executeCommand(tab.tabId, cmd);
    updateTabState(tab.tabId, { annotationsByPage: cleanedAnnots });
    showToast(
      `Tarjamento definitivo concluído: ${pendingRedactions.length} área(s) removida(s) fisicamente.`,
      'success'
    );
  };

  return (
    <div className="z-20 flex shrink-0 flex-col">
      {/* 1. Banner de Tarjamento Pendente */}
      {pendingRedactions.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-400/40 bg-red-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-inner">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" strokeWidth={1.6} />
            <span>
              <strong className="tabular-nums">{pendingRedactions.length}</strong> tarja(s)
              marcada(s) ainda não foram aplicadas — clique em{' '}
              <strong>Aplicar Tarjamento</strong> para remover os dados permanentemente.
            </span>
          </div>
          <TextureButton
            variant="secondary"
            size="xs"
            onClick={() => void handleApplyDestructiveRedactions()}
          >
            Aplicar Tarjamento Definitivo
          </TextureButton>
        </div>
      )}

      {/* 2. Banner de Documento Assinado Digitalmente */}
      {tab.signatures.length > 0 && !tab.dismissedSignedBanner && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/25 bg-emerald-50/90 px-3.5 py-1.5 text-xs text-emerald-950 dark:border-emerald-500/25 dark:bg-emerald-950/40 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <ShieldCheck
              className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              strokeWidth={1.6}
            />
            <HaloBadge tone="emerald">ICP-BRASIL · {tab.signatures.length}</HaloBadge>
            <span>
              Documento com assinatura digital. Edições destrutivas diretas invalidam o hash
              criptográfico original.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <TextureButton
              variant="secondary"
              size="xs"
              onClick={() => {
                void openDocumentInTab({
                  fileName: tab.fileName.replace(/\.pdf$/i, '-copia-editavel.pdf'),
                  bytes: new Uint8Array(tab.bytes),
                  markDirty: true,
                });
              }}
            >
              <CopyPlus className="h-3 w-3" strokeWidth={1.6} />
              Criar cópia editável
            </TextureButton>
            <button
              onClick={() => updateTabState(tab.tabId, { dismissedSignedBanner: true })}
              className="rounded-full p-1 opacity-70 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
              title="Dispensar aviso"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}

      {/* 3. Banner de PDF Escaneado Elegível para OCR */}
      {tab.metadata?.isScannedCandidate && !tab.dismissedOcrBanner && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/25 bg-amber-50/90 px-3.5 py-1.5 text-xs text-amber-950 dark:border-amber-500/25 dark:bg-amber-950/35 dark:text-amber-100">
          <div className="flex items-center gap-2">
            <ScanText
              className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
              strokeWidth={1.6}
            />
            <HaloBadge tone="amber">OCR SUGERIDO</HaloBadge>
            <span>
              Este PDF parece ser uma imagem digitalizada sem texto pesquisável. Deseja executar o
              OCR para torná-lo selecionável?
            </span>
          </div>
          <div className="flex items-center gap-2">
            <TextureButton
              variant="primary"
              size="xs"
              onClick={() => {
                setWorkMode('convert');
                openRightInspector('ocr');
              }}
            >
              Executar OCR
            </TextureButton>
            <button
              onClick={() => updateTabState(tab.tabId, { dismissedOcrBanner: true })}
              className="rounded-full p-1 opacity-70 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
              title="Dispensar aviso"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
