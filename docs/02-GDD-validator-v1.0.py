#!/usr/bin/env python3
"""《行李箱装不下啦！》GDD 关卡数据离线验证器（适配 schemaVersion 1.1）。
用法：python 02-GDD-validator-v1.0.py [02-GDD-levels-v1.0.json]
只依赖 Python 3 标准库。验证静态数据、标准解、旋转性质与是否可解。
"""
from __future__ import annotations
import json
import sys
from pathlib import Path


def normalize(cells):
    assert cells and len(set(map(tuple, cells))) == len(cells), "形状不能为空，坐标不能重复"
    assert all(isinstance(r, int) and isinstance(c, int) for r, c in cells), "坐标必须为整数"
    min_r, min_c = min(r for r, _ in cells), min(c for _, c in cells)
    return tuple(sorted((r-min_r, c-min_c) for r, c in cells))


def rotate(cells):
    return normalize([(c, -r) for r, c in cells])


def rotate_n(cells, n):
    a = normalize(cells)
    for _ in range(n % 4):
        a = rotate(a)
    return a


def is_connected(cells):
    shape = set(map(tuple, cells))
    if not shape:
        return False
    visited = {next(iter(shape))}
    pending = list(visited)
    while pending:
        r, c = pending.pop()
        for neighbor in ((r-1,c), (r+1,c), (r,c-1), (r,c+1)):
            if neighbor in shape and neighbor not in visited:
                visited.add(neighbor)
                pending.append(neighbor)
    return len(visited) == len(shape)


def variants(item, allow_rotation=True):
    base = normalize(item['cells'])
    result = [base]
    if allow_rotation and item['rotatable']:
        for i in range(1, 4):
            new = rotate_n(base, i)
            if new not in result:
                result.append(new)
    return result


def placement_mask(shape, row, col, rows, cols, obstacles):
    mask = 0
    for dr, dc in shape:
        r, c = row+dr, col+dc
        if not (0 <= r < rows and 0 <= c < cols) or (r,c) in obstacles:
            return None
        mask |= 1 << (r*cols+c)
    return mask


def exists_solution(level, allow_rotation=True):
    board = level['board']
    rows, cols = board['rows'], board['cols']
    obstacles = {tuple(x) for x in board['blockedCells']}
    options = []
    for item in level['items']:
        possible = []
        for shape in variants(item, allow_rotation):
            h = max(r for r,c in shape) + 1
            w = max(c for r,c in shape) + 1
            for row in range(rows-h+1):
                for col in range(cols-w+1):
                    mask = placement_mask(shape, row, col, rows, cols, obstacles)
                    if mask is not None:
                        possible.append(mask)
        if not possible:
            return False
        options.append(set(possible))
    # 先处理候选位置最少的物品；用 bitset 确保同一格最多放一件
    options.sort(key=len)
    def search(i, occupied):
        if i == len(options):
            return True
        return any(search(i+1, occupied|mask) for mask in options[i] if not (mask & occupied))
    return search(0, 0)


def verify_level(level):
    level_id = level['levelId']
    board = level['board']
    rows, cols = board['rows'], board['cols']
    assert isinstance(rows, int) and isinstance(cols, int) and rows > 0 and cols > 0
    obstacles = {tuple(x) for x in board['blockedCells']}
    assert len(obstacles) == len(board['blockedCells']), '障碍格重复'
    assert all(0 <= r < rows and 0 <= c < cols for r,c in obstacles), '障碍越界'
    items = level['items']
    assert items, '缺失必需物品'
    item_ids = [item['id'] for item in items]
    assert len(set(item_ids)) == len(item_ids), '物品实例 ID 重复'
    orders = [it['trayOrder'] for it in items]
    assert sorted(orders) == list(range(1,len(items)+1)), '托盘顺序不连续'
    for item in items:
        shape = normalize(item['cells'])
        assert list(map(tuple,item['cells'])) == list(shape), '物品形状需排序且归一化'
        assert is_connected(shape), f'{item["id"]} 形状不连通'
        assert item['initialRotation'] == 0, '本 schema 初始形状已体现在 cells 中，initialRotation 应为 0'
        assert item['id'].startswith(f'L{level_id:02d}_'), '实例 ID 与关卡不一致'

    assert len(level['solution']) == len(items), '标准解不完整'
    by_id = {it['id']: it for it in items}
    placed_ids = set()
    occupied = set(obstacles)
    witness_canvas = [['.' for _ in range(cols)] for _ in range(rows)]
    for r,c in obstacles:
        witness_canvas[r][c] = '#'
    for place in level['solution']:
        pid = place['itemId']
        assert pid in by_id and pid not in placed_ids, '标准解 ID 不合法或重复'
        placed_ids.add(pid)
        item = by_id[pid]
        orientation = place['rotation']
        assert isinstance(orientation, int) and 0 <= orientation <= 3
        assert item['rotatable'] or orientation == 0, '不可旋转物品被旋转'
        shape = rotate_n(item['cells'], orientation)
        row, col = place['row'], place['col']
        for dr, dc in shape:
            r, c = row+dr, col+dc
            assert 0 <= r < rows and 0 <= c < cols, '标准解越界'
            assert (r,c) not in occupied, '标准解与障碍或其他物品碰撞'
            occupied.add((r,c))
            witness_canvas[r][c] = pid.split('_')[-1]
    assert placed_ids == set(item_ids), '标准解遗漏物品'
    assert witness_canvas == [list(s) for s in level['solutionGrid']], '标准解图示与摆放坐标不一致'
    assert exists_solution(level), '求解器判断无解'
    if level_id == 3:
        assert not exists_solution(level, allow_rotation=False), '第 3 关未满足必须旋转的教学约束'
    return rows*cols, len(items), len(occupied), len(obstacles)


def main(path):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    assert data['schemaVersion'] == '1.1', 'schemaVersion 应为 1.1（V1.1 难度校准后的关卡数据）'
    levels = data['levels']
    assert len(levels) == 10, 'MVP 应有 10 关'
    assert [lv['levelId'] for lv in levels] == list(range(1,11))
    for lv in levels:
        cells, count, used, blocked = verify_level(lv)
        print(f'PASS L{lv["levelId"]:02d}: {lv["title"]}  '
              f'棋盘={lv["board"]["rows"]}x{lv["board"]["cols"]} '
              f'物品={count} 障碍={blocked} 余格={cells-used} 标准解=有效 可解=是')
    print('PASS: 10/10 关通过校验；第 3 关要求至少一次旋转。')
    print()
    print('难度代理指标（参考值，非玩家实测；big = 大件优先随机落位一次放完的成功率，N=1500）：')
    for lv in levels:
        b = lv['board']
        tot = sum(len(it['cells']) for it in lv['items'])
        free = b['rows'] * b['cols'] - len(b['blockedCells'])
        v = lv['verification']
        n = v['solutionsFound']
        print(f'  L{lv["levelId"]:02d} 填充={tot}/{free} 留白={free - tot} '
              f'解数={"≥" if v["solutionCountCapped"] else ""}{n}')


if __name__ == '__main__':
    if len(sys.argv) > 2:
        raise SystemExit('用法: python 02-GDD-validator-v1.0.py [关卡 JSON 路径]')
    file_path = sys.argv[1] if len(sys.argv) == 2 else str(Path(__file__).with_name('02-GDD-levels-v1.0.json'))
    main(file_path)
