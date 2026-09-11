# Hướng dẫn nhân bản app sang môn học khác (Toán, Lý, ...)

App này được thiết kế theo mô hình: **mỗi môn học = 1 bản sao (fork) độc lập** — copy toàn bộ repo,
đổi thương hiệu, thay các công cụ/nội dung riêng Hoá bằng công cụ/nội dung riêng môn mới, deploy lên
1 Firebase project + GitHub Pages riêng. Dữ liệu giáo viên/học sinh của từng môn tách biệt hoàn toàn
(khác Firebase project = khác database), an toàn, không lẫn lộn.

Tài liệu này liệt kê CHÍNH XÁC chỗ nào giữ nguyên (dùng chung được), chỗ nào phải xoá/thay khi tạo
app môn mới — để việc nhân bản nhanh, không bỏ sót, không phải dò lại từ đầu.

## 1. Lõi dùng chung — GIỮ NGUYÊN, không cần sửa

Những phần này không "biết" gì về Hoá học — chỉ là khung quản lý nội dung do giáo viên tự nạp, dùng
được cho bất kỳ môn nào ngay:

- **Quản lý Chương/Bài**: `js/features/chapter-detail.js`, `chapter-overview.js`, `chapter-meta.js`,
  `custom-lessons.js`, `custom-quiz.js`, `custom-flashcards.js`, `doc-import.js`, `quiz-common.js`
- **Chương trình tự tạo** (giáo viên tự soạn khung chương/bài mới không dựa curriculum có sẵn):
  `js/features/programs-data.js`, `pages/hoc-theo-chuong.html`
- **Tài khoản/đăng nhập/đồng bộ**: `js/features/auth.js`, `firebase-init.js`, `role.js`,
  `pages/ket-noi-dong-bo.html`
- **Nhóm học sinh**: `group-manager.js`, `groups-data.js`, `join-group.js`, `manage-students.js`,
  `teacher-student-accounts.js`, `pages/nhom-hoc-sinh.html`, `pages/quan-ly-hoc-sinh.html`,
  `pages/vao-nhom.html`
- **Đề kiểm tra**: `exam-creator.js`, `exam-taker.js`, `exam-stats.js`, `teacher-exam-monitor.js`,
  `shared-bank.js`, `pages/tao-de-kiem-tra.html`, `pages/kiem-tra.html`
- **Hồ sơ/thương hiệu giáo viên**: `branding.js`, `teacher-profile.js`, `pages/ho-so.html` (chỉ có 2-3
  dòng chữ "Trợ Lý Giáo Viên Hoá Học" cần đổi tên — xem mục 3)
- **Kinh doanh/Pro**: `monetization.js`, `upgrade.js`, `admin.js`, `pages/nang-cap.html`,
  `pages/quan-tri.html`
- **Khác**: `feedback.js`, `progress.js`, `thong-ke.html`
- **Cloud Function AI** (`functions/`): TOÀN BỘ dùng chung — chỉ cần đổi 1 hằng số `SUBJECT_NAME` ở
  đầu `functions/index.js` (xem mục 3). Kiến trúc nhiều nhà cung cấp AI (`functions/providers/`), kiểm
  tra Pro, giới hạn chi phí... không đổi gì.

## 2. Công cụ CHỈ dành riêng Hoá học — XOÁ hoặc THAY khi làm môn mới

Đây là phần cần công sức thật sự — Toán/Lý không có khái niệm tương đương, phải tự viết công cụ +
soạn nội dung mới (không phải chỉ sửa kiến trúc):

| Loại | File cần xoá/thay |
|---|---|
| Tính năng | `js/features/balancer.js` (cân bằng phương trình), `calculator.js` (tính mol/nồng độ/pH...), `chemistry-formulas.js`, `chemistry-stories.js`, `formula-parser.js`, `organic-nomenclature.js`, `periodic-table.js`, `reference-tables.js` |
| Dữ liệu | `js/data/chapters-6.js` → `chapters-12.js` (nội dung chương trình Hoá lớp 6-12), `chemistry-formulas.js`, `chemistry-stories.js`, `elements.js`, `organic-nomenclature.js`, `reference-tables.js` |
| Trang | `pages/bang-tuan-hoan.html`, `can-bang-phuong-trinh.html`, `cau-chuyen-hoa-hoc.html`, `cong-cu-tinh-toan.html`, `cong-thuc-dinh-luat.html`, `danh-phap-huu-co.html`, `bang-tra-cuu.html` |

`js/data/curriculum.js` GIỮ NGUYÊN phần khung (đăng ký `CHAPTERS_6`..`CHAPTERS_12` theo khối lớp) —
chỉ cần viết lại nội dung bên trong từng file `chapters-N.js` cho đúng chương trình môn mới, đúng
cấu trúc dữ liệu cũ (xem 1 file `chapters-10.js` hiện tại làm mẫu).

Môn mới có thể **bỏ qua hoàn toàn** các công cụ riêng ở mục này lúc đầu (MVP) — chỉ cần phần "Chương
trình tự tạo" (mục 1) là giáo viên đã nạp bài giảng/trắc nghiệm/flashcard dùng được ngay, không cần
công cụ tính toán/tra cứu riêng ngay từ ngày đầu.

## 3. Danh sách đổi thương hiệu (bắt buộc, làm 1 lần khi fork)

1. **Tên app**: tìm-thay TOÀN BỘ chuỗi `Trợ Lý Giáo Viên Hoá Học` (và biến thể `TL Hoá Học`) sang tên
   môn mới, trong: `index.html`, `manifest.json`, mọi `<title>` trong `pages/*.html`,
   `js/features/chapter-detail.js`, `chapter-overview.js`, `teacher-profile.js`. Có thể dùng lệnh tìm
   toàn cục (VD VS Code "Replace in Files") vì đây là chuỗi cố định, không cần đổi cách viết code.
2. **`functions/index.js`**: đổi hằng số `SUBJECT_NAME = 'Hoá học'` (dòng đầu `buildSystemPrompt`)
   sang tên môn mới — AI sẽ tự soạn câu hỏi/flashcard đúng "giọng" môn đó.
3. **`manifest.json`**: đổi `name`, `short_name`, `description`, `theme_color` (tuỳ chọn) và thay hẳn
   bộ icon trong `icons/` (logo môn mới).
4. **`service-worker.js`**: đổi `CACHE_NAME` (dòng 1, VD `tro-ly-toan-hoc-v1`); xoá khỏi danh sách file
   cache cứng các trang đã xoá ở mục 2 (`bang-tuan-hoan.html`, `can-bang-phuong-trinh.html`, ...); thêm
   trang mới nếu có.
5. **`index.html`**: xoá các ô (tile) trang chủ trỏ tới trang đã xoá ở mục 2; sửa `<meta
   name="description">`.
6. **Firebase project riêng** (bắt buộc — KHÔNG dùng chung project với app Hoá, để dữ liệu tách biệt):
   làm lại từ Bước 1 trong `firebase/HUONG-DAN-TRIEN-KHAI.md` (tạo project mới, lấy config mới dán vào
   `DEFAULT_FIREBASE_CONFIG` trong `firebase-init.js`, `.firebaserc` đổi project id mới).
7. **GitHub repo riêng**: tạo repo mới, bật GitHub Pages riêng cho môn mới (giữ nguyên repo Hoá học
   không đổi).

## 4. Sau khi fork xong

Soạn nội dung chương trình môn mới qua chính tính năng "Chương trình tự tạo" (mục 1) hoặc viết cứng
vào `js/data/chapters-N.js` theo khối lớp như app Hoá đang làm — tuỳ quy mô, không bắt buộc làm ngay
cả 2 cách.
