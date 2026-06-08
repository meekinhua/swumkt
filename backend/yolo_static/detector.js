// ====================================================================
//  On-device YOLO detector — runs fully in the browser via
//  onnxruntime-web (WASM + SIMD). No server compute.
//  Output matches the server WebSocket shape:
//    { detections:[{box:[x1,y1,x2,y2], name, conf}], counts, total, infer_ms, fw, fh }
//  Boxes are in the SOURCE frame's pixel coordinates.
// ====================================================================

const COCO_NAMES = [
  "person","bicycle","car","motorcycle","airplane","bus","train","truck","boat",
  "traffic light","fire hydrant","stop sign","parking meter","bench","bird","cat",
  "dog","horse","sheep","cow","elephant","bear","zebra","giraffe","backpack",
  "umbrella","handbag","tie","suitcase","frisbee","skis","snowboard","sports ball",
  "kite","baseball bat","baseball glove","skateboard","surfboard","tennis racket",
  "bottle","wine glass","cup","fork","knife","spoon","bowl","banana","apple",
  "sandwich","orange","broccoli","carrot","hot dog","pizza","donut","cake","chair",
  "couch","potted plant","bed","dining table","toilet","tv","laptop","mouse",
  "remote","keyboard","cell phone","microwave","oven","toaster","sink",
  "refrigerator","book","clock","vase","scissors","teddy bear","hair drier",
  "toothbrush",
];

class OnDeviceDetector {
  constructor() {
    this.session = null;
    this.size = 320;
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    this.input = null;
    this.ready = false;
  }

  _alloc(size) {
    this.size = size;
    this.canvas.width = size;
    this.canvas.height = size;
    this.input = new Float32Array(3 * size * size);
  }

  async init({ size = 320, modelUrl = "/api/yolo/models/yolo11n.onnx", onStatus } = {}) {
    onStatus && onStatus("กำลังเตรียมเครื่องตรวจจับ…");
    ort.env.wasm.wasmPaths = "/api/yolo/vendor/ort/";
    ort.env.wasm.simd = true;
    ort.env.wasm.numThreads =
      self.crossOriginIsolated && navigator.hardwareConcurrency
        ? Math.min(4, navigator.hardwareConcurrency)
        : 1;

    this._alloc(size);
    onStatus && onStatus("กำลังโหลดโมเดลลงเครื่อง (ครั้งแรก ~10MB)…");
    this.session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    this.inputName = this.session.inputNames[0];
    this.outputName = this.session.outputNames[0];
    this.ready = true;
    onStatus && onStatus(`พร้อม (on-device · ${ort.env.wasm.numThreads} thread)`);
  }

  setSize(size) {
    if (size !== this.size) this._alloc(size);
  }

  async detect(source, { conf = 0.35, classIds = null, iou = 0.45 } = {}) {
    const S = this.size;
    const sw = source.naturalWidth || source.videoWidth || source.width;
    const sh = source.naturalHeight || source.videoHeight || source.height;
    if (!sw || !sh) return { detections: [], counts: {}, total: 0, infer_ms: 0, fw: 0, fh: 0 };

    // letterbox into SxS
    const r = Math.min(S / sw, S / sh);
    const nw = Math.round(sw * r), nh = Math.round(sh * r);
    const padX = (S - nw) / 2, padY = (S - nh) / 2;
    const ctx = this.ctx;
    ctx.fillStyle = "rgb(114,114,114)";
    ctx.fillRect(0, 0, S, S);
    ctx.drawImage(source, padX, padY, nw, nh);
    const { data } = ctx.getImageData(0, 0, S, S);

    // HWC uint8 RGBA -> CHW float32 RGB /255
    const f = this.input, area = S * S;
    for (let i = 0; i < area; i++) {
      f[i] = data[i * 4] / 255;
      f[area + i] = data[i * 4 + 1] / 255;
      f[2 * area + i] = data[i * 4 + 2] / 255;
    }

    const tensor = new ort.Tensor("float32", f, [1, 3, S, S]);
    const t0 = performance.now();
    const out = await this.session.run({ [this.inputName]: tensor });
    const infer = performance.now() - t0;

    const o = out[this.outputName];
    const N = o.dims[2];          // anchors
    const nc = o.dims[1] - 4;     // classes
    const d = o.data;

    const boxes = [], scores = [], clsIdx = [];
    for (let i = 0; i < N; i++) {
      let best = 0, bc = 0;
      for (let k = 0; k < nc; k++) {
        const s = d[(4 + k) * N + i];
        if (s > best) { best = s; bc = k; }
      }
      if (best < conf) continue;
      if (classIds && !classIds.has(bc)) continue;
      const cx = d[i], cy = d[N + i], w = d[2 * N + i], h = d[3 * N + i];
      const x1 = (cx - w / 2 - padX) / r;
      const y1 = (cy - h / 2 - padY) / r;
      const x2 = (cx + w / 2 - padX) / r;
      const y2 = (cy + h / 2 - padY) / r;
      boxes.push([x1, y1, x2, y2]); scores.push(best); clsIdx.push(bc);
    }

    const keep = nms(boxes, scores, iou);
    const detections = [], counts = {};
    for (const i of keep) {
      const name = COCO_NAMES[clsIdx[i]];
      counts[name] = (counts[name] || 0) + 1;
      const b = boxes[i];
      detections.push({
        box: [
          Math.max(0, b[0]), Math.max(0, b[1]),
          Math.min(sw, b[2]), Math.min(sh, b[3]),
        ],
        name,
        conf: Math.round(scores[i] * 100) / 100,
      });
    }
    return {
      detections,
      counts,
      total: detections.length,
      infer_ms: Math.round(infer * 10) / 10,
      fw: sw,
      fh: sh,
    };
  }
}

// Greedy NMS — returns indices to keep
function nms(boxes, scores, iouThr) {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const keep = [];
  const removed = new Uint8Array(boxes.length);
  for (let m = 0; m < idx.length; m++) {
    const i = idx[m];
    if (removed[i]) continue;
    keep.push(i);
    for (let n = m + 1; n < idx.length; n++) {
      const j = idx[n];
      if (removed[j]) continue;
      if (iou(boxes[i], boxes[j]) > iouThr) removed[j] = 1;
    }
  }
  return keep;
}

function iou(a, b) {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]), y2 = Math.min(a[3], b[3]);
  const w = Math.max(0, x2 - x1), h = Math.max(0, y2 - y1);
  const inter = w * h;
  const areaA = (a[2] - a[0]) * (a[3] - a[1]);
  const areaB = (b[2] - b[0]) * (b[3] - b[1]);
  return inter / (areaA + areaB - inter + 1e-9);
}

window.OnDeviceDetector = OnDeviceDetector;
window.COCO_NAMES = COCO_NAMES;
