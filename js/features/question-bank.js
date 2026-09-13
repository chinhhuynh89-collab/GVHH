// Trang "Kho câu hỏi" — xem TOÀN BỘ câu hỏi trắc nghiệm/tự luận/đúng-sai giáo viên đã tạo, gộp từ
// MỌI chương (chính khoá lẫn chương trình riêng) — khác chapter-detail.js vốn chỉ xem được từng
// chương riêng lẻ. Chỉ đọc/gộp lại để xem — sửa chi tiết/thêm mới vẫn qua đúng chương (link "Mở
// chương"); xoá nhanh làm được ngay tại đây qua deleteCustomQuiz (custom-quiz.js).

(function () {
  let items = [];
  let titleMap = new Map();

  requireTeacherAuth(async (user) => {
    const box = $('#bankList');
    box.innerHTML = '<p class="hint">⏳ Đang tải...</p>';
    try {
      items = await getAllCustomQuizForTeacher(user.uid);
    } catch (e) {
      box.innerHTML = `<div class="result-box show error">⚠️ ${escapeHtml(e.message)}</div>`;
      return;
    }
    if (!items.length) {
      $('#bankCount').textContent = 'Chưa có câu hỏi nào.';
      box.innerHTML = '<p class="hint">📝 Chưa có câu hỏi nào — thêm tay, nạp file, hoặc tạo bằng AI ở từng chương.</p>';
      return;
    }
    const chapterIds = [...new Set(items.map((it) => it.chapterId))];
    const titles = await Promise.all(chapterIds.map((id) => resolveChapterTitle(id)));
    titleMap = new Map(chapterIds.map((id, i) => [id, titles[i]]));
    render();
    $('#bankSearch').addEventListener('input', render);
  });

  async function resolveChapterTitle(chapterId) {
    const found = findChapterAnywhere(chapterId);
    if (found) return found.chapter.title;
    try {
      const pc = await findProgramChapter(chapterId);
      if (pc) return pc.title;
    } catch (e) { /* ignore */ }
    return chapterId;
  }

  const TYPE_LABELS = { abcd: 'Trắc nghiệm', truefalse: 'Đúng/Sai', text: 'Tự luận' };

  function render() {
    const kw = ($('#bankSearch').value || '').trim().toLowerCase();
    const filtered = kw ? items.filter((it) => (it.q || '').toLowerCase().includes(kw)) : items;
    $('#bankCount').textContent = `${filtered.length}/${items.length} câu hỏi`;

    const box = $('#bankList');
    if (!filtered.length) { box.innerHTML = '<p class="hint">Không tìm thấy câu hỏi nào khớp.</p>'; return; }

    const byChapter = new Map();
    filtered.forEach((it) => {
      if (!byChapter.has(it.chapterId)) byChapter.set(it.chapterId, []);
      byChapter.get(it.chapterId).push(it);
    });

    box.innerHTML = [...byChapter.entries()].map(([chapterId, qs]) => `
      <div class="card" style="margin-bottom:12px;">
        <h3 style="margin-top:0;"><a href="chuong.html?id=${encodeURIComponent(chapterId)}">${escapeHtml(titleMap.get(chapterId) || chapterId)}</a> <span class="hint">(${qs.length} câu)</span></h3>
        ${qs.map((it) => `
          <div style="padding:8px 0;border-top:1px solid var(--border);">
            <span style="font-weight:600;">[${TYPE_LABELS[it.type] || 'Trắc nghiệm'}]</span>
            <strong>${escapeHtml(it.q)}</strong>
            <div class="hint" style="margin-top:2px;">
              ${it.type === 'text' ? `Đáp án: ${escapeHtml(String(it.acceptedAnswers || '').split('|').join(' / '))}` : (it.options || []).map((o, oi) => `${oi === it.correct ? '✓ ' : ''}${escapeHtml(o)}`).join(' · ')}
            </div>
            <a href="#" class="bank-quiz-delete" data-id="${it.id}">🗑️ Xoá</a>
          </div>
        `).join('')}
      </div>
    `).join('');

    $$('.bank-quiz-delete', box).forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!confirm('Xoá câu hỏi này?')) return;
        try {
          await deleteCustomQuiz(a.dataset.id);
          items = items.filter((it) => it.id !== a.dataset.id);
          render();
        } catch (err) { showToast('Không xoá được: ' + err.message); }
      });
    });
  }
})();
