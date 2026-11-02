from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / "qa-screenshots" / "framer-plugin-2026-06-28"
OUT = ROOT / "marketplace-media"
SIZE = (1600, 1200)

PANEL_CROP = (805, 36, 1272, 825)

FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size)


def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    src_w, src_h = image.size
    dst_w, dst_h = size
    scale = max(dst_w / src_w, dst_h / src_h)
    resized = image.resize((round(src_w * scale), round(src_h * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - dst_w) // 2
    top = (resized.height - dst_h) // 2
    return resized.crop((left, top, left + dst_w, top + dst_h))


def contain(image: Image.Image, max_size: tuple[int, int]) -> Image.Image:
    copy = image.copy()
    copy.thumbnail(max_size, Image.Resampling.LANCZOS)
    return copy


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return mask


def paste_shadow(base: Image.Image, image: Image.Image, xy: tuple[int, int], radius: int = 36, opacity: int = 120) -> None:
    x, y = xy
    shadow = Image.new("RGBA", (image.width + radius * 4, image.height + radius * 4), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (radius * 2, radius * 2, radius * 2 + image.width, radius * 2 + image.height),
        radius=34,
        fill=(0, 0, 0, opacity),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius))
    base.alpha_composite(shadow, (x - radius * 2, y - radius * 2))


def draw_glow(draw_layer: Image.Image, box: tuple[int, int, int, int], color: tuple[int, int, int], blur: int = 34, alpha: int = 90) -> None:
    glow = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.rounded_rectangle(box, radius=44, outline=(*color, alpha), width=3)
    glow = glow.filter(ImageFilter.GaussianBlur(blur))
    draw_layer.alpha_composite(glow)


def radial_glow(
    base: Image.Image,
    center: tuple[int, int],
    radius: int,
    color: tuple[int, int, int],
    peak_alpha: int,
    squash_y: float = 1.0,
) -> None:
    glow = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    cx, cy = center
    for i in range(48, 0, -1):
        ratio = i / 48
        rx = int(radius * ratio)
        ry = int(radius * ratio * squash_y)
        alpha = int(peak_alpha * (ratio**2.2))
        d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=(*color, alpha))
    glow = glow.filter(ImageFilter.GaussianBlur(20))
    base.alpha_composite(glow)


def draw_ribbon(
    base: Image.Image,
    points: list[tuple[int, int]],
    color: tuple[int, int, int],
    width: int,
    alpha: int,
    blur: int,
) -> None:
    ribbon = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    d = ImageDraw.Draw(ribbon)
    d.line(points, fill=(*color, alpha), width=width, joint="curve")
    d.line(points, fill=(255, 255, 255, max(12, alpha // 4)), width=max(2, width // 18), joint="curve")
    ribbon = ribbon.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(ribbon)


def draw_glass_tile(
    base: Image.Image,
    center: tuple[int, int],
    size: tuple[int, int],
    color: tuple[int, int, int],
    angle: float,
    alpha: int = 44,
) -> None:
    w, h = size
    tile = Image.new("RGBA", (w + 24, h + 24), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    d.rounded_rectangle(
        (12, 12, w + 12, h + 12),
        radius=28,
        fill=(*color, alpha),
        outline=(255, 255, 255, 30),
        width=2,
    )
    d.line((42, 24, w - 10, h + 2), fill=(255, 255, 255, 18), width=2)
    tile = tile.filter(ImageFilter.GaussianBlur(0.3)).rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)
    x = center[0] - tile.width // 2
    y = center[1] - tile.height // 2
    base.alpha_composite(tile, (x, y))


def add_texture(base: Image.Image, seed: int) -> None:
    rng = random.Random(seed)
    noise = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    d = ImageDraw.Draw(noise)
    for _ in range(4400):
        x = rng.randrange(SIZE[0])
        y = rng.randrange(SIZE[1])
        a = rng.randrange(4, 13)
        d.point((x, y), fill=(255, 255, 255, a))
    base.alpha_composite(noise)


def make_background(seed: int, palette: tuple[tuple[int, int, int], tuple[int, int, int], tuple[int, int, int]]) -> Image.Image:
    base = Image.new("RGBA", SIZE, (6, 7, 10, 255))
    c1, c2, c3 = palette

    # A premium product-card backdrop: dark studio, restrained color, no generated text.
    radial_glow(base, (1180, 360), 680, c1, 54, squash_y=0.72)
    radial_glow(base, (350, 1020), 620, c2, 42, squash_y=0.52)
    radial_glow(base, (1540, 1050), 520, c3, 35, squash_y=0.88)

    draw_ribbon(base, [(-120, 890), (240, 720), (610, 650), (1040, 455), (1740, 260)], c1, 52, 46, 16)
    draw_ribbon(base, [(-80, 310), (340, 250), (780, 345), (1200, 220), (1710, 130)], c2, 34, 32, 13)
    draw_ribbon(base, [(100, 1280), (430, 980), (770, 870), (1120, 930), (1670, 735)], c3, 42, 36, 15)

    for tile in (
        ((260, 235), (330, 180), c1, -15, 28),
        ((1390, 260), (360, 230), c2, 14, 30),
        ((225, 860), (430, 210), c3, 9, 24),
        ((1310, 975), (360, 190), c1, -9, 22),
    ):
        draw_glass_tile(base, *tile)

    # Fine editorial structure like a Framer surface, kept almost invisible.
    structure = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    d = ImageDraw.Draw(structure)
    for x in range(-220, SIZE[0] + 260, 120):
        d.line((x, 0, x + 430, SIZE[1]), fill=(255, 255, 255, 7), width=1)
    for y in range(120, SIZE[1], 120):
        d.line((0, y, SIZE[0], y), fill=(255, 255, 255, 5), width=1)
    base.alpha_composite(structure)

    add_texture(base, seed)

    vignette = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    vd = ImageDraw.Draw(vignette)
    for i in range(210):
        alpha = int((i / 210) ** 2 * 145)
        vd.rectangle((i, i, SIZE[0] - i, SIZE[1] - i), outline=(0, 0, 0, alpha), width=2)
    base.alpha_composite(vignette)
    return base


def patch_header_title(panel: Image.Image) -> Image.Image:
    patched = panel.copy()
    d = ImageDraw.Draw(patched)

    # Replace the dev-only suffix in the plugin title with the production title.
    d.rounded_rectangle((48, 12, 274, 44), radius=4, fill=(12, 13, 15, 255))
    d.text((50, 21), "Polyglot AEO", font=font(14, True), fill=(250, 250, 250, 255))
    return patched


def crop_panel(source: Path) -> Image.Image:
    raw = Image.open(source).convert("RGBA")
    panel = raw.crop(PANEL_CROP)
    panel = patch_header_title(panel)
    mask = rounded_mask(panel.size, 28)
    out = Image.new("RGBA", panel.size, (0, 0, 0, 0))
    out.alpha_composite(panel)
    out.putalpha(mask)
    return out


def frame_image(image: Image.Image, radius: int = 34, stroke: tuple[int, int, int] = (34, 143, 214)) -> Image.Image:
    framed = Image.new("RGBA", (image.width + 4, image.height + 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(framed)
    d.rounded_rectangle((0, 0, framed.width - 1, framed.height - 1), radius=radius, fill=(10, 12, 16, 255), outline=(*stroke, 90), width=2)
    mask = rounded_mask(image.size, radius - 4)
    framed.alpha_composite(image, (2, 2))
    framed.putalpha(rounded_mask(framed.size, radius))
    return framed


def canvas_slice(source: Path, box: tuple[int, int, int, int], max_size: tuple[int, int], opacity: int = 205) -> Image.Image:
    raw = Image.open(source).convert("RGBA")
    piece = raw.crop(box)
    piece = contain(piece, max_size)
    piece = ImageEnhance.Brightness(piece).enhance(0.76)
    piece = ImageEnhance.Contrast(piece).enhance(0.95)
    mask = Image.new("L", piece.size, opacity)
    piece.putalpha(mask)
    return frame_image(piece, radius=28, stroke=(100, 110, 130))


def place_panel(base: Image.Image, panel: Image.Image, xy: tuple[int, int], max_size: tuple[int, int]) -> tuple[int, int, int, int]:
    p = contain(panel, max_size)
    x, y = xy
    paste_shadow(base, p, xy, radius=38, opacity=145)
    draw_glow(base, (x - 8, y - 8, x + p.width + 8, y + p.height + 8), (0, 164, 255), blur=24, alpha=65)
    base.alpha_composite(p, xy)
    return (x, y, x + p.width, y + p.height)


def save(image: Image.Image, name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(OUT / name, quality=95)


def media_control_center() -> None:
    src = QA / "16-control-center-after-pro-activation.png"
    base = make_background(11, ((0, 164, 255), (122, 91, 255), (35, 210, 190)))

    panel = crop_panel(src)
    place_panel(base, panel, (830, 92), (650, 1065))

    echo = crop_panel(QA / "21-dashboard-home-after-pro.png")
    echo = contain(echo, (420, 710))
    echo = ImageEnhance.Brightness(echo).enhance(0.62)
    echo.putalpha(105)
    paste_shadow(base, echo, (210, 230), radius=34, opacity=86)
    base.alpha_composite(echo, (210, 230))

    deco = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    d = ImageDraw.Draw(deco)
    for y, width, alpha in ((285, 460, 40), (370, 360, 30), (455, 500, 34), (540, 320, 28)):
        d.rounded_rectangle((220, y, 220 + width, y + 16), radius=8, fill=(0, 164, 255, alpha))
    base.alpha_composite(deco)
    save(base, "marketplace-01-control-center.png")


def media_schema_audit() -> None:
    src = QA / "11-schema-audit-after-scan.png"
    base = make_background(22, ((122, 91, 255), (0, 164, 255), (255, 72, 88)))

    back_panel = crop_panel(QA / "09-schema-audit-initial.png")
    back_panel = contain(back_panel, (470, 800))
    back_panel = ImageEnhance.Brightness(back_panel).enhance(0.62)
    back_panel.putalpha(112)
    paste_shadow(base, back_panel, (220, 185), radius=30, opacity=92)
    base.alpha_composite(back_panel, (220, 185))

    panel = crop_panel(src)
    place_panel(base, panel, (760, 92), (650, 1065))
    save(base, "marketplace-02-schema-audit.png")


def media_llms() -> None:
    src = QA / "23-llms-step2-content-sources-pro.png"
    base = make_background(33, ((0, 164, 255), (82, 108, 255), (78, 225, 180)))

    panel = crop_panel(src)
    place_panel(base, panel, (820, 95), (650, 1060))

    # Non-text document rhythm: abstract file cards without labels or glyph text.
    deco = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    d = ImageDraw.Draw(deco)
    for i, y in enumerate((280, 390, 500, 610)):
        x = 210 + i * 44
        d.rounded_rectangle((x, y, x + 420, y + 70), radius=22, fill=(22, 25, 32, 150), outline=(0, 164, 255, 42), width=1)
        d.line((x + 34, y + 26, x + 330, y + 26), fill=(255, 255, 255, 24), width=4)
        d.line((x + 34, y + 44, x + 250, y + 44), fill=(255, 255, 255, 16), width=3)
    base.alpha_composite(deco)
    save(base, "marketplace-03-llms-workflow.png")


def media_meta_verifier() -> None:
    src_left = QA / "27-meta-copy-step2-generate.png"
    src_right = QA / "18-published-verifier-results-after-pro.png"
    base = make_background(44, ((122, 91, 255), (0, 164, 255), (255, 92, 120)))

    left = crop_panel(src_left)
    right = crop_panel(src_right)
    left = contain(left, (565, 960))
    right = contain(right, (565, 960))

    paste_shadow(base, left, (255, 125), radius=34, opacity=116)
    draw_glow(base, (247, 117, 255 + left.width + 8, 125 + left.height + 8), (122, 91, 255), blur=24, alpha=55)
    base.alpha_composite(left, (255, 125))

    paste_shadow(base, right, (795, 200), radius=36, opacity=145)
    draw_glow(base, (787, 192, 795 + right.width + 8, 200 + right.height + 8), (0, 164, 255), blur=24, alpha=60)
    base.alpha_composite(right, (795, 200))
    save(base, "marketplace-04-meta-and-verifier.png")


def main() -> None:
    media_control_center()
    media_schema_audit()
    media_llms()
    media_meta_verifier()


if __name__ == "__main__":
    main()
