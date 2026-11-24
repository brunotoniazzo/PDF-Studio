import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';

let mainWindow: BrowserWindow | null = null;
let pendingStartupPdfPath: string | null = null;

function extractPdfArg(argv: string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (!arg.startsWith('-') && arg.toLowerCase().endsWith('.pdf') && fsSync.existsSync(arg)) {
      return path.resolve(arg);
    }
  }
  return null;
}

interface WindowBoundsPrefs {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

function getPrefsPath(file: string): string {
  return path.join(app.getPath('userData'), file);
}

function loadWindowBounds(): WindowBoundsPrefs {
  try {
    const raw = fsSync.readFileSync(getPrefsPath('window-bounds.json'), 'utf-8');
    return { width: 1320, height: 860, ...JSON.parse(raw) };
  } catch {
    return { width: 1320, height: 860, isMaximized: false };
  }
}

function saveWindowBounds(win: BrowserWindow): void {
  try {
    const isMaximized = win.isMaximized();
    const bounds = win.getNormalBounds();
    fsSync.writeFileSync(
      getPrefsPath('window-bounds.json'),
      JSON.stringify({ ...bounds, isMaximized }, null, 2)
    );
  } catch {
    // ignora
  }
}

async function sendPdfPathToRenderer(filePath: string): Promise<void> {
  if (!mainWindow) return;
  try {
    const buf = await fs.readFile(filePath);
    mainWindow.webContents.send('desktop:external-file', {
      name: path.basename(filePath),
      path: filePath,
      bytes: new Uint8Array(buf),
      sizeBytes: buf.byteLength,
    });
  } catch {
    // ignora
  }
}

const APP_USER_MODEL_ID = 'com.pdfstudio.desktop';
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

function resolveAppWindowIcon() {
  const candidates = [
    ...(process.resourcesPath
      ? [
          path.join(process.resourcesPath, 'icon.ico'),
          path.join(process.resourcesPath, 'app.asar.unpacked/dist/icon.ico'),
          path.join(process.resourcesPath, 'app.asar.unpacked/dist/icon.png'),
        ]
      : []),
    path.join(__dirname, '../../app.asar.unpacked/dist/icon.ico'),
    path.join(__dirname, '../dist/icon.ico'),
    path.join(__dirname, '../../app.asar.unpacked/dist/icon.png'),
    path.join(__dirname, '../dist/icon.png'),
    path.join(__dirname, '../public/icon.ico'),
  ];
  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) {
      const img = nativeImage.createFromPath(candidate);
      if (!img.isEmpty()) return img;
    }
  }
  return undefined;
}

// Instância Única (Single Instance no Windows):
// Abrir um segundo PDF no Explorer envia o arquivo para a janela já aberta!
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const pdfArg = extractPdfArg(commandLine);
      if (pdfArg) {
        void sendPdfPathToRenderer(pdfArg);
      }
    }
  });
}

async function createMainWindow() {
  const saved = loadWindowBounds();
  const appIcon = resolveAppWindowIcon();
  mainWindow = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 880,
    minHeight: 560,
    frame: false, // Janela sem bordas com Custom Titlebar Windows 11
    backgroundColor: '#F8FAFC',
    title: 'PDF Studio',
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (appIcon && process.platform === 'win32') {
    mainWindow.setIcon(appIcon);
  }

  if (saved.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.on('close', () => {
    if (mainWindow) saveWindowBounds(mainWindow);
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingStartupPdfPath) {
      const target = pendingStartupPdfPath;
      pendingStartupPdfPath = null;
      void sendPdfPathToRenderer(target);
    }
  });
}

app.whenReady().then(async () => {
  pendingStartupPdfPath = extractPdfArg(process.argv);

  // Controles de Janela Windows
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:toggleMaximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    }
    mainWindow.maximize();
    return true;
  });
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle('window:close', () => mainWindow?.close());

  // Diálogos e Sistema de Arquivos Nativo Windows
  ipcMain.handle('dialog:openPdf', async (_ev, multiple: boolean) => {
    if (!mainWindow) return [];
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Abrir Documento(s) PDF',
      properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: [{ name: 'Documentos PDF', extensions: ['pdf'] }],
    });
    if (res.canceled) return [];
    const out = [];
    for (const fp of res.filePaths) {
      const buf = await fs.readFile(fp);
      out.push({
        name: path.basename(fp),
        path: fp,
        bytes: new Uint8Array(buf),
        sizeBytes: buf.byteLength,
      });
    }
    return out;
  });

  ipcMain.handle('dialog:openImage', async (_ev, multiple: boolean) => {
    if (!mainWindow) return [];
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Selecionar Imagem(ns)',
      properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (res.canceled) return [];
    const out = [];
    for (const fp of res.filePaths) {
      const buf = await fs.readFile(fp);
      out.push({
        name: path.basename(fp),
        path: fp,
        bytes: new Uint8Array(buf),
        sizeBytes: buf.byteLength,
      });
    }
    return out;
  });

  ipcMain.handle('fs:readByPath', async (_ev, filePath: string) => {
    try {
      const buf = await fs.readFile(filePath);
      return {
        name: path.basename(filePath),
        path: filePath,
        bytes: new Uint8Array(buf),
        sizeBytes: buf.byteLength,
      };
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    'fs:savePdf',
    async (
      _ev,
      payload: { bytes: Uint8Array; suggestedName: string; existingPath?: string }
    ) => {
      if (payload.existingPath) {
        await fs.writeFile(payload.existingPath, Buffer.from(payload.bytes));
        return {
          saved: true,
          path: payload.existingPath,
          name: path.basename(payload.existingPath),
        };
      }
      if (!mainWindow) return { saved: false };
      const res = await dialog.showSaveDialog(mainWindow, {
        title: 'Salvar Documento PDF',
        defaultPath: payload.suggestedName,
        filters: [{ name: 'Documento PDF', extensions: ['pdf'] }],
      });
      if (res.canceled || !res.filePath) return { saved: false };
      await fs.writeFile(res.filePath, Buffer.from(payload.bytes));
      return {
        saved: true,
        path: res.filePath,
        name: path.basename(res.filePath),
      };
    }
  );

  ipcMain.handle(
    'fs:exportFile',
    async (
      _ev,
      payload: { data: Uint8Array | string; suggestedName: string }
    ) => {
      if (!mainWindow) return false;
      const ext = path.extname(payload.suggestedName).replace('.', '') || '*';
      const res = await dialog.showSaveDialog(mainWindow, {
        defaultPath: payload.suggestedName,
        filters: [{ name: `Arquivo .${ext.toUpperCase()}`, extensions: [ext] }],
      });
      if (res.canceled || !res.filePath) return false;
      if (typeof payload.data === 'string') {
        await fs.writeFile(res.filePath, payload.data, 'utf-8');
      } else {
        await fs.writeFile(res.filePath, Buffer.from(payload.data));
      }
      return true;
    }
  );

  ipcMain.handle('fs:revealInExplorer', (_ev, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  // Fontes TrueType Nativas do Windows (C:\Windows\Fonts) para CID-Keyed TrueType no PDFium
  ipcMain.handle(
    'fonts:loadSystemFont',
    async (_ev, payload: string | { family: string; bold?: boolean; italic?: boolean }) => {
      const winDir = process.env.WINDIR || 'C:\\Windows';
      const family = typeof payload === 'string' ? payload : payload.family;
      const bold = typeof payload === 'object' && Boolean(payload?.bold);
      const italic = typeof payload === 'object' && Boolean(payload?.italic);

      const variantMap: Record<string, string[]> = {
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

      const styleSuffix =
        bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'regular';
      const candidates = variantMap[`${family}:${styleSuffix}`] ?? ['arial.ttf'];
      for (const file of candidates) {
        const fullPath = path.join(winDir, 'Fonts', file);
        try {
          if (fsSync.existsSync(fullPath)) {
            const buf = await fs.readFile(fullPath);
            return new Uint8Array(buf);
          }
        } catch {
          // tenta próxima
        }
      }
      return null;
    }
  );

  // Auto-Recovery Nativo em Disco (%APPDATA%\pdf-studio-free\recovery)
  const recoveryDir = path.join(app.getPath('userData'), 'recovery');
  await fs.mkdir(recoveryDir, { recursive: true });

  ipcMain.handle(
    'recovery:save',
    async (
      _ev,
      snap: {
        tabId: string;
        fileName: string;
        savedAt: string;
        pageCount: number;
        bytes: Uint8Array;
      }
    ) => {
      const safeId = snap.tabId.replace(/[^a-zA-Z0-9_-]/g, '_');
      await fs.writeFile(path.join(recoveryDir, `${safeId}.pdf`), Buffer.from(snap.bytes));
      await fs.writeFile(
        path.join(recoveryDir, `${safeId}.json`),
        JSON.stringify({
          tabId: snap.tabId,
          fileName: snap.fileName,
          savedAt: snap.savedAt,
          pageCount: snap.pageCount,
          sizeBytes: snap.bytes.byteLength,
        })
      );
    }
  );

  ipcMain.handle('recovery:remove', async (_ev, tabId: string) => {
    const safeId = tabId.replace(/[^a-zA-Z0-9_-]/g, '_');
    await fs.rm(path.join(recoveryDir, `${safeId}.pdf`), { force: true });
    await fs.rm(path.join(recoveryDir, `${safeId}.json`), { force: true });
  });

  ipcMain.handle('recovery:list', async () => {
    try {
      const files = await fs.readdir(recoveryDir);
      const metas = [];
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const raw = await fs.readFile(path.join(recoveryDir, f), 'utf-8');
        metas.push(JSON.parse(raw));
      }
      return metas;
    } catch {
      return [];
    }
  });

  ipcMain.handle('recovery:load', async (_ev, tabId: string) => {
    const safeId = tabId.replace(/[^a-zA-Z0-9_-]/g, '_');
    try {
      const raw = await fs.readFile(path.join(recoveryDir, `${safeId}.json`), 'utf-8');
      const meta = JSON.parse(raw);
      const pdfBuf = await fs.readFile(path.join(recoveryDir, `${safeId}.pdf`));
      return { ...meta, bytes: new Uint8Array(pdfBuf) };
    } catch {
      return null;
    }
  });

  ipcMain.handle('recovery:clear', async () => {
    await fs.rm(recoveryDir, { recursive: true, force: true });
    await fs.mkdir(recoveryDir, { recursive: true });
  });

  await createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
