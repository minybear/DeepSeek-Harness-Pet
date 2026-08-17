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
	graywhale: { body: '#8b95a5', belly: '#dde3ec', accent: '#5b6472' },
	bluewhale: { body: '#4d6bfe', belly: '#c9d6ff', accent: '#2f49c8' },
};
const SHAPES = { dee: 'blob', amber: 'blob', berry: 'blob', graywhale: 'whale', bluewhale: 'whale' };

// ---- colors (must match lib/client.js) --------------------------------------
const C_OUTLINE = [0x1f, 0x24, 0x30, 255];
const C_EYE = [0x1f, 0x24, 0x30, 255];
const C_WHITE = [255, 255, 255, 255];
const C_FOOD = [0xe3, 0x5d, 0x5d, 255];
const C_BALL = [0x5b, 0x8d, 0xef, 255];
const C_WATER = hex('#9fd8ff');

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
const sdEllipse = (px, py, cx, cy, rx, ry, rot) => {
	const cos = Math.cos(-(rot || 0)), sin = Math.sin(-(rot || 0));
	const dx = px - cx, dy = py - cy;
	const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
	// normalized ellipse distance (approximation, fine for solid fills)
	const k = Math.hypot(lx / rx, ly / ry);
	return (k - 1) * Math.min(rx, ry);
};
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
		fillEllipse(cx, cy, rx, ry, rot, c) { pix.fill((px, py) => sdEllipse(px, py, cx, cy, rx, ry, rot) <= 0, cx - rx - 2, cy - ry - 2, cx + rx + 2, cy + ry + 2, c); },
		line(ax, ay, bx, by, lw, c) { pix.fill((px, py) => sdSegment(px, py, ax, ay, bx, by) <= lw / 2, Math.min(ax, bx) - lw, Math.min(ay, by) - lw, Math.max(ax, bx) + lw, Math.max(ay, by) + lw, c); },
	};
}

// ---- draw port (absolute coords; identical geometry to lib/client.js) --------
function drawEye(g, x, y, mode, px, es = 1) {
	if (mode === 'blink') g.fillRect(x - 5 * es, y - 1 * es, 10 * es, 2 * es, C_EYE);
	else if (mode === 'x') {
		g.line(x - 3.5 * es, y - 3.5 * es, x + 3.5 * es, y + 3.5 * es, 2, C_EYE);
		g.line(x + 3.5 * es, y - 3.5 * es, x - 3.5 * es, y + 3.5 * es, 2, C_EYE);
	} else {
		const r = (mode === 'narrow' ? 2.6 : (mode === 'wide' ? 5 : 4)) * es;
		g.fillCircle(x + px * es, y, r, C_EYE);
		if (mode !== 'narrow') g.fillCircle(x + (px + 1.4) * es, y - 1.4 * es, 1.4 * es, C_WHITE);
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

// ---- whale port (mirrors drawWhale in lib/client.js; facing mirrored by
// negating x offsets around cx) ----------------------------------------------
function drawWhale(g, p, pal) {
	const cx = p.cx, cy = p.cy + p.y;
	const fx = (dx) => cx + dx * (p.facing || 1); // local -> screen x

	// tail fluke (behind the body): two rotated ellipses at the rear
	const wag = (p.tailWag || 0) * 0.22;
	g.fillEllipse(fx(-29), cy - 5, 10, 4.4, (-0.55 + wag) * (p.facing || 1), pal.body);
	g.fillEllipse(fx(-29), cy + 5, 10, 4.4, (0.55 + wag) * (p.facing || 1), pal.body);

	// body + head (squash via scaleY on ry)
	g.fillEllipse(fx(-2), cy, 24, 16 * p.s, 0, pal.body);
	g.fillCircle(fx(13), cy - 3 * p.s, 14 * p.s, pal.body);
	// belly
	g.fillEllipse(fx(3), cy + 7, 15, 6.5, 0, pal.belly);

	// pectoral fin
	if (p.flipper) g.fillEllipse(fx(4), cy, 8, 3.4, -1.15 * (p.facing || 1), pal.accent);
	else g.fillEllipse(fx(0), cy + 10, 7, 3, 0.45 * (p.facing || 1), pal.accent);

	// eye + smile
	drawEye(g, fx(13), cy - 8, p.eyes, p.px * (p.facing || 1), 0.7);
	for (let i = 0; i < 3; i++) {
		const a = 0.25 + (Math.PI * 0.7 - 0.25) * (i / 2);
		g.fillCircle(fx(15) + Math.cos(a) * 5 * (p.facing || 1), cy - 1 + Math.sin(a) * 5, 0.9, C_OUTLINE);
	}

	// blowhole spout / droop
	if (p.droopSpout) {
		g.line(fx(6), cy - 15, fx(11), cy - 12, 2, C_WATER);
		g.line(fx(11), cy - 12, fx(13), cy - 7, 2, C_WATER);
	} else if (p.spout > 0) {
		const t = p.spout;
		g.line(fx(6), cy - 15, fx(6), cy - 15 - 9 * t, 2, C_WATER);
		g.fillCircle(fx(6), cy - 17 - 10 * t, 1.4 + 1.6 * t, C_WATER);
		g.fillCircle(fx(3), cy - 15 - 12 * t, 1 + 1.2 * t, C_WATER);
		g.fillCircle(fx(9), cy - 15 - 12 * t, 1 + 1.2 * t, C_WATER);
	}

	// bubbles while working
	if (p.bubbles) {
		const rise = (p.frame / Math.max(1, p.total)) * 6;
		g.strokeCircle(fx(19), cy - 12 - rise, 1.6, 1.4, C_WATER);
		g.strokeCircle(fx(22), cy - 18 - rise, 2.1, 1.4, C_WATER);
		g.strokeCircle(fx(18), cy - 24 - rise, 1.3, 1.4, C_WATER);
	}
}

function drawCell(pix, g, col, row, state, f, total, pal, shape) {
	const px = col * CELL.width, py = row * CELL.height;
	const cx = px + CELL.width / 2;
	const cy = py + CELL.height / 2 + 4;
	const blob = { cx, cy, s: 1, y: 0, eyes: 'open', px: 0, arm: false, foot: 0, flat: false, droop: false, gear: false, dangle: false };
	const whale = { cx, cy: cy - 2, s: 1, y: 0, eyes: 'open', px: 0, facing: 1, spout: 0, droopSpout: false, flipper: false, tailWag: 0, flat: false, bubbles: false, frame: f, total };
	switch (state) {
		case 'idle':
			blob.s = 1 + 0.03 * Math.sin((f / total) * Math.PI * 2); if (f % 3 === 2) blob.eyes = 'blink';
			whale.s = 1 + 0.03 * Math.sin((f / total) * Math.PI * 2); if (f % 3 === 2) whale.eyes = 'blink';
			whale.spout = [0.15, 0.4, 0.85, 0.95, 0.5, 0.2][f % 6];
			break;
		case 'running-right':
			blob.foot = f % 2 === 0 ? 1 : -1; blob.px = 1.5;
			whale.facing = 1; whale.tailWag = f % 2 === 0 ? 1 : -1; whale.px = 1.5;
			break;
		case 'running-left':
			blob.foot = f % 2 === 0 ? -1 : 1; blob.px = -1.5;
			whale.facing = -1; whale.tailWag = f % 2 === 0 ? 1 : -1; whale.px = 1.5;
			break;
		case 'waving':
			blob.arm = true; blob.s = f % 2 === 0 ? 1.03 : 1;
			whale.flipper = true; whale.s = f % 2 === 0 ? 1.03 : 1;
			break;
		case 'jumping': {
			const seq = [0, -14, -24, -14, 0]; blob.y = seq[f] ?? 0; blob.s = f === 0 ? 1.08 : f === 4 ? 0.9 : 1;
			const wseq = [0, -16, -28, -16, 0]; whale.y = wseq[f] ?? 0; whale.s = f === 0 ? 1.06 : f === 4 ? 0.92 : 1;
			break;
		}
		case 'failed':
			blob.flat = true; blob.s = 0.72; blob.eyes = 'x'; blob.droop = true; blob.y = 8;
			whale.flat = true; whale.s = 0.72; whale.eyes = 'x'; whale.droopSpout = true; whale.y = 8;
			break;
		case 'waiting':
			blob.px = f % 4 < 2 ? -2 : 2; blob.s = 1.02;
			whale.px = f % 4 < 2 ? -1.5 : 1.5; whale.s = 1.02;
			break;
		case 'running':
			blob.eyes = 'narrow'; blob.gear = true; blob.s = 1 + 0.02 * Math.sin((f / total) * Math.PI * 2); blob.px = 0.5;
			whale.eyes = 'narrow'; whale.bubbles = true; whale.s = 1 + 0.02 * Math.sin((f / total) * Math.PI * 2); whale.px = 0.5;
			break;
		case 'review': {
			const scan = [-2.5, -1.2, 0, 1.2, 2.5, 1.2]; blob.px = scan[f] ?? 0;
			whale.px = (scan[f] ?? 0) * 0.7;
			break;
		}
		case 'eat':
			blob.eyes = 'narrow'; blob.s = 1.02;
			whale.eyes = 'narrow'; whale.s = 1.02;
			break;
		case 'play': {
			const seq = [0, -10, -18, -10]; blob.y = seq[f] ?? 0;
			whale.y = seq[f] ?? 0;
			break;
		}
		case 'drag':
			blob.eyes = 'wide'; blob.dangle = true; blob.foot = f % 2 === 0 ? -1 : 1; blob.s = 1.04;
			whale.eyes = 'wide'; whale.tailWag = f % 2 === 0 ? -1 : 1; whale.s = 1.04;
			break;
	}
	if (shape === 'whale') drawWhale(g, whale, pal);
	else drawCreature(g, blob, pal);

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
	const shape = SHAPES[key] || 'blob';
	const pix = new Pix(W, H);
	const g = makeG(pix);
	for (let row = 0; row < order.length; row++) {
		const state = order[row];
		const count = countOf(state);
		for (let f = 0; f < count; f++) drawCell(pix, g, f, row, state, f, count, pal, shape);
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
