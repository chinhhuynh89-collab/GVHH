// "Thí nghiệm ảo — Trộn hoá chất": dựa trên dữ liệu "Nhận biết ion" ĐÃ CÓ SẴN (js/data/reference-
// tables.js: ION_IDENTIFICATION — đã kiểm chứng khoa học, dùng chung cho cả bảng tra cứu "Bảng tra
// cứu"). CỐ Ý KHÔNG tự chế 1 bộ luật hoá học tổng quát cho phép trộn TUỲ Ý 2 chất bất kỳ — rủi ro sinh
// ra kết quả sai khoa học với các tổ hợp không lường trước quá cao so với lợi ích.
//
// Luồng chơi qua 3 giai đoạn NỐI TIẾP NHAU như 1 đoạn video ngắn: 'guess' (chọn chất + đoán trước loại
// hiện tượng) -> 'pouring' (lọ thuốc thử nghiêng, vài giọt rơi vào ống nghiệm, có tiếng rót) ->
// 'reacting' (ống nghiệm đổi màu/sủi bọt khí/kết tủa lắng xuống/quầng lửa xuất hiện, kèm âm thanh riêng
// theo từng loại) -> hiện kết quả đúng/sai + hiện tượng đầy đủ (kèm tiếng đúng/sai). Giai đoạn
// pouring/reacting/result dùng CHUNG 1 khối DOM #experimentStage xuyên suốt (chỉ đổi class/style tại
// chỗ, không innerHTML lại) để CSS transition đổi màu chạy mượt thật sự.
(function () {
  const TYPE_LABELS = {
    ketTua: 'Xuất hiện kết tủa',
    khi: 'Có khí thoát ra',
    mauNgonLua: 'Ngọn lửa đổi màu',
    doiMauDungDich: 'Dung dịch/giấy quỳ đổi màu'
  };
  const NEUTRAL_COLOR = '#94a3b8'; // màu "dung dịch trong suốt" trước khi trộn, chưa có hiện tượng gì
  // Chậm hơn bản đầu (1000/1000ms) theo phản hồi thực tế — đủ thời gian NHÌN RÕ giọt rơi và hiện tượng
  // diễn ra thay vì thoáng qua.
  const POUR_MS = 1700; // thời gian hoạt cảnh nhỏ giọt thuốc thử
  const REACT_MS = 1900; // thời gian hoạt cảnh phản ứng (đổi màu/sủi bọt/kết tủa lắng) trước khi hiện kết quả
  const SOUND_KEY = 'hoahoc_experiment_sound';

  let current = null;
  let guessed = null;

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // ---------- Âm thanh — TỰ TỔNG HỢP bằng Web Audio API (dao động/nhiễu lọc qua filter), KHÔNG dùng
  // file âm thanh ngoài — giữ app hoạt động hoàn toàn offline, không tăng dung lượng tải về. Trình
  // duyệt chặn AudioContext tự phát tới khi có tương tác người dùng thật — không thành vấn đề ở đây vì
  // MỌI âm thanh đều phát ra ngay sau 1 lượt bấm (chọn chất/đoán/thử lại), luôn có sẵn "user gesture".
  let audioCtx = null;
  function isSoundOn() {
    return localStorage.getItem(SOUND_KEY) !== '0';
  }
  function getAudioCtx() {
    if (!isSoundOn()) return null;
    if (!audioCtx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function playTone(freq, duration, opts) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    opts = opts || {};
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type || 'sine';
    const t0 = ctx.currentTime;
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.sweepTo) osc.frequency.exponentialRampToValueAtTime(opts.sweepTo, t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(opts.peak || 0.18, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  function playNoise(duration, opts) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    opts = opts || {};
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType || 'bandpass';
    const t0 = ctx.currentTime;
    filter.frequency.setValueAtTime(opts.filterFreq || 1000, t0);
    if (opts.filterSweepTo) filter.frequency.exponentialRampToValueAtTime(opts.filterSweepTo, t0 + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(opts.peak || 0.12, t0 + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(t0);
    noise.stop(t0 + duration + 0.05);
  }

  // Tiếng rót nhẹ — nhiễu lọc dải hẹp, tần số hạ dần giả lập cảm giác chất lỏng chảy xuống.
  function sfxPour() {
    playNoise(POUR_MS / 1000, { filterType: 'bandpass', filterFreq: 2200, filterSweepTo: 700, peak: 0.06 });
  }
  // Kết tủa: 1 tiếng "bụp" trầm dần — cảm giác vật rắn lắng xuống đáy.
  function sfxKetTua() {
    playTone(320, 0.5, { type: 'sine', sweepTo: 90, peak: 0.16 });
  }
  // Khí thoát ra: tiếng sủi/rít cao — nhiễu lọc thông cao.
  function sfxKhi() {
    playNoise(0.9, { filterType: 'highpass', filterFreq: 2200, peak: 0.1 });
  }
  // Đốt/ngọn lửa: tiếng "phụt" — nhiễu lọc thông thấp, tần số hạ nhanh giống lửa bùng lên rồi ổn định.
  function sfxNgonLua() {
    playNoise(0.55, { filterType: 'lowpass', filterFreq: 3200, filterSweepTo: 400, peak: 0.16 });
  }
  // Đổi màu dung dịch: 2 nốt cao dần, giống tiếng "lấp lánh" biến hoá.
  function sfxDoiMauDungDich() {
    playTone(660, 0.3, { type: 'sine', peak: 0.11 });
    setTimeout(() => playTone(880, 0.35, { type: 'sine', peak: 0.09 }), 130);
  }
  function sfxReaction(type) {
    if (type === 'ketTua') sfxKetTua();
    else if (type === 'khi') sfxKhi();
    else if (type === 'mauNgonLua') sfxNgonLua();
    else sfxDoiMauDungDich();
  }
  // Đoán đúng: giai điệu 2 nốt đi lên vui tai. Đoán sai: 1 nốt trầm đi xuống, nhẹ nhàng không chói tai.
  function sfxCorrect() {
    playTone(523, 0.15, { type: 'sine', peak: 0.15 });
    setTimeout(() => playTone(784, 0.3, { type: 'sine', peak: 0.15 }), 140);
  }
  function sfxWrong() {
    playTone(240, 0.4, { type: 'triangle', sweepTo: 150, peak: 0.12 });
  }

  function renderSoundToggle() {
    const on = isSoundOn();
    return `<button type="button" id="experimentSoundToggle" class="btn" style="position:absolute;top:8px;right:8px;padding:4px 10px;font-size:13px;" title="${on ? 'Tắt âm thanh' : 'Bật âm thanh'}">${on ? '🔊' : '🔇'}</button>`;
  }
  function wireSoundToggle() {
    const btn = $('#experimentSoundToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      localStorage.setItem(SOUND_KEY, isSoundOn() ? '0' : '1');
      btn.textContent = isSoundOn() ? '🔊' : '🔇';
      btn.title = isSoundOn() ? 'Tắt âm thanh' : 'Bật âm thanh';
    });
  }

  function pickRandom() {
    current = ION_IDENTIFICATION[Math.floor(Math.random() * ION_IDENTIFICATION.length)];
    guessed = null;
    renderGuessPhase();
  }

  function pickByIndex(idx) {
    current = ION_IDENTIFICATION[idx];
    guessed = null;
    renderGuessPhase();
  }

  function stageHtml(pouring) {
    return `
      <div class="experiment-stage${pouring ? ' is-pouring' : ''}" id="experimentStage">
        <div class="experiment-dropper">🧴</div>
        <span class="experiment-drop"></span>
        <div class="experiment-tube-wrap" id="experimentTubeWrap">
          <div class="experiment-tube">
            <div class="experiment-liquid" id="experimentLiquid" style="background:${NEUTRAL_COLOR};"></div>
          </div>
        </div>
      </div>
    `;
  }

  // ---------- Giai đoạn 1: chọn chất + đoán trước ----------
  function renderGuessPhase() {
    const box = $('#experimentBox');
    const selectHtml = ION_IDENTIFICATION.map((it, i) => `<option value="${i}">${escapeHtml(it.ion)}</option>`).join('');
    const selectedIndex = ION_IDENTIFICATION.indexOf(current);
    const distractorTypes = shuffle(Object.keys(TYPE_LABELS).filter((t) => t !== current.type)).slice(0, 3);
    const options = shuffle([current.type].concat(distractorTypes));
    box.innerHTML = `
      <div class="card" style="position:relative;">
        ${renderSoundToggle()}
        <div class="field">
          <label for="experimentSelect">Chọn chất cần thử</label>
          <select id="experimentSelect">${selectHtml}</select>
        </div>
        <p class="hint">🧪 Thuốc thử sẽ thêm vào: <strong>${escapeHtml(current.reagent)}</strong></p>
        ${stageHtml(false)}
        <p class="trivia-question" style="text-align:center;">Bạn dự đoán điều gì sẽ xảy ra?</p>
        <div class="quiz-options" id="experimentGuessOptions">
          ${options.map((t) => `<button type="button" class="quiz-option" data-type="${t}">${escapeHtml(TYPE_LABELS[t])}</button>`).join('')}
        </div>
      </div>
    `;
    wireSoundToggle();
    $('#experimentSelect').value = String(selectedIndex);
    $('#experimentSelect').addEventListener('change', (e) => pickByIndex(parseInt(e.target.value, 10)));
    $$('.quiz-option', $('#experimentGuessOptions')).forEach((btn) => {
      btn.addEventListener('click', () => beginPour(btn.dataset.type));
    });
  }

  // ---------- Giai đoạn 2: nhỏ thuốc thử (đổi DOM 1 LẦN, sau đó chỉ mutate tại chỗ) ----------
  function beginPour(type) {
    guessed = type;
    const box = $('#experimentBox');
    box.innerHTML = `
      <div class="card" style="position:relative;">
        ${renderSoundToggle()}
        <p class="hint">🧪 <strong>${escapeHtml(current.ion)}</strong> + ${escapeHtml(current.reagent)}</p>
        ${stageHtml(true)}
        <p class="hint" id="experimentCaption" style="text-align:center;font-weight:700;">⏳ Đang nhỏ thuốc thử vào ống nghiệm...</p>
      </div>
    `;
    wireSoundToggle();
    sfxPour();
    setTimeout(beginReact, POUR_MS);
  }

  // ---------- Giai đoạn 3: phản ứng xảy ra — MUTATE các phần tử ĐANG CÓ, không innerHTML lại, để CSS
  // transition đổi màu chạy mượt và không làm mất hiệu ứng vừa chạy dở. ----------
  function beginReact() {
    const stage = $('#experimentStage');
    const liquid = $('#experimentLiquid');
    if (!stage || !liquid) return; // giáo viên đã bấm "Thử chất khác"/đổi chất trong lúc đang chạy hoạt cảnh — bỏ qua an toàn
    stage.classList.remove('is-pouring');
    liquid.style.background = current.color;
    if (current.type === 'khi') {
      liquid.insertAdjacentHTML('beforeend', '<span class="bubble"></span><span class="bubble"></span><span class="bubble"></span>');
    } else if (current.type === 'ketTua') {
      const dots = [0, 1, 2].map((i) => `<span class="experiment-particle" style="left:${25 + i * 22}%;animation-delay:${i * 0.18}s;"></span>`).join('');
      liquid.insertAdjacentHTML('beforeend', dots);
    } else if (current.type === 'mauNgonLua') {
      $('#experimentTubeWrap').insertAdjacentHTML('beforeend', `<div class="experiment-flame" style="background:${current.color};"></div>`);
    }
    sfxReaction(current.type);
    const caption = $('#experimentCaption');
    if (caption) caption.textContent = '💥 Đang quan sát hiện tượng...';
    setTimeout(renderResult, REACT_MS);
  }

  // ---------- Hiện kết quả — chỉ thay THẺ CAPTION bằng kết quả, GIỮ NGUYÊN ống nghiệm phía trên (đã
  // đổi màu/hiệu ứng xong ở beginReact) thay vì dựng lại từ đầu. ----------
  function renderResult() {
    const caption = $('#experimentCaption');
    if (!caption) return; // đã chuyển chất khác trong lúc đang chạy hoạt cảnh
    const isCorrect = guessed === current.type;
    if (isCorrect) sfxCorrect(); else sfxWrong();
    caption.outerHTML = `
      <div class="trivia-feedback ${isCorrect ? 'ok' : 'no'}" style="margin-top:0;">
        ${isCorrect ? '✓ Đoán đúng!' : `✗ Chưa đúng — hiện tượng chính là: <strong>${escapeHtml(TYPE_LABELS[current.type])}</strong>`}
      </div>
      <p style="margin-top:12px;"><strong>Hiện tượng đầy đủ:</strong> ${escapeHtml(current.phenomenon)}</p>
      <button class="btn primary block" id="experimentNextBtn" style="margin-top:12px;">🔄 Thử chất khác</button>
    `;
    $('#experimentNextBtn').addEventListener('click', pickRandom);
  }

  pickRandom();
})();
