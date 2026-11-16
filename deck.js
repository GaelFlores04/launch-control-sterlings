(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  document.documentElement.classList.add('js');
  const stage = $('#stage'), slides = $$('.slide'), track = $$('#track li');
  const TOTAL = slides.reduce((a, s) => a + +s.dataset.seconds, 0);
  const q = new URLSearchParams(location.search);
  let cur = 0, step = 0, running = false, elapsed = 0, slideElapsed = 0, last = 0;

  const fit = () => stage.style.setProperty('--fit', Math.min(innerWidth / 1920, innerHeight / 1080));
  addEventListener('resize', fit); fit();

  const fmt = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  /* ---------- gameplay sequence (slide 5) ---------- */
  const CUTS = [
    { d: 3.5, split: [['cockpit-start', 'Astronaut'], ['tower-start', 'Mission Control']], cap: 'Two players. One round. Each holds different information.' },
    { d: 4, img: 'cockpit-start', role: 'Astronaut', z: [1, 1.5], o: [26, 58], ring: [26.3, 54.6], calls: [['Antenna light: fixed', 19, 35]], cap: 'The astronaut sees the antenna light and reports it: “It is fixed.”' },
    { d: 4.5, img: 'manual-antenna', role: 'Mission Control', z: [1, 1.1], o: [50, 62], calls: [['Fixed light → select the Moon', 54, 54.5], ['Blinking light → select the Star', 54, 67, 1]], cap: 'Mission Control finds the matching rule in the manual and gives the instruction.' },
    { d: 3, img: 'cockpit-antenna-done', role: 'Astronaut', z: [1.35, 1.5], o: [26, 58], calls: [['Moon confirmed · Ready', 19, 35]], cap: 'The astronaut selects the Moon. The host validates it: antenna ready.' },
    { d: 2.5, img: 'manual-code', role: 'Mission Control', z: [1, 1.1], o: [30, 48], calls: [['Pairs CD / DC · C = 7, D = 9', 40, 43.5]], cap: 'Next module. The astronaut reads two letter pairs. The manual turns them into numbers.' },
    { d: 2.5, img: 'calculator', role: 'Mission Control', z: [1, 1.1], o: [30, 62], calls: [['79 × 97 = 7663', 22, 77.5]], cap: 'Mission Control multiplies them and dictates the code.' },
    { d: 3, img: 'cockpit-code-error', role: 'Astronaut', z: [1.35, 1.5], o: [50, 58], calls: [['7664 is not valid. Still pending.', 37, 34, 1]], cap: 'A wrong entry leaves the module pending. The players correct it and try again.' },
    { d: 2.5, img: 'cockpit-code-done', role: 'Astronaut', z: [1.35, 1.5], o: [50, 58], calls: [['7663 confirmed · Ready', 40, 34]], cap: 'The correct code goes in. Both modules are ready.' },
    { d: 4.5, split: [['cockpit-liftoff', 'Astronaut'], ['tower-liftoff', 'Mission Control']], cap: 'Liftoff. Two roles. One shared mission. Launch Control by sterlings.' },
  ];
  const DUR = CUTS.reduce((a, c) => a + c.d, 0);
  const cutsEl = $('#cuts'), roleEl = $('#role'), capEl = $('#caption'), player = $('#player'), clip = $('#clip');
  const head = $('#tlhead'), tltime = $('#tltime'), tltrack = $('#tltrack');
  let t0 = 0; CUTS.forEach(c => { c.t = t0; t0 += c.d; });
  const pane = (img, c, tag) => {
    const calls = (c.calls || []).map(([txt, x, y, b]) => `<span class="call${b ? ' call-b' : ''}" style="left:${x}%;top:${y}%">${txt}</span>`).join('');
    const ring = c.ring ? `<span class="ring" style="left:${c.ring[0]}%;top:${c.ring[1]}%"></span>` : '';
    return `<div class="pane"><div class="zoom"><img src="media/${img}.png" alt="">${ring}${calls}</div>${tag ? `<span class="pane-tag">${tag}</span>` : ''}</div>`;
  };
  cutsEl.innerHTML = CUTS.map(c => {
    const st = `--dur:${c.d}s;--z0:${c.z ? c.z[0] : 1};--z1:${c.z ? c.z[1] : 1.06};--ox:${c.o ? c.o[0] : 50}%;--oy:${c.o ? c.o[1] : 50}%`;
    return `<div class="cut${c.split ? ' split' : ''}" style="${st}">${c.split ? c.split.map(([i, t]) => pane(i, {}, t)).join('') : pane(c.img, c)}</div>`;
  }).join('');
  const cutEls = $$('.cut', cutsEl);
  CUTS.slice(1).forEach(c => { const b = document.createElement('b'); b.style.left = (c.t / DUR * 100) + '%'; tltrack.appendChild(b); });

  let hasVideo = false, videoFailed = false, seqStart = 0, seqIdx = -1, raf = 0;
  clip.addEventListener('loadedmetadata', () => {
    hasVideo = true;
    $('#tlduration').textContent = fmt(clip.duration);
    $$('.tl-track b').forEach(marker => marker.hidden = true);
  });
  clip.addEventListener('error', () => {
    if (q.has('still')) return;
    hasVideo = false; videoFailed = true; clip.hidden = true;
    $('#tlduration').textContent = fmt(DUR);
    $$('.tl-track b').forEach(marker => marker.hidden = false);
    capEl.hidden = false; roleEl.hidden = false;
    player.classList.remove('playing');
    capEl.textContent = 'Video unavailable. Play the local capture sequence instead.';
  });
  const showCut = i => {
    if (i === seqIdx) return; seqIdx = i;
    cutEls.forEach((e, k) => e.classList.toggle('on', k === i));
    roleEl.textContent = CUTS[i].role || ''; capEl.textContent = CUTS[i].cap;
  };
  const seekSeq = t => {
    let i = 0; CUTS.forEach((c, k) => { if (t >= c.t) i = k; });
    showCut(i);
    head.style.width = Math.min(100, t / DUR * 100) + '%'; tltime.textContent = fmt(Math.min(t, DUR));
  };
  const tickSeq = now => {
    const t = (now - seqStart) / 1000; seekSeq(t);
    if (t >= DUR) { capEl.textContent = 'Two roles. One shared mission.'; roleEl.textContent = ''; return; }
    raf = requestAnimationFrame(tickSeq);
  };
  const playSeq = async () => {
    cancelAnimationFrame(raf);
    player.classList.add('playing');
    if (hasVideo) {
      clip.hidden = false;
      // Native controls provide pause, seeking and replay after the clip ends.
      if (clip.ended) clip.currentTime = 0;
      capEl.hidden = true; roleEl.hidden = true;
      try { await clip.play(); }
      catch { player.classList.remove('playing'); capEl.hidden = false; capEl.textContent = 'Press Play to start the video.'; }
      return;
    }
    seqIdx = -1; cutEls.forEach(e => e.classList.remove('on'));
    seqStart = performance.now(); raf = requestAnimationFrame(tickSeq);
  };
  clip.addEventListener('timeupdate', () => {
    head.style.width = Math.min(100, clip.currentTime / (clip.duration || DUR) * 100) + '%';
    tltime.textContent = fmt(clip.currentTime);
  });
  const togglePlayback = () => {
    if (isAction(slides[cur])) {
      step = 1; applyStep();
      if (hasVideo && !clip.paused) clip.pause(); else playSeq();
    }
  };
  const resetSeq = () => {
    cancelAnimationFrame(raf); player.classList.remove('playing');
    clip.pause(); clip.hidden = true; if (hasVideo) clip.currentTime = 0;
    cutEls.forEach((e, k) => e.classList.toggle('on', k === 0)); seqIdx = 0;
    roleEl.textContent = ''; capEl.hidden = false; roleEl.hidden = false;
    capEl.textContent = videoFailed || clip.error ? 'Video unavailable. Play the local capture sequence instead.' : 'Play the English gameplay video.';
    head.style.width = '0'; tltime.textContent = '0:00';
  };
  $('#play').addEventListener('click', e => { e.stopPropagation(); step = 1; applyStep(); playSeq(); });

  /* ---------- navigation ---------- */
  const isAction = s => s.classList.contains('s-action');
  function applyStep() {
    const s = slides[cur]; s.dataset.step = step;
    $('#previous').disabled = cur === 0 && step === 0;
    $$('[data-at]', s).forEach(e => e.classList.toggle('on', +e.dataset.at <= step));
  }
  const hud = () => {
    track.forEach((li, i) => { li.classList.toggle('done', i < cur); li.classList.toggle('now', i === cur); });
    $('#pending').textContent = `Slide ${cur + 1} of ${slides.length}`;
    track.forEach((li, i) => li.querySelector('button').setAttribute('aria-current', i === cur ? 'step' : 'false'));
    $('#previous').disabled = cur === 0 && step === 0;
  };
  const go = (i, dir = 1, toEnd = false) => {
    if (i < 0 || i >= slides.length) return;
    const old = slides[cur], nu = slides[i];
    if (old !== nu && isAction(old)) resetSeq();
    slides.forEach((slide, k) => { slide.inert = k !== i; slide.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
    stage.classList.toggle('back', dir < 0);
    if (old !== nu) {
      slides.forEach(slide => slide.classList.remove('leaving', 'entering'));
      old.classList.remove('active'); old.classList.add('leaving');
      setTimeout(() => { if (old !== slides[cur]) old.classList.remove('leaving'); }, 460);
      nu.classList.add('active', 'entering');
      setTimeout(() => nu.classList.remove('entering'), 720);
    } else nu.classList.add('active');
    cur = i; step = toEnd && !isAction(nu) ? +nu.dataset.steps : 0; slideElapsed = 0;
    if (isAction(nu)) resetSeq();
    applyStep(); hud();
  };
  const next = () => {
    // The presenter starts the timer explicitly, including the cover's 20 seconds.
    const s = slides[cur];
    if (step < +s.dataset.steps) { step++; applyStep(); if (isAction(s)) playSeq(); }
    else if (cur < slides.length - 1) go(cur + 1, 1);
    else if (isAction(s)) { if (hasVideo) clip.currentTime = 0; playSeq(); }
  };
  const prev = () => {
    const s = slides[cur];
    if (step > 0) { step--; applyStep(); if (isAction(s)) resetSeq(); }
    else go(cur - 1, -1, true);
  };

  /* ---------- mission clock ---------- */
  const clock = $('#clock'), budget = $('#budget'), bar = $('#bar');
  const drawClock = () => {
    const left = TOTAL - elapsed, lim = +slides[cur].dataset.seconds, over = slideElapsed > lim;
    clock.textContent = (left < 0 ? '+' : '') + fmt(Math.abs(left)).padStart(5, '0');
    clock.classList.toggle('over', left < 0); clock.classList.toggle('idle', !running);
    $('#timer-toggle').textContent = running ? 'Pause timer' : 'Start timer';
    $('#timer-toggle').setAttribute('aria-label', running ? 'Pause presentation timer' : 'Start presentation timer');
    budget.textContent = `Slide ${fmt(slideElapsed)} / ${fmt(lim)}`; budget.classList.toggle('over', over);
    bar.style.width = Math.min(100, slideElapsed / lim * 100) + '%'; bar.classList.toggle('over', over);
  };
  setInterval(() => {
    const now = performance.now();
    if (running) { const d = (now - last) / 1000; elapsed += d; slideElapsed += d; }
    last = now; drawClock();
  }, 250);

  /* ---------- input ---------- */
  const keys = $('#keys');
  const toggleTimer = () => { running = !running; last = performance.now(); drawClock(); };
  const fullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { keys.textContent = 'Fullscreen unavailable. Use your browser fullscreen command.'; keys.classList.remove('hide'); }
  };
  const toggleHelp = () => { keys.classList.toggle('hide'); $('#help').setAttribute('aria-expanded', String(!keys.classList.contains('hide'))); };
  $('#previous').addEventListener('click', prev);
  $('#next').addEventListener('click', next);
  $('#timer-toggle').addEventListener('click', toggleTimer);
  $('#fullscreen').addEventListener('click', fullscreen);
  $('#help').addEventListener('click', toggleHelp);
  track.forEach((li,i) => li.querySelector('button').addEventListener('click', () => go(i, i >= cur ? 1 : -1)));
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (e.target.closest('input,textarea,select,video') || (e.target.closest('button,a') && [' ', 'Enter'].includes(e.key))) return;
    const k = e.key;
    if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); prev(); }
    else if (k === 'Home') go(0, -1); else if (k === 'End') go(slides.length - 1, 1);
    else if (/^[1-5]$/.test(k)) go(+k - 1, +k - 1 >= cur ? 1 : -1);
    else if (k === 'f' || k === 'F') fullscreen();
    else if (k === 't' || k === 'T') toggleTimer();
    else if (k === 'r' || k === 'R') { running = false; elapsed = 0; slideElapsed = 0; }
    else if (k === 'p' || k === 'P') togglePlayback();
    else if (k === '?') toggleHelp();
  });
  stage.addEventListener('click', e => { if (e.target.closest('button,a,video,.hud')) return; e.clientX < innerWidth * .2 ? prev() : next(); });
  let tx = 0;
  addEventListener('touchstart', e => { tx = e.target.closest('button,a,video') ? null : e.touches[0].clientX; }, { passive: true });
  addEventListener('touchend', e => { if (tx === null) return; const d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 50) d < 0 ? next() : prev(); }, { passive: true });
  let printSteps = [];
  addEventListener('beforeprint', () => { printSteps = slides.map(s => s.dataset.step); slides.forEach(s => { s.dataset.step = s.dataset.steps; }); });
  addEventListener('afterprint', () => slides.forEach((s,i) => { s.dataset.step = printSteps[i] || '0'; }));

  /* ---------- start (optional ?slide=&step=&t=&still for a fixed state) ---------- */
  if (q.has('still')) document.documentElement.classList.add('still');
  go(Math.min(slides.length, Math.max(1, +q.get('slide') || 1)) - 1);
  if (q.has('step')) { step = q.get('step') === 'all' ? +slides[cur].dataset.steps : Math.max(0, Math.min(+slides[cur].dataset.steps, Number(q.get('step')) || 0)); applyStep(); }
  if (q.has('t') && isAction(slides[cur])) { player.classList.add('playing'); seqIdx = -1; seekSeq(+q.get('t')); }
  if (clip.error && !q.has('still')) clip.dispatchEvent(new Event('error'));
  drawClock();
})();
