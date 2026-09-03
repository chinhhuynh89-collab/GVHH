// Theo dõi tiến độ học theo chương — lưu localStorage để đọc/ghi TỨC THÌ (không chờ mạng mỗi lần
// đánh dấu đã xem 1 mục), có đồng bộ lên Firestore chạy nền (syncProgressToServer, không chặn UI).
//
// QUAN TRỌNG — khoá lưu trữ GẮN VỚI HỌC SINH đang active (membership.studentId), KHÔNG dùng 1 khoá
// chung cho cả thiết bị như trước. Lý do: thiết bị dùng chung (nhiều học sinh lần lượt đăng nhập
// Google khác nhau để học) mà dùng chung 1 khoá sẽ khiến MỌI tài khoản thấy CHUNG 1 tiến độ — đây là
// lỗi thực tế đã xảy ra. hydrateProgressFromServer() bù thêm chiều ngược lại: tải tiến độ đã đồng bộ
// trước đó VỀ máy hiện tại, để đổi sang thiết bị mới (cùng tài khoản) cũng không mất tiến độ.
const PROGRESS_KEY_BASE = 'hoahoc_progress_v1';
const FREE_MODE_KEY = 'hoahoc_free_mode';
const QUIZ_PASS_PERCENT = 70;

// Không có membership (khách tự học tự do, hoặc giáo viên xem thử nội dung) -> dùng khoá chung
// không gắn tài khoản nào (giữ hành vi cũ, không có gì để lẫn giữa các tài khoản trong trường hợp này).
function progressStorageKey() {
  const membership = typeof getMembership === 'function' ? getMembership() : null;
  const scopeId = membership && membership.studentId;
  return scopeId ? `${PROGRESS_KEY_BASE}__${scopeId}` : PROGRESS_KEY_BASE;
}

function loadAllProgress() {
  try {
    return JSON.parse(localStorage.getItem(progressStorageKey())) || {};
  } catch (e) {
    return {};
  }
}

function saveAllProgress(all) {
  localStorage.setItem(progressStorageKey(), JSON.stringify(all));
}

// Tải tiến độ đã đồng bộ trước đó (Firestore) VỀ bộ nhớ đệm cục bộ của ĐÚNG học sinh này — gọi 1 lần
// lúc trang liên quan tiến độ vừa xác nhận membership hợp lệ (xem chapter-overview.js/
// chapter-detail.js). Chỉ BỔ SUNG chương nào cục bộ CHƯA CÓ hoặc bản trên server MỚI HƠN
// (updatedAt) — không ghi đè tiến độ vừa làm trên máy này mà có thể chưa kịp đồng bộ lên do mất mạng.
async function hydrateProgressFromServer(studentId) {
  if (!studentId || typeof isFirebaseConfigured !== 'function' || !isFirebaseConfigured()) return;
  try {
    const { db } = ensureFirebase();
    const snap = await db.collection('progress').doc(studentId).get();
    if (!snap.exists) return;
    const serverChapters = snap.data().chapters || {};
    const local = loadAllProgress();
    let changed = false;
    Object.keys(serverChapters).forEach((chapterId) => {
      const s = serverChapters[chapterId];
      const l = local[chapterId];
      if (!l || (s.updatedAt || '') > (l.updatedAt || '')) {
        local[chapterId] = s;
        changed = true;
      }
    });
    if (changed) saveAllProgress(local);
  } catch (e) { /* mất mạng/lỗi -> vẫn dùng dữ liệu cục bộ hiện có, không chặn trang */ }
}

function getChapterProgress(chapterId) {
  const all = loadAllProgress();
  return Object.assign({ lessonViewed: false, flashcardsViewed: false, quizBestPercent: 0 }, all[chapterId]);
}

function setChapterProgress(chapterId, patch) {
  const all = loadAllProgress();
  all[chapterId] = Object.assign(getChapterProgress(chapterId), patch);
  saveAllProgress(all);
  syncProgressToServer(chapterId, all[chapterId]);
  return all[chapterId];
}

// Đồng bộ tiến độ học lên Firestore để giáo viên xem được trong "Kết quả học tập" — chỉ đồng bộ
// khi đang ở vai trò học sinh ĐÃ vào 1 nhóm (không đồng bộ khi tự học tự do, không có nhóm nào để
// báo cáo). Lưu 1 doc/học sinh (id = studentId, khớp với doc trong collection "students") chứa
// map tiến độ theo từng chương — set({merge:true}) chỉ cập nhật đúng chương vừa đổi, không đụng
// đến tiến độ các chương khác đã đồng bộ trước đó. Lỗi mạng thì bỏ qua im lặng — dữ liệu vẫn còn
// nguyên trong localStorage, không mất gì, lần thay đổi tiến độ tiếp theo sẽ tự đồng bộ lại.
function syncProgressToServer(chapterId, progress) {
  try {
    if (typeof isFirebaseConfigured !== 'function' || !isFirebaseConfigured()) return;
    if (typeof getMembership !== 'function') return;
    const membership = getMembership();
    if (!membership || !membership.studentId || !membership.studentUid) return;
    const { db } = ensureFirebase();
    db.collection('progress').doc(membership.studentId).set({
      studentId: membership.studentId,
      studentUid: membership.studentUid,
      groupCode: membership.groupCode,
      studentName: membership.studentName,
      chapters: { [chapterId]: Object.assign({}, progress, { updatedAt: new Date().toISOString() }) }
    }, { merge: true }).catch(() => {});
  } catch (e) { /* ignore */ }
}

function isChapterComplete(chapterId) {
  const p = getChapterProgress(chapterId);
  return p.lessonViewed && p.flashcardsViewed && p.quizBestPercent >= QUIZ_PASS_PERCENT;
}

// Điểm hoàn thành 1 chương: 3 phần bằng nhau (bài giảng / flashcard / trắc nghiệm đạt).
function chapterPercent(chapterId) {
  const p = getChapterProgress(chapterId);
  let done = 0;
  if (p.lessonViewed) done++;
  if (p.flashcardsViewed) done++;
  if (p.quizBestPercent >= QUIZ_PASS_PERCENT) done++;
  return Math.round((done / 3) * 100);
}

// Nếu học sinh đang ở trong 1 nhóm, "Học tự do" do GIÁO VIÊN quyết định cho cả nhóm (xem
// groups-data.js: updateGroupFreeMode) thay vì mỗi học sinh tự bật/tắt — chapter-overview.js gọi
// setGroupFreeModeOverride() 1 lần lúc tải trang sau khi biết nhóm có bật hay không. Học sinh/giáo
// viên KHÔNG ở trong nhóm nào (tự học tự do) vẫn dùng lựa chọn cá nhân như trước.
let _groupFreeModeOverride = null;
function setGroupFreeModeOverride(v) {
  _groupFreeModeOverride = v;
}

function isFreeMode() {
  if (_groupFreeModeOverride !== null) return _groupFreeModeOverride;
  return localStorage.getItem(FREE_MODE_KEY) === '1';
}

function setFreeMode(enabled) {
  localStorage.setItem(FREE_MODE_KEY, enabled ? '1' : '0');
}

function isChapterUnlocked(chapters, chapterId) {
  if (isFreeMode()) return true;
  const idx = chapters.findIndex((c) => c.id === chapterId);
  if (idx <= 0) return true;
  const prev = chapters[idx - 1];
  // Chương trước chưa có nội dung chi tiết (đang biên soạn) thì không thể "hoàn thành" -> không chặn chương sau.
  if (!hasContent(prev)) return true;
  return isChapterComplete(prev.id);
}

// Chỉ tính % trên các chương đã có nội dung chi tiết, tránh việc thêm chương "đang biên soạn" kéo % xuống sai lệch.
function overallPercent(chapters) {
  const withContent = chapters.filter(hasContent);
  if (!withContent.length) return 0;
  const sum = withContent.reduce((s, c) => s + chapterPercent(c.id), 0);
  return Math.round(sum / withContent.length);
}
