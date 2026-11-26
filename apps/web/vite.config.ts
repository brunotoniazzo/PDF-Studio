import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const SYSTEM_FONT_VARIANTS: Record<string, string[]> = {
  'sans:regular': ['arial.ttf', 'segoeui.ttf'],
  'sans:bold': ['arialbd.ttf', 'segoeuib.ttf', 'arial.ttf'],
  'sans:italic': ['ariali.ttf', 'segoeuii.ttf', 'arial.ttf'],
  'sans:bolditalic': ['arialbi.ttf', 'segoeuiz.ttf', 'arialbd.ttf', 'arial.ttf'],
  'serif:regular': ['times.ttf', 'georgia.ttf'],
  'serif:bold': ['timesbd.ttf', 'georgiab.ttf', 'times.ttf'],
  'serif:italic': ['timesi.ttf', 'georgiai.ttf', 'times.ttf'],
  'serif:bolditalic': ['timesbi.ttf', 'georgiaz.ttf', 'timesbd.ttf', 'times.ttf'],
  'mono:regular': ['cour.ttf', 'consola.ttf'],
  'mono:bold': ['courbd.ttf', 'consolab.ttf', 'cour.ttf'],
  'mono:italic': ['couri.ttf', 'consolai.ttf', 'cour.ttf'],
  'mono:bolditalic': ['courbi.ttf', 'consolaz.ttf', 'courbd.ttf', 'cour.ttf'],
  'calibri:regular': ['calibri.ttf', 'segoeui.ttf'],
  'calibri:bold': ['calibrib.ttf', 'segoeuib.ttf', 'calibri.ttf'],
  'calibri:italic': ['calibrii.ttf', 'segoeuii.ttf', 'calibri.ttf'],
  'calibri:bolditalic': ['calibriz.ttf', 'segoeuiz.ttf', 'calibrib.ttf', 'calibri.ttf'],
};

function handleLocalSystemFontRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
): void {
  if (!req.url || !req.url.startsWith('/__pdf_studio_font')) {
    next();
    return;
  }
  const url = new URL(req.url, 'http://localhost');
  const family = url.searchParams.get('family') || 'sans';
  const bold = url.searchParams.get('bold') === '1';
  const italic = url.searchParams.get('italic') === '1';
  const suffix =
    bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'regular';
  const candidates = SYSTEM_FONT_VARIANTS[`${family}:${suffix}`] ?? ['arial.ttf'];
  const winFontsDir = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts');

  for (const file of candidates) {
    const fullPath = path.join(winFontsDir, file);
    try {
      if (fs.existsSync(fullPath)) {
        const bytes = fs.readFileSync(fullPath);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.end(bytes);
        return;
      }
    } catch {
      // ignora fonte inacessível e tenta a próxima candidata
    }
  }
  res.statusCode = 404;
  res.end();
}

function localSystemFontsPlugin(): Plugin {
  return {
    name: 'pdf-studio-local-system-fonts',
    configureServer(server) {
      server.middlewares.use(handleLocalSystemFontRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleLocalSystemFontRequest);
    },
  };
}

export default defineConfig({
  plugins: [react(), localSystemFontsPlugin()],
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@embedpdf/pdfium'],
  },
});
