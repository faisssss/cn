// Image + PDF work for CN Desk. Runs in the side panel (needs DOM canvas, pdf.js, jsPDF).
/* global pdfjsLib, jspdf */

pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

export const LIMITS = { photo: 195 * 1024, sign: 70 * 1024, pdf: 500 * 1024 };
export const PHOTO_W = 631, PHOTO_H = 645;
const SAFETY = 0.94; // aim a bit under each limit

// ---------- canvas basics ----------

export function newCanvas(w, h, fill = '#fff') {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  if (fill) { const x = c.getContext('2d'); x.fillStyle = fill; x.fillRect(0, 0, c.width, c.height); }
  return c;
}
export function cloneCanvas(c) { const d = newCanvas(c.width, c.height, null); d.getContext('2d').drawImage(c, 0, 0); return d; }
export function scaleTo(c, maxSide) {
  const k = Math.min(1, maxSide / Math.max(c.width, c.height));
  if (k === 1) return c;
  const d = newCanvas(c.width * k, c.height * k);
  const x = d.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, d.width, d.height);
  return d;
}
export function crop(c, r) {
  const d = newCanvas(r.w, r.h);
  d.getContext('2d').drawImage(c, r.x, r.y, r.w, r.h, 0, 0, d.width, d.height);
  return d;
}
export function rotate90(c, dir) {
  const d = newCanvas(c.height, c.width);
  const x = d.getContext('2d');
  x.translate(d.width / 2, d.height / 2); x.rotate(dir * Math.PI / 2); x.drawImage(c, -c.width / 2, -c.height / 2);
  return d;
}
export function rotateDeg(c, deg) {
  if (Math.abs(deg) < 0.05) return c;
  const r = deg * Math.PI / 180, s = Math.abs(Math.sin(r)), co = Math.abs(Math.cos(r));
  const d = newCanvas(c.width * co + c.height * s, c.width * s + c.height * co);
  const x = d.getContext('2d'); x.imageSmoothingQuality = 'high';
  x.translate(d.width / 2, d.height / 2); x.rotate(r); x.drawImage(c, -c.width / 2, -c.height / 2);
  return d;
}
export const toDataURL = (c, q = 0.9) => c.toDataURL('image/jpeg', q);
export function loadImageURL(url) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not open image')); i.src = url; });
}
export async function canvasFromURL(url) {
  const i = await loadImageURL(url);
  const c = newCanvas(i.naturalWidth, i.naturalHeight); c.getContext('2d').drawImage(i, 0, 0); return c;
}
function gray(c) { // Uint8 luminance of the canvas
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const g = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
  return g;
}

// ---------- reading files ----------

export const isPdf = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');

export async function fileToCanvases(file) {
  if (isPdf(file)) {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const out = [];
    for (let n = 1; n <= pdf.numPages; n++) out.push(await renderPdfPage(pdf, n, 2400));
    return out;
  }
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, 3200 / Math.max(bmp.width, bmp.height));
  const c = newCanvas(bmp.width * k, bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return [c];
}
async function renderPdfPage(pdf, n, maxSide) {
  const page = await pdf.getPage(n);
  const v1 = page.getViewport({ scale: 1 });
  const scale = Math.min(300 / 72, maxSide / Math.max(v1.width, v1.height));
  const vp = page.getViewport({ scale });
  const c = newCanvas(vp.width, vp.height);
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return c;
}

// ---------- scanned page clean-up ----------

// Remove dark scanner borders (columns/rows at the edges that are mostly dark).
function trimDarkEdges(c) {
  const s = scaleTo(c, 900), g = gray(s), W = s.width, H = s.height;
  const darkFrac = (get, len) => { let n = 0; for (let i = 0; i < len; i++) if (get(i) < 90) n++; return n / len; };
  let l = 0, r = W - 1, t = 0, b = H - 1;
  const lim = 0.08;
  while (l < W * lim && darkFrac(y => g[y * W + l], H) > 0.5) l++;
  while (r > W * (1 - lim) && darkFrac(y => g[y * W + r], H) > 0.5) r--;
  while (t < H * lim && darkFrac(x => g[t * W + x], W) > 0.5) t++;
  while (b > H * (1 - lim) && darkFrac(x => g[b * W + x], W) > 0.5) b--;
  if (!l && !t && r === W - 1 && b === H - 1) return c;
  const e = 4;                                   // trim a few more pixels so no grey line is left
  if (l) l += e; if (t) t += e; if (r < W - 1) r -= e; if (b < H - 1) b -= e;
  const k = c.width / W;
  return crop(c, { x: l * k, y: t * k, w: (r - l + 1) * k, h: (b - t + 1) * k });
}

// Small tilt (±4°) from the projection profile of ink rows.
export function deskewAngle(c) {
  const s = scaleTo(c, 800), g = gray(s), W = s.width, H = s.height;
  const pts = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (g[y * W + x] < 140) pts.push(x, y);
  if (pts.length < 400) return 0;
  let best = 0, bestScore = -1;
  for (let a = -4; a <= 4.001; a += 0.25) {
    const r = a * Math.PI / 180, sn = Math.sin(r), cs = Math.cos(r);
    const bins = new Float32Array(H * 2 + 10);
    for (let i = 0; i < pts.length; i += 2) {
      const yy = Math.round(-pts[i] * sn + pts[i + 1] * cs + H / 2);
      if (yy >= 0 && yy < bins.length) bins[yy]++;
    }
    let sc = 0; for (let i = 1; i < bins.length; i++) { const d = bins[i] - bins[i - 1]; sc += d * d; }
    if (sc > bestScore) { bestScore = sc; best = a; }
  }
  return -best;
}

// Bounding box of everything written/printed (keeps faint pen), plus a margin.
// Small isolated marks near the edges (scanner specks, dust) are ignored.
export function contentBox(c, margin = 0.025) {
  const s = scaleTo(c, 1000), g = gray(s), W = s.width, H = s.height;
  const thr = 205;
  const colInk = new Uint32Array(W), rowInk = new Uint32Array(H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y * W + x] < thr) { colInk[x]++; rowInk[y]++; }
  const rows = mainSpan(rowInk, Math.max(2, W * 0.003), Math.round(H * 0.04));
  const cols = mainSpan(colInk, Math.max(2, H * 0.003), Math.round(W * 0.04));
  if (!rows || !cols) return { x: 0, y: 0, w: c.width, h: c.height };
  let [t, b] = rows, [l, r] = cols;
  if (r - l < 20 || b - t < 20) return { x: 0, y: 0, w: c.width, h: c.height };
  const k = c.width / W, m = Math.round(Math.max(W, H) * margin);
  l = Math.max(0, l - m); t = Math.max(0, t - m); r = Math.min(W - 1, r + m); b = Math.min(H - 1, b + m);
  return { x: l * k, y: t * k, w: (r - l + 1) * k, h: (b - t + 1) * k };
}
// Split a profile into blocks separated by empty gaps; drop tiny blocks at either end.
function mainSpan(p, minLine, gap) {
  const blocks = []; let cur = null, empty = 0;
  for (let i = 0; i < p.length; i++) {
    if (p[i] >= minLine) {
      if (!cur || empty >= gap) { cur = { a: i, b: i, ink: 0 }; blocks.push(cur); }
      cur.b = i; cur.ink += p[i]; empty = 0;
    } else if (cur) { empty++; cur.ink += p[i]; }
  }
  if (!blocks.length) return null;
  const total = blocks.reduce((t, b) => t + b.ink, 0);
  let i = 0, j = blocks.length - 1;
  while (i < j && blocks[i].ink < total * 0.01) i++;
  while (j > i && blocks[j].ink < total * 0.01) j--;
  return [blocks[i].a, blocks[j].b];
}

// Paper whiter, ink a little darker; colours kept.
export function whiten(c) {
  const o = cloneCanvas(c), x = o.getContext('2d'), img = x.getImageData(0, 0, o.width, o.height), d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 16) hist[(d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8]++;
  const total = d.length / 16; let acc = 0, paper = 255;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.4) { paper = v; break; } }
  const white = Math.max(170, Math.min(250, paper - 6)), black = 18;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = (v - black) * 255 / (white - black);
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  x.putImageData(img, 0, 0); return o;
}

// Sharpness (variance of Laplacian) and brightness → warnings.
export function quality(c) {
  const s = scaleTo(c, 1000), g = gray(s), W = s.width, H = s.height;
  let sum = 0, sum2 = 0, n = 0, mean = 0;
  for (let i = 0; i < g.length; i++) mean += g[i];
  mean /= g.length;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, L = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - W] - g[i + W];
    sum += L; sum2 += L * L; n++;
  }
  const v = sum2 / n - (sum / n) ** 2;
  const warn = [];
  if (v < 60) warn.push('Looks blurry – rescan if text is hard to read');
  if (mean < 150) warn.push('Looks dark – rescan or check the scanner lid');
  return { sharp: Math.round(v), mean: Math.round(mean), warn };
}

// Text lines run along the rows → strong row profile. Returns true if lines look vertical (page sideways).
function looksSideways(c) {
  const s = scaleTo(c, 700), g = gray(s), W = s.width, H = s.height;
  const rows = new Float32Array(H), cols = new Float32Array(W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y * W + x] < 140) { rows[y]++; cols[x]++; }
  const sharp = (a, n) => { let t = 0; for (let i = 1; i < a.length; i++) t += (a[i] - a[i - 1]) ** 2; return t / a.length / (n * n); };
  return sharp(cols, H) > sharp(rows, W) * 1.6;
}

// Turn the page upright. Pages with a student photo: the face finder only sees an upright face.
export async function uprightPage(c, hasPhoto) {
  if (hasPhoto) {
    try {
      const det = await getDetector();
      let best = { r: 0, score: 0 };
      for (const r of [0, 1, 3, 2]) {
        const page = scaleTo(r ? rotateTimes(c, r) : c, 1600);
        const score = faceScoreTiled(det, page);
        if (score > best.score) best = { r, score };
        if (r === 0 && score > 0.8) break;
      }
      if (best.score > 0.6) return { canvas: best.r ? rotateTimes(c, best.r) : c, turned: best.r, sure: true, how: 'face ' + best.score.toFixed(2) };
    } catch (e) { console.warn('upright by face failed', e); }
    return { canvas: c, turned: 0, sure: false, how: 'no face' };   // tables fool the text check, so leave it
  }
  if (looksSideways(c)) return { canvas: rotate90(c, -1), turned: 3, sure: false, how: 'text' };
  return { canvas: c, turned: 0, sure: true, how: 'text' };
}
const rotateTimes = (c, n) => { let o = c; for (let i = 0; i < n; i++) o = rotate90(o, 1); return o; };
function faceScoreTiled(det, page) {
  const T = Math.round(Math.min(page.width, page.height) / 3.5), step = Math.round(T / 2);
  let best = 0;
  for (let y = 0; y + T <= page.height + 1; y += step) for (let x = 0; x + T <= page.width + 1; x += step) {
    const tile = crop(page, { x: Math.min(x, page.width - T), y: Math.min(y, page.height - T), w: T, h: T });
    for (const d of det.detect(tile).detections || []) best = Math.max(best, (d.categories && d.categories[0] && d.categories[0].score) || 0);
  }
  return best;
}

export async function autoProcess(c, { hasPhoto = false } = {}) {
  let o = trimDarkEdges(c);
  const up = await uprightPage(o, hasPhoto);
  o = up.canvas;
  const a = deskewAngle(o);
  if (Math.abs(a) >= 0.25) o = rotateDeg(o, a);
  o = crop(o, contentBox(o));
  o = whiten(o);
  const q = quality(o);
  if (up.turned && !up.sure) q.warn.unshift('Page was sideways and has been turned – check it is the right way up');
  if (!up.turned && !up.sure) q.warn.unshift('Could not confirm which way is up – check it, use ⟲ ⟳ if needed');
  return { canvas: scaleTo(o, 2200), angle: a, turned: up.turned, how: up.how, ...q };
}

export function signatureProcess(c) {
  let o = trimDarkEdges(c);
  o = crop(o, contentBox(o, 0.04));
  o = whiten(o);
  return scaleTo(o, 900);
}

// ---------- encoding under a size limit ----------

const toBlob = (c, q) => new Promise(r => c.toBlob(r, 'image/jpeg', q));

export async function jpegUnder(c, limit, { fixed = false } = {}) {
  const target = limit * SAFETY;
  let cur = c;
  for (let round = 0; round < 8; round++) {
    let lo = 0.4, hi = 0.95, best = null;
    const top = await toBlob(cur, hi);
    if (top.size <= target) return top;
    for (let i = 0; i < 7; i++) {
      const q = (lo + hi) / 2, b = await toBlob(cur, q);
      if (b.size <= target) { best = b; lo = q; } else hi = q;
    }
    if (best) return best;
    if (fixed) return toBlob(cur, 0.3);
    cur = scaleTo(cur, Math.max(cur.width, cur.height) * 0.8);
  }
  return toBlob(cur, 0.4);
}

// Pages → one PDF under the limit (A4 width, height follows the page).
export async function pdfUnder(canvases, limit = LIMITS.pdf) {
  const target = limit * SAFETY;
  let maxSide = 2000, q = 0.82, out = null;
  for (let round = 0; round < 12; round++) {
    const doc = new jspdf.jsPDF({ unit: 'pt', format: 'a4', compress: true });
    canvases.forEach((c, i) => {
      const s = scaleTo(c, maxSide);
      const W = 595, H = Math.round(595 * s.height / s.width);
      if (i === 0) doc.deletePage(1);
      doc.addPage([W, H], W > H ? 'l' : 'p');
      doc.addImage(s.toDataURL('image/jpeg', q), 'JPEG', 0, 0, W, H, undefined, 'FAST');
    });
    out = doc.output('blob');
    if (out.size <= target) return out;
    if (q > 0.55) q -= 0.1; else maxSide *= 0.85;
  }
  return out;
}

// A PDF the user already has (BVC): untouched if small enough, otherwise re-built just under the limit.
export async function fitExistingFile(file, limit = LIMITS.pdf) {
  if (isPdf(file) && file.size <= limit) {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    return { blob: new Blob([await file.arrayBuffer()], { type: 'application/pdf' }), pages: pdf.numPages, changed: false };
  }
  const pages = await fileToCanvases(file);
  return { blob: await pdfUnder(pages, limit), pages: pages.length, changed: true };
}

// ---------- photo ----------

let detectorPromise = null;
async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FaceDetector } = await import('./vision/vision_bundle.mjs');
      return FaceDetector.createFromOptions(
        { wasmLoaderPath: chrome.runtime.getURL('vision/vision_wasm_internal.js'), wasmBinaryPath: chrome.runtime.getURL('vision/vision_wasm_internal.wasm') },
        { baseOptions: { modelAssetPath: chrome.runtime.getURL('vision/blaze_face_short_range.tflite') }, runningMode: 'IMAGE', minDetectionConfidence: 0.4 });
    })();
  }
  return detectorPromise;
}

// Crop rectangle (in source pixels) with the head filling ~faceShare of the photo height.
export async function autoPhotoCrop(c, faceShare = 0.7) {
  let face = null;
  try {
    const det = await getDetector();
    const s = scaleTo(c, 1200), k = c.width / s.width;
    const res = det.detect(s);
    const best = (res.detections || []).sort((a, b) => b.boundingBox.width * b.boundingBox.height - a.boundingBox.width * a.boundingBox.height)[0];
    if (best) { const bb = best.boundingBox; face = { x: bb.originX * k, y: bb.originY * k, w: bb.width * k, h: bb.height * k }; }
  } catch (e) { console.warn('face detector unavailable', e); }
  const ar = PHOTO_W / PHOTO_H;
  let h, cx, top;
  if (face) {
    const headH = face.h * 1.45;               // detector box ≈ eyebrows→chin; add forehead + hair
    const chin = face.y + face.h * 1.02;
    h = headH / faceShare;
    cx = face.x + face.w / 2;
    top = (chin - headH) - (h - headH) * 0.5;
  } else {
    h = Math.min(c.height, c.width / ar); cx = c.width / 2; top = (c.height - h) / 2;
  }
  return fitRect({ x: cx - (h * ar) / 2, y: top, w: h * ar, h }, c, ar, !!face);
}
export function fitRect(r, c, ar, found = true) {
  let { x, y, w, h } = r;
  if (w > c.width) { w = c.width; h = w / ar; }
  if (h > c.height) { h = c.height; w = h * ar; }
  x = Math.max(0, Math.min(c.width - w, x)); y = Math.max(0, Math.min(c.height - h, y));
  return { x, y, w, h, found };
}
export async function photoOut(c, r) {
  const d = newCanvas(PHOTO_W, PHOTO_H);
  const x = d.getContext('2d'); x.imageSmoothingQuality = 'high';
  x.drawImage(c, r.x, r.y, r.w, r.h, 0, 0, PHOTO_W, PHOTO_H);
  return jpegUnder(d, LIMITS.photo, { fixed: true });
}

// ---------- labels ----------

// pos: {x, y, w} as fractions of page width/height (w = label width / page width). space: add white strip on top.
export function composeLabel(page, labelImg, pos, on, space) {
  if (!on || !labelImg) return page;
  const lw = pos.w * page.width, lh = lw * labelImg.naturalHeight / labelImg.naturalWidth;
  const strip = space ? Math.round(lh + page.width * 0.03) : 0;
  const o = newCanvas(page.width, page.height + strip);
  const x = o.getContext('2d');
  x.drawImage(page, 0, strip);
  x.drawImage(labelImg, pos.x * page.width, space ? page.width * 0.015 : pos.y * page.height, lw, lh);
  return o;
}

// Is there ink where the label would sit? (to suggest a white strip)
export function inkUnder(page, labelImg, pos) {
  const lw = pos.w * page.width, lh = lw * labelImg.naturalHeight / labelImg.naturalWidth;
  const r = { x: pos.x * page.width, y: pos.y * page.height, w: lw, h: lh };
  const s = crop(page, r), g = gray(scaleTo(s, 400));
  let n = 0; for (let i = 0; i < g.length; i++) if (g[i] < 150) n++;
  return n / g.length > 0.01;
}

export const blobToDataURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
export const dataURLToBlob = async u => (await fetch(u)).blob();
export const kb = n => Math.round(n / 1024);
