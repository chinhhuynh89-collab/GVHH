// Đăng ký toàn bộ chương trình theo khối lớp 6-12. Phải nạp sau các file chapters-N.js.

const GRADES = [
  { grade: 6, label: 'Lớp 6' },
  { grade: 7, label: 'Lớp 7' },
  { grade: 8, label: 'Lớp 8' },
  { grade: 9, label: 'Lớp 9' },
  { grade: 10, label: 'Lớp 10' },
  { grade: 11, label: 'Lớp 11' },
  { grade: 12, label: 'Lớp 12' }
];

const CURRICULUM = {
  6: CHAPTERS_6,
  7: CHAPTERS_7,
  8: CHAPTERS_8,
  9: CHAPTERS_9,
  10: CHAPTERS_10,
  11: CHAPTERS_11,
  12: CHAPTERS_12
};

function getChaptersByGrade(grade) {
  return CURRICULUM[grade] || [];
}

function hasContent(chapter) {
  return !!(chapter && chapter.lessons && chapter.lessons.length > 0);
}

// Tìm 1 chương theo id trên toàn bộ chương trình (id đã có tiền tố riêng theo lớp, VD c10-3).
function findChapterAnywhere(chapterId) {
  for (const grade of Object.keys(CURRICULUM)) {
    const found = CURRICULUM[grade].find((c) => c.id === chapterId);
    if (found) return { chapter: found, grade: parseInt(grade, 10) };
  }
  return null;
}
