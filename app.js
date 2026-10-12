(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const WORDS = window.WORDS;
  const PIPS = { 1:[4], 2:[0,8], 3:[0,4,8], 4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8] };
  const HISTORY_KEY = 'mtt.history', PREF_KEY = 'mtt.prefs';

  const state = { words: [], locked: new Set(), busy: false, history: [], bip: null, prefs: { count: 12, sound: true, nums: true, mode: 'random' } };

  /* ---------- storage ---------- */
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  state.history = load(HISTORY_KEY, []);
  Object.assign(state.prefs, load(PREF_KEY, {}));

  /* ---------- secure random ---------- */
  function randInt(n) {
    const lim = Math.floor(4294967296 / n) * n, b = new Uint32Array(1);
    do { crypto.getRandomValues(b); } while (b[0] >= lim);
    return b[0] % n;
  }
  function pickUnique(k, exclude) {
    const pool = WORDS.filter((w) => !exclude.has(w));
    for (let i = 0; i < k; i++) {            // partial Fisher-Yates
      const j = i + randInt(pool.length - i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, k);
  }

  /* ---------- dice DOM ---------- */
  function buildDie(el) {
    el.innerHTML = [1,2,3,4,5,6].map((n) =>
      `<div class="face f${n}">${Array.from({length:9},(_, i)=>`<i class="${PIPS[n].includes(i)?'on':''}"></i>`).join('')}</div>`
    ).join('');
  }
  buildDie($('homeDie')); buildDie($('bigDie'));

  /* ---------- screens ---------- */
  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
    window.scrollTo(0, 0);
  }
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1800);
  }

  /* ---------- sound (WebAudio, no assets) ---------- */
  let ac;
  const audio = () => (ac ||= new (window.AudioContext || window.webkitAudioContext)());
  function tone(freq, t0, dur, type = 'sine', vol = .15) {
    const a = audio(), o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, a.currentTime + t0);
    g.gain.exponentialRampToValueAtTime(.001, a.currentTime + t0 + dur);
    o.connect(g).connect(a.destination); o.start(a.currentTime + t0); o.stop(a.currentTime + t0 + dur);
  }
  function sfx(kind) {
    if (!state.prefs.sound) return;
    try {
      if (kind === 'dice') for (let i = 0; i < 9; i++) tone(120 + Math.random()*180, i*.18, .06, 'square', .06);
      if (kind === 'coin') for (let i = 0; i < 14; i++) { const b = 1800 + Math.random()*900; tone(b, i*.15, .25, 'triangle', .07); tone(b*1.5, i*.15+.04, .2, 'sine', .04); }
      if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(f, i*.12, .4, 'triangle', .14));
      if (kind === 'tick') tone(900, 0, .08, 'triangle', .08);
    } catch {}
  }

  /* ---------- coin rain ---------- */
  const cv = $('fx'), cx = cv.getContext('2d');
  let parts = [], raf = 0, rainEnd = 0;
  function resize() { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; }
  addEventListener('resize', resize); resize();

  function spawn() {
    const env = Math.random() < .18;
    parts.push({
      env, x: Math.random() * innerWidth, y: -40, vy: 1.4 + Math.random() * 2.2,
      r: env ? 16 : 11 + Math.random() * 9, ph: Math.random() * 6.28, fr: .8 + Math.random() * 1.6,
      amp: 25 + Math.random() * 45, sp: .05 + Math.random() * .08, a: Math.random() * 6.28, rot: (Math.random() - .5) * .04,
    });
  }
  function drawCoin(p) {
    const sx = Math.cos(p.a);
    cx.save(); cx.translate(p.sx, p.y); cx.scale(sx, 1); cx.rotate(Math.sin(p.ph) * .5);
    if (p.env) {
      cx.fillStyle = '#d4162e'; cx.strokeStyle = '#f5b81c'; cx.lineWidth = 2;
      cx.beginPath(); cx.roundRect(-p.r*.7, -p.r, p.r*1.4, p.r*2, 3); cx.fill(); cx.stroke();
      cx.fillStyle = '#f5b81c'; cx.beginPath(); cx.arc(0, -p.r*.1, p.r*.3, 0, 6.28); cx.fill();
    } else {
      const g = cx.createRadialGradient(-p.r*.3, -p.r*.3, 1, 0, 0, p.r);
      g.addColorStop(0, '#fff3a8'); g.addColorStop(.6, '#f5b81c'); g.addColorStop(1, '#b8780a');
      cx.fillStyle = g; cx.strokeStyle = '#8a5a00'; cx.lineWidth = 1.5;
      cx.beginPath(); cx.arc(0, 0, p.r, 0, 6.28); cx.fill(); cx.stroke();
      cx.fillStyle = '#8a5a00'; cx.fillRect(-p.r*.28, -p.r*.28, p.r*.56, p.r*.56);
      cx.fillStyle = '#b8780a'; cx.fillRect(-p.r*.18, -p.r*.18, p.r*.36, p.r*.36);
    }
    cx.restore();
  }
  function rainLoop(now) {
    cx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    cx.clearRect(0, 0, innerWidth, innerHeight);
    if (now < rainEnd) for (let i = 0; i < 3; i++) spawn();
    parts = parts.filter((p) => p.y < innerHeight + 50);
    for (const p of parts) {
      p.y += p.vy; p.ph += p.sp; p.a += p.rot + .06;
      p.sx = p.x + Math.sin(p.ph * p.fr) * p.amp;
      drawCoin(p);
    }
    raf = parts.length || now < rainEnd ? requestAnimationFrame(rainLoop) : 0;
  }
  function startRain(ms) { rainEnd = performance.now() + ms; if (!raf) raf = requestAnimationFrame(rainLoop); }
  function stopRain() { rainEnd = 0; parts = []; cancelAnimationFrame(raf); raf = 0; cx.clearRect(0, 0, cv.width, cv.height); }

  /* ---------- roll flow ---------- */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let skip = null;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function roll() {
    if (state.busy) return;
    state.busy = true;
    try { audio().resume(); } catch {}
    const bipMode = state.prefs.mode === 'bip';
    let next, bip = null;
    if (bipMode) {
      try { bip = await Bip39.generate(WORDS); }
      catch (e) { toast(e.message); state.busy = false; return; }
      next = bip.words; state.locked = new Set();
    } else {
      const n = state.prefs.count;
      // keep locked words (only those still within range)
      const keep = new Map([...state.locked].filter((i) => i < n && state.words[i]).map((i) => [i, state.words[i]]));
      const fresh = pickUnique(n - keep.size, new Set(keep.values()));
      next = []; let f = 0;
      for (let i = 0; i < n; i++) next.push(keep.has(i) ? keep.get(i) : fresh[f++]);
      state.locked = new Set(keep.keys());
    }

    if (!reduced) {
      show('rolling');
      const big = $('bigDie'); big.style.animation = 'none'; void big.offsetWidth; big.style.animation = '';
      const sh = document.querySelector('.stage .shadow'); sh.style.animation = 'none'; void sh.offsetWidth; sh.style.animation = '';
      sfx('dice'); await sleep(2100);

      show('coins'); startRain(2600); sfx('coin');
      await Promise.race([sleep(3000), new Promise((r) => (skip = r))]);
      skip = null; stopRain();
    }
    state.words = next; state.bip = bip;
    render(true); sfx('win');
    if (!bipMode) pushHistory(next);   // never persist seed-phrase results
    show('result');
    state.busy = false;
  }

  /* ---------- result ---------- */
  function render(animate) {
    const g = $('grid');
    g.classList.toggle('numoff', !state.prefs.nums);
    const isBip = !!state.bip;
    g.classList.toggle('bipmode', isBip);
    $('bip').hidden = !isBip;
    $('hint').hidden = isBip;
    $('btnReroll').textContent = isBip ? '🎲 Sinh mnemonic mới' : '🎲 Gieo lại (giữ từ đã khóa)';
    if (isBip) {
      $('bipEntropy').textContent = state.bip.entropyHex;
      $('bipChecksum').textContent = state.bip.checksumBits;
      $('bipIdx').textContent = state.bip.indices.join(' ');
    }
    g.innerHTML = '';
    state.words.forEach((w, i) => {
      const li = document.createElement('li');
      li.className = 'card' + (state.locked.has(i) ? ' locked' : '');
      if (animate) li.style.animationDelay = i * 60 + 'ms'; else li.style.animation = 'none';
      li.innerHTML = `<span class="no">${i + 1}</span><span class="w"></span>
        <span class="ctl"><button class="lock" title="Khóa / mở khóa" aria-label="Khóa từ ${i + 1}">${state.locked.has(i) ? '🔒' : '🔓'}</button>
        <button class="re" title="Đổi từ này" aria-label="Đổi từ ${i + 1}">↻</button></span>`;
      li.querySelector('.w').textContent = w;
      li.querySelector('.lock').onclick = () => { state.locked.has(i) ? state.locked.delete(i) : state.locked.add(i); sfx('tick'); render(false); };
      li.querySelector('.re').onclick = () => {
        state.words[i] = pickUnique(1, new Set(state.words))[0];
        sfx('tick'); render(false);
        const c = $('grid').children[i]; c.classList.add('rerolling');
        saveCurrentToHistory();
      };
      g.appendChild(li);
    });
  }

  /* ---------- history ---------- */
  function pushHistory(words) {
    state.history.unshift({ t: Date.now(), words: [...words] });
    state.history = state.history.slice(0, 30); save(HISTORY_KEY, state.history); renderHistory();
  }
  function saveCurrentToHistory() {   // single-word reroll updates the latest entry
    if (state.history[0]) { state.history[0].words = [...state.words]; save(HISTORY_KEY, state.history); renderHistory(); }
  }
  function renderHistory() {
    const ul = $('historyList');
    if (!state.history.length) { ul.innerHTML = '<li class="empty">Chưa có lần gieo nào.</li>'; return; }
    ul.innerHTML = '';
    state.history.forEach((h) => {
      const li = document.createElement('li');
      const tm = document.createElement('time'); tm.textContent = new Date(h.t).toLocaleString('vi-VN');
      const p = document.createElement('div'); p.textContent = h.words.join(' · ');
      li.append(tm, p);
      li.title = 'Bấm để xem lại';
      li.onclick = () => { state.words = [...h.words]; state.bip = null; state.locked = new Set(); render(false); toggleDrawer(false); show('result'); };
      ul.appendChild(li);
    });
  }
  function toggleDrawer(open) {
    $('drawer').classList.toggle('open', open); $('scrim').classList.toggle('show', open);
    $('drawer').setAttribute('aria-hidden', String(!open));
  }

  /* ---------- export ---------- */
  const asText = () => state.words.join(' ');
  async function copy() {
    try { await navigator.clipboard.writeText(asText()); toast('Đã sao chép! 🧧'); }
    catch { const t = document.createElement('textarea'); t.value = asText(); document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); toast('Đã sao chép! 🧧'); }
  }
  function download() {
    const body = state.words.map((w, i) => `${i + 1}. ${w}`).join('\n') + '\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/plain' })); a.download = 'tu-may-man.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- wire up ---------- */
  function syncPrefs() {
    const bip = state.prefs.mode === 'bip';
    $('modeRandom').classList.toggle('active', !bip); $('modeBip').classList.toggle('active', bip);
    $('modeRandom').setAttribute('aria-selected', String(!bip)); $('modeBip').setAttribute('aria-selected', String(bip));
    $('selCount').disabled = bip;
    $('tagline').innerHTML = bip
      ? 'Sinh cụm <b>12 từ BIP-39</b> (128 bit entropy + checksum) 🔐'
      : 'Lắc xúc xắc, rước <b id="cntLabel">12</b> từ may mắn về nhà 🧧';
    $('selCount').value = state.prefs.count; if ($('cntLabel')) $('cntLabel').textContent = state.prefs.count;
    $('chkNum').checked = state.prefs.nums; $('btnSound').textContent = state.prefs.sound ? '🔊' : '🔇';
    save(PREF_KEY, state.prefs);
  }
  $('modeRandom').onclick = () => { state.prefs.mode = 'random'; syncPrefs(); };
  $('modeBip').onclick = () => { state.prefs.mode = 'bip'; syncPrefs(); };
  $('rollBtn').onclick = roll;
  $('btnReroll').onclick = roll;
  $('skipBtn').onclick = () => skip && skip();
  $('btnCopy').onclick = copy;
  $('btnDownload').onclick = download;
  $('btnBack').onclick = () => show('home');
  $('selCount').onchange = (e) => { state.prefs.count = +e.target.value; state.locked.clear(); syncPrefs(); };
  $('chkNum').onchange = (e) => { state.prefs.nums = e.target.checked; syncPrefs(); };
  $('btnSound').onclick = () => { state.prefs.sound = !state.prefs.sound; syncPrefs(); };
  $('btnHistory').onclick = () => toggleDrawer(true);
  $('closeHistory').onclick = $('scrim').onclick = () => toggleDrawer(false);
  $('clearHistory').onclick = () => { state.history = []; save(HISTORY_KEY, []); renderHistory(); };
  syncPrefs(); renderHistory();
})();
