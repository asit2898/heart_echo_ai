"""Local, research-only inference server for EchoNet-RV segmentation."""
import base64
import hashlib
import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit

import cv2
import numpy as np
import torch
import torchvision


ROOT = Path(__file__).resolve().parent.parent
WEIGHTS = Path(__file__).resolve().parent / ".cache" / "segmentation.pt"
WEIGHTS_SHA256 = "eca122d97ca03312aa701de401484c5e37e86693aadb76da64ffac4610e81eb5"
ALLOWED_FILES = {
    "/rv-signal/index.html": ROOT / "rv-signal/index.html",
    "/rv-signal/styles.css": ROOT / "rv-signal/styles.css",
    "/rv-signal/app.mjs": ROOT / "rv-signal/app.mjs",
    "/rv-signal/addendum.mjs": ROOT / "rv-signal/addendum.mjs",
    "/rv-signal/analysis.mjs": ROOT / "rv-signal/analysis.mjs",
    "/rv-signal/media/normal-a4c.webm": ROOT / "rv-signal/media/normal-a4c.webm",
    "/rv-signal/media/influenza-a4c.webm": ROOT / "rv-signal/media/influenza-a4c.webm",
}
MODEL = None
DEVICE = torch.device("cpu")
PUBLIC_ORIGIN = os.environ.get("HEART_ECHO_PUBLIC_ORIGIN", "")
if PUBLIC_ORIGIN and (urlsplit(PUBLIC_ORIGIN).scheme != "https" or not urlsplit(PUBLIC_ORIGIN).netloc):
    raise ValueError("HEART_ECHO_PUBLIC_ORIGIN must be an HTTPS origin")
torch.set_num_threads(4)


def load_model():
    global MODEL
    if MODEL is not None:
        return MODEL
    if not WEIGHTS.is_file():
        raise FileNotFoundError("EchoNet-RV weights are missing. Follow rv-signal/README.md to download them.")
    digest = hashlib.sha256()
    with WEIGHTS.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != WEIGHTS_SHA256:
        raise ValueError("Unexpected model checksum. Download the published EchoNet-RV release weights again.")
    checkpoint = torch.load(WEIGHTS, map_location="cpu", weights_only=False)
    model = torchvision.models.segmentation.deeplabv3_resnet50(weights=None, weights_backbone=None)
    model.classifier[-1] = torch.nn.Conv2d(model.classifier[-1].in_channels, 3, kernel_size=1)
    state = {
        key.removeprefix("module."): value
        for key, value in checkpoint["state_dict"].items()
        if not key.startswith("module.aux_classifier.")
    }
    model.load_state_dict(state)
    model.eval().to(DEVICE)
    mean = torch.as_tensor(checkpoint["mean"], dtype=torch.float32).view(3, 1, 1)
    std = torch.as_tensor(checkpoint["std"], dtype=torch.float32).view(3, 1, 1)
    MODEL = (model, mean, std)
    return MODEL


def prepare_frame(encoded):
    raw = base64.b64decode(encoded, validate=True)
    if len(raw) > 1_000_000:
        raise ValueError("One video frame exceeds the 1 MB limit.")
    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise ValueError("Could not read one of the video frames.")
    height, width = image.shape
    if min(height, width) < 112 or max(height, width) > 1200:
        raise ValueError("Video frame dimensions must be between 112 and 1200 pixels.")
    side = min(width, height)
    x = (width - side) // 2
    y = (height - side) // 2
    margin = side // 10
    square = image[y + margin:y + side - margin, x + margin:x + side - margin]
    resized = cv2.resize(square, (112, 112), interpolation=cv2.INTER_CUBIC)
    row, column = np.indices((112, 112))
    sector = (row + column > 67) & (row - column < 67)
    resized[~sector] = 0
    rgb = np.repeat(resized[None, :, :], 3, axis=0).copy()
    return torch.from_numpy(rgb).float(), {"x": x + margin, "y": y + margin, "size": side - 2 * margin}


def segment_frames(frames):
    model, mean, std = load_model()
    prepared = [prepare_frame(frame) for frame in frames]
    with torch.inference_mode():
        predictions = []
        for index in range(0, len(prepared), 8):
            images = torch.stack([(image - mean) / std for image, _ in prepared[index:index + 8]]).to(DEVICE)
            predictions.extend(model(images)["out"][:, 0].cpu().numpy())
    results = []
    for logits, (_, crop) in zip(predictions, prepared):
        mask = (logits > 0).astype(np.uint8)
        area = int(mask.sum())
        fraction = area / mask.size
        if fraction < 0.004 or fraction > 0.45:
            results.append({"area": None, "mask": None, "crop": crop})
            continue
        overlay = np.zeros((112, 112, 4), dtype=np.uint8)
        overlay[:, :, :3] = (83, 126, 44)
        overlay[:, :, 3] = mask * 130
        _, encoded = cv2.imencode(".png", overlay)
        results.append({
            "area": area,
            "mask": base64.b64encode(encoded).decode("ascii"),
            "crop": crop,
        })
    return results


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/":
            self.send_response(302)
            self.send_header("Location", "/rv-signal/index.html")
            self.end_headers()
            return
        if path not in ALLOWED_FILES:
            self.send_error(404)
            return
        if path.endswith(".webm"):
            self.send_video(head_only=False)
            return
        super().do_GET()

    def do_HEAD(self):
        path = urlsplit(self.path).path
        if path not in ALLOWED_FILES:
            self.send_error(404)
            return
        if path.endswith(".webm"):
            self.send_video(head_only=True)
            return
        super().do_HEAD()

    def send_video(self, head_only):
        video_path = ALLOWED_FILES[urlsplit(self.path).path]
        size = video_path.stat().st_size
        byte_range = self.headers.get("Range")
        start, end = 0, size - 1
        if byte_range:
            import re

            match = re.fullmatch(r"bytes=(\d+)-(\d*)", byte_range)
            if not match:
                self.send_error(416)
                return
            start = int(match.group(1))
            end = min(int(match.group(2)), size - 1) if match.group(2) else end
            if start >= size or end < start:
                self.send_error(416)
                return
        self.send_response(206 if byte_range else 200)
        self.send_header("Content-Type", "video/webm")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        if byte_range:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        if not head_only:
            with video_path.open("rb") as stream:
                stream.seek(start)
                self.wfile.write(stream.read(end - start + 1))

    def do_POST(self):
        if urlsplit(self.path).path != "/rv-signal/api/analyze":
            self.send_error(404)
            return
        origin = self.headers.get("Origin")
        if origin not in {"http://127.0.0.1:8767", PUBLIC_ORIGIN} or self.headers.get("Host") != urlsplit(origin).netloc:
            self.send_error(403, "Only same-origin browser requests are accepted")
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 8_000_000:
                raise ValueError("Choose a shorter video or lower-resolution frames (8 MB request limit).")
            payload = json.loads(self.rfile.read(size))
            frames = payload.get("frames")
            if not isinstance(frames, list) or not 3 <= len(frames) <= 32 or not all(isinstance(item, str) for item in frames):
                raise ValueError("Expected 3–32 encoded video frames.")
            response = {"results": segment_frames(frames)}
            code = 200
        except (ValueError, FileNotFoundError) as error:
            response = {"error": str(error)}
            code = 422
        except Exception:
            self.log_error("Inference failed")
            response = {"error": "Model inference failed. Check the server console and video format."}
            code = 500
        body = json.dumps(response).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print("Heart Echo AI: http://127.0.0.1:8767/rv-signal/index.html")
    HTTPServer(("127.0.0.1", 8767), Handler).serve_forever()
