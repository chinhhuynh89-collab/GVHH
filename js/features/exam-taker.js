// Học sinh làm bài kiểm tra do giáo viên tạo: chờ -> làm bài có đếm giờ -> nộp bài -> xem điểm.
// Đáp án đúng chỉ được tải về đúng lúc bấm "Nộp bài" (xem exam-creator.js và firestore.rules).

(function () {
  const main = $('#examTakerBody');

  if (!isFirebaseConfigured()) {
    main.innerHTML = `<div class="card"><p class="hint">⚠️ Tính năng kiểm tra chưa được giáo viên bật.</p></div>`;
    return;
  }
  const membership = getMembership();
  if (!membership) {
    main.innerHTML = `<div class="card"><p class="hint">Bạn chưa tham gia nhóm nào.</p><a class="btn primary" href="vao-nhom.html">Vào nhóm học tập</a></div>`;
    return;
  }

  // Bắt đăng nhập ĐÚNG tài khoản Google đã dùng lúc vào nhóm trước khi cho làm bài — nộp bài cần ghi
  // Firestore với studentUid khớp request.auth.uid (xem firestore.rules), nếu phiên đăng nhập đã hết
  // hạn (VD lâu không mở app) thì phải đăng nhập lại mới nộp bài được.
  requireStudentAuth((user) => {
    if (user.uid !== membership.studentUid) {
      main.innerHTML = `
        <div class="card">
          <p class="hint">⚠️ Tài khoản đang đăng nhập không khớp với tài khoản đã vào nhóm "${escapeHtml(membership.groupName)}". Vào lại trang "Vào nhóm" để chọn đúng nhóm.</p>
          <a class="btn primary block" href="vao-nhom.html">Vào nhóm học tập</a>
        </div>
      `;
      return;
    }
    startExamTaker();
  });

  let exam = null;
  let qIndex = 0; // vị trí hiển thị (0..n-1) — ánh xạ qua questionOrder để ra chỉ số câu hỏi GỐC
  let answers = []; // lưu theo chỉ số GỐC (khớp trực tiếp với examAnswers, không phụ thuộc thứ tự hiển thị)
  let questionOrder = []; // thứ tự hiển thị câu hỏi, xáo RIÊNG cho học sinh này — questionOrder[i] = chỉ số gốc
  let optionOrder = []; // optionOrder[chỉ số gốc câu hỏi] = thứ tự hiển thị 4 đáp án (mảng chỉ số gốc)
  let startedAt = null;
  let examDeadlineMs = null; // hạn nộp bài CỐ ĐỊNH (giờ bắt đầu đợt + thời gian làm bài) — như nhau
                              // cho cả nhóm, không tính lại từ lúc từng học sinh bấm "Bắt đầu". Học
                              // sinh vào muộn vẫn làm được nhưng chỉ còn phần thời gian tới hạn này.
  let timerHandle = null;

  // Xáo thứ tự câu hỏi + đáp án CHỈ trên máy học sinh này (không đụng đến dữ liệu chung trên
  // Firestore) — mỗi học sinh trong cùng đợt kiểm tra sẽ thấy 1 thứ tự khác nhau, hạn chế chép bài.
  function shuffleIndices(n) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function renderWaiting(message) {
    main.innerHTML = `
      <div class="card">
        <h2><span class="icon">📭</span>${message}</h2>
        <p class="hint">Nhóm: ${escapeHtml(membership.groupName)} (mã ${escapeHtml(membership.groupCode)})</p>
        <button class="btn block" id="examRefreshBtn">Kiểm tra lại</button>
      </div>
    `;
    $('#examRefreshBtn').addEventListener('click', loadExam);
  }

  function renderStart() {
    const remainingNow = remainingSeconds();
    if (remainingNow <= 0) {
      renderWaiting('Đã hết giờ làm bài đợt kiểm tra này.');
      return;
    }
    const m = Math.floor(remainingNow / 60);
    main.innerHTML = `
      <div class="card">
        <h2><span class="icon">📝</span>${escapeHtml(exam.examTitle || (exam.chapterTitles || []).join(', '))}</h2>
        <p class="hint">${exam.questions.length} câu hỏi · ${exam.durationMinutes} phút cho cả đợt</p>
        <p class="hint">Xin chào <strong>${escapeHtml(membership.studentName)}</strong>. Đợt kiểm tra tính giờ chung từ lúc bắt đầu — bạn còn khoảng <strong>${m} phút</strong> để làm bài (vào muộn sẽ còn ít thời gian hơn). Khi bấm "Bắt đầu", đồng hồ đếm ngược sẽ chạy — hết giờ bài sẽ tự động nộp.</p>
        <button class="btn primary block" id="examStartBtn">Bắt đầu làm bài</button>
      </div>
    `;
    $('#examStartBtn').addEventListener('click', startExam);
  }

  function startExam() {
    const n = exam.questions.length;
    answers = new Array(n).fill(null);
    questionOrder = shuffleIndices(n);
    optionOrder = exam.questions.map((q) => shuffleIndices(q.options.length));
    qIndex = 0;
    startedAt = Date.now();
    renderQuestion();
    timerHandle = setInterval(updateTimer, 1000);

    // Ghi lại việc bắt đầu làm bài (tách riêng khỏi "submissions" — chỉ ghi lúc nộp) để giáo viên
    // theo dõi được có bao nhiêu học sinh đang làm bài ngay trên trang chủ. Không chặn học sinh
    // làm bài nếu lượt ghi này lỗi (VD mất mạng thoáng qua).
    try {
      const { db } = ensureFirebase();
      db.collection('examStarts').add({
        examId: exam.examId, studentId: membership.studentId, studentName: membership.studentName,
        studentUid: membership.studentUid, startedAt: new Date(startedAt).toISOString()
      }).catch(() => {});
    } catch (e) { /* ignore */ }
  }

  function remainingSeconds() {
    return Math.max(0, Math.floor((examDeadlineMs - Date.now()) / 1000));
  }

  function updateTimer() {
    const rem = remainingSeconds();
    const el = $('#examTimer');
    if (el) {
      const m = Math.floor(rem / 60), s = rem % 60;
      el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
      el.style.color = rem <= 60 ? 'var(--danger)' : 'var(--brand)';
    }
    if (rem <= 0) {
      clearInterval(timerHandle);
      submitAnswers();
    }
  }

  function renderQuestion() {
    const total = exam.questions.length;
    const origIdx = questionOrder[qIndex];
    const item = exam.questions[origIdx];
    const dispOptions = optionOrder[origIdx]; // mảng chỉ số gốc theo thứ tự hiển thị cho học sinh này
    main.innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div class="quiz-progress" style="margin:0;">Câu ${qIndex + 1}/${total}</div>
          <div id="examTimer" style="font-weight:800;font-size:16px;color:var(--brand);"></div>
        </div>
        <div class="quiz-question">${escapeHtml(item.q)}</div>
        <div class="quiz-options" id="examOptions"></div>
        <div class="btn-row">
          <button class="btn" id="examPrevBtn" ${qIndex === 0 ? 'disabled' : ''}>← Câu trước</button>
          ${qIndex === total - 1
            ? '<button class="btn primary" id="examSubmitBtn" style="flex:1;">Nộp bài</button>'
            : '<button class="btn primary" id="examNextBtn" style="flex:1;">Câu tiếp →</button>'}
        </div>
      </div>
    `;
    const optWrap = $('#examOptions');
    dispOptions.forEach((origOptIdx) => {
      const b = document.createElement('button');
      b.className = 'quiz-option' + (answers[origIdx] === origOptIdx ? ' selected' : '');
      b.textContent = item.options[origOptIdx];
      b.addEventListener('click', () => { answers[origIdx] = origOptIdx; renderQuestion(); });
      optWrap.appendChild(b);
    });
    updateTimer();
    if ($('#examPrevBtn')) $('#examPrevBtn').addEventListener('click', () => { qIndex--; renderQuestion(); });
    if ($('#examNextBtn')) $('#examNextBtn').addEventListener('click', () => { qIndex++; renderQuestion(); });
    if ($('#examSubmitBtn')) $('#examSubmitBtn').addEventListener('click', () => { clearInterval(timerHandle); submitAnswers(); });
  }

  async function submitAnswers() {
    main.innerHTML = `<div class="card"><p class="hint">⏳ Đang nộp bài...</p></div>`;
    try {
      const { db } = ensureFirebase();

      // Chặn nộp trùng: kiểm tra đã có bài nộp cho đề này từ tài khoản này chưa.
      const dupSnap = await db.collection('submissions')
        .where('examId', '==', exam.examId).where('studentUid', '==', membership.studentUid).limit(1).get();
      if (!dupSnap.empty) {
        const dup = dupSnap.docs[0].data();
        renderResult(dup.score, dup.correctCount, dup.total, true);
        return;
      }

      const answerDoc = await db.collection('examAnswers').doc(exam.examId).get();
      const answerKey = answerDoc.exists ? (answerDoc.data().answers || []) : [];

      let correctCount = 0;
      answerKey.forEach((a, i) => { if (answers[i] === a.correct) correctCount++; });
      const total = answerKey.length;
      const score = total ? Math.round((correctCount / total) * 100) : 0;

      await db.collection('submissions').add({
        examId: exam.examId, studentId: membership.studentId, studentName: membership.studentName,
        studentUid: membership.studentUid, answers, score, correctCount, total,
        startedAt: new Date(startedAt).toISOString(), submittedAt: new Date().toISOString()
      });

      renderResult(score, correctCount, total, false);
    } catch (e) {
      main.innerHTML = `<div class="result-box show error">⚠️ ${escapeHtml(e.message)}</div><button class="btn primary block" id="examRetryBtn">Thử nộp lại</button>`;
      $('#examRetryBtn').addEventListener('click', submitAnswers);
    }
  }

  function renderResult(score, correctCount, total, alreadySubmitted) {
    renderExamHistory(); // cập nhật ngay lịch sử để thấy đợt vừa nộp mà không cần tải lại trang
    const score10 = (Math.round(score) / 10).toFixed(1);
    main.innerHTML = `
      <div class="card">
        <div class="quiz-result">
          <div class="qr-score">${score10} điểm</div>
          <div class="qr-label">${correctCount}/${total} câu đúng (${score}%) ${alreadySubmitted ? '· bạn đã nộp bài này trước đó' : '— Đã nộp bài thành công'}</div>
        </div>
        <a class="btn primary block" href="../index.html">Về trang chủ</a>
      </div>
    `;
  }

  // ---------- Lịch sử kiểm tra của học sinh này: đã làm (điểm/đúng-sai/thời gian), đang diễn ra,
  // và ĐÃ BỎ LỠ (đợt giáo viên đã ra nhưng học sinh không tham gia, đã hết hạn) ----------
  async function renderExamHistory() {
    const box = $('#examHistoryBody');
    if (!box) return;
    try {
      const { db } = ensureFirebase();
      const now = new Date();
      const [examsSnap, subsSnap] = await Promise.all([
        db.collection('exams').where('groupCode', '==', membership.groupCode).get(),
        db.collection('submissions').where('studentUid', '==', membership.studentUid).get()
      ]);
      const exams = examsSnap.docs.map((d) => Object.assign({ examId: d.id }, d.data()));
      if (!exams.length) { box.innerHTML = ''; return; }
      const subByExamId = new Map(subsSnap.docs.map((d) => [d.data().examId, d.data()]));

      const rows = exams.map((e) => {
        const sub = subByExamId.get(e.examId);
        const startTime = new Date(e.startTime);
        const endTime = new Date(e.endTime);
        let status;
        if (sub) {
          const durationSec = Math.max(0, Math.round((new Date(sub.submittedAt) - new Date(sub.startedAt)) / 1000));
          status = {
            kind: 'done',
            score10: Math.round(sub.score) / 10,
            correctCount: sub.correctCount,
            total: sub.total,
            duration: `${Math.floor(durationSec / 60)} phút ${durationSec % 60} giây`,
            submittedAt: new Date(sub.submittedAt).toLocaleString('vi-VN')
          };
        } else if (now > endTime) {
          status = { kind: 'missed', endTime };
        } else if (now >= startTime) {
          status = { kind: 'ongoing' };
        } else {
          status = { kind: 'upcoming' };
        }
        return { exam: e, status };
      })
        .filter((r) => r.status.kind !== 'upcoming')
        .sort((a, b) => new Date(b.exam.createdAt) - new Date(a.exam.createdAt));

      if (!rows.length) { box.innerHTML = ''; return; }

      const doneRows = rows.filter((r) => r.status.kind === 'done');
      const avgScore = doneRows.length
        ? (doneRows.reduce((s, r) => s + r.status.score10, 0) / doneRows.length).toFixed(1)
        : null;
      const missedCount = rows.filter((r) => r.status.kind === 'missed').length;

      box.innerHTML = `
        <div class="card">
          <h2><span class="icon">📊</span>Lịch sử kiểm tra của bạn</h2>
          <p class="hint" style="margin-top:-4px;">
            Đã làm ${doneRows.length} đợt${avgScore !== null ? ` · Điểm trung bình: <strong style="color:var(--brand);">${avgScore}</strong>` : ''}${missedCount ? ` · Đã bỏ lỡ ${missedCount} đợt` : ''}
          </p>
          ${rows.map(renderHistoryRow).join('')}
        </div>
      `;
    } catch (e) {
      box.innerHTML = `<div class="result-box show error">⚠️ Không tải được lịch sử kiểm tra: ${escapeHtml(e.message)}</div>`;
    }
  }

  function renderHistoryRow(r) {
    const title = escapeHtml(r.exam.examTitle || (r.exam.chapterTitles || []).join(', '));
    if (r.status.kind === 'done') {
      return `
        <div class="quiz-review-item ok" style="text-align:left;">
          <div class="qi-q">✅ ${title}</div>
          <div>${r.status.correctCount}/${r.status.total} câu đúng — <strong>${r.status.score10.toFixed(1)} điểm</strong></div>
          <div class="hint">Thời gian làm bài: ${r.status.duration} · Nộp lúc: ${r.status.submittedAt}</div>
        </div>
      `;
    }
    if (r.status.kind === 'missed') {
      return `
        <div class="quiz-review-item bad" style="text-align:left;">
          <div class="qi-q">⚠️ ${title}</div>
          <div class="hint">Đã bỏ lỡ — không tham gia đợt kiểm tra này (hết hạn nộp lúc ${r.status.endTime.toLocaleString('vi-VN')}).</div>
        </div>
      `;
    }
    return `
      <div class="quiz-review-item" style="text-align:left;">
        <div class="qi-q">🔴 ${title}</div>
        <div class="hint">Đang diễn ra — làm bài ngay bên dưới!</div>
      </div>
    `;
  }

  async function loadExam() {
    main.innerHTML = `<div class="card"><p class="hint">⏳ Đang kiểm tra bài kiểm tra...</p></div>`;
    try {
      const { db } = ensureFirebase();
      const now = new Date();

      const examsSnap = await db.collection('exams').where('groupCode', '==', membership.groupCode).get();
      const candidates = examsSnap.docs
        .map((d) => Object.assign({ examId: d.id }, d.data()))
        .filter((e) => new Date(e.startTime) <= now && now <= new Date(e.endTime))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      if (!candidates.length) { renderWaiting('Hiện không có bài kiểm tra nào đang diễn ra.'); return; }
      const active = candidates[0];

      const dupSnap = await db.collection('submissions')
        .where('examId', '==', active.examId).where('studentUid', '==', membership.studentUid).limit(1).get();
      if (!dupSnap.empty) { renderWaiting('Bạn đã hoàn thành bài kiểm tra gần nhất.'); return; }

      exam = active;
      examDeadlineMs = new Date(exam.startTime).getTime() + exam.durationMinutes * 60000;
      renderStart();
    } catch (e) {
      main.innerHTML = `<div class="result-box show error">⚠️ ${escapeHtml(e.message)}</div>`;
    }
  }

  function startExamTaker() {
    renderExamHistory();
    loadExam();
  }
})();
