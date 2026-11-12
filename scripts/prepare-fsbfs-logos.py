"""Extract the supplied Sanber marks without redrawing their lettering or artwork.

The originals remain in img/FSBFS. Output is a square white PNG for the app.
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


SOURCE = Path(__file__).resolve().parents[1] / "img" / "FSBFS"
OUTPUT = SOURCE / "logos-blanco"

# Polygon vertices follow the outside edge of marks photographed on a colored
# poster. The remaining files already have a white backdrop and need a crop.
MARKS = {
    "federacion-san-bernardino": (
        "615424389_122199289082369201_3548612563604717913_n.jpg",
        [(108, 114), (123, 109), (139, 109), (156, 114), (171, 109),
         (188, 115), (203, 113), (221, 106), (242, 105), (262, 113),
         (280, 128), (285, 141), (279, 150), (281, 193), (277, 217),
         (278, 241), (266, 253), (250, 260), (239, 277), (200, 305),
         (161, 278), (149, 260), (115, 255), (109, 243), (112, 149),
         (103, 140)],
    ),
    "sport-center": ("WhatsApp Image 2026-11-12 at 09.39.11 (1).jpeg", None),
    "deportivo-puerta-del-lago": ("WhatsApp Image 2026-11-12 at 09.39.11.jpeg", None),
    "san-cristobal": (
        "WhatsApp Image 2026-11-12 at 09.39.12 (1).jpeg",
        [(450, 102), (532, 164), (603, 184), (714, 181), (789, 158),
         (860, 105), (1084, 275), (1085, 509), (1062, 635),
         (1008, 746), (913, 881), (797, 995), (655, 1065),
         (510, 1001), (397, 892), (297, 752), (240, 631),
         (218, 513), (218, 277)],
    ),
    "concepcion": ("WhatsApp Image 2026-11-12 at 09.39.12 (2).jpeg", None),
    "3-de-febrero": (
        "WhatsApp Image 2026-11-12 at 09.39.12 (3).jpeg",
        [(94, 49), (533, 49), (536, 498), (510, 517), (390, 574),
         (332, 591), (307, 592), (246, 575), (117, 518), (92, 501)],
    ),
    "sport-santa-lucia": ("WhatsApp Image 2026-11-12 at 09.39.12.jpeg", None),
    "villa-delfina": (
        "WhatsApp Image 2026-11-12 at 09.39.13 (1).jpeg",
        [(316, 52), (351, 43), (388, 70), (416, 112), (413, 151),
         (377, 176), (375, 229), (418, 238), (471, 257), (517, 290),
         (554, 341), (569, 393), (576, 442), (626, 475),
         (668, 545), (704, 636), (715, 749), (696, 870),
         (646, 982), (559, 1083), (448, 1150), (352, 1171),
         (256, 1150), (153, 1092), (67, 1000), (15, 884),
         (2, 759), (18, 643), (58, 547), (116, 481),
         (148, 454), (153, 406), (170, 342), (206, 293),
         (250, 257), (302, 235), (339, 226), (337, 176),
         (301, 147), (285, 113)],
    ),
    "los-russia": ("WhatsApp Image 2026-11-12 at 09.39.13.jpeg", None),
    "santa-rosa": ("WhatsApp Image 2026-11-12 at 09.39.14.jpeg", None),
    "sport-comando": ("WhatsApp Image 2026-11-12 at 09.42.21.jpeg", None),
    "copa-sanber": (
        "WhatsApp Image 2026-11-12 at 09.44.56.jpeg",
        [(172, 63), (280, 89), (457, 103), (621, 106), (798, 90),
         (908, 62), (906, 117), (928, 164), (968, 207),
         (1025, 239), (1051, 249), (1050, 540), (1026, 700),
         (981, 851), (906, 1001), (814, 1120), (690, 1226),
         (541, 1285), (386, 1222), (265, 1119), (168, 998),
         (97, 864), (50, 711), (27, 553), (27, 249),
         (61, 239), (111, 206), (153, 151), (174, 104)],
    ),
}


def extract(name: str, filename: str, polygon: list[tuple[int, int]] | None) -> None:
    original = Image.open(SOURCE / filename).convert("RGB")
    if polygon:
        mask = Image.new("L", original.size)
        ImageDraw.Draw(mask).polygon(polygon, fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(0.7))
        bbox = mask.getbbox()
        cut = Image.new("RGB", original.size, "white")
        cut.paste(original, (0, 0), mask)
        if name == "federacion-san-bernardino":
            # The source is a poster: dark blue visible between the eagle and
            # the shield belongs to that poster, not to the federation mark.
            pixels = cut.load()
            for y in range(bbox[1], bbox[3]):
                for x in range(bbox[0], bbox[2]):
                    red, green, blue = pixels[x, y]
                    if blue > 35 and blue > red * 1.3 and blue > green * 1.2:
                        pixels[x, y] = (255, 255, 255)
    else:
        if name == "sport-center":
            # A thin black scan border is outside the club mark.
            ImageDraw.Draw(original).rectangle((0, 0, original.width, 5), fill="white")
        # Near-white JPEG noise is ignored only for finding the outer crop.
        delta = ImageChops.difference(original, Image.new("RGB", original.size, "white"))
        bbox = delta.convert("L").point(lambda value: 255 if value > 26 else 0).getbbox()
        cut = original
    if not bbox:
        raise ValueError(f"No mark found: {filename}")
    mark = cut.crop(bbox)
    scale = min(448 / mark.width, 448 / mark.height)
    mark = mark.resize((round(mark.width * scale), round(mark.height * scale)), Image.Resampling.LANCZOS)
    square = Image.new("RGB", (512, 512), "white")
    square.paste(mark, ((512 - mark.width) // 2, (512 - mark.height) // 2))
    square.save(OUTPUT / f"{name}.png", optimize=True)


if __name__ == "__main__":
    OUTPUT.mkdir(exist_ok=True)
    for stem, (source, outline) in MARKS.items():
        extract(stem, source, outline)
