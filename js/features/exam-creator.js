// Giáo viên tạo đề kiểm tra tự động: chọn nhóm, 1 hoặc nhiều chương, số câu, thời gian — hệ thống
// rút ngẫu nhiên từ kho câu hỏi gộp của các chương đã chọn (có sẵn trong app + tự thêm) rồi lưu
// lên Firestore để học sinh trong nhóm làm bài.
//
// Đề được tách làm 2 tài liệu: "exams/{id}" (câu hỏi, KHÔNG có đáp án — công khai) và
// "examAnswers/{id}" (đáp án đúng — chỉ tải về lúc học sinh bấm nộp bài, xem firestore.rules).
//
// Thứ tự câu hỏi/đáp án lưu trong "exams" là CỐ ĐỊNH, giống nhau cho cả nhóm — việc mỗi học sinh
// thấy thứ tự khác nhau (để chống chép bài) được xáo lại RIÊNG trên máy từng học sinh lúc làm bài
// (xem exam-taker.js), không cần sinh nhiều bản đề khác nhau ở đây.

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function createExamForCurrentTeacher(examInput) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  if (typeof enforceFeatureLock === 'function') await enforceFeatureLock(teacher.uid, 'examCreator');
  const { db } = ensureFirebase();
  const examRef = db.collection('exams').doc();
  // 2 tài liệu độc lập (câu hỏi + đáp án) — ghi CÙNG LÚC thay vì lần lượt để đỡ mất 1 round-trip mạng.
  await Promise.all([
    examRef.set({
      teacherUid: teacher.uid,
      groupCode: examInput.groupCode,
      chapterIds: examInput.chapterIds,
      chapterTitles: examInput.chapterTitles,
      examTitle: examInput.examTitle,
      durationMinutes: examInput.durationMinutes,
      startTime: examInput.startTime,
      endTime: examInput.endTime,
      questions: examInput.questions.map((q) => ({ q: q.q, options: q.options })),
      createdAt: new Date().toISOString()
    }),
    db.collection('examAnswers').doc(examRef.id).set({
      answers: examInput.questions.map((q) => ({ correct: q.correct, explain: q.explain || '' }))
    })
  ]);
  return examRef.id;
}

(function () {
  requireTeacherAuth(async () => {
    const params = new URLSearchParams(location.search);
    const preselectGroup = params.get('group') || '';
    let groups = [];
    let currentGroup = null;

    async function loadGroups() {
      try {
        groups = await listGroupsForCurrentTeacher();
      } catch (e) {
        showResult($('#examLoadError'), `⚠️ Không tải được danh sách nhóm: ${escapeHtml(e.message)}`, true);
        return;
      }
      if (!groups.length) {
        showResult($('#examLoadError'), 'Bạn chưa có nhóm nào. Vào "Nhóm học sinh" để tạo nhóm trước.');
        return;
      }
      hideResult($('#examLoadError'));
      $('#examGroup').innerHTML = groups.map((g) =>
        `<option value="${escapeHtml(g.groupCode)}" ${g.groupCode === preselectGroup ? 'selected' : ''}>${escapeHtml(g.groupName)} (Lớp ${escapeHtml(String(g.grade))} · mã ${escapeHtml(g.groupCode)})</option>`
      ).join('');
      await onGroupChange();
    }

    // Song song với findChapterAnywhere (chương mặc định lớp 6-12, tra đồng bộ) — nếu không thấy,
    // có thể là chương thuộc 1 chương trình riêng do giáo viên tự tạo (xem programs-data.js).
    async function resolveChapterInfo(chapterId) {
      const found = findChapterAnywhere(chapterId);
      if (found) return { chapter: found.chapter, grade: found.grade, isProgram: false };
      if (typeof findProgramChapter === 'function') {
        try {
          const pc = await findProgramChapter(chapterId);
          if (pc) return { chapter: pc, grade: null, isProgram: true };
        } catch (e) { /* ignore */ }
      }
      return null;
    }

    async function onGroupChange() {
      try {
        const code = $('#examGroup').value;
        currentGroup = groups.find((g) => g.groupCode === code);
        if (!currentGroup) { $('#examChapters').innerHTML = ''; return; }
        // Chương của 1 nhóm có thể đến từ nhiều khối lớp khác nhau, hoặc chương trình riêng — tra
        // theo đúng chapterIds của nhóm thay vì lọc theo 1 khối duy nhất.
        const resolved = await Promise.all((currentGroup.chapterIds || []).map(resolveChapterInfo));
        const chapters = resolved.filter(Boolean);
        if (!chapters.length) {
          $('#examChapters').innerHTML = '<p class="hint">Nhóm này chưa được giao chương nào — vào "Nhóm học sinh" sửa lại nhóm để giao chương trước.</p>';
          $('#examPoolInfo').textContent = '';
          return;
        }
        $('#examChapters').innerHTML = chapters.map(({ chapter, grade, isProgram }) => `
          <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;cursor:pointer;">
            <input type="checkbox" class="exam-chapter-check" value="${chapter.id}" checked style="margin-top:3px;" />
            <span>${isProgram ? escapeHtml(chapter.title) : `Lớp ${grade} - Chương ${chapter.order}. ${escapeHtml(chapter.title)}`}</span>
          </label>
        `).join('');
        $$('.exam-chapter-check').forEach((cb) => cb.addEventListener('change', onChapterChange));
        await onChapterChange();
      } catch (e) {
        $('#examChapters').innerHTML = `<div class="result-box show error">⚠️ ${escapeHtml(e.message)}</div>`;
      }
    }

    function selectedChapterIds() {
      return $$('.exam-chapter-check').filter((c) => c.checked).map((c) => c.value);
    }

    // Gộp kho câu hỏi (có sẵn + tự thêm) của TẤT CẢ chương đã chọn thành 1 kho chung để rút ngẫu nhiên.
    async function getQuestionPool(chapterIds) {
      const pools = await Promise.all(chapterIds.map(async (chapterId) => {
        const found = findChapterAnywhere(chapterId);
        const builtIn = found ? (found.chapter.quiz || []) : [];
        let custom = [];
        try { custom = await getCustomQuiz(getCurrentTeacher().uid, chapterId); } catch (e) { custom = []; }
        return builtIn.concat(custom.map((c) => ({ q: c.q, options: c.options, correct: c.correct, explain: c.explain })));
      }));
      return pools.flat();
    }

    async function onChapterChange() {
      const chapterIds = selectedChapterIds();
      const pool = await getQuestionPool(chapterIds);
      $('#examPoolInfo').textContent = pool.length
        ? `Kho câu hỏi hiện có: ${pool.length} câu (gộp từ ${chapterIds.length} chương đã chọn).`
        : 'Chưa có câu hỏi nào trong (các) chương đã chọn — hãy thêm câu hỏi trước hoặc chọn chương khác.';
      $('#examCount').max = pool.length || 1;
    }

    $('#examGroup').addEventListener('change', onGroupChange);

    $('#examCreateBtn').addEventListener('click', async () => {
      const box = $('#examCreateResult');
      const groupCode = $('#examGroup').value;
      const chapterIds = selectedChapterIds();
      const examTitle = $('#examTitle').value.trim();
      const count = parseInt($('#examCount').value, 10);
      const duration = parseInt($('#examDuration').value, 10);
      const startMode = $('#examStartMode').value;

      if (!groupCode) { showResult(box, 'Chọn nhóm.', true); return; }
      if (!chapterIds.length) { showResult(box, 'Chọn ít nhất 1 chương.', true); return; }
      if (!count || count < 1) { showResult(box, 'Nhập số câu hợp lệ.', true); return; }
      if (!duration || duration < 1) { showResult(box, 'Nhập thời gian làm bài hợp lệ.', true); return; }

      const pool = await getQuestionPool(chapterIds);
      if (!pool.length) { showResult(box, '(Các) chương đã chọn chưa có câu hỏi trắc nghiệm nào.', true); return; }

      const questions = shuffleArray(pool).slice(0, Math.min(count, pool.length));
      const chapterInfos = await Promise.all(chapterIds.map(resolveChapterInfo));
      const chapterTitles = chapterInfos.filter(Boolean).map((f) => f.chapter.title);

      let startTime;
      if (startMode === 'now') {
        startTime = new Date();
      } else {
        const val = $('#examStartAt').value;
        if (!val) { showResult(box, 'Chọn thời điểm bắt đầu.', true); return; }
        startTime = new Date(val);
      }
      // Hạn nộp bài CỐ ĐỊNH = giờ bắt đầu + thời gian làm bài — không có thời gian đệm. Học sinh
      // vào muộn vẫn làm được nhưng chỉ còn phần thời gian còn lại tới hạn này (xem exam-taker.js).
      const endTime = new Date(startTime.getTime() + duration * 60000);
      const finalTitle = examTitle || `${chapterTitles.join(', ')} - ${startTime.toLocaleDateString('vi-VN')}`;

      showResult(box, '⏳ Đang tạo đề kiểm tra...');
      try {
        await createExamForCurrentTeacher({
          groupCode, chapterIds, chapterTitles, examTitle: finalTitle,
          durationMinutes: duration, startTime: startTime.toISOString(), endTime: endTime.toISOString(),
          questions
        });
        showResult(box, `✓ Đã tạo đợt kiểm tra "${escapeHtml(finalTitle)}" — ${questions.length} câu, ${duration} phút, hạn nộp lúc ${endTime.toLocaleString('vi-VN')}. Mỗi học sinh sẽ thấy thứ tự câu hỏi và đáp án được xáo khác nhau. Học sinh trong nhóm sẽ thấy thông báo khi mở app từ ${startTime.toLocaleString('vi-VN')}.`);
        $('#examTitle').value = '';
      } catch (e) {
        showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
      }
    });

    $('#examStartMode').addEventListener('change', () => {
      $('#examStartAtField').style.display = $('#examStartMode').value === 'now' ? 'none' : 'block';
    });

    loadGroups();
  });
})();
