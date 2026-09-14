// "Thí nghiệm ảo — Trộn hoá chất": dựa trên dữ liệu "Nhận biết ion" ĐÃ CÓ SẴN (js/data/reference-
// tables.js: ION_IDENTIFICATION — đã kiểm chứng khoa học, dùng chung cho cả bảng tra cứu "Bảng tra
// cứu"). CỐ Ý KHÔNG tự chế 1 bộ luật hoá học tổng quát cho phép trộn TUỲ Ý 2 chất bất kỳ — rủi ro sinh
// ra kết quả sai khoa học với các tổ hợp không lường trước quá cao so với lợi ích.
//
// Luồng chơi qua 3 giai đoạn NỐI TIẾP NHAU như 1 đoạn video ngắn (theo phản hồi thực tế: "phải làm như
// video, đổ chất thử vào ống nghiệm, rồi hiện tượng xảy ra"), KHÔNG đổi màu tức thì ngay khi bấm đoán
// như bản trước: 'guess' (chọn chất + đoán trước loại hiện tượng) -> 'pouring' (lọ thuốc thử nghiêng,
// vài giọt rơi vào ống nghiệm) -> 'reacting' (ống nghiệm đổi màu/sủi bọt khí/kết tủa lắng xuống/quầng
// lửa xuất hiện) -> hiện kết quả đúng/sai + hiện tượng đầy đủ. Giai đoạn pouring/reacting/result dùng
// CHUNG 1 khối DOM #experimentStage xuyên suốt (chỉ đổi class/style tại chỗ, không innerHTML lại) để
// CSS transition đổi màu chạy mượt thật sự, không bị "giật" do dựng lại toàn bộ DOM giữa các giai đoạn.
(function () {
  const TYPE_LABELS = {
    ketTua: 'Xuất hiện kết tủa',
    khi: 'Có khí thoát ra',
    mauNgonLua: 'Ngọn lửa đổi màu',
    doiMauDungDich: 'Dung dịch/giấy quỳ đổi màu'
  };
  const NEUTRAL_COLOR = '#94a3b8'; // màu "dung dịch trong suốt" trước khi trộn, chưa có hiện tượng gì
  const POUR_MS = 1000; // thời gian hoạt cảnh nhỏ giọt thuốc thử
  const REACT_MS = 1000; // thời gian hoạt cảnh phản ứng (đổi màu/sủi bọt/kết tủa lắng) trước khi hiện kết quả

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
      <div class="card">
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
      <div class="card">
        <p class="hint">🧪 <strong>${escapeHtml(current.ion)}</strong> + ${escapeHtml(current.reagent)}</p>
        ${stageHtml(true)}
        <p class="hint" id="experimentCaption" style="text-align:center;font-weight:700;">⏳ Đang nhỏ thuốc thử vào ống nghiệm...</p>
      </div>
    `;
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
