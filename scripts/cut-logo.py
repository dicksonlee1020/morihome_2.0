#!/usr/bin/env python3
"""
Cut the Morihome logo variants out of the Canva signboard export.

Source: Canva design DAGF2HgogiM (38*147cm PVC board), page 5556 x 1436.
Layout, from the design's vector data:
  - cream panel #faf7f0 behind the logo, y < 1005
  - green band #506d53 with signage text ("落多一層就到啦 / DOWN STAIRS"), y >= 1005
  - mark (roof "M" strokes, window dots, chimney, leaf image) around x 760-1770
  - wordmark "mori home" text boxes from x 1859

Because the cream is a shape, Canva's "transparent background" export still
leaves it opaque, so this script keys it out.

Usage:
  python3 scripts/cut-logo.py <export.png> [--out public/brand]

Outputs (all RGBA, transparent):
  logo-lockup.png      mark + wordmark, trimmed        (native width)
  logo-mark.png        mark only, trimmed               (native)
  logo-wordmark.png    wordmark only, trimmed           (native)
  logo-lockup@h96.png  lockup scaled to 96px tall        (header 2x)
  logo-lockup@h48.png  lockup scaled to 48px tall        (header 1x)
  logo-mark-{512,256,128,64,32}.png
  apple-touch-icon.png 180x180, mark on cream
  favicon-32.png / favicon-16.png
"""
import sys
from pathlib import Path

from PIL import Image

SRC_W = 5556
GREEN_BAND_TOP = 1005  # y in source coordinates
SPLIT_SEARCH = (1650, 2000)  # the gap between mark and wordmark lies in here

CREAM = (0xFA, 0xF7, 0xF0)
WHITE = (0xFF, 0xFF, 0xFF)


def key_out_background(im: Image.Image) -> Image.Image:
    """Turn cream/white pixels transparent, with soft edges for anti-aliasing."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            # distance to cream and to white; whichever is nearer is "background"
            d_cream = max(abs(r - CREAM[0]), abs(g - CREAM[1]), abs(b - CREAM[2]))
            d_white = max(abs(r - WHITE[0]), abs(g - WHITE[1]), abs(b - WHITE[2]))
            d = min(d_cream, d_white)
            if d <= 6:
                px[x, y] = (r, g, b, 0)
            elif d < 40:
                # edge pixel: fade alpha proportionally so strokes stay smooth
                px[x, y] = (r, g, b, int(a * (d - 6) / 34))
    return im


def trim(im: Image.Image) -> Image.Image:
    bbox = im.getchannel("A").getbbox()
    return im.crop(bbox) if bbox else im


def find_split(im: Image.Image, scale: float) -> int:
    """Widest fully transparent column run inside the expected gap."""
    alpha = im.getchannel("A")
    w, h = im.size
    lo, hi = int(SPLIT_SEARCH[0] * scale), min(w, int(SPLIT_SEARCH[1] * scale))
    best, best_len, run_start = None, 0, None
    for x in range(lo, hi):
        col = alpha.crop((x, 0, x + 1, h))
        empty = col.getbbox() is None
        if empty and run_start is None:
            run_start = x
        if (not empty or x == hi - 1) and run_start is not None:
            run_len = x - run_start
            if run_len > best_len:
                best, best_len = run_start + run_len // 2, run_len
            run_start = None
    if best is None:
        raise SystemExit("could not find the gap between mark and wordmark")
    return best


def scale_to_height(im: Image.Image, height: int) -> Image.Image:
    w, h = im.size
    return im.resize((round(w * height / h), height), Image.LANCZOS)


def square(im: Image.Image, size: int, background=None) -> Image.Image:
    """Fit into a square with a little breathing room."""
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
    scale = im.width / SRC_W
    print(f"source {im.size}, scale {scale:.3f}")

    # Drop the signage band, then key the cream/white panel out.
    im = im.crop((0, 0, im.width, int(GREEN_BAND_TOP * scale) - 2))
    im = key_out_background(im)

    lockup = trim(im)
    split_x = find_split(im, scale)
    mark = trim(im.crop((0, 0, split_x, im.height)))
    wordmark = trim(im.crop((split_x, 0, im.width, im.height)))
    print(f"lockup {lockup.size}, mark {mark.size}, wordmark {wordmark.size}, split at x={split_x}")

    lockup.save(out / "logo-lockup.png")
    mark.save(out / "logo-mark.png")
    wordmark.save(out / "logo-wordmark.png")

    scale_to_height(lockup, 96).save(out / "logo-lockup@h96.png")
    scale_to_height(lockup, 48).save(out / "logo-lockup@h48.png")
    for s in (512, 256, 128, 64, 32):
        square(mark, s).save(out / f"logo-mark-{s}.png")

    square(mark, 180, background=(*CREAM, 255)).convert("RGB").save(out / "apple-touch-icon.png")
    square(mark, 32).save(out / "favicon-32.png")
    square(mark, 16).save(out / "favicon-16.png")
    print("written to", out)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    src = sys.argv[1]
    out_dir = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else "public/brand"
    main(src, out_dir)
