/**
 * Backend cho "Trợ Lý Giáo Viên Hoá Học" — quản lý nhóm học sinh, đề kiểm tra tự động, nộp bài, thống kê.
 * Dán toàn bộ file này vào Google Apps Script (Extensions > Apps Script) của 1 Google Sheet trống,
 * rồi Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 * Copy URL /exec dán vào app ở trang "Kết nối đồng bộ".
 *
 * Không cần tạo sẵn sheet/cột — script tự tạo các sheet cần thiết ở lần gọi đầu tiên.
 */

var SHEETS = {
  GROUPS: 'Groups',
  STUDENTS: 'Students',
  EXAMS: 'Exams',
  SUBMISSIONS: 'Submissions'
};

var SCHEMAS = {
  Groups: ['groupId', 'groupCode', 'groupName', 'grade', 'chapterIds', 'createdAt'],
  Students: ['studentId', 'groupCode', 'deviceId', 'studentName', 'joinedAt'],
  Exams: ['examId', 'groupCode', 'chapterId', 'chapterTitle', 'durationMinutes', 'startTime', 'endTime', 'questionsJson', 'createdAt'],
  Submissions: ['submissionId', 'examId', 'studentId', 'studentName', 'deviceId', 'answersJson', 'score', 'correctCount', 'total', 'startedAt', 'submittedAt']
};

function doPost(e) {
  var result;
  try {
    var body = JSON.parse(e.postData.contents);
    var data = routeAction(body.action, body.payload || {});
    result = { ok: true, data: data };
  } catch (err) {
    result = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  // Cho phép kiểm tra nhanh URL trên trình duyệt (ping).
  return ContentService.createTextOutput(JSON.stringify({ ok: true, data: { pong: true, time: new Date().toISOString() } }))
    .setMimeType(ContentService.MimeType.JSON);
}

function routeAction(action, payload) {
  switch (action) {
    case 'ping': return { pong: true, time: new Date().toISOString() };
    case 'createGroup': return createGroup(payload);
    case 'listGroups': return listGroups(payload);
    case 'joinGroup': return joinGroup(payload);
    case 'createExam': return createExam(payload);
    case 'getActiveExam': return getActiveExam(payload);
    case 'submitExam': return submitExam(payload);
    case 'getExamResults': return getExamResults(payload);
    case 'listExamsForGroup': return listExamsForGroup(payload);
    default: throw new Error('Không rõ hành động: ' + action);
  }
}

// ---------- Tiện ích sheet ----------

function ensureSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(SCHEMAS[name]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function sheetToObjects(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.join('') === '') continue;
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = row[c];
    rows.push(obj);
  }
  return rows;
}

function appendObject(sheet, headers, obj) {
  var row = headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
  sheet.appendRow(row);
}

function genId(prefix) {
  return prefix + '_' + Utilities.getUuid().split('-')[0];
}

function genGroupCode(existingCodes) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ ký tự dễ nhầm (0,O,1,I)
  var code;
  do {
    code = '';
    for (var i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  } while (existingCodes.indexOf(code) !== -1);
  return code;
}

// ---------- Nhóm học sinh ----------

function createGroup(p) {
  if (!p.groupName || !p.grade) throw new Error('Thiếu tên nhóm hoặc khối lớp');
  var sheet = ensureSheet(SHEETS.GROUPS);
  var groups = sheetToObjects(sheet);
  var code = genGroupCode(groups.map(function (g) { return g.groupCode; }));
  var group = {
    groupId: genId('grp'),
    groupCode: code,
    groupName: p.groupName,
    grade: p.grade,
    chapterIds: JSON.stringify(p.chapterIds || []),
    createdAt: new Date().toISOString()
  };
  appendObject(sheet, SCHEMAS.Groups, group);
  return group;
}

function listGroups() {
  var groups = sheetToObjects(ensureSheet(SHEETS.GROUPS));
  var students = sheetToObjects(ensureSheet(SHEETS.STUDENTS));
  return groups.map(function (g) {
    var count = students.filter(function (s) { return s.groupCode === g.groupCode; }).length;
    return {
      groupId: g.groupId,
      groupCode: g.groupCode,
      groupName: g.groupName,
      grade: g.grade,
      chapterIds: JSON.parse(g.chapterIds || '[]'),
      createdAt: g.createdAt,
      studentCount: count
    };
  });
}

function findGroup(groupCode) {
  var groups = sheetToObjects(ensureSheet(SHEETS.GROUPS));
  var g = groups.filter(function (x) { return x.groupCode === groupCode; })[0];
  if (!g) throw new Error('Không tìm thấy nhóm với mã "' + groupCode + '"');
  return g;
}

// ---------- Học sinh tham gia nhóm ----------

function joinGroup(p) {
  if (!p.groupCode || !p.studentName || !p.deviceId) throw new Error('Thiếu mã nhóm, tên hoặc thiết bị');
  var group = findGroup(p.groupCode);
  var sheet = ensureSheet(SHEETS.STUDENTS);
  var students = sheetToObjects(sheet);
  var existing = students.filter(function (s) { return s.groupCode === p.groupCode && s.deviceId === p.deviceId; })[0];
  if (existing) {
    return { studentId: existing.studentId, groupName: group.groupName, grade: group.grade, groupCode: group.groupCode };
  }
  var student = {
    studentId: genId('stu'),
    groupCode: p.groupCode,
    deviceId: p.deviceId,
    studentName: p.studentName,
    joinedAt: new Date().toISOString()
  };
  appendObject(sheet, SCHEMAS.Students, student);
  return { studentId: student.studentId, groupName: group.groupName, grade: group.grade, groupCode: group.groupCode };
}

// ---------- Đề kiểm tra ----------

function createExam(p) {
  if (!p.groupCode || !p.questions || !p.questions.length) throw new Error('Thiếu nhóm hoặc câu hỏi');
  findGroup(p.groupCode); // báo lỗi nếu nhóm không tồn tại
  var sheet = ensureSheet(SHEETS.EXAMS);
  var exam = {
    examId: genId('exam'),
    groupCode: p.groupCode,
    chapterId: p.chapterId || '',
    chapterTitle: p.chapterTitle || '',
    durationMinutes: p.durationMinutes || 30,
    startTime: p.startTime || new Date().toISOString(),
    endTime: p.endTime || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    questionsJson: JSON.stringify(p.questions),
    createdAt: new Date().toISOString()
  };
  appendObject(sheet, SCHEMAS.Exams, exam);
  return { examId: exam.examId };
}

function listExamsForGroup(p) {
  if (!p.groupCode) throw new Error('Thiếu mã nhóm');
  var exams = sheetToObjects(ensureSheet(SHEETS.EXAMS));
  return exams.filter(function (e) { return e.groupCode === p.groupCode; }).map(function (e) {
    return {
      examId: e.examId, chapterId: e.chapterId, chapterTitle: e.chapterTitle,
      durationMinutes: e.durationMinutes, startTime: e.startTime, endTime: e.endTime,
      questionCount: JSON.parse(e.questionsJson || '[]').length, createdAt: e.createdAt
    };
  });
}

function getActiveExam(p) {
  if (!p.groupCode || !p.deviceId) throw new Error('Thiếu mã nhóm hoặc thiết bị');
  var exams = sheetToObjects(ensureSheet(SHEETS.EXAMS)).filter(function (e) { return e.groupCode === p.groupCode; });
  var now = new Date();
  var active = exams.filter(function (e) {
    return new Date(e.startTime) <= now && now <= new Date(e.endTime);
  }).sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })[0];
  if (!active) return { exam: null };

  var submissions = sheetToObjects(ensureSheet(SHEETS.SUBMISSIONS));
  var already = submissions.some(function (s) { return s.examId === active.examId && s.deviceId === p.deviceId; });
  if (already) return { exam: null, alreadySubmitted: true };

  var questions = JSON.parse(active.questionsJson || '[]').map(function (q) {
    return { q: q.q, options: q.options }; // không gửi đáp án đúng / giải thích trước khi nộp bài
  });
  return {
    exam: {
      examId: active.examId,
      chapterTitle: active.chapterTitle,
      durationMinutes: active.durationMinutes,
      endTime: active.endTime,
      questions: questions
    }
  };
}

function submitExam(p) {
  if (!p.examId || !p.studentId || !p.answers) throw new Error('Thiếu dữ liệu nộp bài');
  var exams = sheetToObjects(ensureSheet(SHEETS.EXAMS));
  var exam = exams.filter(function (e) { return e.examId === p.examId; })[0];
  if (!exam) throw new Error('Không tìm thấy đề kiểm tra');
  var questions = JSON.parse(exam.questionsJson || '[]');

  var correctCount = 0;
  questions.forEach(function (q, i) {
    if (p.answers[i] === q.correct) correctCount++;
  });
  var total = questions.length;
  var score = total ? Math.round((correctCount / total) * 100) : 0;

  var sheet = ensureSheet(SHEETS.SUBMISSIONS);
  var submissions = sheetToObjects(sheet);
  var dup = submissions.filter(function (s) { return s.examId === p.examId && s.deviceId === p.deviceId; })[0];
  if (dup) {
    return { score: Number(dup.score), correctCount: Number(dup.correctCount), total: Number(dup.total), alreadySubmitted: true };
  }

  var record = {
    submissionId: genId('sub'),
    examId: p.examId,
    studentId: p.studentId,
    studentName: p.studentName || '',
    deviceId: p.deviceId,
    answersJson: JSON.stringify(p.answers),
    score: score,
    correctCount: correctCount,
    total: total,
    startedAt: p.startedAt || '',
    submittedAt: new Date().toISOString()
  };
  appendObject(sheet, SCHEMAS.Submissions, record);
  return { score: score, correctCount: correctCount, total: total };
}

function getExamResults(p) {
  if (!p.examId) throw new Error('Thiếu mã đề kiểm tra');
  var submissions = sheetToObjects(ensureSheet(SHEETS.SUBMISSIONS)).filter(function (s) { return s.examId === p.examId; });
  var results = submissions.map(function (s) {
    return { studentName: s.studentName, score: Number(s.score), correctCount: Number(s.correctCount), total: Number(s.total), submittedAt: s.submittedAt };
  }).sort(function (a, b) { return b.score - a.score; });

  var scores = results.map(function (r) { return r.score; });
  var stats = {
    count: scores.length,
    avg: scores.length ? Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length) : 0,
    max: scores.length ? Math.max.apply(null, scores) : 0,
    min: scores.length ? Math.min.apply(null, scores) : 0
  };
  return { results: results, stats: stats };
}
