// Giáo viên xem thống kê điểm học sinh theo từng đề kiểm tra đã tạo.

(function () {
  requireTeacherAuth(async () => {
    const params = new URLSearchParams(location.search);
    const preselectGroup = params.get('group') || '';
    let groups = [];

    async function loadGroups() {
      groups = await listGroupsForCurrentTeacher();
      $('#statsGroup').innerHTML = groups.map((g) =>
        `<option value="${escapeHtml(g.groupCode)}" ${g.groupCode === preselectGroup ? 'selected' : ''}>${escapeHtml(g.groupName)} (Lớp ${g.grade} · mã ${escapeHtml(g.groupCode)})</option>`
      ).join('');
      await loadExams();
    }

    async function loadExams() {
      const groupCode = $('#statsGroup').value;
      $('#statsExam').innerHTML = '<option>Đang tải...</option>';
      $('#statsResults').innerHTML = '';
      if (!groupCode) return;
      const { db } = ensureFirebase();
      const snap = await db.collection('exams').where('groupCode', '==', groupCode).get();
      const exams = snap.docs.map((d) => Object.assign({ examId: d.id }, d.data()))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (!exams.length) { $('#statsExam').innerHTML = '<option value="">Chưa có đợt kiểm tra nào</option>'; return; }
      $('#statsExam').innerHTML = exams.map((e) =>
        `<option value="${escapeHtml(e.examId)}">${escapeHtml(e.examTitle || (e.chapterTitles || []).join(', '))} — ${e.questions.length} câu — ${new Date(e.createdAt).toLocaleString('vi-VN')}</option>`
      ).join('');
      await loadResults();
    }

    async function loadResults() {
      const examId = $('#statsExam').value;
      const box = $('#statsResults');
      if (!examId) { box.innerHTML = ''; return; }
      box.innerHTML = '<p class="hint">⏳ Đang tải kết quả...</p>';
      try {
        const { db } = ensureFirebase();
        const snap = await db.collection('submissions').where('examId', '==', examId).get();
        const results = snap.docs.map((d) => d.data())
          .map((s) => ({
            studentName: s.studentName, score: s.score, correctCount: s.correctCount, total: s.total,
            startedAt: s.startedAt, submittedAt: s.submittedAt
          }))
          .sort((a, b) => b.score - a.score);

        if (!results.length) { box.innerHTML = '<p class="hint">Chưa có học sinh nào nộp bài.</p>'; return; }

        const toScore10 = (percent) => Math.round(percent) / 10;
        const scores = results.map((r) => r.score);
        const stats = {
          count: scores.length,
          avg: toScore10(scores.reduce((a, b) => a + b, 0) / scores.length),
          max: toScore10(Math.max(...scores)),
          min: toScore10(Math.min(...scores))
        };

        box.innerHTML = `
          <div class="el-info-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px;">
            <div class="info-item"><div class="k">Số bài nộp</div><div class="v">${stats.count}</div></div>
            <div class="info-item"><div class="k">Điểm TB</div><div class="v">${stats.avg.toFixed(1)}</div></div>
            <div class="info-item"><div class="k">Cao nhất</div><div class="v">${stats.max.toFixed(1)}</div></div>
            <div class="info-item"><div class="k">Thấp nhất</div><div class="v">${stats.min.toFixed(1)}</div></div>
          </div>
          ${results.map((r, i) => `
            <div class="quiz-review-item ${r.score >= 70 ? 'ok' : 'bad'}" style="text-align:left;">
              <div class="qi-q">${i + 1}. ${escapeHtml(r.studentName)} — ${toScore10(r.score).toFixed(1)} điểm</div>
              <div>${r.correctCount}/${r.total} câu đúng (${r.score}%)</div>
              <div class="hint">Bắt đầu: ${r.startedAt ? new Date(r.startedAt).toLocaleTimeString('vi-VN') : '—'} · Nộp lúc: ${new Date(r.submittedAt).toLocaleTimeString('vi-VN')} (${new Date(r.submittedAt).toLocaleDateString('vi-VN')})</div>
            </div>
          `).join('')}
        `;
      } catch (e) {
        box.innerHTML = `<div class="result-box show error">⚠️ ${escapeHtml(e.message)}</div>`;
      }
    }

    $('#statsGroup').addEventListener('change', loadExams);
    $('#statsExam').addEventListener('change', loadResults);

    loadGroups();
  });
})();
