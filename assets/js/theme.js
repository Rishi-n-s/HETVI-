(function () {
  // --- PWA Service Worker Registration ---
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }

  // --- Love Lock Security ---
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  if (currentPath !== 'lock.html' && currentPath !== 'rejected.html') {
    if (sessionStorage.getItem('unlocked') !== 'true') {
      window.location.href = 'lock.html';
      return;
    }
  }
  const theme = localStorage.getItem('themeColor') || 'rose';
  const isDark = localStorage.getItem('darkMode') === 'true';

  // Apply dark class to HTML for any dark: utility classes
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  const palettes = {
    'rose': { primary: "#d12450", "primary-container": "#ffb7c5", "on-primary-container": "#7b4551", secondary: "#0c6780", "secondary-container": "#9ae1ff", tertiary: "#006e20", "tertiary-container": "#7be07d" },
    'ocean': { primary: "#0c6780", "primary-container": "#9ae1ff", "on-primary-container": "#09657f", secondary: "#d12450", "secondary-container": "#ffb7c5", tertiary: "#7a5a28", "tertiary-container": "#ffdea3" },
    'lavender': { primary: "#5e4a8a", "primary-container": "#e0d4ff", "on-primary-container": "#422b6e", secondary: "#7a5a28", "secondary-container": "#ffdea3", tertiary: "#0c6780", "tertiary-container": "#9ae1ff" },
    'amber': { primary: "#7a5a28", "primary-container": "#ffdea3", "on-primary-container": "#5a3f0f", secondary: "#5e4a8a", "secondary-container": "#e0d4ff", tertiary: "#d12450", "tertiary-container": "#ffb7c5" }
  };

  let colors = palettes[theme];
  if (!colors) {
    // Treat as custom hex color
    colors = {
      primary: theme,
      "primary-container": theme + '40', // 25% opacity roughly
      "on-primary-container": theme,
      secondary: theme,
      "secondary-container": theme + '40',
      tertiary: theme,
      "tertiary-container": theme + '40'
    };
  }

  // Smart dark mode by replacing base surface colors
  const baseColors = isDark ? {
    "background": "#121212",
    "on-background": "#e3e2e0",
    "surface": "#121212",
    "on-surface": "#e3e2e0",
    "surface-variant": "#444444",
    "on-surface-variant": "#cccccc",
    "surface-container-lowest": "#000000",
    "surface-container-low": "#111111",
    "surface-container": "#1e1e1e",
    "surface-container-high": "#2c2c2c",
    "surface-container-highest": "#333333"
  } : {
    "background": "#faf9f6",
    "on-background": "#1a1c1a",
    "surface": "#faf9f6",
    "on-surface": "#1a1c1a",
    "surface-variant": "#e3e2e0",
    "on-surface-variant": "#2a1e20",
    "surface-container-lowest": "#ffffff",
    "surface-container-low": "#f4f3f1",
    "surface-container": "#efeeeb",
    "surface-container-high": "#e9e8e5",
    "surface-container-highest": "#e3e2e0"
  };

  window.tailwind = window.tailwind || {};
  window.tailwind.config = {
    darkMode: "class",
    theme: {
      extend: {
        colors: {
          "primary": colors.primary,
          "on-primary": "#ffffff",
          "primary-container": colors["primary-container"],
          "on-primary-container": colors["on-primary-container"],
          "secondary": colors.secondary,
          "on-secondary": "#ffffff",
          "secondary-container": colors["secondary-container"],
          "on-secondary-container": "#000000",
          "tertiary": colors.tertiary,
          "on-tertiary": "#ffffff",
          "tertiary-container": colors["tertiary-container"],
          "on-tertiary-container": "#000000",
          ...baseColors
        },
        fontFamily: {
          "subtitle-serif": ["Playfair Display"],
          "body-main": ["Quicksand"],
          "headline-lg": ["Bricolage Grotesque"],
          "headline-xl": ["Bricolage Grotesque"],
          "label-caps": ["Playfair Display"],
          "body-small": ["Quicksand"],
          "handwritten": ["Caveat", "cursive"]
        }
      }
    }
  };

  // Handle Paper Texture and Background Music
  document.addEventListener('DOMContentLoaded', () => {
    // Texture
    if (localStorage.getItem('paperTexture') === 'false') {
      const style = document.createElement('style');
      style.innerHTML = '.paper-texture { background-image: none !important; }';
      document.head.appendChild(style);
    }

    // Background Music
    const bgAudio = document.createElement('audio');
    bgAudio.id = 'global-bg-audio';
    bgAudio.src = 'assets/music/Bairan - Banjaare.mp3';
    bgAudio.loop = true;
    bgAudio.volume = 1.0;
    document.body.appendChild(bgAudio);

    // Restore timestamp from session
    const savedTime = sessionStorage.getItem('bgMusicTime');
    if (savedTime) {
      bgAudio.currentTime = parseFloat(savedTime);
    }

    // Sync timestamp to session
    setInterval(() => {
      if (!bgAudio.paused) {
        sessionStorage.setItem('bgMusicTime', bgAudio.currentTime);
      }
    }, 500);

    const startAudio = () => {
      if (window.isLocalMusicPlaying) return;
      if (sessionStorage.getItem('musicUserPaused') === 'true') return;

      const currentPath = window.location.pathname.split('/').pop() || 'index.html';
      const hasStartedBefore = sessionStorage.getItem('musicStarted') === 'true';

      // Only start if we are on index.html, OR if it has already been started in a previous page
      if (currentPath === 'index.html' || hasStartedBefore || currentPath === '') {
        bgAudio.play().then(() => {
          sessionStorage.setItem('musicStarted', 'true');
        }).catch(() => { });
      }
    };

    // Aggressively attempt autoplay
    startAudio();

    // Play on ANY user interaction, ALWAYS (if not paused by user)
    document.addEventListener('click', startAudio);
    document.addEventListener('keydown', startAudio);
    document.addEventListener('touchstart', startAudio);
    document.addEventListener('scroll', startAudio, { once: true });

    // Music Control Button
    let musicBtn = document.getElementById('global-music-btn');
    if (!musicBtn) {
      musicBtn = document.createElement('button');
      musicBtn.id = 'global-music-btn';
      musicBtn.setAttribute('type', 'button');
      musicBtn.setAttribute('title', 'Toggle Music');
      musicBtn.setAttribute('aria-label', 'Toggle background music');
      musicBtn.innerHTML = '🎵';
      document.body.appendChild(musicBtn);
    }

    const updateMusicIcon = () => {
      if (bgAudio.paused) {
        musicBtn.innerHTML = '🔇';
        musicBtn.classList.add('is-muted');
      } else {
        musicBtn.innerHTML = '🎵';
        musicBtn.classList.remove('is-muted');
      }
    };

    bgAudio.addEventListener('play', updateMusicIcon);
    bgAudio.addEventListener('pause', updateMusicIcon);
    // initial set
    setTimeout(updateMusicIcon, 100);

    musicBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // prevent document click from triggering autoplay
      if (bgAudio.paused) {
        sessionStorage.setItem('musicUserPaused', 'false');
        startAudio();
      } else {
        sessionStorage.setItem('musicUserPaused', 'true');
        bgAudio.pause();
      }
    });
  });

  // Global Animation Engine
  document.addEventListener('DOMContentLoaded', () => {
    // 1. Inject Global CSS
    const animStyle = document.createElement('style');
    animStyle.textContent = `
      .es-global-animate {
        opacity: 0;
        transform: translateY(24px);
        transition: opacity 0.85s cubic-bezier(0.16, 1, 0.3, 1), transform 0.85s cubic-bezier(0.16, 1, 0.3, 1) !important;
        will-change: opacity, transform;
      }
      .es-animate-active {
        opacity: 1 !important;
        transform: translateY(0) !important;
      }
      
      /* Global Hover Enhancements for Cards & Buttons */
      .es-hover-enhance {
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease-out !important;
      }
      .es-hover-enhance:hover {
        transform: translateY(-6px) scale(1.02) !important;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.12) !important;
        z-index: 50;
      }
    `;
    document.head.appendChild(animStyle);

    // 2. Intersection Observer setup
    const observerOptions = {
      root: null,
      rootMargin: '0px 0px -50px 0px',
      threshold: 0.1
    };
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('es-animate-active');
          obs.unobserve(entry.target); // Only animate once
        }
      });
    }, observerOptions);

    // 3. Select elements to animate across the site
    // We target headings, paragraphs, buttons, links, images, and card containers
    const elementsToAnimate = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, img, video:not(#intro-video), form, .bg-white\\/20, .polaroid-hover');

    elementsToAnimate.forEach((el, i) => {
      // Exclude elements that shouldn't animate (like nav buttons, overlays)
      if (el.closest('#es-nav-trigger') || el.closest('#es-launchpad') || el.closest('#enter-overlay')) return;

      el.classList.add('es-global-animate');
      // Stagger delays slightly for sibling elements
      el.style.transitionDelay = `${(i % 5) * 0.1}s`;
      observer.observe(el);
    });

    // 4. Enhance buttons and interactive elements with hover physics
    const interactiveElements = document.querySelectorAll('a, button, .rounded-3xl, .rounded-2xl');
    interactiveElements.forEach(el => {
      // Don't enhance the nav trigger, overlay children, or custom color pickers to prevent breaking them
      if (el.closest('#es-nav-trigger') || el.closest('#es-launchpad') || el.classList.contains('item-color')) return;
      el.classList.add('es-hover-enhance');
    });
  });

})();
