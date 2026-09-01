# Hướng dẫn triển khai Firebase (Nhóm nhiều giáo viên + đồng bộ nhiều thiết bị)

Chỉ **người quản trị** (bạn — người tạo Firebase Project) cần đọc file này, làm 1 lần duy nhất.
Config đã được nhúng sẵn vào code (`js/features/firebase-init.js`) nên **các giáo viên khác không
cần đọc file này** — họ chỉ cần mở app và bấm "Đăng nhập bằng Google" (xem
[HUONG-DAN-SU-DUNG-GIAO-VIEN.md](../HUONG-DAN-SU-DUNG-GIAO-VIEN.md)).

Đây là bản nâng cấp thay thế hoàn toàn Google Sheets/Apps Script trước đó —
không cần làm lại phần Apps Script nữa (có thể xoá Web app deployment cũ nếu muốn).

## Bước 1 — Tạo Firebase Project

1. Vào [console.firebase.google.com](https://console.firebase.google.com), đăng nhập bằng tài khoản Google của bạn.
2. Bấm **"Add project" / "Tạo dự án"**. Đặt tên tuỳ ý (VD: `tro-ly-hoa-hoc`).
3. Bỏ qua Google Analytics (không cần cho app này) — bấm **Create project**.

## Bước 2 — Đăng ký Web App để lấy config

1. Ở trang tổng quan dự án, bấm biểu tượng **`</>`** (Web) để thêm 1 Web App.
2. Đặt tên app tuỳ ý (VD: "Hoa Hoc Web"), **không cần** tick "Firebase Hosting".
3. Bấm **Register app**. Firebase sẽ hiện ra 1 đoạn code chứa `firebaseConfig = {...}` — copy toàn bộ phần trong dấu `{ }` đó (dạng JSON). Giữ lại, sẽ dùng ở Bước 6.

## Bước 3 — Bật đăng nhập Google

1. Menu trái → **Build → Authentication** → bấm **Get started**.
2. Tab **Sign-in method** → bấm **Google** → bật **Enable** → chọn email hỗ trợ (email của bạn) → **Save**.

## Bước 4 — Bật Firestore Database

1. Menu trái → **Build → Firestore Database** → bấm **Create database**.
2. Chọn vị trí server (chọn khu vực gần Việt Nam, VD `asia-southeast1`) → **Next**.
3. Chọn **Start in production mode** → **Enable**.

## Bước 5 — Dán luật bảo mật (Security Rules)

1. Trong Firestore Database, chuyển sang tab **Rules**.
2. Xoá hết nội dung mặc định, dán toàn bộ nội dung file [firestore.rules](firestore.rules) (cùng thư mục với file hướng dẫn này) vào.
3. Bấm **Publish**.

> Đây là bước quan trọng nhất — luật này đảm bảo mỗi giáo viên chỉ sửa được nội dung của chính mình, học sinh không sửa được điểm số của người khác.

## Bước 6 — Nhúng config vào code (chỉ bạn làm, 1 lần)

Mở file `js/features/firebase-init.js`, tìm hằng số `DEFAULT_FIREBASE_CONFIG` ở đầu file, thay 6 giá
trị bằng đúng config bạn copy ở Bước 2 (apiKey, authDomain, projectId, storageBucket,
messagingSenderId, appId). Lưu file, upload lại lên GitHub như bình thường.

Từ giờ, **mọi giáo viên mở app chỉ cần bấm "Đăng nhập bằng Google"** — không ai phải biết đến
config này hay tự tay dán gì cả.

## Bước 7 — Cho phép domain thật (khi đưa lên GitHub Pages)

Mặc định Firebase chỉ cho phép đăng nhập từ `localhost`. Khi bạn upload app lên GitHub Pages (domain dạng `tenban.github.io`), cần thêm domain đó vào danh sách được phép:

1. Authentication → tab **Settings** → **Authorized domains** → **Add domain**.
2. Nhập domain GitHub Pages của bạn (VD: `chinhhuynh.github.io`) → **Add**.

## Lưu ý

- **Dữ liệu nằm ở đâu:** mở Firebase Console → Firestore Database → Data để xem trực tiếp các nhóm, đề kiểm tra, điểm số — giống như mở Google Sheet trước đây.
- **Nhiều giáo viên dùng chung:** vì config đã nhúng sẵn trong code, giáo viên khác KHÔNG cần tạo project riêng, KHÔNG cần biết gì về Firebase — chỉ mở app, bấm đăng nhập bằng tài khoản Google của họ, hệ thống tự tách dữ liệu từng người.
- **Chi phí:** hoàn toàn nằm trong gói miễn phí (Spark) — không cần thẻ thanh toán, không có Cloud Functions.
- **Giới hạn đã biết:** đáp án trắc nghiệm được tách riêng khỏi câu hỏi và chỉ tải về lúc học sinh nộp bài — giảm rủi ro xem trộm, nhưng học sinh rành kỹ thuật (mở DevTools) vẫn có thể xem được nếu cố tình, vì không dùng Cloud Functions để lọc phía server.
