import { deflateSync, crc32 } from 'node:zlib';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIZE = 1024;

// If a real `source.png` is already committed, do NOT overwrite it with the
// placeholder. The placeholder only exists as a bootstrap so `tauri icon`
// has something to consume on a clean machine. Pass `--force` to regenerate.
const outDir = join(__dirname, '..', 'src-tauri', 'icons');
const outPath = join(outDir, 'source.png');
const force = process.argv.includes('--force');
if (existsSync(outPath) && !force) {
  console.log(`[icon] ${outPath} already exists; skipping placeholder (pass --force to overwrite)`);
  process.exit(0);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput) >>> 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const rowBytes = SIZE * 4 + 1;
const pixels = Buffer.alloc(SIZE * rowBytes);

for (let y = 0; y < SIZE; y++) {
  const rowStart = y * rowBytes;
  pixels[rowStart] = 0;
  for (let x = 0; x < SIZE; x++) {
    const i = rowStart + 1 + x * 4;
    const t = (x + y) / (SIZE * 2);
    const r = Math.round(0x5f * (1 - t) + 0x7c * t);
    const g = Math.round(0x84 * (1 - t) + 0x9c * t);
    const b = 0xff;
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = 0xff;
  }
}

const idat = deflateSync(pixels);

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, png);
console.log(`[icon] wrote ${outPath} (${png.length} bytes)`);
