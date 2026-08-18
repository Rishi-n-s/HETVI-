

(function () {
  'use strict';

  // --- Sound Synthesizer Engine ---
  class NetflixAudioEngine {
    constructor() {
      this.ctx = null;
    }

    init() {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.ctx = new AudioContext();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    playTaDum() {
      this.init();
      if (!this.ctx) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;

      // Master Gain
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.9, now);
      master.connect(ctx.destination);

      // Reverb / Delay Simulation (Convolver or Feedback Delay)
      const delay = ctx.createDelay();
      delay.delayTime.setValueAtTime(0.12, now);
      const delayGain = ctx.createGain();
      delayGain.gain.setValueAtTime(0.35, now);
      delay.connect(delayGain);
      delayGain.connect(delay);
      delayGain.connect(master);

      // --- LAYER 1: Deep Sub Bass Boom (The "TA" transient & sub drop) ---
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(95, now);
      subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.9);

      subGain.gain.setValueAtTime(0.01, now);
      subGain.gain.linearRampToValueAtTime(0.95, now + 0.04);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);

      subOsc.connect(subGain);
      subGain.connect(master);
      subOsc.start(now);
      subOsc.stop(now + 1.6);

      // --- LAYER 2: Cinematic Anvil / Metallic Punch Hit ---
      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseBuffer.length; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(800, now);
      noiseFilter.Q.setValueAtTime(3.0, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.6, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      whiteNoise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(master);
      noiseGain.connect(delay);
      whiteNoise.start(now);
      whiteNoise.stop(now + 0.35);

      // --- LAYER 3: The Second Heavy Impact ("DUM" at +0.28s) ---
      const dumTime = now + 0.28;

      const dumSub = ctx.createOscillator();
      const dumSubGain = ctx.createGain();
      dumSub.type = 'triangle';
      dumSub.frequency.setValueAtTime(110, dumTime);
      dumSub.frequency.exponentialRampToValueAtTime(26, dumTime + 1.8);

      dumSubGain.gain.setValueAtTime(0.01, dumTime);
      dumSubGain.gain.linearRampToValueAtTime(1.0, dumTime + 0.05);
      dumSubGain.gain.exponentialRampToValueAtTime(0.001, dumTime + 2.2);

      dumSub.connect(dumSubGain);
      dumSubGain.connect(master);
      dumSub.start(dumTime);
      dumSub.stop(dumTime + 2.2);

      // --- LAYER 4: Majestic Romantic Chord Swell (D Minor / F Maj cinematic harmony) ---
      // Frequencies: D3 (146.83Hz), A3 (220.0Hz), D4 (293.66Hz), F4 (349.23Hz), A4 (440.0Hz)
      const chordFreqs = [146.83, 220.0, 293.66, 349.23, 440.0, 587.33];
      chordFreqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();

        osc.type = idx % 2 === 0 ? 'sawtooth' : 'sine';
        osc.frequency.setValueAtTime(freq, dumTime);

        // Lowpass filter for smooth cinematic warmth
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200 + idx * 200, dumTime);

        g.gain.setValueAtTime(0.001, dumTime);
        g.gain.linearRampToValueAtTime(0.18 / (idx + 1), dumTime + 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, dumTime + 3.2);

        osc.connect(filter);
        filter.connect(g);
        g.connect(master);
        g.connect(delay);

        osc.start(dumTime);
        osc.stop(dumTime + 3.2);
      });

      // --- LAYER 5: Romantic Shimmer / Sparkle Chime (When lasers burst at +1.8s) ---
      const laserTime = now + 1.8;
      const shimmerFreqs = [880, 1174.66, 1318.51, 1760, 2093, 2637];
      shimmerFreqs.forEach((freq, i) => {
        const sOsc = ctx.createOscillator();
        const sGain = ctx.createGain();
        sOsc.type = 'sine';
        sOsc.frequency.setValueAtTime(freq, laserTime + i * 0.04);
        sGain.gain.setValueAtTime(0.001, laserTime + i * 0.04);
        sGain.gain.linearRampToValueAtTime(0.08, laserTime + i * 0.04 + 0.02);
        sGain.gain.exponentialRampToValueAtTime(0.0001, laserTime + i * 0.04 + 1.2);

        sOsc.connect(sGain);
        sGain.connect(master);
        sGain.connect(delay);

        sOsc.start(laserTime + i * 0.04);
        sOsc.stop(laserTime + i * 0.04 + 1.2);
      });
    }
  }

  // --- Netflix 3D Ribbon & Particle Explosion Canvas Engine ---
  class NetflixVisualEngine {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ribbons = [];
      this.particles = [];
      this.stars = [];
      this.animId = null;
      this.startTime = 0;
      this.active = false;
      this.exploding = false;

      this.resize();
      window.addEventListener('resize', () => this.resize());
      this.initStars();
    }

    resize() {
      this.width = this.canvas.width = window.innerWidth;
      this.height = this.canvas.height = window.innerHeight;
      this.centerX = this.width / 2;
      this.centerY = this.height / 2;
    }

    initStars() {
      this.stars = [];
      for (let i = 0; i < 180; i++) {
        this.stars.push({
          x: (Math.random() - 0.5) * this.width * 1.5,
          y: (Math.random() - 0.5) * this.height * 1.5,
          z: Math.random() * 1000 + 50,
          size: Math.random() * 2 + 0.8,
          color: Math.random() > 0.4 ? '#ffffff' : '#ffb6c1',
          alpha: Math.random() * 0.7 + 0.3
        });
      }
    }

    initRibbons() {
      this.ribbons = [];
      // Netflix prismatic romantic color palette
      const colors = [
        '#E50914', '#FF1E56', '#FF007F', '#FF3366', '#FF5E7E',
        '#FFB3C6', '#D12450', '#990000', '#FF4500', '#FFD700',
        '#9B5DE5', '#00F0FF', '#FFFFFF', '#FF85A1', '#C70039'
      ];

      const ribbonCount = window.innerWidth < 768 ? 220 : 380;
      for (let i = 0; i < ribbonCount; i++) {
        const angle = (i / ribbonCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        // Distribute in an ellipse matching "H ❤ R" bounding box
        const spreadX = (Math.random() - 0.5) * Math.min(this.width * 0.6, 500);
        const spreadY = (Math.random() - 0.5) * 140;

        const depth = Math.random() * 800 + 100;
        const speed = Math.random() * 18 + 14;

        this.ribbons.push({
          origX: spreadX,
          origY: spreadY,
          x: spreadX,
          y: spreadY,
          z: depth,
          speed: speed,
          accel: 1.05 + Math.random() * 0.04,
          length: Math.random() * 300 + 150,
          width: Math.random() * 4.5 + 1.2,
          color: colors[Math.floor(Math.random() * colors.length)],
          opacity: Math.random() * 0.8 + 0.2,
          glow: Math.random() * 20 + 10,
          angle: angle,
          curveFactor: (Math.random() - 0.5) * 1.5,
          isHeartParticle: Math.random() > 0.75
        });
      }

      // Sparkle Hearts & Stars
      this.particles = [];
      for (let i = 0; i < 90; i++) {
        this.particles.push({
          x: (Math.random() - 0.5) * 200,
          y: (Math.random() - 0.5) * 100,
          vx: (Math.random() - 0.5) * 12,
          vy: (Math.random() - 0.5) * 12,
          size: Math.random() * 14 + 6,
          rotation: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 0.1,
          color: Math.random() > 0.5 ? '#ff2d55' : '#ffb6c1',
          alpha: 1,
          decay: Math.random() * 0.015 + 0.008
        });
      }
    }

    start() {
      this.active = true;
      this.startTime = performance.now();
      this.render();
    }

    triggerExplosion() {
      this.exploding = true;
      this.initRibbons();
    }

    drawHeart(ctx, x, y, size, color, alpha) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      const topCurveHeight = size * 0.3;
      ctx.moveTo(0, topCurveHeight);
      // top left curve
      ctx.bezierCurveTo(
        0, 0,
        -size / 2, 0,
        -size / 2, topCurveHeight
      );
      // bottom left curve
      ctx.bezierCurveTo(
        -size / 2, (size + topCurveHeight) / 2,
        0, (size + topCurveHeight) / 1.4,
        0, size
      );
      // bottom right curve
      ctx.bezierCurveTo(
        0, (size + topCurveHeight) / 1.4,
        size / 2, (size + topCurveHeight) / 2,
        size / 2, topCurveHeight
      );
      // top right curve
      ctx.bezierCurveTo(
        size / 2, 0,
        0, 0,
        0, topCurveHeight
      );
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    render() {
      if (!this.active) return;
      const ctx = this.ctx;
      const width = this.width;
      const height = this.height;
      const cx = this.centerX;
      const cy = this.centerY;

      // Soft trailing clear for motion blur
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.fillRect(0, 0, width, height);

      // 1. Draw Starfield & cosmic dust
      const fov = 400;
      for (let star of this.stars) {
        star.z -= 1.5;
        if (star.z <= 0) star.z = 1000;

        const k = fov / star.z;
        const px = cx + star.x * k;
        const py = cy + star.y * k;
        const pSize = star.size * k;

        if (px >= 0 && px < width && py >= 0 && py < height) {
          ctx.fillStyle = star.color;
          ctx.globalAlpha = star.alpha * Math.min(1, (1000 - star.z) / 400);
          ctx.beginPath();
          ctx.arc(px, py, Math.max(0.5, pSize), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 2. Draw 3D Light Ribbons (The Netflix Laser Explosion)
      if (this.exploding) {
        // Sort ribbons by Z depth for realistic rendering
        this.ribbons.sort((a, b) => b.z - a.z);

        for (let r of this.ribbons) {
          r.speed *= r.accel;
          r.z -= r.speed;

          if (r.z <= 5) {
            // Respawn or let it fly through camera
            continue;
          }

          const scale = fov / Math.max(r.z, 1);
          const screenX = cx + r.x * scale;
          const screenY = cy + r.y * scale;

          // Tail in 3D space
          const tailZ = r.z + r.length;
          const tailScale = fov / tailZ;
          const tailX = cx + (r.x - Math.cos(r.angle) * 30 * r.curveFactor) * tailScale;
          const tailY = cy + (r.y - Math.sin(r.angle) * 30) * tailScale;

          const rWidth = Math.max(1, r.width * scale * 1.5);

          // Draw ribbon line with gradient laser glow
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(tailX, tailY);
          ctx.lineTo(screenX, screenY);

          // Dynamic gradient along the laser ribbon
          const grad = ctx.createLinearGradient(tailX, tailY, screenX, screenY);
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(0.3, r.color);
          grad.addColorStop(1, '#ffffff');

          ctx.strokeStyle = grad;
          ctx.lineWidth = rWidth;
          ctx.lineCap = 'round';
          ctx.shadowColor = r.color;
          ctx.shadowBlur = Math.min(30, r.glow * scale * 0.8);
          ctx.globalAlpha = Math.min(1, r.opacity * (1.2 - r.z / 1000));
          ctx.stroke();

          // If ribbon is near camera, draw glowing head
          if (scale > 1.2) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(screenX, screenY, rWidth * 0.8, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();
        }

        // 3. Draw Exploding Particles & Floating Heart Sparks
        for (let p of this.particles) {
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.98;
          p.vy *= 0.98;
          p.rotation += p.vRot;
          p.alpha -= p.decay;

          if (p.alpha > 0) {
            this.drawHeart(ctx, cx + p.x, cy + p.y, p.size, p.color, p.alpha);
          }
        }
      }

      this.animId = requestAnimationFrame(() => this.render());
    }

    stop() {
      this.active = false;
      if (this.animId) {
        cancelAnimationFrame(this.animId);
      }
    }
  }

  // --- Main Intro Orchestrator ---
  class NetflixIntroManager {
    constructor() {
      this.audio = new NetflixAudioEngine();
      this.overlay = null;
      this.visuals = null;
      this.isCompleted = false;
    }

    buildUI() {
      if (document.getElementById('netflix-intro-overlay')) return;

      const overlay = document.createElement('div');
      overlay.id = 'netflix-intro-overlay';
      overlay.innerHTML = `
        <div class="netflix-vignette"></div>
        <canvas id="netflix-ribbon-canvas"></canvas>
        
        <button class="netflix-skip-btn" id="netflix-skip-btn" title="Skip to Memories">
          Skip <span>⏭</span>
        </button>

        <div class="netflix-anamorphic-flare" id="netflix-flare"></div>

        <div class="netflix-logo-container" id="netflix-logo-box">
          <div class="netflix-monogram" id="netflix-monogram">
            <div class="netflix-letter" data-letter="H" id="letter-h">H</div>
            <div class="netflix-heart-wrap" id="heart-wrap">
              <svg class="netflix-heart-svg" viewBox="0 0 24 24" fill="#ff1744">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </div>
            <div class="netflix-letter" data-letter="R" id="letter-r">R</div>
          </div>
          <div class="netflix-subtitle" id="netflix-subtitle">
            A <span>BAKUDI & RISHI</span> ORIGINAL
          </div>
        </div>

        <div class="netflix-supernova" id="netflix-supernova"></div>
      `;

      document.body.appendChild(overlay);
      this.overlay = overlay;

      const canvas = document.getElementById('netflix-ribbon-canvas');
      this.visuals = new NetflixVisualEngine(canvas);

      // Handle Skip Button and Click anywhere
      document.getElementById('netflix-skip-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.finish();
      });

      overlay.addEventListener('click', () => {
        this.finish();
      });
    }

    start(targetUrl = 'index.html') {
      this.targetUrl = targetUrl;
      this.buildUI();
      sessionStorage.setItem('unlocked', 'true');

      // 1. Activate Fullscreen Overlay
      this.overlay.classList.add('active');
      this.visuals.start();

      const logoBox = document.getElementById('netflix-logo-box');
      const letterH = document.getElementById('letter-h');
      const letterR = document.getElementById('letter-r');
      const heartWrap = document.getElementById('heart-wrap');
      const subtitle = document.getElementById('netflix-subtitle');
      const flare = document.getElementById('netflix-flare');
      const supernova = document.getElementById('netflix-supernova');

      // Initial CSS states
      logoBox.style.transform = 'scale(0.4) translateZ(-400px)';
      logoBox.style.opacity = '0';
      logoBox.style.transition = 'none';

      // --- TIMELINE STAGES ---

      // Stage 1: (0.15s) Anamorphic horizontal flare streaks across screen
      setTimeout(() => {
        flare.style.transition = 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
        flare.style.opacity = '1';
        flare.style.transform = 'translateY(-50%) scaleX(1)';
      }, 150);

      // Stage 2: (0.45s) Play Audio "TA-DUM" & Zoom in Monogram
      setTimeout(() => {
        this.audio.playTaDum();

        flare.style.opacity = '0.3';
        flare.style.transform = 'translateY(-50%) scaleX(1.8)';

        logoBox.style.transition = 'transform 1.8s cubic-bezier(0.1, 0.85, 0.25, 1), opacity 0.6s ease-out';
        logoBox.style.opacity = '1';
        logoBox.style.transform = 'scale(1) translateZ(0)';
      }, 450);

      // Stage 3: (1.1s) Subtitle reveals with neon glow
      setTimeout(() => {
        subtitle.classList.add('reveal');
      }, 1100);

      // Stage 4: (2.2s) The NETFLIX RIBBON EXPLOSION!
      setTimeout(() => {
        // Logo zooms rapidly forward towards viewer
        logoBox.style.transition = 'transform 1.4s cubic-bezier(0.5, 0, 0.1, 1), opacity 0.8s ease-in';
        logoBox.style.transform = 'scale(3.2) translateZ(600px)';
        logoBox.style.opacity = '0';

        // Trigger Canvas 3D ribbons burst
        this.visuals.triggerExplosion();
      }, 2200);

      // Stage 5: (3.8s) Blinding Supernova bloom transition
      setTimeout(() => {
        supernova.style.opacity = '1';
      }, 3800);

      // Stage 6: (4.4s) Redirect to index.html
      setTimeout(() => {
        this.finish();
      }, 4400);
    }

    finish() {
      if (this.isCompleted) return;
      this.isCompleted = true;

      const supernova = document.getElementById('netflix-supernova');
      if (supernova) supernova.style.opacity = '1';

      if (this.overlay) {
        this.overlay.style.transition = 'opacity 0.6s ease-out';
        this.overlay.style.opacity = '0';
      }

      setTimeout(() => {
        if (this.visuals) this.visuals.stop();
        window.location.href = this.targetUrl || 'index.html';
      }, 500);
    }
  }

  // Expose globally to window
  window.NetflixIntro = new NetflixIntroManager();

})();
