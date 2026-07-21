/* sounds.js — BAKUDI NI STORY UI Sound Effects */
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
    // Add hover sounds to all interactive elements
    const interactables = document.querySelectorAll('a, button, .cursor-pointer, .group');
    
    interactables.forEach(el => {
      // Avoid re-attaching if already attached
      if (el.dataset.soundsAttached) return;
      el.dataset.soundsAttached = 'true';
      
      el.addEventListener('mouseenter', () => playSound('hover'));
    });
  }

  // Add click sound and visual effect for every click anywhere on the site
  document.addEventListener('mousedown', (e) => {
    // Play sweet "I love you" voice
    if (window.speechSynthesis) {
      if (!window.speechSynthesis.speaking) {
        const utterance = new SpeechSynthesisUtterance("I love you");
        utterance.pitch = 1.4; // sweet higher pitch
        utterance.rate = 0.85; // soft and slow
        utterance.volume = 0.8;
        const voices = window.speechSynthesis.getVoices();
        const sweetVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Zira') || v.name.includes('Google UK English Female'));
        if (sweetVoice) utterance.voice = sweetVoice;
        window.speechSynthesis.speak(utterance);
      }
    }

    // Create R❤H popup effect
    const popup = document.createElement('div');
    popup.innerHTML = 'R<span style="color: #ff2d55;">❤</span>H';
    popup.style.position = 'fixed';
    popup.style.left = `${e.clientX}px`;
    popup.style.top = `${e.clientY}px`;
    popup.style.transform = 'translate(-50%, -50%) scale(0.5)';
    popup.style.color = 'var(--primary, #d6336c)';
    popup.style.fontWeight = 'normal';
    popup.style.fontFamily = "'Great Vibes', cursive";
    popup.style.fontSize = '0.9rem';
    popup.style.pointerEvents = 'none';
    popup.style.zIndex = '9999';
    popup.style.opacity = '1';
    popup.style.transition = 'transform 0.8s cubic-bezier(0.2, 1, 0.3, 1), opacity 0.8s ease-out';
    popup.style.textShadow = '0 2px 10px rgba(0, 0, 0, 0.15)';
    
    document.body.appendChild(popup);
    
    // Force reflow for animation
    popup.getBoundingClientRect();
    
    // Animate up and fade out
    popup.style.transform = 'translate(-50%, -150%) scale(1.2)';
    popup.style.opacity = '0';
    
    // Remove from DOM after animation completes
    setTimeout(() => {
      popup.remove();
    }, 800);
  });

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
