"""Build the two Arabic-script numeral subsets the app ships.

  src/fonts/arabic-numerals.woff2  Markazi Text       -> U+0660-U+0669 (Arabic)
  src/fonts/urdu-numerals.woff2    Noto Nastaliq Urdu -> U+06F0-U+06F9 (Urdu)

Each face is registered in styles.css behind a `unicode-range`, so the browser picks
per character: Arabic digits come from the Markazi face, Urdu digits from the
Nastaliq face, and everything else (Latin digits, Arabic prose) falls through to the
ordinary text fonts. Neither file carries Latin digits or Arabic letters, which is
what makes that fall-through exact.

Why two faces: the Eastern Arabic zero (U+0660) is a solid dot in every Arabic
typeface that exists, while the Urdu zero (U+06F0) can be a hollow ring - but only
in a couple of faces, and those read as Arabic rather than Urdu. So Arabic keeps a
stable Arabic face and Urdu gets authentic Nastaliq shapes.

Run:  python scripts/build-numeral-font.py
"""
import os
import re
import sys
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "src", "fonts")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

# name, google family, output file, codepoints
TARGETS = [
    ("Arabic", "Markazi Text", "arabic-numerals.woff2",
     list(range(0x0660, 0x066A)) + [0x066C, 0x0020]),
    ("Urdu", "Noto Nastaliq Urdu", "urdu-numerals.woff2",
     list(range(0x06F0, 0x06FA)) + [0x066C, 0x0020]),
]

FORBIDDEN = (
    [(c, c) for c in range(0x30, 0x3A)]        # ASCII digits
    + [(c, c) for c in range(0x41, 0x5B)]     # A-Z
    + [(c, c) for c in range(0x61, 0x7B)]     # a-z
    + [(c, c) for c in range(0x0620, 0x064B)]  # Arabic letters
)


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()


def font_url(family: str) -> str:
    css = fetch("https://fonts.googleapis.com/css2?family="
                + family.replace(" ", "+") + "&display=swap").decode("utf-8")
    blocks = re.findall(r"/\*\s*([\w\-\[\]]+)\s*\*/\s*@font-face\s*\{(.*?)\}", css, re.S)
    fallback = None
    for _, body in blocks:
        m = re.search(r"url\((https://[^)]+\.woff2)\)", body)
        if not m:
            continue
        if "U+0600" in body:
            return m.group(1)
        fallback = fallback or m.group(1)
    if fallback:
        return fallback
    m = re.search(r"url\((https://[^)]+\.woff2)\)", css)
    if not m:
        raise SystemExit(f"no woff2 url found for {family}")
    return m.group(1)


def build(label: str, family: str, out_name: str, unicodes) -> None:
    url = font_url(family)
    raw = fetch(url)
    tmp = os.path.join(OUT_DIR, f"_{label.lower()}-source.ttf")
    with open(tmp, "wb") as f:
        f.write(raw)

    font = TTFont(tmp)
    options = subset.Options()
    options.flavor = "woff2"
    options.desubroutinize = True
    options.drop_tables += ["DSIG"]
    options.layout_features = []
    options.name_IDs = [1, 2, 3, 4, 6]
    options.notdef_outline = True
    options.recalc_bounds = True
    s = subset.Subsetter(options=options)
    s.populate(unicodes=unicodes)
    s.subset(font)
    font.flavor = "woff2"
    out = os.path.join(OUT_DIR, out_name)
    font.save(out)
    font.close()
    os.remove(tmp)

    check = TTFont(out)
    have = sorted(check.getBestCmap().keys())
    check.close()
    size = os.path.getsize(out)
    print(f"{label:<7} {family:<20} -> {out_name}  {size:>5} bytes  "
          f"{len(have)} codepoints")
    leaked = [c for c in have if any(lo <= c <= hi for lo, hi in FORBIDDEN)]
    if leaked:
        print(f"ERROR: {out_name} leaked {[hex(c) for c in leaked]}", file=sys.stderr)
        raise SystemExit(1)
    missing = [u for u in unicodes if u not in have]
    if missing:
        print(f"ERROR: {out_name} is missing {[hex(c) for c in missing]}", file=sys.stderr)
        raise SystemExit(1)
    print(f"        verified: only its own numerals + separator, nothing else")


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    for args in TARGETS:
        build(*args)
    # The old combined subset is no longer referenced.
    stale = os.path.join(OUT_DIR, "arabic-numerals.woff2.bak")
    if os.path.exists(stale):
        os.remove(stale)
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
