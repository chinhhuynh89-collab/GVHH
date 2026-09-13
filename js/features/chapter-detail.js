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
  let customLessonPlansCache = [];
  let effectiveQuiz = [];
  // "Bài" (đơn vị con trong chương, xem chapterMeta.units) — CHỈ áp dụng cho nội dung Tự thêm, không
  // đụng nội dung có sẵn trong app. null = đang xem phần "Chung" (= TOÀN CHƯƠNG, gộp mặc định + Tự
  // thêm của MỌI Bài lẫn chưa gán Bài nào) — khác null = chỉ xem đúng Tự thêm có unitId trùng, ẩn hết
  // nội dung có sẵn (builtin) vì builtin chưa được tổ chức theo Bài.
  let activeUnitId = null;
  function filterByActiveUnit(items) {
    return activeUnitId ? items.filter((it) => it.unitId === activeUnitId) : items;
  }
  // Ôn tập/Tự kiểm tra ở phần Chung mặc định RÚT TỪ TOÀN CHƯƠNG (mọi Bài + chưa gán Bài nào) — giáo
  // viên/học sinh có thể BỎ TÍCH bớt vài Bài (renderQuizUnitFilterCard) để thu hẹp phạm vi 1 lượt Ôn
  // tập/Tự kiểm tra cụ thể, KHÔNG đụng tới "Sửa câu hỏi trắc nghiệm" (vẫn luôn thấy đủ mọi câu hỏi).
  // Set RỖNG = không loại Bài nào (mặc định) — dùng "danh sách LOẠI TRỪ" thay vì "danh sách chọn" để
  // Bài MỚI tạo tự động được tính vào ngay, không cần thêm tay vào 1 danh sách chọn riêng.
  const excludedUnitIds = new Set();
  // Tích chọn NHIỀU Bài trong "Danh sách Bài" để xoá gộp 1 lần — xem renderUnitsList/deleteUnitsCascade.
  const selectedUnitIdsForDelete = new Set();
  function applyQuizUnitFilter(items) {
    if (activeUnitId || !excludedUnitIds.size) return items;
    return items.filter((it) => !it.unitId || !excludedUnitIds.has(it.unitId));
  }
  function getUnits() {
    return (chapterMeta.units || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  }

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
        // Giữ lại TỪNG trang riêng (không chỉ gộp phẳng vào "points" ở trên) — cần để xoá được TỪNG
        // trang lỗi/trùng bên trong 1 Bài nhiều trang, khỏi bắt xoá sạch cả Bài rồi nạp lại từ đầu.
        pages: group,
        order: group[0].order,
        addedAt: group[0].addedAt,
        sourceFileName: fileName,
        unitId: group[0].unitId || null
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
        addedAt: group[0].addedAt,
        sourceFileName: fileName,
        unitId: group[0].unitId || null
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

  // Đang xem 1 "Bài" cụ thể (activeUnitId khác null) -> CHỈ hiện Tự thêm gán đúng Bài đó, ẨN hết nội
  // dung có sẵn trong app (builtin chưa được tổ chức theo Bài, xem chapterMeta.units ở trên).
  function getAllLessons() {
    const custom = groupCustomLessonsByFile(filterByActiveUnit(customLessonsCache).map((it) => Object.assign({ kind: 'custom' }, it)));
    return activeUnitId ? custom : mergeBuiltinWithOverrides(chapter.lessons, chapterMeta.lessonOverrides).concat(custom);
  }
  function getAllFlashcards() {
    const custom = filterByActiveUnit(customFlashcardsCache).map((it) => Object.assign({ kind: 'custom' }, it));
    return activeUnitId ? custom : mergeBuiltinWithOverrides(chapter.flashcards, chapterMeta.flashcardOverrides).concat(custom);
  }
  // Câu hỏi builtin KHÔNG gộp theo bài (giống lesson builtin) — chỉ câu tự thêm/nạp file mới có
  // `sourceFileName` để gộp. `getAllQuizItems()` vẫn trả về DANH SÁCH PHẲNG như trước (dùng ở
  // renderQuizStats, quiz-taking, exam-creator...) — grouping CHỈ áp dụng lúc VẼ ở renderQuizManager.
  function getAllQuizItems() {
    const custom = filterByActiveUnit(customQuizCache).map((it) => Object.assign({ kind: 'custom' }, it));
    return activeUnitId ? custom : mergeBuiltinWithOverrides(chapter.quiz, chapterMeta.quizOverrides).concat(custom);
  }
  function getGroupedQuizItems() {
    const custom = groupCustomQuizByFile(filterByActiveUnit(customQuizCache).map((it) => Object.assign({ kind: 'custom' }, it)));
    return activeUnitId ? custom : mergeBuiltinWithOverrides(chapter.quiz, chapterMeta.quizOverrides).concat(custom);
  }

  // ---------- "Bài" (đơn vị con Tự thêm trong chương) ----------
  // 1 Bài = { id, title, order }, lưu trong chapterMeta.units (mảng). 2 cách có 1 Bài:
  // 1) TỰ ĐỘNG — CHỈ khi nạp file BÀI GIẢNG (PDF) lúc KHÔNG đang xem 1 Bài nào (activeUnitId null) —
  //    1 file bài giảng luôn ứng với ĐÚNG 1 Bài thật (VD "Bài 2. Cân bằng..."), khớp quy ước "1 file =
  //    1 nhóm" của groupCustomLessonsByFile ở trên, nên tự tạo Bài mới đặt tên theo tên file luôn cho
  //    tiện (xem ensureUnitForImport bên dưới). File CÂU HỎI TRẮC NGHIỆM thì KHÔNG áp dụng — 1 file câu
  //    hỏi thường là ngân hàng đề TỔNG HỢP nhiều chủ đề (VD "CÁC DẠNG CÂU HỎI HOÁ HỌC.pdf"), không phải
  //    "1 file = 1 Bài" như bài giảng — nạp câu hỏi CHỈ gắn vào 1 Bài khi giáo viên ĐANG scope sẵn vào
  //    đúng Bài đó (activeUnitId có giá trị), tuyệt đối không tự bịa ra 1 Bài mới từ tên file câu hỏi
  //    (lỗi thực tế đã gặp — nạp "CÁC DẠNG CÂU HỎI HOÁ HỌC.pdf" tạo ra 1 "Bài" vô nghĩa cùng tên file).
  // 2) THỦ CÔNG — bấm "+ Thêm Bài mới" đặt tên trước rồi mới nạp nội dung (dùng cho flashcard, vì
  //    flashcard không có file để tự suy tên, HOẶC để tạo sẵn 1 Bài rồi nạp câu hỏi trắc nghiệm vào
  //    đúng Bài đó thay vì để trôi nổi ở phần Chung) — xem initUnitsSection.
  async function saveUnits(units) {
    await setChapterMeta(chapter.id, { units });
    chapterMeta.units = units;
  }

  // CHỈ dùng cho nạp file BÀI GIẢNG (PDF) — xem giải thích đầy đủ ở khối chú thích phía trên. Nạp file
  // câu hỏi trắc nghiệm KHÔNG được gọi hàm này (chỉ gắn unitId khi activeUnitId đã có sẵn, xem 2 nhánh
  // nạp PDF/Excel trắc nghiệm bên dưới).
  async function ensureUnitForImport(fileName) {
    if (activeUnitId) return activeUnitId;
    const units = getUnits();
    const nextOrder = units.length ? Math.max(...units.map((u) => u.order || 0)) + 1 : 0;
    const newUnit = { id: 'u' + Date.now(), title: fileName.replace(/\.[^.]+$/, ''), order: nextOrder };
    await saveUnits(units.concat([newUnit]));
    return newUnit.id;
  }

  // Khối 4 nút (giống hệt trong "Danh sách Bài") gắn TRỰC TIẾP vào đúng khối bài giảng/nhóm câu hỏi
  // vừa nạp — dùng chung 1 mảnh HTML + 1 cách gắn sự kiện (wireUnitOpenButtons) ở CẢ 3 nơi: danh sách
  // Bài rỗng, khối bài giảng (renderAllLessons), khối nhóm câu hỏi (renderQuizManager).
  function unitButtonsHtml(unitId) {
    const items = [
      ['tabLesson', '📖', 'Bài giảng'],
      ['tabFlash', '🗂️', 'Flashcard'],
      ['tabQuiz', '📝', 'Trắc nghiệm'],
      ['selfTestCard', '🎯', 'Tự kiểm tra']
    ];
    return `
      <div class="unit-actions" style="margin-top:8px;">
        ${items.map(([section, icon, label]) => `
          <button type="button" class="btn unit-open" data-id="${unitId}" data-section="${section}" title="${escapeHtml(label)}">
            <span class="unit-btn-icon">${icon}</span><span>${escapeHtml(label)}</span>
          </button>
        `).join('')}
      </div>
    `;
  }
  function wireUnitOpenButtons(container) {
    $$('.unit-open', container).forEach((btn) => {
      btn.addEventListener('click', () => goToUnitSection(btn.dataset.id, btn.dataset.section));
    });
  }

  function setActiveUnit(unitId) {
    activeUnitId = unitId;
    const bar = $('#unitScopeBar');
    if (unitId) {
      const unit = getUnits().find((u) => u.id === unitId);
      $('#unitScopeName').textContent = unit ? unit.title : '';
      bar.style.display = 'flex';
    } else {
      bar.style.display = 'none';
    }
    // Vẽ lại MỌI nơi phụ thuộc getAllLessons/getAllQuizItems/getAllFlashcards để đổi đúng phạm vi.
    renderAllLessons();
    renderFlash();
    rebuildEffectiveQuiz();
    renderQuiz();
    initSelfTest();
    renderQuizUnitFilterCard();
    if (owner.isOwner) {
      refreshLessonDeleteAllRow();
      refreshQuizDeleteAllRow();
      renderFlashManager();
      renderQuizManager();
      renderQuizStats();
    }
  }

  // initTabs() (js/app.js) chỉ gắn sự kiện click cho .tab-btn — không có sẵn hàm chuyển tab BẰNG CODE,
  // nên tự làm lại ĐÚNG logic tương tự (bật/tắt class "active" trên đúng cặp nút + khung nội dung).
  function activateTab(tabPanelId) {
    const tabBtns = $$('.tab-btn', document);
    const panels = $$('.tab-panel', document);
    tabBtns.forEach((b) => b.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));
    const btn = tabBtns.find((b) => b.dataset.tab === tabPanelId);
    if (btn) btn.classList.add('active');
    const panel = $('#' + tabPanelId);
    if (panel) panel.classList.add('active');
  }

  function goToUnitSection(unitId, sectionId) {
    setActiveUnit(unitId);
    activateTab(sectionId === 'selfTestCard' ? 'tabQuiz' : sectionId);
    if (sectionId === 'tabLesson') {
      // Bấm "📖 Bài giảng" là muốn ĐỌC LUÔN nội dung — tự mở sẵn (các) bài giảng của đúng Bài này,
      // khỏi bắt bấm thêm 1 lần vào tiêu đề (▸) mới xổ nội dung ra như trước.
      getAllLessons().forEach((l) => expandedLessonKeys.add(lessonKey(l)));
      renderAllLessons();
    } else if (sectionId === 'tabFlash') {
      // Bấm "🗂️ Flashcard" là muốn thấy NGAY danh sách flashcard hiện có + nút xem/xoá/thêm mới, khỏi
      // bấm thêm "⚙️ Quản lý flashcard" 1 lần nữa mới hiện ra.
      openFlashManagerPanel();
    }
    if (sectionId === 'selfTestCard') {
      // Nhảy thẳng vào màn Tự kiểm tra, khỏi qua menu "Ôn tập/Kiểm tra thử" trước cho tiện.
      showQuizSection('selfTestCard');
    } else if (sectionId === 'tabQuiz') {
      if (owner.isOwner) {
        // Giáo viên bấm "📝 Trắc nghiệm" là muốn XEM/CHỌN ĐÁP ÁN các câu hỏi NGAY — mở thẳng màn "Sửa
        // câu hỏi trắc nghiệm" (bỏ qua menu trung gian) và tự mở sẵn (các) nhóm câu hỏi của đúng Bài
        // này, khớp hành vi vừa sửa cho "📖 Bài giảng" (tự mở sẵn nội dung, khỏi bấm thêm lần nữa).
        getGroupedQuizItems().forEach((item) => { if (item.isGroup) expandedQuizKeys.add(quizGroupKey(item)); });
        showQuizSection('quizEditSection');
      } else {
        showQuizMenu();
      }
    }
    $('#chTabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // 1 Bài ĐÃ có bài giảng/trắc nghiệm thì 4 nút hiện NGAY trên đúng khối bài giảng/nhóm câu hỏi đó
  // (renderAllLessons/renderQuizManager, xem unitButtonsHtml) — mục "Danh sách Bài" ở đây CHỈ còn cần
  // hiện đủ 4 nút cho Bài CÒN TRỐNG (mới tạo tay, hoặc chỉ có flashcard — flashcard không có khối
  // riêng nào để gắn nút vào), tránh hiện trùng 2 nơi. Tên + Đổi tên/Xoá vẫn luôn hiện ở đây cho MỌI
  // Bài (kể cả đã có nội dung) để có 1 nơi quản lý chung duy nhất.
  function unitHasContentElsewhere(unitId) {
    return customLessonsCache.some((it) => it.unitId === unitId) || customQuizCache.some((it) => it.unitId === unitId);
  }

  function renderUnitsList() {
    const section = $('#unitsSection');
    if (section) {
      const units = getUnits();
      // Bài đã bị xoá (VD do 1 tab khác/thiết bị khác) không còn trong danh sách -> bỏ khỏi lựa chọn
      // đang tích, tránh giữ id "ma" khiến nút Xoá đã chọn tưởng còn N Bài trong khi thực ra ít hơn.
      const validIds = new Set(units.map((u) => u.id));
      Array.from(selectedUnitIdsForDelete).forEach((id) => { if (!validIds.has(id)) selectedUnitIdsForDelete.delete(id); });
      if (!units.length && !owner.isOwner) {
        section.style.display = 'none';
      } else {
        section.style.display = 'block';
        $('#unitsAddBtn').style.display = owner.isOwner ? 'block' : 'none';
        const deleteSelectedBtn = $('#unitsDeleteSelectedBtn');
        // Chỉ đáng hiện khi có TỪ 2 Bài trở lên — xoá 1 Bài đã có sẵn nút "Xoá cả Bài" riêng của nó rồi.
        deleteSelectedBtn.style.display = (owner.isOwner && units.length > 1) ? 'block' : 'none';
        deleteSelectedBtn.textContent = selectedUnitIdsForDelete.size
          ? `🗑️ Xoá ${selectedUnitIdsForDelete.size} Bài đã chọn`
          : '🗑️ Xoá các Bài đã chọn';
        deleteSelectedBtn.disabled = !selectedUnitIdsForDelete.size;
        const list = $('#unitsList');
        if (!units.length) {
          list.innerHTML = '<div class="hint">Chưa có Bài nào — bấm "+ Thêm Bài mới" để bắt đầu.</div>';
        } else {
          list.innerHTML = units.map((u, i) => `
            <div class="unit-row">
              <div class="unit-title" style="display:flex;align-items:center;gap:8px;">
                ${owner.isOwner && units.length > 1 ? `<input type="checkbox" class="unit-select-check" data-id="${u.id}" ${selectedUnitIdsForDelete.has(u.id) ? 'checked' : ''} />` : ''}
                <span>${escapeHtml(u.title)}</span>
              </div>
              ${owner.isOwner ? `
              <div class="unit-owner-actions hint">
                <a href="#" class="unit-rename" data-id="${u.id}">Đổi tên</a>
                ${i > 0 ? `· <a href="#" class="unit-move-up" data-id="${u.id}">↑</a>` : ''}
                ${i < units.length - 1 ? `· <a href="#" class="unit-move-down" data-id="${u.id}">↓</a>` : ''}
                ${unitHasContentElsewhere(u.id) ? `· <a href="#" class="unit-detach" data-id="${u.id}" title="Bỏ nội dung ra khỏi Bài này (không xoá) — dùng khi lỡ tạo nhầm Bài">Gỡ Bài (giữ nội dung)</a>` : ''}
                · <a href="#" class="unit-delete" data-id="${u.id}">Xoá cả Bài</a>
              </div>` : ''}
              ${unitHasContentElsewhere(u.id) ? '' : unitButtonsHtml(u.id)}
            </div>
          `).join('');
          wireUnitsList(list);
        }
      }
    }
    renderQuizUnitFilterCard();
  }

  // Checklist Bài đưa vào Ôn tập/Tự kiểm tra ở phần CHUNG (xem excludedUnitIds/applyQuizUnitFilter) —
  // CHỈ hiện khi đang ở phần Chung (activeUnitId null) VÀ chương có ít nhất 1 Bài, vì đã scope vào 1
  // Bài cụ thể thì tự nhiên chỉ còn đúng Bài đó, không cần chọn gì thêm.
  function renderQuizUnitFilterCard() {
    const card = $('#quizUnitFilterCard');
    if (!card) return;
    const units = getUnits();
    if (activeUnitId || !units.length) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    const list = $('#quizUnitFilterList');
    list.innerHTML = units.map((u) => `
      <label style="display:flex;gap:8px;align-items:center;margin-bottom:6px;cursor:pointer;">
        <input type="checkbox" class="quiz-unit-filter-check" data-id="${u.id}" ${excludedUnitIds.has(u.id) ? '' : 'checked'} />
        <span>${escapeHtml(u.title)}</span>
      </label>
    `).join('');
    $$('.quiz-unit-filter-check', list).forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) excludedUnitIds.delete(cb.dataset.id);
        else excludedUnitIds.add(cb.dataset.id);
        rebuildEffectiveQuiz();
        renderQuiz();
        initSelfTest();
      });
    });
  }

  function wireUnitsList(list) {
    wireUnitOpenButtons(list);
    $$('.unit-rename', list).forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        const units = getUnits();
        const unit = units.find((u) => u.id === a.dataset.id);
        if (!unit) return;
        const title = prompt('Tên mới cho Bài:', unit.title);
        if (!title || !title.trim() || title.trim() === unit.title) return;
        try {
          const newUnits = units.map((u) => (u.id === unit.id ? Object.assign({}, u, { title: title.trim() }) : u));
          await saveUnits(newUnits);
          if (activeUnitId === unit.id) $('#unitScopeName').textContent = title.trim();
          renderUnitsList();
        } catch (err) {
          showToast('Không đổi được tên: ' + err.message);
        }
      });
    });
    $$('.unit-move-up, .unit-move-down', list).forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        const units = getUnits();
        const idx = units.findIndex((u) => u.id === a.dataset.id);
        const swapWith = a.classList.contains('unit-move-up') ? idx - 1 : idx + 1;
        if (idx === -1 || swapWith < 0 || swapWith >= units.length) return;
        const newUnits = units.map((u, i) => Object.assign({}, u));
        [newUnits[idx].order, newUnits[swapWith].order] = [newUnits[swapWith].order, newUnits[idx].order];
        try {
          await saveUnits(newUnits);
          renderUnitsList();
        } catch (err) {
          showToast('Không đổi được thứ tự: ' + err.message);
        }
      });
    });
    $$('.unit-delete', list).forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); deleteUnitsCascade([a.dataset.id]); });
    });
    $$('.unit-detach', list).forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); detachUnit(a.dataset.id); });
    });
    $$('.unit-select-check', list).forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) selectedUnitIdsForDelete.add(cb.dataset.id);
        else selectedUnitIdsForDelete.delete(cb.dataset.id);
        const btn = $('#unitsDeleteSelectedBtn');
        btn.textContent = selectedUnitIdsForDelete.size ? `🗑️ Xoá ${selectedUnitIdsForDelete.size} Bài đã chọn` : '🗑️ Xoá các Bài đã chọn';
        btn.disabled = !selectedUnitIdsForDelete.size;
      });
    });
  }

  // Xoá cả 1 HOẶC NHIỀU Bài cùng lúc (dùng chung cho nút "Xoá cả Bài" của từng dòng LẪN nút "Xoá các
  // Bài đã chọn" ở dưới) — xoá sạch bài giảng/trắc nghiệm/flashcard bên trong TỪNG Bài rồi mới xoá
  // entry khỏi chapterMeta.units, gộp 1 lượt xác nhận + 1 lượt vẽ lại duy nhất dù xoá bao nhiêu Bài.
  async function deleteUnitsCascade(unitIds) {
    const units = getUnits();
    const targets = units.filter((u) => unitIds.includes(u.id));
    if (!targets.length) return;
    const lessonIds = customLessonsCache.filter((it) => unitIds.includes(it.unitId)).map((it) => it.id);
    const quizIds = customQuizCache.filter((it) => unitIds.includes(it.unitId)).map((it) => it.id);
    const flashIds = customFlashcardsCache.filter((it) => unitIds.includes(it.unitId)).map((it) => it.id);
    const totalCount = lessonIds.length + quizIds.length + flashIds.length;
    const confirmMsg = targets.length > 1
      ? `Xoá ${targets.length} Bài đã chọn (${targets.map((u) => `"${u.title}"`).join(', ')})? Sẽ xoá tổng cộng ${lessonIds.length} phần bài giảng, ${quizIds.length} câu hỏi, ${flashIds.length} flashcard. Không thể hoàn tác.`
      : `Xoá cả Bài "${targets[0].title}"? Sẽ xoá ${lessonIds.length} phần bài giảng, ${quizIds.length} câu hỏi, ${flashIds.length} flashcard bên trong Bài này. Không thể hoàn tác.`;
    if (!confirm(confirmMsg)) return;
    try {
      await Promise.all([
        ...lessonIds.map((id) => deleteCustomLesson(id)),
        ...quizIds.map((id) => deleteCustomQuiz(id)),
        ...flashIds.map((id) => deleteCustomFlashcard(id))
      ]);
      customLessonsCache = customLessonsCache.filter((it) => !unitIds.includes(it.unitId));
      customQuizCache = customQuizCache.filter((it) => !unitIds.includes(it.unitId));
      customFlashcardsCache = customFlashcardsCache.filter((it) => !unitIds.includes(it.unitId));
      unitIds.forEach((id) => { excludedUnitIds.delete(id); selectedUnitIdsForDelete.delete(id); });
      const newUnits = units.filter((u) => !unitIds.includes(u.id));
      await saveUnits(newUnits);
      if (unitIds.includes(activeUnitId)) {
        setActiveUnit(null);
      } else {
        rebuildEffectiveQuiz();
        renderAllLessons();
        renderFlash();
        renderQuiz();
        if (owner.isOwner) { renderQuizManager(); renderFlashManager(); renderQuizStats(); }
      }
      renderUnitsList();
      showToast(targets.length > 1 ? `Đã xoá ${targets.length} Bài (${totalCount} mục).` : `Đã xoá cả Bài "${targets[0].title}" (${totalCount} mục).`, false);
    } catch (err) {
      showToast('Không xoá được: ' + err.message);
    }
  }

  // Gỡ 1 Bài nhưng GIỮ NGUYÊN nội dung bên trong (chỉ bỏ unitId, chuyển về phần "Chung") — khác hẳn
  // "Xoá cả Bài" (xoá sạch dữ liệu). Dùng khi 1 Bài được tạo NHẦM (VD trước đây nạp file câu hỏi trắc
  // nghiệm lại tự tạo thành 1 "Bài" vô nghĩa cùng tên file — lỗi đã sửa, nhưng Bài lỡ tạo trước đó vẫn
  // còn) mà giáo viên không muốn mất câu hỏi/bài giảng/flashcard đã nạp bên trong.
  async function detachUnit(unitId) {
    const units = getUnits();
    const unit = units.find((u) => u.id === unitId);
    if (!unit) return;
    const lessonItems = customLessonsCache.filter((it) => it.unitId === unitId);
    const quizItems = customQuizCache.filter((it) => it.unitId === unitId);
    const flashItems = customFlashcardsCache.filter((it) => it.unitId === unitId);
    const totalCount = lessonItems.length + quizItems.length + flashItems.length;
    if (!confirm(`Gỡ Bài "${unit.title}"? ${totalCount} mục bên trong (${lessonItems.length} phần bài giảng, ${quizItems.length} câu hỏi, ${flashItems.length} flashcard) sẽ được GIỮ NGUYÊN, chỉ chuyển về phần "Chung" (không còn thuộc Bài nào nữa). Có thể gán lại vào 1 Bài khác sau nếu muốn.`)) return;
    try {
      await Promise.all([
        ...lessonItems.map((it) => updateCustomLesson(it.id, { unitId: null })),
        ...quizItems.map((it) => updateCustomQuiz(it.id, { unitId: null })),
        ...flashItems.map((it) => updateCustomFlashcard(it.id, { unitId: null }))
      ]);
      lessonItems.forEach((it) => { it.unitId = null; });
      quizItems.forEach((it) => { it.unitId = null; });
      flashItems.forEach((it) => { it.unitId = null; });
      excludedUnitIds.delete(unitId);
      selectedUnitIdsForDelete.delete(unitId);
      const newUnits = units.filter((u) => u.id !== unitId);
      await saveUnits(newUnits);
      if (activeUnitId === unitId) {
        setActiveUnit(null);
      } else {
        rebuildEffectiveQuiz();
        renderAllLessons();
        renderFlash();
        renderQuiz();
        if (owner.isOwner) { renderQuizManager(); renderFlashManager(); renderQuizStats(); }
      }
      renderUnitsList();
      showToast(`Đã gỡ Bài "${unit.title}" — ${totalCount} mục bên trong vẫn còn nguyên, đã chuyển về phần Chung.`, false);
    } catch (err) {
      showToast('Không gỡ được: ' + err.message);
    }
  }

  function initUnitsSection() {
    const backLink = $('#unitScopeBackLink');
    if (backLink) backLink.addEventListener('click', (e) => { e.preventDefault(); setActiveUnit(null); });
    if (owner.isOwner) {
      const addBtn = $('#unitsAddBtn');
      if (addBtn) addBtn.addEventListener('click', async () => {
        const title = prompt('Tên Bài mới (VD: "Bài 3. Tốc độ phản ứng"):');
        if (!title || !title.trim()) return;
        const units = getUnits();
        const nextOrder = units.length ? Math.max(...units.map((u) => u.order || 0)) + 1 : 0;
        const newUnits = units.concat([{ id: 'u' + Date.now(), title: title.trim(), order: nextOrder }]);
        try {
          await saveUnits(newUnits);
          renderUnitsList();
        } catch (err) {
          showToast('Không tạo được Bài mới: ' + err.message);
        }
      });
      const deleteSelectedBtn = $('#unitsDeleteSelectedBtn');
      if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', () => {
        if (selectedUnitIdsForDelete.size) deleteUnitsCascade(Array.from(selectedUnitIdsForDelete));
      });
    }
    renderUnitsList();
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

  // 1 Bài nạp từ file nhiều trang (isGroup) hiện TỪNG TRANG riêng (không gộp phẳng như trước) kèm nút
  // xoá RIÊNG cho từng trang — trước đây chỉ có "Xoá cả bài" (xoá sạch mọi trang cùng lúc), lỡ 1 trang
  // bị lỗi/trùng phải xoá hết rồi nạp lại từ đầu. Mục đơn (không phải nhóm, kể cả có sẵn trong app) vẫn
  // hiện y như cũ (renderLessonPointsHtml thẳng), không có khái niệm "từng trang" để xoá riêng.
  function renderLessonPagesHtml(l) {
    if (!l.isGroup) return renderLessonPointsHtml(l.points);
    return l.pages.map((p, i) => `
      <div class="lesson-page-block">
        ${owner.isOwner ? `<div class="lesson-page-del-row"><a href="#" class="lesson-delete-page lesson-page-del" data-id="${p.id}" title="Xoá trang này">${i + 1}/${l.pages.length} 🗑️</a></div>` : ''}
        ${renderLessonPointsHtml(p.points)}
      </div>
    `).join('');
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
          ${expanded ? renderLessonPagesHtml(l) : ''}
          ${owner.isOwner ? `
            <div class="hint" style="margin-top:8px;">
              ${l.kind === 'builtin' ? (l.edited ? 'Đã sửa' : 'Có sẵn trong app') : (l.isGroup ? `Tự thêm (${l.groupIds.length} phần)` : 'Tự thêm')}
              ${(l.kind === 'custom' && l.isGroup) ? '' : `· <a href="#" class="lesson-edit" data-kind="${l.kind}" data-key="${l.kind === 'builtin' ? l.index : l.id}">Sửa</a>`}
              · <a href="#" class="lesson-delete" data-kind="${l.kind}" data-key="${l.kind === 'builtin' ? l.index : l.id}">${l.kind === 'builtin' ? 'Ẩn' : (l.isGroup ? 'Xoá cả bài' : 'Xoá')}</a>
              ${l.kind === 'builtin' && l.edited ? ` · <a href="#" class="lesson-restore" data-key="${l.index}">Khôi phục mặc định</a>` : ''}
              ${l.isGroup ? '' : bankShareLinkHtml('lesson', l)}
              ${l.kind === 'custom' ? `· <a href="#" class="lesson-ai-generate" data-key="${key}">🤖 Tạo bằng AI</a>` : ''}
            </div>
            ${l.kind === 'custom' ? savedLessonPlansHtml(key) : ''}
          ` : ''}
          ${l.kind === 'custom' && l.unitId ? unitButtonsHtml(l.unitId) : ''}
        </div>
      `;
      }).join('');
    }
    setChapterProgress(chapter.id, { lessonViewed: true });
    refreshDots();
    wireLessonToggles(box);
    wireUnitOpenButtons(box);
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

  function savedLessonPlansHtml(key) {
    const plans = customLessonPlansCache.filter((p) => p.sourceLessonKey === key);
    if (!plans.length) return '';
    return `
      <div class="hint" style="margin-top:4px;">
        📋 Giáo án đã tạo:
        ${plans.map((p) => `${escapeHtml(p.tenBai || 'Giáo án')} (<a href="#" class="lessonplan-view" data-id="${p.id}">Xem/In</a> · <a href="#" class="lessonplan-delete" data-id="${p.id}">xoá</a>)`).join(' · ')}
      </div>
    `;
  }

  function wireLessonActions(box) {
    $$('.lesson-ai-generate', box).forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const item = getAllLessons().find((it) => lessonKey(it) === a.dataset.key);
        if (item) openAiGeneratePanel(item);
      });
    });
    $$('.lessonplan-view', box).forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const plan = customLessonPlansCache.find((p) => p.id === a.dataset.id);
        if (plan) printLessonPlan(plan);
      });
    });
    $$('.lessonplan-delete', box).forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!confirm('Xoá giáo án này?')) return;
        const id = a.dataset.id;
        try {
          await deleteCustomLessonPlan(id);
          customLessonPlansCache = customLessonPlansCache.filter((p) => p.id !== id);
          renderAllLessons();
        } catch (err) { showToast('Không xoá được: ' + err.message); }
      });
    });
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
    $$('.lesson-delete-page', box).forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        const id = a.dataset.id;
        if (!confirm('Xoá trang này? Không thể hoàn tác.')) return;
        try {
          await deleteCustomLesson(id);
          customLessonsCache = customLessonsCache.filter((it) => it.id !== id);
          renderAllLessons();
        } catch (err) {
          showToast('Không xoá được: ' + err.message);
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
          const payload = { title, points, sourceFileName: null };
          if (activeUnitId) payload.unitId = activeUnitId;
          const id = await addCustomLesson(chapter.id, payload);
          customLessonsCache.push(Object.assign({ id, chapterId: chapter.id }, payload));
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
        const unitId = await ensureUnitForImport(fileName);
        await addCustomLessonBatch(chapter.id, chosen.map((sec) =>
          Object.assign({ title: sec.title, points: sec.points, sourceFileName: fileName, unitId })
        ));
        customLessonsCache = await getCustomLessons(owner.uid, chapter.id);
        box.innerHTML = `<div class="result-box show">✓ Đã lưu vào chương.</div>`;
        renderUnitsList();
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
    // Ẩn khi đang xem 1 Bài cụ thể — nút này xoá TOÀN BỘ bài giảng tự thêm của CẢ CHƯƠNG, dễ hiểu
    // nhầm là "xoá của Bài đang xem" và xoá nhầm nội dung Bài khác. Xoá riêng 1 Bài dùng "Xoá cả Bài".
    row.style.display = (owner.isOwner && customLessonsCache.length && !activeUnitId) ? 'flex' : 'none';
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

  // ---------- Tạo trắc nghiệm/tự luận/flashcard/giáo án bằng AI từ 1 bài giảng Tự thêm — CHỈ gói Pro
  // ----------
  // Cloud Function generateFromLesson (functions/index.js) KHÔNG tự ghi Firestore, chỉ trả về nội
  // dung đã soạn — giáo viên xem trước (bỏ tích câu không ưng, hoặc xem/in giáo án) rồi mới lưu bằng
  // ĐÚNG addCustomQuizBatch/addCustomFlashcard/addCustomLessonPlan đã dùng cho nạp PDF/Excel (không
  // trùng lặp logic ghi, không mất bước duyệt của giáo viên trước khi lưu thật).
  let aiGeneratedItems = [];
  const AI_LEVEL_LABELS = { biet: 'Nhận biết', hieu: 'Thông hiểu', vandung: 'Vận dụng', vandungcao: 'Vận dụng cao' };

  async function openAiGeneratePanel(lessonItem) {
    const panel = $('#aiGeneratePanel');
    const body = $('#aiGenerateBody');
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    body.innerHTML = '<p class="hint">⏳ Đang kiểm tra gói Pro...</p>';

    let sub;
    try {
      sub = await getTeacherSubscription(owner.uid);
    } catch (e) {
      body.innerHTML = `<div class="result-box show error">⚠️ Không kiểm tra được gói Pro: ${escapeHtml(e.message)}</div>`;
      return;
    }
    const isPro = sub.tier === 'pro' && (!sub.expiresAt || new Date(sub.expiresAt) >= new Date());
    if (!isPro) {
      body.innerHTML = `
        <div class="result-box show">
          🔒 Tính năng tạo bằng AI chỉ dành cho gói <strong>Pro</strong>. Nâng cấp Pro để dùng thử.
        </div>
      `;
      return;
    }
    renderAiGenerateForm(lessonItem);
  }

  // Khung nhập riêng theo từng loại — "tập trung đúng chuyên môn" thay vì chỉ 1 ô "số lượng" chung:
  // trắc nghiệm/tự luận chia theo 4 mức độ nhận thức (Thông tư 22/2021), giáo án hỏi rõ Lớp/Số tiết.
  function aiModeFieldsHtml(mode) {
    if (mode === 'quiz' || mode === 'essay') {
      return `
        <p class="hint" style="margin:0 0 6px;">Số câu theo từng mức độ (Thông tư 22/2021):</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div class="field"><label for="aiLevelBiet">Nhận biết</label><input type="number" id="aiLevelBiet" min="0" max="15" value="4" /></div>
          <div class="field"><label for="aiLevelHieu">Thông hiểu</label><input type="number" id="aiLevelHieu" min="0" max="15" value="3" /></div>
          <div class="field"><label for="aiLevelVandung">Vận dụng</label><input type="number" id="aiLevelVandung" min="0" max="15" value="2" /></div>
          <div class="field"><label for="aiLevelVandungcao">Vận dụng cao</label><input type="number" id="aiLevelVandungcao" min="0" max="15" value="1" /></div>
        </div>
      `;
    }
    if (mode === 'flashcard') {
      return `
        <div class="field">
          <label for="aiGenerateCount">Số lượng</label>
          <select id="aiGenerateCount">
            <option value="5">5</option>
            <option value="10" selected>10</option>
            <option value="15">15</option>
          </select>
        </div>
      `;
    }
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div class="field">
          <label for="aiLop">Lớp</label>
          <select id="aiLop">${[6, 7, 8, 9, 10, 11, 12].map((g) => `<option value="${g}">Lớp ${g}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="aiSoTiet">Số tiết</label>
          <input type="number" id="aiSoTiet" min="1" max="10" value="1" />
        </div>
      </div>
    `;
  }

  function renderAiGenerateForm(lessonItem) {
    const body = $('#aiGenerateBody');
    body.innerHTML = `
      <p class="hint" style="margin-top:-4px;">Tạo từ bài giảng: <strong>${escapeHtml(lessonItem.title)}</strong></p>
      <div class="field">
        <label for="aiGenerateMode">Loại muốn tạo</label>
        <select id="aiGenerateMode">
          <option value="quiz">Trắc nghiệm (4 đáp án)</option>
          <option value="essay">Tự luận (câu trả lời ngắn)</option>
          <option value="flashcard">Flashcard</option>
          <option value="lessonplan">Giáo án (theo mẫu Công văn 5512)</option>
        </select>
      </div>
      <div id="aiModeFields">${aiModeFieldsHtml('quiz')}</div>
      <button class="btn primary block" id="aiGenerateStartBtn">🤖 Tạo ngay</button>
      <button class="btn block" id="aiGenerateCloseBtn" style="margin-top:8px;">Đóng</button>
    `;
    $('#aiGenerateMode').addEventListener('change', (e) => {
      $('#aiModeFields').innerHTML = aiModeFieldsHtml(e.target.value);
    });
    $('#aiGenerateStartBtn').addEventListener('click', () => runAiGenerate(lessonItem));
    $('#aiGenerateCloseBtn').addEventListener('click', () => { $('#aiGeneratePanel').style.display = 'none'; });
  }

  function buildAiRequestData(mode, lessonItem) {
    const data = { mode, lessonTitle: lessonItem.title, points: lessonItem.points };
    if (mode === 'quiz' || mode === 'essay') {
      data.levels = {
        biet: parseInt($('#aiLevelBiet').value, 10) || 0,
        hieu: parseInt($('#aiLevelHieu').value, 10) || 0,
        vandung: parseInt($('#aiLevelVandung').value, 10) || 0,
        vandungcao: parseInt($('#aiLevelVandungcao').value, 10) || 0
      };
    } else if (mode === 'flashcard') {
      data.count = parseInt($('#aiGenerateCount').value, 10);
    } else {
      data.lop = $('#aiLop').value;
      data.soTiet = parseInt($('#aiSoTiet').value, 10) || 1;
    }
    return data;
  }

  async function runAiGenerate(lessonItem) {
    const mode = $('#aiGenerateMode').value;
    const btn = $('#aiGenerateStartBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Đang tạo (có thể mất 10-30 giây)...';
    try {
      const { functions } = ensureFirebase();
      if (!functions) throw new Error('Chưa tải được kết nối AI — thử tải lại trang.');
      const call = functions.httpsCallable('generateFromLesson');
      const res = await call(buildAiRequestData(mode, lessonItem));
      aiGeneratedItems = (res.data && res.data.items) || [];
      if (!aiGeneratedItems.length) throw new Error('AI không tạo được nội dung nào từ bài giảng này.');
      renderAiGenerateReview(lessonItem, mode);
    } catch (err) {
      $('#aiGenerateBody').insertAdjacentHTML('beforeend', `<div class="result-box show error" style="margin-top:10px;">⚠️ ${escapeHtml(err.message || 'Có lỗi xảy ra.')}</div>`);
      btn.disabled = false;
      btn.textContent = '🤖 Tạo ngay';
    }
  }

  function renderAiGenerateReview(lessonItem, mode) {
    const body = $('#aiGenerateBody');
    if (mode === 'lessonplan') {
      const plan = aiGeneratedItems[0];
      body.innerHTML = `
        <p class="hint" style="margin-top:-4px;">AI đã soạn xong giáo án — xem lại rồi bấm "Lưu giáo án".</p>
        <div style="max-height:420px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:12px;background:var(--bg-soft);">
          ${formatLessonPlanHtml(plan)}
        </div>
        <div class="btn-row" style="margin-top:10px;">
          <button class="btn primary" id="aiGenerateSaveBtn" style="flex:1;">💾 Lưu giáo án</button>
          <button class="btn" id="aiGeneratePrintBtn" style="flex:1;">🖨️ In / Lưu PDF</button>
          <button class="btn" id="aiGenerateCloseBtn" style="flex:1;">Huỷ</button>
        </div>
      `;
      $('#aiGenerateSaveBtn').addEventListener('click', () => saveAiGeneratedItems(lessonItem, mode));
      $('#aiGeneratePrintBtn').addEventListener('click', () => printLessonPlan(plan));
      $('#aiGenerateCloseBtn').addEventListener('click', () => { $('#aiGeneratePanel').style.display = 'none'; });
      return;
    }

    const rows = aiGeneratedItems.map((it, i) => {
      const levelBadge = it.level ? `<span style="font-weight:600;">[${AI_LEVEL_LABELS[it.level] || it.level}]</span> ` : '';
      const detail = mode === 'quiz'
        ? it.options.map((o, oi) => `${oi === it.correct ? '✓ ' : ''}${escapeHtml(o)}`).join(' · ')
        : mode === 'essay'
          ? `Đáp án: ${escapeHtml(String(it.acceptedAnswers || '').split('|').join(' / '))}`
          : escapeHtml(it.back);
      const title = mode === 'flashcard' ? it.front : it.q;
      return `
        <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:12px;cursor:pointer;">
          <input type="checkbox" class="ai-item-check" data-idx="${i}" checked style="margin-top:3px;flex-shrink:0;" />
          <span>
            ${levelBadge}<strong>${escapeHtml(title)}</strong>
            <div class="hint" style="margin-top:2px;">${detail}</div>
          </span>
        </label>
      `;
    }).join('');
    const kindLabel = mode === 'quiz' ? 'câu hỏi trắc nghiệm' : mode === 'essay' ? 'câu hỏi tự luận' : 'flashcard';
    body.innerHTML = `
      <p class="hint" style="margin-top:-4px;">AI đã tạo ${aiGeneratedItems.length} ${kindLabel} — bỏ tích mục không ưng, rồi bấm "Lưu vào chương".</p>
      ${rows}
      <div class="btn-row">
        <button class="btn primary" id="aiGenerateSaveBtn" style="flex:1;">Lưu vào chương</button>
        <button class="btn" id="aiGenerateCloseBtn" style="flex:1;">Huỷ</button>
      </div>
    `;
    $('#aiGenerateSaveBtn').addEventListener('click', () => saveAiGeneratedItems(lessonItem, mode));
    $('#aiGenerateCloseBtn').addEventListener('click', () => { $('#aiGeneratePanel').style.display = 'none'; });
  }

  async function saveAiGeneratedItems(lessonItem, mode) {
    const body = $('#aiGenerateBody');
    const saveBtn = $('#aiGenerateSaveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Đang lưu...';
    try {
      if (mode === 'lessonplan') {
        const plan = aiGeneratedItems[0];
        const payload = Object.assign({ sourceLessonKey: lessonKey(lessonItem) }, plan);
        const id = await addCustomLessonPlan(chapter.id, payload);
        customLessonPlansCache.push(Object.assign({ id, chapterId: chapter.id }, payload));
        renderAllLessons();
        $('#aiGeneratePanel').style.display = 'none';
        showToast('Đã lưu giáo án.', false);
        return;
      }

      const chosen = $$('.ai-item-check', body).filter((c) => c.checked).map((c) => aiGeneratedItems[parseInt(c.dataset.idx, 10)]);
      if (!chosen.length) { saveBtn.disabled = false; saveBtn.textContent = 'Lưu vào chương'; return; }

      if (mode === 'quiz' || mode === 'essay') {
        const questions = chosen.map((it) => {
          const q = it.type === 'abcd'
            ? { q: it.q, type: 'abcd', options: it.options, correct: it.correct, explain: it.explain || '' }
            : { q: it.q, type: 'text', acceptedAnswers: it.acceptedAnswers, explain: it.explain || '' };
          if (lessonItem.unitId) q.unitId = lessonItem.unitId;
          return q;
        });
        await addCustomQuizBatch(chapter.id, questions);
        customQuizCache = await getCustomQuiz(owner.uid, chapter.id);
        rebuildEffectiveQuiz();
        renderQuizManager();
        renderQuiz();
        renderQuizStats();
      } else {
        await Promise.all(chosen.map(async (it) => {
          const payload = lessonItem.unitId ? { front: it.front, back: it.back, unitId: lessonItem.unitId } : { front: it.front, back: it.back };
          const id = await addCustomFlashcard(chapter.id, payload);
          customFlashcardsCache.push(Object.assign({ id, chapterId: chapter.id }, payload));
        }));
        renderFlashManager();
        renderFlash();
      }
      renderUnitsList();
      $('#aiGeneratePanel').style.display = 'none';
      showToast(`Đã lưu ${chosen.length} mục vào chương.`, false);
    } catch (err) {
      showToast('Không lưu được: ' + err.message);
      saveBtn.disabled = false;
      saveBtn.textContent = mode === 'lessonplan' ? '💾 Lưu giáo án' : 'Lưu vào chương';
    }
  }

  // formatLessonPlanHtml/printLessonPlan giờ dùng bản DÙNG CHUNG ở lessonplan-format.js (cũng dùng
  // cho trang "Kho giáo án" — lessonplan-bank.js) — xem <script> nạp trước file này trong chuong.html.

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

  // Mở sẵn khung quản lý flashcard (danh sách + nút thêm mới) — dùng khi bấm "🗂️ Flashcard" của 1 Bài
  // (xem goToUnitSection) để thấy đủ xem/xoá/thêm NGAY, khỏi bấm thêm "⚙️ Quản lý flashcard" 1 lần nữa.
  function openFlashManagerPanel() {
    if (!owner.isOwner) return;
    $('#flashFormWrap').style.display = 'block';
    $('#flashManagerToggle').textContent = '⚙️ Ẩn quản lý flashcard';
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
          const payload = activeUnitId ? { front, back, unitId: activeUnitId } : { front, back };
          const id = await addCustomFlashcard(chapter.id, payload);
          customFlashcardsCache.push(Object.assign({ id, chapterId: chapter.id }, payload));
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

  let selfTestWired = false;
  function initSelfTest() {
    // Không tự hiện #selfTestCard nữa — chỉ chuẩn bị dữ liệu/wiring, còn hiển thị do menu Trắc
    // nghiệm điều khiển (xem initQuizMenu) khi học sinh bấm "🎯 Kiểm tra thử".
    // Gọi lại được NHIỀU LẦN (mỗi lần đổi phạm vi Bài đang xem, xem setActiveUnit) vì số câu khả dụng
    // đổi theo — nhưng CHỈ gắn sự kiện click 1 lần duy nhất (selfTestWired), tránh chồng nhiều listener
    // khiến bấm 1 lần chạy startSelfTest() nhiều lần.
    const total = effectiveQuiz.length;
    if (total < 5) {
      $('#selfTestSetup').style.display = 'none';
      $('#selfTestNotEnough').style.display = 'block';
    } else {
      $('#selfTestSetup').style.display = 'block';
      $('#selfTestNotEnough').style.display = 'none';
      const validCounts = SELF_TEST_COUNT_OPTIONS.filter((n) => n <= total);
      if (!validCounts.includes(total)) validCounts.push(total);
      const defaultCount = validCounts.includes(10) ? 10 : validCounts[validCounts.length - 1];
      $('#selfTestCount').innerHTML = validCounts.map((n) =>
        `<option value="${n}" ${n === defaultCount ? 'selected' : ''}>${n} câu</option>`
      ).join('');
    }
    if (!selfTestWired) {
      selfTestWired = true;
      $('#selfTestStartBtn').addEventListener('click', startSelfTest);
    }
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
    // Câu nạp từ PDF (cắt ảnh) không có nội dung THẬT trong item.q/item.options (chỉ là nhãn/chữ cái
    // giữ chỗ, xem doc-import.js) — PHẢI vẽ ảnh qua getQuizVisual() giống hệt renderQuiz() (chế độ Ôn
    // tập) đang làm, nếu không câu hỏi hiện trống trơn không có gì để làm bài (đã xảy ra thực tế).
    const visual = getQuizVisual(item);
    $('#selfTestRunning').innerHTML = `
      <div class="quiz-progress" style="display:flex;justify-content:space-between;">
        <span>Câu ${stIndex + 1}/${total}</span>
        <span id="selfTestTimer" style="font-weight:700;color:var(--brand);">${formatCountdown(stDeadline - Date.now())}</span>
      </div>
      ${visual ? `<div class="quiz-question-image${visual.stemMultiline ? ' multiline' : ''}"><img src="${visual.stemSrc}" alt="Ảnh câu hỏi"></div>` : ''}
      <div class="quiz-question">${escapeHtml(item.q)}</div>
      ${visual && visual.combinedOptionsSrc ? `<div class="quiz-question-image"><img src="${visual.combinedOptionsSrc}" alt="Ảnh đáp án"></div>` : ''}
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
    } else if (visual && visual.optionSrcs) {
      // Đáp án tách riêng thành ảnh (Tầng 1) — nhãn A/B/C/D TỰ VẼ, giống hệt renderQuiz().
      const labels = ['A', 'B', 'C', 'D'];
      visual.optionSrcs.forEach((src, i) => {
        const b = document.createElement('button');
        b.className = 'quiz-option quiz-option-image' + (answered && i === stAnswers[stIndex] ? ' selected' : '');
        b.innerHTML = `<span class="quiz-option-label">${labels[i]}.</span><img src="${src}" alt="Đáp án ${labels[i]}">`;
        b.addEventListener('click', () => { stAnswers[stIndex] = i; renderSelfTestQuestion(); });
        optWrap.appendChild(b);
      });
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
      // Câu nạp từ PDF (cắt ảnh) không có nội dung THẬT trong item.q/item.options — không vẽ ảnh thì
      // xem lại chỉ thấy "Câu N (xem ảnh)" + 1 chữ cái, không biết đề/đáp án thật là gì.
      const visual = getQuizVisual(item);
      const stemHtml = visual
        ? `<div class="quiz-question-image${visual.stemMultiline ? ' multiline' : ''}" style="margin-bottom:6px;"><img src="${visual.stemSrc}" alt="Ảnh câu hỏi"></div>`
        : '';
      const optsImgHtml = visual && visual.combinedOptionsSrc
        ? `<div class="quiz-question-image" style="margin-bottom:6px;"><img src="${visual.combinedOptionsSrc}" alt="Ảnh đáp án"></div>`
        : '';
      return `
        <div class="quiz-review-item ${isOk ? 'ok' : 'bad'}">
          ${stemHtml}
          <div class="qi-q">${i + 1}. ${escapeHtml(item.q)}</div>
          ${optsImgHtml}
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
    effectiveQuiz = applyQuizUnitFilter(getAllQuizItems());
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
    const visual = getQuizVisual(item);
    $('#quizWrap').innerHTML = `
      <div class="quiz-progress">Câu ${qIndex + 1}/${total}</div>
      ${visual ? `<div class="quiz-question-image${visual.stemMultiline ? ' multiline' : ''}"><img src="${visual.stemSrc}" alt="Ảnh câu hỏi"></div>` : ''}
      <div class="quiz-question">${escapeHtml(item.q)}</div>
      ${visual && visual.combinedOptionsSrc ? `<div class="quiz-question-image"><img src="${visual.combinedOptionsSrc}" alt="Ảnh đáp án"></div>` : ''}
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
    } else if (visual && visual.optionSrcs) {
      // Đáp án tách riêng thành ảnh (Tầng 1) — nhãn A/B/C/D TỰ VẼ (không phải pixel), luôn đúng vị trí
      // hiện tại của nút dù đề có trộn thứ tự đáp án hay không.
      const labels = ['A', 'B', 'C', 'D'];
      visual.optionSrcs.forEach((src, i) => {
        const b = document.createElement('button');
        b.className = 'quiz-option quiz-option-image';
        b.innerHTML = `<span class="quiz-option-label">${labels[i]}.</span><img src="${src}" alt="Đáp án ${labels[i]}">`;
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
      // Câu nạp từ PDF (cắt ảnh) không có nội dung THẬT trong item.q/item.options — không vẽ ảnh thì
      // xem lại chỉ thấy "Câu N (xem ảnh)" + 1 chữ cái, không biết đề/đáp án thật là gì.
      const visual = getQuizVisual(item);
      const stemHtml = visual
        ? `<div class="quiz-question-image${visual.stemMultiline ? ' multiline' : ''}" style="margin-bottom:6px;"><img src="${visual.stemSrc}" alt="Ảnh câu hỏi"></div>`
        : '';
      const optsImgHtml = visual && visual.combinedOptionsSrc
        ? `<div class="quiz-question-image" style="margin-bottom:6px;"><img src="${visual.combinedOptionsSrc}" alt="Ảnh đáp án"></div>`
        : '';
      return `
        <div class="quiz-review-item ${isOk ? 'ok' : 'bad'}">
          ${stemHtml}
          <div class="qi-q">${i + 1}. ${escapeHtml(item.q)}</div>
          ${optsImgHtml}
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
    // Ẩn khi đang xem 1 Bài cụ thể — nút này xoá TOÀN BỘ câu hỏi tự thêm của CẢ CHƯƠNG, dễ hiểu nhầm
    // là "xoá của Bài đang xem" và xoá nhầm nội dung Bài khác. Xoá riêng 1 Bài dùng "Xoá cả Bài".
    row.style.display = (owner.isOwner && customQuizCache.length && !activeUnitId) ? 'flex' : 'none';
  }

  // Markup xem trước ảnh câu hỏi cắt từ PDF (dùng chung 3 chỗ: danh sách quản lý, form sửa, xem toàn
  // bộ đề vừa nạp) — dựa trên getQuizVisual (quiz-common.js) để hiện đúng dù câu ở Tầng 1/2/3 nào.
  function renderQuizVisualHtml(item, imgStyle) {
    const visual = getQuizVisual(item);
    if (!visual) return '';
    // Đề tràn NHIỀU DÒNG ép theo max-width:100% như đề 1 dòng sẽ co chữ quá nhỏ/vỡ nét (ảnh nhiều dòng
    // nối dọc RẤT RỘNG so với chiều cao) — hiện đúng kích thước gốc, cho cuộn ngang riêng dòng này.
    const stemHtml = visual.stemMultiline
      ? `<div style="overflow-x:auto;margin-bottom:6px;"><img src="${visual.stemSrc}" alt="${escapeHtml(item.q)}" style="display:block;border-radius:8px;"></div>`
      : `<img src="${visual.stemSrc}" alt="${escapeHtml(item.q)}" style="${imgStyle}">`;
    return `
      ${stemHtml}
      ${visual.combinedOptionsSrc ? `<img src="${visual.combinedOptionsSrc}" alt="Đáp án" style="${imgStyle}">` : ''}
      ${visual.optionSrcs ? visual.optionSrcs.map((src) => `<img src="${src}" alt="Đáp án" style="${imgStyle}">`).join('') : ''}
    `;
  }

  // Chọn/sửa đáp án đúng CHỜ LƯU (chưa ghi Firestore) — key theo "kind:id/index" — cho phép giáo viên
  // bấm thử, đổi ý, rồi mới bấm "Nạp đáp án" để lưu thật, tránh lưu nhầm ngay khi lỡ bấm sai nút.
  const pendingCorrect = new Map();
  function quizItemKey(item) { return item.kind + ':' + (item.kind === 'builtin' ? item.index : item.id); }

  // 1 câu hỏi — dùng lại được cho CẢ mục đơn lẻ LẪN từng câu bên trong 1 "Bài" đang mở (xem
  // groupCustomQuizByFile) — tách riêng khỏi renderQuizManager để không viết trùng markup 2 chỗ.
  // extraFooterHtml: CHỈ dùng khi vẽ item này Ở CẤP CAO NHẤT (không nằm trong 1 nhóm đang mở, xem
  // renderQuizManager) — nếu cho phép cả lúc nằm trong nhóm sẽ lặp lại 4 nút trên TỪNG câu hỏi con.
  function renderQuizItemCard(item, extraFooterHtml) {
    const qType = getQuestionType(item);
    const qKey = quizItemKey(item);
    // LUÔN cho chọn/sửa đáp án (không chỉ khi còn thiếu) — giáo viên có thể bấm nhầm lúc chọn nhanh
    // hoặc app tự nhận diện sai đáp án tô sẵn màu, cần sửa lại được ngay tại đây thay vì phải mở form
    // "Sửa" riêng. Bấm 1 đáp án chỉ TẠM CHỌN (chưa lưu) — phải bấm "Nạp đáp án" mới thực sự ghi lại.
    const canPickAnswer = (qType === 'abcd' || qType === 'truefalse') && Array.isArray(item.options);
    const savedCorrect = (item.correct === undefined) ? null : item.correct;
    const hasPending = pendingCorrect.has(qKey);
    const selectedIdx = hasPending ? pendingCorrect.get(qKey) : savedCorrect;
    const isDirty = hasPending && pendingCorrect.get(qKey) !== savedCorrect;
    return `
      <div class="quiz-review-item" style="text-align:left;">
        ${renderQuizVisualHtml(item, 'max-width:100%;display:block;border-radius:8px;margin-bottom:6px;')}
        <div class="qi-q">${escapeHtml(item.q)}</div>
        <div class="hint">[${QUIZ_TYPE_LABELS[qType]}] Đúng: ${formatCorrectAnswerDisplay(item) ? escapeHtml(formatCorrectAnswerDisplay(item)) : '⚠️ chưa có đáp án đúng'}</div>
        ${canPickAnswer ? `
        <div class="btn-row" style="margin-top:6px;flex-wrap:wrap;gap:6px;">
          ${item.options.map((opt, i) => `<button type="button" class="btn quiz-pick-answer${i === selectedIdx ? ' selected' : ''}" data-kind="${item.kind}" data-key="${item.kind === 'builtin' ? item.index : item.id}" data-i="${i}">${i === selectedIdx ? '✓ ' : ''}${escapeHtml(opt)}</button>`).join('')}
        </div>
        ${isDirty ? `<button type="button" class="btn primary block quiz-save-answer" data-kind="${item.kind}" data-key="${item.kind === 'builtin' ? item.index : item.id}" style="margin-top:6px;">💾 Nạp đáp án</button>` : ''}
        ` : ''}
        <div class="hint" style="margin-top:4px;">
          ${item.kind === 'builtin' ? (item.edited ? 'Đã sửa' : 'Có sẵn trong app') : 'Tự thêm'}
          · <a href="#" class="quiz-edit" data-kind="${item.kind}" data-key="${item.kind === 'builtin' ? item.index : item.id}">Sửa</a>
          · <a href="#" class="quiz-delete" data-kind="${item.kind}" data-key="${item.kind === 'builtin' ? item.index : item.id}">${item.kind === 'builtin' ? 'Ẩn' : 'Xoá'}</a>
          ${item.kind === 'builtin' && item.edited ? ` · <a href="#" class="quiz-restore" data-key="${item.index}">Khôi phục mặc định</a>` : ''}
          ${bankShareLinkHtml('quiz', item)}
        </div>
        ${extraFooterHtml || ''}
      </div>
    `;
  }

  const expandedQuizKeys = new Set();
  function quizGroupKey(item) { return 'g' + item.id; }

  function renderQuizManager() {
    const box = $('#quizManagerBody');
    const items = getGroupedQuizItems();
    box.innerHTML = items.length ? items.map((item) => {
      // Câu ĐƠN LẺ nhưng vẫn nạp từ file (sourceFileName, VD file PDF/Excel chỉ có đúng 1 câu) — vẫn
      // hiện 4 nút y hệt 1 nhóm nhiều câu, cho nhất quán "nạp file xong là có 4 nút ngay".
      if (!item.isGroup) return renderQuizItemCard(item, (item.unitId && item.sourceFileName) ? unitButtonsHtml(item.unitId) : '');
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
        ${item.unitId ? unitButtonsHtml(item.unitId) : ''}
        ${expanded ? item.groupItems.map((it) => renderQuizItemCard(it)).join('') : ''}
      </div>
    `;
    }).join('') : '<div class="hint">Chưa có câu hỏi nào.</div>';

    wireUnitOpenButtons(box);
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

    $$('.quiz-pick-answer', box).forEach((btn) => {
      btn.addEventListener('click', () => {
        const qKey = btn.dataset.kind + ':' + btn.dataset.key;
        pendingCorrect.set(qKey, parseInt(btn.dataset.i, 10));
        renderQuizManager();
      });
    });
    $$('.quiz-save-answer', box).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const kind = btn.dataset.kind;
        const key = btn.dataset.key;
        const qKey = kind + ':' + key;
        const i = pendingCorrect.get(qKey);
        btn.disabled = true;
        btn.textContent = 'Đang lưu...';
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
          pendingCorrect.delete(qKey);
          rebuildEffectiveQuiz();
          renderQuizManager();
          renderQuiz();
        } catch (err) {
          showToast('Không lưu được: ' + err.message);
          btn.disabled = false;
          btn.textContent = '💾 Nạp đáp án';
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
    if (existing && getQuizVisual(existing)) {
      imgBox.style.display = 'block';
      imgBox.innerHTML = renderQuizVisualHtml(existing, 'width:100%;display:block;margin-bottom:6px;');
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
    // Lối tắt nạp PDF/Excel NGAY từ màn "Sửa câu hỏi trắc nghiệm" — trước đây phải bấm "Quay lại" về
    // menu mới thấy 2 lựa chọn này, giờ đủ cả xem/sửa/xoá/tạo/nạp trong CÙNG 1 màn cho tiện.
    $('#quizEditPdfShortcutBtn').addEventListener('click', () => showQuizSection('quizPdfCard'));
    $('#quizEditExcelShortcutBtn').addEventListener('click', () => showQuizSection('quizExcelCard'));
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
          pendingCorrect.delete('builtin:' + index); // form đã lưu đáp án mới nhất — bỏ lựa chọn tạm (nếu có) để không hiện nhầm nút "Nạp đáp án"
        } else if (box.dataset.id) {
          await updateCustomQuiz(box.dataset.id, question);
          const it = customQuizCache.find((x) => x.id === box.dataset.id);
          if (it) Object.assign(it, question);
          pendingCorrect.delete('custom:' + box.dataset.id);
        } else {
          if (activeUnitId) question.unitId = activeUnitId;
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

    $('#quizPdfBtn').addEventListener('click', () => $('#quizPdfFileInput').click());
    $('#quizPdfFileInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (!confirmIfDuplicateSourceFile(file.name)) return;
      const box = $('#quizPdfResult');
      box.innerHTML = `<div class="result-box show">⏳ Đang cắt ảnh từng câu trong "${escapeHtml(file.name)}"...</div>`;
      try {
        const { questions, warnings } = await extractQuizFromPdf(await file.arrayBuffer());
        // Câu hỏi trắc nghiệm LUÔN thuộc về 1 Bài có sẵn (đã có bài giảng) — KHÔNG tự tạo Bài mới chỉ
        // vì nạp file câu hỏi (khác bài giảng: 1 file câu hỏi thường là ngân hàng đề tổng hợp NHIỀU chủ
        // đề, không phải "1 file = 1 Bài" như bài giảng) — chỉ gắn unitId khi ĐANG scope sẵn vào 1 Bài.
        questions.forEach((q) => { q.sourceFileName = file.name; if (activeUnitId) q.unitId = activeUnitId; });
        await addCustomQuizBatch(chapter.id, questions);
        customQuizCache = await getCustomQuiz(owner.uid, chapter.id);
        // Báo NGAY mọi cảnh báo gặp phải lúc nạp (thiếu/trùng số câu, trang lỗi...) — giáo viên cần biết
        // ngay chỗ nào phải tự kiểm tra lại, không im lặng bỏ qua rồi chỉ phát hiện đề bị thiếu khi đã trễ.
        const warningHtml = warnings.length
          ? `<div class="result-box show error" id="quizPdfWarningBox" style="margin-bottom:8px;"><strong>⚠️ Có ${warnings.length} vấn đề cần kiểm tra lại:</strong><ul style="margin:6px 0 0;padding-left:20px;">${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>`
          : '';
        // Câu bị "khoá" (optionsLocked/noShuffle — không tách sạch được nhãn/đáp án, xem doc-import.js)
        // vẫn nạp được nhưng không trộn được đầy đủ — cho xoá gọn CẢ NHÓM này của riêng lượt nạp này
        // (không đụng câu khác), để giáo viên tự nạp lại/bổ sung thủ công nếu muốn thay vì phải dò tay.
        const flaggedInBatch = customQuizCache.filter((q) => q.sourceFileName === file.name && (q.optionsLocked || q.noShuffle));
        const deleteFlaggedHtml = flaggedInBatch.length
          ? `<button type="button" class="btn quiz-delete-flagged-batch" data-ids="${flaggedInBatch.map((q) => q.id).join(',')}" style="margin-top:8px;">🗑️ Xoá ${flaggedInBatch.length} câu bị cảnh báo (không trộn được đầy đủ)</button>`
          : '';
        box.innerHTML = `
          ${warningHtml}
          <div class="result-box show">✓ Đã nạp ${questions.length} câu hỏi — nhớ vào "Sửa câu hỏi trắc nghiệm" để chọn đáp án đúng cho từng câu.</div>
          <button class="btn block" id="quizPdfViewAllBtn" style="margin-top:8px;">👁️ Xem toàn bộ đề vừa nạp</button>
          <div id="quizPdfPreviewList" style="display:none;margin-top:10px;"></div>
          ${deleteFlaggedHtml}
          ${quizImportConfirmBtnHtml()}
        `;
        wireQuizImportConfirmBtn(box);
        const deleteFlaggedBtn = $('.quiz-delete-flagged-batch', box);
        if (deleteFlaggedBtn) {
          deleteFlaggedBtn.addEventListener('click', async () => {
            const ids = deleteFlaggedBtn.dataset.ids.split(',').filter(Boolean);
            if (!confirm(`Xoá ${ids.length} câu bị cảnh báo (không trộn được đầy đủ đáp án/vị trí câu) trong lượt nạp này? Không thể hoàn tác.`)) return;
            deleteFlaggedBtn.disabled = true;
            deleteFlaggedBtn.textContent = 'Đang xoá...';
            try {
              await Promise.all(ids.map((id) => deleteCustomQuiz(id)));
              customQuizCache = customQuizCache.filter((it) => !ids.includes(it.id));
              deleteFlaggedBtn.remove();
              const warnBox = $('#quizPdfWarningBox');
              if (warnBox) warnBox.remove(); // đã xoá xong câu gây cảnh báo — tắt luôn cảnh báo, tránh hiện cảnh báo "chết" không còn tác dụng
              rebuildEffectiveQuiz();
              renderQuizManager();
              renderQuiz();
              showToast(`Đã xoá ${ids.length} câu bị cảnh báo.`, false);
            } catch (err) {
              showToast('Không xoá được: ' + err.message);
              deleteFlaggedBtn.disabled = false;
              deleteFlaggedBtn.textContent = `🗑️ Xoá ${ids.length} câu bị cảnh báo (không trộn được đầy đủ)`;
            }
          });
        }
        $('#quizPdfViewAllBtn').addEventListener('click', () => {
          const list = $('#quizPdfPreviewList');
          const show = list.style.display === 'none';
          list.style.display = show ? 'block' : 'none';
          if (show && !list.dataset.rendered) {
            list.dataset.rendered = '1';
            list.innerHTML = questions.map((q) => `
              <div class="lesson-block" style="margin-bottom:10px;">
                <h3 style="margin-bottom:8px;">${escapeHtml(q.q)}</h3>
                ${renderQuizVisualHtml(q, 'max-width:100%;display:block;margin-bottom:6px;')}
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
    if ($('#quizExcelTemplateBtn')) $('#quizExcelTemplateBtn').addEventListener('click', () => downloadQuizTemplateCSV());
    $('#quizExcelBtn').addEventListener('click', () => $('#quizExcelFileInput').click());
    $('#quizExcelFileInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (!confirmIfDuplicateSourceFile(file.name)) return;
      const box = $('#quizExcelResult');
      box.innerHTML = `<div class="result-box show">⏳ Đang xử lý "${escapeHtml(file.name)}"...</div>`;
      try {
        const questions = await parseQuizExcelFile(file);
        // Xem chú thích ở nhánh nạp PDF trắc nghiệm phía trên — không tự tạo Bài mới, chỉ gắn unitId
        // khi ĐANG scope sẵn vào 1 Bài có sẵn.
        questions.forEach((q) => { q.sourceFileName = file.name; if (activeUnitId) q.unitId = activeUnitId; });
        await addCustomQuizBatch(chapter.id, questions);
        customQuizCache = await getCustomQuiz(owner.uid, chapter.id);
        box.innerHTML = `<div class="result-box show">✓ Đã nạp ${questions.length} câu hỏi.</div>${quizImportConfirmBtnHtml()}`;
        wireQuizImportConfirmBtn(box);
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
  const QUIZ_SECTION_IDS = ['quizEditSection', 'quizPdfCard', 'quizExcelCard', 'quizBankSection', 'selfTestCard', 'quizReviewSection'];

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

  // Nút "Xác nhận" sau khi nạp file xong — giáo viên xem qua kết quả/cảnh báo xong thì bấm để đóng
  // hẳn khung nạp file, quay lại menu Trắc nghiệm (dùng chung cho cả 2 cách nạp: PDF, Excel).
  function quizImportConfirmBtnHtml() {
    return `<button type="button" class="btn primary block quiz-import-confirm" style="margin-top:8px;">✓ Xác nhận</button>`;
  }
  function wireQuizImportConfirmBtn(box) {
    const btn = $('.quiz-import-confirm', box);
    if (btn) btn.addEventListener('click', showQuizMenu);
  }

  // Cảnh báo TRƯỚC khi nạp nếu file này (theo TÊN file) đã từng nạp rồi — mỗi lần nạp luôn THÊM MỚI
  // (không tự gộp/ghi đè), giáo viên bấm nhầm nạp lại file cũ nhiều lần sẽ tạo câu hỏi trùng lặp trong
  // kho mà không hay biết. Trả về false nếu giáo viên chọn huỷ (nơi gọi phải dừng lại, không nạp).
  function confirmIfDuplicateSourceFile(fileName) {
    // So trùng tên file TRONG ĐÚNG phạm vi đang nạp (Bài đang chọn, hoặc phần Chung) — nạp cùng tên
    // file vào 2 Bài khác nhau không tính là trùng.
    const existing = filterByActiveUnit(customQuizCache).filter((q) => q.sourceFileName === fileName).length;
    if (!existing) return true;
    return confirm(`File "${fileName}" đã được nạp trước đó (${existing} câu hỏi). Nạp lại sẽ THÊM MỚI chứ không thay thế, có thể tạo ra câu hỏi TRÙNG LẶP trong kho. Vẫn muốn tiếp tục?`);
  }

  function initQuizMenu() {
    $('#quizMenuReviewBtn').addEventListener('click', () => showQuizSection('quizReviewSection'));
    $('#quizMenuSelfTestBtn').addEventListener('click', () => showQuizSection('selfTestCard'));
    if (owner.isOwner) {
      $('#quizMenuEditBtn').addEventListener('click', () => showQuizSection('quizEditSection'));
      $('#quizMenuManualBtn').addEventListener('click', () => { showQuizSection('quizEditSection'); openQuizForm(null); });
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
      const [meta, lessons, quiz, flashcards, lessonPlans] = await Promise.all([
        getChapterMeta(owner.uid, chapter.id).catch(() => null),
        getCustomLessons(owner.uid, chapter.id).catch(() => []),
        getCustomQuiz(owner.uid, chapter.id).catch(() => []),
        getCustomFlashcards(owner.uid, chapter.id).catch(() => []),
        owner.isOwner ? getCustomLessonPlans(owner.uid, chapter.id).catch(() => []) : Promise.resolve([])
      ]);
      chapterMeta = meta || {};
      customLessonsCache = lessons;
      customQuizCache = quiz;
      customFlashcardsCache = flashcards;
      customLessonPlansCache = lessonPlans;
    }

    renderHeader();
    initUnitsSection();
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
