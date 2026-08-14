// render-atlas.mjs — software-rasterize the dsh-pet atlas to a PNG so the
// generated sprite can be visually verified without a browser.
//
// This is a faithful port of lib/client.js's buildDefaultAsset/drawCell/
// drawCreature geometry (same cell grid, same shape coordinates), backed by a
// tiny SDF rasterizer + PNG encoder.
//
// Usage:
//   node scripts/render-atlas.mjs            # dee -> assets/dsh-pet-spritesheet.png
//   node scripts/render-atlas.mjs amber      # one palette -> assets/dsh-pet-spritesheet-amber.png
//   node scripts/render-atlas.mjs --all      # every built-in palette

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// ---- palettes (must match lib/client.js BUILTIN_PETS) -------------------------
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const PALETTES = {
	dee: { body: '#35c1a9', belly: '#8ef0da', accent: '#ffb84d' },
	amber: { body: '#f2a03d', belly: '#ffd9a0', accent: '#35c1a9' },
	berry: { body: '#9b7ede', belly: '#d9ccff', accent: '#ff8fb2' },
};

// ---- colors (must match lib/client.js) --------------------------------------
const C_OUTLINE = [0x1f, 0x24, 0x30, 255];
const C_EYE = [0x1f, 0x24, 0x30, 255];
const C_WHITE = [255, 255, 255, 255];
const C_FOOD = [0xe3, 0x5d, 0x5d, 255];
const C_BALL = [0x5b, 0x8d, 0xef, 255];

const CELL = { width: 96, height: 104, columns: 8, rows: 12 };
const STATE_FRAME_COUNTS = {
	idle: 6, 'running-right': 8, 'running-left': 8, waving: 4,
	jumping: 5, failed: 8, waiting: 6, running: 6, review: 6,
};
const EXTRA_FRAME_COUNTS = { eat: 4, play: 4, drag: 4 };

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
		const r = mode === 'narrow' ? 2.6 : (mode === 'wide' ? 5 : 4);
		g.fillCircle(x + px, y, r, C_EYE);
		if (mode !== 'narrow') g.fillCircle(x + px + 1.4, y - 1.4, 1.4, C_WHITE);
	}
}

function drawCreature(g, p, pal) {
	const bw = 48, bh = 50;
	const bodyH = bh * p.s;
	const cx = p.cx, cy = p.cy + p.y;

	// antenna
	const tipX = p.droop ? -7 : 0;
	const tipY = -bodyH / 2 - 9 + (p.droop ? 8 : 0);
	g.line(cx, cy - bodyH / 2, cx + tipX, cy + tipY, 3, C_OUTLINE);
	g.fillCircle(cx + tipX, cy + tipY - 4, 4.5, pal.accent);

	// feet
	const fdx = p.foot * 6;
	const footY = bodyH / 2 - 2 + (p.dangle ? 7 : 0);
	g.fillRect(cx - bw / 2 + 5 + fdx, cy + footY, 15, 6, C_OUTLINE);
	g.fillRect(cx + bw / 2 - 20 - fdx, cy + footY, 15, 6, C_OUTLINE);

	// body
	g.fillRoundRect(cx - bw / 2, cy - bodyH / 2, bw, bodyH, 13, pal.body);
	g.strokeRoundRect(cx - bw / 2, cy - bodyH / 2, bw, bodyH, 13, 2.5, C_OUTLINE);

	// belly
	g.fillRoundRect(cx - bw / 2 + 8, cy - bodyH / 2 + 11, bw - 16, bodyH - 22, 8, pal.belly);

	// waving arm
	if (p.arm) {
		g.line(cx + bw / 2 - 2, cy + 2, cx + bw / 2 + 8, cy - 12, 6, pal.body);
		g.line(cx + bw / 2 + 8, cy - 12, cx + bw / 2 + 12, cy - 22, 6, pal.body);
		g.fillCircle(cx + bw / 2 + 12, cy - 23, 3.5, C_OUTLINE);
	}

	// eyes
	const eyeY = cy - bodyH / 2 + 17;
	drawEye(g, cx - 9, eyeY, p.eyes, p.px);
	drawEye(g, cx + 9, eyeY, p.eyes, p.px);

	// working gear
	if (p.gear) {
		g.fillCircle(cx, cy - bodyH / 2 - 16, 4, pal.accent);
		g.strokeCircle(cx, cy - bodyH / 2 - 16, 6.5, 1.5, C_OUTLINE);
	}
}

function drawCell(pix, g, col, row, state, f, total, pal) {
	const px = col * CELL.width, py = row * CELL.height;
	const cx = px + CELL.width / 2;
	const cy = py + CELL.height / 2 + 4;
	let o = { cx, cy, s: 1, y: 0, eyes: 'open', px: 0, arm: false, foot: 0, flat: false, droop: false, gear: false, dangle: false };
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
		case 'eat': o.eyes = 'narrow'; o.s = 1.02; break;
		case 'play': { const seq = [0, -10, -18, -10]; o.y = seq[f] ?? 0; break; }
		case 'drag': o.eyes = 'wide'; o.dangle = true; o.foot = f % 2 === 0 ? -1 : 1; o.s = 1.04; break;
	}
	drawCreature(g, o, pal);

	// post-draw extras for the interaction states
	if (state === 'eat') {
		const bite = [6, 4, 2.5, 1.5][f] ?? 4;
		g.fillCircle(cx + 27, cy + 1, bite, C_FOOD);
		g.fillCircle(cx + 13, cy + 6, 3, C_EYE);
	} else if (state === 'play') {
		const ballY = [8, -14, -20, -6][f] ?? 0;
		g.fillCircle(cx + 32, cy + ballY, 6, C_BALL);
		g.strokeCircle(cx + 32, cy + ballY, 6, 1.5, C_OUTLINE);
	}
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
const order = ['idle', 'running-right', 'running-left', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review', 'eat', 'play', 'drag'];
const countOf = (state) => STATE_FRAME_COUNTS[state] ?? EXTRA_FRAME_COUNTS[state] ?? 1;

// ---- verify grid invariants (row tail must be empty, used cells non-empty) ----
function countOpaque(px, col, row) {
	let n = 0;
	const x0 = col * CELL.width, y0 = row * CELL.height;
	for (let y = y0; y < y0 + CELL.height; y++) for (let x = x0; x < x0 + CELL.width; x++) {
		if (px.buf[(y * px.w + x) * 4 + 3] !== 0) n++;
	}
	return n;
}

function renderPalette(key) {
	const pal = { body: hex(PALETTES[key].body), belly: hex(PALETTES[key].belly), accent: hex(PALETTES[key].accent) };
	const pix = new Pix(W, H);
	const g = makeG(pix);
	for (let row = 0; row < order.length; row++) {
		const state = order[row];
		const count = countOf(state);
		for (let f = 0; f < count; f++) drawCell(pix, g, f, row, state, f, count, pal);
	}

	let ok = true;
	for (let row = 0; row < order.length; row++) {
		const state = order[row];
		const count = countOf(state);
		for (let col = 0; col < CELL.columns; col++) {
			const opaque = countOpaque(pix, col, row);
			if (col < count && opaque === 0) { console.error(`FAIL: ${key}/${state} col ${col} is empty`); ok = false; }
			if (col >= count && opaque !== 0) { console.error(`FAIL: ${key}/${state} col ${col} should be empty, got ${opaque} opaque px`); ok = false; }
		}
	}
	console.log(`${key}: atlas invariants ${ok ? 'PASS' : 'FAIL'}`);

	const name = key === 'dee' ? 'dsh-pet-spritesheet.png' : `dsh-pet-spritesheet-${key}.png`;
	const out = resolve(here, '../assets', name);
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, encodePng(pix));
	console.log(`wrote ${out} (${W}x${H})`);
	return ok;
}

const arg = process.argv[2] ?? 'dee';
const keys = arg === '--all' ? Object.keys(PALETTES) : [arg];
let allOk = true;
for (const key of keys) {
	if (!PALETTES[key]) { console.error(`unknown palette "${key}" (have: ${Object.keys(PALETTES).join(', ')})`); process.exit(1); }
	if (!renderPalette(key)) allOk = false;
}
process.exit(allOk ? 0 : 1);
