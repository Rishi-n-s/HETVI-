(function () {
  'use strict';

  // --- Warm Cinematic Audio Synth ---
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

    playClimaxChord() {
      this.init();
      if (!this.ctx) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;

      // Master Gain
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.85, now);
      master.connect(ctx.destination);

      // Reverb / Warm Delay Space
      const delay = ctx.createDelay();
      delay.delayTime.setValueAtTime(0.16, now);
      const delayGain = ctx.createGain();
      delayGain.gain.setValueAtTime(0.28, now);
      delay.connect(delayGain);
      delayGain.connect(delay);
      delayGain.connect(master);

      // Deep Warm Bass Resonance
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'triangle';
      sub.frequency.setValueAtTime(108, now);
      sub.frequency.exponentialRampToValueAtTime(32, now + 2.0);

      subGain.gain.setValueAtTime(0.01, now);
      subGain.gain.linearRampToValueAtTime(0.9, now + 0.05);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 2.2);

      sub.connect(subGain);
      subGain.connect(master);
      sub.start(now);
      sub.stop(now + 2.2);

      // Majestic Romantic Chord Harmony Swell
      const chordFreqs = [146.83, 220.0, 293.66, 349.23, 440.0, 587.33];
      chordFreqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();

        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(950 + idx * 120, now);

        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.12 / (idx + 1), now + 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);

        osc.connect(filter);
        filter.connect(g);
        g.connect(master);
        g.connect(delay);

        osc.start(now);
        osc.stop(now + 2.8);
      });
    }
  }

  // --- Main Intro Orchestrator ---
  class NetflixIntroManager {
    constructor() {
      this.audio = new NetflixAudioEngine();
      this.overlay = null;
      this.isCompleted = false;
      this.targetUrl = 'index.html';
    }

    buildUI() {
      if (document.getElementById('netflix-intro-overlay')) {
        document.getElementById('netflix-intro-overlay').remove();
      }

      const overlay = document.createElement('div');
      overlay.id = 'netflix-intro-overlay';
      overlay.innerHTML = `
        <div class="netflix-vignette"></div>
        
        <button class="netflix-skip-btn" id="netflix-skip-btn" title="Skip Intro">
          Skip <span>⏭</span>
        </button>

        <div class="netflix-anamorphic-flare"></div>

        <div class="netflix-logo-container" id="netflix-logo-box">
          <div class="netflix-monogram">
            <div class="netflix-letter" data-letter="H">H</div>
            <div class="netflix-heart-wrap">
              <svg class="netflix-heart-svg" viewBox="0 0 24 24" fill="#ff1744">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </div>
            <div class="netflix-letter" data-letter="R">R</div>
          </div>
          <div class="netflix-subtitle">
            A <span>BAKUDI & RISHI</span> ORIGINAL
          </div>
        </div>

        <div class="netflix-supernova" id="netflix-supernova"></div>
      `;

      document.body.appendChild(overlay);
      this.overlay = overlay;

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
      this.isCompleted = false;
      this.buildUI();
      sessionStorage.setItem('unlocked', 'true');

      // 1. Activate Fullscreen Overlay
      this.overlay.classList.add('active');

      // 2. Play warm audio chord
      setTimeout(() => {
        this.audio.playClimaxChord();
      }, 150);

      // 3. Supernova bloom at 2.4s
      setTimeout(() => {
        const supernova = document.getElementById('netflix-supernova');
        if (supernova) supernova.style.opacity = '1';
      }, 2400);

      // 4. Smooth Cross-Dissolve to target page at 2.8s
      setTimeout(() => {
        this.finish();
      }, 2800);
    }

    finish() {
      if (this.isCompleted) return;
      this.isCompleted = true;

      const supernova = document.getElementById('netflix-supernova');
      if (supernova) supernova.style.opacity = '1';

      if (this.overlay) {
        this.overlay.style.transition = 'opacity 0.4s ease-out';
        this.overlay.style.opacity = '0';
      }

      setTimeout(() => {
        window.location.href = this.targetUrl || 'index.html';
      }, 300);
    }
  }

  // Expose globally
  window.NetflixIntro = new NetflixIntroManager();

})();
