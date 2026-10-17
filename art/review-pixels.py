#!/usr/bin/env python3
"""M4-3 美术资产像素级复审（stdlib only）。

对 assets/resources/sprites/props/*.png 逐张核查 TDD 17.2 / 17.6（A-03/A-05）：
  1. PNG 头：color type 6（RGBA）/ 8bit
  2. 画布 = itemType 形状 × 96（@2x，禁 @4x）
  3. 四角 alpha = 0（透明底）
  4. 外缘 1px 环带不透明像素 = 0（无白边/无裁切）
  5. 不透明 bbox 四边距画布边的余量（出血观測）
  6. 主体覆盖率
  7. 主色聚类（16 级量化，跳透明）+ 相对亮度 → 对照 5.2 家族色板
  8. 近白不透明像素计数（白底假透明签名）
  9. 半透明 fringe 均值色（白 matting 光晕签名）
"""
import json
import struct
import sys
import zlib
from collections import Counter

PROPS = "assets/resources/sprites/props"

# itemType -> (rows, cols, 家族) —— 来源 docs/07-AI-Prompts.md 5.6
ITEMS = {
    "prop_01_A": (1, 2, ["R"]),
    "prop_01_B": (2, 1, ["M"]),
    "prop_01_C": (1, 2, ["B"]),
    "prop_01_D": (1, 3, ["M", "R"]),
    "prop_02_A": (2, 2, ["C"]),
    "prop_02_B": (2, 1, ["C", "B"]),
    "prop_02_C": (2, 1, ["C", "R"]),
    "prop_02_D": (2, 2, ["C", "B"]),
    "prop_04_A": (2, 4, ["C", "M"]),
    "prop_04_B": (3, 2, ["C", "R", "B"]),
    "prop_04_C": (2, 2, ["C", "R"]),
    "prop_04_D": (2, 3, ["C", "M"]),
    "prop_07_A": (5, 1, ["M"]),
    "prop_jacket": (2, 3, ["C", "R"]),
    "prop_pouch": (2, 3, ["C", "B"]),
    "prop_scarf": (1, 3, ["C", "M"]),
    "prop_umbrella": (1, 5, ["M"]),
}

# 5.2 家族色板（浅档主填充 + 深档 accent）
FAMILY_COLORS = {
    "C": [(0xE5, 0xE5, 0xE5), (0xF5, 0xEF, 0xE3), (0xD4, 0xCF, 0xCD)],
    "R": [(0xFF, 0xE0, 0xE7), (0xFA, 0x91, 0xA8)],
    "M": [(0xBC, 0xEA, 0xD5), (0x87, 0xCB, 0xB8), (0x55, 0x9E, 0x91)],
    "B": [(0xBD, 0xE4, 0xF7), (0x8F, 0xBB, 0xD9)],
    "N": [(0xC2, 0xA2, 0x8A), (0xE0, 0xAE, 0x91), (0x7A, 0x5C, 0x4F)],
}
OUTLINE = (0x7A, 0x5C, 0x4F)


def luminance(rgb):
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


def read_png(path):
    """返回 (width, height, bit_depth, color_type, pixels[y][x] = (r,g,b,a))。"""
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not png"
    pos = 8
    width = height = depth = ctype = None
    idat = b""
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        ctag = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        if ctag == b"IHDR":
            width, height, depth, ctype = struct.unpack(">IIBB", chunk[:10])
        elif ctag == b"IDAT":
            idat += chunk
        elif ctag == b"IEND":
            break
        pos += 12 + length
    raw = zlib.decompress(idat)
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    assert depth == 8, f"bit depth {depth}"
    stride = width * channels
    pixels = []
    prev = bytearray(stride)
    p = 0
    for _ in range(height):
        f = raw[p]
        p += 1
        line = bytearray(raw[p : p + stride])
        p += stride
        if f == 1:
            for i in range(channels, stride):
                line[i] = (line[i] + line[i - channels]) & 0xFF
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif f == 3:
            for i in range(stride):
                left = line[i - channels] if i >= channels else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif f == 4:
            for i in range(stride):
                a = line[i - channels] if i >= channels else 0
                b = prev[i]
                c = prev[i - channels] if i >= channels else 0
                pp = a + b - c
                pa, pb, pc = abs(pp - a), abs(pp - b), abs(pp - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        row = []
        for x in range(width):
            off = x * channels
            if channels == 4:
                row.append((line[off], line[off + 1], line[off + 2], line[off + 3]))
            elif channels == 3:
                row.append((line[off], line[off + 1], line[off + 2], 255))
            elif channels == 1:
                row.append((line[off], line[off], line[off], 255))
            else:
                row.append((line[off], line[off], line[off], line[off + 1]))
        pixels.append(row)
        prev = line
    return width, height, depth, ctype, pixels


def nearest_family(rgb):
    best, bd = None, 1e9
    for fam, cols in FAMILY_COLORS.items():
        for c in cols:
            d = sum((a - b) ** 2 for a, b in zip(rgb, c)) ** 0.5
            if d < bd:
                best, bd = fam, d
    return best, bd


def main():
    print(f"{'itemType':<16}{'canvas':<12}{'期望':<10}{'type':<7}{'角a':<5}"
          f"{'缘不透':<7}{'bbox余量':<18}{'覆盖':<6}{'近白':<6}主色(top3, 占比/L/最近家族@距离)")
    problems = []
    for it, (rows, cols, fams) in ITEMS.items():
        path = f"{PROPS}/{it}.png"
        w, h, depth, ctype, px = read_png(path)
        exp = (cols * 96, rows * 96)
        size_ok = (w, h) == exp
        # 角 alpha
        corners = [px[0][0][3], px[0][w - 1][3], px[h - 1][0][3], px[h - 1][w - 1][3]]
        corner_ok = all(a == 0 for a in corners)
        # 外缘环带
        edge_opaque = 0
        for x in range(w):
            for y in (0, h - 1):
                if px[y][x][3] > 8:
                    edge_opaque += 1
        for y in range(h):
            for x in (0, w - 1):
                if px[y][x][3] > 8:
                    edge_opaque += 1
        # bbox + 覆盖
        xs0, ys0, xs1, ys1 = w, h, -1, -1
        opaque = 0
        near_white = 0
        fringe_sum = [0, 0, 0]
        fringe_n = 0
        quant = Counter()
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[y][x]
                if a > 128:
                    opaque += 1
                    if x < xs0:
                        xs0 = x
                    if x > xs1:
                        xs1 = x
                    if y < ys0:
                        ys0 = y
                    if y > ys1:
                        ys1 = y
                    if r >= 245 and g >= 245 and b >= 245:
                        near_white += 1
                    quant[((r >> 4) << 4, (g >> 4) << 4, (b >> 4) << 4)] += 1
                elif a > 0:
                    fringe_sum[0] += r
                    fringe_sum[1] += g
                    fringe_sum[2] += b
                    fringe_n += 1
        coverage = opaque / (w * h)
        margins = f"L{xs0} R{w - 1 - xs1} T{ys0} B{h - 1 - ys1}"
        top = quant.most_common(3)
        tops = []
        for (r, g, b), n in top:
            fam, dist = nearest_family((r, g, b))
            tops.append(f"#{r:02X}{g:02X}{b:02X}({n * 100 // opaque}%,L={luminance((r, g, b)):.2f},{fam}@{dist:.0f})")
        fringe = (
            f"#{fringe_sum[0] // max(fringe_n, 1):02X}{fringe_sum[1] // max(fringe_n, 1):02X}"
            f"{fringe_sum[2] // max(fringe_n, 1):02X}" if fringe_n else "-"
        )
        print(f"{it:<16}{f'{w}x{h}':<12}{f'{exp[0]}x{exp[1]}':<10}"
              f"{'RGBA' if ctype == 6 else f'CT{ctype}':<7}{'OK' if corner_ok else corners!s:<5}"
              f"{edge_opaque:<7}{margins:<18}{coverage * 100:.0f}%{'':<2}{near_white:<6}"
              f"{' '.join(tops)}  fringe={fringe}")
        # 判定
        if not size_ok:
            problems.append(f"[阻塞] {it} 画布 {w}x{h} != 期望 {exp[0]}x{exp[1]}")
        if ctype != 6 or depth != 8:
            problems.append(f"[阻塞] {it} 非 PNG-24 RGBA（color type {ctype} / depth {depth}）")
        if not corner_ok:
            problems.append(f"[阻塞] {it} 四角 alpha 非全 0：{corners}")
        if edge_opaque:
            problems.append(f"[中] {it} 外缘 1px 环带 {edge_opaque} 个不透明像素（白边/裁切风险）")
        if near_white > opaque * 0.02:
            problems.append(f"[中] {it} 近白不透明像素 {near_white}（{near_white * 100 // opaque}%）疑似白底假透明")
        if fringe_n:
            favg = tuple(s // fringe_n for s in fringe_sum)
            if all(c > 235 for c in favg) and fringe_n > 50:
                problems.append(f"[低] {it} 半透明 fringe 偏白 #{favg[0]:02X}{favg[1]:02X}{favg[2]:02X}（{fringe_n}px）")
    print()
    if problems:
        for p in problems:
            print(p)
    else:
        print("✅ 像素级检查全部通过")


if __name__ == "__main__":
    main()
