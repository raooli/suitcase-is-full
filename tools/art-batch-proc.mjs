#!/usr/bin/env node
/**
 * M4-3 批次出图后处理（stdlib only：PNG 解码/编码/抠底/缩放/合版/量化）
 *
 * 用法：
 *   node tools/art-batch-proc.mjs info    <file.png>                     尺寸/角 alpha/环带色/bbox/覆盖率
 *   node tools/art-batch-proc.mjs palette <file.png> [N]                 主色聚类（16 级量化）+ 相对亮度
 *   node tools/art-batch-proc.mjs fit <file.png> <itemType> <W> <H> [margin] [--deshadow]
 *                                                 抠底→裁边→等比缩放→居中合到 W×H 透明画布→量化
 *
 * 输出：assets/resources/sprites/props/<itemType>.png（文件名严格 = itemType）
 * 环境变量：QN 调色板颜色数（默认 16）；体积与观感的折中点，16 色肉眼无差、比 64 色省 60%+
 *
 * 不写盘的情形：抠底后剩余不透明 < 5%（底色与主体同色 / 描边断裂）直接抛错。
 * `--deshadow` 慎用：C 家族织物 #E5E5E5 与浅灰投影颜色不可分，会误删主体。
 */
import { inflateSync, deflateSync } from 'zlib';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { join, basename } from 'path';

const OUT_DIR = '/Users/sheep/code-workspace/suitcase-is-full/assets/resources/sprites/props';

// ---------- PNG 编解码（colorType 6 / 8bit） ----------
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
  if (colorType !== 6 && colorType !== 2) throw new Error(`${path}: 非 RGB/RGBA（colorType ${colorType}）`);
  const inBpp = colorType === 6 ? 4 : 3;
  const bpp = 4, stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(height * stride, 0);
  let prev = Buffer.alloc(stride);
  const inStride = width * inBpp;
  // 先在输入字节流上做反滤波，再统一转成 RGBA
  const flat = Buffer.alloc(height * inStride);
  let prevIn = Buffer.alloc(inStride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (inStride + 1)];
    const line = raw.subarray(y * (inStride + 1) + 1, (y + 1) * (inStride + 1));
    const cur = flat.subarray(y * inStride, (y + 1) * inStride);
    for (let x = 0; x < inStride; x++) {
      const a = x >= inBpp ? cur[x - inBpp] : 0, b = prevIn[x], c = x >= inBpp ? prevIn[x - inBpp] : 0;
      let v;
      if (f === 0) v = line[x]; else if (f === 1) v = line[x] + a; else if (f === 2) v = line[x] + b;
      else if (f === 3) v = line[x] + ((a + b) >> 1);
      else { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      cur[x] = v & 0xff;
    }
    prevIn = cur;
  }
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = flat[i * inBpp];
    out[i * 4 + 1] = flat[i * inBpp + 1];
    out[i * 4 + 2] = flat[i * inBpp + 2];
    out[i * 4 + 3] = inBpp === 4 ? flat[i * inBpp + 3] : 255; // RGB → 不透明 RGBA
  }
  return { width, height, data: out };
}

function encodePNG(img) {
  const { width, height, data } = img;
  const bpp = 4, stride = width * bpp;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const cands = [];
    for (let f = 0; f < 5; f++) {
      const row = Buffer.alloc(stride);
      for (let x = 0; x < stride; x++) {
        const cur = data[y * stride + x];
        const a = x >= bpp ? data[y * stride + x - bpp] : 0;
        const b = y > 0 ? data[(y - 1) * stride + x] : 0;
        const c = x >= bpp && y > 0 ? data[(y - 1) * stride + x - bpp] : 0;
        let v;
        if (f === 0) v = cur; else if (f === 1) v = cur - a; else if (f === 2) v = cur - b;
        else if (f === 3) v = cur - ((a + b) >> 1);
        else { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = cur - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
        row[x] = v & 0xff;
      }
      let sad = 0;
      for (const b of row) sad += b < 128 ? b : 256 - b;
      cands.push({ f, row, sad });
    }
    cands.sort((x, y) => x.sad - y.sad);
    const best = cands[0];
    raw[y * (stride + 1)] = best.f;
    best.row.copy(raw, y * (stride + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const crcTable = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c; }
  const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- 诊断 ----------
function info(path) {
  const { width: w, height: h, data } = decodePNG(path);
  const A = i => data[i * 4 + 3];
  const RGB = i => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
  const corners = [0, w - 1, (h - 1) * w, h * w - 1].map(i => `${RGB(i).join(',')}@a${A(i)}`);
  // 环带最常见色
  const ring = new Map();
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const k = RGB(y * w + x).join(','); ring.set(k, (ring.get(k) || 0) + 1); }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const k = RGB(y * w + x).join(','); ring.set(k, (ring.get(k) || 0) + 1); }
  const top = [...ring.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  // bbox（alpha > 16）
  let x0 = w, y0 = h, x1 = -1, y1 = -1, opaque = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (A(y * w + x) > 16) { opaque++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  console.log(`${basename(path)}: ${w}x${h}  角=[${corners.join(' | ')}]`);
  console.log(`  环带 top3: ${top.map(([c, n]) => `${c}×${n}`).join('  ')}`);
  console.log(`  bbox=${bw}x${bh} @(${x0},${y0})  覆盖率=${(opaque / (w * h) * 100).toFixed(1)}%  宽高比=${(bw / bh).toFixed(3)}`);
  return { w, h, bw, bh };
}

// ---------- 抠底（均匀底色：边缘洪水填充 + 光晕 alpha 恢复） ----------
const dist = (r1, g1, b1, r2, g2, b2) => Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);

function keyout(img, opt = {}) {
  const { width: w, height: h, data } = img;
  const minCh = opt.minCh ?? 205;   // 近白门槛：最小通道
  const maxSat = opt.maxSat ?? 26;  // 低饱和门槛：max-min
  const N = w * h;
  const RGB = i => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];

  // 1) 阈值：近白且低饱和 → 候选背景（渐变无所谓，不吃容差）
  const cand = new Uint8Array(N);
  let nCand = 0;
  for (let i = 0; i < N; i++) {
    const [r, g, b] = RGB(i);
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    if (mn >= minCh && mx - mn <= maxSat) { cand[i] = 1; nCand++; }
  }
  // 2) 只保留与画布边缘连通的候选（物体内部的高光/白屏不会被挖）
  const seen = new Uint8Array(N);
  const q = [];
  const seed = i => { if (cand[i] && !seen[i]) { seen[i] = 1; q.push(i); } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  for (let p = 0; p < q.length; p++) {
    const i = q[p], x = i % w, y = (i - x) / w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (y > 0) seed(i - w);
    if (y < h - 1) seed(i + w);
  }
  // 记录每个被挖像素的原色（光晕反解时用它当局部底色）
  const orig = Buffer.from(data);
  let removed = 0;
  for (let i = 0; i < N; i++) if (seen[i]) { data[i * 4 + 3] = 0; removed++; }

  // 3) 光晕反解：紧邻被挖区的实色像素 p = a·fg + (1-a)·bg
  let fixed = 0;
  const bgOf = i => [orig[i * 4], orig[i * 4 + 1], orig[i * 4 + 2]];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (seen[i] || data[i * 4 + 3] < 250) continue;
    let bgn = null, fgi = -1;
    for (const j of [i - 1, i + 1, i - w, i + w]) {
      if (seen[j]) { if (!bgn) bgn = bgOf(j); continue; }
      if (fgi < 0 || dist(...RGB(j), ...bgOf(i)) > dist(...RGB(fgi), ...bgOf(i))) fgi = j;
    }
    if (!bgn || fgi < 0) continue;
    const [br, bgG, bb] = bgn;
    const [fr, fg2, fb] = RGB(fgi);
    const [pr, pg, pb] = RGB(i);
    let a = 0, n = 0;
    for (const [pc, fc, bc] of [[pr, fr, br], [pg, fg2, bgG], [pb, fb, bb]]) {
      if (Math.abs(fc - bc) < 8) continue;
      a += (pc - bc) / (fc - bc); n++;
    }
    if (!n) continue;
    a /= n;
    if (a <= 0.02 || a >= 0.995) continue;
    let err = 0;
    for (const [pc, fc, bc] of [[pr, fr, br], [pg, fg2, bgG], [pb, fb, bb]]) err += Math.abs(pc - (a * fc + (1 - a) * bc));
    if (err / 3 > 14) continue;
    data[i * 4 + 3] = Math.round(a * 255);
    data[i * 4] = Math.min(255, Math.round(fr));
    data[i * 4 + 1] = Math.min(255, Math.round(fg2));
    data[i * 4 + 2] = Math.min(255, Math.round(fb));
    fixed++;
  }
  // 4) 剔除零散残留（棋盘格边线 / 软阴影碎块）：只保留足够大的连通域
  const comp = new Int32Array(N).fill(-1);
  const areas = [];
  const stack = [];
  for (let s = 0; s < N; s++) {
    if (comp[s] >= 0 || data[s * 4 + 3] <= 16) continue;
    const id = areas.length;
    let area = 0;
    comp[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop(); area++;
      const x = i % w, y = (i - x) / w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && comp[j] < 0 && data[j * 4 + 3] > 16) { comp[j] = id; stack.push(j); }
      }
    }
    areas.push(area);
  }
  const largest = Math.max(0, ...areas);
  const minArea = Math.max(96, largest * 0.06);
  let dropped = 0;
  for (let i = 0; i < N; i++) {
    const id = comp[i];
    if (id >= 0 && areas[id] < minArea) { data[i * 4 + 3] = 0; dropped++; }
  }

  // 5) 剔除地面投影（可选，默认关闭）：从「已透明的背景」向内的 BFS，只吃与之连通、低彩度、中高明度的柔和块。
  //    ⚠️ 默认关闭的原因：C 家族织物就是 #E5E5E5（彩度 0、L=0.898），与浅灰投影在颜色上不可分，
  //    一旦描边有缺口就会把包体当投影吃掉（实测 prop_05_B 误删 458K px）。投影应在提示词侧禁止。
  let shadow = 0;
  if (opt.deshadow) {
    const seen2 = new Uint8Array(N);
    const q2 = [];
    const isShadow = i => {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
      const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      return mx - mn <= 62 && L >= 0.45 && L <= 0.90;
    };
    const pushS = i => { if (!seen2[i] && data[i * 4 + 3] > 16 && isShadow(i)) { seen2[i] = 1; q2.push(i); } };
    for (let i = 0; i < N; i++) if (data[i * 4 + 3] <= 16) { // 从所有透明像素起手
      const x = i % w, y = (i - x) / w;
      if (x > 0) pushS(i - 1);
      if (x < w - 1) pushS(i + 1);
      if (y > 0) pushS(i - w);
      if (y < h - 1) pushS(i + w);
    }
    for (let p = 0; p < q2.length; p++) {
      const i = q2[p], x = i % w, y = (i - x) / w;
      if (x > 0) pushS(i - 1);
      if (x < w - 1) pushS(i + 1);
      if (y > 0) pushS(i - w);
      if (y < h - 1) pushS(i + w);
    }
    for (const i of q2) { data[i * 4 + 3] = 0; shadow++; }
  }

  let left = 0;
  for (let i = 0; i < N; i++) if (data[i * 4 + 3] > 16) left++;
  const cov = left / N;
  console.log(`  抠底：候选 ${nCand}px（${(nCand / N * 100).toFixed(1)}%） 边缘连通挖除 ${removed}px  光晕恢复 ${fixed}px  剔除碎块 ${dropped}px（${areas.length} 个连通域，最小保留 ${Math.round(minArea)}px）  剔除投影 ${shadow}px  残留主体 ${(cov * 100).toFixed(1)}%`);
  if (cov < 0.05) throw new Error(`抠底后只剩 ${(cov * 100).toFixed(1)}% 不透明像素——底色与主体同色或描边断裂，拒绝写盘`);
  return { removed, fixed, nCand, N, dropped, shadow };
}

// ---------- 面积平均缩放 + 居中合版 ----------
function fitToCanvas(img, W, H, margin) {
  const { width: w, height: h, data } = img;
  // bbox
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) throw new Error('整图全透明，抠底失败（底色取错或容差过大）');
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const maxW = W - margin * 2, maxH = H - margin * 2;
  const s = Math.min(maxW / bw, maxH / bh);
  const tw = Math.max(1, Math.round(bw * s)), th = Math.max(1, Math.round(bh * s));

  // 面积平均（预乘 alpha 后 box 采样）
  const tmp = new Float32Array(tw * th * 4);
  const sx = bw / tw, sy = bh / th;
  for (let ty = 0; ty < th; ty++) {
    const ya = y0 + Math.floor(ty * sy), yb = Math.min(y0 + bh, Math.max(ya + 1, y0 + Math.floor((ty + 1) * sy)));
    for (let tx = 0; tx < tw; tx++) {
      const xa = x0 + Math.floor(tx * sx), xb = Math.min(x0 + bw, Math.max(xa + 1, x0 + Math.floor((tx + 1) * sx)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
        const i = (y * w + x) * 4, al = data[i + 3] / 255;
        r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al; n++;
      }
      const o = (ty * tw + tx) * 4;
      if (a > 1e-6) { tmp[o] = r / a; tmp[o + 1] = g / a; tmp[o + 2] = b / a; tmp[o + 3] = (a / n) * 255; }
      else { tmp[o + 3] = 0; }
    }
  }
  const out = Buffer.alloc(W * H * 4); // 全 0 = 透明
  const ox = Math.floor((W - tw) / 2), oy = Math.floor((H - th) / 2);
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const s0 = (ty * tw + tx) * 4, d0 = ((ty + oy) * W + tx + ox) * 4;
    out[d0] = Math.max(0, Math.min(255, Math.round(tmp[s0])));
    out[d0 + 1] = Math.max(0, Math.min(255, Math.round(tmp[s0 + 1])));
    out[d0 + 2] = Math.max(0, Math.min(255, Math.round(tmp[s0 + 2])));
    out[d0 + 3] = Math.max(0, Math.min(255, Math.round(tmp[s0 + 3])));
  }
  console.log(`  缩放：bbox ${bw}x${bh} → ${tw}x${th}（比例 ${s.toFixed(3)}）  合版 ${W}x${H} @偏移(${ox},${oy})  余量 L${ox} R${W - ox - tw} T${oy} B${H - oy - th}`);
  return { width: W, height: H, data: out };
}

// ---------- 调色板量化（median cut） ----------
function quantize(img, nColors = 64) {
  const { width: w, height: h, data } = img;
  const px = [];
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] > 8) px.push(i);
  if (!px.length) return img;
  const P = px.map(i => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  let buckets = [P];
  while (buckets.length < nColors) {
    // 选「跨度最大」的桶分裂
    let bi = -1, bestRange = -1, bestCh = 0;
    buckets.forEach((b, i) => {
      if (b.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let mn = 255, mx = 0;
        for (const p of b) { if (p[ch] < mn) mn = p[ch]; if (p[ch] > mx) mx = p[ch]; }
        if (mx - mn > bestRange) { bestRange = mx - mn; bi = i; bestCh = ch; }
      }
    });
    if (bi < 0 || bestRange <= 0) break;
    const b = buckets[bi].slice().sort((x, y) => x[bestCh] - y[bestCh]);
    const mid = b.length >> 1;
    buckets.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  const pal = buckets.filter(b => b.length).map(b => {
    let r = 0, g = 0, bl = 0;
    for (const p of b) { r += p[0]; g += p[1]; bl += p[2]; }
    return [Math.round(r / b.length), Math.round(g / b.length), Math.round(bl / b.length)];
  });
  for (let k = 0; k < px.length; k++) {
    const i = px[k], [r, g, bl] = P[k];
    let bi = 0, bd = Infinity;
    for (let j = 0; j < pal.length; j++) {
      const d = (r - pal[j][0]) ** 2 + (g - pal[j][1]) ** 2 + (bl - pal[j][2]) ** 2;
      if (d < bd) { bd = d; bi = j; }
    }
    data[i * 4] = pal[bi][0]; data[i * 4 + 1] = pal[bi][1]; data[i * 4 + 2] = pal[bi][2];
  }
  // alpha 也量化（16 级）：8bit 连续 alpha 是 PNG 压不动的另一个大头
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3];
    if (a === 0 || a === 255) continue;
    data[i * 4 + 3] = Math.min(255, Math.round(a / 17) * 17);
  }
  return img;
}

// ---------- CLI ----------
function palette(path, topN = 5) {
  const { width: w, height: h, data } = decodePNG(path);
  const cnt = new Map();
  let opaque = 0;
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] < 200) continue;
    opaque++;
    const r = data[i * 4] & 0xF8, g = data[i * 4 + 1] & 0xF8, b = data[i * 4 + 2] & 0xF8; // 16 级量化
    const k = (r << 16) | (g << 8) | b;
    cnt.set(k, (cnt.get(k) || 0) + 1);
  }
  const list = [...cnt.entries()].sort((x, y) => y[1] - x[1]).slice(0, topN);
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  console.log(`${basename(path)} 主色 top${topN}（不透明 ${opaque}px）:`);
  for (const [k, n] of list) {
    const r = (k >> 16) & 0xff, g = (k >> 8) & 0xff, b = k & 0xff;
    console.log(`  #${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}  ${(n / opaque * 100).toFixed(1)}%  L=${(lum(r, g, b) / 255).toFixed(3)}`);
  }
}

const [cmd, a, b, c, d, e, f] = process.argv.slice(2);
if (cmd === 'palette') {
  palette(a, b ? +b : 5);
} else if (cmd === 'info') {
  info(a);
} else if (cmd === 'fit') {
  const raw = a, itemType = b, W = +c, H = +d;
  let margin = 8, srcDir = null;
  for (const v of process.argv.slice(7)) {
    if (v === '--src') continue;
    if (v.startsWith('--src=')) srcDir = v.slice(6);
    else if (!Number.isNaN(+v)) margin = +v;
    else if (srcDir === '') srcDir = v;
  }
  const img = decodePNG(raw);
  const infoRes = info(raw);
  const A = i => img.data[i * 4 + 3];
  const cornersOpaque = [0, img.width - 1, (img.height - 1) * img.width, img.height * img.width - 1].some(i => A(i) > 16);
  if (cornersOpaque) { console.log('  检测到不透明底 → 执行抠底'); keyout(img, { deshadow: process.argv.slice(7).includes('--deshadow') }); }
  else console.log('  四角已透明 → 跳过抠底');
  const final = fitToCanvas(img, W, H, margin);
  quantize(final, +(process.env.QN || 16));
  if (srcDir) { mkdirSync(srcDir, { recursive: true }); copyFileSync(raw, join(srcDir, `${itemType}@v1_src.png`)); }
  const outPath = join(OUT_DIR, `${itemType}.png`);
  writeFileSync(outPath, encodePNG(final));
  console.log(`  → 写出 ${outPath}`);
} else {
  console.log('用法：info <png>  |  fit <png> <itemType> <W> <H> [margin] [--src <dir>]');
}
