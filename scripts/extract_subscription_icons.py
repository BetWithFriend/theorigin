#!/usr/bin/env python3
"""One-shot extraction of the subscription-flow icons from the Figma mockup PNGs.

For each icon: crop a narrow x-slice that contains only the icon (no card text,
no vertical card border), pick the tallest run of dark rows (skips the thin
horizontal card-border lines), trim, convert white background to alpha, save.
"""
import numpy as np
from PIL import Image

SRC = '/Users/idogeled/.cursor/projects/Users-idogeled-src-the-origin/assets'
OUT = '/Users/idogeled/src/the-origin/assets'
DARK = 120
ICON_RGB = (28, 32, 29)  # --sub-text

# image file -> (x-slice, [(icon_name, y-window), ...])
JOBS = {
    # Taste profile, right phone (Mobile 112, all cards unselected)
    'image-79a26b5d-8a87-45c3-8f4c-a0960de260f6.png': (
        (912, 950),
        [
            ('subscription_icon_nut.png',       (300, 368)),
            ('subscription_icon_chocolate.png', (383, 450)),
            ('subscription_icon_cherries.png',  (465, 533)),
        ],
    ),
    # Grind, right phone (Mobile 114, all cards unselected)
    'image-5570125f-cb8a-46e9-97f6-10b7e1262344.png': (
        (872, 916),
        [
            ('subscription_icon_grinder.png',     (290, 350)),
            ('subscription_icon_espresso.png',    (368, 428)),
            ('subscription_icon_moka.png',        (446, 506)),
            ('subscription_icon_v60.png',         (524, 584)),
            ('subscription_icon_frenchpress.png', (602, 662)),
        ],
    ),
    # Delivery day, right phone (Mobile 121, card 1 unselected)
    'image-f1c99a3f-a4b5-474d-9ff8-1653dbffb9ea.png': (
        (886, 918),
        [('subscription_icon_calendar.png', (265, 325))],
    ),
    # Quantity, left phone (Mobile 120, card 1 unselected)
    'image-0f2dbb5d-d483-4284-be37-fab8bf021161.png': (
        (406, 450),
        [('subscription_icon_bag.png', (295, 375))],
    ),
}


def best_run(dark, axis):
    """Run of dark rows (axis=1) or columns (axis=0) with the most dark pixels."""
    counts = dark.sum(axis=axis)
    idx = np.where(counts > 0)[0]
    if len(idx) == 0:
        return None
    runs, start, prev = [], idx[0], idx[0]
    for i in idx[1:]:
        if i - prev > 3:
            runs.append((start, prev))
            start = i
        prev = i
    runs.append((start, prev))
    return max(runs, key=lambda r: counts[r[0]:r[1] + 1].sum())


def extract(im, xs, yw):
    box = (xs[0], yw[0], xs[1], yw[1])
    gray = np.array(im.crop(box).convert('L'))
    dark = gray < DARK
    # rows first (skips the thin horizontal card-border lines); the x-slice
    # already excludes text and vertical borders, so columns are a plain trim
    rrun = best_run(dark, axis=1)
    if rrun is None:
        return None
    cols = np.where(dark[rrun[0]:rrun[1] + 1].any(axis=0))[0]
    x0, x1 = cols[0], cols[-1]
    rows = np.where(dark[rrun[0]:rrun[1] + 1, x0:x1 + 1].any(axis=1))[0]
    y0, y1 = rrun[0] + rows[0], rrun[0] + rows[-1]
    pad = 2
    tight = np.array(
        im.crop((box[0] + x0 - pad, box[1] + y0 - pad, box[0] + x1 + 1 + pad, box[1] + y1 + 1 + pad)).convert('L')
    ).astype(np.int16)
    alpha = np.clip(255 - tight, 0, 255).astype(np.uint8)
    h, w = alpha.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = ICON_RGB
    rgba[..., 3] = alpha
    return Image.fromarray(rgba)


def main():
    results = []
    for src_name, (xs, icons) in JOBS.items():
        im = Image.open(f'{SRC}/{src_name}')
        for out_name, yw in icons:
            icon = extract(im, xs, yw)
            if icon is None:
                print(f'MISS  {out_name}')
                continue
            icon.save(f'{OUT}/{out_name}')
            print(f'OK    {out_name}: {icon.size[0]}x{icon.size[1]}')
            results.append((out_name, icon))

    if results:
        scale, pad, cell = 4, 12, 48 * 4
        sheet = Image.new('RGB', ((cell + pad) * len(results) + pad, cell + 2 * pad), (240, 240, 240))
        for i, (name, icon) in enumerate(results):
            big = icon.resize((icon.width * scale, icon.height * scale), Image.NEAREST)
            cx = pad + i * (cell + pad) + (cell - big.width) // 2
            cy = pad + (cell - big.height) // 2
            sheet.paste(big, (cx, cy), big)
        sheet.save(f'{OUT}/_icon_contact_sheet.png')
        print('sheet saved')


if __name__ == '__main__':
    main()
