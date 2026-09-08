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
- **Chi phí:** phần Firestore/Auth/Hosting hoàn toàn nằm trong gói miễn phí (Spark). Riêng tính năng "Tạo bằng AI" (xem mục Bước 8 bên dưới) cần Cloud Functions nên bắt buộc gói **Blaze** (trả theo dùng) — vẫn có hạn mức miễn phí lớn, chỉ tính phí nếu vượt.
- **Giới hạn đã biết:** đáp án trắc nghiệm được tách riêng khỏi câu hỏi và chỉ tải về lúc học sinh nộp bài — giảm rủi ro xem trộm, nhưng học sinh rành kỹ thuật (mở DevTools) vẫn có thể xem được nếu cố tình, vì không dùng Cloud Functions để lọc phía server.

## Bước 8 — (Tuỳ chọn) Triển khai Cloud Function "Tạo bằng AI"

Chỉ cần làm bước này nếu muốn bật tính năng "🤖 Tạo bằng AI" (tạo trắc nghiệm/flashcard từ bài giảng
bằng Claude API, chỉ dành cho giáo viên gói Pro). Không làm bước này thì mọi tính năng khác của app
vẫn hoạt động bình thường — nút "🤖 Tạo bằng AI" sẽ chỉ báo lỗi kết nối nếu bấm vào.

1. **Nâng cấp gói Blaze**: Firebase Console → biểu tượng bánh răng góc trái → **Usage and billing** →
   **Details & settings** → **Modify plan** → chọn **Blaze**. Cần gắn 1 thẻ thanh toán, nhưng chỉ bị
   trừ tiền nếu vượt hạn mức miễn phí hàng tháng (rất rộng rãi cho quy mô 1 app nhỏ).
2. **Cài Firebase CLI** (nếu máy bạn chưa có): mở terminal, chạy `npm install -g firebase-tools`, sau
   đó `firebase login` (mở trình duyệt đăng nhập đúng tài khoản Google đã tạo project ở Bước 1).
3. **Lấy API key Claude**: vào [console.anthropic.com](https://console.anthropic.com) → tạo 1 API
   key mới, copy lại (chỉ hiện đúng 1 lần).
4. **Lưu key vào Cloud Functions** (KHÔNG dán key này vào code hay gửi cho ai): trong thư mục gốc của
   app (chứa file `firebase.json`), chạy:
   ```
   firebase functions:secrets:set ANTHROPIC_API_KEY
   ```
   CLI sẽ hỏi dán key vào — dán rồi Enter, key được Google mã hoá lưu riêng, không nằm trong code/Git.
5. **Cài thư viện cho Cloud Function** (chỉ cần làm 1 lần, hoặc mỗi khi đổi máy):
   ```
   cd functions
   npm install
   cd ..
   ```
6. **Triển khai**:
   ```
   firebase deploy --only functions
   ```
   Lần đầu deploy thường mất 2-5 phút. Xong sẽ thấy dòng
   `✔  functions[generateFromLesson(asia-southeast1)]: Successful create operation.`
7. **Gán gói Pro cho giáo viên muốn dùng thử**: Firebase Console → Firestore Database →
   collection `subscriptions` → tạo tài liệu với ID = đúng UID tài khoản Google của giáo viên đó
   (xem UID trong Authentication → Users), field `tier` = `"pro"`, field `expiresAt` = 1 ngày trong
   tương lai (VD `"2027-01-01"`).

**Sau này mỗi khi sửa code trong `functions/index.js`**: chỉ cần chạy lại `firebase deploy --only
functions` (không cần lặp lại các bước cài đặt/nâng cấp gói ở trên).

**Kiểm soát chi phí đã có sẵn trong code** (`functions/index.js`): tối đa 15 trang bài giảng/lượt tạo,
tối đa 100 lượt/giáo viên/tháng — xem/sửa 2 hằng số `MAX_POINTS_PER_REQUEST`/`MONTHLY_CALL_CAP` ở đầu
file nếu muốn đổi.
