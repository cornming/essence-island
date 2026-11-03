/* 精油島 · 背景音樂
 * 用 Web Audio 即時產生舒緩的環境音樂：緩慢換和弦的柔和 pad，加上五聲音階的輕柔鈴音，
 * 再疊一層殘響與回聲。不需要任何音檔，也沒有授權問題。
 * 想改用自己的音樂：在 data.js 的 config.bgm.src 填音檔路徑，就會改播該檔（循環）。
 * 瀏覽器規定要使用者互動後才能出聲，所以第一次點擊 / 按鍵時才開始播放。 */
(function (global) {
  'use strict';

  const PREF = 'essence-island:music';
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  // Cmaj7 → Am7 → Fmaj7 → G6，每個和弦 8 秒
  const CHORDS = [[48, 55, 59, 64], [45, 52, 57, 60], [41, 48, 52, 57], [43, 50, 52, 59]];
  const SCALE = [72, 74, 76, 79, 81, 84, 86]; // C 大調五聲音階（C D E G A C D）
  const CHORD_LEN = 8;

  const cfg = { src: '', volume: 0.35 };
  let ac = null, master = null, bus = null, echo = null, timer = null, audioEl = null;
  let wantOn = true, started = false;
  let nextChord = 0, nextNote = 0, ci = 0, walk = 4;

  try { wantOn = localStorage.getItem(PREF) !== 'off'; } catch (e) { /* 讀不到就用預設（開） */ }

  function setup() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);

    // 殘響：用衰減的雜訊產生脈衝響應
    const len = Math.floor(ac.sampleRate * 3), ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    const verb = ac.createConvolver(); verb.buffer = ir;
    const wet = ac.createGain(); wet.gain.value = 0.55;
    bus = ac.createGain();
    bus.connect(master); bus.connect(verb); verb.connect(wet); wet.connect(master);

    // 回聲：讓鈴音有一點空間感
    echo = ac.createDelay(1); echo.delayTime.value = 0.42;
    const fb = ac.createGain(); fb.gain.value = 0.32;
    const send = ac.createGain(); send.gain.value = 0.35;
    echo.connect(fb); fb.connect(echo); echo.connect(send); send.connect(bus);
  }

  function pad(t, notes) {
    notes.forEach((n, i) => {
      [['sine', 0, 0.09], ['triangle', 4, 0.04]].forEach(([type, det, g]) => {
        const o = ac.createOscillator(), e = ac.createGain(), f = ac.createBiquadFilter();
        o.type = type; o.frequency.value = midi(n); o.detune.value = det + (i - 1.5) * 2;
        f.type = 'lowpass'; f.frequency.value = 1100;
        e.gain.setValueAtTime(0.0001, t);
        e.gain.linearRampToValueAtTime(g, t + 2.8);
        e.gain.setValueAtTime(g, t + CHORD_LEN - 1);
        e.gain.linearRampToValueAtTime(0.0001, t + CHORD_LEN + 3);
        o.connect(f); f.connect(e); e.connect(bus);
        o.start(t); o.stop(t + CHORD_LEN + 3.2);
      });
    });
  }

  function bell(t, n, vel, tail, toEcho) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), e = ac.createGain(), g2 = ac.createGain();
    o.type = 'sine'; o.frequency.value = midi(n);
    o2.type = 'triangle'; o2.frequency.value = midi(n) * 2; g2.gain.value = 0.15;
    e.gain.setValueAtTime(0.0001, t);
    e.gain.linearRampToValueAtTime(vel, t + 0.015);
    e.gain.exponentialRampToValueAtTime(0.0001, t + tail);
    o.connect(e); o2.connect(g2); g2.connect(e); e.connect(bus);
    if (toEcho) e.connect(echo);
    o.start(t); o2.start(t); o.stop(t + tail + 0.2); o2.stop(t + tail + 0.2);
  }

  // 提前 1.5 秒排程，避免 setInterval 抖動造成斷音
  function tick() {
    const horizon = ac.currentTime + 1.5;
    while (nextChord < horizon) { pad(nextChord, CHORDS[ci % CHORDS.length]); ci++; nextChord += CHORD_LEN; }
    while (nextNote < horizon) {
      if (Math.random() < 0.75) {
        const step = [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)];
        walk = Math.max(0, Math.min(SCALE.length - 1, walk + step));
        bell(nextNote, SCALE[walk], 0.05 + Math.random() * 0.03, 2.4, true);
      }
      nextNote += 1.1 + Math.random() * 1.6;
    }
  }

  function play() {
    if (cfg.src) {
      if (!audioEl) { audioEl = new Audio(cfg.src); audioEl.loop = true; }
      audioEl.volume = cfg.volume;
      audioEl.play().catch(() => { /* 尚未互動或檔案不存在 */ });
      return;
    }
    if (!ac) setup();
    ac.resume();
    if (!timer) {
      nextChord = nextNote = ac.currentTime + 0.2;
      timer = setInterval(tick, 400); tick();
    }
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.setTargetAtTime(cfg.volume, ac.currentTime, 1.5);
  }

  function stop() {
    if (audioEl) audioEl.pause();
    if (!ac) return;
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.setTargetAtTime(0, ac.currentTime, 0.3);
    clearInterval(timer); timer = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (audioEl) { if (document.hidden) audioEl.pause(); else if (wantOn && started) play(); return; }
    if (!ac) return;
    if (document.hidden) ac.suspend(); else if (wantOn && started) ac.resume();
  });

  global.Sound = {
    configure(c) { Object.assign(cfg, c || {}); },
    isOn() { return wantOn; },
    state() { return audioEl ? (audioEl.paused ? 'paused' : 'playing') : (ac ? ac.state : 'none'); },
    // 在第一次使用者互動時呼叫；已開始或使用者關閉時不做事
    unlock() { if (wantOn && !started) { started = true; play(); } },
    toggle() {
      wantOn = !wantOn;
      try { localStorage.setItem(PREF, wantOn ? 'on' : 'off'); } catch (e) { /* ignore */ }
      if (wantOn) { started = true; play(); } else stop();
      return wantOn;
    },
    // 完成學習站時的三音鈴聲
    chime() {
      if (!wantOn || !ac || ac.state !== 'running') return;
      const t = ac.currentTime + 0.05;
      [84, 88, 91].forEach((n, i) => bell(t + i * 0.16, n, 0.09, 1.8, true));
    },
  };
})(window);
