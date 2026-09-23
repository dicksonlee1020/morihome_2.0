#!/usr/bin/env python3
"""
Cut the Morihome logo variants out of a flat export of the lockup.

Works on any crop of the Canva logo (design DAGF2HgogiM) as long as the mark
and the wordmark sit side by side on a flat background: the background colour
is sampled from the corners and keyed out, the result is trimmed, and the
mark/wordmark split is the widest empty column run in the left half.

Usage:
  python3 scripts/cut-logo.py <export.png> [--out public/brand]

Outputs (RGBA, transparent):
  logo-lockup.png        mark + wordmark, trimmed, native size
  logo-mark.png          mark only, trimmed, native size
  logo-wordmark.png      wordmark only, trimmed, native size
  logo-lockup@h48.png    header 1x     logo-lockup@h96.png   header 2x
  logo-lockup@h160.png   sign-in page
  logo-mark-{512,256,128,64,32}.png   square, transparent
  apple-touch-icon.png   180x180, mark on the brand cream
  favicon-32.png / favicon-16.png
"""
import sys
from pathlib import Path

from PIL import Image

# Where to look for the gap between mark and wordmark, as fractions of width.
SPLIT_SEARCH = (0.12, 0.6)
CREAM = (0xFA, 0xF7, 0xF0)


def background_colour(im: Image.Image) -> tuple[int, int, int]:
    w, h = im.size
    samples = [im.getpixel((x, y))[:3] for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    return max(set(samples), key=samples.count)


def key_out(im: Image.Image, bg: tuple[int, int, int]) -> Image.Image:
    """Make the flat background transparent; fade anti-aliased edge pixels."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            d = max(abs(r - bg[0]), abs(g - bg[1]), abs(b - bg[2]))
            if d <= 6:
                px[x, y] = (r, g, b, 0)
            elif d < 48:
                px[x, y] = (r, g, b, int(a * (d - 6) / 42))
    return im


def trim(im: Image.Image) -> Image.Image:
    bbox = im.getchannel("A").getbbox()
    return im.crop(bbox) if bbox else im


def find_split(im: Image.Image) -> int:
    alpha = im.getchannel("A")
    w, h = im.size
    lo, hi = int(w * SPLIT_SEARCH[0]), int(w * SPLIT_SEARCH[1])
    empty = [alpha.crop((x, 0, x + 1, h)).getbbox() is None for x in range(w)]
    best, best_len, start = None, 0, None
    for x in range(lo, hi + 1):
        is_empty = x < hi and empty[x]
        if is_empty and start is None:
            start = x
        if not is_empty and start is not None:
            if x - start > best_len:
                best, best_len = start + (x - start) // 2, x - start
            start = None
    if best is None:
        raise SystemExit("no gap between mark and wordmark found")
    return best


def scale_to_height(im: Image.Image, height: int) -> Image.Image:
    w, h = im.size
    return im.resize((round(w * height / h), height), Image.LANCZOS)


def square(im: Image.Image, size: int, background=None) -> Image.Image:
    inner = int(size * 0.84)
    w, h = im.size
    k = min(inner / w, inner / h)
    fitted = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), background or (0, 0, 0, 0))
    canvas.paste(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2), fitted)
    return canvas


def main(src: str, out_dir: str) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    im = Image.open(src).convert("RGBA")
    bg = background_colour(im)
    print(f"source {im.size}, background #{bg[0]:02x}{bg[1]:02x}{bg[2]:02x}")

    keyed = key_out(im, bg)
    lockup = trim(keyed)
    split_x = find_split(lockup)
    mark = trim(lockup.crop((0, 0, split_x, lockup.height)))
    wordmark = trim(lockup.crop((split_x, 0, lockup.width, lockup.height)))
    print(f"lockup {lockup.size}, mark {mark.size}, wordmark {wordmark.size}, split x={split_x}")

    lockup.save(out / "logo-lockup.png")
    mark.save(out / "logo-mark.png")
    wordmark.save(out / "logo-wordmark.png")
    for hgt in (48, 96, 160):
        scale_to_height(lockup, hgt).save(out / f"logo-lockup@h{hgt}.png")
    for s in (512, 256, 128, 64, 32):
        square(mark, s).save(out / f"logo-mark-{s}.png")
    square(mark, 180, background=(*CREAM, 255)).convert("RGB").save(out / "apple-touch-icon.png")
    square(mark, 32).save(out / "favicon-32.png")
    square(mark, 16).save(out / "favicon-16.png")
    print("written to", out)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    out_dir = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else "public/brand"
    main(sys.argv[1], out_dir)
