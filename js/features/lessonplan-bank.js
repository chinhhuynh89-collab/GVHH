// Trang "Kho giáo án" — xem TOÀN BỘ giáo án AI đã tạo, gộp từ MỌI chương, để giáo viên tìm lại dễ
// dàng thay vì chỉ xem được từ đúng bài giảng đã tạo ra nó (mục "📋 Giáo án đã tạo" trong
// chapter-detail.js vẫn giữ nguyên — đây là 1 nơi xem TỔNG HỢP thêm, không thay thế).

(function () {
  let plans = [];
  let titleMap = new Map();

  requireTeacherAuth(async (user) => {
    const box = $('#bankList');
    box.innerHTML = '<p class="hint">⏳ Đang tải...</p>';
    try {
      plans = await getAllCustomLessonPlansForTeacher(user.uid);
    } catch (e) {
      box.innerHTML = `<div class="result-box show error">⚠️ ${escapeHtml(e.message)}</div>`;
      return;
    }
    if (!plans.length) {
      $('#bankCount').textContent = 'Chưa có giáo án nào.';
      box.innerHTML = '<p class="hint">📋 Chưa có giáo án nào — vào 1 bài giảng, bấm "🤖 Tạo bằng AI" → chọn "Giáo án" để tạo.</p>';
      return;
    }
    const chapterIds = [...new Set(plans.map((p) => p.chapterId))];
    const titles = await Promise.all(chapterIds.map((id) => resolveChapterTitle(id)));
    titleMap = new Map(chapterIds.map((id, i) => [id, titles[i]]));
    render();
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

  function render() {
    $('#bankCount').textContent = `${plans.length} giáo án`;
    const box = $('#bankList');
    const sorted = plans.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    box.innerHTML = sorted.map((p) => `
      <div class="card" style="margin-bottom:10px;">
        <h3 style="margin:0 0 4px;">${escapeHtml(p.tenBai || 'Giáo án')}</h3>
        <p class="hint" style="margin:0 0 8px;">
          ${escapeHtml(titleMap.get(p.chapterId) || p.chapterId)} · Lớp ${escapeHtml(String(p.lop || ''))} · ${escapeHtml(String(p.soTiet || ''))} tiết
          ${p.createdAt ? ` · ${new Date(p.createdAt).toLocaleDateString('vi-VN')}` : ''}
        </p>
        <div class="btn-row">
          <a class="btn primary" href="#" data-id="${p.id}" data-action="view" style="flex:1;">🖨️ Xem/In</a>
          <a class="btn" href="chuong.html?id=${encodeURIComponent(p.chapterId)}" style="flex:1;">📘 Mở chương</a>
          <a class="btn" href="#" data-id="${p.id}" data-action="delete" style="flex:1;">🗑️ Xoá</a>
        </div>
      </div>
    `).join('');

    $$('[data-action="view"]', box).forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const plan = plans.find((p) => p.id === a.dataset.id);
        if (plan) printLessonPlan(plan);
      });
    });
    $$('[data-action="delete"]', box).forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!confirm('Xoá giáo án này?')) return;
        try {
          await deleteCustomLessonPlan(a.dataset.id);
          plans = plans.filter((p) => p.id !== a.dataset.id);
          render();
        } catch (err) { showToast('Không xoá được: ' + err.message); }
      });
    });
  }
})();
