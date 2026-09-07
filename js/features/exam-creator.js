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

// Rút ngẫu nhiên ĐÚNG số lượng mỗi loại rồi gộp + xáo lại 1 lần nữa (tránh xếp thành từng cụm theo
// loại) — dùng chung cho cả "Tạo đề kiểm tra" (online) và "Xuất đề in giấy" (offline) bên dưới.
function drawQuestionsForExport(poolByType, counts) {
  return shuffleArray(
    QUIZ_TYPE_OPTIONS.flatMap((t) => shuffleArray(poolByType[t.value]).slice(0, counts[t.value]))
  );
}

// ---------- Xuất đề in giấy (Word/PDF) — KHÔNG ghi Firestore, xử lý hoàn toàn phía trình duyệt ----------
// Chỉ xáo đáp án cho câu "abcd" — câu "Đúng/Sai" giữ nguyên thứ tự Đúng trước/Sai sau (quy ước quen
// thuộc trên đề giấy), câu "Nhập đáp án" không có gì để xáo. Câu cắt ảnh từ PDF (question.noShuffle,
// xem doc-import.js) dùng nhãn A/B/C/D chung chung khớp với ảnh gốc — xáo sẽ làm sai lệch, giữ nguyên.
function shuffleOptionsForPrint(question) {
  if (getQuestionType(question) !== 'abcd' || question.noShuffle) return question;
  const order = shuffleArray(question.options.map((_, i) => i));
  return Object.assign({}, question, {
    options: order.map((i) => question.options[i]),
    correct: order.indexOf(question.correct)
  });
}

// Rút 1 lần bộ câu hỏi CHUNG cho mọi mã đề (đảm bảo các mã đề cùng độ khó), mỗi mã đề chỉ khác nhau ở
// thứ tự câu hỏi + thứ tự đáp án.
function buildExamVariants(questions, numVariants) {
  const variants = [];
  for (let i = 0; i < numVariants; i++) {
    variants.push({
      label: 'ĐỀ ' + String(i + 1).padStart(2, '0'),
      questions: shuffleArray(questions).map(shuffleOptionsForPrint)
    });
  }
  return variants;
}

function answerKeyLabel(question) {
  if (getQuestionType(question) === 'text') return formatCorrectAnswerDisplay(question);
  return ['A', 'B', 'C', 'D'][question.correct] || '?';
}

function renderQuestionBlockHtml(question, idx) {
  const type = getQuestionType(question);
  let optsHtml;
  if (type === 'abcd') {
    const letters = ['A', 'B', 'C', 'D'];
    optsHtml = `<div class="opts">${question.options.map((opt, i) => `<div>${letters[i]}. ${escapeHtml(opt)}</div>`).join('')}</div>`;
  } else if (type === 'truefalse') {
    optsHtml = '<div class="opts"><div>A. Đúng</div><div>B. Sai</div></div>';
  } else {
    optsHtml = '<div class="opts blank-line">Trả lời: ....................................................................</div>';
  }
  return `<div class="q"><p><strong>Câu ${idx + 1}:</strong> ${escapeHtml(question.q)}</p>${optsHtml}</div>`;
}

function buildExamPrintHtml(variants, examTitle, durationMinutes) {
  const title = examTitle || 'ĐỀ KIỂM TRA';
  const variantsHtml = variants.map((v, vi) => `
    <div class="variant"${vi > 0 ? ' style="page-break-before:always;"' : ''}>
      <div class="head">
        <p>Trường: ..................................................... &nbsp;&nbsp;&nbsp; Lớp: ..............</p>
        <p>Họ và tên học sinh: .............................................................................</p>
        <h2>${escapeHtml(title)}</h2>
        <p>Thời gian làm bài: ${durationMinutes} phút &nbsp;&nbsp;&nbsp; <strong>Mã đề: ${escapeHtml(v.label)}</strong></p>
      </div>
      ${v.questions.map((q, qi) => renderQuestionBlockHtml(q, qi)).join('')}
    </div>
  `).join('');
  const answerKeyHtml = `
    <div class="variant" style="page-break-before:always;">
      <h2>BẢNG ĐÁP ÁN</h2>
      ${variants.map((v) => `<p><strong>${escapeHtml(v.label)}:</strong> ${v.questions.map((q, qi) => `Câu ${qi + 1}: ${escapeHtml(answerKeyLabel(q))}`).join(' — ')}</p>`).join('')}
    </div>
  `;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: 'Times New Roman', Times, serif; font-size: 13pt; color: #000; background: #fff; margin: 24px; }
  h2 { text-align: center; margin: 8px 0 14px; }
  .head p { margin: 2px 0; }
  .q { margin: 10px 0; }
  .opts { margin-left: 18px; }
  .opts div { margin: 2px 0; }
  .blank-line { margin-top: 6px; }
</style>
</head><body>${variantsHtml}${answerKeyHtml}</body></html>`;
}

function exportExamAsWord(html, filename) {
  const wordHtml = '﻿<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">'
    + html.replace(/^<!DOCTYPE html>/, '') + '</html>';
  const blob = new Blob([wordHtml], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportExamAsPdf(html) {
  const win = window.open('', '_blank');
  if (!win) throw new Error('Trình duyệt đã chặn cửa sổ mới — cho phép popup rồi thử lại.');
  win.document.open();
  win.document.write(html);
  win.document.close();
  // window.print() cần đợi trình duyệt dựng xong nội dung vừa ghi — onload không đảm bảo chạy trên
  // mọi trình duyệt với document.write() nên dùng setTimeout ngắn thay vì phụ thuộc sự kiện đó.
  setTimeout(() => { try { win.focus(); win.print(); } catch (e) { /* người dùng có thể tự bấm Ctrl+P */ } }, 500);
}

function sanitizeFileNamePart(s) {
  return String(s || '').replace(/[^\p{L}\p{N}\- ]/gu, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-') || 'de-kiem-tra';
}

// Câu "Nhập đáp án" không có "options" (không có gì để chọn) — chỉ ghi field phù hợp với từng loại,
// tránh lưu options:undefined (Firestore không chấp nhận field undefined).
function publicQuestionFields(q) {
  const type = getQuestionType(q);
  return type === 'text' ? { q: q.q, type } : { q: q.q, type, options: q.options };
}
function answerKeyFields(q) {
  const type = getQuestionType(q);
  const base = { type, explain: q.explain || '' };
  return type === 'text' ? Object.assign(base, { acceptedAnswers: q.acceptedAnswers }) : Object.assign(base, { correct: q.correct });
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
      questions: examInput.questions.map(publicQuestionFields),
      createdAt: new Date().toISOString()
    }),
    db.collection('examAnswers').doc(examRef.id).set({
      answers: examInput.questions.map(answerKeyFields)
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
        return builtIn.concat(custom.map((c) => Object.assign({}, c)));
      }));
      return pools.flat();
    }

    function splitPoolByType(pool) {
      const byType = { abcd: [], truefalse: [], text: [] };
      pool.forEach((q) => { byType[getQuestionType(q)].push(q); });
      return byType;
    }

    let currentPoolByType = { abcd: [], truefalse: [], text: [] };

    // Dựng ĐỘNG ô nhập số lượng cho từng loại — chỉ hiện loại đang có ≥1 câu trong kho, mặc định lấy
    // hết số câu sẵn có (giáo viên tự giảm xuống nếu muốn ít hơn).
    function renderExamCountFields() {
      const rows = QUIZ_TYPE_OPTIONS.filter((t) => currentPoolByType[t.value].length > 0).map((t) => {
        const available = currentPoolByType[t.value].length;
        return `
          <div class="field" style="margin-bottom:8px;">
            <label for="examCount_${t.value}">${escapeHtml(t.label)} (tối đa ${available} câu có sẵn)</label>
            <input type="number" id="examCount_${t.value}" min="0" max="${available}" value="${available}" />
          </div>
        `;
      }).join('');
      $('#examCountFields').innerHTML = rows || '<p class="hint">Chưa có câu hỏi nào để chọn số lượng.</p>';
    }

    function readExamCounts() {
      const counts = {};
      QUIZ_TYPE_OPTIONS.forEach((t) => {
        const el = document.getElementById('examCount_' + t.value);
        counts[t.value] = el ? Math.max(0, Math.min(parseInt(el.value, 10) || 0, currentPoolByType[t.value].length)) : 0;
      });
      return counts;
    }

    async function onChapterChange() {
      const chapterIds = selectedChapterIds();
      const pool = await getQuestionPool(chapterIds);
      currentPoolByType = splitPoolByType(pool);
      if (!pool.length) {
        $('#examPoolInfo').textContent = 'Chưa có câu hỏi nào trong (các) chương đã chọn — hãy thêm câu hỏi trước hoặc chọn chương khác.';
      } else {
        const breakdown = QUIZ_TYPE_OPTIONS.filter((t) => currentPoolByType[t.value].length > 0)
          .map((t) => `${t.label}: ${currentPoolByType[t.value].length}`).join(', ');
        $('#examPoolInfo').textContent = `Kho câu hỏi hiện có: ${pool.length} câu (gộp từ ${chapterIds.length} chương đã chọn) — ${breakdown}.`;
      }
      renderExamCountFields();
    }

    $('#examGroup').addEventListener('change', onGroupChange);

    $('#examCreateBtn').addEventListener('click', async () => {
      const box = $('#examCreateResult');
      const groupCode = $('#examGroup').value;
      const chapterIds = selectedChapterIds();
      const examTitle = $('#examTitle').value.trim();
      const counts = readExamCounts();
      const count = QUIZ_TYPE_OPTIONS.reduce((sum, t) => sum + counts[t.value], 0);
      const duration = parseInt($('#examDuration').value, 10);
      const startMode = $('#examStartMode').value;

      if (!groupCode) { showResult(box, 'Chọn nhóm.', true); return; }
      if (!chapterIds.length) { showResult(box, 'Chọn ít nhất 1 chương.', true); return; }
      if (!count || count < 1) { showResult(box, 'Chọn ít nhất 1 câu (ở 1 trong các loại).', true); return; }
      if (!duration || duration < 1) { showResult(box, 'Nhập thời gian làm bài hợp lệ.', true); return; }

      const pool = await getQuestionPool(chapterIds);
      if (!pool.length) { showResult(box, '(Các) chương đã chọn chưa có câu hỏi trắc nghiệm nào.', true); return; }
      const poolByType = splitPoolByType(pool);

      const questions = drawQuestionsForExport(poolByType, counts);
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

    // ---------- Xuất đề in giấy (Word/PDF) — dùng lại đúng nhóm/chương/số câu đã chọn ở trên, KHÔNG
    // ghi Firestore (tách biệt hoàn toàn khỏi đề online "Tạo đề kiểm tra" ở nút bên trên). ----------
    async function prepareExportVariants(box) {
      const chapterIds = selectedChapterIds();
      const counts = readExamCounts();
      const count = QUIZ_TYPE_OPTIONS.reduce((sum, t) => sum + counts[t.value], 0);
      if (!chapterIds.length) { showResult(box, 'Chọn ít nhất 1 chương.', true); return null; }
      if (!count || count < 1) { showResult(box, 'Chọn ít nhất 1 câu (ở 1 trong các loại).', true); return null; }

      const pool = await getQuestionPool(chapterIds);
      if (!pool.length) { showResult(box, '(Các) chương đã chọn chưa có câu hỏi trắc nghiệm nào.', true); return null; }
      const poolByType = splitPoolByType(pool);
      const questions = drawQuestionsForExport(poolByType, counts);
      const numVariants = Math.max(1, Math.min(parseInt($('#examVariantCount').value, 10) || 1, 8));
      return {
        variants: buildExamVariants(questions, numVariants),
        examTitle: $('#examTitle').value.trim(),
        duration: parseInt($('#examDuration').value, 10) || 0
      };
    }

    $('#examExportWordBtn').addEventListener('click', async () => {
      const box = $('#examExportResult');
      showResult(box, '⏳ Đang tạo file...');
      try {
        const prep = await prepareExportVariants(box);
        if (!prep) return;
        const html = buildExamPrintHtml(prep.variants, prep.examTitle, prep.duration);
        exportExamAsWord(html, sanitizeFileNamePart(prep.examTitle) + '.doc');
        showResult(box, `✓ Đã tải file Word — ${prep.variants.length} mã đề.`);
      } catch (e) {
        showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
      }
    });

    $('#examExportPdfBtn').addEventListener('click', async () => {
      const box = $('#examExportResult');
      showResult(box, '⏳ Đang mở bản xem trước...');
      try {
        const prep = await prepareExportVariants(box);
        if (!prep) return;
        const html = buildExamPrintHtml(prep.variants, prep.examTitle, prep.duration);
        exportExamAsPdf(html);
        showResult(box, `✓ Đã mở bản xem trước — ${prep.variants.length} mã đề. Trong hộp thoại In, chọn đích đến "Lưu thành PDF" (Save as PDF) để lưu file.`);
      } catch (e) {
        showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
      }
    });

    loadGroups();
  });
})();
