> ⚠️ **Đã lỗi thời — không dùng nữa.** App đã chuyển sang backend Firebase (xem
> [firebase/HUONG-DAN-TRIEN-KHAI.md](../firebase/HUONG-DAN-TRIEN-KHAI.md)). Giữ lại file này chỉ để
> tham khảo lịch sử. Nếu đã deploy Apps Script theo hướng dẫn dưới đây trước kia, có thể xoá
> deployment đó trong Google Sheet — không còn được app sử dụng.

# Hướng dẫn triển khai Backend (Nhóm học sinh + Đề kiểm tra) — CŨ

Làm 1 lần duy nhất. Giống hệt cách bạn đã làm với bộ đếm lượt cài của app Quân Nhân.

## Bước 1 — Tạo Google Sheet

1. Vào [sheets.google.com](https://sheets.google.com) → tạo 1 Sheet mới, đặt tên bất kỳ (VD: "Du lieu Hoa Hoc").
2. Không cần tạo cột gì cả — script sẽ tự tạo 4 sheet con (Groups, Students, Exams, Submissions) ở lần chạy đầu tiên.

## Bước 2 — Dán code

1. Trong Sheet vừa tạo: **Extensions (Tiện ích mở rộng) → Apps Script**.
2. Xoá hết nội dung mặc định trong file `Code.gs`, dán toàn bộ nội dung file [Code.gs](Code.gs) (cùng thư mục với file hướng dẫn này) vào.
3. Bấm biểu tượng 💾 Lưu (hoặc Ctrl+S).

## Bước 3 — Triển khai (Deploy)

1. Bấm nút **Deploy (Triển khai)** góc trên bên phải → **New deployment (Triển khai mới)**.
2. Bấm biểu tượng ⚙️ cạnh "Select type" → chọn **Web app**.
3. Điền:
   - Description: tuỳ ý (VD: "API Hoá Học v1")
   - Execute as: **Me (tôi)**
   - Who has access: **Anyone (Bất kỳ ai)**
4. Bấm **Deploy**. Lần đầu Google sẽ hỏi cấp quyền — chọn tài khoản của bạn → **Advanced (Nâng cao)** → **Go to ... (unsafe)** → **Allow (Cho phép)**. (Cảnh báo "unsafe" là bình thường vì đây là script tự viết, chưa qua kiểm duyệt của Google — không phải lỗi.)
5. Copy **Web app URL** (dạng `https://script.google.com/macros/s/xxxxx/exec`).

## Bước 4 — Kết nối vào app

1. Mở app Trợ Lý Giáo Viên Hoá Học → **Kết nối đồng bộ** (từ trang chủ).
2. Dán URL vừa copy vào ô, bấm **Kiểm tra kết nối**.
3. Thấy "✓ Kết nối thành công" là xong — từ giờ tính năng Nhóm học sinh, Đề kiểm tra, Thống kê sẽ hoạt động.

## Lưu ý

- **Mỗi lần sửa lại code trong Apps Script**, bạn cần **Deploy → Manage deployments → bấm ✏️ Edit → Version: New version → Deploy** thì thay đổi mới có hiệu lực (không tự cập nhật).
- Dữ liệu (nhóm, học sinh, đề, điểm) nằm ngay trong Google Sheet bạn tạo — mở Sheet lên là xem/sửa/xoá trực tiếp được, không cần qua app.
- Đây là công cụ dùng cho 1 giáo viên (không có đăng nhập/mật khẩu) — ai có URL cũng gọi được API, nên đừng chia sẻ URL này công khai. Học sinh không cần URL này, chỉ cần mã nhóm.
