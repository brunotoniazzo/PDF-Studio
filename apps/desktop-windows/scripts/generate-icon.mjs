import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
fs.mkdirSync(publicDir, { recursive: true });

// Tabela CRC32 padrão PNG
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

// Renderiza o ícone do PDF Studio em qualquer dimensão (16, 24, 32, 48, 64, 128, 256)
// usando super-amostragem 2x2 para bordas suaves na Barra de Tarefas do Windows!
function renderIconRgba(size) {
  const rgba = Buffer.alloc(size * size * 4, 0);

  const sampleNormalized = (nx, ny) => {
    // nx, ny em [0, 256)
    const rx = 12;
    const ry = 12;
    const rw = 232;
    const rh = 232;
    const rad = 48;

    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;

    if (nx >= rx && nx < rx + rw && ny >= ry && ny < ry + rh) {
      const cx = Math.max(rx + rad, Math.min(rx + rw - rad, nx));
      const cy = Math.max(ry + rad, Math.min(ry + rh - rad, ny));
      if (Math.hypot(nx - cx, ny - cy) <= rad) {
        const t = (nx + ny) / 512;
        r = Math.round(27 + t * 20);
        g = Math.round(41 + t * 36);
        b = Math.round(82 + t * 61);
        a = 255;
      }
    }

    if (a === 0) return [0, 0, 0, 0];

    const inPage = nx >= 64 && nx <= 192 && ny >= 40 && ny <= 216;
    const inCutCorner = nx > 152 && ny < 80 && nx - 152 > ny - 40;
    if (inPage && !inCutCorner) {
      r = 255;
      g = 255;
      b = 255;

      if (nx >= 152 && ny <= 80) {
        r = 203;
        g = 213;
        b = 225;
      }

      // Faixa vermelha destaque PDF
      if (nx >= 52 && nx <= 176 && ny >= 148 && ny <= 188) {
        r = 220;
        g = 38;
        b = 38;
      } else if (nx >= 82 && nx <= 142 && ny >= 90 && ny <= 100) {
        r = 27;
        g = 41;
        b = 82;
      } else if (nx >= 82 && nx <= 172 && ny >= 112 && ny <= 120) {
        r = 100;
        g = 116;
        b = 139;
      } else if (nx >= 82 && nx <= 162 && ny >= 130 && ny <= 138) {
        r = 100;
        g = 116;
        b = 139;
      }
    } else if (nx >= 52 && nx < 64 && ny >= 148 && ny <= 188) {
      r = 185;
      g = 28;
      b = 28;
    }

    return [r, g, b, a];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      const sub = [0.25, 0.75];
      for (const oy of sub) {
        for (const ox of sub) {
          const nx = ((x + ox) / size) * 256;
          const ny = ((y + oy) / size) * 256;
          const [pr, pg, pb, pa] = sampleNormalized(nx, ny);
          sr += pr;
          sg += pg;
          sb += pb;
          sa += pa;
        }
      }
      const idx = (y * size + x) * 4;
      rgba[idx] = Math.round(sr / 4);
      rgba[idx + 1] = Math.round(sg / 4);
      rgba[idx + 2] = Math.round(sb / 4);
      rgba[idx + 3] = Math.round(sa / 4);
    }
  }

  return rgba;
}

function encodePng(size, rgba) {
  const raw = Buffer.alloc(size * (1 + size * 4), 0);
  for (let y = 0; y < size; y++) {
    const rowOff = y * (1 + size * 4);
    raw[rowOff] = 0;
    rgba.copy(raw, rowOff + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlib.deflateSync(raw, { level: 9 });
  const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    pngSig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Formato DIB BMP 32-bit BGRA bottom-up padrão Win32 ICO (máxima compatibilidade com rcedit e Barra de Tarefas!)
function encodeDibIcoFrame(size, rgba) {
  const headerSize = 40;
  const xorSize = size * size * 4;
  const andRowBytes = Math.ceil(size / 32) * 4;
  const andSize = andRowBytes * size;
  const buf = Buffer.alloc(headerSize + xorSize + andSize, 0);

  // BITMAPINFOHEADER (altura dobrada = XOR + AND mask na especificação ICO!)
  buf.writeUInt32LE(headerSize, 0);
  buf.writeInt32LE(size, 4);
  buf.writeInt32LE(size * 2, 8);
  buf.writeUInt16LE(1, 12); // planes
  buf.writeUInt16LE(32, 14); // 32 bpp BGRA
  buf.writeUInt32LE(0, 16); // BI_RGB
  buf.writeUInt32LE(xorSize + andSize, 20);

  // Pixels BGRA invertidos verticalmente (bottom-up)
  for (let y = 0; y < size; y++) {
    const srcY = size - 1 - y;
    for (let x = 0; x < size; x++) {
      const sIdx = (srcY * size + x) * 4;
      const dIdx = headerSize + (y * size + x) * 4;
      buf[dIdx] = rgba[sIdx + 2]; // B
      buf[dIdx + 1] = rgba[sIdx + 1]; // G
      buf[dIdx + 2] = rgba[sIdx]; // R
      buf[dIdx + 3] = rgba[sIdx + 3]; // A
    }
  }

  // Máscara AND de 1 bit para pixels totalmente transparentes
  const andOffset = headerSize + xorSize;
  for (let y = 0; y < size; y++) {
    const srcY = size - 1 - y;
    for (let x = 0; x < size; x++) {
      const alpha = rgba[(srcY * size + x) * 4 + 3];
      if (alpha < 16) {
        const byteIndex = andOffset + y * andRowBytes + (x >> 3);
        buf[byteIndex] |= 0x80 >> (x & 7);
      }
    }
  }

  return buf;
}

const sizes = [16, 24, 32, 48, 64, 128, 256];
const frames = sizes.map((sz) => {
  const rgba = renderIconRgba(sz);
  // 256x256 em PNG padrão Vista+, menores em DIB BGRA nativo Win32!
  const data = sz === 256 ? encodePng(sz, rgba) : encodeDibIcoFrame(sz, rgba);
  return { size: sz, rgba, data };
});

// Salva PNG 256x256
const png256 = frames.find((f) => f.size === 256).data;
fs.writeFileSync(path.join(publicDir, 'icon.png'), png256);

// Monta ICO multi-resolução (7 entradas)
const count = frames.length;
const dirHeader = Buffer.alloc(6 + count * 16);
dirHeader.writeUInt16LE(0, 0);
dirHeader.writeUInt16LE(1, 2); // tipo ICO
dirHeader.writeUInt16LE(count, 4);

let offset = 6 + count * 16;
frames.forEach((f, idx) => {
  const entryOff = 6 + idx * 16;
  dirHeader[entryOff] = f.size === 256 ? 0 : f.size;
  dirHeader[entryOff + 1] = f.size === 256 ? 0 : f.size;
  dirHeader[entryOff + 2] = 0;
  dirHeader[entryOff + 3] = 0;
  dirHeader.writeUInt16LE(1, entryOff + 4); // planes
  dirHeader.writeUInt16LE(32, entryOff + 6); // bpp
  dirHeader.writeUInt32LE(f.data.length, entryOff + 8);
  dirHeader.writeUInt32LE(offset, entryOff + 12);
  offset += f.data.length;
});

const fullIco = Buffer.concat([dirHeader, ...frames.map((f) => f.data)]);
fs.writeFileSync(path.join(publicDir, 'icon.ico'), fullIco);

console.log(
  `[icon] Ícone multi-resolução (${sizes.join(', ')} px) gerado em public/icon.ico (${fullIco.length} bytes)`
);
