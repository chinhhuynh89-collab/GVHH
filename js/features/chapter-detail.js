// Trang chi tiết 1 chương: bài giảng tóm tắt -> flashcard -> trắc nghiệm.
// Nội dung tự biên soạn (bài giảng thêm, câu hỏi thêm, sửa tiêu đề chương) lưu trên Firestore,
// gắn với giáo viên đã đăng nhập — đọc được bởi bất kỳ ai (kể cả học sinh trong nhóm của giáo viên đó),
// nhưng chỉ chính giáo viên đó mới sửa được (xem firebase/firestore.rules).

(function () {
  const params = new URLSearchParams(location.search);
  const chapterId = params.get('id');
  const found = findChapterAnywhere(chapterId);

  if (!found) {
    $('main').innerHTML = `
      <div class="card">
        <h2>Không tìm thấy chương</h2>
        <p class="hint">Chương bạn tìm không tồn tại hoặc đã bị xoá.</p>
        <a class="btn primary" href="hoc-theo-chuong.html">← Quay lại danh sách chương</a>
      </div>
    `;
    return;
  }
  const chapter = found.chapter;
  const chapterHasContent = hasContent(chapter);

  let owner = { uid: null, isOwner: false };
  let effectiveQuiz = chapter.quiz.slice();
  let customQuizCache = [];

  function refreshDots() {
    const p = getChapterProgress(chapter.id);
    $('#dotLesson').classList.toggle('done', p.lessonViewed);
    $('#dotFlash').classList.toggle('done', p.flashcardsViewed);
    $('#dotQuiz').classList.toggle('done', p.quizBestPercent >= QUIZ_PASS_PERCENT);
  }

  // ---------- Tiêu đề / mô tả chương (sửa được nếu là chủ sở hữu) ----------
  async function renderHeader() {
    let meta = null;
    try { meta = owner.uid ? await getChapterMeta(owner.uid, chapter.id) : null; } catch (e) { meta = null; }
    const title = (meta && meta.title) || chapter.title;
    const desc = (meta && meta.description) || chapter.description;
    document.title = title + ' — Trợ Lý Giáo Viên Hoá Học';
    $('#chIcon').textContent = chapter.icon;
    $('#chTitle').textContent = title;
    $('#chDesc').textContent = desc;
    $('#chEditForm').style.display = 'none';
    $('#chEditTitle').value = title;
    $('#chEditDesc').value = desc;
    $('#chEditBtn').style.display = owner.isOwner ? 'inline-flex' : 'none';
    // Giải thích lý do không thấy nút Sửa/Nạp bài giảng khi chưa đăng nhập — trước đây các nút này
    // chỉ biến mất im lặng, dễ khiến giáo viên tưởng nhầm là app bị lỗi.
    $('#chSignInHint').style.display = (!owner.isOwner && isFirebaseConfigured()) ? 'inline' : 'none';
  }

  function initHeaderEdit() {
    if (!owner.isOwner) return;
    $('#chEditBtn').addEventListener('click', () => {
      $('#chEditForm').style.display = $('#chEditForm').style.display === 'none' ? 'block' : 'none';
    });
    $('#chEditCancel').addEventListener('click', () => { $('#chEditForm').style.display = 'none'; });
    $('#chEditSave').addEventListener('click', async () => {
      const title = $('#chEditTitle').value.trim();
      const description = $('#chEditDesc').value.trim();
      if (!title) return;
      try {
        await setChapterMeta(chapter.id, { title, description });
        await renderHeader();
      } catch (e) {
        alert('Không lưu được: ' + e.message);
      }
    });
  }

  // ---------- Bài giảng (nội dung chuẩn) ----------
  function renderLessons() {
    if (!chapterHasContent) {
      $('#lessonContent').innerHTML = `
        <div class="card">
          <p class="hint">📝 Chương này chưa có bài giảng chuẩn trong app${owner.isOwner ? ' — bạn có thể viết hoặc nạp tài liệu riêng ở bên dưới.' : '.'}</p>
        </div>
      `;
      return;
    }
    $('#lessonContent').innerHTML = chapter.lessons.map((l) => `
      <div class="lesson-block">
        <h3>${l.title}</h3>
        <ul>${l.points.map((pt) => `<li>${pt}</li>`).join('')}</ul>
      </div>
    `).join('');
    setChapterProgress(chapter.id, { lessonViewed: true });
    refreshDots();
  }

  // ---------- Tài liệu / bài giảng giáo viên tự biên soạn ----------
  async function renderCustomLessons() {
    const box = $('#customLessonContent');
    if (!owner.uid) { box.innerHTML = ''; return; }
    let items = [];
    try { items = await getCustomLessons(owner.uid, chapter.id); } catch (e) { box.innerHTML = ''; return; }
    if (!items.length) { box.innerHTML = ''; return; }
    box.innerHTML = items.map((item) => `
      <div class="lesson-block custom-lesson-block">
        <h3>📎 ${escapeHtml(item.title || item.sourceFileName || 'Bài giảng tự viết')}</h3>
        <ul>${item.points.map((pt) => `<li>${escapeHtml(pt)}</li>`).join('')}</ul>
        <div class="hint">
          ${item.sourceFileName ? `Từ file "${escapeHtml(item.sourceFileName)}"` : 'Viết thủ công'}
          ${owner.isOwner ? ` · <a href="#" class="edit-custom-lesson" data-id="${item.id}">Sửa</a> · <a href="#" class="delete-custom-lesson" data-id="${item.id}">Xoá</a>` : ''}
        </div>
      </div>
    `).join('');
    if (!owner.isOwner) return;
    $$('.delete-custom-lesson', box).forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        await deleteCustomLesson(a.dataset.id);
        renderCustomLessons();
      });
    });
    $$('.edit-custom-lesson', box).forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const item = items.find((it) => it.id === a.dataset.id);
        if (item) openManualLessonForm(item);
      });
    });
  }

  function openManualLessonForm(existing) {
    const box = $('#manualLessonForm');
    box.style.display = 'block';
    $('#manualLessonTitle').value = existing ? (existing.title || '') : '';
    $('#manualLessonPoints').value = existing ? existing.points.join('\n') : '';
    box.dataset.editId = existing ? existing.id : '';
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function initManualLessonForm() {
    if (!owner.isOwner) return;
    $('#manualLessonAddBtn').addEventListener('click', () => openManualLessonForm(null));
    $('#manualLessonCancel').addEventListener('click', () => { $('#manualLessonForm').style.display = 'none'; });
    $('#manualLessonSave').addEventListener('click', async () => {
      const title = $('#manualLessonTitle').value.trim();
      const points = $('#manualLessonPoints').value.split('\n').map((s) => s.trim()).filter(Boolean);
      if (!title || !points.length) { return; }
      const editId = $('#manualLessonForm').dataset.editId;
      try {
        if (editId) {
          await updateCustomLesson(editId, { title, points });
        } else {
          await addCustomLesson(chapter.id, { title, points, sourceFileName: null });
        }
        $('#manualLessonForm').style.display = 'none';
        renderCustomLessons();
      } catch (e) {
        alert('Không lưu được: ' + e.message);
      }
    });
  }

  function renderImportPreview(sections, fileName) {
    const box = $('#docImportPreview');
    if (!sections.length) {
      box.innerHTML = `<div class="result-box show error">⚠️ Không tìm thấy nội dung văn bản nào trong file này.</div>`;
      return;
    }
    box.innerHTML = `
      <div class="result-box show">
        <div style="font-weight:700;margin-bottom:10px;">Đã trích xuất từ "${escapeHtml(fileName)}" — chọn phần muốn lưu vào chương:</div>
        ${sections.map((s, i) => `
          <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:10px;cursor:pointer;">
            <input type="checkbox" class="import-check" data-idx="${i}" checked style="margin-top:3px;flex-shrink:0;" />
            <span>
              <strong>${escapeHtml(s.title || '(Không có tiêu đề)')}</strong><br>
              <span style="font-size:12.5px;color:var(--text-dim);">${s.points.length} đoạn văn bản</span>
            </span>
          </label>
        `).join('')}
        <button class="btn primary block" id="docSaveBtn">Lưu vào chương</button>
      </div>
    `;
    $('#docSaveBtn').addEventListener('click', async () => {
      const checks = $$('.import-check', box);
      const chosen = checks.filter((c) => c.checked).map((c) => sections[parseInt(c.dataset.idx, 10)]);
      if (!chosen.length) return;
      $('#docSaveBtn').disabled = true;
      $('#docSaveBtn').textContent = 'Đang lưu...';
      try {
        // Lưu tất cả phần đã chọn trong 1 lượt ghi duy nhất (batch write) — trước đây mỗi phần là
        // 1 round-trip mạng riêng nên tài liệu nhiều phần (VD: 10-20 mục) rất chậm.
        await addCustomLessonBatch(chapter.id, chosen.map((sec) =>
          ({ title: sec.title, points: sec.points, sourceFileName: fileName })
        ));
        box.innerHTML = `<div class="result-box show">✓ Đã lưu vào chương.</div>`;
        await renderCustomLessons();
      } catch (e) {
        box.innerHTML = `<div class="result-box show error">⚠️ ${escapeHtml(e.message)}</div>`;
      }
    });
  }

  function initUploadControl() {
    if (!owner.isOwner) return;
    $('#docUploadBtn').addEventListener('click', () => $('#docFileInput').click());
    $('#docFileInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const box = $('#docImportPreview');
      box.innerHTML = `<div class="result-box show">⏳ Đang xử lý "${escapeHtml(file.name)}"...</div>`;
      try {
        const sections = await extractFileToLessons(file);
        renderImportPreview(sections, file.name);
      } catch (err) {
        box.innerHTML = `<div class="result-box show error">⚠️ ${escapeHtml(err.message)}</div>`;
      }
    });
  }

  // ---------- Flashcard ----------
  let fcIndex = 0;
  let fcFlipped = false;
  const fcViewed = new Set();

  function renderFlash() {
    const total = chapter.flashcards.length;
    if (!total) {
      $('#flashWrap').innerHTML = `<p class="hint">📝 Chương này chưa có flashcard.</p>`;
      return;
    }
    const card = chapter.flashcards[fcIndex];
    fcViewed.add(fcIndex);
    if (fcViewed.size === total) {
      setChapterProgress(chapter.id, { flashcardsViewed: true });
      refreshDots();
    }
    $('#flashWrap').innerHTML = `
      <div class="flash-progress">Thẻ ${fcIndex + 1}/${total} · đã xem ${fcViewed.size}/${total}</div>
      <div class="flash-card ${fcFlipped ? 'back' : ''}" id="flashCardEl">${fcFlipped ? card.back : card.front}</div>
      <div class="flash-nav">
        <button class="btn" id="fcPrev" ${fcIndex === 0 ? 'disabled' : ''}>← Trước</button>
        <button class="btn primary" id="fcNext" ${fcIndex === total - 1 ? 'disabled' : ''}>Tiếp →</button>
      </div>
    `;
    $('#flashCardEl').addEventListener('click', () => { fcFlipped = !fcFlipped; renderFlash(); });
    $('#fcPrev').addEventListener('click', () => { if (fcIndex > 0) { fcIndex--; fcFlipped = false; renderFlash(); } });
    $('#fcNext').addEventListener('click', () => { if (fcIndex < total - 1) { fcIndex++; fcFlipped = false; renderFlash(); } });
  }

  // ---------- Trắc nghiệm (làm bài) ----------
  let qIndex = 0;
  let qAnswers = [];
  let qFinished = false;

  function renderQuiz() {
    const total = effectiveQuiz.length;
    if (!total) {
      $('#quizWrap').innerHTML = `<p class="hint">📝 Chương này chưa có câu hỏi trắc nghiệm.${owner.isOwner ? ' Hãy thêm câu hỏi ở phần "Quản lý câu hỏi" bên dưới.' : ''}</p>`;
      return;
    }
    if (qFinished) { renderQuizResult(); return; }
    const item = effectiveQuiz[qIndex];
    const answered = qAnswers[qIndex] !== null && qAnswers[qIndex] !== undefined;
    $('#quizWrap').innerHTML = `
      <div class="quiz-progress">Câu ${qIndex + 1}/${total}</div>
      <div class="quiz-question">${escapeHtml(item.q)}</div>
      <div class="quiz-options" id="quizOptions"></div>
      <div class="quiz-explain ${answered ? 'show' : ''}" id="quizExplain">${escapeHtml(item.explain || '')}</div>
      <button class="btn primary block" id="quizNextBtn" style="display:${answered ? 'flex' : 'none'};">${qIndex === total - 1 ? 'Xem kết quả' : 'Câu tiếp →'}</button>
    `;
    const optWrap = $('#quizOptions');
    item.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = 'quiz-option';
      b.textContent = opt;
      if (answered) {
        b.disabled = true;
        if (i === item.correct) b.classList.add('correct');
        else if (i === qAnswers[qIndex]) b.classList.add('wrong');
      }
      b.addEventListener('click', () => {
        if (qAnswers[qIndex] !== null && qAnswers[qIndex] !== undefined) return;
        qAnswers[qIndex] = i;
        renderQuiz();
      });
      optWrap.appendChild(b);
    });
    if (answered) {
      $('#quizNextBtn').addEventListener('click', () => {
        if (qIndex < total - 1) { qIndex++; renderQuiz(); }
        else { qFinished = true; renderQuiz(); }
      });
    }
  }

  function renderQuizResult() {
    const total = effectiveQuiz.length;
    let correctCount = 0;
    const reviewHtml = effectiveQuiz.map((item, i) => {
      const isOk = qAnswers[i] === item.correct;
      if (isOk) correctCount++;
      return `
        <div class="quiz-review-item ${isOk ? 'ok' : 'bad'}">
          <div class="qi-q">${i + 1}. ${escapeHtml(item.q)}</div>
          <div>Đáp án đúng: ${escapeHtml(item.options[item.correct])}</div>
          <div class="qi-status">${isOk ? '✓ Bạn trả lời đúng' : '✗ Bạn chọn: ' + (qAnswers[i] != null ? escapeHtml(item.options[qAnswers[i]]) : '(chưa trả lời)')}</div>
        </div>
      `;
    }).join('');
    const percent = Math.round((correctCount / total) * 100);
    const prev = getChapterProgress(chapter.id);
    const best = Math.max(prev.quizBestPercent || 0, percent);
    setChapterProgress(chapter.id, { quizBestPercent: best });
    refreshDots();

    $('#quizWrap').innerHTML = `
      <div class="quiz-result">
        <div class="qr-score">${percent}%</div>
        <div class="qr-label">${correctCount}/${total} câu đúng ${percent >= QUIZ_PASS_PERCENT ? '— Đạt ✅' : '— Cần ≥ ' + QUIZ_PASS_PERCENT + '% để hoàn thành chương'}</div>
      </div>
      ${reviewHtml}
      <button class="btn primary block" id="quizRetryBtn" style="margin-top:6px;">Làm lại</button>
    `;
    $('#quizRetryBtn').addEventListener('click', () => {
      qIndex = 0; qAnswers = new Array(total).fill(null); qFinished = false; renderQuiz();
    });
  }

  async function reloadEffectiveQuiz() {
    try { customQuizCache = owner.uid ? await getCustomQuiz(owner.uid, chapter.id) : []; } catch (e) { customQuizCache = []; }
    effectiveQuiz = chapter.quiz.concat(customQuizCache);
    qIndex = 0;
    qAnswers = new Array(effectiveQuiz.length).fill(null);
    qFinished = false;
  }

  // ---------- Quản lý câu hỏi trắc nghiệm (giáo viên) ----------
  function renderQuizManager() {
    const box = $('#quizManagerBody');
    const builtInHtml = chapter.quiz.length ? `
      <div class="hint" style="margin-bottom:8px;font-weight:700;">Câu hỏi có sẵn trong app (${chapter.quiz.length}) — không sửa được:</div>
      ${chapter.quiz.map((item, i) => `<div class="hint" style="margin-bottom:4px;">${i + 1}. ${escapeHtml(item.q)}</div>`).join('')}
    ` : '';
    const customHtml = customQuizCache.length ? `
      <div class="hint" style="margin:14px 0 8px;font-weight:700;">Câu hỏi bạn tự thêm (${customQuizCache.length}):</div>
      ${customQuizCache.map((item) => `
        <div class="quiz-review-item" style="text-align:left;">
          <div class="qi-q">${escapeHtml(item.q)}</div>
          <div class="hint">Đúng: ${escapeHtml(item.options[item.correct])}</div>
          <div class="hint"><a href="#" class="edit-custom-quiz" data-id="${item.id}">Sửa</a> · <a href="#" class="delete-custom-quiz" data-id="${item.id}">Xoá</a></div>
        </div>
      `).join('')}
    ` : '<div class="hint" style="margin-top:14px;">Chưa có câu hỏi tự thêm nào.</div>';

    box.innerHTML = builtInHtml + customHtml;

    $$('.delete-custom-quiz', box).forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        await deleteCustomQuiz(a.dataset.id);
        await reloadEffectiveQuiz();
        renderQuizManager();
        renderQuiz();
      });
    });
    $$('.edit-custom-quiz', box).forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const item = customQuizCache.find((it) => it.id === a.dataset.id);
        if (item) openQuizForm(item);
      });
    });
  }

  function openQuizForm(existing) {
    const box = $('#quizForm');
    box.style.display = 'block';
    $('#quizFormQ').value = existing ? existing.q : '';
    [0, 1, 2, 3].forEach((i) => { $('#quizFormOpt' + i).value = existing ? existing.options[i] : ''; });
    $$('input[name="quizFormCorrect"]').forEach((r, i) => { r.checked = existing ? existing.correct === i : i === 0; });
    $('#quizFormExplain').value = existing ? (existing.explain || '') : '';
    box.dataset.editId = existing ? existing.id : '';
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function initQuizManager() {
    if (!owner.isOwner) return;
    $('#quizManagerSection').style.display = 'block';
    $('#quizManagerToggle').addEventListener('click', () => {
      const body = $('#quizManagerBody');
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      $('#quizFormWrap').style.display = open ? 'none' : 'block';
      $('#quizManagerToggle').textContent = open ? '⚙️ Quản lý câu hỏi trắc nghiệm' : '⚙️ Ẩn quản lý câu hỏi';
    });

    $('#quizFormAddBtn').addEventListener('click', () => openQuizForm(null));
    $('#quizFormCancel').addEventListener('click', () => { $('#quizForm').style.display = 'none'; });
    $('#quizFormSave').addEventListener('click', async () => {
      const q = $('#quizFormQ').value.trim();
      const options = [0, 1, 2, 3].map((i) => $('#quizFormOpt' + i).value.trim());
      const correctRadio = $$('input[name="quizFormCorrect"]').find((r) => r.checked);
      const correct = correctRadio ? parseInt(correctRadio.value, 10) : 0;
      const explain = $('#quizFormExplain').value.trim();
      if (!q || options.some((o) => !o)) return;
      const editId = $('#quizForm').dataset.editId;
      try {
        if (editId) {
          await updateCustomQuiz(editId, { q, options, correct, explain });
        } else {
          await addCustomQuiz(chapter.id, { q, options, correct, explain });
        }
        $('#quizForm').style.display = 'none';
        await reloadEffectiveQuiz();
        renderQuizManager();
        renderQuiz();
      } catch (e) {
        alert('Không lưu được: ' + e.message);
      }
    });

    $('#quizBulkBtn').addEventListener('click', () => $('#quizBulkFileInput').click());
    $('#quizBulkFileInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const box = $('#quizBulkResult');
      box.innerHTML = `<div class="result-box show">⏳ Đang xử lý "${escapeHtml(file.name)}"...</div>`;
      try {
        const text = await file.text();
        const questions = parseQuizTemplate(text);
        await addCustomQuizBatch(chapter.id, questions);
        box.innerHTML = `<div class="result-box show">✓ Đã nạp ${questions.length} câu hỏi.</div>`;
        await reloadEffectiveQuiz();
        renderQuizManager();
        renderQuiz();
      } catch (err) {
        box.innerHTML = `<div class="result-box show error">⚠️ ${escapeHtml(err.message)}</div>`;
      }
    });

    $('#quizTemplateBtn').addEventListener('click', () => downloadQuizTemplateCSV());
    $('#quizExcelBtn').addEventListener('click', () => $('#quizExcelFileInput').click());
    $('#quizExcelFileInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const box = $('#quizExcelResult');
      box.innerHTML = `<div class="result-box show">⏳ Đang xử lý "${escapeHtml(file.name)}"...</div>`;
      try {
        const questions = await parseQuizExcelFile(file);
        await addCustomQuizBatch(chapter.id, questions);
        box.innerHTML = `<div class="result-box show">✓ Đã nạp ${questions.length} câu hỏi.</div>`;
        await reloadEffectiveQuiz();
        renderQuizManager();
        renderQuiz();
      } catch (err) {
        const msg = escapeHtml(err.message).replace(/\n/g, '<br>');
        box.innerHTML = `<div class="result-box show error">⚠️ ${msg}</div>`;
      }
    });
  }

  async function init() {
    owner = isFirebaseConfigured() ? await resolveContentOwner() : { uid: null, isOwner: false };

    initHeaderEdit();
    renderLessons();
    renderFlash();

    // 3 lượt đọc Firestore độc lập (tiêu đề chương, bài giảng tự thêm, câu hỏi tự thêm) — chạy
    // CÙNG LÚC thay vì chờ lần lượt (trước đây mỗi lượt là 1 round-trip mạng nối tiếp nhau, cộng
    // dồn lại rất chậm khi mở 1 chương).
    await Promise.all([renderHeader(), renderCustomLessons(), reloadEffectiveQuiz()]);

    if (owner.isOwner) {
      $('#manualLessonCard').style.display = 'block';
      $('#uploadCard').style.display = 'block';
      initManualLessonForm();
      initUploadControl();
    }
    renderQuiz();
    if (owner.isOwner) {
      renderQuizManager();
      initQuizManager();
    }
    refreshDots();
    initTabs(document);
  }

  init();
})();
