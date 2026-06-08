// ====================================================================
//  OpenCV.js Web Worker — runs pipe (circle) detection OFF the main
//  thread so the UI never freezes while the 11MB WASM compiles/runs.
// ====================================================================
self.Module = {
  onRuntimeInitialized() {
    self.postMessage({ type: "ready" });
  },
};

try {
  self.importScripts("/api/yolo/vendor/opencv/opencv.js");
} catch (e) {
  self.postMessage({ type: "fatal", message: "importScripts failed: " + e });
}

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type !== "detect") return;
  const cv = self.cv;
  if (!cv || !cv.Mat) {
    self.postMessage({ type: "error", message: "OpenCV not ready" });
    return;
  }
  let src, gray, out;
  try {
    const p = msg.params;
    src = cv.matFromImageData(msg.imageData);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.medianBlur(gray, gray, 5);
    out = new cv.Mat();
    cv.HoughCircles(gray, out, cv.HOUGH_GRADIENT, 1.2, p.minDist, 120, p.param2, p.minR, p.maxR);
    const circles = [];
    for (let i = 0; i < out.cols; i++) {
      circles.push([out.data32F[i * 3], out.data32F[i * 3 + 1], out.data32F[i * 3 + 2]]);
    }
    self.postMessage({ type: "result", circles });
  } catch (err) {
    self.postMessage({ type: "error", message: String(err && err.message || err) });
  } finally {
    if (src) src.delete();
    if (gray) gray.delete();
    if (out) out.delete();
  }
};
