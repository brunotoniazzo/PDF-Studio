import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(appDir, '../..');

const isBeta = process.argv.includes('--beta');
const productName = isBeta ? 'PDF Studio Beta' : 'PDF Studio';
const originalFilename = isBeta ? 'PDF Studio Beta.exe' : 'PDF Studio.exe';
const fileVersion = isBeta ? '2.0.0.0' : '1.0.0';

const sourceElectronDist = path.join(rootDir, 'node_modules', 'electron', 'dist');
const targetElectronDist = path.join(appDir, '.electron-dist');
const rceditBin = path.join(rootDir, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');
const iconPath = path.join(appDir, 'public', 'icon.ico');

if (!fs.existsSync(sourceElectronDist)) {
  throw new Error(`Diretório do Electron não encontrado: ${sourceElectronDist}`);
}
if (!fs.existsSync(rceditBin)) {
  throw new Error(`Utilitário rcedit-x64.exe não encontrado: ${rceditBin}`);
}
if (!fs.existsSync(iconPath)) {
  throw new Error(`Ícone multi-resolução não encontrado: ${iconPath}`);
}

console.log('[prepare-electron-dist] Copiando runtime limpo do Electron...');
fs.rmSync(targetElectronDist, { recursive: true, force: true });
fs.cpSync(sourceElectronDist, targetElectronDist, { recursive: true, force: true });

const patchedExe = path.join(targetElectronDist, 'electron.exe');
const rceditArgs = [
  patchedExe,
  '--set-icon',
  iconPath,
  '--set-version-string',
  'ProductName',
  productName,
  '--set-version-string',
  'FileDescription',
  productName,
  '--set-version-string',
  'CompanyName',
  'PDF Studio',
  '--set-version-string',
  'InternalName',
  productName,
  '--set-version-string',
  'OriginalFilename',
  originalFilename,
  '--set-version-string',
  'LegalCopyright',
  'Copyright (c) 2026 PDF Studio',
  '--set-file-version',
  fileVersion,
  '--set-product-version',
  fileVersion,
];

console.log(
  `[prepare-electron-dist] Gravando ícone PE e metadados Win32 (${productName} ${fileVersion}) via rcedit-x64.exe...`
);
execFileSync(rceditBin, rceditArgs, {
  stdio: 'inherit',
});
console.log('[prepare-electron-dist] Executável base preparado com sucesso!');
