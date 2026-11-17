"""Bake the exported OL seat materials into browser sprite sheets (Pillow, NumPy)."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "assets/player-glow"
config = json.loads((ROOT / "sources.json").read_text(encoding="utf-8"))
textures = {}


def sample(texture, u, v, repeat=False):
    name = texture["file"]
    if name not in textures:
        textures[name] = np.asarray(Image.open(ROOT / name).convert("RGBA"), dtype=np.float32) / 255
    image = textures[name]
    u = u * texture["scale"]["x"] + texture["offset"]["x"]
    v = v * texture["scale"]["y"] + texture["offset"]["y"]
    if repeat:
        u, v = u % 1, v % 1
    x = np.clip(u * (image.shape[1] - 1), 0, image.shape[1] - 1)
    y = np.clip((1 - v) * (image.shape[0] - 1), 0, image.shape[0] - 1)
    x0, y0 = x.astype(int), y.astype(int)
    x1, y1 = np.minimum(x0 + 1, image.shape[1] - 1), np.minimum(y0 + 1, image.shape[0] - 1)
    a, b = (x - x0)[..., None], (y - y0)[..., None]
    return ((image[y0, x0] * (1 - a) + image[y0, x1] * a) * (1 - b)
            + (image[y1, x0] * (1 - a) + image[y1, x1] * a) * b)


def render(variant, time):
    # Same local coordinates for every material; retain the prefab's relative
    # layer sizes, offsets, masks and HDR tints, then downsample for the browser.
    size = 512
    canvas_y, canvas_x = np.mgrid[:size, :size]
    canvas_x, canvas_y = canvas_x + .5, canvas_y + .5
    rails = variant["normalization"]
    scale = 190 / (rails["right"] - rails["left"])
    x = (canvas_x - 160) / scale + rails["left"] - size / 2
    y = size / 2 - ((canvas_y - 408) / scale + rails["bottom"])
    rgb = np.zeros((size, size, 3), dtype=np.float32)
    group = variant["groupScale"]
    for layer in variant["layers"]:
        width = layer["size"]["x"] * layer["scale"]["x"] * group["x"]
        height = layer["size"]["y"] * layer["scale"]["y"] * group["y"]
        u = (x - layer["position"]["x"] * group["x"]) / width + .5
        v = (y - layer["position"]["y"] * group["y"]) / height + .5
        inside = (u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)
        tex, floats = layer["textures"], layer["floats"]
        main_u, main_v = u, v
        animate = "UV_ANIMATION_ON" in layer["keywords"]
        if animate:
            main_u = u + time * floats.get("_USpeed", 0)
            main_v = v + time * floats.get("_VSpeed", 0)
        main = sample(tex["_MainTex"], main_u, main_v, animate) if "_MainTex" in tex else np.ones((size, size, 4))
        alpha = main[..., 3] * layer["opacity"] * floats.get("_Alpha", 1) * inside
        if "_MaskTex" in tex:
            alpha *= sample(tex["_MaskTex"], u, v)[..., 3]
        tint = np.array([layer["tint"][channel] for channel in "rgb"])
        color = main[..., :3] * tint
        if floats.get("_DstBlend") == 1:
            rgb += color * alpha[..., None]
        else:
            rgb = rgb * (1 - alpha[..., None]) + color * alpha[..., None]
    # Premultiplied emission -> straight RGBA. Screen blending preserves the
    # portrait beneath the transparent center and the source's additive glow.
    # The native seat portrait covers these layers. Bake that occlusion into
    # the browser overlay so its center cannot tint names, HP or the portrait.
    rgb[(canvas_x > 164) & (canvas_x < 346) & (canvas_y < 404)] = 0
    rgb = np.clip(rgb, 0, 1)
    alpha = np.max(rgb, axis=2)
    straight = np.divide(rgb, alpha[..., None], out=np.zeros_like(rgb), where=alpha[..., None] > 0)
    rgba = np.dstack((straight, alpha))
    return Image.fromarray(np.rint(rgba * 255).astype("uint8")).resize(tuple(config["frameSize"]), Image.Resampling.LANCZOS)


config["outputs"] = {}
for color, variant in config["variants"].items():
    width, height = config["frameSize"]
    sheet = Image.new("RGBA", (width * config["frames"], height))
    for frame in range(config["frames"]):
        sheet.paste(render(variant, frame * config["duration"] / config["frames"]), (width * frame, 0))
    file = color + ".png"
    sheet.save(ROOT / file, optimize=True)
    config["outputs"][file] = {"size": list(sheet.size), "sha256": hashlib.sha256((ROOT / file).read_bytes()).hexdigest()}
(ROOT / "sources.json").write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("Baked green, orange, red and blue OL seat glows")
