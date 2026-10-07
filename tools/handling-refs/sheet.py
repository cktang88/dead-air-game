"""python3 sheet.py <pose> [<pose2> ...] -> out/sheet_<pose>.png : 8 yaws in 4x2 grid, reference renders on the game bg"""
import sys
from PIL import Image, ImageDraw
import os
OUT = os.environ.get("REFS_OUT", "refs/out") + "/"
for n in sys.argv[1:]:
    ims = [Image.open(OUT + 'ref_%s_%03d.png' % (n, d)) for d in range(0, 360, 45)]
    w, h = ims[0].size
    sh = Image.new('RGBA', (w * 4, h * 2), (43, 39, 54, 255)); dr = ImageDraw.Draw(sh)
    for i, im in enumerate(ims):
        x, y = (i % 4) * w, (i // 4) * h
        sh.alpha_composite(im, (x, y)); dr.text((x + 4, y + 4), '%s %d' % (n, i * 45), fill=(200, 200, 200, 255))
    sh.convert('RGB').save(OUT + 'sheet_%s.png' % n)
