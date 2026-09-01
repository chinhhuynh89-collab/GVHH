// Theo dõi tiến độ học theo chương — lưu trong localStorage (offline, không cần backend).

const PROGRESS_KEY = 'hoahoc_progress_v1';
const FREE_MODE_KEY = 'hoahoc_free_mode';
const QUIZ_PASS_PERCENT = 70;

function loadAllProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveAllProgress(all) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
}

function getChapterProgress(chapterId) {
  const all = loadAllProgress();
  return Object.assign({ lessonViewed: false, flashcardsViewed: false, quizBestPercent: 0 }, all[chapterId]);
}

function setChapterProgress(chapterId, patch) {
  const all = loadAllProgress();
  all[chapterId] = Object.assign(getChapterProgress(chapterId), patch);
  saveAllProgress(all);
  return all[chapterId];
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

function isFreeMode() {
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
