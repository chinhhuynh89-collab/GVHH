# Hướng dẫn sử dụng cho giáo viên (sau khi cài app)

## 1. Cài app lên điện thoại/máy tính

Mở link app bằng Chrome (Android) hoặc Safari (iPhone) → trình duyệt sẽ gợi ý **"Thêm vào màn hình chính" / "Add to Home Screen"** → bấm để cài như 1 app thật, dùng được cả khi không có mạng.

## 2. Mở app lần đầu — chọn vai trò

Màn hình chính hiện thẻ **"Bạn là ai?"** → bấm **"👨‍🏫 Tôi là Giáo viên"**.

Từ đây, trang chủ chỉ hiện đúng khu vực Giáo viên (có nút "Đổi vai trò" nếu sau này cần xem lại giao diện học sinh).

## 3. Dùng được ngay — không cần thiết lập gì

4 tính năng này hoạt động **ngay lập tức, hoàn toàn offline**, không cần đăng nhập:

| Tính năng | Dùng để làm gì |
|---|---|
| 🧪 Bảng tuần hoàn | Tra cứu nguyên tố khi soạn bài, giảng dạy |
| 🧮 Công cụ tính toán | Tính nhanh mol, nồng độ, pH... khi ra đề |
| ⚖️ Cân bằng phương trình | Kiểm tra nhanh 1 phương trình có cân bằng đúng không |
| 📘 Học theo chương | Xem bài giảng/flashcard/trắc nghiệm có sẵn theo từng khối lớp; bấm vào 1 chương có thể **"✏️ Sửa"**, viết thêm bài giảng, thêm câu hỏi trắc nghiệm riêng của mình |

→ Nếu bạn chỉ cần công cụ hỗ trợ giảng dạy cá nhân, **dừng ở đây là đủ dùng**.

## 4. Nếu muốn dùng Nhóm học sinh + Đề kiểm tra tự động — thiết lập 1 lần

Đây là tính năng cần đăng nhập vì phải đồng bộ dữ liệu giữa máy giáo viên và máy học sinh.

1. Vào **"Đăng nhập"** (trong Khu vực Giáo viên).
2. Bấm **"Đăng nhập bằng Google"**, chọn tài khoản Google của bạn.

Xong — không cần cài đặt gì thêm, mở khoá toàn bộ phần dưới ngay.

> Nếu trường/tổ bộ môn có nhiều giáo viên cùng dùng: mỗi người chỉ cần mở app và tự đăng nhập bằng tài khoản Google riêng của mình — không ai thấy dữ liệu của ai, không ai cần biết đến Firebase hay phải cài đặt kỹ thuật gì. (Chỉ người quản trị hệ thống mới cần làm [firebase/HUONG-DAN-TRIEN-KHAI.md](firebase/HUONG-DAN-TRIEN-KHAI.md), và cũng chỉ làm đúng 1 lần.)

## 5. Quy trình dùng thường xuyên (mỗi lớp/mỗi kỳ)

**Bước 1 — Soạn nội dung** (làm trước, hoặc vừa dạy vừa bổ sung dần)
Vào **Học theo chương** → chọn chương → **"✏️ Sửa"** để đổi tên/mô tả, **"Viết bài giảng thủ công"** hoặc **"Nạp tài liệu"** (.docx/.pdf) để thêm bài giảng riêng, **"⚙️ Quản lý câu hỏi"** để thêm câu hỏi trắc nghiệm (gõ tay, nạp file .txt, hoặc nạp Excel/CSV theo mẫu tải sẵn).

**Bước 2 — Tạo nhóm cho lớp đang dạy**
Vào **Nhóm học sinh** → **"Tạo nhóm mới"** → đặt tên, chọn khối lớp, tick các chương sẽ học → nhận **mã nhóm** (6 ký tự, VD `TDQ2P7`).

**Bước 3 — Gửi mã nhóm cho học sinh**
Đọc/chiếu mã lên bảng, hoặc gửi qua Zalo lớp. Học sinh vào app → chọn vai trò "Học sinh" → **"Vào nhóm học tập"** → nhập tên + mã.

**Bước 4 — Tạo đề kiểm tra khi cần**
Vào **Nhóm học sinh** → chọn nhóm → **"Tạo đề kiểm tra"** → chọn chương, số câu, thời gian làm bài, thời điểm bắt đầu (ngay/hẹn giờ) → hệ thống tự rút ngẫu nhiên câu hỏi từ kho đã soạn ở Bước 1.

Học sinh mở app sẽ **tự thấy thông báo** "🔔 Có bài kiểm tra mới" ngay trên trang chủ, không cần tìm.

**Bước 5 — Xem kết quả**
Vào **Nhóm học sinh** → chọn nhóm → **"Thống kê"** → chọn đề → thấy điểm từng học sinh, điểm trung bình/cao nhất/thấp nhất, thời gian nộp bài.

## Tóm tắt nhanh

```
Cài app → Chọn "Giáo viên" → (tuỳ chọn) Thiết lập Firebase 1 lần
   → Soạn nội dung chương → Tạo nhóm → Gửi mã cho học sinh
   → Tạo đề kiểm tra khi cần → Xem thống kê
```
