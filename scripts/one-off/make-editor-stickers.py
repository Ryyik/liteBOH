"""把 Downloads 里「完好的猫」（实心白 + 白色矩形底）转成可用的编辑贴纸。

做法不是按颜色抠白（白猫身与白底同色，一抠就把身体掏空 —— 已实测），
而是先定出「猫的轮廓」，再按轮廓重建像素：

  1. 内容像素 = 非近白（黑描边 / 腮红 / 道具 / 灰影）
  2. 取最大连通块（猫本体），用「径向分位数」剔掉离群点（零星装饰会把凸包撑歪）
  3. 凸包 + Chaikin 平滑 + 外扩 3px，得到轮廓多边形（按 4× 超采样抗锯齿）
  4. 轮廓内一律填白（这就是身体），轮廓外只保留内容像素（描边、心形、腮红）
     ⇒ 白色矩形底消失，猫身实心、可遮挡。

一次性脚本：产物进 src/assets/images/editor-stickers/，不回写原素材。
"""
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SRC_DIR = Path.home() / 'Downloads/03_图片素材/猫图'
OUT_DIR = Path('src/assets/images/editor-stickers')
WHITE_THRESHOLD = 235
SUPERSAMPLE = 4
MARGIN_PX = 3


def convex_hull(points):
    pts = sorted(set(points))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def chaikin(points, rounds=2):
    for _ in range(rounds):
        out = []
        for i, p in enumerate(points):
            q = points[(i + 1) % len(points)]
            out.append((0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]))
            out.append((0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]))
        points = out
    return points


def robust_hull(points):
    """去掉离群点再求凸包：按到质心的距离取 97% 分位，超出者丢弃。"""
    if not points:
        return []
    cx = sum(p[0] for p in points) / len(points)
    cy = sum(p[1] for p in points) / len(points)
    dists = sorted(((p[0] - cx) ** 2 + (p[1] - cy) ** 2) ** 0.5 for p in points)
    limit = dists[int(len(dists) * 0.97)]
    kept = [p for p in points if ((p[0] - cx) ** 2 + (p[1] - cy) ** 2) ** 0.5 <= limit]
    return convex_hull(kept or points)


def grouped_components(content, width, height, radius=3):
    """把相距 < 2×radius 的笔画归到同一只猫，返回每组的内容像素坐标。"""
    ink = Image.new('L', (width, height), 0)
    ink_px = ink.load()
    for y in range(height):
        for x in range(width):
            if content[y][x]:
                ink_px[x, y] = 255
    grown = ink.filter(ImageFilter.MaxFilter(radius * 2 + 1))
    grown_px = grown.load()
    seen = [[False] * width for _ in range(height)]
    groups = []
    for y in range(height):
        for x in range(width):
            if grown_px[x, y] == 0 or seen[y][x]:
                continue
            queue = deque([(x, y)])
            seen[y][x] = True
            pixels = []
            while queue:
                cx, cy = queue.popleft()
                if content[cy][cx]:
                    pixels.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < width and 0 <= ny < height and grown_px[nx, ny] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        queue.append((nx, ny))
            if pixels:
                groups.append(pixels)
    return groups


def all_components(content, width, height):
    seen = [[False] * width for _ in range(height)]
    found = []
    for y in range(height):
        for x in range(width):
            if not content[y][x] or seen[y][x]:
                continue
            queue = deque([(x, y)])
            seen[y][x] = True
            pixels = []
            while queue:
                cx, cy = queue.popleft()
                pixels.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < width and 0 <= ny < height and content[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        queue.append((nx, ny))
            found.append(pixels)
    return found


def convert(path):
    src = Image.open(path).convert('RGBA')
    width, height = src.size
    px = src.load()

    content = [[False] * width for _ in range(height)]
    for y in range(height):
        for x in range(width):
            r, g, b, a = px[x, y]
            content[y][x] = a > 8 and min(r, g, b) < WHITE_THRESHOLD

    # 线描画的描边是断开的（耳朵、身体、道具各是一笔），所以先按「近距离」把
    # 笔画聚成一只猫，再各自求轮廓 —— 直接对整个前景求凸包会把「猫 + 水渍」之间
    # 的空隙糊成一块白楔子（实测过一次）。
    components = grouped_components(content, width, height)
    components.sort(key=len, reverse=True)
    # 每个色块各自出轮廓再取并集：一个整体凸包会把「猫 + 水渍 / 漂浮的心」之间
    # 的空隙糊成一块白楔子（实测），分开画才贴合。
    outlines = [chaikin(robust_hull(comp), rounds=2) for comp in components[:8] if len(comp) > 60]

    mask = Image.new('L', (width * SUPERSAMPLE, height * SUPERSAMPLE), 0)
    draw = ImageDraw.Draw(mask)
    for outline in outlines:
        if len(outline) < 3:
            continue
        pts = [(x * SUPERSAMPLE, y * SUPERSAMPLE) for x, y in outline]
        draw.polygon(pts, fill=255)
        draw.line(pts + pts[:1], fill=255, width=MARGIN_PX * 2 * SUPERSAMPLE, joint='curve')
    mask = mask.resize((width, height), Image.LANCZOS)
    # 轻微羽化：多边形边缘硬切会留下锯齿
    mask = mask.filter(ImageFilter.GaussianBlur(0.6))
    mask_px = mask.load()

    out = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    out_px = out.load()
    for y in range(height):
        for x in range(width):
            r, g, b, a = px[x, y]
            if content[y][x]:
                out_px[x, y] = (r, g, b, a)
            elif mask_px[x, y] > 0:
                out_px[x, y] = (255, 255, 255, mask_px[x, y])

    # 裁到内容边界，去掉四周空气
    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    return out


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(SRC_DIR.glob('用户附件*.png'))
    files.sort(key=lambda p: (len(p.stem), p.stem))
    files += [SRC_DIR / '小猫1.png', SRC_DIR / '小猫2.png']
    if not files:
        sys.exit('未找到源素材')

    for index, path in enumerate(files, start=1):
        sticker = convert(path)
        target = OUT_DIR / f'sticker-{index:02d}.webp'
        sticker.save(target, 'WEBP', quality=92, method=6)
        print(f'{path.name:24} -> {target.name} {sticker.size[0]}x{sticker.size[1]}')


if __name__ == '__main__':
    main()
