// Thông báo nổi bật cho giáo viên trên trang chủ: đợt kiểm tra gần nhất giáo viên đã tạo đang
// diễn ra hay vừa kết thúc — còn bao nhiêu thời gian, bao nhiêu học sinh đã nộp/đang làm bài, bấm
// vào xem danh sách chi tiết từng học sinh. Chỉ hiện khi đã đăng nhập giáo viên VÀ có đợt kiểm tra
// đang diễn ra hoặc vừa kết thúc trong 24 giờ qua (quá thời gian đó coi như không còn liên quan).

(async function () {
  if (!isFirebaseConfigured()) return;
  const teacher = await waitForAuthReady();
  if (!teacher) return;

  const card = $('#teacherExamNotifyCard');
  if (!card) return;
  const { db } = ensureFirebase();

  let exam;
  try {
    const examsSnap = await db.collection('exams').where('teacherUid', '==', teacher.uid).get();
    if (examsSnap.empty) return;
    const exams = examsSnap.docs.map((d) => Object.assign({ examId: d.id }, d.data()))
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    exam = exams[0];
  } catch (e) { return; }

  const endTime = new Date(exam.endTime);
  const isOngoing = Date.now() <= endTime.getTime();
  const hoursSinceEnd = (Date.now() - endTime.getTime()) / 3600000;
  if (!isOngoing && hoursSinceEnd > 24) return; // đã cũ, không còn liên quan để hiện nữa

  let group = null;
  let roster = [];
  try {
    const [groupSnap, studentsSnap, startsSnap, subsSnap] = await Promise.all([
      db.collection('groups').where('groupCode', '==', exam.groupCode).limit(1).get(),
      db.collection('students').where('groupCode', '==', exam.groupCode).get(),
      db.collection('examStarts').where('examId', '==', exam.examId).get(),
      db.collection('submissions').where('examId', '==', exam.examId).get()
    ]);
    group = groupSnap.empty ? null : groupSnap.docs[0].data();

    const submittedByStudent = new Map(subsSnap.docs.map((d) => [d.data().studentId, d.data()]));
    const startedByStudent = new Map(startsSnap.docs.map((d) => [d.data().studentId, d.data()]));
    roster = studentsSnap.docs.map((d) => {
      const st = d.data();
      const sub = submittedByStudent.get(d.id);
      const start = startedByStudent.get(d.id);
      if (sub) return { name: st.studentName, status: 'done', at: sub.submittedAt, score10: Math.round(sub.score) / 10 };
      if (start) return { name: st.studentName, status: 'inprogress', at: start.startedAt };
      return { name: st.studentName, status: 'notstarted' };
    });
    const statusOrder = { inprogress: 0, notstarted: 1, done: 2 };
    roster.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name, 'vi'));
  } catch (e) { return; }

  const doneCount = roster.filter((r) => r.status === 'done').length;
  const inProgressCount = roster.filter((r) => r.status === 'inprogress').length;
  const total = roster.length;
  const groupLabel = group ? `Nhóm "${escapeHtml(group.groupName)}" · Lớp ${escapeHtml(String(group.grade))}` : '';

  function rosterRowHtml(r) {
    if (r.status === 'done') {
      return `<div class="hint">✅ ${escapeHtml(r.name)} — nộp lúc ${new Date(r.at).toLocaleTimeString('vi-VN')} · ${r.score10.toFixed(1)} điểm</div>`;
    }
    if (r.status === 'inprogress') {
      return `<div class="hint">⏳ ${escapeHtml(r.name)} — đang làm bài (bắt đầu lúc ${new Date(r.at).toLocaleTimeString('vi-VN')})</div>`;
    }
    return `<div class="hint" style="color:var(--text-faint);">⚪ ${escapeHtml(r.name)} — chưa bắt đầu</div>`;
  }

  let countdownTimer = null;

  function renderOngoing() {
    card.style.display = 'block';
    card.style.borderColor = 'var(--brand)';
    card.innerHTML = `
      <h2><span class="icon">🔴</span>Đang diễn ra: ${escapeHtml(exam.examTitle || exam.chapterTitle)}</h2>
      <p class="hint" style="margin-top:-4px;">${groupLabel}</p>
      <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0;">
        <div style="font-size:13px;color:var(--text-dim);">⏱ Thời gian còn lại</div>
        <div id="teacherExamCountdown" style="font-weight:800;font-size:22px;color:var(--brand);"></div>
      </div>
      <button class="btn block" id="teacherExamRosterToggle">👥 ${doneCount}/${total} đã nộp · ${inProgressCount} đang làm bài — bấm để xem danh sách</button>
      <div id="teacherExamRoster" style="display:none;margin-top:10px;">
        ${roster.length ? roster.map(rosterRowHtml).join('') : '<div class="hint">Chưa có học sinh nào trong nhóm.</div>'}
      </div>
    `;
    $('#teacherExamRosterToggle').addEventListener('click', () => {
      const box = $('#teacherExamRoster');
      box.style.display = box.style.display === 'none' ? 'block' : 'none';
    });
    updateCountdown();
    countdownTimer = setInterval(updateCountdown, 1000);
  }

  function updateCountdown() {
    const el = $('#teacherExamCountdown');
    if (!el) { clearInterval(countdownTimer); return; }
    const remainMs = endTime.getTime() - Date.now();
    if (remainMs <= 0) {
      clearInterval(countdownTimer);
      renderFinished();
      return;
    }
    const totalSec = Math.floor(remainMs / 1000);
    const m = Math.floor(totalSec / 60), s = totalSec % 60;
    el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  function renderFinished() {
    card.style.display = 'block';
    card.style.borderColor = 'var(--border)';
    card.innerHTML = `
      <h2><span class="icon">✅</span>Đã kết thúc: ${escapeHtml(exam.examTitle || exam.chapterTitle)}</h2>
      <p class="hint" style="margin-top:-4px;">${groupLabel} · ${doneCount}/${total} học sinh đã nộp bài</p>
      <a class="btn primary block" href="pages/thong-ke.html?group=${encodeURIComponent(exam.groupCode)}">Xem thống kê →</a>
    `;
  }

  if (isOngoing) renderOngoing(); else renderFinished();
})();
