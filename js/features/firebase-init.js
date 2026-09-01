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

// Khởi tạo (nếu chưa) và trả về { app, auth, db }. Ném lỗi rõ ràng nếu chưa cấu hình hoặc SDK lỗi.
function ensureFirebase() {
  if (_fbApp) return { app: _fbApp, auth: _fbAuth, db: _fbDb };
  const config = getFirebaseConfig();
  if (!config) throw new Error('Chưa kết nối Firebase. Vào "Kết nối đồng bộ" để thiết lập trước.');
  if (typeof firebase === 'undefined') throw new Error('Không tải được thư viện Firebase.');

  _fbApp = firebase.apps && firebase.apps.length ? firebase.apps[0] : firebase.initializeApp(config);
  _fbAuth = firebase.auth();
  _fbDb = firebase.firestore();

  // Cờ debug cục bộ (không ảnh hưởng người dùng thật): nối vào Firebase Emulator Suite khi đang phát triển.
  const useEmu = localStorage.getItem('hoahoc_use_emulator') === '1';
  if (useEmu) {
    // Gộp 1 lần settings() (host + long-polling) — một số môi trường mạng hạn chế (proxy, sandbox)
    // chặn kết nối streaming WebChannel của Firestore, cần ép long-polling để vẫn kết nối được.
    _fbDb.settings({ host: '127.0.0.1:8080', ssl: false, experimentalForceLongPolling: true, useFetchStreams: false });
    _fbAuth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
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

  return { app: _fbApp, auth: _fbAuth, db: _fbDb };
}
