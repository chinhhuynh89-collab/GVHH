// Giáo viên tạo đề kiểm tra tự động: chọn nhóm, chương, số câu, thời gian — hệ thống rút ngẫu nhiên
// từ kho câu hỏi (có sẵn trong app + tự thêm) rồi lưu lên Firestore để học sinh trong nhóm làm bài.
//
// Đề được tách làm 2 tài liệu: "exams/{id}" (câu hỏi, KHÔNG có đáp án — công khai) và
// "examAnswers/{id}" (đáp án đúng — chỉ tải về lúc học sinh bấm nộp bài, xem firestore.rules).

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
  const { db } = ensureFirebase();
  const examRef = db.collection('exams').doc();
  // 2 tài liệu độc lập (câu hỏi + đáp án) — ghi CÙNG LÚC thay vì lần lượt để đỡ mất 1 round-trip mạng.
  await Promise.all([
    examRef.set({
      teacherUid: teacher.uid,
      groupCode: examInput.groupCode,
      chapterId: examInput.chapterId,
      chapterTitle: examInput.chapterTitle,
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
      groups = await listGroupsForCurrentTeacher();
      $('#examGroup').innerHTML = groups.map((g) =>
        `<option value="${escapeHtml(g.groupCode)}" ${g.groupCode === preselectGroup ? 'selected' : ''}>${escapeHtml(g.groupName)} (Lớp ${g.grade} · mã ${escapeHtml(g.groupCode)})</option>`
      ).join('');
      await onGroupChange();
    }

    async function onGroupChange() {
      const code = $('#examGroup').value;
      currentGroup = groups.find((g) => g.groupCode === code);
      if (!currentGroup) { $('#examChapter').innerHTML = ''; return; }
      const chapters = getChaptersByGrade(currentGroup.grade).filter((c) => currentGroup.chapterIds.includes(c.id));
      $('#examChapter').innerHTML = chapters.map((c) => `<option value="${c.id}">Chương ${c.order}. ${escapeHtml(c.title)}</option>`).join('');
      await onChapterChange();
    }

    async function getQuestionPool(chapterId) {
      const found = findChapterAnywhere(chapterId);
      if (!found) return [];
      const builtIn = found.chapter.quiz || [];
      let custom = [];
      try { custom = await getCustomQuiz(getCurrentTeacher().uid, chapterId); } catch (e) { custom = []; }
      return builtIn.concat(custom.map((c) => ({ q: c.q, options: c.options, correct: c.correct, explain: c.explain })));
    }

    async function onChapterChange() {
      const chapterId = $('#examChapter').value;
      const pool = await getQuestionPool(chapterId);
      $('#examPoolInfo').textContent = pool.length ? `Kho câu hỏi hiện có: ${pool.length} câu.` : 'Chương này chưa có câu hỏi trắc nghiệm — hãy thêm câu hỏi trước.';
      $('#examCount').max = pool.length || 1;
    }

    $('#examGroup').addEventListener('change', onGroupChange);
    $('#examChapter').addEventListener('change', onChapterChange);

    $('#examCreateBtn').addEventListener('click', async () => {
      const box = $('#examCreateResult');
      const groupCode = $('#examGroup').value;
      const chapterId = $('#examChapter').value;
      const count = parseInt($('#examCount').value, 10);
      const duration = parseInt($('#examDuration').value, 10);
      const startMode = $('#examStartMode').value;

      if (!groupCode || !chapterId) { showResult(box, 'Chọn nhóm và chương.', true); return; }
      if (!count || count < 1) { showResult(box, 'Nhập số câu hợp lệ.', true); return; }
      if (!duration || duration < 1) { showResult(box, 'Nhập thời gian làm bài hợp lệ.', true); return; }

      const pool = await getQuestionPool(chapterId);
      if (!pool.length) { showResult(box, 'Chương này chưa có câu hỏi trắc nghiệm nào.', true); return; }

      const questions = shuffleArray(pool).slice(0, Math.min(count, pool.length));
      const chapterInfo = findChapterAnywhere(chapterId).chapter;

      let startTime;
      if (startMode === 'now') {
        startTime = new Date();
      } else {
        const val = $('#examStartAt').value;
        if (!val) { showResult(box, 'Chọn thời điểm bắt đầu.', true); return; }
        startTime = new Date(val);
      }
      const endTime = new Date(startTime.getTime() + (duration + 30) * 60000);

      showResult(box, '⏳ Đang tạo đề kiểm tra...');
      try {
        await createExamForCurrentTeacher({
          groupCode, chapterId, chapterTitle: chapterInfo.title,
          durationMinutes: duration, startTime: startTime.toISOString(), endTime: endTime.toISOString(),
          questions
        });
        showResult(box, `✓ Đã tạo đề kiểm tra "${escapeHtml(chapterInfo.title)}" — ${questions.length} câu, ${duration} phút. Học sinh trong nhóm sẽ thấy thông báo khi mở app từ ${startTime.toLocaleString('vi-VN')}.`);
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
