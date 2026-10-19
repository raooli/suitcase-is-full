#!/usr/bin/env node
/**
 * M4-3 批次出图后处理（stdlib only：PNG 解码/编码/抠底/缩放/合版/量化）
 * M4-6 增 footprint 遮罩：真图剪影必须等于物品的 cells 足迹（用户真机反馈：
 * L 型占格配矩形图，「拖拽时是长方形、落盘变 another shape」）。
 *
 * 用法：
 *   node tools/art-batch-proc.mjs info    <file.png>                     尺寸/角 alpha/环带色/bbox/覆盖率
 *   node tools/art-batch-proc.mjs palette <file.png> [N]                 主色聚类（16 级量化）+ 相对亮度
 *   node tools/art-batch-proc.mjs fit <file.png> <itemType> [W] [H] [margin] [--no-mask] [--deshadow]
 *                                                 抠底→裁边→等比缩放→居中合到 W×H 透明画布→**足迹遮罩**→量化
 *                                                 （W/H 省略时从 levels.json 包围盒推导；遮罩自动执行，
 *                                                   --no-mask 跳过——仅调试用）
 *   node tools/art-batch-proc.mjs mask <itemType> [--dry-run]            对**已交付** PNG 补烘焙足迹遮罩
 *                                                 （M4-6 追溯 14 张异形图用；raw 源已不在，只能挖现有图）
 *
 * 足迹遮罩规则（M4-6）：
 *   - 占格 (r,c) → 画布矩形 x∈[c·96,(c+1)·96), y∈[r·96,(r+1)·96)（y 向下，与 PNG 一致）
 *   - 非占格区域 alpha 置 0（RGB 同步清零利于压缩）；**硬切**——格边界即像素边界，
 *     切沿是直线，与格子严丝合缝（边界处保留主体自身 AA）
 *   - 满矩形足迹为 no-op（11 张矩形图零影响）
 *   - 遮罩在合版后、量化前执行：量化建调色板只收 alpha>8 的像素，被挖像素不进调色板
 *
 * 输出：assets/resources/sprites/props/<itemType>.png（文件名严格 = itemType）
 * 环境变量：QN 调色板颜色数（默认 16）；体积与观感的折中点，16 色肉眼无差、比 64 色省 60%+
 *
 * 不写盘的情形：抠底后剩余不透明 < 5%（底色与主体同色 / 描边断裂）直接抛错。
 * `--deshadow` 慎用：C 家族织物 #E5E5E5 与浅灰投影颜色不可分，会误删主体。
 */
import { inflateSync, deflateSync } from 'zlib';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';

const ROOT = '/Users/sheep/code-workspace/suitcase-is-full';
const OUT_DIR = join(ROOT, 'assets/resources/sprites/props');
const LEVELS_PATH = join(ROOT, 'assets/data/levels.json');
const CELL_PX = 96; // @2x 单格物理像素（与 tools/check-art.ts 同口径）

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
  const ref = opt.ref ?? null;      // 采样底色（M4-6b：带纸纹的米色底，固定阈值吃不住）
  const tol = opt.tol ?? 30;        // 色距容差
  const N = w * h;
  const RGB = i => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];

  // 1) 阈值：ref 优先（按采样底色 + 色距，抗纹理）；否则近白且低饱和
  const cand = new Uint8Array(N);
  let nCand = 0;
  for (let i = 0; i < N; i++) {
    const [r, g, b] = RGB(i);
    if (ref) {
      if (dist(r, g, b, ref[0], ref[1], ref[2]) <= tol) { cand[i] = 1; nCand++; }
      continue;
    }
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

/**
 * M4-6b：把子件的**内容包围盒**（非等比）缩放到 tw×th。
 * 与 fitToCanvas 的区别：不做等比约束、不居中——目标矩形就是块的形状，
 * 子件被生成成近似块比例时畸变很小。
 */
function scalePartInto(img, tw, th) {
  const { width: w, height: h, data } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) throw new Error('子件整图透明——抠底失败或底色取错');
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const out = Buffer.alloc(tw * th * 4);
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
      if (a > 1e-6) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); out[o + 3] = Math.round((a / n) * 255); }
    }
  }
  return out;
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

// ---------- footprint 遮罩（M4-6） ----------

/**
 * 从 levels.json 按 itemType 反查物品规格（形状唯一真相源）。
 * itemType→cells 已验证全局唯一；若万一撞形直接抛错（遮罩无法唯一确定）。
 * 返回 null = 数据里没有这个 itemType（调用方自行决定是否放行）。
 */
function findItemSpec(itemType) {
  const data = JSON.parse(readFileSync(LEVELS_PATH, 'utf8'));
  const levels = data.levels ?? data;
  let found = null;
  for (const lv of levels) {
    for (const it of lv.items) {
      if (it.itemType !== itemType) continue;
      const cells = it.cells.map(([r, c]) => [r, c]);
      const key = JSON.stringify([...cells].sort((x, y) => x[0] - y[0] || x[1] - y[1]));
      if (found !== null && found.key !== key) {
        throw new Error(`${itemType} 在不同关卡有不同 cells（L${found.levels} vs L${lv.levelId}）——足迹遮罩无法唯一确定，需先统一数据`);
      }
      if (found === null) found = { itemType, name: it.name, cells, key, levels: [lv.levelId] };
      else if (!found.levels.includes(lv.levelId)) found.levels.push(lv.levelId);
    }
  }
  if (found === null) return null;
  // 防御性归一化（数据契约本就 minRow=minCol=0，这里不依赖它）
  const minR = Math.min(...found.cells.map((c) => c[0]));
  const minC = Math.min(...found.cells.map((c) => c[1]));
  found.cells = found.cells.map(([r, c]) => [r - minR, c - minC]);
  found.rows = Math.max(...found.cells.map((c) => c[0])) + 1;
  found.cols = Math.max(...found.cells.map((c) => c[1])) + 1;
  return found;
}

/** cells → ASCII 布局（X=占格，.=包围盒内非占格），供日志/文档对人眼展示 */
function footprintAscii(cells, rows, cols) {
  const occ = new Set(cells.map(([r, c]) => r * 100000 + c));
  const lines = [];
  for (let r = 0; r < rows; r++) {
    let s = '';
    for (let c = 0; c < cols; c++) s += occ.has(r * 100000 + c) ? 'X' : '.';
    lines.push(s);
  }
  return lines;
}

/**
 * 把 img 中**非占格区域**的 alpha 置 0（RGB 同步清零）。
 * 原地修改。返回挖除统计（每格挖前覆盖率 + 合计挖除像素）。
 * 前置条件：img 尺寸 == cols×CELL_PX × rows×CELL_PX（调用方校验）。
 */
function applyFootprintMask(img, cells) {
  const { width: w, height: h, data } = img;
  const occ = new Set(cells.map(([r, c]) => r * 100000 + c));
  const rows = Math.max(...cells.map((c) => c[0])) + 1;
  const cols = Math.max(...cells.map((c) => c[1])) + 1;

  // 每格挖前覆盖率（alpha>16 计），操作员可 review 切掉多少
  const before = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let n = 0;
      for (let y = r * CELL_PX; y < (r + 1) * CELL_PX && y < h; y++) {
        for (let x = c * CELL_PX; x < (c + 1) * CELL_PX && x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 16) n++;
        }
      }
      before.push({ r, c, occ: occ.has(r * 100000 + c), px: n });
    }
  }

  let removed = 0;
  for (let y = 0; y < h; y++) {
    const r = Math.floor(y / CELL_PX);
    for (let x = 0; x < w; x++) {
      if (occ.has(r * 100000 + Math.floor(x / CELL_PX))) continue;
      const i = (y * w + x) * 4;
      if (data[i + 3] !== 0) {
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0;
        removed++;
      }
    }
  }
  return { removed, rows, cols, before, cellTotal: CELL_PX * CELL_PX };
}

/** 打印遮罩报告（布局 + 每格覆盖率 + 挖除量） */
function printMaskReport(spec, stats) {
  const ascii = footprintAscii(spec.cells, stats.rows, stats.cols).join('/');
  const full = spec.cells.length === stats.rows * stats.cols;
  console.log(`  ${spec.itemType}（${spec.name}）${stats.rows}×${stats.cols} 布局 ${ascii}  L${spec.levels.join(',L')}`);
  if (full) {
    console.log('    满矩形足迹——无需挖除（no-op）');
    return;
  }
  for (const g of stats.before) {
    const pct = ((g.px / stats.cellTotal) * 100).toFixed(1);
    console.log(`    格(${g.r},${g.c}) ${g.occ ? '占' : '空'} 挖前覆盖 ${pct}%${g.occ ? '' : ' ←挖除'}`);
  }
  const total = stats.rows * stats.cols * stats.cellTotal;
  console.log(`    合计挖除 ${stats.removed}px（画布 ${(stats.removed / total * 100).toFixed(1)}%）`);
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

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'palette') {
  palette(a, b ? +b : 5);
} else if (cmd === 'info') {
  info(a);
} else if (cmd === 'mask') {
  // M4-6：对已交付 PNG 补烘焙足迹遮罩（追溯修复 14 张异形图；raw 源已不在仓库）
  const itemType = a;
  const dryRun = process.argv.slice(3).includes('--dry-run');
  const spec = findItemSpec(itemType);
  if (spec === null) throw new Error(`${itemType} 不在 levels.json 里——无法确定足迹`);
  const path = join(OUT_DIR, `${itemType}.png`);
  if (!existsSync(path)) throw new Error(`${path} 不存在（尚未交付？）`);
  const img = decodePNG(path);
  const ew = spec.cols * CELL_PX, eh = spec.rows * CELL_PX;
  if (img.width !== ew || img.height !== eh) {
    throw new Error(`${itemType}.png 实际 ${img.width}x${img.height}，期望足迹画布 ${ew}x${eh}——尺寸不符，拒绝挖`);
  }
  const stats = applyFootprintMask(img, spec.cells);
  printMaskReport(spec, stats);
  if (dryRun) {
    console.log('  --dry-run：不写盘');
  } else if (stats.removed > 0) {
    writeFileSync(path, encodePNG(img));
    console.log(`  → 已烘焙 ${path}（跑一次编辑器构建让 .meta 重新 trim）`);
  } else {
    console.log('  无需修改');
  }
} else if (cmd === 'fit') {
  // 位置参数：raw itemType [W] [H] [margin]；flag：--no-mask / --deshadow / --src <dir|dir>
  const pos = [];
  let margin = 8, applyMask = true, deshadow = false, srcDir = null;
  const args = process.argv.slice(3);
  for (let i = 0; i < args.length; i++) {
    const v = args[i];
    if (v === '--no-mask') applyMask = false;
    else if (v === '--deshadow') deshadow = true;
    else if (v === '--src') srcDir = args[++i] ?? '';
    else if (v.startsWith('--src=')) srcDir = v.slice(6);
    else pos.push(v);
  }
  const [raw, itemType, ...nums] = pos;
  if (!raw || !itemType) throw new Error('fit 用法：fit <raw.png> <itemType> [W] [H] [margin] [--no-mask] [--deshadow] [--src <dir>]');
  const n = nums.map(Number);
  if (n.some((x) => !Number.isFinite(x))) throw new Error(`fit 位置参数必须是数字：${nums.join(' ')}`);
  if (n.length === 1) throw new Error('W/H 必须成对给出（或都省略，从 levels.json 足迹包围盒自动推导）');
  let W, H;
  if (n.length >= 2) {
    W = n[0]; H = n[1];
    if (n.length >= 3) margin = n[2];
  } else {
    const spec = findItemSpec(itemType);
    if (spec === null) throw new Error(`${itemType} 不在 levels.json，且未显式给 W/H`);
    W = spec.cols * CELL_PX; H = spec.rows * CELL_PX;
  }
  const img = decodePNG(raw);
  info(raw);
  const A = i => img.data[i * 4 + 3];
  const cornersOpaque = [0, img.width - 1, (img.height - 1) * img.width, img.height * img.width - 1].some(i => A(i) > 16);
  if (cornersOpaque) { console.log('  检测到不透明底 → 执行抠底'); keyout(img, { deshadow }); }
  else console.log('  四角已透明 → 跳过抠底');
  const final = fitToCanvas(img, W, H, margin);
  // M4-6：足迹遮罩（合版后、量化前）。levels.json 没有该型（历史占位型）时放行
  if (applyMask) {
    const spec = findItemSpec(itemType);
    if (spec === null) {
      console.log(`  ${itemType} 不在 levels.json——跳过足迹遮罩`);
    } else {
      if (final.width !== spec.cols * CELL_PX || final.height !== spec.rows * CELL_PX) {
        throw new Error(`画布 ${final.width}x${final.height} 与足迹包围盒 ${spec.cols * CELL_PX}x${spec.rows * CELL_PX} 不符——W/H 给错了？`);
      }
      const stats = applyFootprintMask(final, spec.cells);
      printMaskReport(spec, stats);
    }
  }
  quantize(final, +(process.env.QN || 16));
  if (srcDir) { mkdirSync(srcDir, { recursive: true }); copyFileSync(raw, join(srcDir, `${itemType}@v1_src.png`)); }
  const outPath = join(OUT_DIR, `${itemType}.png`);
  writeFileSync(outPath, encodePNG(final));
  console.log(`  → 写出 ${outPath}`);
} else if (cmd === 'guide') {
  // M4-6b：渲染「足迹形状引导图」——供 image-to-image 把物品画进精确形状。
  // 纯文本提示对多联骨牌的几何约束太弱（帽兜/裙摆总画大），改用视觉引导。
  // 用法：guide <itemType> <outPath> [--scale 2] [--bg 247,246,243] [--fill 200,200,200]
  const itemType = a, outPath = b;
  if (!itemType || !outPath) throw new Error('guide 用法：guide <itemType> <outPath> [--scale 2] [--bg r,g,b] [--fill r,g,b]');
  const spec = findItemSpec(itemType);
  if (spec === null) throw new Error(`${itemType} 不在 levels.json 里——无法渲染足迹`);
  const gargs = process.argv.slice(5);
  let scale = 2, bg = [247, 246, 243], fill = [200, 200, 200];
  for (let i = 0; i < gargs.length; i++) {
    const v = gargs[i];
    if (v === '--scale') scale = +gargs[++i];
    else if (v.startsWith('--scale=')) scale = +v.slice(8);
    else if (v === '--bg') bg = gargs[++i].split(',').map(Number);
    else if (v === '--fill') fill = gargs[++i].split(',').map(Number);
  }
  const cell = CELL_PX * scale;
  const W = spec.cols * cell, H = spec.rows * cell;
  const gdata = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { gdata[i * 4] = bg[0]; gdata[i * 4 + 1] = bg[1]; gdata[i * 4 + 2] = bg[2]; gdata[i * 4 + 3] = 255; }
  for (const [r, c] of spec.cells) {
    for (let y = r * cell; y < (r + 1) * cell; y++) {
      for (let x = c * cell; x < (c + 1) * cell; x++) {
        const i = (y * W + x) * 4;
        gdata[i] = fill[0]; gdata[i + 1] = fill[1]; gdata[i + 2] = fill[2];
      }
    }
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, encodePNG({ width: W, height: H, data: gdata }));
  const hex = fill.map((v) => v.toString(16).padStart(2, '0')).join('');
  console.log(`  引导图 ${itemType} 足迹 ${spec.cols}x${spec.rows} → ${outPath}（${W}x${H}，占格灰 #${hex}）`);
} else if (cmd === 'compose') {
  // M4-6b：按格分块拼版——把子件精确摆进各自矩形块。
  // 动机：AI 无法稳定把单一物体的比例对齐多联骨牌（帽兜/裙摆总画大），
  // 硬遮罩就会「切残」。改为每块单独出图 + 几何拼版，从根上不存在切割。
  // 用法：compose <itemType> 'r,c,h,w=part.png' ['r,c,h,w=part.png' ...] [--bleed 1] [--out path]
  const itemType = a;
  if (!itemType) throw new Error('compose 用法：compose <itemType> \'r,c,h,w=part.png\' [...]');
  const spec = findItemSpec(itemType);
  if (spec === null) throw new Error(`${itemType} 不在 levels.json 里——无法确定足迹`);
  const cargs = process.argv.slice(4);
  let bleed = 6, outPath = join(OUT_DIR, `${itemType}.png`), keyTol = 30;
  const blocks = [];
  for (let i = 0; i < cargs.length; i++) {
    const v = cargs[i];
    if (v === '--bleed') bleed = +cargs[++i];
    else if (v === '--tol') keyTol = +cargs[++i];
    else if (v === '--out') outPath = cargs[++i];
    else {
      const m = /^(\d+),(\d+),(\d+),(\d+)=(.+)$/.exec(v);
      if (!m) throw new Error(`块规格须为 r,c,h,w=path：${v}`);
      blocks.push({ r: +m[1], c: +m[2], h: +m[3], w: +m[4], path: m[5] });
    }
  }
  if (!blocks.length) throw new Error('至少要给一个块');
  const W = spec.cols * CELL_PX, H = spec.rows * CELL_PX;
  const canvas = Buffer.alloc(W * H * 4); // 全 0 = 透明
  // 每边出血：邻边整列/整行都是占格 → 多出血让两块无缝衔接；否则 1px 防切主体
  const occSet = new Set(spec.cells.map(([r, c]) => r * 100000 + c));
  const isOcc = (r, c) => occSet.has(r * 100000 + c);
  const edgeBleed = (ok) => (ok ? bleed : 1);
  for (const blk of blocks) {
    const part = decodePNG(blk.path);
    const cornersOpaque = [0, part.width - 1, (part.height - 1) * part.width, part.height * part.width - 1]
      .some((i) => part.data[i * 4 + 3] > 16);
    if (cornersOpaque) {
      const cs = [[0, 0], [part.width - 1, 0], [0, part.height - 1], [part.width - 1, part.height - 1]];
      const avg = [0, 0, 0];
      for (const [x, y] of cs) { const i = (y * part.width + x) * 4; avg[0] += part.data[i] / 4; avg[1] += part.data[i + 1] / 4; avg[2] += part.data[i + 2] / 4; }
      keyout(part, { ref: avg.map(Math.round), tol: keyTol });
    }
    const rowsIn = Array.from({ length: blk.h }, (_, i) => blk.r + i);
    const colsIn = Array.from({ length: blk.w }, (_, i) => blk.c + i);
    const bL = edgeBleed(blk.c > 0 && rowsIn.every((r) => isOcc(r, blk.c - 1)));
    const bR = edgeBleed(blk.c + blk.w < spec.cols && rowsIn.every((r) => isOcc(r, blk.c + blk.w)));
    const bT = edgeBleed(blk.r > 0 && colsIn.every((c) => isOcc(blk.r - 1, c)));
    const bB = edgeBleed(blk.r + blk.h < spec.rows && colsIn.every((c) => isOcc(blk.r + blk.h, c)));
    const tw = blk.w * CELL_PX + bL + bR, th = blk.h * CELL_PX + bT + bB;
    const scaled = scalePartInto(part, tw, th);
    const ox = blk.c * CELL_PX - bL, oy = blk.r * CELL_PX - bT;
    for (let y = 0; y < th; y++) {
      const dy = y + oy; if (dy < 0 || dy >= H) continue;
      for (let x = 0; x < tw; x++) {
        const dx = x + ox; if (dx < 0 || dx >= W) continue;
        const si = (y * tw + x) * 4, di = (dy * W + dx) * 4;
        const sa = scaled[si + 3] / 255;
        if (sa <= 0) continue;
        const da = canvas[di + 3] / 255;
        const oa = sa + da * (1 - sa);
        if (oa <= 0) continue;
        for (let k = 0; k < 3; k++) canvas[di + k] = Math.round((scaled[si + k] * sa + canvas[di + k] * da * (1 - sa)) / oa);
        canvas[di + 3] = Math.round(oa * 255);
      }
    }
    console.log(`  块 (${blk.r},${blk.c}) ${blk.w}x${blk.h} 出血 L${bL} R${bR} T${bT} B${bB} ← ${basename(blk.path)}`);
  }
  const out = { width: W, height: H, data: canvas };
  const cstats = applyFootprintMask(out, spec.cells); // 只清 bleed 溢出，正常应 <1%
  printMaskReport(spec, cstats);
  quantize(out, +(process.env.QN || 16));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, encodePNG(out));
  console.log(`  → 写出 ${outPath}`);
} else {
  console.log('用法：info <png>  |  palette <png> [N]  |  fit <png> <itemType> [W] [H] [margin] [--no-mask] [--deshadow] [--src <dir>]  |  mask <itemType> [--dry-run]  |  guide <itemType> <outPath> [--scale 2]  |  compose <itemType> \'r,c,h,w=part.png\' [...]');
}
