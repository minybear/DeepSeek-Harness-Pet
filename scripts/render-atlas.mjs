// render-atlas.mjs — software-rasterize the dsh-pet atlas to a PNG so the
// generated sprite can be visually verified without a browser.
//
// This is a faithful port of lib/client.js's buildDefaultAsset/drawCell/
// drawCreature geometry (same cell grid, same shape coordinates), backed by a
// tiny SDF rasterizer + PNG encoder. Output: assets/dsh-pet-spritesheet.png.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// ---- colors (must match lib/client.js) --------------------------------------
const C_OUTLINE = [0x1f, 0x24, 0x30, 255];
const C_BODY = [0x35, 0xc1, 0xa9, 255];
const C_BELLY = [0x8e, 0xf0, 0xda, 255];
const C_ACCENT = [0xff, 0xb8, 0x4d, 255];
const C_EYE = [0x1f, 0x24, 0x30, 255];
const C_WHITE = [255, 255, 255, 255];

const CELL = { width: 96, height: 104, columns: 8, rows: 9 };
const STATE_FRAME_COUNTS = {
	idle: 6, 'running-right': 8, 'running-left': 8, waving: 4,
	jumping: 5, failed: 8, waiting: 6, running: 6, review: 6,
};

// ---- pixel buffer -----------------------------------------------------------
class Pix {
	constructor(w, h) { this.w = w; this.h = h; this.buf = new Uint8Array(w * h * 4); }
	put(x, y, c) {
		if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
		const i = (y * this.w + x) * 4;
		this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2]; this.buf[i + 3] = c[3];
	}
	// draw a filled region where inside(x,y) is true, over bbox [x0,x1]x[y0,y1]
	fill(fn, x0, y0, x1, y1, color) {
		x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
		x1 = Math.min(this.w - 1, Math.ceil(x1)); y1 = Math.min(this.h - 1, Math.ceil(y1));
		for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (fn(x + 0.5, y + 0.5)) this.put(x, y, color);
	}
}

// signed distance helpers (sample at pixel centers)
const sdRoundRect = (px, py, x, y, w, h, r) => {
	const cx = x + w / 2, cy = y + h / 2;
	const qx = Math.abs(px - cx) - (w / 2 - r);
	const qy = Math.abs(py - cy) - (h / 2 - r);
	const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
	return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
};
const sdCircle = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) - r;
const sdSegment = (px, py, ax, ay, bx, by) => {
	const vx = bx - ax, vy = by - ay;
	const len2 = vx * vx + vy * vy;
	const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
	return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
};

// ---- graphics surface (primitive drawing) -----------------------------------
function makeG(pix) {
	return {
		fillRoundRect(x, y, w, h, r, c) { pix.fill((px, py) => sdRoundRect(px, py, x, y, w, h, r) <= 0, x, y, x + w, y + h, c); },
		strokeRoundRect(x, y, w, h, r, lw, c) { pix.fill((px, py) => { const d = sdRoundRect(px, py, x, y, w, h, r); return Math.abs(d) <= lw / 2; }, x - lw, y - lw, x + w + lw, y + h + lw, c); },
		fillRect(x, y, w, h, c) { pix.fill(() => true, x, y, x + w, y + h, c); },
		fillCircle(cx, cy, r, c) { pix.fill((px, py) => sdCircle(px, py, cx, cy, r) <= 0, cx - r, cy - r, cx + r, cy + r, c); },
		strokeCircle(cx, cy, r, lw, c) { pix.fill((px, py) => Math.abs(sdCircle(px, py, cx, cy, r)) <= lw / 2, cx - r - lw, cy - r - lw, cx + r + lw, cy + r + lw, c); },
		line(ax, ay, bx, by, lw, c) { pix.fill((px, py) => sdSegment(px, py, ax, ay, bx, by) <= lw / 2, Math.min(ax, bx) - lw, Math.min(ay, by) - lw, Math.max(ax, bx) + lw, Math.max(ay, by) + lw, c); },
	};
}

// ---- draw port (absolute coords; identical geometry to lib/client.js) --------
function drawEye(g, x, y, mode, px) {
	if (mode === 'blink') g.fillRect(x - 5, y - 1, 10, 2, C_EYE);
	else if (mode === 'x') {
		g.line(x - 3.5, y - 3.5, x + 3.5, y + 3.5, 2, C_EYE);
		g.line(x + 3.5, y - 3.5, x - 3.5, y + 3.5, 2, C_EYE);
	} else {
		const r = mode === 'narrow' ? 2.6 : 4;
		g.fillCircle(x + px, y, r, C_EYE);
		if (mode !== 'narrow') g.fillCircle(x + px + 1.4, y - 1.4, 1.4, C_WHITE);
	}
}

function drawCreature(g, p) {
	const bw = 48, bh = 50;
	const bodyH = bh * p.s;
	const cx = p.cx, cy = p.cy + p.y;

	// antenna
	const tipX = p.droop ? -7 : 0;
	const tipY = -bodyH / 2 - 9 + (p.droop ? 8 : 0);
	g.line(cx, cy - bodyH / 2, cx + tipX, cy + tipY, 3, C_OUTLINE);
	g.fillCircle(cx + tipX, cy + tipY - 4, 4.5, C_ACCENT);

	// feet
	const fdx = p.foot * 6;
	g.fillRect(cx - bw / 2 + 5 + fdx, cy + bodyH / 2 - 2, 15, 6, C_OUTLINE);
	g.fillRect(cx + bw / 2 - 20 - fdx, cy + bodyH / 2 - 2, 15, 6, C_OUTLINE);

	// body
	g.fillRoundRect(cx - bw / 2, cy - bodyH / 2, bw, bodyH, 13, C_BODY);
	g.strokeRoundRect(cx - bw / 2, cy - bodyH / 2, bw, bodyH, 13, 2.5, C_OUTLINE);

	// belly
	g.fillRoundRect(cx - bw / 2 + 8, cy - bodyH / 2 + 11, bw - 16, bodyH - 22, 8, C_BELLY);

	// waving arm
	if (p.arm) {
		g.line(cx + bw / 2 - 2, cy + 2, cx + bw / 2 + 8, cy - 12, 6, C_BODY);
		g.line(cx + bw / 2 + 8, cy - 12, cx + bw / 2 + 12, cy - 22, 6, C_BODY);
		g.fillCircle(cx + bw / 2 + 12, cy - 23, 3.5, C_OUTLINE);
	}

	// eyes
	const eyeY = cy - bodyH / 2 + 17;
	drawEye(g, cx - 9, eyeY, p.eyes, p.px);
	drawEye(g, cx + 9, eyeY, p.eyes, p.px);

	// working gear
	if (p.gear) {
		g.fillCircle(cx, cy - bodyH / 2 - 16, 4, C_ACCENT);
		g.strokeCircle(cx, cy - bodyH / 2 - 16, 6.5, 1.5, C_OUTLINE);
	}
}

function drawCell(pix, g, col, row, state, f, total) {
	const px = col * CELL.width, py = row * CELL.height;
	const cx = px + CELL.width / 2;
	const cy = py + CELL.height / 2 + 4;
	let o = { cx, cy, s: 1, y: 0, eyes: 'open', px: 0, arm: false, foot: 0, flat: false, droop: false, gear: false };
	switch (state) {
		case 'idle': o.s = 1 + 0.03 * Math.sin((f / total) * Math.PI * 2); if (f % 3 === 2) o.eyes = 'blink'; break;
		case 'running-right': o.foot = f % 2 === 0 ? 1 : -1; o.px = 1.5; break;
		case 'running-left': o.foot = f % 2 === 0 ? -1 : 1; o.px = -1.5; break;
		case 'waving': o.arm = true; o.s = f % 2 === 0 ? 1.03 : 1; break;
		case 'jumping': { const seq = [0, -14, -24, -14, 0]; o.y = seq[f] ?? 0; o.s = f === 0 ? 1.08 : f === 4 ? 0.9 : 1; break; }
		case 'failed': o.flat = true; o.s = 0.72; o.eyes = 'x'; o.droop = true; o.y = 8; break;
		case 'waiting': o.px = f % 4 < 2 ? -2 : 2; o.s = 1.02; break;
		case 'running': o.eyes = 'narrow'; o.gear = true; o.s = 1 + 0.02 * Math.sin((f / total) * Math.PI * 2); o.px = 0.5; break;
		case 'review': { const scan = [-2.5, -1.2, 0, 1.2, 2.5, 1.2]; o.px = scan[f] ?? 0; break; }
	}
	drawCreature(g, o);
}

// ---- PNG encoder -------------------------------------------------------------
const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();
function crc32(buf) {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
	const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
	const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
	return Buffer.concat([len, td, crc]);
}
function encodePng(pix) {
	const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(pix.w, 0); ihdr.writeUInt32BE(pix.h, 4);
	ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
	const stride = pix.w * 4;
	const raw = Buffer.alloc((stride + 1) * pix.h);
	for (let y = 0; y < pix.h; y++) {
		raw[y * (stride + 1)] = 0; // filter none
		Buffer.from(pix.buf.buffer, pix.buf.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
	}
	return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- render -------------------------------------------------------------------
const W = CELL.columns * CELL.width, H = CELL.rows * CELL.height;
const pix = new Pix(W, H);
const g = makeG(pix);
const order = ['idle', 'running-right', 'running-left', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review'];
for (let row = 0; row < order.length; row++) {
	const state = order[row];
	const count = STATE_FRAME_COUNTS[state];
	for (let f = 0; f < count; f++) drawCell(pix, g, f, row, state, f, count);
}

// ---- verify grid invariants (row tail must be empty, used cells non-empty) ----
function countOpaque(px, col, row) {
	let n = 0;
	const x0 = col * CELL.width, y0 = row * CELL.height;
	for (let y = y0; y < y0 + CELL.height; y++) for (let x = x0; x < x0 + CELL.width; x++) {
		if (px.buf[(y * px.w + x) * 4 + 3] !== 0) n++;
	}
	return n;
}
let ok = true;
for (let row = 0; row < order.length; row++) {
	const state = order[row];
	const count = STATE_FRAME_COUNTS[state];
	for (let col = 0; col < CELL.columns; col++) {
		const opaque = countOpaque(pix, col, row);
		if (col < count && opaque === 0) { console.error(`FAIL: ${state} col ${col} is empty`); ok = false; }
		if (col >= count && opaque !== 0) { console.error(`FAIL: ${state} col ${col} should be empty, got ${opaque} opaque px`); ok = false; }
	}
}
console.log(ok ? 'atlas invariants: PASS' : 'atlas invariants: FAIL');

const out = resolve(here, '../assets/dsh-pet-spritesheet.png');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, encodePng(pix));
console.log(`wrote ${out} (${W}x${H})`);
