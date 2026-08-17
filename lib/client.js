/**
 * dsh-pet — browser half (DSH client plugin).
 *
 * A Codex-style desktop pet: a floating animated sprite in the frame-wide
 * `shell.overlay` layer, driven by the current session's agent state
 * (running / waiting-for-input / error / just-finished / review / idle).
 *
 * Codex fidelity:
 *  - the 9 official V1 atlas rows, incl. running-right / running-left while
 *    dragging (direction), waving on session start, jumping on completion;
 *  - ambient state lifetimes (openai/codex ambient.rs): Running decays after
 *    3min, Failed after 1h, Waiting after 24h, Review after 7d;
 *  - reduced-motion mode (media query `prefers-reduced-motion` or a manual
 *    setting) pins the sprite to the first idle frame;
 *  - official state labels: Running / Needs input / Ready / Blocked;
 *  - custom pets in the Codex package format (pet.json + a row-major
 *    spritesheet, no external atlas file) can be imported from disk.
 *
 * Beyond Codex: eat / play interactions (extra atlas rows declared through
 * the official `animations` override), drag-to-reposition, size / opacity
 * settings, three built-in palettes, all persisted to localStorage.
 *
 * Loaded by the DSH client runner via window.__ModuleLoader__ — same contract
 * as every @deepseek-ai/dsh-client-ui-* package (see its lib/client.js).
 */
window.__ModuleLoader__.load({
	id: "@minybear/dsh-pet",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");

		// ---------------------------------------------------------------------
		// pet-core (mirror of ../pet-core.js — inlined because the module loader
		// only resolves registered DSH packages, not our own files).
		// test/parity.test.mjs asserts this copy behaves identically.
		// ---------------------------------------------------------------------
		const DEFAULT_FRAME = Object.freeze({ width: 192, height: 208, columns: 8, rows: 9 });
		const STATE_ROWS = Object.freeze({
			idle: 0, "running-right": 1, "running-left": 2, waving: 3,
			jumping: 4, failed: 5, waiting: 6, running: 7, review: 8,
		});
		const STATE_FRAME_COUNTS = Object.freeze({
			idle: 6, "running-right": 8, "running-left": 8, waving: 4,
			jumping: 5, failed: 8, waiting: 6, running: 6, review: 6,
		});
		const STATE_DURATIONS_MS = Object.freeze({
			idle: [280, 110, 110, 140, 140, 320],
			"running-right": [120, 120, 120, 120, 120, 120, 120, 220],
			"running-left": [120, 120, 120, 120, 120, 120, 120, 220],
			waving: [140, 140, 140, 280],
			jumping: [140, 140, 140, 140, 280],
			failed: [140, 140, 140, 140, 140, 140, 140, 240],
			waiting: [150, 150, 150, 150, 150, 260],
			running: [120, 120, 120, 120, 120, 220],
			review: [150, 150, 150, 150, 150, 280],
		});
		const STATE_TTLS_MS = Object.freeze({
			running: 3 * 60_000,
			failed: 60 * 60_000,
			waiting: 24 * 60 * 60_000,
			review: 7 * 24 * 60 * 60_000,
		});
		const STATE_LABELS = Object.freeze({
			idle: null,
			"running-right": null,
			"running-left": null,
			waving: "Hi!",
			jumping: "Done!",
			failed: "Blocked",
			waiting: "Needs input",
			running: "Running",
			review: "Ready",
			drag: null,
			eat: "Yum!",
			play: "Whee!",
		});
		const POSITIVE_INT = (v) => Number.isInteger(v) && v > 0;

		function parsePetJson(json, fallbackId = "dsh-pet") {
			if (json == null || typeof json !== "object") {
				throw new Error("pet.json must be a JSON object");
			}
			const id = typeof json.id === "string" && json.id !== "" ? json.id : fallbackId;
			const displayName = typeof json.displayName === "string" && json.displayName !== "" ? json.displayName : id;
			const description = typeof json.description === "string" ? json.description : "";
			const spritesheetPath = typeof json.spritesheetPath === "string" && json.spritesheetPath !== "" ? json.spritesheetPath : "spritesheet.webp";

			let frame = { ...DEFAULT_FRAME };
			if (json.frame != null) {
				const f = json.frame;
				if (!POSITIVE_INT(f.width) || !POSITIVE_INT(f.height) || !POSITIVE_INT(f.columns) || !POSITIVE_INT(f.rows)) {
					throw new Error("pet.json frame must be { width, height, columns, rows } of positive integers");
				}
				frame = { width: f.width, height: f.height, columns: f.columns, rows: f.rows };
			}
			const totalFrames = frame.columns * frame.rows;
			if (totalFrames > 256) throw new Error("pet.json frame grid exceeds 256 total frames");

			const animations = {};
			if (json.animations != null) {
				for (const [name, spec] of Object.entries(json.animations)) {
					if (spec == null || !Array.isArray(spec.frames) || spec.frames.length === 0) {
						throw new Error(`pet.json animations.${name}.frames must be a non-empty array`);
					}
					const frames = spec.frames.map(Number);
					for (const idx of frames) {
						if (!Number.isInteger(idx) || idx < 0 || idx >= totalFrames) {
							throw new Error(`pet.json animations.${name} frame index ${idx} out of range (0..${totalFrames - 1})`);
						}
					}
					const fps = spec.fps == null ? 8.0 : Number(spec.fps);
					if (!Number.isFinite(fps) || fps <= 0 || fps > 60) {
						throw new Error(`pet.json animations.${name}.fps must satisfy 0 < fps <= 60`);
					}
					const loop = spec.loop !== false;
					const fallback = typeof spec.fallback === "string" && spec.fallback !== "" ? spec.fallback : "idle";
					animations[name] = { frames, fps, loop, fallback };
				}
			}

			return {
				id, displayName, description, spritesheetPath, frame, totalFrames, animations,
				spriteVersionNumber: Number.isInteger(json.spriteVersionNumber) ? json.spriteVersionNumber : undefined,
			};
		}

		function spriteGrid(pet) {
			const { columns, rows, width, height } = pet.frame;
			return { columns, rows, frameWidth: width, frameHeight: height, totalFrames: columns * rows };
		}
		function frameRect(index, grid) {
			const col = index % grid.columns;
			const row = Math.floor(index / grid.columns);
			return { x: col * grid.frameWidth, y: row * grid.frameHeight, w: grid.frameWidth, h: grid.frameHeight };
		}
		function stateFrames(state, pet) {
			const custom = pet.animations[state];
			if (custom) return custom.frames.slice();
			const row = STATE_ROWS[state] ?? STATE_ROWS.idle;
			const count = STATE_FRAME_COUNTS[state] ?? 1;
			const start = row * pet.frame.columns;
			const frames = [];
			for (let i = 0; i < count; i++) frames.push(start + i);
			return frames;
		}
		function stateDurations(state, pet) {
			const custom = pet.animations[state];
			if (custom) {
				const per = Math.round(1000 / custom.fps);
				return custom.frames.map(() => per);
			}
			return (STATE_DURATIONS_MS[state] ?? STATE_DURATIONS_MS.idle).slice();
		}
		function alive(at, ttl, now) {
			return typeof at === "number" && now - at < ttl;
		}
		function decaySignals(input) {
			const now = typeof input.now === "number" ? input.now : Date.now();
			return {
				running: input.running === true && (input.runningAt == null || alive(input.runningAt, STATE_TTLS_MS.running, now)),
				waiting: input.waiting === true && (input.waitingAt == null || alive(input.waitingAt, STATE_TTLS_MS.waiting, now)),
				error: input.error != null && (input.errorAt == null || alive(input.errorAt, STATE_TTLS_MS.failed, now)) ? input.error : null,
				completed: input.completed === true && (input.completedAt == null || alive(input.completedAt, STATE_TTLS_MS.review, now)),
			};
		}
		function derivePetState(input) {
			const now = typeof input.now === "number" ? input.now : Date.now();
			const s = (input.runningAt != null || input.waitingAt != null || input.errorAt != null || input.completedAt != null)
				? decaySignals({ ...input, now })
				: { running: input.running === true, waiting: input.waiting === true, error: input.error ?? null, completed: input.completed === true };

			const waveActive = input.wave === true || (typeof input.waveUntil === "number" && now < input.waveUntil);
			const celebrateActive = typeof input.celebrateUntil === "number" && now < input.celebrateUntil;

			if (input.drag) {
				if (input.dragDir > 0) return "running-right";
				if (input.dragDir < 0) return "running-left";
				return "drag";
			}
			if (input.eat) return "eat";
			if (input.play) return "play";
			if (waveActive) return "waving";
			if (s.running) return "running";
			if (s.error) return "failed";
			if (s.waiting) return "waiting";
			if (celebrateActive) return "jumping";
			if (s.completed) return "review";
			return "idle";
		}
		const DRIVABLE_STATES = Object.freeze([
			"idle", "running", "running-right", "running-left", "waiting", "failed",
			"jumping", "waving", "review", "drag", "eat", "play",
		]);

		/**
		 * Decide whether a session switch should trigger a "waving" greeting.
		 * Wave on every genuinely new session (including the very first one)
		 * but never twice for the same session id — selecting the same
		 * session twice in a row must not re-trigger the animation.
		 *
		 * Pure, side-effect free, exported for testing.
		 */
		function shouldWave(lastWavedForId, currentId) {
			if (!currentId) return false;
			return currentId !== lastWavedForId;
		}

		// ---------------------------------------------------------------------
		// Built-in pets: the same creature drawn in several palettes on a canvas
		// as a row-major atlas. Rows 0–8 are the 9 Codex V1 states; rows 9–11
		// are the interaction states (eat / play / drag) supplied via the
		// official `animations` override.
		// ---------------------------------------------------------------------
		const CELL = Object.freeze({ width: 96, height: 104, columns: 8, rows: 12 });
		const EXTRA_FRAME_COUNTS = Object.freeze({ eat: 4, play: 4, drag: 4 });
		const C_OUTLINE = "#1f2430";
		const C_EYE = "#1f2430";
		const C_FOOD = "#e35d5d";
		const C_BALL = "#5b8def";

		const BUILTIN_PETS = Object.freeze({
			dee: {
				displayName: "Dee",
				description: "A tiny teal companion that mirrors the agent's running state.",
				palette: { body: "#35c1a9", belly: "#8ef0da", accent: "#ffb84d" },
			},
			amber: {
				displayName: "Amber",
				description: "A warm orange companion that mirrors the agent's running state.",
				palette: { body: "#f2a03d", belly: "#ffd9a0", accent: "#35c1a9" },
			},
			berry: {
				displayName: "Berry",
				description: "A soft violet companion that mirrors the agent's running state.",
				palette: { body: "#9b7ede", belly: "#d9ccff", accent: "#ff8fb2" },
			},
		});

		function roundRectPath(ctx, x, y, w, h, r) {
			const rr = Math.min(r, w / 2, h / 2);
			ctx.beginPath();
			ctx.moveTo(x + rr, y);
			ctx.arcTo(x + w, y, x + w, y + h, rr);
			ctx.arcTo(x + w, y + h, x, y + h, rr);
			ctx.arcTo(x, y + h, x, y, rr);
			ctx.arcTo(x, y, x + w, y, rr);
			ctx.closePath();
		}

		function drawEye(ctx, x, y, mode, px) {
			ctx.save();
			ctx.translate(x, y);
			ctx.fillStyle = C_EYE;
			if (mode === "blink") {
				ctx.fillRect(-5, -1, 10, 2);
			} else if (mode === "x") {
				ctx.strokeStyle = C_EYE; ctx.lineWidth = 2; ctx.lineCap = "round";
				ctx.beginPath(); ctx.moveTo(-3.5, -3.5); ctx.lineTo(3.5, 3.5); ctx.moveTo(3.5, -3.5); ctx.lineTo(-3.5, 3.5); ctx.stroke();
			} else {
				const r = mode === "narrow" ? 2.6 : (mode === "wide" ? 5 : 4);
				ctx.beginPath(); ctx.arc(px, 0, r, 0, Math.PI * 2); ctx.fill();
				if (mode !== "narrow") {
					ctx.fillStyle = "#ffffff";
					ctx.beginPath(); ctx.arc(px + 1.4, -1.4, 1.4, 0, Math.PI * 2); ctx.fill();
				}
			}
			ctx.restore();
		}

		function drawCreature(ctx, p, pal) {
			// p: {cx, cy, s(scaleY), y(offset), eyes, px(pupil x), arm(bool), foot(-1..1), flat(bool), droop(bool), gear(bool), dangle(bool)}
			const bw = 48, bh = 50;
			const bodyH = bh * p.s;
			const cx = p.cx, cy = p.cy + p.y;
			ctx.save();
			ctx.translate(cx, cy);

			// antenna
			const tipX = p.droop ? -7 : 0;
			const tipY = -bodyH / 2 - 9 + (p.droop ? 8 : 0);
			ctx.strokeStyle = C_OUTLINE; ctx.lineWidth = 3; ctx.lineCap = "round";
			ctx.beginPath(); ctx.moveTo(0, -bodyH / 2); ctx.lineTo(tipX, tipY); ctx.stroke();
			ctx.fillStyle = pal.accent;
			ctx.beginPath(); ctx.arc(tipX, tipY - 4, 4.5, 0, Math.PI * 2); ctx.fill();

			// feet (alternate when running / dangle when carried)
			ctx.fillStyle = C_OUTLINE;
			const fdx = p.foot * 6;
			const footY = bodyH / 2 - 2 + (p.dangle ? 7 : 0);
			ctx.fillRect(-bw / 2 + 5 + fdx, footY, 15, 6);
			ctx.fillRect(bw / 2 - 20 - fdx, footY, 15, 6);

			// body
			ctx.fillStyle = pal.body;
			roundRectPath(ctx, -bw / 2, -bodyH / 2, bw, bodyH, 13);
			ctx.fill();
			ctx.strokeStyle = C_OUTLINE; ctx.lineWidth = 2.5;
			ctx.stroke();

			// belly
			ctx.fillStyle = pal.belly;
			roundRectPath(ctx, -bw / 2 + 8, -bodyH / 2 + 11, bw - 16, bodyH - 22, 8);
			ctx.fill();

			// waving arm
			if (p.arm) {
				ctx.strokeStyle = pal.body; ctx.lineWidth = 6;
				ctx.beginPath(); ctx.moveTo(bw / 2 - 2, 2); ctx.lineTo(bw / 2 + 8, -12); ctx.lineTo(bw / 2 + 12, -22); ctx.stroke();
				ctx.fillStyle = C_OUTLINE;
				ctx.beginPath(); ctx.arc(bw / 2 + 12, -23, 3.5, 0, Math.PI * 2); ctx.fill();
			}

			// eyes
			const eyeY = -bodyH / 2 + 17;
			drawEye(ctx, -9, eyeY, p.eyes, p.px);
			drawEye(ctx, 9, eyeY, p.eyes, p.px);

			// "working" gear
			if (p.gear) {
				ctx.fillStyle = pal.accent;
				ctx.beginPath(); ctx.arc(0, -bodyH / 2 - 16, 4, 0, Math.PI * 2); ctx.fill();
				ctx.strokeStyle = C_OUTLINE; ctx.lineWidth = 1.5;
				ctx.beginPath(); ctx.arc(0, -bodyH / 2 - 16, 6.5, 0, Math.PI * 2); ctx.stroke();
			}
			ctx.restore();
		}

		function drawCell(ctx, col, row, state, f, total, pal) {
			const px = col * CELL.width, py = row * CELL.height;
			ctx.clearRect(px, py, CELL.width, CELL.height);
			const cx = px + CELL.width / 2;
			const cy = py + CELL.height / 2 + 4;
			let o = { cx, cy, s: 1, y: 0, eyes: "open", px: 0, arm: false, foot: 0, flat: false, droop: false, gear: false, dangle: false };

			switch (state) {
				case "idle": {
					o.s = 1 + 0.03 * Math.sin((f / total) * Math.PI * 2);
					if (f % 3 === 2) o.eyes = "blink";
					break;
				}
				case "running-right": {
					o.foot = f % 2 === 0 ? 1 : -1;
					o.px = 1.5;
					break;
				}
				case "running-left": {
					o.foot = f % 2 === 0 ? -1 : 1;
					o.px = -1.5;
					break;
				}
				case "waving": {
					o.arm = true;
					o.s = f % 2 === 0 ? 1.03 : 1;
					break;
				}
				case "jumping": {
					const seq = [0, -14, -24, -14, 0];
					o.y = seq[f] ?? 0;
					o.s = f === 0 ? 1.08 : f === 4 ? 0.9 : 1;
					break;
				}
				case "failed": {
					o.flat = true;
					o.s = 0.72;
					o.eyes = "x";
					o.droop = true;
					o.y = 8;
					break;
				}
				case "waiting": {
					o.px = f % 4 < 2 ? -2 : 2;
					o.s = 1.02;
					break;
				}
				case "running": {
					o.eyes = "narrow";
					o.gear = true;
					o.s = 1 + 0.02 * Math.sin((f / total) * Math.PI * 2);
					o.px = 0.5;
					break;
				}
				case "review": {
					const scan = [-2.5, -1.2, 0, 1.2, 2.5, 1.2];
					o.px = scan[f] ?? 0;
					break;
				}
				case "eat": {
					o.eyes = "narrow";
					o.s = 1.02;
					break;
				}
				case "play": {
					const seq = [0, -10, -18, -10];
					o.y = seq[f] ?? 0;
					o.eyes = "open";
					break;
				}
				case "drag": {
					o.eyes = "wide";
					o.dangle = true;
					o.foot = f % 2 === 0 ? -1 : 1;
					o.s = 1.04;
					break;
				}
			}
			drawCreature(ctx, o, pal);

			// post-draw extras for the interaction states
			if (state === "eat") {
				const bite = [6, 4, 2.5, 1.5][f] ?? 4;
				ctx.fillStyle = C_FOOD;
				ctx.beginPath(); ctx.arc(cx + 27, cy + 1, bite, 0, Math.PI * 2); ctx.fill();
				ctx.fillStyle = C_EYE;
				ctx.beginPath(); ctx.arc(cx + 13, cy + 6, 3, 0, Math.PI * 2); ctx.fill();
			} else if (state === "play") {
				const ballY = [8, -14, -20, -6][f] ?? 0;
				ctx.fillStyle = C_BALL;
				ctx.beginPath(); ctx.arc(cx + 32, cy + ballY, 6, 0, Math.PI * 2); ctx.fill();
				ctx.strokeStyle = C_OUTLINE; ctx.lineWidth = 1.5;
				ctx.beginPath(); ctx.arc(cx + 32, cy + ballY, 6, 0, Math.PI * 2); ctx.stroke();
			}
		}

		function buildDefaultAsset(paletteKey = "dee") {
			const key = Object.prototype.hasOwnProperty.call(BUILTIN_PETS, paletteKey) ? paletteKey : "dee";
			const def = BUILTIN_PETS[key];
			const pal = def.palette;
			const canvas = document.createElement("canvas");
			canvas.width = CELL.columns * CELL.width;
			canvas.height = CELL.rows * CELL.height;
			const ctx = canvas.getContext("2d");
			const order = ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review", "eat", "play", "drag"];
			for (let row = 0; row < order.length; row++) {
				const state = order[row];
				const count = STATE_FRAME_COUNTS[state] ?? EXTRA_FRAME_COUNTS[state] ?? 1;
				for (let f = 0; f < count; f++) drawCell(ctx, f, row, state, f, count, pal);
			}
			const dataUrl = canvas.toDataURL("image/png");
			const animations = {
				eat: { frames: [72, 73, 74, 75], fps: 6 },
				play: { frames: [80, 81, 82, 83], fps: 7 },
				drag: { frames: [88, 89, 90, 91], fps: 5 },
			};
			const frame = { width: CELL.width, height: CELL.height, columns: CELL.columns, rows: CELL.rows };
			const pet = {
				id: `dsh-pet-${key}`,
				displayName: `${def.displayName} (DSH pet)`,
				description: def.description,
				spritesheetPath: "spritesheet.png",
				frame: { ...frame },
				totalFrames: CELL.columns * CELL.rows,
				animations,
			};
			return { pet, imageUrl: dataUrl };
		}

		// ---------------------------------------------------------------------
		// Custom pets (Codex package format) imported by the user and persisted
		// in localStorage as { id, manifest (raw pet.json), imageDataUrl }.
		// ---------------------------------------------------------------------
		const LS = {
			size: "dsh-pet:size",
			opacity: "dsh-pet:opacity",
			pos: "dsh-pet:pos",
			petId: "dsh-pet:petId",
			customPets: "dsh-pet:customPets",
			motion: "dsh-pet:motion",
		};
		const CUSTOM_IMAGE_LIMIT = 3 * 1024 * 1024; // ~3MB data URL, localStorage-friendly

		function readJSON(key, def) {
			try {
				const v = localStorage.getItem(key);
				return v == null ? def : JSON.parse(v);
			} catch { return def; }
		}
		function writeJSON(key, value) {
			try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
		}
		function readNum(key, def) {
			try {
				const v = localStorage.getItem(key);
				if (v == null) return def;
				const n = Number(v);
				return Number.isFinite(n) ? n : def;
			} catch { return def; }
		}
		const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

		function loadCustomPets() {
			const list = readJSON(LS.customPets, []);
			return Array.isArray(list) ? list.filter((e) => e && typeof e.id === "string" && typeof e.imageDataUrl === "string") : [];
		}

		/** Resolve an asset ({ pet, imageUrl }) for a pet id: built-in palette or imported custom pet. */
		function loadAsset(petId, customs) {
			if (Object.prototype.hasOwnProperty.call(BUILTIN_PETS, petId)) return buildDefaultAsset(petId);
			const entry = (customs ?? []).find((e) => e.id === petId);
			if (entry) {
				const pet = parsePetJson(entry.manifest, entry.id);
				return { pet, imageUrl: entry.imageDataUrl };
			}
			return buildDefaultAsset("dee");
		}

		function readFileAsDataURL(file) {
			return new Promise((resolvePromise, rejectPromise) => {
				const r = new FileReader();
				r.onload = () => resolvePromise(String(r.result));
				r.onerror = () => rejectPromise(r.error ?? new Error("failed to read file"));
				r.readAsDataURL(file);
			});
		}

		// ---------------------------------------------------------------------
		// React: animated sprite view
		// ---------------------------------------------------------------------
		function PetView({ state, pet, imageUrl, scale, title, reduced }) {
			const grid = React.useMemo(() => spriteGrid(pet), [pet]);
			const frames = React.useMemo(() => stateFrames(state, pet), [state, pet]);
			const durs = React.useMemo(() => stateDurations(state, pet), [state, pet]);
			const anim = pet.animations ? pet.animations[state] : undefined;
			const loop = anim ? anim.loop !== false : true;

			const [idx, setIdx] = React.useState(0);
			React.useEffect(() => setIdx(0), [state, pet]);
			React.useEffect(() => {
				if (reduced) return undefined;
				const i = Math.min(idx, frames.length - 1);
				const delay = durs[i] ?? 150;
				const t = setTimeout(() => {
					setIdx((cur) => {
						if (cur + 1 < frames.length) return cur + 1;
						return loop ? 0 : cur;
					});
				}, delay);
				return () => clearTimeout(t);
			}, [reduced, state, idx, frames, durs, loop]);

			// Codex reduced-motion: pin the first idle frame.
			const frameIndex = reduced ? stateFrames("idle", pet)[0] : frames[Math.min(idx, frames.length - 1)];
			const cellW = Math.round(grid.frameWidth * scale);
			const cellH = Math.round(grid.frameHeight * scale);
			const rect = frameRect(frameIndex, grid);
			return React.createElement("div", {
				role: "img",
				title,
				"aria-label": title,
				style: {
					width: cellW,
					height: cellH,
					backgroundImage: `url(${imageUrl})`,
					backgroundSize: `${grid.columns * cellW}px ${grid.rows * cellH}px`,
					backgroundPosition: `${-rect.x * scale}px ${-rect.y * scale}px`,
					backgroundRepeat: "no-repeat",
					imageRendering: "pixelated",
				},
			});
		}

		// ---------------------------------------------------------------------
		// React: overlay entry (agent state + interaction + persisted settings)
		// ---------------------------------------------------------------------

		/** Re-render on a short interval while any time-based state is active, so it can lapse. */
		function useTransientTick(active) {
			const [, setTick] = React.useState(0);
			React.useEffect(() => {
				if (!active) return undefined;
				const id = setInterval(() => setTick((t) => t + 1), 400);
				return () => clearInterval(id);
			}, [active]);
		}

		/** Subscribe to a session face's ConversationSnapshot (for lastAgentError). */
		function useSessionSnapshot(sessionsService, sessionId) {
			const subscribe = React.useCallback((cb) => {
				if (!sessionId) return () => {};
				const binding = sessionsService.binding(sessionId);
				if (!binding) return () => {};
				return binding.session.subscribe(cb);
			}, [sessionsService, sessionId]);
			const getSnapshot = React.useCallback(() => {
				if (!sessionId) return null;
				const binding = sessionsService.binding(sessionId);
				return binding ? binding.session.getSnapshot() : null;
			}, [sessionsService, sessionId]);
			return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
		}

		/** Track the OS reduced-motion preference. */
		function usePrefersReducedMotion() {
			const get = () => {
				try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
			};
			const [matches, setMatches] = React.useState(get);
			React.useEffect(() => {
				let mq;
				try { mq = window.matchMedia("(prefers-reduced-motion: reduce)"); } catch { return undefined; }
				const onChange = () => setMatches(mq.matches);
				if (mq.addEventListener) mq.addEventListener("change", onChange);
				else if (mq.addListener) mq.addListener(onChange);
				return () => {
					if (mq.removeEventListener) mq.removeEventListener("change", onChange);
					else if (mq.removeListener) mq.removeListener(onChange);
				};
			}, []);
			return matches;
		}

		function PetOverlay(props) {
			const useSessions = props.useSessions;
			const sessionsService = props.sessionsService;
			const sessions = useSessions((s) => s);
			const currentId = sessions.current;
			const summary = currentId ? sessions.byId[currentId] : undefined;

			const running = summary != null && summary.running === true;
			const waiting = summary != null && summary.pendingInteraction != null;
			const completed = summary != null && summary.completed === true;
			const snap = useSessionSnapshot(sessionsService, currentId);
			const error = snap != null && snap.lastAgentError != null ? snap.lastAgentError : null;

			// --- transient interaction state ----------------------------------
			const [celebrateUntil, setCelebrateUntil] = React.useState(0);
			const [waveUntil, setWaveUntil] = React.useState(0);
			const [eatUntil, setEatUntil] = React.useState(0);
			const [playUntil, setPlayUntil] = React.useState(0);
			const [dragging, setDragging] = React.useState(false);
			const [dragDir, setDragDir] = React.useState(0);

			// --- persisted settings -------------------------------------------
			const [menuOpen, setMenuOpen] = React.useState(false);
			const [showSettings, setShowSettings] = React.useState(false);
			const [size, setSize] = React.useState(() => clamp(readNum(LS.size, 0.9), 0.5, 1.5));
			const [opacity, setOpacity] = React.useState(() => clamp(readNum(LS.opacity, 1), 0.2, 1));
			const [motion, setMotion] = React.useState(() => {
				const v = readJSON(LS.motion, "auto");
				return v === "full" || v === "reduced" ? v : "auto";
			});
			const [petId, setPetId] = React.useState(() => {
				const v = readJSON(LS.petId, "dee");
				return typeof v === "string" && v !== "" ? v : "dee";
			});
			const [customPets, setCustomPets] = React.useState(loadCustomPets);
			const [pos, setPos] = React.useState(() => readJSON(LS.pos, null));

			// --- ambient lifetimes: first-seen timestamps for session signals --
			const now = Date.now();
			const sig = React.useRef({ runningAt: null, waitingAt: null, errorAt: null, errorRef: null, completedAt: null });
			const s = sig.current;
			if (running) { if (s.runningAt == null) s.runningAt = now; } else s.runningAt = null;
			if (waiting) { if (s.waitingAt == null) s.waitingAt = now; } else s.waitingAt = null;
			if (error != null) {
				if (s.errorRef !== error) { s.errorRef = error; s.errorAt = now; }
			} else { s.errorRef = null; s.errorAt = null; }
			if (completed) { if (s.completedAt == null) s.completedAt = now; } else s.completedAt = null;

			// running true->false edge: celebrate briefly (Codex "Done!" jump)
			const prevRunning = React.useRef(false);
			React.useEffect(() => {
				if (prevRunning.current === true && running === false) setCelebrateUntil(Date.now() + 2600);
				prevRunning.current = running;
			}, [running]);

			// session switch: wave hello (Codex SessionStart -> waving) — but only
			// once per session id, so re-selecting the same session in the
			// sidebar doesn't trigger a second greeting.
			const lastWavedFor = React.useRef(null);
			React.useEffect(() => {
				if (shouldWave(lastWavedFor.current, currentId)) {
					setWaveUntil(Date.now() + 1700);
					lastWavedFor.current = currentId;
				}
			}, [currentId]);

			// --- pet asset ------------------------------------------------------
			const [asset, setAsset] = React.useState(null);
			React.useEffect(() => {
				let aliveLocal = true;
				try {
					const a = loadAsset(petId, customPets);
					if (aliveLocal) setAsset(a);
				} catch (e) {
					console.error("[dsh-pet] failed to load pet asset:", e);
					try { if (aliveLocal) setAsset(buildDefaultAsset("dee")); } catch { /* give up */ }
				}
				return () => { aliveLocal = false; };
			}, [petId, customPets]);

			// --- reduced motion (manual override or OS preference) -------------
			const prefersReduced = usePrefersReducedMotion();
			const reduced = motion === "reduced" || (motion === "auto" && prefersReduced);

			// initial position (bottom-right) once the overlay layer is measurable
			const rootRef = React.useRef(null);
			const frameW = asset ? asset.pet.frame.width : CELL.width;
			const frameH = asset ? asset.pet.frame.height : CELL.height;
			const displayScale = size * Math.min(1.5, 96 / frameW);
			const pw = Math.round(frameW * displayScale);
			const ph = Math.round(frameH * displayScale);
			React.useLayoutEffect(() => {
				if (pos !== null || !asset) return;
				const layer = rootRef.current?.closest("[data-shell-overlay]");
				const w = layer ? layer.clientWidth : window.innerWidth;
				const h = layer ? layer.clientHeight : window.innerHeight;
				setPos({ x: w - pw - 16, y: h - ph - 16 });
			}, [pos, asset, pw, ph]);

			// persist settings on change
			React.useEffect(() => { try { localStorage.setItem(LS.size, String(size)); } catch { /* ignore */ } }, [size]);
			React.useEffect(() => { try { localStorage.setItem(LS.opacity, String(opacity)); } catch { /* ignore */ } }, [opacity]);
			React.useEffect(() => { writeJSON(LS.motion, motion); }, [motion]);
			React.useEffect(() => { writeJSON(LS.petId, petId); }, [petId]);
			React.useEffect(() => { writeJSON(LS.customPets, customPets); }, [customPets]);

			// close menu on outside click
			React.useEffect(() => {
				if (!menuOpen) return undefined;
				const onDown = (e) => {
					if (rootRef.current && !rootRef.current.contains(e.target)) setMenuOpen(false);
				};
				document.addEventListener("pointerdown", onDown);
				return () => document.removeEventListener("pointerdown", onDown);
			}, [menuOpen]);

			// ALL hooks above this line — the early return below must not
			// change the hook count between renders.
			const dragRef = React.useRef(null);
			const jsonFileRef = React.useRef(null);
			const imgFileRef = React.useRef(null);
			const [importing, setImporting] = React.useState(false);
			const [importError, setImportError] = React.useState(null);

			const eatActive = eatUntil !== 0 && now < eatUntil;
			const playActive = playUntil !== 0 && now < playUntil;
			const celebrateActive = celebrateUntil !== 0 && now < celebrateUntil;
			const waveActive = waveUntil !== 0 && now < waveUntil;
			useTransientTick(eatActive || playActive || celebrateActive || waveActive || running || waiting || error != null || completed);

			if (!asset) return null;

			const state = derivePetState({
				drag: dragging,
				dragDir,
				eat: eatActive,
				play: playActive,
				waveUntil,
				running,
				error,
				waiting,
				completed,
				runningAt: s.runningAt,
				waitingAt: s.waitingAt,
				errorAt: s.errorAt,
				completedAt: s.completedAt,
				celebrateUntil,
				now,
			});
			const label = reduced ? null : STATE_LABELS[state];

			// drag handlers (click vs drag disambiguated by movement threshold)
			const onPointerDown = (e) => {
				const layer = e.currentTarget.closest("[data-shell-overlay]");
				const lw = layer ? layer.clientWidth : window.innerWidth;
				const lh = layer ? layer.clientHeight : window.innerHeight;
				const base = pos ?? { x: lw - pw - 16, y: lh - ph - 16 };
				dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: base.x, baseY: base.y, moved: 0 };
				try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
			};
			const onPointerMove = (e) => {
				const d = dragRef.current;
				if (!d) return;
				const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
				d.moved = Math.max(d.moved, Math.abs(dx) + Math.abs(dy));
				if (d.moved >= 4) setDragging(true);
				setDragDir(dx > 2 ? 1 : dx < -2 ? -1 : 0);
				const layer = e.currentTarget.closest("[data-shell-overlay]");
				const lw = layer ? layer.clientWidth : window.innerWidth;
				const lh = layer ? layer.clientHeight : window.innerHeight;
				setPos({ x: clamp(d.baseX + dx, 0, lw - pw), y: clamp(d.baseY + dy, 0, lh - ph) });
			};
			const onPointerUp = () => {
				const d = dragRef.current;
				dragRef.current = null;
				const wasDrag = d != null && d.moved >= 4;
				setDragging(false);
				setDragDir(0);
				if (wasDrag) {
					writeJSON(LS.pos, pos);
				} else {
					setMenuOpen((open) => !open);
				}
			};

			const doEat = () => { setEatUntil(Date.now() + 2200); setMenuOpen(false); };
			const doPlay = () => { setPlayUntil(Date.now() + 2600); setMenuOpen(false); };

			// --- custom pet import ---------------------------------------------
			const doImport = async () => {
				const jf = jsonFileRef.current?.files?.[0];
				const pf = imgFileRef.current?.files?.[0];
				if (!jf || !pf) { setImportError("请选择 pet.json 和图集图片两个文件"); return; }
				setImporting(true);
				setImportError(null);
				try {
					const manifestRaw = JSON.parse(await jf.text());
					const folderId = typeof manifestRaw.id === "string" && manifestRaw.id !== "" ? manifestRaw.id : jf.name.replace(/\.json$/i, "");
					const pet = parsePetJson(manifestRaw, folderId); // validates grid/animations, throws on bad input
					const imageDataUrl = await readFileAsDataURL(pf);
					if (imageDataUrl.length > CUSTOM_IMAGE_LIMIT) {
						throw new Error(`图集过大（${Math.round(imageDataUrl.length / 1024)}KB），请用 <2MB 的 WebP/PNG`);
					}
					const entry = { id: pet.id, manifest: manifestRaw, imageDataUrl };
					setCustomPets((list) => {
						const next = list.filter((e) => e.id !== entry.id);
						next.push(entry);
						return next;
					});
					setPetId(pet.id);
					if (jsonFileRef.current) jsonFileRef.current.value = "";
					if (imgFileRef.current) imgFileRef.current.value = "";
				} catch (err) {
					setImportError(err && err.message ? err.message : String(err));
				} finally {
					setImporting(false);
				}
			};
			const removeCustomPet = (id) => {
				setCustomPets((list) => list.filter((e) => e.id !== id));
				if (petId === id) setPetId("dee");
			};

			// --- styles ----------------------------------------------------------
			const menuBtn = {
				background: "var(--dsw-alias-bg-base, #fff)",
				border: "1px solid var(--dsw-alias-border-l1, #e5e6eb)",
				borderRadius: 8,
				width: 32, height: 32,
				cursor: "pointer",
				fontSize: 16,
				lineHeight: "30px",
				padding: 0,
				textAlign: "center",
			};
			const labelStyle = { font: "12px system-ui, sans-serif", color: "var(--dsw-alias-label-primary, #333)" };
			const selectStyle = {
				width: "100%",
				font: "12px system-ui, sans-serif",
				color: "var(--dsw-alias-label-primary, #333)",
				background: "var(--dsw-alias-bg-base, #fff)",
				border: "1px solid var(--dsw-alias-border-l1, #e5e6eb)",
				borderRadius: 6,
				padding: "2px 4px",
			};
			const smallBtn = {
				font: "12px system-ui, sans-serif",
				color: "var(--dsw-alias-label-primary, #333)",
				background: "var(--dsw-alias-bg-base, #fff)",
				border: "1px solid var(--dsw-alias-border-l1, #e5e6eb)",
				borderRadius: 6,
				padding: "3px 10px",
				cursor: "pointer",
			};

			const petOptions = Object.keys(BUILTIN_PETS).map((key) =>
				React.createElement("option", { key, value: key }, BUILTIN_PETS[key].displayName)
			).concat(customPets.map((e) => {
				const name = e.manifest && typeof e.manifest.displayName === "string" && e.manifest.displayName !== "" ? e.manifest.displayName : e.id;
				return React.createElement("option", { key: e.id, value: e.id }, `${name}（自定义）`);
			}));

			return React.createElement("div", {
				ref: rootRef,
				style: {
					position: "absolute",
					left: pos ? pos.x : undefined,
					top: pos ? pos.y : undefined,
					right: pos ? undefined : 16,
					bottom: pos ? undefined : 16,
					zIndex: 21,
					pointerEvents: "none",
					display: "flex",
					flexDirection: "column",
					alignItems: "flex-end",
					gap: 6,
					userSelect: "none",
					opacity,
				},
			},
				menuOpen && React.createElement("div", {
					style: {
						pointerEvents: "auto",
						display: "flex",
						flexDirection: "column",
						gap: 8,
						background: "var(--dsw-alias-bg-base, #fff)",
						border: "1px solid var(--dsw-alias-border-l1, #e5e6eb)",
						borderRadius: 12,
						padding: 10,
						boxShadow: "0 4px 16px rgba(0,0,0,0.16)",
						maxWidth: 240,
					},
				},
					React.createElement("div", { style: { display: "flex", gap: 8 } },
						React.createElement("button", { type: "button", title: "Feed", style: menuBtn, onClick: doEat }, "🍗"),
						React.createElement("button", { type: "button", title: "Play", style: menuBtn, onClick: doPlay }, "🎾"),
						React.createElement("button", { type: "button", title: "Settings", style: menuBtn, onClick: () => setShowSettings((v) => !v) }, "⚙")
					),
					showSettings && React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6, minWidth: 190 } },
						React.createElement("label", { style: labelStyle },
							"尺寸 " + size.toFixed(2),
							React.createElement("input", { type: "range", min: 0.5, max: 1.5, step: 0.05, value: size, style: { width: "100%" }, onChange: (e) => setSize(clamp(Number(e.target.value), 0.5, 1.5)) })
						),
						React.createElement("label", { style: labelStyle },
							"透明度 " + opacity.toFixed(2),
							React.createElement("input", { type: "range", min: 0.2, max: 1, step: 0.05, value: opacity, style: { width: "100%" }, onChange: (e) => setOpacity(clamp(Number(e.target.value), 0.2, 1)) })
						),
						React.createElement("label", { style: labelStyle },
							"动画",
							React.createElement("select", {
								value: motion,
								style: selectStyle,
								onChange: (e) => setMotion(e.target.value),
							},
								React.createElement("option", { value: "auto" }, "自动（跟随系统）"),
								React.createElement("option", { value: "full" }, "完整"),
								React.createElement("option", { value: "reduced" }, "减少动态")
							)
						),
						React.createElement("label", { style: labelStyle },
							"宠物",
							React.createElement("select", {
								value: petId,
								style: selectStyle,
								onChange: (e) => setPetId(e.target.value),
							}, petOptions)
						),
						React.createElement("div", { style: { borderTop: "1px solid var(--dsw-alias-border-l1, #e5e6eb)", paddingTop: 6, display: "flex", flexDirection: "column", gap: 4 } },
							React.createElement("span", { style: labelStyle }, "导入 Codex 宠物包"),
							React.createElement("input", { ref: jsonFileRef, type: "file", accept: ".json,application/json", style: { font: "11px system-ui, sans-serif", width: "100%" } }),
							React.createElement("input", { ref: imgFileRef, type: "file", accept: "image/png,image/webp,image/gif", style: { font: "11px system-ui, sans-serif", width: "100%" } }),
							React.createElement("button", { type: "button", style: smallBtn, disabled: importing, onClick: doImport }, importing ? "导入中…" : "导入"),
							importError != null && React.createElement("span", { style: { font: "11px system-ui, sans-serif", color: "#d4380d" } }, importError)
						),
						customPets.length > 0 && React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
							customPets.map((e) => React.createElement("div", { key: e.id, style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 } },
								React.createElement("span", { style: { ...labelStyle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, e.id),
								React.createElement("button", { type: "button", style: smallBtn, onClick: () => removeCustomPet(e.id) }, "删除")
							))
						)
					)
				),
				label != null && React.createElement("div", {
					style: {
						font: "12px/18px system-ui, sans-serif",
						color: "var(--dsw-alias-label-primary, #333)",
						background: "var(--dsw-specific-tip, #f5f6f8)",
						border: "1px solid var(--dsw-alias-border-l1, #e5e6eb)",
						borderRadius: 10,
						padding: "2px 10px",
						boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
					},
				}, label),
				React.createElement("div", {
					onPointerDown,
					onPointerMove,
					onPointerUp,
					title: asset.pet.displayName,
					style: {
						pointerEvents: "auto",
						cursor: dragging ? "grabbing" : "grab",
						touchAction: "none",
						filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.18))",
					},
				}, React.createElement(PetView, {
					state,
					pet: asset.pet,
					imageUrl: asset.imageUrl,
					scale: displayScale,
					title: asset.pet.displayName,
					reduced,
				}))
			);
		}

		// ---------------------------------------------------------------------
		// BridgeOverlay — a headless shell.overlay entry that pushes the
		// session state to a local HTTP endpoint (the dsh-pet-desktop
		// Electron app listens on http://127.0.0.1:8765/pet-state). It has
		// no UI; its sole purpose is to keep an off-tab consumer in sync
		// with the agent's running/waiting/error/completed signals.
		// Safe to install alongside PetOverlay — both subscribe to the
		// same sessions service independently.
		// ---------------------------------------------------------------------
		const BRIDGE_URL = "http://127.0.0.1:8765/pet-state";
		function BridgeOverlay(props) {
			const useSessions = props.useSessions;
			const sessionsService = props.sessionsService;
			const sessions = useSessions(function (s) { return s; });
			const currentId = sessions.current;
			const summary = currentId ? sessions.byId[currentId] : null;
			const running = !!(summary && summary.running === true);
			const waiting = !!(summary && summary.pendingInteraction != null);
			const completed = !!(summary && summary.completed === true);
			const snap = useSessionSnapshot(sessionsService, currentId);
			const error = snap != null && snap.lastAgentError != null ? snap.lastAgentError : null;

			const lastPosted = React.useRef({ currentId: null, running: false, waiting: false, completed: false, errorKey: null });
			React.useEffect(function () {
				var last = lastPosted.current;
				var errorKey = error != null ? String((error && error.message) || error) : null;
				if (last.currentId === currentId && last.running === running && last.waiting === waiting && last.completed === completed && last.errorKey === errorKey) return;
				lastPosted.current = { currentId: currentId, running: running, waiting: waiting, completed: completed, errorKey: errorKey };
				var body = JSON.stringify({
					currentId: currentId,
					running: running,
					waiting: waiting,
					completed: completed,
					errorMessage: errorKey,
				});
				try {
					if (navigator.sendBeacon) {
						navigator.sendBeacon(BRIDGE_URL, new Blob([body], { type: "application/json" }));
					} else {
						fetch(BRIDGE_URL, { method: "POST", body: body, headers: { "Content-Type": "application/json" }, mode: "no-cors", keepalive: true }).catch(function () {});
					}
				} catch (_e) { /* offline / not running -> silent */ }
			}, [currentId, running, waiting, completed, error]);
			return null;
		}

		// ---------------------------------------------------------------------
		// plugin body
		// ---------------------------------------------------------------------
		const inject = ["slots", "sessions"];
		function apply(ctx) {
			ctx.slots.inject("shell.overlay", function () { return ctx.slots.register({
				name: "shell.overlay",
				id: "dsh-pet",
				order: 1000,
				label: "Codex Pet",
				inject: function () { return { sessionsService: ctx.sessions }; },
			}, PetOverlay); });
			ctx.slots.inject("shell.overlay", function () { return ctx.slots.register({
				name: "shell.overlay",
				id: "dsh-pet-bridge",
				order: 999,
				label: "Codex Pet (bridge)",
				inject: function () { return { sessionsService: ctx.sessions }; },
			}, BridgeOverlay); });
		}

		exports.PetOverlay = PetOverlay;
		exports.BridgeOverlay = BridgeOverlay;
		exports.BRIDGE_URL = BRIDGE_URL;
		exports.buildDefaultAsset = buildDefaultAsset;
		exports.BUILTIN_PETS = BUILTIN_PETS;
		exports.shouldWave = shouldWave;
		exports.apply = apply;
		exports.inject = inject;
		// exposed for test/parity.test.mjs: must behave identically to ../pet-core.js
		exports.__petCore = {
			DEFAULT_FRAME, STATE_ROWS, STATE_FRAME_COUNTS, STATE_DURATIONS_MS, STATE_TTLS_MS, STATE_LABELS,
			parsePetJson, spriteGrid, frameRect, stateFrames, stateDurations, decaySignals, derivePetState, DRIVABLE_STATES,
		};
		return module.exports;
	},
});
