"""逐帧素材入库：统一整张画布、解码色键/透明通道，不逐帧裁边或拉伸身体。"""
import argparse
import json
from pathlib import Path
from PIL import Image
import numpy as np


def isolate_row(pixels, columns):
    """按连通主体分离同一行的姿势；只分配源像素，不重画、补肢体或变形。"""
    from scipy import ndimage
    labels, count = ndimage.label(pixels[:, :, 3] > 8, np.ones((3, 3)))
    areas = np.bincount(labels.ravel())
    main = sorted(range(1, count + 1), key=lambda n: int(areas[n]), reverse=True)[:columns]
    if len(main) != columns or min(areas[n] for n in main) < 1000:
        raise ValueError('未找到一行完整的独立主体，禁止猜测缺失肢体')
    centers = ndimage.center_of_mass(pixels[:, :, 3] > 8, labels, range(1, count + 1))
    main.sort(key=lambda n: centers[n - 1][1])
    groups = {n: [n] for n in main}
    for n in range(1, count + 1):
        if n in groups:
            continue
        # 小片边缘仍归属最近主体，保留披风细丝与独立落地武器；随后必须视觉核对。
        owner = min(main, key=lambda m: sum((a - b) ** 2 for a, b in zip(centers[n - 1], centers[m - 1])))
        groups[owner].append(n)
    result = []
    for n in main:
        keep = np.isin(labels, groups[n])
        keep = ndimage.binary_dilation(keep, iterations=2) & ((labels == 0) | keep)
        isolated = pixels.copy()
        isolated[~keep] = 0
        result.append(Image.fromarray(isolated))
    return result


def isolate_grid(pixels, columns, rows, discard_fragment_rows=()):
    """整张图按连通主体分离，处理动作轮廓同时越过横纵等分线的生成稿。"""
    from scipy import ndimage
    labels, count = ndimage.label(pixels[:, :, 3] > 8, np.ones((3, 3)))
    areas = np.bincount(labels.ravel())
    wanted = columns * rows
    main = sorted(range(1, count + 1), key=lambda n: int(areas[n]), reverse=True)[:wanted]
    if len(main) != wanted or min(areas[n] for n in main) < 1000:
        raise ValueError('未找到整张图中全部独立主体，禁止猜测缺失动作')
    centers = ndimage.center_of_mass(pixels[:, :, 3] > 8, labels, range(1, count + 1))
    # 先按纵坐标分成动作行，再在每行按横坐标排序，避免倒地宽姿势打乱列次序。
    main.sort(key=lambda n: centers[n - 1][0])
    ordered = []
    for row in range(rows):
        group = main[row * columns:(row + 1) * columns]
        group.sort(key=lambda n: centers[n - 1][1])
        ordered.extend(group)
    groups = {n: [n] for n in ordered}
    height, width = pixels.shape[:2]
    for n in range(1, count + 1):
        if n in groups:
            continue
        cy, cx = centers[n - 1]
        owner = min(ordered, key=lambda m: (
            (cy - centers[m - 1][0]) ** 2 / max(1, height) ** 2
            + (cx - centers[m - 1][1]) ** 2 / max(1, width) ** 2
        ))
        if ordered.index(owner) // columns not in discard_fragment_rows:
            groups[owner].append(n)
    result = []
    for n in ordered:
        keep = np.isin(labels, groups[n])
        keep = ndimage.binary_dilation(keep, iterations=2) & ((labels == 0) | keep)
        isolated = pixels.copy()
        isolated[~keep] = 0
        result.append(Image.fromarray(isolated))
    return [result[row * columns:(row + 1) * columns] for row in range(rows)]


def decode_sheet(source, chroma=None, soft_matte=False, edge_chroma=False):
    image = Image.open(source).convert('RGBA')
    pixels = np.asarray(image).copy()
    if chroma:
        key = np.array([int(chroma[i:i + 2], 16) for i in (0, 2, 4)])
        rgb = pixels[:, :, :3].astype(float)
        # 色键必须显式指定。软边以与色键的距离还原覆盖率，再去除边缘串色。
        if edge_chroma:
            # 角色本身可能包含与背景相同的高饱和颜色（毒核、霓虹器官）。
            # 只删除从画布边缘可达的色键区域，封闭在身体轮廓内的同色像素保留。
            from scipy import ndimage
            if chroma.lower() != 'ff00ff':
                raise ValueError('边缘连通色键目前只支持明确的洋红背景')
            excess = np.minimum(rgb[:, :, 0], rgb[:, :, 2]) - rgb[:, :, 1]
            candidate = (rgb[:, :, 0] > 140) & (rgb[:, :, 2] > 140) & (rgb[:, :, 1] < 125) & (excess > 90)
            labels, _ = ndimage.label(candidate, np.ones((3, 3)))
            edge_labels = np.unique(np.concatenate((labels[0], labels[-1], labels[:, 0], labels[:, -1])))
            edge_labels = edge_labels[edge_labels != 0]
            background = np.isin(labels, edge_labels)
            if not np.any(background):
                raise ValueError('没有找到与画布边缘连通的洋红背景')
            alpha = np.ones(excess.shape, dtype=float)
            alpha[background] = 0
            # 生成稿已有深色轮廓；边界使用二值遮罩可避免对角色的紫色软边
            # 做错误的洋红反混合，从而产生绿色或青色杂边。
        elif soft_matte:
            # 互补色特效的软边不能假设前景为中性灰。用明确前景内部颜色
            # 解算 C = alpha*F + (1-alpha)*K，避免绿刃留下洋红轮廓。
            from scipy import ndimage
            if chroma.lower() == 'ff00ff':
                excess = np.minimum(rgb[:, :, 0], rgb[:, :, 2]) - rgb[:, :, 1]
            elif chroma.lower() == '00ff00':
                excess = rgb[:, :, 1] - np.maximum(rgb[:, :, 0], rgb[:, :, 2])
            else:
                raise ValueError('软边解码仅支持明确的洋红/绿色键')
            background = excess > 200
            foreground = ndimage.binary_erosion(excess <= 5, iterations=2)
            if not np.any(background) or not np.any(foreground):
                raise ValueError('软边解码缺少明确背景或前景内部')
            key = np.median(rgb[background], axis=0)
            nearest = ndimage.distance_transform_edt(~foreground, return_distances=False, return_indices=True)
            estimate = rgb[nearest[0], nearest[1]]
            delta = estimate - key
            alpha = np.clip(np.sum((rgb-key)*delta, axis=2) / np.maximum(1, np.sum(delta*delta, axis=2)), 0, 1)
            alpha[foreground] = 1
            alpha[background | (alpha < 0.03)] = 0
        elif chroma.lower() == '00ff00':
            # 紫色本体不能使用洋红键。绿色键只用于明确不含绿色的角色；
            # 用邻近不受色键污染的前景估计软边覆盖率，避免留下荧光绿轮廓。
            from scipy import ndimage
            green_excess = rgb[:, :, 1] - np.maximum(rgb[:, :, 0], rgb[:, :, 2])
            background = (green_excess > 120) & (rgb[:, :, 1] > 150)
            if not np.any(background):
                raise ValueError('没有找到约定的绿色背景，不得猜测透明通道')
            key = np.median(rgb[background], axis=0)
            foreground = green_excess <= 5
            if not np.any(foreground):
                raise ValueError('绿色源图没有有效前景')
            nearest = ndimage.distance_transform_edt(~foreground, return_distances=False, return_indices=True)
            estimate = rgb[nearest[0], nearest[1]]
            delta = estimate - key
            alpha = np.clip(np.sum((rgb - key) * delta, axis=2) / np.maximum(1, np.sum(delta * delta, axis=2)), 0, 1)
            alpha[foreground] = 1
            alpha[background | (alpha < 0.08)] = 0
        elif chroma.lower() == 'ff00ff':
            # 本批角色无洋红配色：洋红超量就是背景覆盖率，灰烟可恢复为中性灰。
            alpha = 1 - np.clip((np.minimum(rgb[:, :, 0], rgb[:, :, 2]) - rgb[:, :, 1]) / 255, 0, 1)
            alpha[alpha < 0.08] = 0
            # 生成的“纯色”背景存在轻微压缩/色调误差，明确洋红区域应完全透明。
            magenta = (rgb[:, :, 0] > 150) & (rgb[:, :, 2] > 150) & (rgb[:, :, 1] < 100)
            magenta &= np.minimum(rgb[:, :, 0], rgb[:, :, 2]) - rgb[:, :, 1] > 120
            alpha[magenta] = 0
        else:
            distance = np.max(np.abs(rgb - key), axis=2)
            alpha = np.clip((distance - 35) / 110, 0, 1)
        pixels[:, :, 3] = np.minimum(pixels[:, :, 3], np.rint(alpha * 255)).astype('uint8')
        edge = (alpha > 0) & (alpha < 1)
        rgb[edge] = np.clip((rgb[edge] - key * (1 - alpha[edge, None])) / alpha[edge, None], 0, 255)
        if chroma.lower() == '00ff00':
            # 只抑制已解码软边的残余绿串色；实心前景和紫色纹理保持原样。
            rgb[:, :, 1][edge] = np.minimum(rgb[:, :, 1][edge], np.maximum(rgb[:, :, 0][edge], rgb[:, :, 2][edge]))
        pixels[:, :, :3] = rgb.astype('uint8')
        pixels[pixels[:, :, 3] == 0, :3] = 0
    elif pixels[:, :, 3].min() == 255:
        raise ValueError('源图没有透明通道。禁止把烧录棋盘格当透明图入库。')
    return Image.fromarray(pixels)


def import_sheet(source, destination, columns, rows, cell_size, chroma=None, layout=None, soft_matte=False,
                 edge_chroma=False):
    decoded = decode_sheet(source, chroma, soft_matte, edge_chroma)
    pixels = np.asarray(decoded)
    image = decoded
    if layout and layout.get('removeEdgeWhiteGrid'):
        # 部分生成稿用纯白分隔线围住每格，导致格内色键背景不再与画布边缘连通。
        # 只删除与整张画布边缘相连的近白像素；主体内部高光保持不变。
        from scipy import ndimage
        pixels = pixels.copy()
        white = (pixels[:, :, :3] > 200).all(axis=2) & (pixels[:, :, 3] > 8)
        labels, _ = ndimage.label(white, np.ones((3, 3)))
        grid_labels = []
        for label, bounds in enumerate(ndimage.find_objects(labels), 1):
            if bounds is None:
                continue
            height = bounds[0].stop - bounds[0].start
            width = bounds[1].stop - bounds[1].start
            if width > pixels.shape[1] / 2 or height > pixels.shape[0] / 2:
                grid_labels.append(label)
        if not grid_labels:
            raise ValueError('没有找到贯穿画布的白色分格线')
        grid = ndimage.binary_dilation(np.isin(labels, grid_labels), iterations=2)
        pixels[grid] = 0
        image = Image.fromarray(pixels)
        decoded = image
    target = (columns * cell_size, rows * cell_size)
    if not layout and abs(image.width / image.height - target[0] / target[1]) > 0.005:
        raise ValueError('源图宽高比不匹配网格；不得拉伸人物来凑尺寸。')
    if layout:
        # 生成稿可能有不等高的行。只按人工标定的行边界切片和共同基线排版，
        # 不按每帧包围盒居中、不改变肢体、不抹掉跳跃的高度变化。
        if len(layout['rowCuts']) != rows + 1 or len(layout['baselines']) != rows:
            raise ValueError('行边界和基线数量不匹配')
        image = Image.new('RGBA', target)
        scale = layout.get('scale', 1)
        if layout.get('isolatedGrid') and layout.get('isolatedRows'):
            raise ValueError('整图连通分离不能与逐行连通分离同时启用')
        discard_rows = set(range(rows)) if layout.get('discardDetachedFragments', False) else set(
            layout.get('discardDetachedFragmentRows', [])
        )
        grid_isolated = isolate_grid(pixels, columns, rows, discard_rows) if layout.get('isolatedGrid') else None
        # 修正稿只取明确验收过的那一格，避免整张替换时连带改坏其他姿势。
        # 仍是原始生成帧的切片和装箱，不合成肢体或生成运动插帧。
        overrides = {}
        for item in layout.get('frameOverrides', []):
            alternative = decode_sheet(Path(source).parent / item['source'], chroma, soft_matte, edge_chroma)
            if alternative.size != decoded.size:
                raise ValueError('替换帧源图尺寸不一致，须先重新标定而不能拉伸')
            if item['row'] in layout.get('isolatedRows', []):
                raise ValueError('连通分离行暂不支持逐格替换，请使用单独的动作图集')
            overrides[item['row'], item['column']] = alternative
        for row in range(rows):
            top, bottom = layout['rowCuts'][row:row + 2]
            source_columns = layout.get('sourceColumns', {}).get(str(row), columns)
            selection = layout.get('columnSelection', {}).get(str(row), list(range(columns)))
            if len(selection) != columns or len(set(selection)) != columns or any(c < 0 or c >= source_columns for c in selection):
                raise ValueError('原稿姿势选择必须明确、唯一且在该行数量范围内')
            isolated = isolate_row(pixels[top:bottom], source_columns) if row in layout.get('isolatedRows', []) else None
            for column in range(columns):
                source_column = selection[column]
                # 某一格起跳高度越过整行分界时，用人工逐格上下界保留完整头顶。
                # 仍以源图全局基线排版，不按包围盒重定位或缩放。
                top, bottom = layout['rowCuts'][row:row + 2]
                row_bounds = layout.get('rowBounds', {}).get(f'{row}:{column}')
                if row_bounds:
                    if isolated:
                        raise ValueError('同一格不能同时使用整行连通分离和独立上下界')
                    top, bottom = row_bounds
                    if not (0 <= top < bottom <= decoded.height):
                        raise ValueError('逐格上下界超出源图')
                cuts = layout.get('columnCuts', {}).get(str(row))
                left, right = cuts[source_column:source_column + 2] if cuts else (round(source_column * decoded.width / source_columns), round((source_column + 1) * decoded.width / source_columns))
                if grid_isolated:
                    original = grid_isolated[row][source_column]
                    source_bounds = original.getchannel('A').getbbox()
                    tile = original.crop(source_bounds)
                    source_left, source_top = source_bounds[:2]
                    x = round(cell_size / 2 + (source_left - (left + right) / 2) * scale)
                    y = round(layout['targetBaseline'] - (layout['baselines'][row] - source_top) * scale)
                elif isolated:
                    original = isolated[source_column]
                    source_bounds = original.getchannel('A').getbbox()
                    tile = original.crop(source_bounds)
                    source_left, source_top = source_bounds[:2]
                    x = round(cell_size / 2 + (source_left - (left + right) / 2) * scale)
                    y = round(layout['targetBaseline'] - (layout['baselines'][row] - top - source_top) * scale)
                else:
                    cell_source = overrides.get((row, column), decoded)
                    # 明确绘在单元格外沿的分隔线可以在装箱时剔除；不改变主体像素。
                    inset = layout.get('cellInset', 0)
                    tile = cell_source.crop((left + inset, top + inset, right - inset, bottom - inset))
                    x = round((cell_size - (right - left) * scale) / 2 + inset * scale)
                    y = round(layout['targetBaseline'] - (layout['baselines'][row] - top - inset) * scale)
                tile = tile.resize((round(tile.width * scale), round(tile.height * scale)), Image.Resampling.LANCZOS)
                # 个别色键生成稿会留下与主体完全断开的1~2像素亮线。仅在人工
                # 布局明确给出阈值时删除这些小连通块；武器、披风和相连特效不受影响。
                discard_under = layout.get('discardDetachedComponentsUnder', 0)
                if discard_under:
                    from scipy import ndimage
                    tile_pixels = np.asarray(tile).copy()
                    labels, label_count = ndimage.label(tile_pixels[:, :, 3] > 8, np.ones((3, 3)))
                    areas = np.bincount(labels.ravel())
                    small = [label for label in range(1, label_count + 1) if areas[label] < discard_under]
                    if small:
                        tile_pixels[np.isin(labels, small)] = 0
                        tile = Image.fromarray(tile_pixels)
                bounds = tile.getchannel('A').point(lambda v: 255 if v > 32 else 0).getbbox()
                if not bounds or min(x + bounds[0], y + bounds[1], cell_size - x - bounds[2], cell_size - y - bounds[3]) < 3:
                    raise ValueError(f'第{row + 1}行第{column + 1}列越界({x},{y},{bounds})：请调整标定，不得截断身体')
                cell = Image.new('RGBA', (cell_size, cell_size))
                cell.paste(tile, (x, y))
                image.paste(cell, (column * cell_size, row * cell_size))
    else:
        image = decoded.resize(target, Image.Resampling.LANCZOS)
    cells = []
    for row in range(rows):
        for column in range(columns):
            tile = image.crop((column * cell_size, row * cell_size,
                               (column + 1) * cell_size, (row + 1) * cell_size))
            alpha = np.asarray(tile)[:, :, 3]
            bounds = tile.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
            if not bounds or np.mean(alpha < 8) < 0.15:
                raise ValueError(f'第{row + 1}行第{column + 1}列缺少有效主体或透明边界')
            cells.append({'row': row, 'column': column, 'bounds': bounds,
                          'transparentRatio': round(float(np.mean(alpha < 8)), 4),
                          'edgePixels': int(np.count_nonzero(alpha[[0, -1], :] > 32) + np.count_nonzero(alpha[:, [0, -1]] > 32))})
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination)
    return {'source': Path(source).name, 'output': destination.name, 'size': target,
            'columns': columns, 'rows': rows, 'cells': cells, 'layout': layout, 'softMatte': soft_matte,
            'visualReview': 'pending', 'note': '像素检查不代表动作质量、锚点与循环衔接已经验收'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source')
    parser.add_argument('destination')
    parser.add_argument('--columns', type=int, required=True)
    parser.add_argument('--rows', type=int, required=True)
    parser.add_argument('--cell-size', type=int, default=256)
    parser.add_argument('--chroma', help='生成阶段约定的六位RGB色键，不带#')
    parser.add_argument('--soft-matte', action='store_true', help='为互补色特效解算软边覆盖率，须先检查原稿颜色')
    parser.add_argument('--edge-chroma', action='store_true', help='只移除与画布边缘连通的洋红色键，保留角色内部同色器官')
    parser.add_argument('--report', required=True)
    parser.add_argument('--layout', help='人工标定行边界/共同脚底基线的JSON；不会单独缩放某一帧')
    args = parser.parse_args()
    report = import_sheet(args.source, args.destination, args.columns, args.rows,
                          args.cell_size, args.chroma,
                          json.loads(Path(args.layout).read_text(encoding='utf-8')) if args.layout else None,
                          args.soft_matte, args.edge_chroma)
    Path(args.report).parent.mkdir(parents=True, exist_ok=True)
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'{report["output"]}: {len(report["cells"])} 帧，透明通道检查通过，动作视觉验收待完成')
