/* In-browser dental caries detector: YOLO26n exported to ONNX, run with onnxruntime-web.
   Images never leave the visitor's device. */
(() => {
  const root = document.getElementById('detector');
  if (!root) return;

  const ORT_VERSION = '1.20.1';
  const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
  const SIZE = 640;
  const MAX_SIDE = 1280; // display resolution cap

  const fileInput = document.getElementById('det-file');
  const zone = root.querySelector('.dropzone');
  const canvas = document.getElementById('det-canvas');
  const ctx = canvas.getContext('2d');
  const thr = document.getElementById('det-thr');
  const thrOut = document.getElementById('det-thr-out');
  const status = document.getElementById('det-status');

  let session = null;
  let loading = null;
  let current = null; // { img, dets: [{x1,y1,x2,y2,score}] } in original image pixels

  const setStatus = (msg, isError = false) => {
    status.textContent = msg;
    status.classList.toggle('error', isError);
  };

  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });

  const getSession = () => {
    if (session) return Promise.resolve(session);
    if (!loading) {
      loading = (async () => {
        setStatus('Loading model (≈20 MB, first time only)…');
        if (!window.ort) await loadScript(ORT_BASE + 'ort.min.js');
        ort.env.wasm.wasmPaths = ORT_BASE;
        ort.env.wasm.numThreads = 1; // multi-threading needs cross-origin isolation headers
        session = await ort.InferenceSession.create(root.dataset.model, { executionProviders: ['wasm'] });
        return session;
      })().catch((e) => { loading = null; throw e; });
    }
    return loading;
  };

  // Letterbox to 640x640 (grey padding), like Ultralytics does.
  const preprocess = (img) => {
    const scale = Math.min(SIZE / img.naturalWidth, SIZE / img.naturalHeight);
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const padX = Math.floor((SIZE - w) / 2), padY = Math.floor((SIZE - h) / 2);
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(114,114,114)';
    g.fillRect(0, 0, SIZE, SIZE);
    g.drawImage(img, padX, padY, w, h);
    const { data } = g.getImageData(0, 0, SIZE, SIZE);
    const n = SIZE * SIZE, chw = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
      chw[i] = data[i * 4] / 255;
      chw[n + i] = data[i * 4 + 1] / 255;
      chw[2 * n + i] = data[i * 4 + 2] / 255;
    }
    return { tensor: new ort.Tensor('float32', chw, [1, 3, SIZE, SIZE]), scale, padX, padY };
  };

  const iou = (a, b) => {
    const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
    const iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
    const inter = ix * iy;
    return inter / ((a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter);
  };
  const nms = (boxes, t = 0.7) => {
    const keep = [];
    for (const b of boxes.sort((p, q) => q.score - p.score)) if (keep.every((k) => iou(k, b) < t)) keep.push(b);
    return keep;
  };

  // Supports YOLO26 end-to-end output [1, N, 6] (x1,y1,x2,y2,score,cls) and classic [1, 4+C, A] (needs NMS).
  const postprocess = (out, { scale, padX, padY }, img) => {
    const [, d1, d2] = out.dims, a = out.data, boxes = [];
    const toImg = (x1, y1, x2, y2, score) => ({
      x1: Math.max(0, (x1 - padX) / scale), y1: Math.max(0, (y1 - padY) / scale),
      x2: Math.min(img.naturalWidth, (x2 - padX) / scale), y2: Math.min(img.naturalHeight, (y2 - padY) / scale), score,
    });
    if (d2 === 6) {
      for (let i = 0; i < d1; i++) {
        const o = i * 6, s = a[o + 4];
        if (s >= 0.05) boxes.push(toImg(a[o], a[o + 1], a[o + 2], a[o + 3], s));
      }
      return boxes;
    }
    const classes = d1 - 4;
    for (let j = 0; j < d2; j++) {
      let s = 0;
      for (let c = 0; c < classes; c++) s = Math.max(s, a[(4 + c) * d2 + j]);
      if (s < 0.05) continue;
      const cx = a[j], cy = a[d2 + j], w = a[2 * d2 + j], h = a[3 * d2 + j];
      boxes.push(toImg(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, s));
    }
    return nms(boxes);
  };

  const draw = () => {
    if (!current) return;
    const { img, dets } = current;
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const t = parseFloat(thr.value);
    const shown = dets.filter((d) => d.score >= t);
    const lw = Math.max(2, canvas.width / 400), font = Math.max(12, Math.round(canvas.width / 55));
    ctx.font = `600 ${font}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    for (const d of shown) {
      const x = d.x1 * k, y = d.y1 * k, w = (d.x2 - d.x1) * k, h = (d.y2 - d.y1) * k;
      ctx.strokeStyle = '#F5B544'; ctx.lineWidth = lw; ctx.strokeRect(x, y, w, h);
      const label = `caries ${d.score.toFixed(2)}`;
      const tw = ctx.measureText(label).width + 10;
      const ly = y - font - 6 < 0 ? y : y - font - 6;
      ctx.fillStyle = '#F5B544'; ctx.fillRect(x, ly, tw, font + 6);
      ctx.fillStyle = '#1a1205'; ctx.fillText(label, x + 5, ly + 3);
    }
    setStatus(shown.length
      ? `${shown.length} possible ${shown.length === 1 ? 'lesion' : 'lesions'} at threshold ${t.toFixed(2)} · ran locally in ${current.ms} ms`
      : `No lesions above threshold ${t.toFixed(2)} · ran locally in ${current.ms} ms`);
  };

  const run = async (img) => {
    try {
      const s = await getSession();
      setStatus('Running detection in your browser…');
      const prep = preprocess(img);
      const t0 = performance.now();
      const out = await s.run({ [s.inputNames[0]]: prep.tensor });
      const ms = Math.round(performance.now() - t0);
      current = { img, dets: postprocess(out[s.outputNames[0]], prep, img), ms };
      window.__detections = current.dets; // read by the browser test
      zone.classList.add('has-image');
      draw();
    } catch (e) {
      console.error(e);
      setStatus('Could not run the model in this browser. Try a recent Chrome, Edge or Firefox.', true);
    }
  };

  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unreadable image'));
    img.src = src;
  });

  const handleFile = async (file) => {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return setStatus('Please choose a JPG, PNG or WebP image.', true);
    if (file.size > 15 * 1024 * 1024) return setStatus('That image is over 15 MB — please use a smaller one.', true);
    root.querySelectorAll('.sample').forEach((b) => b.classList.remove('is-active'));
    const url = URL.createObjectURL(file);
    try { await run(await loadImage(url)); } catch (e) { setStatus(e.message, true); } finally { URL.revokeObjectURL(url); }
  };

  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('is-drag'); }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('is-drag'); }));
  zone.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));

  root.querySelectorAll('.sample').forEach((btn) => btn.addEventListener('click', async () => {
    root.querySelectorAll('.sample').forEach((b) => b.classList.toggle('is-active', b === btn));
    try { await run(await loadImage(btn.dataset.src)); } catch (e) { setStatus(e.message, true); }
  }));

  thr.addEventListener('input', () => { thrOut.textContent = parseFloat(thr.value).toFixed(2); draw(); });

  // Warm up the model when the demo scrolls into view, so the first click feels instant.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); getSession().then(() => setStatus('Model ready — choose a photo.')).catch(() => {}); } });
    io.observe(root);
  }
})();
