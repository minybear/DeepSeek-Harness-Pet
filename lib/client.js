/**
 * dsh-pet — browser half (DSH client plugin).
 *
 * A Codex-style desktop pet: a floating animated sprite in the frame-wide
 * `shell.overlay` layer, driven by the current session's agent state
 * (running / waiting-for-input / error / just-finished / idle), with
 * interaction (drag to move, click menu to feed / play) and persisted
 * appearance settings (size / opacity).
 *
 * The sprite model re-implements the OpenAI Codex custom-pet package format
 * (pet.json + a row-major atlas with no external atlas file); the built-in
 * demo pet is generated at runtime on a canvas, so the plugin ships with no
 * binary assets. The three interaction states (eat / play / drag) live on
 * extra atlas rows 9–11, declared through the official `animations` field.
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
		// only resolves registered DSH packages, not our own files)
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
			const custom = pet.animations && pet.animations[state];
			if (custom) return custom.frames.slice();
			const row = STATE_ROWS[state] ?? STATE_ROWS.idle;
			const count = STATE_FRAME_COUNTS[state] ?? 1;
			const start = row * pet.frame.columns;
			const frames = [];
			for (let i = 0; i < count; i++) frames.push(start + i);
			return frames;
		}
		function stateDurations(state, pet) {
			const custom = pet.animations && pet.animations[state];
			if (custom) {
				const per = Math.round(1000 / custom.fps);
				return custom.frames.map(() => per);
			}
			return (STATE_DURATIONS_MS[state] ?? STATE_DURATIONS_MS.idle).slice();
		}
		function derivePetState(o) {
			if (o.drag) return "drag";
			if (o.eat) return "eat";
			if (o.play) return "play";
			if (o.wave) return "waving";
			if (o.running) return "running";
			if (o.error) return "failed";
			if (o.waiting) return "waiting";
			if (o.celebrate && Date.now() < o.celebrate) return "jumping";
			if (o.completed) return "review";
			return "idle";
		}

		// ---------------------------------------------------------------------
		// Built-in demo pet: generated on a canvas as a row-major atlas.
		// Rows 0–8 are the 9 Codex V1 states; rows 9–11 are interaction states
		// (eat / play / drag) supplied via the official `animations` override.
		// ---------------------------------------------------------------------
		const CELL = Object.freeze({ width: 96, height: 104, columns: 8, rows: 12 });
		const EXTRA_FRAME_COUNTS = Object.freeze({ eat: 4, play: 4, drag: 4 });
		const C_OUTLINE = "#1f2430";
		const C_BODY = "#35c1a9";
		const C_BELLY = "#8ef0da";
		const C_ACCENT = "#ffb84d";
		const C_EYE = "#1f2430";
		const C_FOOD = "#e35d5d";
		const C_BALL = "#5b8def";

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

		function drawCreature(ctx, p) {
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
			ctx.fillStyle = C_ACCENT;
			ctx.beginPath(); ctx.arc(tipX, tipY - 4, 4.5, 0, Math.PI * 2); ctx.fill();

			// feet (alternate when running / dangle when carried)
			ctx.fillStyle = C_OUTLINE;
			const fdx = p.foot * 6;
			const footY = bodyH / 2 - 2 + (p.dangle ? 7 : 0);
			ctx.fillRect(-bw / 2 + 5 + fdx, footY, 15, 6);
			ctx.fillRect(bw / 2 - 20 - fdx, footY, 15, 6);

			// body
			ctx.fillStyle = C_BODY;
			roundRectPath(ctx, -bw / 2, -bodyH / 2, bw, bodyH, 13);
			ctx.fill();
			ctx.strokeStyle = C_OUTLINE; ctx.lineWidth = 2.5;
			ctx.stroke();

			// belly
			ctx.fillStyle = C_BELLY;
			roundRectPath(ctx, -bw / 2 + 8, -bodyH / 2 + 11, bw - 16, bodyH - 22, 8);
			ctx.fill();

			// waving arm
			if (p.arm) {
				ctx.strokeStyle = C_BODY; ctx.lineWidth = 6;
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
				ctx.fillStyle = C_ACCENT;
				ctx.beginPath(); ctx.arc(0, -bodyH / 2 - 16, 4, 0, Math.PI * 2); ctx.fill();
				ctx.strokeStyle = C_OUTLINE; ctx.lineWidth = 1.5;
				ctx.beginPath(); ctx.arc(0, -bodyH / 2 - 16, 6.5, 0, Math.PI * 2); ctx.stroke();
			}
			ctx.restore();
		}

		function drawCell(ctx, col, row, state, f, total) {
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
			drawCreature(ctx, o);

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

		function buildDefaultAsset() {
			const canvas = document.createElement("canvas");
			canvas.width = CELL.columns * CELL.width;
			canvas.height = CELL.rows * CELL.height;
			const ctx = canvas.getContext("2d");
			const order = ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review", "eat", "play", "drag"];
			for (let row = 0; row < order.length; row++) {
				const state = order[row];
				const count = STATE_FRAME_COUNTS[state] ?? EXTRA_FRAME_COUNTS[state] ?? 1;
				for (let f = 0; f < count; f++) drawCell(ctx, f, row, state, f, count);
			}
			const dataUrl = canvas.toDataURL("image/png");
			const animations = {
				eat: { frames: [72, 73, 74, 75], fps: 6 },
				play: { frames: [80, 81, 82, 83], fps: 7 },
				drag: { frames: [88, 89, 90, 91], fps: 5 },
			};
			const frame = { width: CELL.width, height: CELL.height, columns: CELL.columns, rows: CELL.rows };
			const pet = {
				id: "dsh-pet",
				displayName: "Dee (DSH pet)",
				description: "A tiny teal companion that mirrors the agent's running state.",
				spritesheetPath: "spritesheet.png",
				frame: { ...frame },
				totalFrames: CELL.columns * CELL.rows,
				animations,
			};
			return { pet, dataUrl };
		}

		// ---------------------------------------------------------------------
		// React: animated sprite view
		// ---------------------------------------------------------------------
		function PetView({ state, pet, imageUrl, scale, title }) {
			const grid = spriteGrid(pet);
			const frames = stateFrames(state, pet);
			const durs = stateDurations(state, pet);
			const [idx, setIdx] = React.useState(0);
			React.useEffect(() => setIdx(0), [state]);
			React.useEffect(() => {
				const i = idx % frames.length;
				const delay = durs[i] ?? 150;
				const t = setTimeout(() => setIdx((i + 1) % frames.length), delay);
				return () => clearTimeout(t);
			}, [state, idx, frames, durs]);

			const cellW = Math.round(grid.frameWidth * scale);
			const cellH = Math.round(grid.frameHeight * scale);
			const rect = frameRect(frames[idx % frames.length], grid);
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
		const STATE_LABELS = {
			idle: null,
			running: "Working",
			waiting: "Needs input",
			failed: "Blocked",
			jumping: "Done!",
			waving: "Hi!",
			review: "Ready",
			drag: null,
			eat: "Yum!",
			play: "Whee!",
		};

		function readNum(key, def) {
			try {
				const v = localStorage.getItem(key);
				if (v == null) return def;
				const n = Number(v);
				return Number.isFinite(n) ? n : def;
			} catch { return def; }
		}
		function readPos() {
			try {
				const p = JSON.parse(localStorage.getItem("dsh-pet:pos"));
				if (p && typeof p.x === "number" && typeof p.y === "number") return p;
			} catch { /* ignore */ }
			return null;
		}
		const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

		/** Re-render on a short interval while a transient state is active, so it can lapse. */
		function useTransientTick(active) {
			const [, setTick] = React.useState(0);
			React.useEffect(() => {
				if (!active) return;
				const id = setInterval(() => setTick((t) => t + 1), 200);
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

			const [celebrateUntil, setCelebrateUntil] = React.useState(0);
			const [eatUntil, setEatUntil] = React.useState(0);
			const [playUntil, setPlayUntil] = React.useState(0);
			const [dragging, setDragging] = React.useState(false);
			const [menuOpen, setMenuOpen] = React.useState(false);
			const [showSettings, setShowSettings] = React.useState(false);
			const [size, setSize] = React.useState(() => clamp(readNum("dsh-pet:size", 0.9), 0.5, 1.5));
			const [opacity, setOpacity] = React.useState(() => clamp(readNum("dsh-pet:opacity", 1), 0.2, 1));
			const [pos, setPos] = React.useState(readPos);

			const prevRunning = React.useRef(false);
			React.useEffect(() => {
				if (prevRunning.current === true && running === false) setCelebrateUntil(Date.now() + 2600);
				prevRunning.current = running;
			}, [running]);

			const [asset, setAsset] = React.useState(null);
			React.useEffect(() => {
				let alive = true;
				try {
					const a = buildDefaultAsset();
					if (alive) setAsset(a);
				} catch (e) {
					console.error("[dsh-pet] failed to build the default sprite:", e);
				}
				return () => { alive = false; };
			}, []);

			// initial position (bottom-right) once the overlay layer is measurable
			const rootRef = React.useRef(null);
			React.useLayoutEffect(() => {
				if (pos !== null) return;
				const layer = rootRef.current?.closest("[data-shell-overlay]");
				const w = layer ? layer.clientWidth : window.innerWidth;
				const h = layer ? layer.clientHeight : window.innerHeight;
				const pw = Math.round(96 * size), ph = Math.round(104 * size);
				setPos({ x: w - pw - 16, y: h - ph - 16 });
			}, [pos, size]);

			// persist size/opacity on change
			React.useEffect(() => { try { localStorage.setItem("dsh-pet:size", String(size)); } catch { /* ignore */ } }, [size]);
			React.useEffect(() => { try { localStorage.setItem("dsh-pet:opacity", String(opacity)); } catch { /* ignore */ } }, [opacity]);

			// close menu on outside click
			React.useEffect(() => {
				if (!menuOpen) return;
				const onDown = (e) => {
					if (rootRef.current && !rootRef.current.contains(e.target)) setMenuOpen(false);
				};
				document.addEventListener("pointerdown", onDown);
				return () => document.removeEventListener("pointerdown", onDown);
			}, [menuOpen]);

			const eatActive = eatUntil !== 0 && Date.now() < eatUntil;
			const playActive = playUntil !== 0 && Date.now() < playUntil;
			const celebrateActive = celebrateUntil !== 0 && Date.now() < celebrateUntil;
			useTransientTick(eatActive || playActive || celebrateActive);

			if (!asset) return null;

			const pw = Math.round(96 * size), ph = Math.round(104 * size);
			const state = derivePetState({
				drag: dragging,
				eat: eatActive,
				play: playActive,
				wave: false,
				running,
				error,
				waiting,
				celebrate: celebrateActive ? celebrateUntil : 0,
				completed,
			});
			const label = STATE_LABELS[state];

			// drag handlers (click vs drag disambiguated by movement threshold)
			const dragRef = React.useRef(null);
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
				const layer = e.currentTarget.closest("[data-shell-overlay]");
				const lw = layer ? layer.clientWidth : window.innerWidth;
				const lh = layer ? layer.clientHeight : window.innerHeight;
				setPos({ x: clamp(d.baseX + dx, 0, lw - pw), y: clamp(d.baseY + dy, 0, lh - ph) });
			};
			const onPointerUp = (e) => {
				const d = dragRef.current;
				dragRef.current = null;
				const wasDrag = d != null && d.moved >= 4;
				setDragging(false);
				if (wasDrag) {
					try { localStorage.setItem("dsh-pet:pos", JSON.stringify(pos)); } catch { /* ignore */ }
				} else {
					setMenuOpen((open) => !open);
				}
			};

			const doEat = () => { setEatUntil(Date.now() + 2200); setMenuOpen(false); };
			const doPlay = () => { setPlayUntil(Date.now() + 2600); setMenuOpen(false); };

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
					},
				},
					React.createElement("div", { style: { display: "flex", gap: 8 } },
						React.createElement("button", { type: "button", title: "Feed", style: menuBtn, onClick: doEat }, "🍗"),
						React.createElement("button", { type: "button", title: "Play", style: menuBtn, onClick: doPlay }, "🎾"),
						React.createElement("button", { type: "button", title: "Settings", style: menuBtn, onClick: () => setShowSettings((v) => !v) }, "⚙")
					),
					showSettings && React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6, minWidth: 150 } },
						React.createElement("label", { style: { font: "12px system-ui, sans-serif", color: "var(--dsw-alias-label-primary, #333)" } },
							"尺寸 " + size.toFixed(2),
							React.createElement("input", { type: "range", min: 0.5, max: 1.5, step: 0.05, value: size, style: { width: "100%" }, onChange: (e) => setSize(clamp(Number(e.target.value), 0.5, 1.5)) })
						),
						React.createElement("label", { style: { font: "12px system-ui, sans-serif", color: "var(--dsw-alias-label-primary, #333)" } },
							"透明度 " + opacity.toFixed(2),
							React.createElement("input", { type: "range", min: 0.2, max: 1, step: 0.05, value: opacity, style: { width: "100%" }, onChange: (e) => setOpacity(clamp(Number(e.target.value), 0.2, 1)) })
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
					imageUrl: asset.dataUrl,
					scale: size,
					title: asset.pet.displayName,
				}))
			);
		}

		// ---------------------------------------------------------------------
		// plugin body
		// ---------------------------------------------------------------------
		const inject = ["slots", "sessions"];
		function apply(ctx) {
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "dsh-pet",
				order: 1000,
				label: "Codex Pet",
				inject: () => ({ sessionsService: ctx.sessions }),
			}, PetOverlay));
		}

		exports.PetOverlay = PetOverlay;
		exports.buildDefaultAsset = buildDefaultAsset;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
