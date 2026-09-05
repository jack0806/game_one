"""素材入库回归：色键软边与跨行关键姿势，使用合成色块而不是游戏素材。"""
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from import_animation import decode_sheet, import_sheet


class AnimationImportTests(unittest.TestCase):
    def test_边缘连通洋红键保留身体内部同色毒核(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'magenta-organ.png'
            image = Image.new('RGB', (32, 32), (238, 12, 235))
            image.paste((35, 45, 70), (7, 7, 25, 25))
            image.paste((230, 15, 225), (12, 12, 20, 20))
            image.save(source)
            decoded = decode_sheet(source, 'ff00ff', edge_chroma=True)
            self.assertEqual(decoded.getpixel((0, 0)), (0, 0, 0, 0))
            self.assertEqual(decoded.getpixel((15, 15)), (230, 15, 225, 255))
            self.assertEqual(decoded.getpixel((8, 8))[3], 255)

    def test_洋红底上的半透明绿刃不会被误判成不透明粉边(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'green-edge.png'
            image = Image.new('RGB', (24, 24), (250, 0, 240))
            image.paste((70, 240, 10), (6, 6, 18, 18))
            image.paste((160, 120, 125), (5, 7, 6, 17))
            image.save(source)
            decoded = decode_sheet(source, 'ff00ff', soft_matte=True)
            self.assertEqual(decoded.getpixel((0, 0)), (0, 0, 0, 0))
            self.assertEqual(decoded.getpixel((10, 10)), (70, 240, 10, 255))
            edge = decoded.getpixel((5, 10))
            self.assertLessEqual(abs(edge[3] - 128), 1)
            for actual, expected in zip(edge[:3], (70, 240, 10)):
                self.assertLessEqual(abs(actual - expected), 2)

    def test_绿色键保留紫色主体并还原半透明软边(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'green.png'
            image = Image.new('RGB', (16, 16), (0, 245, 0))
            image.paste((140, 20, 180), (4, 4, 12, 12))
            image.paste((70, 132, 90), (3, 4, 4, 12))
            image.save(source)
            decoded = decode_sheet(source, '00ff00')
            self.assertEqual(decoded.getpixel((0, 0)), (0, 0, 0, 0))
            self.assertEqual(decoded.getpixel((6, 6)), (140, 20, 180, 255))
            edge = decoded.getpixel((3, 6))
            self.assertLessEqual(abs(edge[3] - 128), 1)
            for actual, expected in zip(edge[:3], (140, 20, 180)):
                self.assertLessEqual(abs(actual - expected), 2)

    def test_逐格上下界保住越过整行分界的起跳头顶(self):
        with tempfile.TemporaryDirectory() as directory:
            source, target = Path(directory) / 'poses.png', Path(directory) / 'atlas.png'
            image = Image.new('RGBA', (80, 50))
            for column in range(4):
                left = column * 20 + 6
                image.paste((200, 80, 160, 255), (left, 3, left + 8, 18 if column == 2 else 23))
                image.paste((80, 160, 200, 255), (left, 22 if column == 2 else 30, left + 8, 43 if column == 2 else 48))
            image.save(source)
            report = import_sheet(source, target, 4, 2, 32, layout={
                'rowCuts': [0, 25, 50], 'baselines': [23, 48], 'targetBaseline': 29,
                'rowBounds': {'0:2': [0, 20], '1:2': [20, 50]},
            })
            atlas = Image.open(target)
            self.assertEqual(atlas.size, (128, 64))
            self.assertEqual(atlas.getpixel((2 * 32 + 12, 32 + 3)), (80, 160, 200, 255))
            self.assertEqual(sum(cell['edgePixels'] for cell in report['cells']), 0)

    def test_整图连通分离不会把跨横纵网格的主体混入相邻动作(self):
        with tempfile.TemporaryDirectory() as directory:
            source, target = Path(directory) / 'overlap.png', Path(directory) / 'atlas.png'
            image = Image.new('RGBA', (130, 130))
            image.paste((220, 40, 40, 255), (35, 20, 70, 70))
            image.paste((40, 220, 40, 255), (75, 20, 115, 60))
            image.paste((40, 40, 220, 255), (20, 75, 60, 115))
            image.paste((220, 220, 40, 255), (65, 75, 105, 115))
            image.paste((255, 255, 255, 255), (71, 66, 74, 69))
            image.save(source)
            report = import_sheet(source, target, 2, 2, 96, layout={
                'rowCuts': [0, 65, 130], 'baselines': [70, 115], 'targetBaseline': 80,
                'columnCuts': {'0': [0, 65, 130], '1': [0, 65, 130]},
                'isolatedGrid': True,
                'discardDetachedFragments': True,
            })
            atlas = Image.open(target)
            expected = [(220, 40, 40), (40, 220, 40), (40, 40, 220), (220, 220, 40)]
            for index, color in enumerate(expected):
                x, y = (index % 2) * 96, (index // 2) * 96
                colors = {pixel[:3] for pixel in atlas.crop((x, y, x + 96, y + 96)).getdata() if pixel[3]}
                self.assertEqual(colors, {color})
            self.assertEqual(sum(cell['edgePixels'] for cell in report['cells']), 0)

    def test_显式阈值只清除断开的色键碎线(self):
        with tempfile.TemporaryDirectory() as directory:
            source, target = Path(directory) / 'fragment.png', Path(directory) / 'atlas.png'
            image = Image.new('RGBA', (32, 32))
            image.paste((40, 160, 220, 255), (8, 8, 22, 26))
            image.paste((255, 255, 255, 255), (28, 14, 30, 18))
            image.save(source)
            import_sheet(source, target, 1, 1, 32, layout={
                'rowCuts': [0, 32], 'baselines': [26], 'targetBaseline': 26,
                'discardDetachedComponentsUnder': 12,
            })
            atlas = Image.open(target)
            self.assertEqual(atlas.getpixel((15, 15)), (40, 160, 220, 255))
            self.assertEqual(atlas.getpixel((29, 15)), (0, 0, 0, 0))


if __name__ == '__main__':
    unittest.main()
