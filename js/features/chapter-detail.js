// Trang chi tiết 1 chương: bài giảng tóm tắt -> flashcard -> trắc nghiệm.
// Toàn bộ nội dung (kể cả nội dung mặc định có sẵn trong app) đều SỬA/ẨN được bởi giáo viên đã
// đăng nhập, gắn với chương này — đọc được bởi bất kỳ ai (kể cả học sinh trong nhóm của giáo viên
// đó), nhưng chỉ chính giáo viên đó mới sửa được (xem firebase/firestore.rules).
//
// Cách lưu chỉnh sửa nội dung mặc định: teachers/{uid}/chapterMeta/{chapterId} có 3 field dạng
// "map theo chỉ số" — lessonOverrides / flashcardOverrides / quizOverrides — key là chỉ số (index)
// của mục trong mảng mặc định (chapter.lessons / chapter.flashcards / chapter.quiz):
//   - Không có key đó            -> dùng nguyên bản mặc định.
//   - Giá trị là object nội dung -> đã sửa, dùng nội dung này thay cho mặc định.
//   - Giá trị là null            -> đã ẩn (không hiện mục này nữa).
// Nội dung TỰ THÊM (không có trong app) vẫn lưu riêng như cũ: customLessons / customQuiz /
// customFlashcards.

(async function () {
  const params = new URLSearchParams(location.search);
  const chapterId = params.get('id');
  const found = findChapterAnywhere(chapterId);

  // Không có trong chương trình mặc định (lớp 6-12) — có thể là chương thuộc 1 chương trình đào
  // tạo riêng do giáo viên tự tạo (xem programs-data.js), tra tiếp trong Firestore trước khi báo
  // "không tìm thấy".
  let chapter = found ? found.chapter : null;
  if (!chapter && isFirebaseConfigured() && typeof findProgramChapter === 'function') {
    try { chapter = await findProgramChapter(chapterId); } catch (e) { chapter = null; }
  }

  if (!chapter) {
    $('main').innerHTML = `
      <div class="card">
        <h2>Không tìm thấy chương</h2>
        <p class="hint">Chương bạn tìm không tồn tại hoặc đã bị xoá.</p>
        <a class="btn primary" href="hoc-theo-chuong.html">← Quay lại danh sách chương</a>
      </div>
    `;
    return;
  }

  let owner = { uid: null, isOwner: false };
  let chapterMeta = {};
  let customLessonsCache = [];
  let customQuizCache = [];
  let customFlashcardsCache = [];
  let effectiveQuiz = [];

  function refreshDots() {
    const p = getChapterProgress(chapter.id);
    $('#dotLesson').classList.toggle('done', p.lessonViewed);
    $('#dotFlash').classList.toggle('done', p.flashcardsViewed);
    $('#dotQuiz').classList.toggle('done', p.quizBestPercent >= QUIZ_PASS_PERCENT);
  }

  // Gộp mảng nội dung mặc định với bảng "overrides" (sửa/ẩn theo chỉ số) thành 1 danh sách.
  function mergeBuiltinWithOverrides(builtinArray, overridesMap) {
    const overrides = overridesMap || {};
    const result = [];
    builtinArray.forEach((item, i) => {
      const key = String(i);
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        const ov = overrides[key];
        if (ov === null) return; // đã ẩn
        result.push(Object.assign({ kind: 'builtin', index: i, edited: true }, ov));
      } else {
        result.push(Object.assign({ kind: 'builtin', index: i, edited: false }, item));
      }
    });
    return result;
  }

  function getAllLessons() {
    return mergeBuiltinWithOverrides(chapter.lessons, chapterMeta.lessonOverrides)
      .concat(customLessonsCache.map((it) => Object.assign({ kind: 'custom' }, it)));
  }
  function getAllFlashcards() {
    return mergeBuiltinWithOverrides(chapter.flashcards, chapterMeta.flashcardOverrides)
      .concat(customFlashcardsCache.map((it) => Object.assign({ kind: 'custom' }, it)));
  }
  function getAllQuizItems() {
    return mergeBuiltinWithOverrides(chapter.quiz, chapterMeta.quizOverrides)
      .concat(customQuizCache.map((it) => Object.assign({ kind: 'custom' }, it)));
  }

  // ---------- Tiêu đề / mô tả chương ----------
  function renderHeader() {
    const title = chapterMeta.title || chapter.title;
    const desc = chapterMeta.description || chapter.description;
    document.title = title + ' — Trợ Lý Giáo Viên Hoá Học';
    $('#chIcon').textContent = chapter.icon;
    $('#chTitle').textContent = title;
    $('#chDesc').textContent = desc;
    $('#chEditForm').style.display = 'none';
    $('#chEditTitle').value = title;
    $('#chEditDesc').value = desc;
    $('#chEditBtn').style.display = owner.isOwner ? 'inline-flex' : 'none';
    const hint = $('#chSignInHint');
    if (owner.isOwner || !isFirebaseConfigured()) {
      hint.style.display = 'none';
    } else if (getCurrentTeacher() && (typeof getRole === 'function') && getRole() === 'student') {
      // Đã đăng nhập giáo viên nhưng đang xem thử ở vai trò Học sinh — không phải chưa đăng nhập.
      hint.href = '../index.html';
      hint.textContent = '👁️ Đang xem thử vai trò Học sinh — đổi lại vai trò Giáo viên để sửa';
      hint.style.display = 'inline';
    } else {
      hint.href = 'ket-noi-dong-bo.html';
      hint.textContent = '🔒 Đăng nhập giáo viên để sửa';
      hint.style.display = 'inline';
    }
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
        chapterMeta.title = title;
        chapterMeta.description = description;
        renderHeader();
      } catch (e) {
        alert('Không lưu được: ' + e.message);
      }
    });
  }

  // ---------- Bài giảng (mặc định + tự thêm, gộp chung 1 danh sách) ----------
  function renderAllLessons() {
    const box = $('#lessonContent');
    const items = getAllLessons();
    if (!items.length) {
      box.innerHTML = `
        <div class="card">
          <p class="hint">📝 Chương này chưa có bài giảng${owner.isOwner ? ' — viết bài giảng đầu tiên ở bên dưới.' : '.'}</p>
        </div>
      `;
    } else {
      box.innerHTML = items.map((l) => `
        <div class="lesson-block">
          <h3>${escapeHtml(l.title)}</h3>
          <ul>${l.points.map((pt) => `<li>${escapeHtml(pt)}</li>`).join('')}</ul>
          ${owner.isOwner ? `
            <div class="hint" style="margin-top:8px;">
              ${l.kind === 'builtin' ? (l.edited ? 'Đã sửa' : 'Có sẵn trong app') : 'Tự thêm'}
              · <a href="#" class="lesson-edit" data-kind="${l.kind}" data-key="${l.kind === 'builtin' ? l.index : l.id}">Sửa</a>
              · <a href="#" class="lesson-delete" data-kind="${l.kind}" data-key="${l.kind === 'builtin' ? l.index : l.id}">${l.kind === 'builtin' ? 'Ẩn' : 'Xoá'}</a>
              ${l.kind === 'builtin' && l.edited ? ` · <a href="#" class="lesson-restore" data-key="${l.index}">Khôi phục mặc định</a>` : ''}
            </div>
          ` : ''}
        </div>
      `).join('');
    }
    setChapterProgress(chapter.id, { lessonViewed: true });
    refreshDots();
    if (owner.isOwner) wireLessonActions(box);
  }

  function wireLessonActions(box) {
    $$('.lesson-edit', box).forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const kind = a.dataset.kind;
        if (kind === 'custom') {
          const item = customLessonsCache.find((it) => it.id === a.dataset.key);
          if (item) openLessonForm({ kind: 'custom', id: item.id, title: item.title, points: item.points });
        } else {
          const item = getAllLessons().find((it) => it.kind === 'builtin' && String(it.index) === a.dataset.key);
          if (item) openLessonForm({ kind: 'builtin', index: item.index, title: item.title, points: item.points });
        }
      });
    });
    $$('.lesson-delete', box).forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        const kind = a.dataset.kind, key = a.dataset.key;
        try {
          if (kind === 'custom') {
            if (!confirm('Xoá bài giảng này?')) return;
            await deleteCustomLesson(key);
            customLessonsCache = customLessonsCache.filter((it) => it.id !== key);
          } else {
            if (!confirm('Ẩn bài giảng mặc định này khỏi chương? (có thể khôi phục lại sau)')) return;
            await setChapterMeta(chapter.id, { ['lessonOverrides.' + key]: null });
            chapterMeta.lessonOverrides = Object.assign({}, chapterMeta.lessonOverrides, { [key]: null });
          }
          renderAllLessons();
        } catch (err) {
          alert('Không thực hiện được: ' + err.message);
        }
      });
    });
    $$('.lesson-restore', box).forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        const key = a.dataset.key;
        try {
          await deleteChapterMetaField(chapter.id, 'lessonOverrides.' + key);
          if (chapterMeta.lessonOverrides) delete chapterMeta.lessonOverrides[key];
          renderAllLessons();
        } catch (err) {
          alert('Không khôi phục được: ' + err.message);
        }
      });
    });
  }

  function openLessonForm(existing) {
    const box = $('#manualLessonForm');
    box.style.display = 'block';
    $('#manualLessonTitle').value = existing ? existing.title : '';
    $('#manualLessonPoints').value = existing ? existing.points.join('\n') : '';
    box.dataset.kind = existing ? existing.kind : 'custom';
    box.dataset.id = (existing && existing.kind === 'custom') ? existing.id : '';
    box.dataset.index = (existing && existing.kind === 'builtin') ? String(existing.index) : '';
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function initManualLessonForm() {
    if (!owner.isOwner) return;
    $('#manualLessonAddBtn').addEventListener('click', () => openLessonForm(null));
    $('#manualLessonCancel').addEventListener('click', () => { $('#manualLessonForm').style.display = 'none'; });
    $('#manualLessonSave').addEventListener('click', async () => {
      const title = $('#manualLessonTitle').value.trim();
      const points = $('#manualLessonPoints').value.split('\n').map((s) => s.trim()).filter(Boolean);
      if (!title || !points.length) return;
      const box = $('#manualLessonForm');
      const kind = box.dataset.kind;
      try {
        if (kind === 'builtin') {
          const index = box.dataset.index;
          await setChapterMeta(chapter.id, { ['lessonOverrides.' + index]: { title, points } });
          chapterMeta.lessonOverrides = Object.assign({}, chapterMeta.lessonOverrides, { [index]: { title, points } });
        } else if (box.dataset.id) {
          await updateCustomLesson(box.dataset.id, { title, points });
          const it = customLessonsCache.find((x) => x.id === box.dataset.id);
          if (it) { it.title = title; it.points = points; }
        } else {
          const id = await addCustomLesson(chapter.id, { title, points, sourceFileName: null });
          customLessonsCache.push({ id, chapterId: chapter.id, title, points, sourceFileName: null });
        }
        box.style.display = 'none';
        renderAllLessons();
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
        await addCustomLessonBatch(chapter.id, chosen.map((sec) =>
          ({ title: sec.title, points: sec.points, sourceFileName: fileName })
        ));
        customLessonsCache = await getCustomLessons(owner.uid, chapter.id);
        box.innerHTML = `<div class="result-box show">✓ Đã lưu vào chương.</div>`;
        renderAllLessons();
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

  // ---------- Flashcard: xem (học) ----------
  let fcIndex = 0;
  let fcFlipped = false;
  const fcViewed = new Set();

  function renderFlash() {
    const cards = getAllFlashcards();
    const total = cards.length;
    if (!total) {
      $('#flashWrap').innerHTML = `<p class="hint">📝 Chương này chưa có flashcard${owner.isOwner ? ' — thêm ở phần quản lý flashcard bên dưới.' : '.'}</p>`;
      return;
    }
    if (fcIndex >= total) fcIndex = 0;
    const card = cards[fcIndex];
    fcViewed.add(fcIndex);
    if (fcViewed.size === total) {
      setChapterProgress(chapter.id, { flashcardsViewed: true });
      refreshDots();
    }
    $('#flashWrap').innerHTML = `
      <div class="flash-progress">Thẻ ${fcIndex + 1}/${total} · đã xem ${fcViewed.size}/${total}</div>
      <div class="flash-card ${fcFlipped ? 'back' : ''}" id="flashCardEl">${escapeHtml(fcFlipped ? card.back : card.front)}</div>
      <div class="flash-nav">
        <button class="btn" id="fcPrev" ${fcIndex === 0 ? 'disabled' : ''}>← Trước</button>
        <button class="btn primary" id="fcNext" ${fcIndex === total - 1 ? 'disabled' : ''}>Tiếp →</button>
      </div>
    `;
    $('#flashCardEl').addEventListener('click', () => { fcFlipped = !fcFlipped; renderFlash(); });
    $('#fcPrev').addEventListener('click', () => { if (fcIndex > 0) { fcIndex--; fcFlipped = false; renderFlash(); } });
    $('#fcNext').addEventListener('click', () => { if (fcIndex < total - 1) { fcIndex++; fcFlipped = false; renderFlash(); } });
  }

  // ---------- Flashcard: quản lý (giáo viên) ----------
  function renderFlashManager() {
    const box = $('#flashManagerBody');
    const cards = getAllFlashcards();
    if (!cards.length) {
      box.innerHTML = '<div class="hint" style="margin-top:14px;">Chưa có flashcard nào.</div>';
    } else {
      box.innerHTML = cards.map((c) => `
        <div class="quiz-review-item" style="text-align:left;">
          <div class="qi-q">${escapeHtml(c.front)}</div>
          <div class="hint">${escapeHtml(c.back)}</div>
          <div class="hint" style="margin-top:4px;">
            ${c.kind === 'builtin' ? (c.edited ? 'Đã sửa' : 'Có sẵn trong app') : 'Tự thêm'}
            · <a href="#" class="flash-edit" data-kind="${c.kind}" data-key="${c.kind === 'builtin' ? c.index : c.id}">Sửa</a>
            · <a href="#" class="flash-delete" data-kind="${c.kind}" data-key="${c.kind === 'builtin' ? c.index : c.id}">${c.kind === 'builtin' ? 'Ẩn' : 'Xoá'}</a>
            ${c.kind === 'builtin' && c.edited ? ` · <a href="#" class="flash-restore" data-key="${c.index}">Khôi phục mặc định</a>` : ''}
          </div>
        </div>
      `).join('');
    }
    wireFlashActions(box);
  }

  function wireFlashActions(box) {
    $$('.flash-edit', box).forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const kind = a.dataset.kind;
        if (kind === 'custom') {
          const item = customFlashcardsCache.find((it) => it.id === a.dataset.key);
          if (item) openFlashForm({ kind: 'custom', id: item.id, front: item.front, back: item.back });
        } else {
          const item = getAllFlashcards().find((it) => it.kind === 'builtin' && String(it.index) === a.dataset.key);
          if (item) openFlashForm({ kind: 'builtin', index: item.index, front: item.front, back: item.back });
        }
      });
    });
    $$('.flash-delete', box).forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        const kind = a.dataset.kind, key = a.dataset.key;
        try {
          if (kind === 'custom') {
            if (!confirm('Xoá flashcard này?')) return;
            await deleteCustomFlashcard(key);
            customFlashcardsCache = customFlashcardsCache.filter((it) => it.id !== key);
          } else {
            if (!confirm('Ẩn flashcard mặc định này khỏi chương? (có thể khôi phục lại sau)')) return;
            await setChapterMeta(chapter.id, { ['flashcardOverrides.' + key]: null });
            chapterMeta.flashcardOverrides = Object.assign({}, chapterMeta.flashcardOverrides, { [key]: null });
          }
          fcIndex = 0; fcFlipped = false; fcViewed.clear();
          renderFlashManager();
          renderFlash();
        } catch (err) {
          alert('Không thực hiện được: ' + err.message);
        }
      });
    });
    $$('.flash-restore', box).forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        const key = a.dataset.key;
        try {
          await deleteChapterMetaField(chapter.id, 'flashcardOverrides.' + key);
          if (chapterMeta.flashcardOverrides) delete chapterMeta.flashcardOverrides[key];
          renderFlashManager();
          renderFlash();
        } catch (err) {
          alert('Không khôi phục được: ' + err.message);
        }
      });
    });
  }

  function openFlashForm(existing) {
    const box = $('#flashForm');
    box.style.display = 'block';
    $('#flashFormFront').value = existing ? existing.front : '';
    $('#flashFormBack').value = existing ? existing.back : '';
    box.dataset.kind = existing ? existing.kind : 'custom';
    box.dataset.id = (existing && existing.kind === 'custom') ? existing.id : '';
    box.dataset.index = (existing && existing.kind === 'builtin') ? String(existing.index) : '';
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function initFlashManager() {
    if (!owner.isOwner) return;
    $('#flashManagerSection').style.display = 'block';
    $('#flashManagerToggle').addEventListener('click', () => {
      const wrap = $('#flashFormWrap');
      const open = wrap.style.display !== 'none';
      wrap.style.display = open ? 'none' : 'block';
      $('#flashManagerToggle').textContent = open ? '⚙️ Quản lý flashcard' : '⚙️ Ẩn quản lý flashcard';
    });
    $('#flashFormAddBtn').addEventListener('click', () => openFlashForm(null));
    $('#flashFormCancel').addEventListener('click', () => { $('#flashForm').style.display = 'none'; });
    $('#flashFormSave').addEventListener('click', async () => {
      const front = $('#flashFormFront').value.trim();
      const back = $('#flashFormBack').value.trim();
      if (!front || !back) return;
      const box = $('#flashForm');
      const kind = box.dataset.kind;
      try {
        if (kind === 'builtin') {
          const index = box.dataset.index;
          await setChapterMeta(chapter.id, { ['flashcardOverrides.' + index]: { front, back } });
          chapterMeta.flashcardOverrides = Object.assign({}, chapterMeta.flashcardOverrides, { [index]: { front, back } });
        } else if (box.dataset.id) {
          await updateCustomFlashcard(box.dataset.id, { front, back });
          const it = customFlashcardsCache.find((x) => x.id === box.dataset.id);
          if (it) { it.front = front; it.back = back; }
        } else {
          const id = await addCustomFlashcard(chapter.id, { front, back });
          customFlashcardsCache.push({ id, chapterId: chapter.id, front, back });
        }
        box.style.display = 'none';
        renderFlashManager();
        renderFlash();
      } catch (e) {
        alert('Không lưu được: ' + e.message);
      }
    });
  }

  // ---------- Tự kiểm tra: học sinh tự chọn số câu + thời gian, chấm theo thang điểm 10 ----------
  // Khác với phần "Ôn tập" bên dưới (làm hết câu hỏi, thấy đáp án ngay từng câu): đây mô phỏng 1
  // bài kiểm tra thật — rút ngẫu nhiên N câu, có đồng hồ đếm ngược, không lộ đáp án cho tới khi nộp.
  const SELF_TEST_COUNT_OPTIONS = [5, 10, 15, 20, 25, 30];
  let stQuestions = [];
  let stIndex = 0;
  let stAnswers = [];
  let stFinished = false;
  let stDeadline = 0;
  let stTimerId = null;

  function shuffleForSelfTest(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function formatCountdown(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function initSelfTest() {
    // Không tự hiện #selfTestCard nữa — chỉ chuẩn bị dữ liệu/wiring, còn hiển thị do menu Trắc
    // nghiệm điều khiển (xem initQuizMenu) khi học sinh bấm "🎯 Kiểm tra thử".
    const total = effectiveQuiz.length;
    if (total < 5) {
      $('#selfTestSetup').style.display = 'none';
      $('#selfTestNotEnough').style.display = 'block';
      return;
    }
    const validCounts = SELF_TEST_COUNT_OPTIONS.filter((n) => n <= total);
    if (!validCounts.includes(total)) validCounts.push(total);
    const defaultCount = validCounts.includes(10) ? 10 : validCounts[validCounts.length - 1];
    $('#selfTestCount').innerHTML = validCounts.map((n) =>
      `<option value="${n}" ${n === defaultCount ? 'selected' : ''}>${n} câu</option>`
    ).join('');
    $('#selfTestStartBtn').addEventListener('click', startSelfTest);
  }

  function startSelfTest() {
    const count = parseInt($('#selfTestCount').value, 10);
    const durationMin = parseInt($('#selfTestDuration').value, 10);
    stQuestions = shuffleForSelfTest(effectiveQuiz).slice(0, count);
    stIndex = 0;
    stAnswers = new Array(stQuestions.length).fill(null);
    stFinished = false;
    stDeadline = Date.now() + durationMin * 60 * 1000;
    $('#selfTestSetup').style.display = 'none';
    $('#selfTestRunning').style.display = 'block';
    clearInterval(stTimerId);
    stTimerId = setInterval(() => {
      if (stFinished) { clearInterval(stTimerId); return; }
      const remaining = stDeadline - Date.now();
      const el = $('#selfTestTimer');
      if (el) el.textContent = formatCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(stTimerId);
        stFinished = true;
        renderSelfTestResult();
      }
    }, 1000);
    renderSelfTestQuestion();
  }

  function renderSelfTestQuestion() {
    if (stFinished) { renderSelfTestResult(); return; }
    const total = stQuestions.length;
    const item = stQuestions[stIndex];
    const answered = stAnswers[stIndex] !== null && stAnswers[stIndex] !== undefined;
    $('#selfTestRunning').innerHTML = `
      <div class="quiz-progress" style="display:flex;justify-content:space-between;">
        <span>Câu ${stIndex + 1}/${total}</span>
        <span id="selfTestTimer" style="font-weight:700;color:var(--brand);">${formatCountdown(stDeadline - Date.now())}</span>
      </div>
      <div class="quiz-question">${escapeHtml(item.q)}</div>
      <div class="quiz-options" id="selfTestOptions"></div>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn" id="stPrevBtn" ${stIndex === 0 ? 'disabled' : ''}>← Câu trước</button>
        ${stIndex === total - 1
          ? `<button class="btn primary" id="stSubmitBtn" style="flex:1;">Nộp bài</button>`
          : `<button class="btn primary" id="stNextBtn" style="flex:1;">Câu tiếp →</button>`}
      </div>
    `;
    const optWrap = $('#selfTestOptions');
    item.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = 'quiz-option' + (answered && i === stAnswers[stIndex] ? ' selected' : '');
      b.textContent = opt;
      b.addEventListener('click', () => { stAnswers[stIndex] = i; renderSelfTestQuestion(); });
      optWrap.appendChild(b);
    });
    $('#stPrevBtn').addEventListener('click', () => { if (stIndex > 0) { stIndex--; renderSelfTestQuestion(); } });
    const nextBtn = $('#stNextBtn');
    if (nextBtn) nextBtn.addEventListener('click', () => { if (stIndex < total - 1) { stIndex++; renderSelfTestQuestion(); } });
    const submitBtn = $('#stSubmitBtn');
    if (submitBtn) submitBtn.addEventListener('click', () => {
      const unanswered = stAnswers.filter((a) => a === null || a === undefined).length;
      if (unanswered > 0 && !confirm(`Còn ${unanswered} câu chưa trả lời. Nộp bài luôn?`)) return;
      stFinished = true;
      clearInterval(stTimerId);
      renderSelfTestResult();
    });
  }

  function renderSelfTestResult() {
    clearInterval(stTimerId);
    const total = stQuestions.length;
    let correctCount = 0;
    const reviewHtml = stQuestions.map((item, i) => {
      const isOk = stAnswers[i] === item.correct;
      if (isOk) correctCount++;
      return `
        <div class="quiz-review-item ${isOk ? 'ok' : 'bad'}">
          <div class="qi-q">${i + 1}. ${escapeHtml(item.q)}</div>
          <div>Đáp án đúng: ${escapeHtml(item.options[item.correct])}</div>
          <div class="qi-status">${isOk ? '✓ Bạn trả lời đúng' : '✗ Bạn chọn: ' + (stAnswers[i] != null ? escapeHtml(item.options[stAnswers[i]]) : '(chưa trả lời)')}</div>
        </div>
      `;
    }).join('');
    const score10 = Math.round((correctCount / total) * 100) / 10;
    const percent = Math.round((correctCount / total) * 100);

    const prev = getChapterProgress(chapter.id);
    const best = Math.max(prev.quizBestPercent || 0, percent);
    setChapterProgress(chapter.id, { quizBestPercent: best });
    refreshDots();

    $('#selfTestRunning').innerHTML = `
      <div class="quiz-result">
        <div class="qr-score">${score10.toFixed(1)} điểm</div>
        <div class="qr-label">${correctCount}/${total} câu đúng (${percent}%)</div>
      </div>
      ${reviewHtml}
      <button class="btn primary block" id="stRetryBtn" style="margin-top:6px;">Tự kiểm tra lại (đề khác)</button>
    `;
    $('#stRetryBtn').addEventListener('click', () => {
      $('#selfTestRunning').style.display = 'none';
      $('#selfTestSetup').style.display = 'block';
    });
  }

  // ---------- Trắc nghiệm: ôn tập (làm hết câu hỏi, thấy đáp án ngay từng câu) ----------
  let qIndex = 0;
  let qAnswers = [];
  let qFinished = false;

  function rebuildEffectiveQuiz() {
    effectiveQuiz = getAllQuizItems();
    qIndex = 0;
    qAnswers = new Array(effectiveQuiz.length).fill(null);
    qFinished = false;
  }

  function renderQuiz() {
    const total = effectiveQuiz.length;
    if (!total) {
      $('#quizWrap').innerHTML = '<p class="hint">📝 Chương này chưa có câu hỏi trắc nghiệm.</p>';
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

  // ---------- Quản lý câu hỏi trắc nghiệm (mặc định + tự thêm, gộp chung) ----------
  function renderQuizManager() {
    const box = $('#quizManagerBody');
    const items = getAllQuizItems();
    box.innerHTML = items.length ? items.map((item) => `
      <div class="quiz-review-item" style="text-align:left;">
        <div class="qi-q">${escapeHtml(item.q)}</div>
        <div class="hint">Đúng: ${escapeHtml(item.options[item.correct])}</div>
        <div class="hint" style="margin-top:4px;">
          ${item.kind === 'builtin' ? (item.edited ? 'Đã sửa' : 'Có sẵn trong app') : 'Tự thêm'}
          · <a href="#" class="quiz-edit" data-kind="${item.kind}" data-key="${item.kind === 'builtin' ? item.index : item.id}">Sửa</a>
          · <a href="#" class="quiz-delete" data-kind="${item.kind}" data-key="${item.kind === 'builtin' ? item.index : item.id}">${item.kind === 'builtin' ? 'Ẩn' : 'Xoá'}</a>
          ${item.kind === 'builtin' && item.edited ? ` · <a href="#" class="quiz-restore" data-key="${item.index}">Khôi phục mặc định</a>` : ''}
        </div>
      </div>
    `).join('') : '<div class="hint">Chưa có câu hỏi nào.</div>';

    $$('.quiz-edit', box).forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const kind = a.dataset.kind;
        if (kind === 'custom') {
          const item = customQuizCache.find((it) => it.id === a.dataset.key);
          if (item) openQuizForm({ kind: 'custom', id: item.id, q: item.q, options: item.options, correct: item.correct, explain: item.explain });
        } else {
          const item = getAllQuizItems().find((it) => it.kind === 'builtin' && String(it.index) === a.dataset.key);
          if (item) openQuizForm({ kind: 'builtin', index: item.index, q: item.q, options: item.options, correct: item.correct, explain: item.explain });
        }
      });
    });
    $$('.quiz-delete', box).forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        const kind = a.dataset.kind, key = a.dataset.key;
        try {
          if (kind === 'custom') {
            if (!confirm('Xoá câu hỏi này?')) return;
            await deleteCustomQuiz(key);
            customQuizCache = customQuizCache.filter((it) => it.id !== key);
          } else {
            if (!confirm('Ẩn câu hỏi mặc định này khỏi chương? (có thể khôi phục lại sau)')) return;
            await setChapterMeta(chapter.id, { ['quizOverrides.' + key]: null });
            chapterMeta.quizOverrides = Object.assign({}, chapterMeta.quizOverrides, { [key]: null });
          }
          rebuildEffectiveQuiz();
          renderQuizManager();
          renderQuiz();
        } catch (err) {
          alert('Không thực hiện được: ' + err.message);
        }
      });
    });
    $$('.quiz-restore', box).forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        const key = a.dataset.key;
        try {
          await deleteChapterMetaField(chapter.id, 'quizOverrides.' + key);
          if (chapterMeta.quizOverrides) delete chapterMeta.quizOverrides[key];
          rebuildEffectiveQuiz();
          renderQuizManager();
          renderQuiz();
        } catch (err) {
          alert('Không khôi phục được: ' + err.message);
        }
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
    box.dataset.kind = existing ? existing.kind : 'custom';
    box.dataset.id = (existing && existing.kind === 'custom') ? existing.id : '';
    box.dataset.index = (existing && existing.kind === 'builtin') ? String(existing.index) : '';
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function initQuizManager() {
    if (!owner.isOwner) return;

    $('#quizFormAddBtn').addEventListener('click', () => openQuizForm(null));
    $('#quizFormCancel').addEventListener('click', () => { $('#quizForm').style.display = 'none'; });
    $('#quizFormSave').addEventListener('click', async () => {
      const q = $('#quizFormQ').value.trim();
      const options = [0, 1, 2, 3].map((i) => $('#quizFormOpt' + i).value.trim());
      const correctRadio = $$('input[name="quizFormCorrect"]').find((r) => r.checked);
      const correct = correctRadio ? parseInt(correctRadio.value, 10) : 0;
      const explain = $('#quizFormExplain').value.trim();
      if (!q || options.some((o) => !o)) return;
      const box = $('#quizForm');
      const kind = box.dataset.kind;
      try {
        if (kind === 'builtin') {
          const index = box.dataset.index;
          await setChapterMeta(chapter.id, { ['quizOverrides.' + index]: { q, options, correct, explain } });
          chapterMeta.quizOverrides = Object.assign({}, chapterMeta.quizOverrides, { [index]: { q, options, correct, explain } });
        } else if (box.dataset.id) {
          await updateCustomQuiz(box.dataset.id, { q, options, correct, explain });
          const it = customQuizCache.find((x) => x.id === box.dataset.id);
          if (it) { it.q = q; it.options = options; it.correct = correct; it.explain = explain; }
        } else {
          const id = await addCustomQuiz(chapter.id, { q, options, correct, explain });
          customQuizCache.push({ id, chapterId: chapter.id, q, options, correct, explain });
        }
        $('#quizForm').style.display = 'none';
        rebuildEffectiveQuiz();
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
        customQuizCache = await getCustomQuiz(owner.uid, chapter.id);
        box.innerHTML = `<div class="result-box show">✓ Đã nạp ${questions.length} câu hỏi.</div>`;
        rebuildEffectiveQuiz();
        renderQuizManager();
        renderQuiz();
        $('#quizManagerBody').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        customQuizCache = await getCustomQuiz(owner.uid, chapter.id);
        box.innerHTML = `<div class="result-box show">✓ Đã nạp ${questions.length} câu hỏi.</div>`;
        rebuildEffectiveQuiz();
        renderQuizManager();
        renderQuiz();
        $('#quizManagerBody').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) {
        const msg = escapeHtml(err.message).replace(/\n/g, '<br>');
        box.innerHTML = `<div class="result-box show error">⚠️ ${msg}</div>`;
      }
    });
  }

  // ---------- Menu tab Trắc nghiệm: bấm vào mới hiện đúng 1 khung tương ứng, có nút "Quay lại" ----------
  // Học sinh thấy 2 lối vào (Ôn tập / Kiểm tra thử); giáo viên thấy 5 thao tác quản lý câu hỏi.
  const QUIZ_SECTION_IDS = ['quizEditSection', 'quizTxtCard', 'quizExcelCard', 'selfTestCard', 'quizReviewSection'];

  function showQuizSection(sectionId) {
    $('#quizStudentMenu').style.display = 'none';
    $('#quizTeacherMenu').style.display = 'none';
    QUIZ_SECTION_IDS.forEach((id) => { $('#' + id).style.display = id === sectionId ? 'block' : 'none'; });
    $('#quizBackToMenuBtn').style.display = 'block';
  }

  function showQuizMenu() {
    $('#quizBackToMenuBtn').style.display = 'none';
    QUIZ_SECTION_IDS.forEach((id) => { $('#' + id).style.display = 'none'; });
    $('#quizStudentMenu').style.display = owner.isOwner ? 'none' : 'block';
    $('#quizTeacherMenu').style.display = owner.isOwner ? 'block' : 'none';
  }

  function initQuizMenu() {
    $('#quizMenuReviewBtn').addEventListener('click', () => showQuizSection('quizReviewSection'));
    $('#quizMenuSelfTestBtn').addEventListener('click', () => showQuizSection('selfTestCard'));
    if (owner.isOwner) {
      $('#quizMenuEditBtn').addEventListener('click', () => showQuizSection('quizEditSection'));
      $('#quizMenuManualBtn').addEventListener('click', () => { showQuizSection('quizEditSection'); openQuizForm(null); });
      $('#quizMenuTxtBtn').addEventListener('click', () => showQuizSection('quizTxtCard'));
      $('#quizMenuExcelBtn').addEventListener('click', () => showQuizSection('quizExcelCard'));
    }
    $('#quizBackToMenuBtn').addEventListener('click', showQuizMenu);
    showQuizMenu();
  }

  async function init() {
    // Xác nhận "nhóm đang xem" cache còn khớp tài khoản Google đang đăng nhập TRƯỚC khi đọc/hiện
    // tiến độ (refreshDots bên dưới) — trang này có thể là trang đầu tiên mở (VD theo link đã lưu),
    // không chắc đã qua chapter-overview.js trước đó. Đồng thời tải tiến độ đã đồng bộ từ Firestore
    // về (nếu có) để không mất tiến độ khi mở trên thiết bị mới.
    if (typeof getVerifiedMembership === 'function') {
      const membership = await getVerifiedMembership();
      if (membership && membership.studentId && typeof hydrateProgressFromServer === 'function') {
        await hydrateProgressFromServer(membership.studentId);
      }
    }

    owner = isFirebaseConfigured() ? await resolveContentOwner() : { uid: null, isOwner: false };
    initHeaderEdit();

    if (owner.uid) {
      const [meta, lessons, quiz, flashcards] = await Promise.all([
        getChapterMeta(owner.uid, chapter.id).catch(() => null),
        getCustomLessons(owner.uid, chapter.id).catch(() => []),
        getCustomQuiz(owner.uid, chapter.id).catch(() => []),
        getCustomFlashcards(owner.uid, chapter.id).catch(() => [])
      ]);
      chapterMeta = meta || {};
      customLessonsCache = lessons;
      customQuizCache = quiz;
      customFlashcardsCache = flashcards;
    }

    renderHeader();
    renderAllLessons();
    renderFlash();
    rebuildEffectiveQuiz();
    initSelfTest();
    renderQuiz();

    if (owner.isOwner) {
      $('#lessonToolbar').style.display = 'flex';
      initManualLessonForm();
      initUploadControl();
      initFlashManager();
      renderFlashManager();
      renderQuizManager();
      initQuizManager();
    }
    initQuizMenu();
    refreshDots();
    initTabs(document);
  }

  init();
})();
