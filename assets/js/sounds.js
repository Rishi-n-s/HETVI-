/* sounds.js — Eternal Scrapbook UI Sound Effects */
(function() {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  function playSound(type) {
    if (localStorage.getItem('ambientSound') === 'false') return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'hover') {
      // Soft short tick
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.05);
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.05);
    } else if (type === 'click') {
      // Gentle warm pop
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.1);
    }
  }

  function attachSounds() {
    // Add sounds to all interactive elements
    const interactables = document.querySelectorAll('a, button, .cursor-pointer, .group');
    
    interactables.forEach(el => {
      // Avoid re-attaching if already attached
      if (el.dataset.soundsAttached) return;
      el.dataset.soundsAttached = 'true';
      
      el.addEventListener('mouseenter', () => playSound('hover'));
      el.addEventListener('mousedown', () => playSound('click'));
    });
  }

  // Run on load and after short delay (in case dynamic elements load)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachSounds);
  } else {
    attachSounds();
  }
  
  // Also observe for new elements (like the nav popup)
  const observer = new MutationObserver((mutations) => {
    attachSounds();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
