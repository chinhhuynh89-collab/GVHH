// Khởi tạo Firebase — config được nhúng sẵn (project "giao-vien-hoa-hoc") nên mọi giáo viên
// chỉ cần đăng nhập Google, không phải tự dán config. Config Firebase Web App không phải bí mật
// (được thiết kế để công khai trong mã nguồn client) — an toàn được đảm bảo bởi Firestore Security
// Rules (firebase/firestore.rules), không phải bằng cách giấu config này.
//
// Vẫn giữ khả năng ghi đè qua localStorage (hoahoc_firebase_config) — dùng khi cần trỏ tạm sang
// project/emulator khác lúc phát triển, người dùng bình thường không cần biết đến việc này.

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDCs7rnucxGMfrf1-mdMynFfObQCJQoDn0',
  authDomain: 'giao-vien-hoa-hoc.firebaseapp.com',
  projectId: 'giao-vien-hoa-hoc',
  storageBucket: 'giao-vien-hoa-hoc.firebasestorage.app',
  messagingSenderId: '179788361262',
  appId: '1:179788361262:web:09315425592f6c71c5b9bf'
};

const FIREBASE_CONFIG_KEY = 'hoahoc_firebase_config';

function getFirebaseConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(FIREBASE_CONFIG_KEY));
    if (saved && saved.apiKey) return saved;
  } catch (e) { /* ignore */ }
  return DEFAULT_FIREBASE_CONFIG;
}

function setFirebaseConfig(config) {
  localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
}

function isFirebaseConfigured() {
  return !!getFirebaseConfig();
}

let _fbApp = null;
let _fbAuth = null;
let _fbDb = null;
let _fbFunctions = null;

// Vùng triển khai Cloud Functions (xem functions/index.js: region: 'asia-southeast1') — BẮT BUỘC
// truyền đúng vùng này khi lấy functions() phía trình duyệt, không thì SDK mặc định gọi nhầm sang
// us-central1 (không tồn tại hàm nào ở đó) và báo lỗi "not-found".
const FUNCTIONS_REGION = 'asia-southeast1';

// Khởi tạo (nếu chưa) và trả về { app, auth, db, functions }. Ném lỗi rõ ràng nếu chưa cấu hình hoặc SDK lỗi.
function ensureFirebase() {
  if (_fbApp) return { app: _fbApp, auth: _fbAuth, db: _fbDb, functions: _fbFunctions };
  const config = getFirebaseConfig();
  if (!config) throw new Error('Chưa kết nối Firebase. Vào "Kết nối đồng bộ" để thiết lập trước.');
  if (typeof firebase === 'undefined') throw new Error('Không tải được thư viện Firebase.');

  _fbApp = firebase.apps && firebase.apps.length ? firebase.apps[0] : firebase.initializeApp(config);
  _fbAuth = firebase.auth();
  _fbDb = firebase.firestore();
  // functions-compat chỉ được nạp ở 1 số trang có dùng AI (xem pages/chuong.html) — bỏ qua êm nếu
  // trang hiện tại không tải script đó, để không làm hỏng các trang khác không cần Cloud Functions.
  _fbFunctions = (typeof firebase.functions === 'function') ? _fbApp.functions(FUNCTIONS_REGION) : null;

  // Cờ debug cục bộ (không ảnh hưởng người dùng thật): nối vào Firebase Emulator Suite khi đang phát triển.
  const useEmu = localStorage.getItem('hoahoc_use_emulator') === '1';
  if (useEmu) {
    // Gộp 1 lần settings() (host + long-polling) — một số môi trường mạng hạn chế (proxy, sandbox)
    // chặn kết nối streaming WebChannel của Firestore, cần ép long-polling để vẫn kết nối được.
    _fbDb.settings({ host: '127.0.0.1:8080', ssl: false, experimentalForceLongPolling: true, useFetchStreams: false });
    _fbAuth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
    if (_fbFunctions) _fbFunctions.useEmulator('127.0.0.1', 5001);
  }

  if (!useEmu) {
    // Một số mạng (proxy trường học/cơ quan, tường lửa, phần mềm diệt virus có kiểm tra SSL...)
    // chặn hoặc làm gãy kết nối streaming (WebChannel) mà Firestore dùng mặc định — biểu hiện đúng
    // như đã gặp: lưu/tải dữ liệu treo rất lâu hoặc không phản hồi. experimentalAutoDetectLongPolling
    // giúp Firestore tự nhận ra mạng có vấn đề và chuyển sang kiểu kết nối HTTP thường (long-polling),
    // không ảnh hưởng gì nếu mạng bình thường không cần đến nó.
    _fbDb.settings({ experimentalAutoDetectLongPolling: true, useFetchStreams: false });
    // KHÔNG bật enablePersistence (cache/đồng bộ nhiều tab qua IndexedDB) nữa: cơ chế "bầu tab
    // chính" của nó có thể bị kẹt (đặc biệt nếu có tab/service worker cũ còn giữ khoá IndexedDB
    // từ trước), khiến MỌI lượt đọc/ghi Firestore bị treo rất lâu — xảy ra bất kể mạng nhanh hay
    // chậm vì đây là lỗi tầng trình duyệt, không phải mạng. Bỏ đi: app vẫn hoạt động bình thường,
    // chỉ mất khả năng cache/offline cho phần Firestore (không phải phần công cụ offline gốc).
  }

  return { app: _fbApp, auth: _fbAuth, db: _fbDb, functions: _fbFunctions };
}

// ---------- Cache TẠM (sessionStorage) cho dữ liệu NỘI DUNG (bài giảng/câu hỏi/flashcard/giáo án) —
// giảm lượt đọc Firestore khi TẢI LẠI cùng 1 trang nhiều lần trong CÙNG 1 tab (nguyên nhân chính gây
// hết hạn mức đọc/ngày miễn phí — xem lịch sử sửa các file getCustomQuiz/getCustomLessons/...).
//
// CỐ Ý không dùng lại enablePersistence() của Firestore (đã tắt ở ensureFirebase() vì lỗi THẬT đã gặp:
// cơ chế "bầu tab chính" IndexedDB có thể bị kẹt, treo mọi lượt đọc/ghi). sessionStorage đơn giản hơn
// hẳn — mỗi TAB tự quản lý cache RIÊNG của mình, không có khái niệm "tab chính" cần bầu chọn giữa các
// tab nên không lặp lại được lỗi cũ.
//
// Đúng dữ liệu ngay sau khi SỬA: mỗi loại nội dung có 1 "phiên bản" đếm riêng THEO TỪNG GIÁO VIÊN
// (không theo từng chương — 1 số hàm ghi như updateCustomQuiz(id, patch)/deleteCustomQuiz(id) không có
// sẵn chapterId để biết chính xác cache chương nào cần xoá). Mọi hàm GHI (add/sửa/xoá) đều tăng phiên
// bản này lên — lần ĐỌC kế tiếp thấy phiên bản đã đổi thì coi cache cũ hết hạn, đọc lại Firestore rồi
// lưu cache mới kèm phiên bản mới. Cách này xoá cache "hơi rộng" hơn cần thiết (sửa 1 chương làm mất
// cache của CẢ CÁC chương khác cùng giáo viên) nhưng ĐẢM BẢO không bao giờ hiện dữ liệu cũ sau khi sửa
// — ưu tiên ĐÚNG hơn tối ưu triệt để.
const CONTENT_CACHE_TTL_MS = 10 * 60 * 1000; // dọn cache quá cũ — KHÔNG phải cơ chế chính (phiên bản mới hơn hẳn quan trọng hơn)

function contentCacheVersion(type, uid) {
  try { return parseInt(sessionStorage.getItem('ccv:' + type + ':' + uid), 10) || 0; } catch (e) { return 0; }
}

// Gọi trong MỌI hàm ghi (add/addBatch/update/delete/deleteAll) của 1 loại nội dung, ngay sau khi ghi
// Firestore thành công — làm mọi cache ĐANG CÓ của loại đó (mọi chương) hết hiệu lực ngay lập tức.
function contentCacheBump(type, uid) {
  try { sessionStorage.setItem('ccv:' + type + ':' + uid, String(contentCacheVersion(type, uid) + 1)); } catch (e) { /* ignore */ }
}

function contentCacheGet(type, uid, subKey) {
  try {
    const raw = sessionStorage.getItem('cc:' + type + ':' + uid + ':' + subKey);
    if (!raw) return null;
    const { data, ver, ts } = JSON.parse(raw);
    if (ver !== contentCacheVersion(type, uid)) return null;
    if (Date.now() - ts > CONTENT_CACHE_TTL_MS) return null;
    return data;
  } catch (e) {
    return null; // sessionStorage bị chặn (chế độ ẩn danh nghiêm ngặt...) hoặc dữ liệu hỏng — coi như cache rỗng
  }
}

function contentCacheSet(type, uid, subKey, data) {
  try {
    sessionStorage.setItem('cc:' + type + ':' + uid + ':' + subKey, JSON.stringify({ data, ver: contentCacheVersion(type, uid), ts: Date.now() }));
  } catch (e) {
    // VD vượt hạn mức sessionStorage (~5-10MB, dễ gặp với bài giảng nhiều ảnh) — bỏ qua êm, chỉ mất
    // phần tối ưu đọc cho lượt này, KHÔNG ảnh hưởng gì tới dữ liệu đã lưu Firestore.
  }
}
