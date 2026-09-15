"""OGP画像（SNSにURLを貼ったときのカード画像）を作る。

アプリの見本と同じ形を描くので、何のツールかが一目で伝わる。
形はアプリの initialDesign() と同じ考え方で作っている。
使い方: python scripts/make-ogp.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG = (244, 246, 250)
INK = (31, 41, 55)
MUTED = (107, 114, 128)
ACCENT = (39, 103, 174)
CUTTER = (58, 166, 160)
STAMP = (224, 143, 180)

OUT = Path(__file__).resolve().parent.parent / "public" / "ogp.png"


def find_font(size):
    """日本語が出るフォントを探す。無ければ既定にする。"""
    for name in ("YuGothM.ttc", "meiryo.ttc", "msgothic.ttc", "YuGothR.ttc"):
        path = Path("C:/Windows/Fonts") / name
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size)
            except OSError:
                continue
    return ImageFont.load_default()


def blob(cx, cy, radius, points=8, wobble=0.82):
    """アプリの見本と同じ、丸みのある多角形。"""
    result = []
    for i in range(points * 12):
        angle = i / (points * 12) * math.tau
        # 頂点ごとに半径を変えて、丸い菱形のような形にする
        r = radius * (1 - (1 - wobble) * (0.5 - 0.5 * math.cos(points * angle)))
        result.append((cx + math.cos(angle) * r, cy + math.sin(angle) * r))
    return result


def main():
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)

    # 右側: 抜き枠（輪郭）とスタンプ（塗り）を重ねて見せる
    cx, cy, outer = 950, 315, 178
    draw.polygon(blob(cx, cy, outer), fill=(255, 255, 255))
    draw.line(blob(cx, cy, outer) + [blob(cx, cy, outer)[0]], fill=CUTTER, width=12, joint="curve")
    draw.polygon(blob(cx, cy, 136), fill=STAMP)

    # スタンプの絵柄（目と口）
    for dx in (-47, 47):
        draw.ellipse([cx + dx - 19, cy - 60, cx + dx + 19, cy - 27], fill=(255, 255, 255))
    draw.arc([cx - 70, cy - 24, cx + 70, cy + 84], start=18, end=162, fill=(255, 255, 255), width=15)

    # 左側: 文字。図と重ならない幅に収める。
    draw.text((88, 200), "クッキー型デザイナー", font=find_font(54), fill=INK)
    draw.text((90, 288), "抜き型とスタンプを設計して", font=find_font(28), fill=MUTED)
    draw.text((90, 330), "3Dプリンタ用のSTLに書き出せます", font=find_font(28), fill=MUTED)
    draw.rectangle([88, 394, 118, 398], fill=ACCENT)
    draw.text((88, 418), "オヤベクラフト", font=find_font(25), fill=ACCENT)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT, "PNG", optimize=True)
    print(f"{OUT}  {OUT.stat().st_size / 1024:.1f} KB  {W}x{H}")


if __name__ == "__main__":
    main()
