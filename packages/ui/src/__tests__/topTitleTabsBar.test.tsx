import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { IPlatformAdapter } from '@pdf-studio/platform-contracts';
import { PlatformProvider } from '../context/PlatformContext';
import { TopTitleTabsBar } from '../components/TopTitleTabsBar';

function createMockPlatform(isDesktop: boolean): IPlatformAdapter {
  return {
    platformType: isDesktop ? 'desktop-windows' : 'web-pwa',
    fileSystem: {
      openPdfDialog: async () => [],
      openImageDialog: async () => [],
      savePdf: async () => ({ saved: false }),
      savePdfAs: async () => ({ saved: false }),
      exportBlobFile: async () => false,
      getRecentDocuments: async () => [],
      saveRecentDocuments: async () => {},
    },
    recoveryStore: {
      saveSnapshot: async () => {},
      removeSnapshot: async () => {},
      listRecoverableSessions: async () => [],
      loadSnapshot: async () => null,
      clearAllSnapshots: async () => {},
    },
    printer: {
      printPdf: async () => {},
    },
    fontRepository: {
      listAvailableFonts: async () => [],
      loadFallbackFontBytes: async () => null,
    },
    certificateStore: {
      listSavedVisualSignatures: async () => [],
      saveVisualSignature: async () => {},
      deleteVisualSignature: async () => {},
      inspectDocumentSignatures: async () => [],
    },
    heavyJobRunner: {
      maxConcurrency: 2,
      hasNativeSidecar: async () => false,
    },
    windowControls: {
      isDesktop,
      minimize: async () => {},
      toggleMaximize: async () => false,
      close: async () => {},
      isMaximized: async () => false,
      onMaximizedChange: () => () => {},
    },
  };
}

describe('TopTitleTabsBar — área livre arrastável no Desktop', () => {
  it('mantém a faixa de abas compacta (sem flex-1) e expande a região arrastável no espaço livre', () => {
    const html = renderToStaticMarkup(
      <PlatformProvider platform={createMockPlatform(true)}>
        <TopTitleTabsBar />
      </PlatformProvider>
    );

    const headerTag = html.match(/<header[^>]*>/)?.[0] ?? '';
    expect(headerTag).toContain('-webkit-app-region:drag');

    const tabsStripTag = html.match(/<div[^>]*data-testid="titlebar-tabs-strip"[^>]*>/)?.[0] ?? '';
    expect(tabsStripTag).toContain('-webkit-app-region:no-drag');
    const tabsStripClasses = tabsStripTag.match(/class="([^"]*)"/)?.[1]?.split(/\s+/) ?? [];
    expect(tabsStripClasses).not.toContain('flex-1');

    const dragRegionTag =
      html.match(/<div[^>]*data-testid="titlebar-drag-region"[^>]*>/)?.[0] ?? '';
    expect(dragRegionTag).toContain('-webkit-app-region:drag');
    const dragRegionClasses = dragRegionTag.match(/class="([^"]*)"/)?.[1]?.split(/\s+/) ?? [];
    expect(dragRegionClasses).toContain('flex-1');
    expect(dragRegionClasses).toContain('shrink-0');
    expect(dragRegionClasses).toContain('min-w-[56px]');
  });

  it('não emite -webkit-app-region nem botões de janela no modo Web PWA', () => {
    const html = renderToStaticMarkup(
      <PlatformProvider platform={createMockPlatform(false)}>
        <TopTitleTabsBar />
      </PlatformProvider>
    );

    expect(html).not.toContain('-webkit-app-region');
    expect(html).not.toContain('title="Minimizar"');
    expect(html).not.toContain('title="Fechar aplicativo"');
  });
});
