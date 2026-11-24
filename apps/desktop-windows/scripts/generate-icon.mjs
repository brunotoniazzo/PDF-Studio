import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, '../public/icon.png');
fs.mkdirSync(path.dirname(outPath), { recursive: true });

// Gera um PNG 256x256 nítido para o ícone do PDF Studio (#1B2952 + folha PDF branca dobrada)
const W = 256;
const H = 256;
const raw = Buffer.alloc(H * (1 + W * 4), 0);

function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const rowOffset = y * (1 + W * 4);
  raw[rowOffset] = 0; // filtro PNG None
  const idx = rowOffset + 1 + x * 4;
  raw[idx] = r;
  raw[idx + 1] = g;
  raw[idx + 2] = b;
  raw[idx + 3] = a;
}

function insideRoundedRect(x, y, rx, ry, rw, rh, rad) {
  if (x < rx || x >= rx + rw || y < ry || y >= ry + rh) return false;
  const cx = Math.max(rx + rad, Math.min(rx + rw - rad - 1, x));
  const cy = Math.max(ry + rad, Math.min(ry + rh - rad - 1, y));
  return Math.hypot(x - cx, y - cy) <= rad;
}

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    // Fundo arredondado Azul-Marinho #1B2952 -> gradiente sutil #2F4D8F
    if (insideRoundedRect(x, y, 12, 12, 232, 232, 48)) {
      const t = (x + y) / (W + H);
      const r = Math.round(27 + t * 20);
      const g = Math.round(41 + t * 36);
      const b = Math.round(82 + t * 61);
      setPixel(x, y, r, g, b, 255);
    }

    // Folha de documento branca central (68..188, 44..212) com canto superior direito dobrado
    const inPage = x >= 68 && x <= 188 && y >= 44 && y <= 212;
    const inCutCorner = x > 152 && y < 80 && x - 152 > y - 44;
    if (inPage && !inCutCorner) {
      setPixel(x, y, 255, 255, 255, 255);

      // Aba dobrada em azul claro (#CBD5E1)
      if (x >= 152 && y <= 80) {
        setPixel(x, y, 203, 213, 225, 255);
      }

      // Faixa vermelha semântica PDF (56..164, 152..184)
      if (x >= 56 && x <= 172 && y >= 150 && y <= 186) {
        setPixel(x, y, 220, 38, 38, 255);
      }

      // Linhas horizontais representando parágrafos do PDF
      if (x >= 84 && x <= 140 && y >= 92 && y <= 100) {
        setPixel(x, y, 27, 41, 82, 255);
      }
      if (x >= 84 && x <= 170 && y >= 112 && y <= 119) {
        setPixel(x, y, 100, 116, 139, 255);
      }
      if (x >= 84 && x <= 162 && y >= 129 && y <= 136) {
        setPixel(x, y, 100, 116, 139, 255);
      }
    } else if (x >= 56 && x < 68 && y >= 150 && y <= 186) {
      // Aba esquerda da faixa vermelha projetada sobre o fundo
      setPixel(x, y, 185, 28, 28, 255);
    }
  }
}

// CRC32 padrão PNG
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const idat = zlib.deflateSync(raw, { level: 9 });
const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const png = Buffer.concat([
  pngSig,
  makeChunk('IHDR', ihdr),
  makeChunk('IDAT', idat),
  makeChunk('IEND', Buffer.alloc(0)),
]);

fs.writeFileSync(outPath, png);

// Gera também o arquivo .ico nativo do Windows (256x256 PNG-in-ICO) para o instalador NSIS
const icoOutPath = path.resolve(__dirname, '../public/icon.ico');
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(0, 0); // reservado
icoHeader.writeUInt16LE(1, 2); // tipo 1 = ICO
icoHeader.writeUInt16LE(1, 4); // 1 imagem
icoHeader[6] = 0; // 0 = 256 px largura
icoHeader[7] = 0; // 0 = 256 px altura
icoHeader[8] = 0;
icoHeader[9] = 0;
icoHeader.writeUInt16LE(1, 10); // color planes
icoHeader.writeUInt16LE(32, 12); // 32 bpp
icoHeader.writeUInt32LE(png.length, 14); // tamanho do PNG
icoHeader.writeUInt32LE(22, 18); // offset = 22 bytes
fs.writeFileSync(icoOutPath, Buffer.concat([icoHeader, png]));

console.log(`[icon] Ícones PNG e ICO 256x256 gerados em public/ (${png.length} bytes)`);
