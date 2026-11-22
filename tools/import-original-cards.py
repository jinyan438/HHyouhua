"""Import the uncompressed Laya cards.png atlas from the local original APK."""
from pathlib import Path
import argparse
import hashlib
import io
import json
import zipfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMAGE_ENTRY = "assets/cache/https.__web.sanguosha.com_220_sgsolApp/ba0005aa"
ATLAS_ENTRY = "assets/cache/https.__web.sanguosha.com_220_sgsolApp/bec0945b"


def import_cards(apk):
    destination = ROOT / "assets" / "original-cards"
    manifest_path = destination / "sources.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    with zipfile.ZipFile(apk) as package:
        image_bytes = package.read(IMAGE_ENTRY)
        atlas_bytes = package.read(ATLAS_ENTRY)
    atlas = json.loads(atlas_bytes)
    frames = {name.lower(): (name, frame) for name, frame in atlas["frames"].items()}
    image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")

    # Validate and prepare the entire set before replacing any installed PNGs.
    imports = []
    for item in manifest["files"]:
        previous_name = item.get("sourceFrame") or item["source"].replace("\\", "/").rsplit("/", 1)[-1]
        name, frame = frames[previous_name.lower()]
        rect = frame["frame"]
        size = frame["sourceSize"]
        offset = frame["spriteSourceSize"]
        box = (rect["x"], rect["y"], rect["x"] + rect["w"], rect["y"] + rect["h"])
        assert 0 <= box[0] < box[2] <= image.width and 0 <= box[1] < box[3] <= image.height, name
        piece = image.crop(box)
        if frame.get("rotated"):
            piece = piece.transpose(Image.Transpose.ROTATE_90)
        assert offset["x"] + piece.width <= size["w"] and offset["y"] + piece.height <= size["h"], name
        result = Image.new("RGBA", (size["w"], size["h"]))
        result.paste(piece, (offset["x"], offset["y"]))
        if not item["file"].startswith(("black_", "red_")) and item["file"] not in ("club.png", "diamond.png", "heart.png", "spade.png"):
            assert result.size == (126, 174), name
        encoded = io.BytesIO()
        result.save(encoded, format="PNG")
        data = encoded.getvalue()
        imports.append((item, data, name, rect, size, offset))

    for item, data, name, rect, size, offset in imports:
        (destination / item["file"]).write_bytes(data)
        item.update(
            source="res/assets/cards/cards.png",
            sourceFrame=name,
            sourceRect=[rect[key] for key in ("x", "y", "w", "h")],
            sourceSize=[size["w"], size["h"]],
            sourceOffset=[offset["x"], offset["y"]],
            sha256=hashlib.sha256(data).hexdigest(),
            bytes=len(data),
        )
    with apk.open("rb") as source:
        package_hash = hashlib.file_digest(source, "sha256").hexdigest()
    manifest["sourcePackage"] = {
        "file": apk.as_posix(),
        "sha256": package_hash,
        "client": "Laya",
        "imageEntry": IMAGE_ENTRY,
        "imageSha256": hashlib.sha256(image_bytes).hexdigest(),
        "atlasEntry": ATLAS_ENTRY,
        "atlasSha256": hashlib.sha256(atlas_bytes).hexdigest(),
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"Imported {len(imports)} PNGs from the original Laya cards.png atlas")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    import_cards(parser.parse_args().apk)
