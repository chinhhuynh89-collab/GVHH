// "Thí nghiệm ảo — Trộn hoá chất": dựa trên dữ liệu "Nhận biết ion" ĐÃ CÓ SẴN (js/data/reference-
// tables.js: ION_IDENTIFICATION — đã kiểm chứng khoa học, dùng chung cho cả bảng tra cứu "Bảng tra
// cứu"). CỐ Ý KHÔNG tự chế 1 bộ luật hoá học tổng quát cho phép trộn TUỲ Ý 2 chất bất kỳ — rủi ro sinh
// ra kết quả sai khoa học với các tổ hợp không lường trước quá cao so với lợi ích. Học sinh chọn 1 ion,
// xem thuốc thử sẽ thêm vào, ĐOÁN TRƯỚC loại hiện tượng chính (kết tủa/khí/đổi màu ngọn lửa/đổi màu
// dung dịch) rồi bấm để xem đúng/sai + hiện tượng đầy đủ + ống nghiệm đổi màu minh hoạ (CSS thuần,
// không canvas/engine đồ hoạ).
(function () {
  const TYPE_LABELS = {
    ketTua: 'Xuất hiện kết tủa',
    khi: 'Có khí thoát ra',
    mauNgonLua: 'Ngọn lửa đổi màu',
    doiMauDungDich: 'Dung dịch/giấy quỳ đổi màu'
  };
  const NEUTRAL_COLOR = '#94a3b8'; // màu "dung dịch trong suốt" trước khi trộn, chưa có hiện tượng gì

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
    render();
  }

  function pickByIndex(idx) {
    current = ION_IDENTIFICATION[idx];
    guessed = null;
    render();
  }

  // revealed=false: ống nghiệm "trung tính" lúc chưa trộn — revealed=true: đúng màu/hiệu ứng thật của
  // phản ứng (kết tủa lắng màu tương ứng, khí sủi bọt, hoặc quầng lửa màu ở phía trên với "mauNgonLua").
  function renderTube(item, revealed) {
    const color = revealed ? item.color : NEUTRAL_COLOR;
    const flame = revealed && item.type === 'mauNgonLua' ? `<div class="experiment-flame" style="background:${color};"></div>` : '';
    const bubbles = revealed && item.type === 'khi' ? '<span class="bubble"></span><span class="bubble"></span><span class="bubble"></span>' : '';
    return `
      <div class="experiment-tube-wrap">
        ${flame}
        <div class="experiment-tube">
          <div class="experiment-liquid" style="background:${color};">${bubbles}</div>
        </div>
      </div>
    `;
  }

  function render() {
    const box = $('#experimentBox');
    const selectHtml = ION_IDENTIFICATION.map((it, i) => `<option value="${i}">${escapeHtml(it.ion)}</option>`).join('');
    const selectedIndex = ION_IDENTIFICATION.indexOf(current);

    if (!guessed) {
      // Bước 1: chọn chất (mặc định ngẫu nhiên) + đoán trước loại hiện tượng chính.
      const distractorTypes = shuffle(Object.keys(TYPE_LABELS).filter((t) => t !== current.type)).slice(0, 3);
      const options = shuffle([current.type].concat(distractorTypes));
      box.innerHTML = `
        <div class="card">
          <div class="field">
            <label for="experimentSelect">Chọn chất cần thử</label>
            <select id="experimentSelect">${selectHtml}</select>
          </div>
          <p class="hint">🧪 Thuốc thử sẽ thêm vào: <strong>${escapeHtml(current.reagent)}</strong></p>
          ${renderTube(current, false)}
          <p class="trivia-question" style="text-align:center;">Bạn dự đoán điều gì sẽ xảy ra?</p>
          <div class="quiz-options" id="experimentGuessOptions">
            ${options.map((t) => `<button type="button" class="quiz-option" data-type="${t}">${escapeHtml(TYPE_LABELS[t])}</button>`).join('')}
          </div>
        </div>
      `;
      $('#experimentSelect').value = String(selectedIndex);
      $('#experimentSelect').addEventListener('change', (e) => pickByIndex(parseInt(e.target.value, 10)));
      $$('.quiz-option', $('#experimentGuessOptions')).forEach((btn) => {
        btn.addEventListener('click', () => { guessed = btn.dataset.type; render(); });
      });
    } else {
      // Bước 2: trộn thật — hiện đúng/sai + hiện tượng đầy đủ + ống nghiệm đổi màu.
      const isCorrect = guessed === current.type;
      box.innerHTML = `
        <div class="card">
          <p class="hint">🧪 <strong>${escapeHtml(current.ion)}</strong> + ${escapeHtml(current.reagent)}</p>
          ${renderTube(current, true)}
          <div class="trivia-feedback ${isCorrect ? 'ok' : 'no'}" style="margin-top:0;">
            ${isCorrect ? '✓ Đoán đúng!' : `✗ Chưa đúng — hiện tượng chính là: <strong>${escapeHtml(TYPE_LABELS[current.type])}</strong>`}
          </div>
          <p style="margin-top:12px;"><strong>Hiện tượng đầy đủ:</strong> ${escapeHtml(current.phenomenon)}</p>
          <button class="btn primary block" id="experimentNextBtn" style="margin-top:12px;">🔄 Thử chất khác</button>
        </div>
      `;
      $('#experimentNextBtn').addEventListener('click', pickRandom);
    }
  }

  pickRandom();
})();
