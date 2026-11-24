import React, { createContext, useCallback, useContext, useEffect } from 'react';
import type {
  BlankPageOptions,
  IPlatformAdapter,
  OpenedFileResult,
} from '@pdf-studio/platform-contracts';
import {
  convertImagesToPdf,
  createBlankPdf,
  createSampleShowcasePdf,
  embedAnnotationsAndFormsIntoPdf,
  mergePdfDocuments,
  sharedPdfEngine,
} from '@pdf-studio/pdf-engine';
import {
  BinaryDocumentMutationCommand,
  type DocumentTabState,
  usePdfStudioStore,
} from '@pdf-studio/editor-core';

export interface PlatformActionsContextValue {
  platform: IPlatformAdapter;
  openPdfFromDisk: (multiple?: boolean) => Promise<void>;
  openLoadedFiles: (files: OpenedFileResult[]) => Promise<void>;
  openSampleDocument: () => Promise<void>;
  createNewBlankDocument: (options: BlankPageOptions) => Promise<void>;
  saveTab: (tabId: string, saveAs?: boolean) => Promise<boolean>;
  printTab: (tabId: string) => Promise<void>;
  buildMergedPdfBytesForTab: (
    tab: DocumentTabState,
    options?: { flatten?: boolean }
  ) => Promise<Uint8Array>;
  applyStructuralMutation: (
    tabId: string,
    label: string,
    mutate: (currentBytes: Uint8Array) => Promise<Uint8Array>
  ) => Promise<void>;
  mergeExternalPdfsFlow: () => Promise<void>;
  convertImagesToPdfFlow: () => Promise<void>;
  exportCurrentPageAsPng: (tabId: string) => Promise<void>;
  exportDocumentAsTextOrMarkdown: (tabId: string, format: 'txt' | 'md') => Promise<void>;
}

const PlatformContext = createContext<PlatformActionsContextValue | null>(null);

export function usePlatformActions(): PlatformActionsContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error('usePlatformActions deve ser usado dentro de PlatformProvider');
  }
  return ctx;
}

export function PlatformProvider({
  platform,
  children,
}: {
  platform: IPlatformAdapter;
  children: React.ReactNode;
}) {
  const store = usePdfStudioStore();

  const recordRecentFile = useCallback(
    async (file: { name: string; path?: string; sizeBytes: number; pageCount?: number }) => {
      const current = await platform.fileSystem.getRecentDocuments();
      const existing = current.find(
        (r) => r.name === file.name && r.pathOrOrigin === (file.path ?? 'Memória Local')
      );
      const entry = {
        id: existing?.id ?? `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        pathOrOrigin: file.path ?? 'Sessão Local',
        sizeBytes: file.sizeBytes,
        openedAt: new Date().toISOString(),
        pinned: existing?.pinned ?? false,
        pageCount: file.pageCount ?? existing?.pageCount,
      };
      const updated = [
        entry,
        ...current.filter((r) => r.id !== entry.id),
      ].slice(0, 25);
      await platform.fileSystem.saveRecentDocuments(updated);
      usePdfStudioStore.getState().setRecentDocuments(updated);
    },
    [platform]
  );

  const openLoadedFiles = useCallback(
    async (files: OpenedFileResult[]) => {
      for (const f of files) {
        const tabId = await usePdfStudioStore.getState().openDocumentInTab({
          fileName: f.name,
          bytes: f.bytes,
          filePath: f.path,
          handleId: f.handleId,
        });
        const openedTab = usePdfStudioStore.getState().tabs.find((t) => t.tabId === tabId);
        await recordRecentFile({
          name: f.name,
          path: f.path,
          sizeBytes: f.sizeBytes,
          pageCount: openedTab?.metadata?.pageCount,
        });
      }
    },
    [recordRecentFile]
  );

  const openPdfFromDisk = useCallback(
    async (multiple = true) => {
      const files = await platform.fileSystem.openPdfDialog(multiple);
      if (files.length > 0) {
        await openLoadedFiles(files);
      }
    },
    [platform, openLoadedFiles]
  );

  const openSampleDocument = useCallback(async () => {
    const bytes = await createSampleShowcasePdf();
    await usePdfStudioStore.getState().openDocumentInTab({
      fileName: 'Demonstracao-PDF-Studio.pdf',
      bytes,
    });
    usePdfStudioStore
      .getState()
      .showToast('Documento demonstrativo aberto com sucesso.', 'success');
  }, []);

  const createNewBlankDocument = useCallback(async (options: BlankPageOptions) => {
    const bytes = await createBlankPdf(options);
    await usePdfStudioStore.getState().openDocumentInTab({
      fileName: `Novo-Documento-${options.preset}.pdf`,
      bytes,
      markDirty: true,
    });
    usePdfStudioStore.getState().showToast('Novo PDF em branco criado.', 'success');
  }, []);

  const buildMergedPdfBytesForTab = useCallback(
    async (tab: DocumentTabState, options?: { flatten?: boolean }): Promise<Uint8Array> => {
      const hasCustomAnnots = Object.values(tab.annotationsByPage).some((arr) =>
        arr.some((a) => !a.fromOriginalPdf)
      );
      if (!hasCustomAnnots && tab.formFields.length === 0 && !options?.flatten) {
        return tab.bytes;
      }
      return await embedAnnotationsAndFormsIntoPdf(
        tab.bytes,
        tab.annotationsByPage,
        tab.formFields,
        options
      );
    },
    []
  );

  const saveTab = useCallback(
    async (tabId: string, saveAs = false): Promise<boolean> => {
      const state = usePdfStudioStore.getState();
      const tab = state.tabs.find((t) => t.tabId === tabId);
      if (!tab) return false;

      // Proteção de documentos assinados digitalmente
      if (tab.signatures.length > 0 && !saveAs && tab.isDirty) {
        state.showToast(
          'Documento assinado digitalmente: salvando como cópia editável para preservar o original.',
          'warning'
        );
        saveAs = true;
      }

      const finalBytes = await buildMergedPdfBytesForTab(tab);
      const result = saveAs
        ? await platform.fileSystem.savePdfAs(finalBytes, tab.fileName)
        : await platform.fileSystem.savePdf(finalBytes, {
            suggestedName: tab.fileName,
            existingPath: tab.filePath,
            handleId: tab.handleId,
          });

      if (result.saved) {
        state.updateTabState(tabId, {
          isDirty: false,
          fileName: result.name ?? tab.fileName,
          filePath: result.path ?? tab.filePath,
          handleId: result.handleId ?? tab.handleId,
        });
        await platform.recoveryStore.removeSnapshot(tabId).catch(() => {});
        state.showToast(`Arquivo "${result.name ?? tab.fileName}" salvo com sucesso.`, 'success');
        return true;
      }
      return false;
    },
    [platform, buildMergedPdfBytesForTab]
  );

  const printTab = useCallback(
    async (tabId: string) => {
      const tab = usePdfStudioStore.getState().tabs.find((t) => t.tabId === tabId);
      if (!tab) return;
      const finalBytes = await buildMergedPdfBytesForTab(tab);
      await platform.printer.printPdf(finalBytes, tab.fileName);
    },
    [platform, buildMergedPdfBytesForTab]
  );

  const applyStructuralMutation = useCallback(
    async (
      tabId: string,
      label: string,
      mutate: (currentBytes: Uint8Array) => Promise<Uint8Array>
    ) => {
      const state = usePdfStudioStore.getState();
      const tab = state.tabs.find((t) => t.tabId === tabId);
      if (!tab) return;

      const prevBytes = new Uint8Array(tab.bytes);
      const nextBytes = await mutate(prevBytes);
      const cmd = new BinaryDocumentMutationCommand(
        label,
        tabId,
        prevBytes,
        nextBytes,
        async (id, b) => {
          await usePdfStudioStore.getState().reloadTabBytesDirect(id, b);
        }
      );
      await state.executeCommand(tabId, cmd);
      // Auto-recovery snapshot assíncrono
      const updated = usePdfStudioStore.getState().tabs.find((t) => t.tabId === tabId);
      if (updated) {
        void platform.recoveryStore
          .saveSnapshot({
            tabId,
            fileName: updated.fileName,
            savedAt: new Date().toISOString(),
            pageCount: updated.geometries.length,
            bytes: nextBytes,
          })
          .catch(() => {});
      }
    },
    [platform]
  );

  const mergeExternalPdfsFlow = useCallback(async () => {
    const files = await platform.fileSystem.openPdfDialog(true);
    if (files.length < 2) {
      if (files.length === 1) {
        await openLoadedFiles(files);
        usePdfStudioStore
          .getState()
          .showToast('Selecione 2 ou mais PDFs para mesclar (arquivo único foi aberto).', 'info');
      }
      return;
    }
    const mergedBytes = await mergePdfDocuments(files.map((f) => f.bytes));
    await usePdfStudioStore.getState().openDocumentInTab({
      fileName: `Mesclado-${files.length}-arquivos.pdf`,
      bytes: mergedBytes,
      markDirty: true,
    });
    usePdfStudioStore
      .getState()
      .showToast(`${files.length} arquivos PDF unidos com sucesso.`, 'success');
  }, [platform, openLoadedFiles]);

  const convertImagesToPdfFlow = useCallback(async () => {
    const images = await platform.fileSystem.openImageDialog(true);
    if (images.length === 0) return;
    const pdfBytes = await convertImagesToPdf(
      images.map((img) => ({ name: img.name, bytes: img.bytes }))
    );
    await usePdfStudioStore.getState().openDocumentInTab({
      fileName: `Imagens-Convertidas (${images.length}).pdf`,
      bytes: pdfBytes,
      markDirty: true,
    });
    usePdfStudioStore
      .getState()
      .showToast(`PDF criado a partir de ${images.length} imagem(ns).`, 'success');
  }, [platform]);

  const exportCurrentPageAsPng = useCallback(
    async (tabId: string) => {
      const tab = usePdfStudioStore.getState().tabs.find((t) => t.tabId === tabId);
      if (!tab) return;
      const geo = tab.geometries[tab.currentPage];
      if (!geo) return;

      const bmp = await sharedPdfEngine.requestPageBitmap({
        docId: tab.docId,
        pageIndex: tab.currentPage,
        widthPx: Math.round(geo.widthPt * 2),
        heightPx: Math.round(geo.heightPt * 2),
        includeAnnotations: true,
        priority: 'high',
      });
      if (!bmp) return;

      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);

      const pngBlob = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b), 'image/png')
      );
      if (!pngBlob) return;
      const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
      const base = tab.fileName.replace(/\.pdf$/i, '');
      const ok = await platform.fileSystem.exportBlobFile(
        pngBytes,
        `${base}-pagina-${tab.currentPage + 1}.png`,
        'image/png'
      );
      if (ok) {
        usePdfStudioStore
          .getState()
          .showToast(`Página ${tab.currentPage + 1} exportada em PNG de alta resolução.`, 'success');
      }
    },
    [platform]
  );

  const exportDocumentAsTextOrMarkdown = useCallback(
    async (tabId: string, format: 'txt' | 'md') => {
      const tab = usePdfStudioStore.getState().tabs.find((t) => t.tabId === tabId);
      if (!tab) return;
      const pages = await sharedPdfEngine.extractAllText(tab.docId);
      const base = tab.fileName.replace(/\.pdf$/i, '');
      const content =
        format === 'md'
          ? `# ${base}\n\n` +
            pages
              .map((p) => `## Página ${p.pageIndex + 1}\n\n${p.text.trim() || '*(Página sem texto extraível)*'}`)
              .join('\n\n---\n\n')
          : pages
              .map((p) => `=== Página ${p.pageIndex + 1} ===\n${p.text.trim()}`)
              .join('\n\n');

      const ok = await platform.fileSystem.exportBlobFile(
        content,
        `${base}.${format}`,
        format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8'
      );
      if (ok) {
        usePdfStudioStore
          .getState()
          .showToast(`Documento exportado para .${format.toUpperCase()} com sucesso.`, 'success');
      }
    },
    [platform]
  );

  // Inicialização: carrega recentes, sessões recuperáveis e escuta arquivos externos (Single Instance Windows)
  useEffect(() => {
    void platform.fileSystem.getRecentDocuments().then((list) => {
      usePdfStudioStore.getState().setRecentDocuments(list);
    });
    void platform.recoveryStore.listRecoverableSessions().then((sessions) => {
      usePdfStudioStore.getState().setRecoverableSessions(sessions);
    });
    const unsub = platform.windowControls.onOpenExternalFile?.((file) => {
      void openLoadedFiles([file]);
    });
    return () => {
      unsub?.();
    };
  }, [platform, openLoadedFiles]);

  return (
    <PlatformContext.Provider
      value={{
        platform,
        openPdfFromDisk,
        openLoadedFiles,
        openSampleDocument,
        createNewBlankDocument,
        saveTab,
        printTab,
        buildMergedPdfBytesForTab,
        applyStructuralMutation,
        mergeExternalPdfsFlow,
        convertImagesToPdfFlow,
        exportCurrentPageAsPng,
        exportDocumentAsTextOrMarkdown,
      }}
    >
      {children}
    </PlatformContext.Provider>
  );
}
