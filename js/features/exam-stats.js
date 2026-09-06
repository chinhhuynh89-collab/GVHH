// Giáo viên xem thống kê điểm học sinh theo từng đề kiểm tra đã tạo.

(function () {
  requireTeacherAuth(async (user) => {
    if (typeof renderFeatureLockGate === 'function' && await renderFeatureLockGate($('#statsContent'), user.uid, 'advancedStats')) return;
    const params = new URLSearchParams(location.search);
    const preselectGroup = params.get('group') || '';
    let groups = [];
    let currentResults = null;
    let currentExamTitle = '';

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
      currentResults = null;
      if (!examId) { box.innerHTML = ''; return; }
      box.innerHTML = '<p class="hint">⏳ Đang tải kết quả...</p>';
      try {
        const { db } = ensureFirebase();
        // Tải kèm câu hỏi (exams) + đáp án đúng (examAnswers) CÙNG LÚC với danh sách bài nộp — chỉ 2
        // lượt đọc thêm cho CẢ đợt (không phải từng học sinh) — để bấm "Xem bài làm" của bất kỳ em nào
        // cũng hiện được ngay, không cần tải thêm mỗi lần bấm.
        const [snap, examDoc, answerDoc] = await Promise.all([
          db.collection('submissions').where('examId', '==', examId).get(),
          db.collection('exams').doc(examId).get(),
          db.collection('examAnswers').doc(examId).get()
        ]);
        const reviewItems = (examDoc.exists && answerDoc.exists)
          ? mergeExamAndAnswerKey(examDoc.data().questions, answerDoc.data().answers)
          : null;
        const results = snap.docs.map((d) => d.data())
          .map((s) => ({
            studentName: s.studentName, score: s.score, correctCount: s.correctCount, total: s.total,
            startedAt: s.startedAt, submittedAt: s.submittedAt, answers: s.answers
          }))
          .sort((a, b) => b.score - a.score);

        if (!results.length) { box.innerHTML = '<p class="hint">Chưa có học sinh nào nộp bài.</p>'; return; }
        currentResults = results;
        currentExamTitle = (examDoc.exists && examDoc.data().examTitle) || '';

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
          <button class="btn block" id="statsExportCsvBtn" type="button" style="margin-bottom:14px;">📊 Xuất điểm (Excel/CSV)</button>
          ${results.map((r, i) => `
            <div class="quiz-review-item ${r.score >= 70 ? 'ok' : 'bad'}" style="text-align:left;">
              <div class="qi-q">${i + 1}. ${escapeHtml(r.studentName)} — ${toScore10(r.score).toFixed(1)} điểm</div>
              <div>${r.correctCount}/${r.total} câu đúng (${r.score}%)</div>
              <div class="hint">Bắt đầu: ${r.startedAt ? new Date(r.startedAt).toLocaleTimeString('vi-VN') : '—'} · Nộp lúc: ${new Date(r.submittedAt).toLocaleTimeString('vi-VN')} (${new Date(r.submittedAt).toLocaleDateString('vi-VN')})</div>
              ${reviewItems ? `
                <button class="btn stats-review-toggle" type="button" data-idx="${i}" style="margin-top:6px;">👁️ Xem bài làm</button>
                <div class="stats-review-panel" id="statsReview-${i}" style="display:none;margin-top:8px;"></div>
              ` : ''}
            </div>
          `).join('')}
        `;
        $('#statsExportCsvBtn', box).addEventListener('click', exportResultsToCsv);
        if (reviewItems) {
          $$('.stats-review-toggle', box).forEach((btn) => {
            btn.addEventListener('click', () => {
              const idx = parseInt(btn.dataset.idx, 10);
              const panel = $('#statsReview-' + idx, box);
              const opening = panel.style.display === 'none';
              panel.style.display = opening ? 'block' : 'none';
              btn.textContent = opening ? '👁️ Ẩn bài làm' : '👁️ Xem bài làm';
              if (!opening || panel.dataset.loaded) return;
              panel.innerHTML = buildSubmissionReviewHtml(reviewItems, results[idx].answers);
              panel.dataset.loaded = '1';
            });
          });
        }
      } catch (e) {
        box.innerHTML = `<div class="result-box show error">⚠️ ${escapeHtml(e.message)}</div>`;
      }
    }

    // Xuất bảng điểm đang hiển thị ra file .csv (mở trực tiếp bằng Excel/Google Sheets) — dùng lại
    // đúng dữ liệu đã tải (currentResults), không gọi lại Firestore. Chỉ chép lại phần escape CSV nhỏ
    // từ quiz-excel.js thay vì nạp cả file đó vào trang này (file đó còn kèm logic đọc .xlsx không
    // liên quan tới trang thống kê).
    function csvEscapeField(value) {
      const s = String(value == null ? '' : value);
      if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }

    function exportResultsToCsv() {
      if (!currentResults || !currentResults.length) return;
      const toScore10 = (percent) => Math.round(percent) / 10;
      const rows = [
        ['STT', 'Họ và tên', 'Điểm (thang 10)', 'Số câu đúng', 'Tổng số câu', '% điểm', 'Giờ bắt đầu', 'Giờ nộp bài']
      ];
      currentResults.forEach((r, i) => {
        rows.push([
          i + 1, r.studentName, toScore10(r.score).toFixed(1), r.correctCount, r.total, r.score,
          r.startedAt ? new Date(r.startedAt).toLocaleString('vi-VN') : '',
          new Date(r.submittedAt).toLocaleString('vi-VN')
        ]);
      });
      const csv = rows.map((row) => row.map(csvEscapeField).join(',')).join('\r\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const fileNamePart = String(currentExamTitle || 'de-kiem-tra').replace(/[^\p{L}\p{N}\- ]/gu, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-') || 'de-kiem-tra';
      const a = document.createElement('a');
      a.href = url;
      a.download = `diem-${fileNamePart}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    $('#statsGroup').addEventListener('change', loadExams);
    $('#statsExam').addEventListener('change', loadResults);

    loadGroups();
  });
})();
