# HƯỚNG DẪN XÂY DỰNG APP: TRỢ LÝ GIÁO VIÊN HOÁ HỌC

> File này dùng để đưa cho Claude Desktop ở đầu phiên làm việc, giúp Claude nắm toàn bộ bối cảnh và bắt đầu code ngay mà không cần giải thích lại từ đầu.

---

## 1. Bối cảnh & mô hình tham chiếu

Đây là app thứ 3 của tác giả (Huỳnh Công Chính, Trường Quân sự Quân đoàn 34), theo đúng phong cách 2 app đã có:

- **Tính Lương Quân Nhân / Trợ Lý Quân Nhân** — web app tĩnh, PWA, GitHub Pages, kiến trúc multi-module (home có tile cho từng tính năng)
- **Giải Toán Pháo Binh (GTBP)** — cùng phong cách, có mô hình kích hoạt trả phí qua chuyển khoản/Momo + mã kích hoạt gửi qua Zalo

App hoá học sẽ dùng **chung kiến trúc kỹ thuật** với 2 app trên: HTML/CSS/JS thuần, PWA (cài được như app gốc, chạy offline), publish qua GitHub Pages, JS được obfuscate trước khi đưa vào bản chính thức.

**Tên đề xuất:** "Trợ Lý Giáo Viên Hoá Học" (có thể đổi tên riêng theo từng giáo viên khi mở rộng — xem mục 6).

---

## 2. Kiến trúc kỹ thuật

- **Kiểu app:** Progressive Web App (PWA) — cài lên màn hình chính, chạy offline hoàn toàn cho các tính năng lõi
- **Công nghệ:** HTML + CSS + JavaScript thuần (không cần framework nặng), giống 2 app trước
- **Lưu trữ dữ liệu:**
  - **Giai đoạn 1 (bản đầu):** ngân hàng câu hỏi, dữ liệu chương, nội dung bài giảng lưu dạng **file JSON tĩnh** đóng gói sẵn trong app — không cần backend, không cần mạng
  - **Giai đoạn 2 (khi mở rộng, nhiều giáo viên tự thêm nội dung):** nâng cấp sang Google Sheets + Google Apps Script để đồng bộ nội dung mà không cần build lại app, giống cách app Quân Nhân đã nâng cấp bộ đếm lượt cài
- **Trạng thái kích hoạt trả phí:** lưu trong localStorage/IndexedDB trên máy học sinh, tương tự cơ chế của GTBP
- **Dung lượng:** không phải vấn đề — vài nghìn đến vài chục nghìn câu hỏi dạng JSON chỉ tốn vài MB, IndexedDB cho phép lưu offline tới hàng trăm MB. Nếu có hình ảnh minh hoạ, nén WebP và tải theo nhu cầu thay vì nhét hết vào 1 file.

---

## 3. Danh sách tính năng — ưu tiên xây dựng

### 3.1. Bộ ba tính năng lõi (làm trước tiên, 100% offline, JS thuần)
1. **Bảng tuần hoàn tương tác** — click nguyên tố xem cấu hình electron, tính chất, ứng dụng
2. **Công cụ tính toán nhanh** — mol, nồng độ, độ tan, pH, hiệu suất phản ứng
3. **Cân bằng phương trình hoá học tự động** — nhập chất phản ứng, thuật toán đại số tuyến tính ra phương trình cân bằng

### 3.2. Nội dung học theo chương trình
- Cấu trúc "học theo chương": mỗi chương SGK là 1 module gồm bài giảng tóm tắt → flashcard/mini-game liên quan → trắc nghiệm kiểm tra
- Tiến độ theo tuần tự: chương sau mở khi hoàn thành chương trước (hoặc giáo viên cho mở tự do)
- Trang tổng quan hiển thị % hoàn thành từng chương và toàn chương trình

### 3.3. Gamify — tạo hứng thú học
- Điểm số, huy hiệu khi hoàn thành chương/chuyên đề
- Streak học tập (số ngày học liên tục)
- Bảng xếp hạng lớp
- Mini-game: ghép nguyên tố-ký hiệu, xếp dãy hoạt động kim loại, đoán phản ứng qua hiện tượng
- Câu đố hoá học hằng ngày (dạng Wordle)
- Thí nghiệm ảo tương tác — chọn hoá chất trộn thử, xem hiện tượng (màu sắc, kết tủa, khí thoát)

### 3.4. Thương hiệu riêng cho giáo viên
- Trang giới thiệu giáo viên (ảnh, tiểu sử, phong cách dạy)
- Logo/tên app tuỳ chỉnh theo từng giáo viên
- Giáo viên tự đăng bài giảng, mẹo học, video riêng
- Chứng nhận hoàn thành khoá học có tên + logo giáo viên

### 3.5. Hỗ trợ khác
- Từ điển thuật ngữ hoá học Việt-Anh
- Chuyển đổi đơn vị
- Ngân hàng đề trắc nghiệm ôn thi

---

## 4. Mô hình kiếm tiền (paywall)

Dùng chung cơ chế với GTBP: kích hoạt trả phí qua chuyển khoản/Momo, mã gửi qua Zalo (0978900921), nhập mã trong app để mở khoá.

**Miễn phí (bản dùng thử):**
- Bảng tuần hoàn, công cụ tính toán cơ bản
- 1 chương đầu học thử đầy đủ
- Flashcard giới hạn (~20 nguyên tố đầu)

**Trả phí (mở khoá bằng mã kích hoạt):**
- Toàn bộ lộ trình chương trình (8 chương/khối lớp)
- Ngân hàng đề trắc nghiệm đầy đủ + đề thi thử có chấm điểm
- Mini-game đầy đủ, không giới hạn lượt
- Thí nghiệm ảo nâng cao
- Bảng xếp hạng, huy hiệu, chứng nhận có tên/logo giáo viên
- Xuất đề PDF để in offline

**UI khoá tính năng:** khi chạm vào nội dung chưa kích hoạt, hiện màn hình rõ ràng gồm: tên nội dung bị khoá, danh sách lợi ích gói kích hoạt, giá tiền, nút "xem hướng dẫn thanh toán", và ô nhập mã kích hoạt.

**Hướng mở rộng:** có thể gắn mã kích hoạt riêng theo từng giáo viên (không chỉ 1 mã chung toàn app) để mỗi giáo viên tự bán và thu tiền học sinh của mình — phù hợp với mục tiêu xây thương hiệu riêng cho giáo viên ở mục 3.4.

---

## 5. Cách nạp ngân hàng câu hỏi / nội dung chương

**Giai đoạn 1 (khuyến nghị bắt đầu):** soạn thủ công thành file JSON theo format chuẩn (câu hỏi, 4 đáp án, đáp án đúng, giải thích, thuộc chương nào), đóng gói tĩnh trong app — mỗi lần thêm câu hỏi mới thì build lại và upload GitHub như quy trình đang dùng cho app Quân Nhân.

**Giai đoạn 2 (khi ngân hàng câu hỏi lớn dần / nhiều giáo viên đóng góp):** cân nhắc 1 trong 2:
- Soạn qua file Excel mẫu rồi convert tự động sang JSON bằng script — phù hợp nếu giáo viên khác không biết code
- Chuyển sang Google Sheets + Google Apps Script để đồng bộ trực tiếp, không cần build lại app mỗi lần

---

## 6. Thứ tự xây dựng đề xuất

1. Bộ ba tính năng lõi (bảng tuần hoàn, tính toán, cân bằng phương trình) — offline, JS thuần
2. Cấu trúc "học theo chương" cho 1 khối lớp (bắt đầu lớp 10), với nội dung mẫu 1-2 chương để test luồng
3. Cơ chế kích hoạt trả phí (tái dùng logic từ GTBP)
4. Gamify: điểm, huy hiệu, streak, 1 mini-game mẫu
5. Trang thương hiệu giáo viên
6. Mở rộng ngân hàng câu hỏi, thêm khối lớp 11-12
7. (Sau này) nâng cấp lưu trữ nội dung lên Google Sheets nếu cần nhiều giáo viên tự thêm

---

## 7. Quy trình làm việc mỗi phiên (giữ nguyên như 2 app trước)

- Sửa file source sạch (chưa obfuscate)
- Kiểm tra cú pháp JS
- Obfuscate phần script bằng javascript-obfuscator (bộ flag đã dùng cho app Quân Nhân)
- Merge lại vào index.html
- Xuất cả bản obfuscate (index.html) và bản source sạch
- manifest.json và service-worker.js không obfuscate
- Upload lên GitHub repo qua web UI (Add file → Upload files → Commit)
