// Hệ thống kinh doanh: gói trả phí (giáo viên Pro / học sinh Premium) + hoa hồng giới thiệu 2 tầng.
// Toàn bộ nghiệp vụ tiền bạc là THỦ CÔNG (app không dùng Cloud Functions): người nộp tiền tự chuyển
// khoản/MoMo ngoài app rồi bấm "Tôi đã chuyển khoản" (tạo paymentSubmissions), admin duyệt tay ở
// trang quản trị (quan-tri.html) — duyệt xong mới thực sự cấp gói (subscriptions/studentSubscriptions)
// và sinh hoa hồng (commissions) nếu có người giới thiệu. Không có xử lý thanh toán tự động.
//
// Tài liệu tham khảo trước khi sửa: đọc kèm firebase/firestore.rules — mọi ghi vào subscriptions/
// studentSubscriptions/commissions CHỈ admin làm được (chặn ở rules), file này chỉ gọi ghi khi đúng
// là admin đang đăng nhập (kiểm tra thêm ở UI, không thay thế rules).

const MONETIZATION_ADMIN_EMAIL = 'chinhhuynh89@gmail.com';

const MONETIZATION_DEFAULTS = {
  enabled: false,
  teacherPlan: { price: 199000, periodDays: 30, maxGroupsFree: 2, maxStudentsFree: 40, maxCustomChaptersFree: 3 },
  studentPlan: { price: 49000, periodDays: 30 },
  commission: { teacherReferralPercent: 20, studentReferralPercent: 10 },
  payment: { bankName: '', accountNumber: '', accountHolder: '', momoNumber: '', note: '' }
};

function isAdminUser(user) {
  return !!(user && user.email === MONETIZATION_ADMIN_EMAIL);
}

function formatVnd(n) {
  return (Number(n) || 0).toLocaleString('vi-VN') + '₫';
}

// Cache trong bộ nhớ (không phải localStorage) — chỉ để tránh đọc lại Firestore nhiều lần trong
// CÙNG 1 lượt tải trang khi nhiều đoạn script trên cùng trang đều cần đọc cấu hình.
let _monetizationConfigCache = null;
async function getMonetizationConfig(forceRefresh) {
  if (_monetizationConfigCache && !forceRefresh) return _monetizationConfigCache;
  if (!isFirebaseConfigured()) return MONETIZATION_DEFAULTS;
  try {
    const { db } = ensureFirebase();
    const snap = await db.collection('config').doc('monetization').get();
    const data = snap.exists ? snap.data() : {};
    _monetizationConfigCache = {
      enabled: !!data.enabled,
      teacherPlan: Object.assign({}, MONETIZATION_DEFAULTS.teacherPlan, data.teacherPlan),
      studentPlan: Object.assign({}, MONETIZATION_DEFAULTS.studentPlan, data.studentPlan),
      commission: Object.assign({}, MONETIZATION_DEFAULTS.commission, data.commission),
      payment: Object.assign({}, MONETIZATION_DEFAULTS.payment, data.payment)
    };
  } catch (e) {
    _monetizationConfigCache = MONETIZATION_DEFAULTS;
  }
  return _monetizationConfigCache;
}

// Chỉ admin gọi được (rules chặn phía sau) — dùng ở trang quản trị.
async function saveMonetizationConfig(partial) {
  const { db } = ensureFirebase();
  await db.collection('config').doc('monetization').set(partial, { merge: true });
  _monetizationConfigCache = null;
}

// Gói hiện tại của 1 giáo viên. Hết hạn (expiresAt đã qua) coi như đã rớt về free — không cần admin
// chủ động hạ gói, trang nào đọc cũng tự thấy đúng trạng thái hiện tại.
async function getTeacherSubscription(uid) {
  if (!uid || !isFirebaseConfigured()) return { tier: 'free' };
  try {
    const { db } = ensureFirebase();
    const snap = await db.collection('subscriptions').doc(uid).get();
    if (!snap.exists) return { tier: 'free' };
    const data = snap.data();
    if (data.tier === 'pro' && data.expiresAt && new Date(data.expiresAt) < new Date()) {
      return { tier: 'free', expired: true, expiresAt: data.expiresAt };
    }
    return data;
  } catch (e) { return { tier: 'free' }; }
}

async function getStudentSubscription(deviceId) {
  if (!deviceId || !isFirebaseConfigured()) return { tier: 'free' };
  try {
    const { db } = ensureFirebase();
    const snap = await db.collection('studentSubscriptions').doc(deviceId).get();
    if (!snap.exists) return { tier: 'free' };
    const data = snap.data();
    if (data.tier === 'premium' && data.expiresAt && new Date(data.expiresAt) < new Date()) {
      return { tier: 'free', expired: true, expiresAt: data.expiresAt };
    }
    return data;
  } catch (e) { return { tier: 'free' }; }
}

// Gửi yêu cầu nâng cấp (đã chuyển khoản/MoMo ngoài app) — chỉ tạo bản ghi CHỜ DUYỆT, KHÔNG tự cấp
// gói. referrerTeacherUid xác định NGAY LÚC GỬI (không để admin tự tra cứu lại lúc duyệt): với giáo
// viên là uid suy từ mã referredBy đã lưu sẵn trên hồ sơ riêng (teachers/{uid}); với học sinh là
// teacherUid của nhóm đang học (membership) — chính là giáo viên đã đưa app tới tay học sinh đó.
async function submitPaymentRequest(payload) {
  const { db } = ensureFirebase();
  await db.collection('paymentSubmissions').add(Object.assign({
    status: 'pending', createdAt: new Date().toISOString()
  }, payload));
}

// Tra uid giáo viên từ MÃ giáo viên (dùng lại đúng cách branding.js đang tra "?tc=" — teacherProfiles
// công khai, ai cũng đọc được).
async function findTeacherUidByCode(teacherCode) {
  if (!teacherCode) return null;
  try {
    const { db } = ensureFirebase();
    const snap = await db.collection('teacherProfiles').where('teacherCode', '==', teacherCode).limit(1).get();
    return snap.empty ? null : snap.docs[0].id;
  } catch (e) { return null; }
}
