/**
 * 真图旋转偏移代数（`core/geometry/artOffset.ts`，M4-6）。
 *
 * 存在理由：这个函数管「贴图内容中心随物品旋转后落到哪」。符号写反的症状
 * （旋转后贴图偏位/两轴拉伸）在端上要放到旋转后才能看见，而视图层没有单测
 * 兜底。这里钉两组不变量：
 *
 * 1. **四向显式映射**——画布口径（y 向下）的 CW 旋转，直接把 (3,5) 四个方向
 *    的结果写死，防止任何"看起来对"的符号漂移；
 * 2. **与 cells 旋转同向**——对多种异形（L/T/S/斜杠），把格心相对包围盒中心
 *    的画布偏移旋转 N 次，结果集合必须等于 `rotateBy(cells, N)` 后格心偏移的
 *    集合。这是"贴图旋转与占格旋转是同一个方向"的代数化身：ItemView 靠它把
 *    画布映射对齐到旋转后的包围盒，错一个符号，真图就会与它占的格子对不上。
 */

import { describe, expect, it } from 'vitest';

import { rotatedCenterOffset, rotateBy } from '../assets/core';
import type { RC } from '../assets/core';

const CELL = 96;

/** 格心相对包围盒中心的画布口径偏移（y 向下） */
function cellCenterOffsets(cells: readonly RC[]): Array<{ x: number; y: number }> {
  const rs = cells.map((c) => c[0]);
  const cs = cells.map((c) => c[1]);
  const rows = Math.max(...rs) + 1;
  const cols = Math.max(...cs) + 1;
  return cells.map(([r, c]) => ({
    x: (c + 0.5) * CELL - (cols * CELL) / 2,
    y: (r + 0.5) * CELL - (rows * CELL) / 2,
  }));
}

function sameSet(
  a: ReadonlyArray<{ x: number; y: number }>,
  b: ReadonlyArray<{ x: number; y: number }>,
): boolean {
  if (a.length !== b.length) return false;
  const key = (p: { x: number; y: number }) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
  const sb = new Set(b.map(key));
  return a.every((p) => sb.has(key(p)));
}

describe('rotatedCenterOffset（M4-6 真图旋转偏移）', () => {
  it('四向显式映射：画布口径（y 向下）的屏幕顺时针旋转', () => {
    expect(rotatedCenterOffset(3, 5, 0)).toEqual({ x: 3, y: 5 });
    // 右 (3,5) →  (−dy, dx)
    expect(rotatedCenterOffset(3, 5, 1)).toEqual({ x: -5, y: 3 });
    // 180°
    expect(rotatedCenterOffset(3, 5, 2)).toEqual({ x: -3, y: -5 });
    // 270° CW = 90° CCW
    expect(rotatedCenterOffset(3, 5, 3)).toEqual({ x: 5, y: -3 });
    // 取模 4 与负值归一
    expect(rotatedCenterOffset(3, 5, 4)).toEqual({ x: 3, y: 5 });
    expect(rotatedCenterOffset(3, 5, -1)).toEqual({ x: 5, y: -3 });
  });

  it('轴向向量：右→下→左→上（屏幕顺时针，与 rotateCW 同向）', () => {
    expect(rotatedCenterOffset(1, 0, 1)).toEqual({ x: 0, y: 1 }); // 右 → 下
    expect(rotatedCenterOffset(0, 1, 1)).toEqual({ x: -1, y: 0 }); // 下 → 左
    expect(rotatedCenterOffset(-1, 0, 1)).toEqual({ x: 0, y: -1 }); // 左 → 上
    expect(rotatedCenterOffset(0, -1, 1)).toEqual({ x: 1, y: 0 }); // 上 → 右
  });

  // 异形样本：L（2×2 缺角）、T（2×3）、S/Z（2×3）、斜杠（3×2）、单格、横/竖条
  const shapes: Record<string, RC[]> = {
    'L 2×2': [
      [0, 0],
      [0, 1],
      [1, 0],
    ],
    'T 2×3': [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
    'S 2×3': [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
    ],
    '斜杠 3×2': [
      [0, 1],
      [1, 0],
      [2, 1],
    ],
    单格: [[0, 0]],
    横条: [
      [0, 0],
      [0, 1],
    ],
    竖条: [
      [0, 0],
      [1, 0],
    ],
    'L5 长裙 3×3': [
      [0, 2],
      [1, 2],
      [2, 0],
      [2, 1],
      [2, 2],
    ],
  };

  for (const [name, cells] of Object.entries(shapes)) {
    it(`与 cells 旋转同向：${name}（四个朝向）`, () => {
      for (let turns = 0; turns < 4; turns++) {
        const rotatedOffsets = cellCenterOffsets(cells).map((p) => rotatedCenterOffset(p.x, p.y, turns));
        const expected = cellCenterOffsets(rotateBy(cells, turns));
        expect(sameSet(rotatedOffsets, expected), `${name} turns=${turns}`).toBe(true);
      }
    });
  }
});
