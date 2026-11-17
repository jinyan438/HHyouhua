"""Bake the original OL active-skill frame and particles for CSS playback."""
import hashlib
import json
import random
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "assets/active-skill-glow"
config = json.loads((ROOT / "sources.json").read_text(encoding="utf-8"))
frame = Image.open(ROOT / config["frame"]["file"]).convert("RGBA")
star = Image.open(ROOT / config["star"]["file"]).convert("RGBA")
# The native particle material is additive: black is zero emission, not an
# opaque square. Convert its premultiplied emission to straight browser RGBA.
pixels = np.asarray(star, dtype=np.float32) / 255
emission = pixels[..., :3] * pixels[..., 3:4]
alpha = np.max(emission, axis=2)
straight = np.divide(emission, alpha[..., None], out=np.zeros_like(emission), where=alpha[..., None] > 0)
star = Image.fromarray(np.rint(np.dstack((straight, alpha)) * 255).astype("uint8"))
width, height = config["animation"]["frameSize"]
count = config["animation"]["frames"]
rate = config["starEmitter"]["rate"]
random_source = random.Random(config["starEmitter"]["seed"])
particles = [
    {"x": random_source.uniform(63, 192), "y": random_source.uniform(54, 89),
     "dx": random_source.uniform(-4, 4),
     "speed": random_source.uniform(*config["starEmitter"]["speed"]) * 100,
     "size": random_source.uniform(*config["starEmitter"]["size"]) * 100}
    for _ in range(rate)
]


def pulse(age):
    return max(0, 1 - abs(age * 2 - 1))


def faded(image, opacity):
    result = image.copy()
    result.putalpha(image.getchannel("A").point(lambda value: round(value * opacity)))
    return result


sheet = Image.new("RGBA", (width * count, height))
for index in range(count):
    time = index / count
    image = Image.new("RGBA", (width, height))
    # Two native one-second frame particles overlap half a second apart.
    for offset in (0, .5):
        image.alpha_composite(faded(frame, pulse((time + offset) % 1)))
    for number, particle in enumerate(particles):
        age = (time - number / rate) % 1
        size = max(1, round(particle["size"]))
        point = star.resize((size, size), Image.Resampling.LANCZOS)
        point = faded(point, pulse(age))
        x = round(particle["x"] + particle["dx"] * age - size / 2)
        y = round(particle["y"] - particle["speed"] * age - size / 2)
        image.alpha_composite(point, (x, y))
    sheet.paste(image, (index * width, 0))
file = ROOT / "active-skill.png"
sheet.save(file, optimize=True)
config["output"] = {"file": file.name, "size": list(sheet.size),
                    "sha256": hashlib.sha256(file.read_bytes()).hexdigest()}
(ROOT / "sources.json").write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("Baked native golden frame and ten twinkling star particles")
