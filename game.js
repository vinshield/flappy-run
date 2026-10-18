const GAME_WIDTH = 420;
const GAME_HEIGHT = 640;
const GROUND_HEIGHT = 92;
const PLAYER_X = 100;
const PLAYER_RADIUS = 18;
const PIPE_WIDTH = 74;
const PIPE_GAP = 170;
const PIPE_SPEED = 170;
const GRAVITY = 980;
const FLAP_FORCE = -360;
const PIPE_INTERVAL = 1.45;
const MAX_PIPE_HEIGHT = 350;
const MIN_PIPE_HEIGHT = 150;

const STORAGE_KEYS = {
	best: "startng-flappy-best",
	audio: "startng-flappy-audio-on",
};

const STATES = {
	READY: "READY",
	PLAYING: "PLAYING",
	GAME_OVER: "GAME_OVER",
};

class AudioManager {
	constructor() {
		this.enabled = this.loadPreference();
		this.ctx = null;
	}

	loadPreference() {
		try {
			const raw = localStorage.getItem(STORAGE_KEYS.audio);
			return raw === null ? true : raw === "true";
		} catch (error) {
			return true;
		}
	}

	savePreference() {
		try {
			localStorage.setItem(STORAGE_KEYS.audio, String(this.enabled));
		} catch (error) {
			// ignore storage issues
		}
	}

	ensureContext() {
		if (!this.ctx) {
			const AudioContextClass =
				window.AudioContext || window.webkitAudioContext;
			if (!AudioContextClass) return null;
			this.ctx = new AudioContextClass();
		}

		if (this.ctx.state === "suspended") {
			this.ctx.resume().catch(() => undefined);
		}

		return this.ctx;
	}

	playTone(freq, duration, type, volume, slideTo = null) {
		if (!this.enabled) return;
		const ctx = this.ensureContext();
		if (!ctx) return;

		const oscillator = ctx.createOscillator();
		const gain = ctx.createGain();

		oscillator.type = type || "sine";
		oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
		if (slideTo) {
			oscillator.frequency.exponentialRampToValueAtTime(
				Math.max(50, slideTo),
				ctx.currentTime + duration,
			);
		}

		gain.gain.setValueAtTime(0.0001, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

		oscillator.connect(gain);
		gain.connect(ctx.destination);
		oscillator.start();
		oscillator.stop(ctx.currentTime + duration);
	}

	flap() {
		this.playTone(440, 0.11, "triangle", 0.06, 230);
	}
	score() {
		this.playTone(740, 0.1, "square", 0.05, 520);
	}
	hit() {
		this.playTone(180, 0.3, "sawtooth", 0.09, 80);
	}
	start() {
		this.playTone(360, 0.12, "triangle", 0.06, 240);
	}
	best() {
		this.playTone(620, 0.12, "triangle", 0.07, 780);
		this.playTone(860, 0.16, "triangle", 0.07, 1050);
	}
}

class FlappyGame {
	constructor(canvas, overlay, ui) {
		this.canvas = canvas;
		this.ctx = canvas.getContext("2d");
		this.overlay = overlay;
		this.ui = ui;
		this.audio = new AudioManager();
		this.state = STATES.READY;
		this.lastTime = 0;
		this.score = 0;
		this.bestScore = this.readBestScore();
		this.isReady = true;
		this.pipes = [];
		this.spawnTimer = 0;
		this.player = {
			x: PLAYER_X,
			y: GAME_HEIGHT * 0.46,
			velocityY: 0,
			radius: PLAYER_RADIUS,
			angle: 0,
			bobOffset: 0,
			jetpackGlow: 0.25,
		};
		this.flashTimer = 0;
		this.newBest = false;
		this.countdown = 0;
		this.pendingRestart = false;
		this.animationFrameId = null;
		this.platformStatus = "Local mode";
		this.playerInfo = null;
		this.leaderboardEntries = [];
		this.isSignedIn = false;
		this.signInPromptVisible = false;
		this.activeTouches = new Set();
		this.resizeCanvas();
		this.updateHud();
		this.render();
	}

	readBestScore() {
		try {
			const raw = localStorage.getItem(STORAGE_KEYS.best);
			const parsed = Number(raw);
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
		} catch (error) {
			return 0;
		}
	}

	writeBestScore(value) {
		try {
			localStorage.setItem(STORAGE_KEYS.best, String(value));
		} catch (error) {
			// ignore storage failures
		}
	}

	setStatus(text, variant = "default") {
		this.ui.platformStatus.textContent = text || "";
		this.ui.platformStatus.style.color =
			variant === "warning" ? "var(--warning)" : "var(--muted)";
	}

	bindEvents() {
		window.addEventListener("keydown", (event) => {
			const key = event.key.toLowerCase();
			if ([" ", "arrowup", "w"].includes(key)) {
				event.preventDefault();
				if (
					!["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName || "")
				) {
					if (this.state === STATES.READY) {
						this.startGame();
					}
					this.flap();
				}
			}
		});

		this.canvas.addEventListener(
			"pointerdown",
			(event) => {
				event.preventDefault();
				if (this.state === STATES.READY) {
					this.startGame();
				}
				this.flap();
			},
			{ passive: false },
		);

		this.ui.startButton.addEventListener("click", () => {
			if (this.state === STATES.GAME_OVER || this.state === STATES.READY) {
				this.startGame();
			}
		});

		this.ui.signInButton.addEventListener("click", () => {
			window.location.href = window.startNgClient.buildStartNgSignInUrl();
		});

		this.ui.muteToggle.addEventListener("click", () => {
			this.audio.enabled = !this.audio.enabled;
			this.audio.savePreference();
			this.updateMuteButton();
		});

		document.addEventListener("visibilitychange", () => {
			if (document.hidden) {
				this.pauseGameIfActive();
			}
		});

		window.addEventListener("focus", () => {
			this.refreshPlatformPlayer();
		});

		window.addEventListener("resize", () => this.resizeCanvas());
	}

	resizeCanvas() {
		const ratio = window.devicePixelRatio || 1;
		const displayWidth = this.canvas.clientWidth || GAME_WIDTH;
		const displayHeight = displayWidth * (GAME_HEIGHT / GAME_WIDTH);

		this.canvas.width = Math.round(GAME_WIDTH * ratio);
		this.canvas.height = Math.round(GAME_HEIGHT * ratio);
		this.canvas.style.height = `${displayHeight}px`;
		this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
	}

	updateMuteButton() {
		this.ui.muteToggle.textContent = this.audio.enabled ? "🔊" : "🔇";
		this.ui.muteToggle.setAttribute(
			"aria-label",
			this.audio.enabled ? "Mute sound" : "Unmute sound",
		);
	}

	updateHud() {
		this.ui.scoreValue.textContent = String(this.score);
		this.ui.bestValue.textContent = String(this.bestScore);
	}

	showOverlay(title, message, options = {}) {
		this.ui.overlayTitle.textContent = title;
		this.ui.overlayMessage.textContent = message;
		this.overlay.classList.add("visible");
		this.ui.scoreSummary.classList.toggle("hidden", !options.showScoreSummary);
		this.ui.finalScore.textContent = String(options.finalScore ?? this.score);
		this.ui.finalBest.textContent = String(options.finalBest ?? this.bestScore);
		this.ui.startButton.textContent = options.primaryAction || "Start run";
	}

	hideOverlay() {
		this.overlay.classList.remove("visible");
	}

	startGame() {
		if (this.state === STATES.PLAYING) return;
		this.score = 0;
		this.newBest = false;
		this.pipes = [];
		this.spawnTimer = 0.9;
		this.player.y = GAME_HEIGHT * 0.46;
		this.player.velocityY = 0;
		this.player.angle = 0;
		this.player.jetpackGlow = 0.4;
		this.state = STATES.PLAYING;
		this.hideOverlay();
		this.updateHud();
		this.audio.start();
		this.submitPossibleBest();
	}

	flap() {
		if (this.state !== STATES.PLAYING && this.state !== STATES.READY) return;
		if (this.state === STATES.READY) {
			this.startGame();
		}

		this.player.velocityY = FLAP_FORCE * 0.96;
		this.player.angle = -0.35;
		this.player.jetpackGlow = 1;
	}

	gameOver() {
		if (this.state !== STATES.PLAYING) return;
		this.state = STATES.GAME_OVER;
		this.audio.hit();
		this.newBest = this.score > this.bestScore;
		if (this.newBest) {
			this.bestScore = this.score;
			this.writeBestScore(this.bestScore);
			this.audio.best();
		}
		this.updateHud();
		this.showOverlay("Game over", "The skyline wins this round.", {
			showScoreSummary: true,
			finalScore: this.score,
			finalBest: this.bestScore,
			primaryAction: "Restart run",
		});

		this.updatePlatformAfterRun();
	}

	updatePlatformAfterRun() {
		const signedIn = Boolean(this.playerInfo && this.playerInfo.user);
		const score = Math.max(0, Math.round(this.score));

		if (signedIn) {
			this.setStatus("Saving score…", "warning");
			window.startNgClient
				.submitScoreToStartNg(score)
				.then((result) => {
					if (result.ok) {
						this.setStatus("Score saved to start.ng", "ok");
					} else {
						this.setStatus("Score saved locally only", "warning");
					}
					return this.refreshLeaderboard();
				})
				.catch(() => {
					this.setStatus("Score not submitted", "warning");
				});
			return;
		}

		this.setStatus("Guest mode: sign in to save your score", "warning");
		this.refreshLeaderboard();
	}

	submitPossibleBest() {
		if (this.bestScore > 0) {
			this.updateHud();
		}
	}

	update(deltaTime) {
		if (this.state !== STATES.PLAYING) {
			if (this.state === STATES.READY) {
				this.player.bobOffset += deltaTime * 2;
			}
			return;
		}

		this.spawnTimer -= deltaTime;
		if (this.spawnTimer <= 0) {
			this.spawnPipe();
			this.spawnTimer = PIPE_INTERVAL;
		}

		this.player.velocityY += GRAVITY * deltaTime;
		this.player.y += this.player.velocityY * deltaTime;
		this.player.jetpackGlow = Math.max(
			0,
			this.player.jetpackGlow - deltaTime * 2.5,
		);

		const targetAngle = Math.max(
			-0.28,
			Math.min(0.28, this.player.velocityY / 1600),
		);
		this.player.angle += (targetAngle - this.player.angle) * 0.18;

		if (this.player.y - this.player.radius <= 0) {
			this.player.y = this.player.radius;
			this.player.velocityY = 0;
		}

		const floorY = GAME_HEIGHT - GROUND_HEIGHT - this.player.radius;
		if (this.player.y >= floorY) {
			this.player.y = floorY;
			this.gameOver();
		}

		const moveDistance = PIPE_SPEED * deltaTime;
		for (let i = this.pipes.length - 1; i >= 0; i -= 1) {
			const pipe = this.pipes[i];
			pipe.x -= moveDistance;

			if (!pipe.scored && pipe.x + PIPE_WIDTH < this.player.x) {
				pipe.scored = true;
				this.score += 1;
				this.audio.score();
				this.updateHud();
			}

			if (pipe.x + PIPE_WIDTH < -20) {
				this.pipes.splice(i, 1);
			}
		}

		for (const pipe of this.pipes) {
			if (this.checkPipeCollision(pipe)) {
				this.gameOver();
				break;
			}
		}

		if (this.score > this.bestScore) {
			this.bestScore = this.score;
			this.writeBestScore(this.bestScore);
			this.updateHud();
		}
	}

	spawnPipe() {
		const minY = 110;
		const maxY = GAME_HEIGHT - GROUND_HEIGHT - PIPE_GAP - 110;
		const gapY = minY + Math.random() * (maxY - minY);

		this.pipes.push({
			x: GAME_WIDTH + 30,
			width: PIPE_WIDTH,
			gapY,
			gapHeight: PIPE_GAP,
			scored: false,
		});
	}

	checkPipeCollision(pipe) {
		const playerLeft = this.player.x - this.player.radius;
		const playerRight = this.player.x + this.player.radius;
		const playerTop = this.player.y - this.player.radius;
		const playerBottom = this.player.y + this.player.radius;

		const topPipeBottom = pipe.gapY;
		const bottomPipeTop = pipe.gapY + pipe.gapHeight;
		const pipeLeft = pipe.x;
		const pipeRight = pipe.x + pipe.width;

		const overlapsHorizontal = playerRight > pipeLeft && playerLeft < pipeRight;

		if (!overlapsHorizontal) return false;

		const hitsTop = playerTop < topPipeBottom;
		const hitsBottom = playerBottom > bottomPipeTop;

		return hitsTop || hitsBottom;
	}

	renderBackground() {
		const sky = this.ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
		sky.addColorStop(0, "#78d7ff");
		sky.addColorStop(0.48, "#d6f5ff");
		sky.addColorStop(0.48, "#d4f6c9");
		sky.addColorStop(1, "#9fd75e");
		this.ctx.fillStyle = sky;
		this.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

		this.ctx.fillStyle = "rgba(255,255,255,0.32)";
		for (let i = 0; i < 8; i += 1) {
			const x =
				(i * 80 + ((this.score * 12 + performance.now() * 0.01) % 90)) %
				(GAME_WIDTH + 80);
			const y = 90 + (i % 5) * 35;
			this.ctx.beginPath();
			this.ctx.arc(x, y, 26, 0, Math.PI * 2);
			this.ctx.fill();
		}

		this.ctx.fillStyle = "#7dbb6d";
		for (let i = 0; i < 12; i += 1) {
			const hillX = i * 55 + ((this.score * 4 + performance.now() * 0.01) % 90);
			const hillY = GAME_HEIGHT - GROUND_HEIGHT - 18;
			this.ctx.beginPath();
			this.ctx.moveTo(hillX, hillY);
			this.ctx.quadraticCurveTo(hillX + 35, hillY - 42, hillX + 70, hillY);
			this.ctx.lineTo(hillX + 70, GAME_HEIGHT);
			this.ctx.lineTo(hillX, GAME_HEIGHT);
			this.ctx.closePath();
			this.ctx.fill();
		}
	}

	renderGround() {
		this.ctx.fillStyle = "#2d8f61";
		this.ctx.fillRect(
			0,
			GAME_HEIGHT - GROUND_HEIGHT,
			GAME_WIDTH,
			GROUND_HEIGHT,
		);

		this.ctx.fillStyle = "#b6ef78";
		for (let i = 0; i < GAME_WIDTH + 30; i += 18) {
			const x = i - ((this.score * 1.5 + performance.now() * 0.025) % 24);
			this.ctx.fillRect(x, GAME_HEIGHT - GROUND_HEIGHT + 18, 12, 8);
		}

		this.ctx.fillStyle = "#6dcb78";
		this.ctx.fillRect(0, GAME_HEIGHT - GROUND_HEIGHT, GAME_WIDTH, 10);
	}

	drawPipe(pipe) {
		const topHeight = pipe.gapY;
		const bottomY = pipe.gapY + pipe.gapHeight;

		this.ctx.fillStyle = "#48d27c";
		this.ctx.strokeStyle = "#205f49";
		this.ctx.lineWidth = 3;

		this.ctx.fillRect(pipe.x, 0, pipe.width, topHeight);
		this.ctx.fillRect(
			pipe.x,
			bottomY,
			pipe.width,
			GAME_HEIGHT - GROUND_HEIGHT - bottomY,
		);

		this.ctx.fillStyle = "#7af1aa";
		this.ctx.fillRect(pipe.x - 6, topHeight - 18, pipe.width + 12, 18);
		this.ctx.fillRect(pipe.x - 6, bottomY, pipe.width + 12, 18);

		this.ctx.strokeRect(pipe.x, 0, pipe.width, topHeight);
		this.ctx.strokeRect(
			pipe.x,
			bottomY,
			pipe.width,
			GAME_HEIGHT - GROUND_HEIGHT - bottomY,
		);
	}

	drawJetpack() {
		const glow = Math.max(0, this.player.jetpackGlow || 0);
		if (glow <= 0.02) return;

		const bob =
			this.state === STATES.READY ? Math.sin(this.player.bobOffset) * 5 : 0;
		const x = this.player.x;
		const y = this.player.y + bob;

		this.ctx.save();
		this.ctx.translate(x, y);
		this.ctx.rotate(this.player.angle);

		this.ctx.fillStyle = "rgba(16, 24, 38, 0.92)";
		this.ctx.fillRect(-15, 11, 9, 16);
		this.ctx.fillRect(6, 11, 9, 16);

		const flameSize = 8 + glow * 12 + Math.sin(performance.now() * 0.025) * 3;
		this.ctx.fillStyle = `rgba(255, 185, 72, ${0.25 + glow * 0.7})`;
		this.ctx.beginPath();
		this.ctx.moveTo(-8, 27);
		this.ctx.lineTo(0, 27 + flameSize);
		this.ctx.lineTo(8, 27);
		this.ctx.closePath();
		this.ctx.fill();

		this.ctx.fillStyle = `rgba(255, 255, 255, ${0.18 + glow * 0.35})`;
		this.ctx.beginPath();
		this.ctx.moveTo(-5, 27);
		this.ctx.lineTo(0, 27 + flameSize * 0.75);
		this.ctx.lineTo(5, 27);
		this.ctx.closePath();
		this.ctx.fill();
		this.ctx.restore();
	}

	getActiveStyle() {
		const userStyle = this.playerInfo?.user?.style || {};
		const guestStyle = this.playerInfo?.guest?.style || {};
		const playerStyle = this.playerInfo?.player?.style || {};
		return { ...guestStyle, ...playerStyle, ...userStyle };
	}

	drawPlayer() {
		const { x, y, radius, angle } = this.player;
		const bob =
			this.state === STATES.READY ? Math.sin(this.player.bobOffset) * 5 : 0;
		const bodyY = y + bob;

		this.ctx.save();
		this.ctx.translate(x, bodyY);
		this.ctx.rotate(angle);

		const primaryColor = this.getStyleColor("primaryColor", "#55a0ff");
		const secondaryColor = this.getStyleColor("secondaryColor", "#324c90");
		const skinColor = this.getStyleColor("skinColor", "#f6c79e");
		const hairColor = this.getStyleColor("hairColor", "#17120f");

		this.ctx.fillStyle = primaryColor;
		this.ctx.beginPath();
		this.ctx.ellipse(0, 6, 19, 14, 0, 0, Math.PI * 2);
		this.ctx.fill();

		this.ctx.fillStyle = secondaryColor;
		this.ctx.fillRect(-14, 16, 28, 14);

		this.ctx.fillStyle = skinColor;
		this.ctx.beginPath();
		this.ctx.arc(0, -10, 14, 0, Math.PI * 2);
		this.ctx.fill();

		this.ctx.fillStyle = hairColor;
		this.ctx.beginPath();
		this.ctx.arc(0, -18, 12, Math.PI, 0);
		this.ctx.fill();

		this.ctx.fillStyle = "#1a2140";
		this.ctx.fillRect(-5, 8, 3, 12);
		this.ctx.fillRect(2, 8, 3, 12);

		this.ctx.fillStyle = "#fff";
		this.ctx.beginPath();
		this.ctx.arc(-5, -10, 2.3, 0, Math.PI * 2);
		this.ctx.arc(5, -10, 2.3, 0, Math.PI * 2);
		this.ctx.fill();

		this.ctx.fillStyle = "#0b1632";
		this.ctx.beginPath();
		this.ctx.arc(-5, -10, 1.2, 0, Math.PI * 2);
		this.ctx.arc(5, -10, 1.2, 0, Math.PI * 2);
		this.ctx.fill();

		this.drawAccessory();
		this.ctx.restore();
	}

	drawAccessory() {
		const bodyStyle = this.getActiveStyle();
		const hat = bodyStyle.hat || "none";
		const accessory = bodyStyle.accessory || "none";

		if (hat !== "none") {
			const hatColor = this.getStyleColor("primaryColor", "#d6a3ff");
			this.ctx.fillStyle = hatColor;
			if (hat === "crown") {
				this.ctx.beginPath();
				this.ctx.moveTo(-15, -23);
				this.ctx.lineTo(-8, -35);
				this.ctx.lineTo(0, -24);
				this.ctx.lineTo(8, -35);
				this.ctx.lineTo(15, -23);
				this.ctx.closePath();
				this.ctx.fill();
			} else if (hat === "cap") {
				this.ctx.fillRect(-16, -24, 32, 10);
				this.ctx.fillRect(-10, -34, 20, 12);
			} else if (hat === "beanie") {
				this.ctx.fillRect(-16, -24, 32, 12);
				this.ctx.fillRect(-10, -34, 20, 12);
			} else if (hat === "tophat") {
				this.ctx.fillRect(-12, -34, 24, 14);
				this.ctx.fillRect(-16, -22, 32, 10);
			}
		}

		if (accessory === "glasses") {
			this.ctx.strokeStyle = "#1a2344";
			this.ctx.lineWidth = 2;
			this.ctx.strokeRect(-12, -15, 9, 7);
			this.ctx.strokeRect(3, -15, 9, 7);
			this.ctx.beginPath();
			this.ctx.moveTo(-2, -11.5);
			this.ctx.lineTo(3, -11.5);
			this.ctx.stroke();
		}

		if (accessory === "earrings") {
			this.ctx.strokeStyle = "#f0d661";
			this.ctx.lineWidth = 2;
			this.ctx.beginPath();
			this.ctx.arc(-14, 2, 3, 0, Math.PI * 2);
			this.ctx.arc(14, 2, 3, 0, Math.PI * 2);
			this.ctx.stroke();
		}

		if (accessory === "scarf") {
			this.ctx.fillStyle = "#d3306f";
			this.ctx.fillRect(-12, 5, 24, 7);
		}

		if (accessory === "backpack") {
			this.ctx.fillStyle = "#e8846d";
			this.ctx.fillRect(-17, 16, 9, 14);
			this.ctx.fillRect(8, 16, 9, 14);
		}
	}

	getStyleColor(key, fallback) {
		const style = this.getActiveStyle();
		const value = style[key] || fallback;
		return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
			? value
			: fallback;
	}

	render() {
		this.ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
		this.renderBackground();
		for (const pipe of this.pipes) {
			this.drawPipe(pipe);
		}
		this.renderGround();
		this.drawJetpack();
		this.drawPlayer();
	}

	loop(timestamp) {
		if (!this.lastTime) this.lastTime = timestamp;
		const deltaTime = Math.min((timestamp - this.lastTime) / 1000, 0.032);
		this.lastTime = timestamp;
		this.update(deltaTime);
		this.render();
		this.animationFrameId = window.requestAnimationFrame((time) =>
			this.loop(time),
		);
	}

	startLoop() {
		if (this.animationFrameId) {
			window.cancelAnimationFrame(this.animationFrameId);
		}
		this.lastTime = 0;
		this.animationFrameId = window.requestAnimationFrame((time) =>
			this.loop(time),
		);
	}

	updatePlayerCard() {
		const player =
			this.playerInfo?.player ||
			this.playerInfo?.guest ||
			this.playerInfo ||
			null;
		const isSignedIn = Boolean(this.playerInfo && this.playerInfo.user);
		const displayName = player?.name || "Guest";
		const accountText =
			isSignedIn && this.playerInfo.user?.account
				? `@${this.playerInfo.user.account}`
				: "Not signed in";

		this.ui.playerName.textContent = displayName;
		this.ui.playerAccount.textContent = accountText;
		this.ui.signInButton.classList.toggle("hidden", isSignedIn || !player);

		const avatar = this.ui.playerAvatar;
		avatar.style.background = this.makeAvatarBackground(player);
		avatar.innerHTML = "";

		if (player?.face) {
			const img = document.createElement("img");
			img.src = player.face;
			img.alt = `${displayName} avatar`;
			img.style.width = "100%";
			img.style.height = "100%";
			img.style.objectFit = "cover";
			img.style.borderRadius = "50%";
			avatar.appendChild(img);
		}
	}

	makeAvatarBackground(player) {
		const style = player?.style || {};
		const primaryColor = style.primaryColor || "#7cf7d4";
		return `linear-gradient(135deg, ${primaryColor}, ${style.secondaryColor || "#7dd3fc"})`;
	}

	async refreshPlatformPlayer() {
		try {
			const response = await window.startNgClient.fetchCurrentPlayer();
			this.playerInfo = response || { player: null, guest: null };
			this.isSignedIn = Boolean(response && response.user);
			this.updatePlayerCard();

			if (this.isSignedIn) {
				this.setStatus("Signed in via start.ng", "ok");
			} else {
				this.setStatus("Guest mode: sign in to save your score", "warning");
			}

			await this.refreshLeaderboard();
		} catch (error) {
			this.playerInfo = null;
			this.updatePlayerCard();
			this.setStatus("start.ng unavailable on this device", "warning");
		}
	}

	async refreshLeaderboard() {
		const list = this.ui.leaderboardList;
		list.innerHTML = "";

		try {
			const result = await window.startNgClient.loadLeaderboard(10);
			this.ui.leaderboardState.textContent = result.ok ? "live" : "offline";
			this.ui.leaderboardHint.textContent = result.ok
				? "Updated from start.ng."
				: "Leaderboard unavailable. Sign in or open the game on start.ng.";

			if (!result.ok || !result.entries.length) {
				const item = document.createElement("li");
				item.innerHTML =
					'<span class="leaderboard-rank">—</span><span class="leaderboard-name">No recorded scores</span><span class="leaderboard-score">0</span>';
				list.appendChild(item);
				return;
			}

			result.entries.slice(0, 10).forEach((entry, index) => {
				const item = document.createElement("li");
				const playerId = Number(entry.player_id ?? entry.id ?? 0);
				const isCurrent =
					this.playerInfo &&
					this.playerInfo.user &&
					Number(this.playerInfo.user.id) === playerId;
				item.classList.toggle("highlight", isCurrent);
				item.innerHTML = `
          <span class="leaderboard-rank">${index + 1}</span>
          <span class="leaderboard-name">${entry.name || "Player"}</span>
          <span class="leaderboard-score">${Number(entry.score ?? entry.stats?.score ?? 0)}</span>
        `;
				list.appendChild(item);
			});
		} catch (error) {
			this.ui.leaderboardState.textContent = "offline";
			this.ui.leaderboardHint.textContent =
				"Connection unavailable while loading the leaderboard.";
			const item = document.createElement("li");
			item.innerHTML =
				'<span class="leaderboard-rank">—</span><span class="leaderboard-name">Leaderboard offline</span><span class="leaderboard-score">0</span>';
			list.appendChild(item);
		}
	}
}

function initializeGame() {
	const canvas = document.getElementById("gameCanvas");
	const overlay = document.getElementById("overlay");

	const ui = {
		scoreValue: document.getElementById("scoreValue"),
		bestValue: document.getElementById("bestValue"),
		overlayTitle: document.getElementById("overlayTitle"),
		overlayMessage: document.getElementById("overlayMessage"),
		startButton: document.getElementById("startButton"),
		signInButton: document.getElementById("signInButton"),
		finalScore: document.getElementById("finalScore"),
		finalBest: document.getElementById("finalBest"),
		scoreSummary: document.getElementById("scoreSummary"),
		muteToggle: document.getElementById("muteToggle"),
		platformStatus: document.getElementById("platformStatus"),
		playerName: document.getElementById("playerName"),
		playerAccount: document.getElementById("playerAccount"),
		playerAvatar: document.getElementById("playerAvatar"),
		leaderboardList: document.getElementById("leaderboardList"),
		leaderboardState: document.getElementById("leaderboardState"),
		leaderboardHint: document.getElementById("leaderboardHint"),
		overlay,
	};

	const game = new FlappyGame(canvas, overlay, ui);
	window.__flappyGame = game;
	game.bindEvents();
	game.updateMuteButton();
	game.showOverlay(
		"Flappy Run",
		"Tap, click, or press space to start flying through the neon skyline.",
		{
			primaryAction: "Start run",
		},
	);
	game.startLoop();
	game.refreshPlatformPlayer();
}

if (document.readyState === "loading") {
	window.addEventListener("DOMContentLoaded", initializeGame, { once: true });
} else {
	initializeGame();
}
