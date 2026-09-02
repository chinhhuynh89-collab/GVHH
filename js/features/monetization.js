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
  payment: { bankName: '', accountNumber: '', accountHolder: '', momoNumber: '', note: '' },
  // Tính năng CHỈ dùng được khi có gói trả phí, bật/tắt từng cái ở trang quản trị (đổi được bất cứ
  // lúc nào, không cần deploy lại) — khác giới hạn SỐ LƯỢNG ở teacherPlan phía trên (đây là khoá
  // HẲN cả tính năng). Mặc định TẤT CẢ đang tắt (false). Khớp với LOCKABLE_FEATURES bên dưới.
  lockedFeatures: {
    periodicTable: false, calculator: false, equationBalancer: false,
    customPrograms: false, examCreator: false, advancedStats: false
  }
};

// Danh mục tính năng có thể khoá — id khớp key trong lockedFeatures ở trên, label hiện ở trang quản
// trị VÀ trong thông báo chặn khi cố dùng lúc đang khoá.
// audience: 'any' = tile dùng chung trên trang chủ (cả giáo viên lẫn học sinh đều thấy — mở khi
//   người xem đang có BẤT KỲ gói trả phí nào, Pro hoặc Premium, xem isViewerPremium() bên dưới);
//   'teacher' = chỉ giáo viên gói Pro mở được (xem enforceFeatureLock/renderFeatureLockGate).
// Thêm tile mới sau này: thêm 1 dòng vào đây + gắn data-feature="id" lên tile trong index.html —
// trang quản trị tự hiện công tắc mới, không cần sửa gì thêm ở admin.js.
const LOCKABLE_FEATURES = [
  { id: 'periodicTable', label: 'Bảng tuần hoàn', audience: 'any' },
  { id: 'calculator', label: 'Công cụ tính toán', audience: 'any' },
  { id: 'equationBalancer', label: 'Cân bằng phương trình', audience: 'any' },
  { id: 'customPrograms', label: 'Tạo chương trình giảng dạy riêng (ngoài lớp 6-12 mặc định)', audience: 'teacher' },
  { id: 'examCreator', label: 'Tạo đề kiểm tra tự động', audience: 'teacher' },
  { id: 'advancedStats', label: 'Thống kê điểm theo từng đợt kiểm tra', audience: 'teacher' }
];

function isAdminUser(user) {
  return !!(user && user.email === MONETIZATION_ADMIN_EMAIL);
}

function formatVnd(n) {
  return (Number(n) || 0).toLocaleString('vi-VN') + '₫';
}

// "Mã số" hiện cho học sinh trên trang chủ — học sinh không có tài khoản nên không có mã cố định
// như giáo viên (teacherCode suy từ uid); dùng tạm 6 ký tự cuối của studentId (id bản ghi "students"
// sinh ra lúc được giáo viên duyệt vào nhóm) — chỉ để hiển thị, không dùng để tra cứu/định danh gì.
function shortStudentCode(studentId) {
  return (studentId || '').slice(-6).toUpperCase();
}

// Cache trong bộ nhớ (không phải localStorage) — chỉ để tránh đọc lại Firestore nhiều lần trong
// CÙNG 1 lượt tải trang khi nhiều đoạn script trên cùng trang đều cần đọc cấu hình.
// LUÔN trả về 1 object MỚI (không bao giờ trả thẳng MONETIZATION_DEFAULTS) — nơi gọi (VD admin.js)
// thường gán "cfg = await getMonetizationConfig()" rồi sau đó SỬA TRỰC TIẾP field trên cfg (VD
// "cfg.enabled = next"); nếu lỡ trả thẳng object hằng số dùng chung, sửa như vậy sẽ làm hỏng luôn
// giá trị mặc định cho phần còn lại của trang.
function cloneDefaults() {
  return {
    enabled: MONETIZATION_DEFAULTS.enabled,
    teacherPlan: Object.assign({}, MONETIZATION_DEFAULTS.teacherPlan),
    studentPlan: Object.assign({}, MONETIZATION_DEFAULTS.studentPlan),
    commission: Object.assign({}, MONETIZATION_DEFAULTS.commission),
    payment: Object.assign({}, MONETIZATION_DEFAULTS.payment),
    lockedFeatures: Object.assign({}, MONETIZATION_DEFAULTS.lockedFeatures)
  };
}

let _monetizationConfigCache = null;
async function getMonetizationConfig(forceRefresh) {
  if (_monetizationConfigCache && !forceRefresh) return _monetizationConfigCache;
  if (!isFirebaseConfigured()) return cloneDefaults();
  try {
    const { db } = ensureFirebase();
    const snap = await db.collection('config').doc('monetization').get();
    const data = snap.exists ? snap.data() : {};
    _monetizationConfigCache = {
      enabled: !!data.enabled,
      teacherPlan: Object.assign({}, MONETIZATION_DEFAULTS.teacherPlan, data.teacherPlan),
      studentPlan: Object.assign({}, MONETIZATION_DEFAULTS.studentPlan, data.studentPlan),
      commission: Object.assign({}, MONETIZATION_DEFAULTS.commission, data.commission),
      payment: Object.assign({}, MONETIZATION_DEFAULTS.payment, data.payment),
      lockedFeatures: Object.assign({}, MONETIZATION_DEFAULTS.lockedFeatures, data.lockedFeatures)
    };
  } catch (e) {
    _monetizationConfigCache = cloneDefaults();
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

// Chặn 1 HÀNH ĐỘNG cụ thể (VD: tạo chương trình riêng, tạo đề kiểm tra) nếu tính năng đó đang bị
// admin khoá VÀ giáo viên vẫn ở gói miễn phí — ném lỗi để nơi gọi hiện thông báo (giống hệt cách
// enforceTeacherGroupLimit/enforceTeacherStudentLimit trong groups-data.js đang làm).
async function enforceFeatureLock(teacherUid, featureKey) {
  if (!isFirebaseConfigured()) return;
  const cfg = await getMonetizationConfig();
  if (!cfg.enabled || !cfg.lockedFeatures[featureKey]) return;
  const sub = await getTeacherSubscription(teacherUid);
  if (sub.tier === 'pro') return;
  const feature = LOCKABLE_FEATURES.find((f) => f.id === featureKey);
  throw new Error(`"${feature ? feature.label : featureKey}" chỉ dành cho gói Pro. Vào trang "Nâng cấp gói" để nâng cấp.`);
}

// Chặn NGUYÊN 1 TRANG (VD: trang Thống kê) nếu tính năng đó đang bị khoá — vẽ thẳng thông báo +
// nút nâng cấp vào mainEl rồi trả về true để nơi gọi dừng lại, không tải/hiện phần còn lại của
// trang nữa. Dùng cho trang không có phần "dùng thử trước khi chặn" hợp lý (khác với
// enforceFeatureLock — chặn ngay lúc bấm hành động, còn cái này chặn ngay khi mở trang).
async function renderFeatureLockGate(mainEl, teacherUid, featureKey) {
  if (!isFirebaseConfigured()) return false;
  const cfg = await getMonetizationConfig();
  if (!cfg.enabled || !cfg.lockedFeatures[featureKey]) return false;
  const sub = await getTeacherSubscription(teacherUid);
  if (sub.tier === 'pro') return false;
  const feature = LOCKABLE_FEATURES.find((f) => f.id === featureKey);
  mainEl.innerHTML = `
    <div class="card">
      <h2><span class="icon">⭐</span>Tính năng gói Pro</h2>
      <p class="hint">"${escapeHtml(feature ? feature.label : featureKey)}" chỉ dành cho gói Pro.</p>
      <a class="btn primary block" href="nang-cap.html">⭐ Nâng cấp ngay</a>
    </div>
  `;
  return true;
}

// Người đang xem trang chủ (bất kỳ vai trò nào) đã có gói trả phí hay chưa — dùng cho các tính
// năng "audience: any" (VD Bảng tuần hoàn) mà giáo viên lẫn học sinh cùng thấy chung 1 tile. Khách
// chưa xác định được vai trò (chưa đăng nhập, chưa vào nhóm) coi như CHƯA có gói trả phí.
async function isViewerPremium() {
  try {
    const effectiveTeacherUid = typeof resolveEffectiveTeacherUid === 'function' ? await resolveEffectiveTeacherUid() : null;
    const role = typeof getRole === 'function' ? getRole() : null;
    if (effectiveTeacherUid && role !== 'student') {
      const sub = await getTeacherSubscription(effectiveTeacherUid);
      return sub.tier === 'pro';
    }
    const membership = typeof getMembership === 'function' ? getMembership() : null;
    if (membership && membership.groupCode && typeof getDeviceId === 'function') {
      const sub = await getStudentSubscription(getDeviceId());
      return sub.tier === 'premium';
    }
  } catch (e) { /* ignore */ }
  return false;
}

// Áp khoá lên các tile trang chủ có gắn data-feature="..." khớp 1 mục audience:'any' trong
// LOCKABLE_FEATURES đang bị admin khoá: đổi badge "Miễn phí" thành "⭐", chặn click (hiện thông báo
// cần nâng cấp thay vì mở tính năng). Gọi 1 lần lúc tải trang chủ — xem index.html.
async function applyCoreFeatureLocks() {
  if (!isFirebaseConfigured()) return;
  const cfg = await getMonetizationConfig();
  if (!cfg.enabled) return;
  const lockedAny = LOCKABLE_FEATURES.filter((f) => f.audience === 'any' && cfg.lockedFeatures[f.id]);
  if (!lockedAny.length) return;
  const premium = await isViewerPremium();
  if (premium) return;
  lockedAny.forEach((f) => {
    const tile = document.querySelector(`[data-feature="${f.id}"]`);
    if (!tile) return;
    const badge = tile.querySelector('.badge');
    if (badge) { badge.textContent = '⭐'; badge.classList.remove('free'); }
    tile.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm(`⭐ "${f.label}" chỉ dành cho gói trả phí. Nâng cấp ngay?`)) {
        window.location.href = (window.APP_BASE_PATH || './') + 'pages/nang-cap.html';
      }
    });
  });
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
