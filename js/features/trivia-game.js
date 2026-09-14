// Trò chơi "Đố vui Hoá học tốc độ" — trắc nghiệm đếm giờ, câu hỏi SINH TỰ ĐỘNG từ dữ liệu kiến thức
// lõi đã có sẵn trong app (js/data/elements.js, js/data/organic-nomenclature.js), KHÔNG cần giáo viên
// soạn thêm nội dung nào. Nội dung tĩnh, không cần Firebase/đăng nhập — chơi được ngay, điểm cao nhất
// lưu localStorage (không đồng bộ máy chủ, không cần bảng xếp hạng ở bản đầu tiên này).
(function () {
  const TIME_PER_QUESTION = 15; // giây/câu — vẫn dùng làm mốc đo TỐC ĐỘ trả lời cho cả thưởng lẫn phạt
  const GAME_DURATION_SEC = 120; // KHÔNG giới hạn số câu (khác bản trước: cố định 10 câu/lượt) — trả
  // lời được bao nhiêu câu tuỳ tốc độ, tính điểm trong đúng 2 phút.
  const BASE_POINTS = 100; // điểm trả lời đúng, chưa tính thưởng tốc độ
  const SPEED_BONUS_MAX = 100; // thưởng thêm tối đa nếu trả lời NGAY LẬP TỨC, giảm dần về 0 khi hết giờ
  // Trừ điểm khi chọn SAI (kể cả hết giờ không chọn) — CÙNG công thức đối xứng với thưởng: sai càng
  // NHANH trừ càng nhiều (tối đa 100), gần hết giờ mới chọn sai thì trừ ít — để tránh kiểu chơi bấm bừa
  // thật nhanh ăn may/bỏ qua câu hỏi cho lẹ thay vì thực sự đọc và suy nghĩ.
  const PENALTY_MAX = 100;
  const HIGH_SCORE_KEY = 'hoahoc_trivia_highscore';
  const REVEAL_DELAY_MS = 1400; // dừng lại 1 chút cho học sinh thấy đáp án đúng trước khi sang câu tiếp

  let currentQuestion = null;
  let questionCount = 0; // tổng số câu ĐÃ TRẢ LỜI (đúng/sai/hết giờ) trong lượt chơi hiện tại
  let score = 0;
  let correctCount = 0;
  let timeLeft = TIME_PER_QUESTION; // đếm ngược của riêng CÂU đang hiện
  let gameTimeLeft = GAME_DURATION_SEC; // đếm ngược của CẢ LƯỢT chơi — chạy LIÊN TỤC, không dừng giữa các câu
  let questionTimerHandle = null;
  let gameTimerHandle = null;
  let answered = false;
  let gameEnded = false;

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function pickDistractors(pool, correctValue, getValue, count) {
    // Loại trùng giá trị (không chỉ trùng đúng phần tử) — 1 số nguyên tố/nhóm có thể trùng nhãn hiển thị.
    const seen = new Set([correctValue]);
    const candidates = [];
    shuffle(pool).forEach((item) => {
      const v = getValue(item);
      if (!seen.has(v)) { seen.add(v); candidates.push(v); }
    });
    return candidates.slice(0, count);
  }

  function buildOptions(correctValue, distractors) {
    const options = shuffle([correctValue].concat(distractors));
    return { options, correctIndex: options.indexOf(correctValue) };
  }

  // ---------- Bộ sinh câu hỏi từ dữ liệu nguyên tố (js/data/elements.js) ----------
  // Chỉ dùng nguyên tố Z<=86 (đến Radon) — loại nhóm Lantan/Actini (Z=57-71, 89-103, lọc theo "cat")
  // LẪN các nguyên tố siêu nặng tổng hợp nhân tạo Z>=87 (Franxi trở đi, có thể rơi vào nhóm "transition"
  // chứ không hẳn "actinide" nên lọc theo cat không đủ, VD Darmstadti Z=110). Tất cả đều KHÔNG thuộc
  // chương trình phổ thông, hỏi vào sẽ chỉ gây khó/rối cho học sinh chứ không kiểm tra đúng kiến thức lõi.
  const TRIVIA_ELEMENTS = ELEMENTS.filter((e) => e.cat !== 'lanthanide' && e.cat !== 'actinide' && e.z <= 86);

  function genElementSymbolFromName() {
    const el = TRIVIA_ELEMENTS[Math.floor(Math.random() * TRIVIA_ELEMENTS.length)];
    const distractors = pickDistractors(TRIVIA_ELEMENTS, el.sym, (e) => e.sym, 3);
    const { options, correctIndex } = buildOptions(el.sym, distractors);
    return { q: `Kí hiệu hoá học của <strong>${escapeHtml(el.vi)}</strong> là gì?`, options, correctIndex };
  }

  function genElementNameFromSymbol() {
    const el = TRIVIA_ELEMENTS[Math.floor(Math.random() * TRIVIA_ELEMENTS.length)];
    const distractors = pickDistractors(TRIVIA_ELEMENTS, el.vi, (e) => e.vi, 3);
    const { options, correctIndex } = buildOptions(el.vi, distractors);
    return { q: `Kí hiệu <strong>"${escapeHtml(el.sym)}"</strong> là của nguyên tố nào?`, options, correctIndex };
  }

  function genElementCategory() {
    const el = TRIVIA_ELEMENTS[Math.floor(Math.random() * TRIVIA_ELEMENTS.length)];
    const correctLabel = CATEGORY_LABELS[el.cat];
    const otherCats = Object.keys(CATEGORY_LABELS).filter((c) => c !== el.cat && c !== 'lanthanide' && c !== 'actinide');
    const distractors = shuffle(otherCats).slice(0, 3).map((c) => CATEGORY_LABELS[c]);
    const { options, correctIndex } = buildOptions(correctLabel, distractors);
    return { q: `${escapeHtml(el.vi)} (${escapeHtml(el.sym)}) thuộc nhóm nguyên tố nào?`, options, correctIndex };
  }

  function genElementFromSummary() {
    const el = TRIVIA_ELEMENTS[Math.floor(Math.random() * TRIVIA_ELEMENTS.length)];
    const distractors = pickDistractors(TRIVIA_ELEMENTS, el.vi, (e) => e.vi, 3);
    const { options, correctIndex } = buildOptions(el.vi, distractors);
    return { q: `Nguyên tố nào được mô tả sau đây: <em>"${escapeHtml(el.summary)}"</em>?`, options, correctIndex };
  }

  // ---------- Bộ sinh câu hỏi từ danh pháp hữu cơ (js/data/organic-nomenclature.js) ----------
  function genCarbonPrefix() {
    const p = CARBON_PREFIXES[Math.floor(Math.random() * CARBON_PREFIXES.length)];
    const distractors = pickDistractors(CARBON_PREFIXES, p.prefix, (x) => x.prefix, 3);
    const { options, correctIndex } = buildOptions(p.prefix, distractors);
    return { q: `Mạch chính có <strong>${p.count}</strong> nguyên tử cacbon dùng tiền tố nào?`, options, correctIndex };
  }

  function genFunctionalSuffix() {
    const f = FUNCTIONAL_SUFFIXES[Math.floor(Math.random() * FUNCTIONAL_SUFFIXES.length)];
    const distractors = pickDistractors(FUNCTIONAL_SUFFIXES, f.suffix, (x) => x.suffix, 3);
    const { options, correctIndex } = buildOptions(f.suffix, distractors);
    return { q: `Hậu tố dùng để gọi tên <strong>${escapeHtml(f.className)}</strong> là gì?`, options, correctIndex };
  }

  // ---------- Bộ sinh câu hỏi từ công thức/định luật (js/data/chemistry-formulas.js) ----------
  // Nhiều mục ở đây là phát biểu ĐỊNH LUẬT bằng cả câu văn dài (VD "Định luật thành phần không đổi"),
  // không phù hợp làm nút bấm trắc nghiệm (phải đọc/lướt nhanh) — chỉ giữ mục có CẢ tên lẫn công thức
  // đủ ngắn gọn, súc tích.
  const TRIVIA_FORMULAS = CHEMISTRY_FORMULAS.filter((f) => f.formula.length <= 30 && f.name.length <= 30);

  function genFormulaFromName() {
    const f = TRIVIA_FORMULAS[Math.floor(Math.random() * TRIVIA_FORMULAS.length)];
    const distractors = pickDistractors(TRIVIA_FORMULAS, f.formula, (x) => x.formula, 3);
    const { options, correctIndex } = buildOptions(f.formula, distractors);
    // Vài mục có tên đã bắt đầu bằng "Công thức chung..." (Ankan/Anken/Ankin/Ankadien) — hỏi kiểu
    // "Công thức tính Công thức chung X là gì?" nghe lặp từ, đổi cách hỏi cho tự nhiên hơn.
    const q = /^Công thức/i.test(f.name)
      ? `<strong>${escapeHtml(f.name)}</strong> là gì?`
      : `Công thức tính <strong>${escapeHtml(f.name)}</strong> là gì?`;
    return { q, options, correctIndex };
  }

  function genNameFromFormula() {
    const f = TRIVIA_FORMULAS[Math.floor(Math.random() * TRIVIA_FORMULAS.length)];
    const distractors = pickDistractors(TRIVIA_FORMULAS, f.name, (x) => x.name, 3);
    const { options, correctIndex } = buildOptions(f.name, distractors);
    return { q: `Công thức <strong>${escapeHtml(f.formula)}</strong> dùng để tính đại lượng nào?`, options, correctIndex };
  }

  // ---------- Bộ sinh câu hỏi từ câu chuyện Hoá học (js/data/chemistry-stories.js) ----------
  // Nội dung ở đây là văn xuôi (không có field "nhân vật"/"đáp án" tách riêng) nên KHÔNG tự trích xuất
  // được kiểu hỏi-đáp thông thường — dùng cách khác: cho tóm tắt (summary), đoán ĐÚNG tiêu đề (title)
  // khớp với tóm tắt đó trong 4 lựa chọn — chỉ dùng 2 field đã có sẵn, tự động cập nhật nếu sau này
  // thêm câu chuyện mới, không cần tự tay gắn thêm dữ liệu nào.
  function genStoryTitleFromSummary() {
    const s = CHEMISTRY_STORIES[Math.floor(Math.random() * CHEMISTRY_STORIES.length)];
    const distractors = pickDistractors(CHEMISTRY_STORIES, s.title, (x) => x.title, 3);
    const { options, correctIndex } = buildOptions(s.title, distractors);
    return { q: `Câu chuyện nào khớp với tóm tắt sau: <em>"${escapeHtml(s.summary)}"</em>?`, options, correctIndex };
  }

  // Trọng số: lặp lại các dạng phổ biến/dễ hơn để câu hỏi đa dạng nhưng không quá thiên lệch — nguyên
  // tố có kho dữ liệu lớn nhất (118 nguyên tố) nên vẫn chiếm tỉ trọng cao nhất, các dạng còn lại (công
  // thức, câu chuyện, danh pháp) có kho nhỏ hơn nên xuất hiện thưa hơn để đỡ lặp lại trong 1 vòng chơi.
  const GENERATORS = [
    genElementSymbolFromName, genElementSymbolFromName,
    genElementNameFromSymbol, genElementNameFromSymbol,
    genElementCategory,
    genElementFromSummary,
    genCarbonPrefix,
    genFunctionalSuffix,
    genFormulaFromName,
    genNameFromFormula,
    genStoryTitleFromSummary
  ];

  function generateQuestion() {
    const gen = GENERATORS[Math.floor(Math.random() * GENERATORS.length)];
    return gen();
  }

  function getHighScore() {
    return parseInt(localStorage.getItem(HIGH_SCORE_KEY), 10) || 0;
  }
  function setHighScoreIfBetter(finalScore) {
    if (finalScore > getHighScore()) localStorage.setItem(HIGH_SCORE_KEY, String(finalScore));
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  // ---------- Vòng chơi ----------
  function stopQuestionTimer() {
    if (questionTimerHandle) { clearInterval(questionTimerHandle); questionTimerHandle = null; }
  }
  function stopGameTimer() {
    if (gameTimerHandle) { clearInterval(gameTimerHandle); gameTimerHandle = null; }
  }

  function startRound() {
    questionCount = 0;
    score = 0;
    correctCount = 0;
    gameTimeLeft = GAME_DURATION_SEC;
    gameEnded = false;
    // Đồng hồ CẢ LƯỢT chơi chạy RIÊNG, LIÊN TỤC — không dừng giữa lúc chuyển câu/xem đáp án (khác đồng
    // hồ từng câu), để đúng 2 phút chơi thật, không bị "cộng thêm giờ chết" mỗi lần dừng xem đáp án.
    stopGameTimer();
    gameTimerHandle = setInterval(() => {
      gameTimeLeft -= 0.1;
      const el = $('#triviaGameTime');
      if (el) {
        el.textContent = '⏱ ' + formatTime(gameTimeLeft);
        el.classList.toggle('is-low', gameTimeLeft <= 10);
      }
      if (gameTimeLeft <= 0) endGame();
    }, 100);
    renderQuestion();
  }

  function endGame() {
    if (gameEnded) return;
    gameEnded = true;
    stopGameTimer();
    stopQuestionTimer();
    renderResult();
  }

  function renderQuestion() {
    answered = false;
    timeLeft = TIME_PER_QUESTION;
    currentQuestion = generateQuestion();
    const box = $('#triviaBox');
    box.innerHTML = `
      <div class="trivia-topbar">
        <span>Câu ${questionCount + 1}</span>
        <span id="triviaGameTime" class="${gameTimeLeft <= 10 ? 'is-low' : ''}">⏱ ${formatTime(gameTimeLeft)}</span>
        <span>Điểm: <strong>${score}</strong></span>
      </div>
      <div class="trivia-timer-bar"><div class="trivia-timer-fill" id="triviaTimerFill"></div></div>
      <div class="card">
        <p class="trivia-question">${currentQuestion.q}</p>
        <div class="quiz-options" id="triviaOptions">
          ${currentQuestion.options.map((opt, i) => `
            <button type="button" class="quiz-option" data-i="${i}">${escapeHtml(opt)}</button>
          `).join('')}
        </div>
      </div>
    `;
    $$('.quiz-option', box).forEach((btn) => {
      btn.addEventListener('click', () => submitAnswer(parseInt(btn.dataset.i, 10)));
    });
    stopQuestionTimer();
    updateTimerBar();
    questionTimerHandle = setInterval(() => {
      timeLeft -= 0.1;
      updateTimerBar();
      if (timeLeft <= 0) { stopQuestionTimer(); submitAnswer(-1); }
    }, 100);
  }

  function updateTimerBar() {
    const fill = $('#triviaTimerFill');
    if (!fill) return;
    const pct = Math.max(0, (timeLeft / TIME_PER_QUESTION) * 100);
    fill.style.width = pct + '%';
    fill.classList.toggle('is-low', timeLeft <= TIME_PER_QUESTION * 0.3);
  }

  function submitAnswer(chosenIndex) {
    if (answered || gameEnded) return;
    answered = true;
    stopQuestionTimer();
    const item = currentQuestion;
    const isCorrect = chosenIndex === item.correctIndex;
    // speedFrac: 1 = trả lời NGAY LẬP TỨC, 0 = gần/đúng lúc hết giờ — dùng CHUNG cho cả thưởng (đúng)
    // lẫn phạt (sai), đối xứng nhau.
    const speedFrac = Math.max(0, Math.min(1, timeLeft / TIME_PER_QUESTION));
    let delta = 0;
    questionCount++;
    if (isCorrect) {
      correctCount++;
      delta = BASE_POINTS + Math.round(SPEED_BONUS_MAX * speedFrac);
      score += delta;
    } else {
      delta = Math.round(PENALTY_MAX * speedFrac);
      score -= delta;
    }
    $$('.quiz-option', $('#triviaOptions')).forEach((btn, i) => {
      btn.disabled = true;
      if (i === item.correctIndex) btn.classList.add('correct');
      else if (i === chosenIndex) btn.classList.add('wrong');
    });
    const box = $('#triviaBox');
    const feedback = document.createElement('div');
    feedback.className = 'trivia-feedback ' + (isCorrect ? 'ok' : 'no');
    if (isCorrect) feedback.textContent = `✓ Chính xác! +${delta} điểm`;
    else if (chosenIndex === -1) feedback.textContent = delta > 0 ? `⏱ Hết giờ! −${delta} điểm` : '⏱ Hết giờ!';
    else feedback.textContent = delta > 0 ? `✗ Chưa đúng! −${delta} điểm` : '✗ Chưa đúng!';
    box.appendChild(feedback);
    const scoreEl = box.querySelector('.trivia-topbar strong');
    if (scoreEl) scoreEl.textContent = score;
    setTimeout(() => {
      if (gameTimeLeft > 0) renderQuestion();
      else endGame();
    }, REVEAL_DELAY_MS);
  }

  function renderResult() {
    const high = getHighScore();
    setHighScoreIfBetter(score);
    const newHigh = questionCount > 0 && score > high;
    const ratio = questionCount ? correctCount / questionCount : 0;
    $('#triviaBox').innerHTML = `
      <div class="card" style="text-align:center;">
        <div style="font-size:48px;">${questionCount > 0 && ratio === 1 ? '🏆' : ratio >= 0.6 ? '🎉' : '💪'}</div>
        <h2 style="margin:8px 0;">${score} điểm</h2>
        <p class="hint">Đúng ${correctCount}/${questionCount} câu${newHigh ? ' — <strong>Kỷ lục mới!</strong> 🎊' : ''}</p>
        <p class="hint">Điểm cao nhất: ${Math.max(high, score)}</p>
        <button class="btn primary block" id="triviaReplayBtn" style="margin-top:12px;">🔄 Chơi lại</button>
      </div>
    `;
    $('#triviaReplayBtn').addEventListener('click', startRound);
  }

  startRound();
})();
