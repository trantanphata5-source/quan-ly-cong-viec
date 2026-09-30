/**
 * GOOGLE APPS SCRIPT - CƠ SỞ DỮ LIỆU "QUẢN LÝ ĐẦU VIỆC"
 * Google Sheet: https://docs.google.com/spreadsheets/d/1oswJXBFTpD04-iby6A-Qh0gmQyTdEhKTGuQDXU2TJ1M/edit
 *
 * Script tự tạo 2 sheet với các cột sau:
 *
 *  Sheet "NhomCongViec"
 *    A Mã nhóm | B Tên nhóm | C Màu | D Thứ tự | E Ngày tạo
 *
 *  Sheet "CongViec"
 *    A Mã việc | B Tên công việc | C Mã nhóm | D Tên nhóm | E Cấp độ (Việc chính / Việc khác)
 *    F Nội dung chi tiết | G Thời hạn (dd/MM/yyyy) | H Trạng thái (Chưa làm / Đang làm / Hoàn thành)
 *    I Ưu tiên (Bình thường / Quan trọng / Khẩn) | J Thứ tự | K Ngày tạo | L Cập nhật lần cuối
 *
 * ==============================================================================
 * HƯỚNG DẪN TRIỂN KHAI (khoảng 2 phút):
 * ==============================================================================
 * 1. Mở Google Sheet ở link trên.
 * 2. Menu: Tiện ích mở rộng (Extensions) -> Apps Script.
 * 3. Xóa nội dung mẫu trong Code.gs, dán toàn bộ file này vào, bấm Lưu (Ctrl + S).
 * 4. (Tùy chọn) Chọn hàm "thietLapSheet" trên thanh công cụ -> bấm "Chạy" để tạo sẵn 2 sheet + tiêu đề cột.
 *    Lần đầu Google hỏi quyền: chọn tài khoản -> Nâng cao (Advanced) -> Đi tới dự án (unsafe) -> Cho phép (Allow).
 * 5. Bấm "Triển khai" (Deploy) -> "Triển khai mới" (New deployment):
 *    - Loại: Ứng dụng web (Web app)
 *    - Thực thi dưới dạng (Execute as): Tôi (Me)
 *    - Ai có quyền truy cập (Who has access): Bất kỳ ai (Anyone)
 *    - Bấm "Triển khai".
 * 6. Sao chép "URL ứng dụng web" (đuôi /exec) và dán vào nút "☁ Kết nối Google Sheet" trên trang web.
 *
 * Lưu ý: mỗi lần sửa script cần vào Triển khai -> Quản lý triển khai -> Sửa (bút chì)
 *        -> Phiên bản: "Phiên bản mới" -> Triển khai, để URL cũ nhận code mới.
 * ==============================================================================
 */

var SPREADSHEET_ID = '1oswJXBFTpD04-iby6A-Qh0gmQyTdEhKTGuQDXU2TJ1M';
var SHEET_GROUPS = 'NhomCongViec';
var SHEET_TASKS = 'CongViec';

var GROUP_HEADERS = ['Mã nhóm', 'Tên nhóm', 'Màu', 'Thứ tự', 'Ngày tạo'];
var TASK_HEADERS = [
  'Mã việc', 'Tên công việc', 'Mã nhóm', 'Tên nhóm', 'Cấp độ',
  'Nội dung chi tiết', 'Thời hạn', 'Trạng thái', 'Ưu tiên', 'Thứ tự',
  'Ngày tạo', 'Cập nhật lần cuối'
];

var LEVEL_TEXT = { main: 'Việc chính', sub: 'Việc khác' };
var STATUS_TEXT = { todo: 'Chưa làm', doing: 'Đang làm', done: 'Hoàn thành' };
var PRIORITY_TEXT = { normal: 'Bình thường', high: 'Quan trọng', urgent: 'Khẩn' };
var TZ = 'Asia/Ho_Chi_Minh';

/* ============================ API ============================ */

function doGet(e) {
  try {
    var ss = getSS();
    ensureSheets(ss);
    var data = readAll(ss);
    var lastModified = PropertiesService.getScriptProperties().getProperty('LAST_MODIFIED') || '';
    return output({
      status: 'success',
      hasData: data.groups.length > 0,
      data: { groups: data.groups, tasks: data.tasks, lastModified: lastModified }
    }, e);
  } catch (err) {
    return output({ status: 'error', message: String(err) }, e);
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = (e && e.postData && e.postData.contents) || (e && e.parameter && e.parameter.data) || '';
    if (!body) return output({ status: 'error', message: 'Không có dữ liệu gửi lên' }, e);

    var payload = JSON.parse(body);
    if (!payload || !Array.isArray(payload.groups) || !Array.isArray(payload.tasks)) {
      return output({ status: 'error', message: 'Dữ liệu không hợp lệ' }, e);
    }
    if (payload.groups.length === 0) {
      return output({ status: 'error', message: 'Phải có ít nhất 1 nhóm công việc' }, e);
    }

    var ss = getSS();
    ensureSheets(ss);

    // Chống xóa trắng dữ liệu do lỗi: nếu gửi lên 0 công việc trong khi sheet đang có dữ liệu
    var current = ss.getSheetByName(SHEET_TASKS).getLastRow() - 1;
    if (payload.tasks.length === 0 && current > 0 && !payload.confirmEmpty) {
      return output({ status: 'error', message: 'Từ chối ghi danh sách rỗng đè lên dữ liệu đang có' }, e);
    }

    var now = new Date();
    writeAll(ss, payload, now);
    var iso = now.toISOString();
    PropertiesService.getScriptProperties().setProperty('LAST_MODIFIED', iso);

    return output({ status: 'success', message: 'Đã lưu vào Google Sheet', lastModified: iso }, e);
  } catch (err) {
    return output({ status: 'error', message: String(err) }, e);
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/* ========================= ĐỌC / GHI ========================= */

function readAll(ss) {
  var gSheet = ss.getSheetByName(SHEET_GROUPS);
  var tSheet = ss.getSheetByName(SHEET_TASKS);

  var groups = [];
  var gRows = gSheet.getLastRow() > 1
    ? gSheet.getRange(2, 1, gSheet.getLastRow() - 1, GROUP_HEADERS.length).getDisplayValues() : [];
  gRows.forEach(function (r, i) {
    if (!r[1]) return; // bỏ dòng trống
    groups.push({
      id: r[0] || ('g_' + slug(r[1])),
      name: r[1],
      color: r[2] || '#00529b',
      order: toNum(r[3], i),
      createdAt: r[4] || ''
    });
  });

  var tasks = [];
  var tRows = tSheet.getLastRow() > 1
    ? tSheet.getRange(2, 1, tSheet.getLastRow() - 1, TASK_HEADERS.length).getDisplayValues() : [];
  tRows.forEach(function (r, i) {
    if (!r[1]) return;
    var groupId = r[2];
    // Người dùng nhập tay trên sheet chỉ ghi Tên nhóm -> tự tìm Mã nhóm
    if (!groupId && r[3]) {
      var found = groups.filter(function (g) { return g.name === r[3]; })[0];
      if (found) groupId = found.id;
    }
    tasks.push({
      id: r[0] || ('t_' + Utilities.getUuid().slice(0, 8)),
      title: r[1],
      groupId: groupId || (groups[0] ? groups[0].id : ''),
      level: reverse(LEVEL_TEXT, r[4], 'sub'),
      detail: r[5] || '',
      deadline: toIsoDate(r[6]),
      status: reverse(STATUS_TEXT, r[7], 'todo'),
      priority: reverse(PRIORITY_TEXT, r[8], 'normal'),
      order: toNum(r[9], i),
      createdAt: r[10] || '',
      updatedAt: r[11] || ''
    });
  });

  return { groups: groups, tasks: tasks };
}

function writeAll(ss, payload, now) {
  var stamp = Utilities.formatDate(now, TZ, 'dd/MM/yyyy HH:mm:ss');
  var groupName = {};
  payload.groups.forEach(function (g) { groupName[g.id] = g.name; });

  var gRows = payload.groups.map(function (g, i) {
    return [g.id, g.name || '', g.color || '', i + 1, g.createdAt || stamp];
  });

  // Sắp xếp: theo thứ tự nhóm, việc chính trước, rồi theo thứ tự trong cột
  var gIndex = {};
  payload.groups.forEach(function (g, i) { gIndex[g.id] = i; });
  var tasks = payload.tasks.slice().sort(function (a, b) {
    return (gIndex[a.groupId] - gIndex[b.groupId]) ||
      ((a.level === 'main' ? 0 : 1) - (b.level === 'main' ? 0 : 1)) ||
      ((a.order || 0) - (b.order || 0));
  });

  var tRows = tasks.map(function (t) {
    return [
      t.id, t.title || '', t.groupId || '', groupName[t.groupId] || '',
      LEVEL_TEXT[t.level] || LEVEL_TEXT.sub,
      t.detail || '', toVnDate(t.deadline),
      STATUS_TEXT[t.status] || STATUS_TEXT.todo,
      PRIORITY_TEXT[t.priority] || PRIORITY_TEXT.normal,
      t.order || 0, t.createdAt || stamp, t.updatedAt || stamp
    ];
  });

  writeSheet(ss.getSheetByName(SHEET_GROUPS), GROUP_HEADERS, gRows);
  writeSheet(ss.getSheetByName(SHEET_TASKS), TASK_HEADERS, tRows);
  formatTaskSheet(ss.getSheetByName(SHEET_TASKS), tRows);
}

function writeSheet(sheet, headers, rows) {
  var last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, Math.max(headers.length, sheet.getLastColumn())).clearContent().setBackground(null);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) {
    var range = sheet.getRange(2, 1, rows.length, headers.length);
    range.setNumberFormat('@'); // giữ dạng văn bản, tránh Sheet tự đổi ngày
    range.setValues(rows);
  }
}

function formatTaskSheet(sheet, rows) {
  if (!rows.length) return;
  var bg = rows.map(function (r) {
    var color = r[7] === STATUS_TEXT.done ? '#e6f4ea' : (r[4] === LEVEL_TEXT.main ? '#eef4fb' : '#ffffff');
    return TASK_HEADERS.map(function () { return color; });
  });
  sheet.getRange(2, 1, rows.length, TASK_HEADERS.length).setBackgrounds(bg).setVerticalAlignment('middle').setWrap(true);
}

/* ========================= THIẾT LẬP ========================= */

/** Chạy tay 1 lần trong trình soạn thảo để tạo sẵn 2 sheet và tiêu đề cột. */
function thietLapSheet() {
  var ss = getSS();
  ensureSheets(ss);
  Logger.log('Đã tạo sheet "' + SHEET_GROUPS + '" và "' + SHEET_TASKS + '".');
}

function ensureSheets(ss) {
  setupSheet(ss, SHEET_GROUPS, GROUP_HEADERS, [110, 200, 90, 70, 150]);
  setupSheet(ss, SHEET_TASKS, TASK_HEADERS, [110, 300, 110, 130, 100, 320, 100, 110, 110, 70, 150, 150]);
}

function setupSheet(ss, name, headers, widths) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  var head = sheet.getRange(1, 1, 1, headers.length);
  var existing = head.getDisplayValues()[0];
  if (existing.join('|') !== headers.join('|')) {
    head.setValues([headers]);
    head.setBackground('#00529b').setFontColor('#ffffff').setFontWeight('bold')
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.setRowHeight(1, 32);
    sheet.setFrozenRows(1);
    widths.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  }
  return sheet;
}

/* ========================== TIỆN ÍCH ========================== */

function getSS() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  return ss || SpreadsheetApp.openById(SPREADSHEET_ID);
}

function output(obj, e) {
  var json = JSON.stringify(obj);
  var cb = e && e.parameter && e.parameter.callback;
  if (cb && /^[A-Za-z0-9_$.]+$/.test(cb)) {
    return ContentService.createTextOutput(cb + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function reverse(map, text, fallback) {
  text = String(text || '').trim().toLowerCase();
  for (var k in map) {
    if (map[k].toLowerCase() === text || k === text) return k;
  }
  return fallback;
}

function toNum(v, fallback) {
  var n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

/** yyyy-mm-dd -> dd/MM/yyyy */
function toVnDate(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? (m[3] + '/' + m[2] + '/' + m[1]) : (iso || '');
}

/** dd/MM/yyyy (hoặc d/M/yyyy) -> yyyy-mm-dd */
function toIsoDate(text) {
  text = String(text || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (!m) return '';
  return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}

function slug(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
