/**
 * 形状代数单测（TDD 6.1 的四条硬性断言 + 边界）。
 */

import { describe, expect, it } from 'vitest';

import {
  bboxOf,
  cellsToKey,
  hasDuplicates,
  isConnected,
  normalize,
  rotateBy,
  rotateCW,
  rotationVariants,
} from '../assets/core/geometry/shape';
import type { RC } from '../assets/core/model/types';

const L3: RC[] = [
  [0, 0],
  [1, 0],
  [1, 1],
];
const I3: RC[] = [
  [0, 0],
  [0, 1],
  [0, 2],
];
const O4: RC[] = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
];

describe('normalize', () => {
  it('平移到左上角并按字典序排序', () => {
    expect(normalize([[3, 4], [3, 5], [4, 4]])).toEqual([[0, 0], [0, 1], [1, 0]]);
  });

  it('已归一化的输入保持不变', () => {
    expect(normalize(L3)).toEqual(L3);
  });

  it('空输入返回空数组', () => {
    expect(normalize([])).toEqual([]);
  });
});

describe('rotateCW', () => {
  it('顺时针 90°：L 形的具体坐标', () => {
    // (0,0) (1,0) (1,1) 顺时针转 → 应得 (0,0) (0,1) (1,0) 这一族
    expect(rotateCW(L3)).toEqual([[0, 0], [0, 1], [1, 0]]);
  });

  it('顺时针 4 次回到原点', () => {
    let shape = L3;
    for (let i = 0; i < 4; i++) shape = rotateCW(shape);
    expect(shape).toEqual(normalize(L3));
  });

  it('长条旋转后长宽互换', () => {
    expect(bboxOf(rotateCW(I3))).toMatchObject({ height: 3, width: 1 });
  });
});

describe('rotateBy', () => {
  it('rotateBy(cells, 4) 与 normalize 完全相等', () => {
    expect(rotateBy(L3, 4)).toEqual(normalize(L3));
  });

  it('rotateBy 与逐次 rotateCW 结果一致', () => {
    for (const n of [0, 1, 2, 3] as const) {
      let expected = normalize(L3);
      for (let i = 0; i < n; i++) expected = rotateCW(expected);
      expect(rotateBy(L3, n)).toEqual(expected);
    }
  });

  it('负数与超范围 n 按模 4 处理', () => {
    expect(rotateBy(L3, -1)).toEqual(rotateBy(L3, 3));
    expect(rotateBy(L3, 7)).toEqual(rotateBy(L3, 3));
  });

  it('旋转不产生镜像（用具体坐标断言，不只比格数）', () => {
    // 必须用**四格** L 型：三格 L 与它的镜像在旋转下其实是同一个形状
    //（三格只有 I 和 L 两种自由形状），用三格测不出镜像，会得到一个永远通过的假测试。
    const L4: RC[] = [[0, 0], [1, 0], [2, 0], [2, 1]];
    const mirrorOfL4: RC[] = [[0, 1], [1, 1], [2, 0], [2, 1]];
    expect(isConnected(L4)).toBe(true);

    const produced = ([0, 1, 2, 3] as const).map((n) => cellsToKey(rotateBy(L4, n)));
    expect(new Set(produced).size).toBe(4); // 四种旋转互不相同
    for (const key of produced) {
      expect(key).not.toBe(cellsToKey(mirrorOfL4));
    }
  });

  it('旋转后仍是 4 连通（防御性断言）', () => {
    for (const n of [0, 1, 2, 3] as const) {
      expect(isConnected(rotateBy(L3, n))).toBe(true);
    }
  });
});

describe('rotationVariants', () => {
  it('正方形去重后只剩一个朝向', () => {
    expect(rotationVariants(O4, true)).toHaveLength(1);
  });

  it('1×2 长条有 2 个朝向', () => {
    expect(rotationVariants([[0, 0], [0, 1]], true)).toHaveLength(2);
  });

  it('不可旋转的物品只返回朝向 0', () => {
    const variants = rotationVariants(L3, false);
    expect(variants).toHaveLength(1);
    expect(variants[0].rotation).toBe(0);
  });

  it('去重只用于算法——不能据此判断"物品不该允许旋转"', () => {
    // 这一条是防止有人把 rotationVariants().length === 1 当成"禁用旋转按钮"的依据。
    // 正方形的变体数确实是 1，但 ItemSpec.rotatable 仍然是 true。
    const variants = rotationVariants(O4, true);
    expect(variants).toHaveLength(1);
    expect(variants[0].rotation).toBe(0);
  });
});

describe('isConnected / hasDuplicates', () => {
  it('断裂形状被识别', () => {
    expect(isConnected([[0, 0], [0, 2]])).toBe(false);
  });

  it('对角相邻不算连通', () => {
    expect(isConnected([[0, 0], [1, 1]])).toBe(false);
  });

  it('重复格被识别', () => {
    expect(hasDuplicates([[0, 0], [0, 0]])).toBe(true);
    expect(isConnected([[0, 0], [0, 0]])).toBe(false);
  });

  it('单格是连通的', () => {
    expect(isConnected([[0, 0]])).toBe(true);
  });
});

describe('bboxOf', () => {
  it('返回正确的包围盒', () => {
    expect(bboxOf([[0, 0], [2, 3]])).toEqual({ height: 3, width: 4, maxRow: 2, maxCol: 3 });
  });
});
