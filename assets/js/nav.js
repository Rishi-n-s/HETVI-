/* nav.js — BAKUDI NI STORY · macOS-style Launchpad Navigation
   Self-contained: injects a FIXED floating button that works on every page */
(function () {

  /* ── Detect current page ── */
  const current = location.pathname.split('/').pop() || 'index.html';

  /* ── Pages manifest ── */
  const pages = [
    { href: 'index.html', icon: 'photo_library', label: 'Memories', bg: '#ffb7c5', fill: true },
    { href: 'chat.html', icon: 'chat', label: 'Chat', bg: '#ffb7c5', fill: true },
    { href: 'gallery.html', icon: 'collections', label: 'Gallery', bg: '#ffd9df', fill: true },
    { href: 'timeline.html', icon: 'auto_stories', label: 'Timeline', bg: '#baeaff', fill: true },
    { href: 'letters.html', icon: 'mail', label: 'Letters', bg: '#ffd9df', fill: true },
    { href: 'music.html', icon: 'music_note', label: 'Music', bg: '#9ae1ff', fill: true },
    { href: 'about.html', icon: 'favorite', label: 'Our Story', bg: '#ffb7c5', fill: true },
    { href: 'playful.html', icon: 'celebration', label: 'Playful', bg: '#7be07d', fill: true },
    { href: 'dreams.html', icon: 'star', label: 'Dreams', bg: '#ffd9df', fill: true },
    { href: 'settings.html', icon: 'tune', label: 'Settings', bg: '#e3e2e0', fill: false },
    { href: 'final.html', icon: 'auto_stories', label: 'Finale', bg: '#ffb7c5', fill: true },
  ];

  /* ── Inject Google Fonts & Material Icons if not already loaded ── */
  if (!document.querySelector('link[href*="Material+Symbols"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap';
    document.head.appendChild(l);
  }
  if (!document.querySelector('link[href*="Quicksand"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600&display=swap';
    document.head.appendChild(l);
  }

  /* ── Styles ── */
  const style = document.createElement('style');
  style.textContent = `
    /* ── Floating trigger button ── */
    #es-nav-trigger {
      position: fixed;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9990;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 9px 20px 9px 16px;
      background: rgba(255, 249, 246, 0.72);
      border: 1.5px solid rgba(134, 78, 90, 0.22);
      border-radius: 999px;
      cursor: pointer;
      font-family: 'Quicksand', sans-serif;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.05em;
      color: #864e5a;
      backdrop-filter: blur(16px) saturate(180%);
      -webkit-backdrop-filter: blur(16px) saturate(180%);
      box-shadow: 0 4px 24px rgba(134, 78, 90, 0.12), 0 1px 4px rgba(0,0,0,0.06);
      transition: background 0.22s, transform 0.18s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s;
      user-select: none;
      white-space: nowrap;
    }
    #es-nav-trigger:hover {
      background: rgba(255, 217, 223, 0.85);
      transform: translateX(-50%) scale(1.06);
      box-shadow: 0 8px 32px rgba(134, 78, 90, 0.22), 0 2px 6px rgba(0,0,0,0.08);
    }
    #es-nav-trigger:active {
      transform: translateX(-50%) scale(0.97);
    }
    /* macOS traffic-light dots */
    .es-dots {
      display: flex; gap: 5px; align-items: center;
    }
    .es-dot {
      width: 8px; height: 8px; border-radius: 50%;
      transition: transform 0.2s;
    }
    #es-nav-trigger:hover .es-dot { transform: scale(1.2); }
    .es-dot-r { background: #ff6b6b; }
    .es-dot-y { background: #ffd166; }
    .es-dot-g { background: #06d6a0; }
    .es-nav-label-text {
      display: flex; align-items: center; gap: 5px;
    }
    #es-nav-trigger .material-symbols-outlined {
      font-size: 16px;
      font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20;
      transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
    }
    #es-nav-trigger:hover .material-symbols-outlined {
      transform: rotate(15deg);
    }

    /* ── Overlay ── */
    #es-launchpad {
      position: fixed; inset: 0; z-index: 9995;
      background: rgba(18, 8, 14, 0.60);
      backdrop-filter: blur(28px) saturate(160%);
      -webkit-backdrop-filter: blur(28px) saturate(160%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.28s cubic-bezier(0.4, 0, 0.2, 1);
    }
    #es-launchpad.open {
      opacity: 1;
      pointer-events: all;
    }

    /* ── Launchpad title ── */
    #es-launchpad-title {
      font-family: 'Quicksand', sans-serif;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.14em;
      color: rgba(255,255,255,0.4);
      text-transform: uppercase;
      margin-bottom: -4px;
    }

    /* ── App grid ── */
    #es-launchpad-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 20px 16px;
      padding: 36px 44px;
      background: rgba(255, 249, 246, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 28px;
      box-shadow: 0 32px 80px rgba(0,0,0,0.45);
      transform: scale(0.86) translateY(24px);
      transition: transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1);
      max-width: 600px;
      width: 90vw;
    }
    #es-launchpad.open #es-launchpad-grid {
      transform: scale(1) translateY(0);
    }

    /* ── App icon ── */
    .es-app {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      cursor: pointer;
      transform: scale(1);
      transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .es-app:hover { transform: scale(1.16) translateY(-4px); }
    .es-app:active { transform: scale(0.94); }

    .es-app-icon-wrap {
      width: 68px; height: 68px;
      border-radius: 17px;
      display: flex; align-items: center; justify-content: center;
      position: relative;
      box-shadow:
        0 8px 20px rgba(0,0,0,0.28),
        inset 0 1.5px 0 rgba(255,255,255,0.35),
        inset 0 -1px 0 rgba(0,0,0,0.12);
      transition: box-shadow 0.22s;
    }
    .es-app:hover .es-app-icon-wrap {
      box-shadow:
        0 16px 36px rgba(0,0,0,0.38),
        inset 0 1.5px 0 rgba(255,255,255,0.45),
        inset 0 -1px 0 rgba(0,0,0,0.12);
    }
    /* Gloss overlay */
    .es-app-icon-wrap::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 17px;
      background: linear-gradient(150deg, rgba(255,255,255,0.32) 0%, transparent 55%);
      pointer-events: none;
    }
    .es-app-icon-wrap .material-symbols-outlined {
      font-size: 32px;
      color: rgba(60, 20, 32, 0.8);
      position: relative; z-index: 1;
    }

    .es-app-label {
      font-family: 'Quicksand', sans-serif;
      font-size: 11px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.82);
      letter-spacing: 0.03em;
      text-align: center;
      max-width: 68px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Current page indicator dot */
    .es-app.es-current .es-app-label::before {
      content: '•';
      color: #fbb3c1;
      margin-right: 3px;
    }
    .es-app.es-current .es-app-icon-wrap {
      outline: 2.5px solid rgba(251, 179, 193, 0.7);
      outline-offset: 3px;
    }

    /* ── Close hint ── */
    #es-close-hint {
      font-family: 'Quicksand', sans-serif;
      font-size: 12px;
      letter-spacing: 0.05em;
      color: rgba(255,255,255,0.28);
    }

    /* ── Responsive ── */
    @media (max-width: 768px) {
      #es-launchpad-grid {
        grid-template-columns: repeat(4, 1fr);
        gap: 18px 14px;
        padding: 30px 28px;
        max-width: 520px;
      }
    }
    @media (max-width: 480px) {
      #es-nav-trigger { font-size: 12px; padding: 7px 14px 7px 12px; top: 12px; }
      #es-launchpad {
        padding: 40px 12px;
        overflow-y: auto;
      }
      #es-launchpad-grid {
        grid-template-columns: repeat(3, 1fr);
        gap: 14px 10px;
        padding: 24px 16px;
        max-height: 80vh;
        overflow-y: auto;
      }
      .es-app-icon-wrap { width: 56px; height: 56px; border-radius: 14px; }
      .es-app-icon-wrap .material-symbols-outlined { font-size: 26px; }
      .es-app-label { font-size: 10.5px; max-width: 58px; }
    }
    @media (max-height: 520px) {
      #es-launchpad { padding: 12px; }
      #es-launchpad-grid {
        grid-template-columns: repeat(6, 1fr);
        gap: 10px 8px;
        padding: 16px;
        max-height: 90vh;
      }
      .es-app-icon-wrap { width: 44px; height: 44px; border-radius: 10px; }
      .es-app-icon-wrap .material-symbols-outlined { font-size: 20px; }
      .es-app-label { font-size: 9.5px; }
    }
  `;
  document.head.appendChild(style);

  /* ── Build the fixed trigger button ── */
  function buildTrigger() {
    const btn = document.createElement('button');
    btn.id = 'es-nav-trigger';
    btn.setAttribute('aria-label', 'Open page navigator');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.innerHTML = `
      <span class="es-dots">
        <span class="es-dot es-dot-r"></span>
        <span class="es-dot es-dot-y"></span>
        <span class="es-dot es-dot-g"></span>
      </span>
      <span class="es-nav-label-text">
        <span>Pages</span>
        <span class="material-symbols-outlined">grid_view</span>
      </span>
    `;
    btn.addEventListener('click', openNav);
    return btn;
  }

  /* ── Build the launchpad overlay ── */
  function buildLaunchpad() {
    const overlay = document.createElement('div');
    overlay.id = 'es-launchpad';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Page Navigator');

    /* Title */
    const title = document.createElement('p');
    title.id = 'es-launchpad-title';
    title.textContent = 'BAKUDI NI STORY';
    overlay.appendChild(title);

    /* Grid */
    const grid = document.createElement('div');
    grid.id = 'es-launchpad-grid';

    pages.forEach(p => {
      const a = document.createElement('a');
      a.href = p.href;
      a.className = 'es-app' + (current === p.href ? ' es-current' : '');
      a.setAttribute('title', p.label);
      const fillVal = p.fill ? 1 : 0;
      a.innerHTML = `
        <div class="es-app-icon-wrap" style="background: ${p.bg};">
          <span class="material-symbols-outlined"
            style="font-variation-settings:'FILL' ${fillVal},'wght' 400,'GRAD' 0,'opsz' 24;">
            ${p.icon}
          </span>
        </div>
        <span class="es-app-label">${p.label}</span>
      `;
      a.addEventListener('click', (e) => {
        if (p.href === current) { e.preventDefault(); closeNav(); }
        else closeNav();
      });
      grid.appendChild(a);
    });

    overlay.appendChild(grid);

    /* Close hint */
    const hint = document.createElement('p');
    hint.id = 'es-close-hint';
    hint.innerHTML = 'Press <kbd style="background:rgba(255,255,255,0.1);padding:1px 6px;border-radius:4px;font-size:11px">Esc</kbd> or click outside to close';
    overlay.appendChild(hint);

    /* Backdrop click to close */
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeNav(); });

    return overlay;
  }

  /* ── Open / Close ── */
  function openNav() {
    document.getElementById('es-launchpad').classList.add('open');
    document.getElementById('es-nav-trigger').setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }
  function closeNav() {
    document.getElementById('es-launchpad').classList.remove('open');
    const t = document.getElementById('es-nav-trigger');
    if (t) t.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  /* Esc key */
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });

  /* ── Init ── */
  function init() {
    /* Remove any old launchpad/trigger from a previous load */
    document.getElementById('es-launchpad')?.remove();
    document.getElementById('es-nav-trigger')?.remove();

    document.body.appendChild(buildLaunchpad());
    document.body.appendChild(buildTrigger());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
