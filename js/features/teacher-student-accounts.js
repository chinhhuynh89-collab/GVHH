// Tài khoản HỌC SINH DO GIÁO VIÊN CẤP — dành cho giáo viên đã có sẵn danh sách lớp, muốn nạp cả
// lớp lên 1 lần (tạo tài khoản + xếp nhóm ngay), KHÔNG bắt học sinh tự đăng ký bằng Google như luồng
// hiện có (xem join-group.js). Dùng CHUNG 1 hệ Firebase Auth nhưng qua nhà cung cấp Email/Password
// thay vì Google — nên vẫn ra 1 request.auth.uid thật, mọi collection/rules hiện có (students,
// groups, progress, studentSubscriptions, commissions...) KHÔNG cần sửa gì, hoạt động y hệt.
//
// "Email" ở đây KHÔNG phải email thật — chỉ là chuỗi thoả đúng định dạng email để Firebase Auth chấp
// nhận, tự suy ra 1-1 từ "mã học sinh" (xem studentLoginCodeToAuthEmail). Học sinh KHÔNG cần biết
// khái niệm email này, chỉ cần nhớ mã học sinh + mật khẩu.
//
// Mã học sinh dạng "<mã giáo viên 6 ký tự>.<số thứ tự>" (VD "ABC123.07") — gộp sẵn mã giáo viên nên
// DUY NHẤT TOÀN HỆ THỐNG dù mỗi giáo viên tự đánh số riêng từ 1, không cần tra "giáo viên nào" ở
// bước đăng nhập, học sinh gõ đúng 1 mã ở bất kỳ đâu cũng vào đúng tài khoản của mình.
//
// QUAN TRỌNG — Firebase Auth KHÔNG cho phép 1 người tự đổi mật khẩu của người KHÁC (không có "Admin
// SDK" vì app này chủ động không dùng Cloud Functions/máy chủ riêng). Vì vậy:
// - Học sinh tự đổi được mật khẩu của CHÍNH MÌNH khi đang đăng nhập (xem changeOwnStudentPassword).
// - Quên mật khẩu -> KHÔNG có cách "cấp lại" cho tài khoản CŨ — giáo viên phải tạo 1 mã học sinh MỚI
//   thay thế (xem issueReplacementLoginForStudent), tiến độ/gói ở tài khoản cũ không tự chuyển sang.

const STUDENT_AUTH_EMAIL_DOMAIN = 'hocsinh.hoahoc.app';

function studentLoginCodeToAuthEmail(loginCode) {
  const normalized = (loginCode || '').trim().toLowerCase().replace(/\s+/g, '');
  return `${normalized}@${STUDENT_AUTH_EMAIL_DOMAIN}`;
}

function normalizeLoginCode(code) {
  return (code || '').trim().toUpperCase().replace(/\s+/g, '');
}

// Mật khẩu tự sinh lúc cấp — 6 ký tự cùng bộ chữ với mã nhóm/mã giáo viên đã có sẵn trong app (bỏ
// ký tự dễ nhầm 0/O/1/I) để nhất quán, dễ đọc/gõ hơn số thuần nhưng vẫn đủ ngắn cho học sinh nhỏ tuổi.
function generateStudentPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

// App Firebase THỨ 2, riêng biệt hoàn toàn với phiên đăng nhập chính của giáo viên đang mở app —
// dùng để tạo tài khoản học sinh HÀNG LOẠT mà KHÔNG làm giáo viên bị đăng xuất/đổi phiên (Firebase
// Auth mặc định tự ĐĂNG NHẬP LUÔN vào tài khoản vừa tạo bằng createUserWithEmailAndPassword — nếu
// tạo trên app chính sẽ đá văng giáo viên ra khỏi phiên của chính họ sau mỗi học sinh tạo xong).
let _secondaryFbApp = null;
function ensureSecondaryFirebaseApp() {
  if (_secondaryFbApp) return _secondaryFbApp;
  const config = getFirebaseConfig();
  if (!config) throw new Error('Chưa kết nối Firebase.');
  if (typeof firebase === 'undefined') throw new Error('Không tải được thư viện Firebase.');
  const existing = (firebase.apps || []).find((a) => a.name === 'studentProvisioning');
  _secondaryFbApp = existing || firebase.initializeApp(config, 'studentProvisioning');
  return _secondaryFbApp;
}

// Tạo 1 tài khoản Email/Password mới trên app phụ, trả về uid. Luôn đăng xuất khỏi app phụ ngay sau
// khi tạo xong. KHÔNG đăng xuất app phụ ngay sau mỗi lần tạo (trước đây có, gây chậm rõ rệt khi nạp
// danh sách dài — mỗi lần tạo thêm 1 lượt round-trip mạng không cần thiết): lần createUserWith...
// TIẾP THEO tự thay thế phiên đang có trên app phụ, không cần đăng xuất trước. Gọi
// cleanupSecondaryAuthSession() 1 LẦN DUY NHẤT sau khi xong CẢ LOẠT (xem bulkImportProvisionedStudents/
// issueReplacementLoginForStudent) để dọn sạch, không để sót phiên nào.
async function createProvisionedStudentAuthAccount(loginCode, password, displayName) {
  const secondaryAuth = ensureSecondaryFirebaseApp().auth();
  const email = studentLoginCodeToAuthEmail(loginCode);
  const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
  if (displayName) {
    // KHÔNG chờ (không await) — chỉ là tên hiển thị, không quan trọng bằng tốc độ tạo tài khoản,
    // không cần chặn các bước sau lại chỉ để chờ ghi xong tên.
    cred.user.updateProfile({ displayName }).catch(() => {});
  }
  return cred.user.uid;
}

async function cleanupSecondaryAuthSession() {
  try { await ensureSecondaryFirebaseApp().auth().signOut(); } catch (e) { /* ignore */ }
}

// Đăng nhập bằng mã học sinh + mật khẩu — chạy trên APP CHÍNH (chính học sinh đang thao tác thật).
async function signInWithStudentCode(loginCode, password) {
  const { auth } = ensureFirebase();
  const email = studentLoginCodeToAuthEmail(loginCode);
  return auth.signInWithEmailAndPassword(email, password);
}

// Học sinh tự đổi mật khẩu của CHÍNH MÌNH — bắt gõ lại mật khẩu cũ để xác nhận (reauthenticate),
// đúng yêu cầu bảo mật của Firebase Auth cho thao tác đổi mật khẩu (updatePassword đòi phiên đăng
// nhập "gần đây"; gõ lại mật khẩu cũ vừa xác nhận đúng chủ tài khoản vừa làm mới phiên đó).
async function changeOwnStudentPassword(oldPassword, newPassword) {
  const { auth } = ensureFirebase();
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Cần đăng nhập bằng mã học sinh trước.');
  const credential = firebase.auth.EmailAuthProvider.credential(user.email, oldPassword);
  await user.reauthenticateWithCredential(credential);
  await user.updatePassword(newPassword);
}

// Số thứ tự TIẾP THEO cho 1 giáo viên — lấy số lớn nhất đang có trong các mã học sinh (đọc từ
// "students", field loginCode) rồi +1. Không dùng bộ đếm riêng (tránh thêm 1 collection/field chỉ
// để đếm) — chấp nhận rủi ro rất nhỏ lệch số nếu 2 tab cùng nạp danh sách cùng lúc (không ảnh hưởng
// tính đúng đắn, chỉ có thể nhảy cóc số thứ tự).
async function nextLoginSeqForTeacher(teacherUid) {
  return computeNextSeqFromDocs(await fetchTeacherProvisionedStudents(teacherUid));
}

// Toàn bộ bản ghi "students" hiện có của 1 giáo viên (mọi nhóm) — CHỈ lọc theo đúng 1 field
// (teacherUid) rồi tự lọc/tính tiếp ở phía client, KHÔNG dùng where() nhiều field kết hợp bất đẳng
// thức (VD .where('loginCode','>','')) — Firestore đòi hỏi phải tạo "composite index" thủ công qua
// Firebase Console cho kiểu truy vấn đó (lỗi "The query requires an index" gặp phải thực tế), phiền
// và dễ quên cấu hình. Dùng lại đúng 1 lượt tải cho cả việc tính số thứ tự TIẾP THEO (xem
// nextLoginSeqForTeacher) LẪN dò trùng theo SĐT (xem bulkImportProvisionedStudents) — đỡ phải tải
// lại nhiều lần khi nạp danh sách dài.
async function fetchTeacherProvisionedStudents(teacherUid) {
  const { db } = ensureFirebase();
  const snap = await db.collection('students').where('teacherUid', '==', teacherUid).get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((s) => !!s.loginCode);
}

function computeNextSeqFromDocs(docs) {
  let maxSeq = 0;
  docs.forEach((s) => {
    const m = (s.loginCode || '').match(/\.(\d+)$/);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  });
  return maxSeq + 1;
}

// Học sinh đã được cấp mã từ TRƯỚC (bất kỳ nhóm nào của giáo viên này) khớp đúng SĐT — dùng để
// tránh tạo trùng tài khoản khi giáo viên nạp lại cùng 1 danh sách (VD sửa vài dòng rồi nạp lại).
async function findProvisionedStudentByPhone(teacherUid, phone) {
  if (!phone) return null;
  const docs = await fetchTeacherProvisionedStudents(teacherUid);
  return docs.find((s) => s.phone === phone) || null;
}

// ---------- Nạp danh sách hàng loạt ----------
// rows: [{ studentName, school, className, address, phone }, ...] (đã lọc dòng trống/lỗi trước đó).
// Trả về { results: [{ studentName, loginCode, password|null, reused }], errors: [{ row, message }] }.
//
// Tối ưu tốc độ (nạp danh sách dài từng RẤT CHẬM trước khi sửa) — mỗi dòng trước đây tốn:
// (1) enforceTeacherStudentLimit() gọi lại addStudentToGroup() — đọc lại TOÀN BỘ cấu hình + gói +
//     TẤT CẢ nhóm (kèm đếm học sinh từng nhóm) MỖI DÒNG, dù kết quả gần như không đổi giữa các dòng;
// (2) 1 lượt ghi Firestore .add() RIÊNG cho từng dòng (round-trip mạng riêng);
// (3) đăng xuất app phụ sau MỖI tài khoản vừa tạo (round-trip mạng không cần thiết).
// Giờ: kiểm tra giới hạn học sinh 1 LẦN cho cả lô, gộp mọi lượt ghi "students" vào 1 batch duy nhất
// (Firestore giới hạn 500 thao tác/batch nên tự chia nhỏ nếu danh sách rất dài), và chỉ đăng xuất
// app phụ 1 lần sau khi xong cả lô.
async function bulkImportProvisionedStudents(groupCode, rows, onProgress) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const teacherCode = deriveTeacherCode(teacher.uid);
  const { db } = ensureFirebase();

  // Tải 1 LẦN DUY NHẤT cho cả batch — vừa tránh lỗi composite index (xem chú thích trên), vừa đỡ
  // phải tải lại toàn bộ danh sách hàng chục lần nếu nạp danh sách dài.
  const existingDocs = await fetchTeacherProvisionedStudents(teacher.uid);
  const byPhone = new Map(existingDocs.map((s) => [s.phone, s]));
  let nextSeq = computeNextSeqFromDocs(existingDocs);

  const newRowsCount = rows.filter((r) => !byPhone.has(r.phone)).length;
  if (newRowsCount > 0 && typeof enforceTeacherStudentLimit === 'function') {
    await enforceTeacherStudentLimit(teacher.uid);
  }

  const results = [];
  const errors = [];
  let batch = db.batch();
  let opsInBatch = 0;
  const commits = [];
  function queueWrite(data) {
    batch.set(db.collection('students').doc(), data);
    opsInBatch++;
    if (opsInBatch >= 450) {
      commits.push(batch.commit());
      batch = db.batch();
      opsInBatch = 0;
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (typeof onProgress === 'function') onProgress(i + 1, rows.length, row.studentName);
    try {
      const existing = byPhone.get(row.phone);
      if (existing) {
        // Đã có tài khoản (nạp lại) — chỉ gán thêm vào nhóm ĐANG chọn, KHÔNG tạo tài khoản mới,
        // KHÔNG đụng mật khẩu.
        queueWrite({
          groupCode, teacherUid: teacher.uid, studentUid: existing.studentUid, joinedAt: new Date().toISOString(),
          studentName: row.studentName, school: row.school, className: row.className,
          address: row.address, phone: row.phone, email: '', loginCode: existing.loginCode
        });
        results.push({ studentName: row.studentName, loginCode: existing.loginCode, password: null, reused: true });
        continue;
      }

      const loginCode = `${teacherCode}.${String(nextSeq).padStart(2, '0')}`;
      nextSeq++;
      const password = generateStudentPassword();
      const studentUid = await createProvisionedStudentAuthAccount(loginCode, password, row.studentName);
      queueWrite({
        groupCode, teacherUid: teacher.uid, studentUid, joinedAt: new Date().toISOString(),
        studentName: row.studentName, school: row.school, className: row.className,
        address: row.address, phone: row.phone, email: '', loginCode
      });
      results.push({ studentName: row.studentName, loginCode, password, reused: false });
      byPhone.set(row.phone, { studentUid, loginCode, phone: row.phone }); // phòng file có SĐT trùng lặp ngay trong cùng 1 lần nạp
    } catch (e) {
      errors.push({ row: i + 2, message: `${row.studentName || '(dòng ' + (i + 2) + ')'}: ${e.message}` });
    }
  }

  if (opsInBatch > 0) commits.push(batch.commit());
  await Promise.all(commits);
  await cleanupSecondaryAuthSession();

  return { results, errors };
}

// ---------- Mẫu file nạp danh sách + xuất file mã ----------
const STUDENT_IMPORT_TEMPLATE_HEADERS = ['Họ và tên', 'Trường', 'Lớp', 'Địa chỉ', 'Số điện thoại'];

function downloadStudentImportTemplateCSV() {
  const rows = [
    STUDENT_IMPORT_TEMPLATE_HEADERS,
    ['Nguyễn Văn A', 'THCS Nguyễn Trãi', '6A1', '12 Lê Lợi, Quy Nhơn', '0912345678'],
    ['Trần Thị B', 'THCS Nguyễn Trãi', '6A1', '45 Trần Hưng Đạo, Quy Nhơn', '0987654321']
  ];
  downloadCSV(rows, 'mau-nap-danh-sach-hoc-sinh.csv');
}

function downloadStudentCodesCSV(results, groupName) {
  const rows = [
    ['Họ và tên', 'Mã học sinh', 'Mật khẩu'],
    ...results.map((r) => [
      r.studentName, r.loginCode,
      r.reused ? 'Đã cấp trước đó — xem file cũ, hoặc dùng "Cấp mã thay thế" nếu học sinh quên' : r.password
    ])
  ];
  downloadCSV(rows, `ma-hoc-sinh-${(groupName || 'nhom').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`);
}

// Dùng CHUNG cơ chế tải CSV đã có (xem quiz-excel.js: downloadQuizTemplateCSV) — BOM UTF-8 để Excel
// mở đúng tiếng Việt có dấu, không cần viết lại logic đọc/ghi CSV.
function downloadCSV(rows, filename) {
  const csv = rows.map((r) => r.map(csvEscapeField).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Đọc file .xlsx/.csv theo đúng mẫu cột STUDENT_IMPORT_TEMPLATE_HEADERS, dùng lại bộ đọc đã có
// (readXlsxGrid/parseCSVText — xem quiz-excel.js) — không viết lại logic đọc file.
async function parseStudentImportFile(file) {
  const lowerName = file.name.toLowerCase();
  let rows;
  if (lowerName.endsWith('.csv')) {
    rows = parseCSVText(await file.text());
  } else if (lowerName.endsWith('.xlsx')) {
    rows = await readXlsxGrid(await file.arrayBuffer());
  } else {
    throw new Error('Chỉ hỗ trợ file .xlsx hoặc .csv.');
  }
  if (rows.length < 2) throw new Error('File chưa có dữ liệu học sinh (chỉ thấy dòng tiêu đề hoặc trống).');
  const dataRows = rows.slice(1);
  const parsed = [];
  const errors = [];
  dataRows.forEach((row, idx) => {
    const lineNo = idx + 2;
    const studentName = (row[0] || '').toString().trim();
    const school = (row[1] || '').toString().trim();
    const className = (row[2] || '').toString().trim();
    const address = (row[3] || '').toString().trim();
    const phone = (row[4] || '').toString().trim();
    if (!studentName && !school && !className && !address && !phone) return; // dòng trống -> bỏ qua
    if (!studentName || !school || !className || !address || !phone) {
      errors.push(`Dòng ${lineNo}: thiếu 1 trong các cột bắt buộc (Họ tên/Trường/Lớp/Địa chỉ/SĐT)`);
      return;
    }
    parsed.push({ studentName, school, className, address, phone });
  });
  if (errors.length) {
    const err = new Error(`File có ${errors.length} dòng lỗi:\n` + errors.join('\n'));
    err.isMultiline = true;
    throw err;
  }
  if (!parsed.length) throw new Error('Không tìm thấy học sinh hợp lệ nào trong file.');
  return parsed;
}

// ---------- Cấp mã thay thế (học sinh quên mật khẩu, không khôi phục được tài khoản cũ) ----------
// Tạo 1 tài khoản MỚI hoàn toàn (mã học sinh mới, số thứ tự mới) rồi thêm vào ĐÚNG nhóm mà bản ghi
// cũ đang ở — KHÔNG xoá/đụng gì tới bản ghi cũ (giáo viên tự xoá riêng nếu muốn qua nút "Xoá học
// sinh" đã có sẵn). Tiến độ/gói của tài khoản CŨ không tự chuyển sang tài khoản mới — xem chú thích
// đầu file.
async function issueReplacementLoginForStudent(oldStudentDoc) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const teacherCode = deriveTeacherCode(teacher.uid);
  const nextSeq = await nextLoginSeqForTeacher(teacher.uid);
  const loginCode = `${teacherCode}.${String(nextSeq).padStart(2, '0')}`;
  const password = generateStudentPassword();
  const studentUid = await createProvisionedStudentAuthAccount(loginCode, password, oldStudentDoc.studentName);
  await addStudentToGroup(oldStudentDoc.groupCode, {
    studentUid, studentName: oldStudentDoc.studentName, school: oldStudentDoc.school,
    className: oldStudentDoc.className, address: oldStudentDoc.address, phone: oldStudentDoc.phone,
    email: '', loginCode
  });
  await cleanupSecondaryAuthSession();
  return { loginCode, password };
}
