#!/usr/bin/env node
/**
 * 接触表：把若干透明底 PNG 按 3x 拼到奶油底 #FFF8EE 上，用于风格/明度/剪影比对。
 * 用法：node m4b3-sheet.mjs <out.png> <scale> <file1.png> <file2.png> ...
 */
import { inflateSync, deflateSync } from 'zlib';
import { readFileSync, writeFileSync } from 'fs';

function decodePNG(path) {
  const buf = readFileSync(path);
  let off = 8, width = 0, height = 0, colorType = 6;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off); off += 4;
    const type = buf.toString('ascii', off, off + 4); off += 4;
    const data = buf.subarray(off, off + len); off += len + 4;
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
  }
  const inBpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const inStride = width * inBpp;
  const flat = Buffer.alloc(height * inStride);
  let prev = Buffer.alloc(inStride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (inStride + 1)];
    const line = raw.subarray(y * (inStride + 1) + 1, (y + 1) * (inStride + 1));
    const cur = flat.subarray(y * inStride, (y + 1) * inStride);
    for (let x = 0; x < inStride; x++) {
      const a = x >= inBpp ? cur[x - inBpp] : 0, b = prev[x], c = x >= inBpp ? prev[x - inBpp] : 0;
      let v;
      if (f === 0) v = line[x]; else if (f === 1) v = line[x] + a; else if (f === 2) v = line[x] + b;
      else if (f === 3) v = line[x] + ((a + b) >> 1);
      else { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      cur[x] = v & 0xff;
    }
    prev = cur;
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = flat[i * inBpp]; rgba[i * 4 + 1] = flat[i * inBpp + 1]; rgba[i * 4 + 2] = flat[i * inBpp + 2];
    rgba[i * 4 + 3] = inBpp === 4 ? flat[i * inBpp + 3] : 255;
  }
  return { width, height, data: rgba };
}

function encodePNG({ width, height, data }) {
  const bpp = 4, stride = width * bpp;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  const crcTable = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c; }
  const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, d) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), d]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const [out, scaleStr, ...files] = process.argv.slice(2);
const S = +scaleStr || 3;
const imgs = files.map(f => ({ name: f.split('/').pop(), ...decodePNG(f) }));
const pad = 12 * S;
const W = imgs.reduce((s, im) => s + im.width * S, 0) + pad * (imgs.length + 1);
const H = Math.max(...imgs.map(im => im.height * S)) + pad * 2;
const data = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) { data[i * 4] = 0xFF; data[i * 4 + 1] = 0xF8; data[i * 4 + 2] = 0xEE; data[i * 4 + 3] = 255; }
let ox = pad;
for (const im of imgs) {
  const oy = Math.floor((H - im.height * S) / 2);
  for (let y = 0; y < im.height * S; y++) for (let x = 0; x < im.width * S; x++) {
    const si = (Math.floor(y / S) * im.width + Math.floor(x / S)) * 4;
    const a = im.data[si + 3] / 255; if (a < 0.004) continue;
    const di = ((y + oy) * W + x + ox) * 4;
    for (let k = 0; k < 3; k++) data[di + k] = Math.round(im.data[si + k] * a + data[di + k] * (1 - a));
  }
  ox += im.width * S + pad;
}
writeFileSync(out, encodePNG({ width: W, height: H, data }));
console.log(`接触表 ${W}x${H} → ${out}  (${imgs.map(i => i.name).join(', ')})`);
