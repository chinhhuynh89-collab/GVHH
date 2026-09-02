// Trang "Quản lý học sinh": gộp TẤT CẢ học sinh đã đăng ký ở TẤT CẢ nhóm của giáo viên hiện tại
// thành 1 danh sách duy nhất (1 học sinh có thể xuất hiện với nhiều nhóm nếu học cùng lúc), đánh
// dấu "MỚI" cho học sinh đăng ký sau lần giáo viên xem gần nhất, rồi cập nhật lại mốc "đã xem".

(function () {
  requireTeacherAuth(async (user) => {
    const box = $('#manageStudentsBody');
    const lastSeen = getStudentsLastSeen(user.uid);
    box.innerHTML = '<p class="hint">⏳ Đang tải danh sách học sinh...</p>';

    let students = [];
    try {
      students = await getAllStudentsForCurrentTeacher();
    } catch (e) {
      box.innerHTML = `<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`;
      return;
    }

    if (!students.length) {
      box.innerHTML = '<p class="hint">Chưa có học sinh nào đăng ký học cùng bạn.</p>';
      markStudentsSeenNow(user.uid);
      return;
    }

    const rows = students.map((s, i) => {
      const isNew = !!lastSeen && (s.latestJoinedAt || '') > lastSeen;
      const groupsText = s.groups.map((g) => escapeHtml(g.groupName)).join(', ');
      return `
        <tr${isNew ? ' style="background:rgba(220,38,38,0.08);"' : ''}>
          <td>${i + 1}${isNew ? ' <span class="badge" style="position:static;display:inline-block;background:#dc2626;color:#fff;">MỚI</span>' : ''}</td>
          <td>${escapeHtml(s.studentName || '')}</td>
          <td>${escapeHtml(s.school || '')}</td>
          <td>${escapeHtml(s.className || '')}</td>
          <td>${escapeHtml(s.address || '')}</td>
          <td>${escapeHtml(s.phone || '')}</td>
          <td>${groupsText}</td>
          <td>${escapeHtml((s.latestJoinedAt || '').slice(0, 10))}</td>
        </tr>
      `;
    }).join('');

    box.innerHTML = `
      <p class="hint">👉 Kéo ngang bảng để xem đủ các cột</p>
      <div class="roster-table-wrap">
        <table class="roster-table">
          <thead>
            <tr><th>STT</th><th>Họ tên</th><th>Trường</th><th>Lớp</th><th>Địa chỉ</th><th>SĐT</th><th>Nhóm đang học</th><th>Đăng ký gần nhất</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
    markStudentsSeenNow(user.uid);
  });
})();
