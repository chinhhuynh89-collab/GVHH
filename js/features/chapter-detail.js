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

  // Nạp PDF: 1 file = 1 "Bài" theo đúng cấu trúc chương thật (Bài 1, Bài 2...), nhưng lưu Firestore vẫn
  // TÁCH RIÊNG mỗi trang thành 1 tài liệu (để không vượt hạn mức 1MiB/tài liệu — xem doc-import.js) —
  // các trang cùng 1 lần nạp đều mang chung "sourceFileName". Gộp lại ở đây thành 1 mục hiển thị DUY
  // NHẤT (tên = tên file, bỏ đuôi), nội dung là toàn bộ ảnh các trang nối theo đúng thứ tự đã lưu.
  function groupCustomLessonsByFile(items) {
    const groups = new Map();
    const singles = [];
    items.forEach((it) => {
      if (it.sourceFileName) {
        if (!groups.has(it.sourceFileName)) groups.set(it.sourceFileName, []);
        groups.get(it.sourceFileName).push(it);
      } else {
        singles.push(it);
      }
    });
    const result = singles.slice();
    groups.forEach((group, fileName) => {
      // Luôn đặt tên theo tên file (bỏ đuôi) dù chỉ 1 trang — nhất quán "1 file = 1 Bài" bất kể file đó
      // có bao nhiêu trang. Chỉ đánh dấu isGroup (ẩn "Sửa", khoá chia sẻ kho chung) khi THẬT SỰ gồm
      // NHIỀU tài liệu Firestore gộp lại — sửa/chia sẻ 1 trang duy nhất vẫn hoạt động bình thường vì
      // đó là đúng 1 tài liệu, không có rủi ro chỉ động tới 1 phần của "bài" mà tưởng là cả bài.
      result.push({
        kind: 'custom',
        isGroup: group.length > 1,
        id: group[0].id,
        groupIds: group.map((g) => g.id),
        title: fileName.replace(/\.[^.]+$/, ''),
        points: group.reduce((acc, g) => acc.concat(g.points), []),
        order: group[0].order,
        addedAt: group[0].addedAt
      });
    });
    result.sort((a, b) => {
      const ao = typeof a.order === 'number' ? a.order : Infinity;
      const bo = typeof b.order === 'number' ? b.order : Infinity;
      if (ao !== bo) return ao - bo;
      return (a.addedAt || '').localeCompare(b.addedAt || '');
    });
    return result;
  }

  // Nạp file câu hỏi (PDF/txt/Word/Excel): 1 file = 1 "Bài" giống hệt bài giảng ở trên — KHÁC 1 điểm:
  // mỗi câu hỏi vẫn cần Sửa/Xoá/chọn đáp án RIÊNG (không nối phẳng như "points" của bài giảng), nên
  // nhóm chỉ giữ nguyên mảng `groupItems` (từng câu hỏi gốc) thay vì gộp nội dung lại.
  function groupCustomQuizByFile(items) {
    const groups = new Map();
    const singles = [];
    items.forEach((it) => {
      if (it.sourceFileName) {
        if (!groups.has(it.sourceFileName)) groups.set(it.sourceFileName, []);
        groups.get(it.sourceFileName).push(it);
      } else {
        singles.push(it);
      }
    });
    const result = singles.slice();
    groups.forEach((group, fileName) => {
      result.push({
        kind: 'custom',
        isGroup: group.length > 1,
        id: group[0].id,
        groupIds: group.map((g) => g.id),
        groupItems: group,
        title: fileName.replace(/\.[^.]+$/, ''),
        order: group[0].order,
        addedAt: group[0].addedAt
      });
    });
    result.sort((a, b) => {
      const ao = typeof a.order === 'number' ? a.order : Infinity;
      const bo = typeof b.order === 'number' ? b.order : Infinity;
      if (ao !== bo) return ao - bo;
      return (a.addedAt || '').localeCompare(b.addedAt || '');
    });
    return result;
  }

  function getAllLessons() {
    return mergeBuiltinWithOverrides(chapter.lessons, chapterMeta.lessonOverrides)
      .concat(groupCustomLessonsByFile(customLessonsCache.map((it) => Object.assign({ kind: 'custom' }, it))));
  }
  function getAllFlashcards() {
    return mergeBuiltinWithOverrides(chapter.flashcards, chapterMeta.flashcardOverrides)
      .concat(customFlashcardsCache.map((it) => Object.assign({ kind: 'custom' }, it)));
  }
  // Câu hỏi builtin KHÔNG gộp theo bài (giống lesson builtin) — chỉ câu tự thêm/nạp file mới có
  // `sourceFileName` để gộp. `getAllQuizItems()` vẫn trả về DANH SÁCH PHẲNG như trước (dùng ở
  // renderQuizStats, quiz-taking, exam-creator...) — grouping CHỈ áp dụng lúc VẼ ở renderQuizManager.
  function getAllQuizItems() {
    return mergeBuiltinWithOverrides(chapter.quiz, chapterMeta.quizOverrides)
      .concat(customQuizCache.map((it) => Object.assign({ kind: 'custom' }, it)));
  }
  function getGroupedQuizItems() {
    return mergeBuiltinWithOverrides(chapter.quiz, chapterMeta.quizOverrides)
      .concat(groupCustomQuizByFile(customQuizCache.map((it) => Object.assign({ kind: 'custom' }, it))));
  }

  // ---------- Kho chung: chia sẻ/nhập bài giảng-câu hỏi-flashcard giữa các giáo viên ----------
  // Xem js/features/shared-bank.js. Chỉ áp dụng cho nội dung TỰ THÊM (kind==='custom', không phải
  // ghi đè nội dung mặc định) của chương CHÍNH KHOÁ (isCurriculumChapter) — chương thuộc chương
  // trình riêng của giáo viên không chia sẻ được vì chapterId ngẫu nhiên, không ai khác tra ra được.
  function bankShareLinkHtml(contentType, item) {
    if (item.kind !== 'custom' || !isCurriculumChapter(chapter.id)) return '';
    return item.sharedBankId
      ? ` · <a href="#" class="bank-share-toggle" data-content-type="${contentType}" data-source-id="${item.id}" data-bank-id="${item.sharedBankId}">✅ Đã chia sẻ (gỡ)</a>`
      : ` · <a href="#" class="bank-share-toggle" data-content-type="${contentType}" data-source-id="${item.id}">🌐 Chia sẻ vào kho chung</a>`;
  }

  // Xây đúng shape mà addCustomLesson/addCustomQuiz/addCustomFlashcard đang nhận — KHÔNG gồm field
  // thừa (VD options/correct với câu "Nhập đáp án") để giữ nhất quán với dữ liệu tự soạn thông thường.
  function buildBankPayload(contentType, item) {
    if (contentType === 'lesson') return { title: item.title, points: item.points, sourceFileName: item.sourceFileName || null };
    if (contentType === 'flashcard') return { front: item.front, back: item.back };
    const type = getQuestionType(item);
    if (type === 'text') return { q: item.q, type, acceptedAnswers: item.acceptedAnswers, explain: item.explain || '' };
    return { q: item.q, type, options: item.options, correct: item.correct, explain: item.explain || '' };
  }

  function wireBankShareLinks(box, contentType, cache, onChanged) {
    $$('.bank-share-toggle', box).forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        const sourceId = a.dataset.sourceId;
        const bankId = a.dataset.bankId;
        const item = cache.find((it) => it.id === sourceId);
        if (!item) return;
        try {
          if (bankId) {
            await unshareFromBank(bankId, contentType, sourceId);
            item.sharedBankId = null;
          } else {
            const newBankId = await shareToBank(contentType, sourceId, chapter.id, buildBankPayload(contentType, item));
            item.sharedBankId = newBankId;
          }
          onChanged();
        } catch (err) {
          showToast('Không thực hiện được: ' + err.message);
        }
      });
    });
  }

  function renderBankItemPreview(contentType, payload) {
    if (contentType === 'lesson') return `<strong>${escapeHtml(payload.title)}</strong><div class="hint">${payload.points.length} ý</div>`;
    if (contentType === 'flashcard') return `<strong>${escapeHtml(payload.front)}</strong><div class="hint">${escapeHtml(payload.back)}</div>`;
    return `<strong>${escapeHtml(payload.q)}</strong><div class="hint">[${QUIZ_TYPE_LABELS[getQuestionType(payload)]}] Đúng: ${escapeHtml(formatCorrectAnswerDisplay(payload))}</div>`;
  }

  // Khung DÙNG CHUNG cho cả 3 loại — tự tải danh sách đã chia sẻ CHO ĐÚNG chương này, tick chọn +
  // nhập bản sao (Promise.allSettled để báo đúng "X/Y đã nhập" nếu 1 vài mục lỗi giữa chừng), cộng
  // 1 nút "Báo cáo nội dung sai" tái dùng thẳng submitFeedback() đã có (feedback.js) — không cần xây
  // cơ chế kiểm duyệt riêng cho kho chung.
  async function renderBankChecklist(box, contentType, onImported) {
    box.innerHTML = '<p class="hint">⏳ Đang tải kho chung...</p>';
    if (!isCurriculumChapter(chapter.id)) {
      box.innerHTML = '<p class="hint">Kho chung chỉ áp dụng cho chương chính khoá (lớp 6-12) — chương trình riêng không dùng được.</p>';
      return;
    }
    let items;
    try {
      items = await listBankItemsForChapter(chapter.id, contentType);
    } catch (e) {
      box.innerHTML = `<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`;
      return;
    }
    if (!items.length) {
      box.innerHTML = '<p class="hint">Chưa có giáo viên nào chia sẻ nội dung cho chương này.</p>';
      return;
    }
    box.innerHTML = `
      <p class="hint">Tick chọn nội dung muốn nhập — tạo bản sao riêng trong chương của bạn, sửa/xoá được như tự soạn, không ảnh hưởng bản gốc.</p>
      <div style="max-height:340px;overflow-y:auto;margin:8px 0;">
        ${items.map((item) => `
          <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:10px;cursor:pointer;">
            <input type="checkbox" class="bank-item-check" value="${item.id}" style="margin-top:3px;flex-shrink:0;" />
            <span style="flex:1;">
              ${renderBankItemPreview(contentType, item.payload)}
              <div class="hint">Chia sẻ bởi ${escapeHtml(item.sharedByName || 'Giáo viên')} · Đã nhập ${item.importCount || 0} lần · <a href="#" class="bank-report-btn" data-bank-id="${item.id}">🚩 Báo cáo nội dung sai</a></div>
            </span>
          </label>
        `).join('')}
      </div>
      <button class="btn primary block bank-import-btn" type="button">Nhập vào chương này</button>
      <div class="result-box" id="bankImportResult"></div>
    `;
    const itemsById = new Map(items.map((it) => [it.id, it]));
    $('.bank-import-btn', box).addEventListener('click', async () => {
      const selectedIds = $$('.bank-item-check', box).filter((c) => c.checked).map((c) => c.value);
      const resultBox = $('#bankImportResult', box);
      if (!selectedIds.length) { showResult(resultBox, 'Chọn ít nhất 1 mục.', true); return; }
      const btn = $('.bank-import-btn', box);
      btn.disabled = true;
      showResult(resultBox, '⏳ Đang nhập...');
      const selectedItems = selectedIds.map((id) => itemsById.get(id)).filter(Boolean);
      const results = await Promise.allSettled(selectedItems.map((item) => importFromBank(item)));
      const okCount = results.filter((r) => r.status === 'fulfilled').length;
      showResult(resultBox, `✓ Đã nhập ${okCount}/${selectedItems.length} mục.`);
      btn.disabled = false;
      if (okCount > 0 && typeof onImported === 'function') await onImported();
    });
    $$('.bank-report-btn', box).forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!confirm('Báo cáo nội dung này có sai sót/không phù hợp? Admin sẽ xem xét.')) return;
        try {
          const teacher = getCurrentTeacher();
          await submitFeedback({
            uid: teacher.uid, role: 'teacher', name: teacher.displayName || teacher.email || '', code: '',
            category: 'bug',
            content: `Báo cáo nội dung sai trong kho chung — loại: ${contentType}, bankId: ${a.dataset.bankId}, chapterId: ${chapter.id}`
          });
          showToast('Đã gửi báo cáo, cảm ơn bạn!', false);
        } catch (err) {
          showToast('Không gửi được: ' + err.message);
        }
      });
    });
  }

  function initBankFeatures() {
    const isCurriculum = isCurriculumChapter(chapter.id);
    const lessonBankBtn = $('#lessonBankBtn');
    const flashBankBtn = $('#flashBankBtn');
    const quizMenuBankBtn = $('#quizMenuBankBtn');
    if (!isCurriculum) {
      // Không có kho chung cho chương trình riêng — ẩn hẳn 3 nút thay vì để bấm vào rồi mới báo lỗi.
      if (lessonBankBtn) lessonBankBtn.style.display = 'none';
      if (flashBankBtn) flashBankBtn.style.display = 'none';
      if (quizMenuBankBtn) quizMenuBankBtn.style.display = 'none';
      return;
    }
    lessonBankBtn.addEventListener('click', () => {
      const panel = $('#lessonBankPanel');
      const open = panel.style.display !== 'none';
      panel.style.display = open ? 'none' : 'block';
      if (!open) renderBankChecklist($('#lessonBankBody'), 'lesson', async () => {
        customLessonsCache = await getCustomLessons(owner.uid, chapter.id);
        renderAllLessons();
      });
    });
    flashBankBtn.addEventListener('click', () => {
      const panel = $('#flashBankPanel');
      const open = panel.style.display !== 'none';
      panel.style.display = open ? 'none' : 'block';
      if (!open) renderBankChecklist($('#flashBankBody'), 'flashcard', async () => {
        customFlashcardsCache = await getCustomFlashcards(owner.uid, chapter.id);
        renderFlashManager();
        renderFlash();
      });
    });
    quizMenuBankBtn.addEventListener('click', () => {
      showQuizSection('quizBankSection');
      renderBankChecklist($('#quizBankBody'), 'quiz', async () => {
        customQuizCache = await getCustomQuiz(owner.uid, chapter.id);
        rebuildEffectiveQuiz();
        renderQuizManager();
        renderQuiz();
      });
    });
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
        showToast('Không lưu được: ' + e.message);
      }
    });
  }

  // ---------- Bài giảng (mặc định + tự thêm, gộp chung 1 danh sách) ----------
  // Điểm bài giảng có thể là chuỗi thường (mọi bài giảng lưu TRƯỚC bản giữ định dạng, và mọi lesson tự
  // viết tay) HOẶC 1 object {type:'text'|'table'|'image'|'warning', ...} (nạp từ Word, xem doc-import.js).
  // {type:'text', html} đã được doc-import.js escape + bọc sẵn thẻ đậm/nghiêng/màu/chỉ số trên-dưới —
  // chèn THẲNG (không escapeHtml lại) để giữ định dạng; escapeHtml lần 2 sẽ biến thẻ thật thành chữ hiển
  // thị "<b>" trên màn hình. Gộp các điểm dạng chuỗi/text liên tiếp vào 1 <ul>, ngắt danh sách và vẽ
  // khối riêng khi gặp bảng/ảnh/cảnh báo.
  function renderLessonPointsHtml(points) {
    let html = '';
    let listBuf = [];
    function flushList() {
      if (listBuf.length) { html += `<ul>${listBuf.join('')}</ul>`; listBuf = []; }
    }
    points.forEach((pt) => {
      if (typeof pt === 'string') {
        listBuf.push(`<li>${escapeHtml(pt)}</li>`);
        return;
      }
      if (pt.type === 'text') {
        if (pt.bg) {
          flushList();
          html += `<p style="background:${escapeHtml(pt.bg)};padding:8px 12px;border-radius:6px;margin:0 0 10px;">${pt.html}</p>`;
          return;
        }
        listBuf.push(`<li>${pt.html}</li>`);
        return;
      }
      flushList();
      if (pt.type === 'image') {
        // Ảnh giờ luôn là 1 TRANG PDF nguyên vẹn (xem doc-import.js) — nhiều trang của cùng 1 "Bài" xếp
        // liên tiếp nhau, bỏ khoảng cách/bo góc giữa các trang để đọc liền mạch như lật trang giấy thật,
        // thay vì để trắng 1 khoảng lớn giữa từng trang trông như các ảnh minh hoạ rời rạc.
        html += `<img src="${pt.dataUri}" alt="${escapeHtml(pt.alt || '')}" style="max-width:100%;display:block;margin:0;" />`;
      } else if (pt.type === 'table') {
        html += `<div class="lesson-table-wrap"><table class="lesson-table">${pt.rows.map((row) => `<tr>${row.cells.map((cell) => {
          if (typeof cell === 'string') return `<td>${escapeHtml(cell)}</td>`;
          const style = cell.bg ? ` style="background:${escapeHtml(cell.bg)};"` : '';
          return `<td${style}>${cell.html}</td>`;
        }).join('')}</tr>`).join('')}</table></div>`;
      } else if (pt.type === 'warning') {
        html += `<p class="hint" style="color:var(--danger);">⚠️ ${escapeHtml(pt.message)}</p>`;
      }
    });
    flushList();
    return html;
  }

  // Chương có nhiều "Bài" — mặc định chỉ hiện TIÊU ĐỀ, bấm vào mới xổ nội dung ra (đỡ rối khi 1 chương
  // có nhiều bài, mỗi bài lại nhiều trang). Nhớ theo "key" riêng từng bài nên bấm mở/đóng 1 bài không
  // ảnh hưởng các bài khác đang mở, kể cả sau khi renderAllLessons() vẽ lại (VD sau khi sửa/xoá 1 bài).
  const expandedLessonKeys = new Set();
  function lessonKey(l) { return l.kind === 'builtin' ? `b${l.index}` : `c${l.id}`; }

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
      box.innerHTML = items.map((l) => {
        const key = lessonKey(l);
        const expanded = expandedLessonKeys.has(key);
        return `
        <div class="lesson-block">
          <h3 class="lesson-toggle" data-key="${key}">
            <span class="lesson-toggle-arrow">${expanded ? '▾' : '▸'}</span> ${escapeHtml(l.title)}
          </h3>
          ${expanded ? renderLessonPointsHtml(l.points) : ''}
          ${owner.isOwner ? `
            <div class="hint" style="margin-top:8px;">
              ${l.kind === 'builtin' ? (l.edited ? 'Đã sửa' : 'Có sẵn trong app') : (l.isGroup ? `Tự thêm (${l.groupIds.length} phần)` : 'Tự thêm')}
              ${(l.kind === 'custom' && l.isGroup) ? '' : `· <a href="#" class="lesson-edit" data-kind="${l.kind}" data-key="${l.kind === 'builtin' ? l.index : l.id}">Sửa</a>`}
              · <a href="#" class="lesson-delete" data-kind="${l.kind}" data-key="${l.kind === 'builtin' ? l.index : l.id}">${l.kind === 'builtin' ? 'Ẩn' : (l.isGroup ? 'Xoá cả bài' : 'Xoá')}</a>
              ${l.kind === 'builtin' && l.edited ? ` · <a href="#" class="lesson-restore" data-key="${l.index}">Khôi phục mặc định</a>` : ''}
              ${l.isGroup ? '' : bankShareLinkHtml('lesson', l)}
            </div>
          ` : ''}
        </div>
      `;
      }).join('');
    }
    setChapterProgress(chapter.id, { lessonViewed: true });
    refreshDots();
    wireLessonToggles(box);
    if (owner.isOwner) { wireLessonActions(box); wireBankShareLinks(box, 'lesson', customLessonsCache, renderAllLessons); }
    refreshLessonDeleteAllRow();
  }

  function wireLessonToggles(box) {
    $$('.lesson-toggle', box).forEach((h) => {
      h.addEventListener('click', () => {
        const key = h.dataset.key;
        if (expandedLessonKeys.has(key)) expandedLessonKeys.delete(key); else expandedLessonKeys.add(key);
        renderAllLessons();
      });
    });
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
            // "Bài" gộp từ nhiều trang (xem groupCustomLessonsByFile) lưu thành nhiều tài liệu Firestore
            // riêng — xoá phải xoá HẾT các id trong nhóm, không chỉ 1 tài liệu đại diện.
            const item = getAllLessons().find((it) => it.kind === 'custom' && it.id === key);
            const ids = (item && item.groupIds) || [key];
            if (!confirm(ids.length > 1 ? `Xoá cả bài này (gồm ${ids.length} phần)? Không thể hoàn tác.` : 'Xoá bài giảng này?')) return;
            await Promise.all(ids.map((id) => deleteCustomLesson(id)));
            customLessonsCache = customLessonsCache.filter((it) => !ids.includes(it.id));
          } else {
            if (!confirm('Ẩn bài giảng mặc định này khỏi chương? (có thể khôi phục lại sau)')) return;
            await setChapterMeta(chapter.id, { ['lessonOverrides.' + key]: null });
            chapterMeta.lessonOverrides = Object.assign({}, chapterMeta.lessonOverrides, { [key]: null });
          }
          renderAllLessons();
        } catch (err) {
          showToast('Không thực hiện được: ' + err.message);
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
          showToast('Không khôi phục được: ' + err.message);
        }
      });
    });
  }

  // Điểm dạng object (bảng/ảnh/cảnh báo, nạp từ Word) không sửa được trong khung textarea đơn giản
  // này — giữ nguyên riêng (rememberedRichPoints), chỉ phần chữ mới đưa vào textarea để sửa. Lúc lưu,
  // ghép lại: [các dòng chữ mới từ textarea] + [toàn bộ điểm object, giữ nguyên thứ tự cũ] — chấp nhận
  // đánh đổi mất đúng vị trí xen kẽ gốc (bảng/ảnh dồn xuống cuối) để khỏi mất dữ liệu, không cần xây
  // hẳn 1 trình soạn thảo rich-text riêng chỉ để sửa nhanh vài dòng.
  let rememberedRichPoints = [];

  function openLessonForm(existing) {
    const box = $('#manualLessonForm');
    box.style.display = 'block';
    $('#manualLessonTitle').value = existing ? existing.title : '';
    const points = existing ? existing.points : [];
    rememberedRichPoints = points.filter((p) => typeof p !== 'string');
    $('#manualLessonPoints').value = points.filter((p) => typeof p === 'string').join('\n');
    $('#manualLessonRichNotice').style.display = rememberedRichPoints.length ? 'block' : 'none';
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
      const textPoints = $('#manualLessonPoints').value.split('\n').map((s) => s.trim()).filter(Boolean);
      const points = textPoints.concat(rememberedRichPoints);
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
        showToast('Không lưu được: ' + e.message);
      }
    });
  }

  function renderImportPreview(sections, fileName) {
    const box = $('#docImportPreview');
    if (!sections.length) {
      box.innerHTML = `<div class="result-box show error">⚠️ Không tìm thấy nội dung văn bản nào trong file này.</div>`;
      return;
    }
    // Đặt sẵn 1 cặp nút Lưu/Huỷ ở TRÊN ĐẦU (trước danh sách trang tích chọn) — file PDF nhiều trang thì
    // danh sách rất dài, giáo viên không phải cuộn hết xuống cuối mới bấm được Lưu hoặc Huỷ.
    box.innerHTML = `
      <div class="result-box show">
        <div style="font-weight:700;margin-bottom:10px;">Đã trích xuất từ "${escapeHtml(fileName)}" — chọn phần muốn lưu vào chương:</div>
        <div class="btn-row" style="margin-bottom:12px;">
          <button class="btn primary" id="docSaveBtnTop" style="flex:1;">Lưu vào chương</button>
          <button class="btn" id="docCancelBtnTop" style="flex:1;">Huỷ</button>
        </div>
        ${sections.map((s, i) => `
          <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:10px;cursor:pointer;">
            <input type="checkbox" class="import-check" data-idx="${i}" checked style="margin-top:3px;flex-shrink:0;" />
            <span>
              <strong>${escapeHtml(s.title || '(Không có tiêu đề)')}</strong><br>
              <span style="font-size:12.5px;color:var(--text-dim);">${s.points.length === 1 && s.points[0].type === 'image' ? 'Ảnh nguyên trang' : `${s.points.length} đoạn văn bản`}</span>
            </span>
          </label>
        `).join('')}
        <button class="btn primary block" id="docSaveBtn">Lưu vào chương</button>
      </div>
    `;
    const saveBtns = [$('#docSaveBtnTop'), $('#docSaveBtn')];
    async function doSave() {
      const checks = $$('.import-check', box);
      const chosen = checks.filter((c) => c.checked).map((c) => sections[parseInt(c.dataset.idx, 10)]);
      if (!chosen.length) return;
      saveBtns.forEach((b) => { b.disabled = true; b.textContent = 'Đang lưu...'; });
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
    }
    saveBtns.forEach((b) => b.addEventListener('click', doSave));
    $('#docCancelBtnTop').addEventListener('click', () => { box.innerHTML = ''; });
  }

  function refreshLessonDeleteAllRow() {
    const row = $('#lessonDeleteAllRow');
    if (!row) return;
    row.style.display = (owner.isOwner && customLessonsCache.length) ? 'flex' : 'none';
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
    $('#lessonDeleteAllBtn').addEventListener('click', async () => {
      if (!customLessonsCache.length) return;
      if (!confirm(`Xoá toàn bộ ${customLessonsCache.length} bài giảng tự thêm/nạp từ file của chương này? Không thể hoàn tác. Bài giảng có sẵn trong app KHÔNG bị ảnh hưởng.`)) return;
      const btn = $('#lessonDeleteAllBtn');
      btn.disabled = true;
      btn.textContent = 'Đang xoá...';
      try {
        await deleteAllCustomLessons(chapter.id);
        customLessonsCache = [];
        renderAllLessons();
        showToast('Đã xoá toàn bộ bài giảng tự thêm — nạp lại file để cập nhật bản mới.', false);
      } catch (err) {
        showToast('Không xoá được: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '🗑️ Xoá tất cả bài giảng tự thêm';
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
            ${bankShareLinkHtml('flashcard', c)}
          </div>
        </div>
      `).join('');
    }
    wireFlashActions(box);
    wireBankShareLinks(box, 'flashcard', customFlashcardsCache, renderFlashManager);
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
          showToast('Không thực hiện được: ' + err.message);
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
          showToast('Không khôi phục được: ' + err.message);
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
        showToast('Không lưu được: ' + e.message);
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
    if (getQuestionType(item) === 'text') {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'quiz-option quiz-text-input';
      input.placeholder = 'Nhập câu trả lời...';
      input.value = answered ? stAnswers[stIndex] : '';
      // Ghi trực tiếp qua sự kiện input (KHÔNG gọi lại renderSelfTestQuestion() mỗi phím gõ) để khỏi
      // mất focus/con trỏ đang gõ dở — khác với nút bấm ABCD (mỗi click là 1 hành động rời rạc, vẽ
      // lại được ngay không sao).
      input.addEventListener('input', () => { stAnswers[stIndex] = input.value.trim() || null; });
      optWrap.appendChild(input);
    } else {
      item.options.forEach((opt, i) => {
        const b = document.createElement('button');
        b.className = 'quiz-option' + (answered && i === stAnswers[stIndex] ? ' selected' : '');
        b.textContent = opt;
        b.addEventListener('click', () => { stAnswers[stIndex] = i; renderSelfTestQuestion(); });
        optWrap.appendChild(b);
      });
    }
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
      const isOk = isQuizAnswerCorrect(item, stAnswers[i]);
      if (isOk) correctCount++;
      const yourAnswerText = stAnswers[i] == null ? '(chưa trả lời)'
        : (getQuestionType(item) === 'text' ? stAnswers[i] : ((item.options && item.options[stAnswers[i]]) || ''));
      return `
        <div class="quiz-review-item ${isOk ? 'ok' : 'bad'}">
          <div class="qi-q">${i + 1}. ${escapeHtml(item.q)}</div>
          <div>Đáp án đúng: ${escapeHtml(formatCorrectAnswerDisplay(item))}</div>
          <div class="qi-status">${isOk ? '✓ Bạn trả lời đúng' : '✗ Bạn chọn: ' + escapeHtml(yourAnswerText)}</div>
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
    const type = getQuestionType(item);
    const answered = qAnswers[qIndex] !== null && qAnswers[qIndex] !== undefined;
    $('#quizWrap').innerHTML = `
      <div class="quiz-progress">Câu ${qIndex + 1}/${total}</div>
      ${item.qImage ? `<div class="quiz-question-image"><img src="${item.qImage}" alt="Ảnh câu hỏi"></div>` : ''}
      <div class="quiz-question">${escapeHtml(item.q)}</div>
      <div class="quiz-options" id="quizOptions"></div>
      ${type === 'text' && answered ? `<div class="hint" style="margin:-6px 0 10px;">Đáp án đúng: ${escapeHtml(formatCorrectAnswerDisplay(item))}</div>` : ''}
      <div class="quiz-explain ${answered ? 'show' : ''}" id="quizExplain">${escapeHtml(item.explain || '')}</div>
      <button class="btn primary block" id="quizNextBtn" style="display:${answered ? 'flex' : 'none'};">${qIndex === total - 1 ? 'Xem kết quả' : 'Câu tiếp →'}</button>
    `;
    const optWrap = $('#quizOptions');
    if (type === 'text') {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'quiz-option quiz-text-input';
      input.placeholder = 'Nhập câu trả lời...';
      input.value = answered ? qAnswers[qIndex] : '';
      optWrap.appendChild(input);
      if (answered) {
        input.disabled = true;
        input.classList.add(isQuizAnswerCorrect(item, qAnswers[qIndex]) ? 'correct' : 'wrong');
      } else {
        const checkBtn = document.createElement('button');
        checkBtn.type = 'button';
        checkBtn.className = 'btn primary block';
        checkBtn.style.marginTop = '8px';
        checkBtn.textContent = 'Kiểm tra';
        const submit = () => {
          const val = input.value.trim();
          if (!val) return;
          qAnswers[qIndex] = val;
          renderQuiz();
        };
        checkBtn.addEventListener('click', submit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        optWrap.appendChild(checkBtn);
      }
    } else {
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
    }
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
      const isOk = isQuizAnswerCorrect(item, qAnswers[i]);
      if (isOk) correctCount++;
      const yourAnswerText = qAnswers[i] == null ? '(chưa trả lời)'
        : (getQuestionType(item) === 'text' ? qAnswers[i] : ((item.options && item.options[qAnswers[i]]) || ''));
      return `
        <div class="quiz-review-item ${isOk ? 'ok' : 'bad'}">
          <div class="qi-q">${i + 1}. ${escapeHtml(item.q)}</div>
          <div>Đáp án đúng: ${escapeHtml(formatCorrectAnswerDisplay(item))}</div>
          <div class="qi-status">${isOk ? '✓ Bạn trả lời đúng' : '✗ Bạn chọn: ' + escapeHtml(yourAnswerText)}</div>
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
  function refreshQuizDeleteAllRow() {
    const row = $('#quizDeleteAllRow');
    if (!row) return;
    row.style.display = (owner.isOwner && customQuizCache.length) ? 'flex' : 'none';
  }

  // 1 câu hỏi — dùng lại được cho CẢ mục đơn lẻ LẪN từng câu bên trong 1 "Bài" đang mở (xem
  // groupCustomQuizByFile) — tách riêng khỏi renderQuizManager để không viết trùng markup 2 chỗ.
  function renderQuizItemCard(item) {
    const qType = getQuestionType(item);
    // Câu nạp từ PDF (cắt ảnh) luôn thiếu đáp án đúng (correct: null) — cho bấm chọn nhanh NGAY tại
    // đây thay vì bắt giáo viên mở form "Sửa" từng câu một, đỡ mất công khi nạp hàng chục/trăm câu.
    const needsQuickPick = (qType === 'abcd' || qType === 'truefalse') && (item.correct === null || item.correct === undefined) && Array.isArray(item.options);
    return `
      <div class="quiz-review-item" style="text-align:left;">
        ${item.qImage ? `<img src="${item.qImage}" alt="${escapeHtml(item.q)}" style="max-width:100%;display:block;border-radius:8px;margin-bottom:6px;">` : ''}
        <div class="qi-q">${escapeHtml(item.q)}</div>
        <div class="hint">[${QUIZ_TYPE_LABELS[qType]}] Đúng: ${formatCorrectAnswerDisplay(item) ? escapeHtml(formatCorrectAnswerDisplay(item)) : '⚠️ chưa có đáp án đúng'}</div>
        ${needsQuickPick ? `
        <div class="btn-row" style="margin-top:6px;flex-wrap:wrap;gap:6px;">
          ${item.options.map((opt, i) => `<button type="button" class="btn quiz-quickpick" data-kind="${item.kind}" data-key="${item.kind === 'builtin' ? item.index : item.id}" data-i="${i}">✓ ${escapeHtml(opt)}</button>`).join('')}
        </div>` : ''}
        <div class="hint" style="margin-top:4px;">
          ${item.kind === 'builtin' ? (item.edited ? 'Đã sửa' : 'Có sẵn trong app') : 'Tự thêm'}
          · <a href="#" class="quiz-edit" data-kind="${item.kind}" data-key="${item.kind === 'builtin' ? item.index : item.id}">Sửa</a>
          · <a href="#" class="quiz-delete" data-kind="${item.kind}" data-key="${item.kind === 'builtin' ? item.index : item.id}">${item.kind === 'builtin' ? 'Ẩn' : 'Xoá'}</a>
          ${item.kind === 'builtin' && item.edited ? ` · <a href="#" class="quiz-restore" data-key="${item.index}">Khôi phục mặc định</a>` : ''}
          ${bankShareLinkHtml('quiz', item)}
        </div>
      </div>
    `;
  }

  const expandedQuizKeys = new Set();
  function quizGroupKey(item) { return 'g' + item.id; }

  function renderQuizManager() {
    const box = $('#quizManagerBody');
    const items = getGroupedQuizItems();
    box.innerHTML = items.length ? items.map((item) => {
      if (!item.isGroup) return renderQuizItemCard(item);
      const key = quizGroupKey(item);
      const expanded = expandedQuizKeys.has(key);
      return `
      <div class="lesson-block">
        <h3 class="lesson-toggle quiz-group-toggle" data-key="${key}">
          <span class="lesson-toggle-arrow">${expanded ? '▾' : '▸'}</span> 📁 ${escapeHtml(item.title)}
        </h3>
        <div class="hint" style="margin:2px 0 8px;">
          Tự thêm (${item.groupItems.length} câu) · <a href="#" class="quiz-delete-group" data-ids="${item.groupIds.join(',')}">Xoá cả bài</a>
        </div>
        ${expanded ? item.groupItems.map(renderQuizItemCard).join('') : ''}
      </div>
    `;
    }).join('') : '<div class="hint">Chưa có câu hỏi nào.</div>';

    $$('.quiz-group-toggle', box).forEach((h) => {
      h.addEventListener('click', () => {
        const key = h.dataset.key;
        if (expandedQuizKeys.has(key)) expandedQuizKeys.delete(key); else expandedQuizKeys.add(key);
        renderQuizManager();
      });
    });
    $$('.quiz-delete-group', box).forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        const ids = a.dataset.ids.split(',').filter(Boolean);
        if (!confirm(`Xoá cả ${ids.length} câu hỏi trong bài này? Không thể hoàn tác.`)) return;
        try {
          await Promise.all(ids.map((id) => deleteCustomQuiz(id)));
          customQuizCache = customQuizCache.filter((it) => !ids.includes(it.id));
          rebuildEffectiveQuiz();
          renderQuizManager();
          renderQuiz();
        } catch (err) {
          showToast('Không xoá được: ' + err.message);
        }
      });
    });

    $$('.quiz-quickpick', box).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const kind = btn.dataset.kind;
        const key = btn.dataset.key;
        const i = parseInt(btn.dataset.i, 10);
        $$('.quiz-quickpick', btn.closest('.quiz-review-item')).forEach((b) => { b.disabled = true; });
        try {
          if (kind === 'custom') {
            await updateCustomQuiz(key, { correct: i });
            const it = customQuizCache.find((x) => x.id === key);
            if (it) it.correct = i;
          } else {
            const item = getAllQuizItems().find((it) => it.kind === 'builtin' && String(it.index) === key);
            const question = { q: item.q, type: getQuestionType(item), options: item.options, correct: i, explain: item.explain || '' };
            await setChapterMeta(chapter.id, { ['quizOverrides.' + key]: question });
            chapterMeta.quizOverrides = Object.assign({}, chapterMeta.quizOverrides, { [key]: question });
          }
          rebuildEffectiveQuiz();
          renderQuizManager();
          renderQuiz();
        } catch (err) {
          showToast('Không lưu được: ' + err.message);
          $$('.quiz-quickpick', box).forEach((b) => { b.disabled = false; });
        }
      });
    });

    $$('.quiz-edit', box).forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const kind = a.dataset.kind;
        if (kind === 'custom') {
          const item = customQuizCache.find((it) => it.id === a.dataset.key);
          // Giữ NGUYÊN "type"/"acceptedAnswers" — thiếu 2 field này khiến getQuestionType() luôn hiểu
          // nhầm thành 'abcd' (mặc định khi thiếu type), rồi openQuizForm() cố đọc existing.options[i]
          // trên câu hỏi "Nhập đáp án" (không có mảng options) gây lỗi JS giữa chừng, để lại
          // box.dataset.id/index cũ từ lần sửa TRƯỚC còn sót lại — bấm "Lưu" sau đó có thể ghi đè
          // nhầm sang câu hỏi khác.
          if (item) openQuizForm({ kind: 'custom', id: item.id, q: item.q, type: item.type, options: item.options, correct: item.correct, acceptedAnswers: item.acceptedAnswers, explain: item.explain });
        } else {
          const item = getAllQuizItems().find((it) => it.kind === 'builtin' && String(it.index) === a.dataset.key);
          if (item) openQuizForm({ kind: 'builtin', index: item.index, q: item.q, type: item.type, options: item.options, correct: item.correct, acceptedAnswers: item.acceptedAnswers, explain: item.explain });
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
          showToast('Không thực hiện được: ' + err.message);
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
          showToast('Không khôi phục được: ' + err.message);
        }
      });
    });
    wireBankShareLinks(box, 'quiz', customQuizCache, renderQuizManager);
    refreshQuizDeleteAllRow();
  }

  // Hiện đúng khối field tương ứng loại câu hỏi đang chọn (ABCD / Đúng-Sai / Nhập đáp án) — 3 khối
  // luôn cùng tồn tại trong DOM, chỉ ẩn/hiện chứ không dựng lại, để không mất dữ liệu đã gõ nếu người
  // dùng đổi qua đổi lại loại trước khi lưu.
  function updateQuizFormTypeFields() {
    const type = $('#quizFormType').value;
    $('#quizFormAbcdFields').style.display = type === 'abcd' ? 'block' : 'none';
    $('#quizFormTfFields').style.display = type === 'truefalse' ? 'block' : 'none';
    $('#quizFormTextFields').style.display = type === 'text' ? 'block' : 'none';
  }

  function openQuizForm(existing) {
    const box = $('#quizForm');
    box.style.display = 'block';
    const imgBox = $('#quizFormImagePreview');
    if (existing && existing.qImage) {
      imgBox.style.display = 'block';
      imgBox.innerHTML = `<img src="${existing.qImage}" style="width:100%;display:block;" alt="Ảnh câu hỏi gốc">`;
    } else {
      imgBox.style.display = 'none';
      imgBox.innerHTML = '';
    }
    $('#quizFormQ').value = existing ? existing.q : '';
    const type = existing ? getQuestionType(existing) : 'abcd';
    $('#quizFormType').value = type;
    updateQuizFormTypeFields();
    [0, 1, 2, 3].forEach((i) => { $('#quizFormOpt' + i).value = (existing && type === 'abcd' && existing.options) ? (existing.options[i] || '') : ''; });
    $$('input[name="quizFormCorrect"]').forEach((r, i) => { r.checked = (existing && type === 'abcd') ? existing.correct === i : i === 0; });
    $$('input[name="quizFormTf"]').forEach((r, i) => { r.checked = (existing && type === 'truefalse') ? existing.correct === i : i === 0; });
    $('#quizFormAccepted').value = (existing && type === 'text') ? (existing.acceptedAnswers || '') : '';
    $('#quizFormExplain').value = existing ? (existing.explain || '') : '';
    box.dataset.kind = existing ? existing.kind : 'custom';
    box.dataset.id = (existing && existing.kind === 'custom') ? existing.id : '';
    box.dataset.index = (existing && existing.kind === 'builtin') ? String(existing.index) : '';
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function initQuizManager() {
    if (!owner.isOwner) return;

    $('#quizFormType').innerHTML = QUIZ_TYPE_OPTIONS.map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('');
    $('#quizFormType').addEventListener('change', updateQuizFormTypeFields);

    $('#quizFormAddBtn').addEventListener('click', () => openQuizForm(null));
    $('#quizDeleteAllBtn').addEventListener('click', async () => {
      if (!customQuizCache.length) return;
      if (!confirm(`Xoá toàn bộ ${customQuizCache.length} câu hỏi tự thêm/nạp từ file của chương này? Không thể hoàn tác. Câu hỏi có sẵn trong app KHÔNG bị ảnh hưởng.`)) return;
      const btn = $('#quizDeleteAllBtn');
      btn.disabled = true;
      btn.textContent = 'Đang xoá...';
      try {
        await deleteAllCustomQuiz(chapter.id);
        customQuizCache = [];
        rebuildEffectiveQuiz();
        renderQuizManager();
        renderQuiz();
        showToast('Đã xoá toàn bộ câu hỏi tự thêm — nạp lại file để cập nhật bản mới.', false);
      } catch (err) {
        showToast('Không xoá được: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '🗑️ Xoá tất cả câu hỏi tự thêm';
      }
    });
    $('#quizFormCancel').addEventListener('click', () => { $('#quizForm').style.display = 'none'; });
    $('#quizFormSave').addEventListener('click', async () => {
      const q = $('#quizFormQ').value.trim();
      const type = $('#quizFormType').value;
      const explain = $('#quizFormExplain').value.trim();
      if (!q) return;

      let question;
      if (type === 'truefalse') {
        const tfRadio = $$('input[name="quizFormTf"]').find((r) => r.checked);
        const correct = tfRadio ? parseInt(tfRadio.value, 10) : 0;
        question = { q, type: 'truefalse', options: ['Đúng', 'Sai'], correct, explain };
      } else if (type === 'text') {
        const acceptedAnswers = $('#quizFormAccepted').value.trim();
        if (!acceptedAnswers) return;
        question = { q, type: 'text', acceptedAnswers, explain };
      } else {
        const options = [0, 1, 2, 3].map((i) => $('#quizFormOpt' + i).value.trim());
        if (options.some((o) => !o)) return;
        const correctRadio = $$('input[name="quizFormCorrect"]').find((r) => r.checked);
        const correct = correctRadio ? parseInt(correctRadio.value, 10) : 0;
        question = { q, type: 'abcd', options, correct, explain };
      }

      const box = $('#quizForm');
      const kind = box.dataset.kind;
      try {
        if (kind === 'builtin') {
          const index = box.dataset.index;
          await setChapterMeta(chapter.id, { ['quizOverrides.' + index]: question });
          chapterMeta.quizOverrides = Object.assign({}, chapterMeta.quizOverrides, { [index]: question });
        } else if (box.dataset.id) {
          await updateCustomQuiz(box.dataset.id, question);
          const it = customQuizCache.find((x) => x.id === box.dataset.id);
          if (it) Object.assign(it, question);
        } else {
          const id = await addCustomQuiz(chapter.id, question);
          customQuizCache.push(Object.assign({ id, chapterId: chapter.id }, question));
        }
        $('#quizForm').style.display = 'none';
        rebuildEffectiveQuiz();
        renderQuizManager();
        renderQuiz();
      } catch (e) {
        showToast('Không lưu được: ' + e.message);
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
        const text = file.name.toLowerCase().endsWith('.docx')
          ? await extractDocxPlainText(await file.arrayBuffer())
          : await file.text();
        const questions = parseQuizTemplate(text);
        // Gắn tên file gốc để nhóm thành 1 "Bài" trong danh sách quản lý — giống hệt cách bài giảng
        // đang gộp theo sourceFileName (xem groupCustomLessonsByFile/groupCustomQuizByFile).
        questions.forEach((q) => { q.sourceFileName = file.name; });
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

    $('#quizPdfBtn').addEventListener('click', () => $('#quizPdfFileInput').click());
    $('#quizPdfFileInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const box = $('#quizPdfResult');
      box.innerHTML = `<div class="result-box show">⏳ Đang cắt ảnh từng câu trong "${escapeHtml(file.name)}"...</div>`;
      try {
        const { questions, warnings } = await extractQuizFromPdf(await file.arrayBuffer());
        questions.forEach((q) => { q.sourceFileName = file.name; });
        await addCustomQuizBatch(chapter.id, questions);
        customQuizCache = await getCustomQuiz(owner.uid, chapter.id);
        // Báo NGAY mọi cảnh báo gặp phải lúc nạp (thiếu/trùng số câu, trang lỗi...) — giáo viên cần biết
        // ngay chỗ nào phải tự kiểm tra lại, không im lặng bỏ qua rồi chỉ phát hiện đề bị thiếu khi đã trễ.
        const warningHtml = warnings.length
          ? `<div class="result-box show error" style="margin-bottom:8px;"><strong>⚠️ Có ${warnings.length} vấn đề cần kiểm tra lại:</strong><ul style="margin:6px 0 0;padding-left:20px;">${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>`
          : '';
        box.innerHTML = `
          ${warningHtml}
          <div class="result-box show">✓ Đã nạp ${questions.length} câu hỏi — nhớ vào "Sửa câu hỏi trắc nghiệm" để chọn đáp án đúng cho từng câu.</div>
          <button class="btn block" id="quizPdfViewAllBtn" style="margin-top:8px;">👁️ Xem toàn bộ đề vừa nạp</button>
          <div id="quizPdfPreviewList" style="display:none;margin-top:10px;"></div>
        `;
        $('#quizPdfViewAllBtn').addEventListener('click', () => {
          const list = $('#quizPdfPreviewList');
          const show = list.style.display === 'none';
          list.style.display = show ? 'block' : 'none';
          if (show && !list.dataset.rendered) {
            list.dataset.rendered = '1';
            list.innerHTML = questions.map((q) => `
              <div class="lesson-block" style="margin-bottom:10px;">
                <h3 style="margin-bottom:8px;">${escapeHtml(q.q)}</h3>
                ${q.qImage ? `<img src="${q.qImage}" alt="${escapeHtml(q.q)}" style="max-width:100%;display:block;">` : ''}
              </div>
            `).join('');
          }
        });
        rebuildEffectiveQuiz();
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
        questions.forEach((q) => { q.sourceFileName = file.name; });
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
  const QUIZ_SECTION_IDS = ['quizEditSection', 'quizTxtCard', 'quizPdfCard', 'quizExcelCard', 'quizBankSection', 'selfTestCard', 'quizReviewSection'];

  function showQuizSection(sectionId) {
    $('#quizStudentMenu').style.display = 'none';
    $('#quizTeacherMenu').style.display = 'none';
    QUIZ_SECTION_IDS.forEach((id) => { $('#' + id).style.display = id === sectionId ? 'block' : 'none'; });
    $('#quizBackToMenuBtn').style.display = 'block';
    // Danh sách sửa câu hỏi vẽ TỚI KHI giáo viên thật sự mở màn này mới dựng (kèm ảnh câu hỏi nạp từ
    // PDF, có thể rất nặng nếu đề nhiều câu) — dựng sẵn ngay lúc mở trang sẽ làm cả trang ì ạch dù
    // giáo viên chỉ định xem bài giảng/flashcard, không đụng gì tới trắc nghiệm.
    if (sectionId === 'quizEditSection') renderQuizManager();
  }

  // Thống kê nhanh kho câu hỏi của chương (tổng + từng loại) — hiện ngay khi giáo viên bấm vào tab
  // "Trắc nghiệm", đỡ phải đoán/đếm tay hay qua tận trang "Tạo đề kiểm tra" mới biết.
  function renderQuizStats() {
    const bar = $('#quizStatsBar');
    if (!bar) return;
    const items = getAllQuizItems();
    if (!items.length) { bar.textContent = 'Chưa có câu hỏi nào trong chương này.'; return; }
    const counts = { abcd: 0, truefalse: 0, text: 0 };
    items.forEach((item) => { counts[getQuestionType(item)]++; });
    const breakdown = QUIZ_TYPE_OPTIONS.filter((t) => counts[t.value] > 0)
      .map((t) => `${t.label}: ${counts[t.value]}`).join(', ');
    bar.textContent = `Kho câu hỏi hiện có: Tổng ${items.length} câu — ${breakdown}.`;
  }

  function showQuizMenu() {
    $('#quizBackToMenuBtn').style.display = 'none';
    QUIZ_SECTION_IDS.forEach((id) => { $('#' + id).style.display = 'none'; });
    $('#quizStudentMenu').style.display = owner.isOwner ? 'none' : 'block';
    $('#quizTeacherMenu').style.display = owner.isOwner ? 'block' : 'none';
    if (owner.isOwner) renderQuizStats();
  }

  function initQuizMenu() {
    $('#quizMenuReviewBtn').addEventListener('click', () => showQuizSection('quizReviewSection'));
    $('#quizMenuSelfTestBtn').addEventListener('click', () => showQuizSection('selfTestCard'));
    if (owner.isOwner) {
      $('#quizMenuEditBtn').addEventListener('click', () => showQuizSection('quizEditSection'));
      $('#quizMenuManualBtn').addEventListener('click', () => { showQuizSection('quizEditSection'); openQuizForm(null); });
      $('#quizMenuTxtBtn').addEventListener('click', () => showQuizSection('quizTxtCard'));
      $('#quizMenuPdfBtn').addEventListener('click', () => showQuizSection('quizPdfCard'));
      $('#quizMenuExcelBtn').addEventListener('click', () => showQuizSection('quizExcelCard'));
    }
    $('#quizBackToMenuBtn').addEventListener('click', showQuizMenu);
    showQuizMenu();
  }

  async function init() {
    // Gắn nút chuyển tab (Bài giảng/Flashcard/Trắc nghiệm) NGAY LẬP TỨC, trước khi chờ bất kỳ dữ liệu
    // mạng nào — nếu để cuối init() như trước (sau khi tải xong toàn bộ bài giảng/câu hỏi, có thể nặng
    // nếu chương có nhiều ảnh nạp từ PDF), bấm tab sẽ như "không phản hồi" cho tới khi tải xong hết.
    initTabs(document);
    // Xác nhận "nhóm đang xem" cache còn khớp tài khoản Google đang đăng nhập TRƯỚC khi đọc/hiện
    // tiến độ (refreshDots bên dưới) — trang này có thể là trang đầu tiên mở (VD theo link đã lưu),
    // không chắc đã qua chapter-overview.js trước đó. Đồng thời tải tiến độ đã đồng bộ từ Firestore
    // về (nếu có) để không mất tiến độ khi mở trên thiết bị mới.
    if (typeof getVerifiedMembership === 'function') {
      const membership = await getVerifiedMembership();
      if (membership && membership.studentId && typeof hydrateProgressFromServer === 'function') {
        await hydrateProgressFromServer(membership.studentId);
      }
      // Nhóm bị khoá (vượt hạn mức số nhóm miễn phí, giáo viên chưa gia hạn Pro) — chặn NGAY, không
      // hiện bài giảng/flashcard/trắc nghiệm của nhóm đang bị khoá. Chỉ áp dụng cho HỌC SINH thật (có
      // membership) — giáo viên xem/soạn chương của chính mình (resolveContentOwner isOwner:true bên
      // dưới) không bị ảnh hưởng bởi khoá nhóm.
      if (membership && membership.teacherUid && typeof isGroupLockedForTeacher === 'function') {
        try {
          if (await isGroupLockedForTeacher(membership.teacherUid, membership.groupCode)) {
            document.querySelector('main').innerHTML = `
              <div class="card">
                <h2><span class="icon">🔒</span>Nhóm đang bị khoá</h2>
                <p class="hint">Nhóm của bạn đang bị khoá vì giáo viên đã vượt hạn mức số nhóm của gói miễn phí (gói Pro đã hết hạn/chưa gia hạn). Nhắn giáo viên gia hạn Pro để mở lại nhé.</p>
              </div>
            `;
            return;
          }
        } catch (e) { /* lỗi mạng tạm thời -> coi như chưa khoá, không chặn nhầm vì 1 lần lỗi mạng */ }
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
      $('#docUploadHint').style.display = 'block';
      initManualLessonForm();
      initUploadControl();
      initFlashManager();
      renderFlashManager();
      initQuizManager();
      initBankFeatures();
    }
    initQuizMenu();
    refreshDots();
  }

  init();
})();
