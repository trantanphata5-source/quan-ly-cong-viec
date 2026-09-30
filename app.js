/**
 * QUẢN LÝ ĐẦU VIỆC - CÔNG TY ĐIỆN LỰC VŨNG TÀU
 * Logic ứng dụng: CRUD công việc/nhóm, kéo thả, lưu cục bộ, đồng bộ Google Sheet qua Apps Script
 */
(function () {
  'use strict';

  /* =====================================================================
     CẤU HÌNH
     Sau khi triển khai Apps Script, có thể dán URL /exec vào DEFAULT_API
     để mọi máy mở trang đều tự kết nối mà không cần nhập.
     ===================================================================== */
  var DEFAULT_API = 'https://script.google.com/macros/s/AKfycbxOE9NrhtST_pSCAy6wRJBcfVa0UMRaL6R6Ow3caMwtxibJQjrp1Ne2K6-jWSXmk93_Lw/exec';
  var STORE_KEY = 'PCVT_DAU_VIEC_DATA_V1';
  var API_KEY = 'PCVT_DAU_VIEC_API';
  var COLORS = ['#0b72b9', '#d97706', '#059669', '#7c3aed', '#dc2626', '#0891b2', '#db2777', '#4d7c0f', '#475569'];

  /* ------------------- Dữ liệu ban đầu (từ file Word) ------------------- */
  function seedData() {
    var groups = [
      { id: 'g_kinhdoanh', name: 'Kinh doanh', color: '#0b72b9' },
      { id: 'g_kythuat', name: 'Kỹ thuật', color: '#d97706' },
      { id: 'g_dautu', name: 'Đầu tư', color: '#059669' },
      { id: 'g_quantri', name: 'Quản trị', color: '#7c3aed' }
    ];
    var main = {
      g_kinhdoanh: ['Quá hạn', 'Tổn thất', 'Thu tiền'],
      g_kythuat: ['RI (Reliability Indexes)', 'Tự động hóa', 'Sự cố ĐZ & Trạm'],
      g_dautu: ['SCL', 'ĐTXD', 'VTTB tồn kho'],
      g_quantri: ['Chi phí', 'Sáng kiến, NCKH, CCHC', 'Truyền thông', 'An toàn thông tin + Data',
        'Đoàn thể: Đảng (kiện toàn) / Công đoàn / ĐTN', 'Y tế', 'CLB thể thao, văn nghệ']
    };
    var sub = {
      g_kinhdoanh: ['Dự báo thương phẩm', 'Tồn nợ 2 kỳ', 'Cài app', 'Điều chỉnh hóa đơn', 'Hợp đồng quá hạn',
        'Kiểm tra giá', 'Rà soát giá', 'Bảo trì định kỳ', 'Công tơ 3 giá', 'Kiện toàn HTĐĐ', 'Đo xa'],
      g_kythuat: ['Cơ sở dữ liệu: GIS, OMS, PMIS,...', 'Xử lý tồn tại trên lưới',
        'Số liệu quá tải kỹ thuật (ĐZ, thiết bị đóng cắt, trạm)'],
      g_dautu: ['Giải ngân'],
      g_quantri: ['Lưu trữ hồ sơ', '5S', 'SCL CS 1234', 'Lắp thang máy + tòa nhà 551', 'Cây xanh']
    };
    var tasks = [], now = stamp();
    groups.forEach(function (g) {
      g.createdAt = now;
      [['main', main[g.id]], ['sub', sub[g.id]]].forEach(function (pair) {
        pair[1].forEach(function (title, i) {
          tasks.push({ id: uid('t'), title: title, groupId: g.id, level: pair[0], detail: '', deadline: '',
            status: 'todo', priority: 'normal', order: i + 1, createdAt: now, updatedAt: now });
        });
      });
    });
    return { groups: groups, tasks: tasks };
  }

  /* ------------------------------ Trạng thái ------------------------------ */
  var state = {
    groups: [], tasks: [],
    dirty: false,            // có thay đổi chưa đẩy lên Sheet
    api: '',
    sync: 'local',           // local | busy | ok | err
    syncAt: '',
    search: '', hideDone: false,
    editingTaskId: null, editingGroupId: null,
    dragId: null
  };
  var $ = function (id) { return document.getElementById(id); };
  var pushTimer = null, confirmAction = null;

  /* ------------------------------ Tiện ích ------------------------------ */
  function uid(p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function pad(n) { return ('0' + n).slice(-2); }
  function stamp() { var d = new Date(); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function vnDate(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd'); }
  function isLate(t) { return t.deadline && t.status !== 'done' && t.deadline < todayIso(); }
  function groupById(id) { return state.groups.filter(function (g) { return g.id === id; })[0]; }
  function taskById(id) { return state.tasks.filter(function (t) { return t.id === id; })[0]; }
  function zoneTasks(gid, level) {
    return state.tasks.filter(function (t) { return t.groupId === gid && t.level === level; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function toast(msg, err) {
    var el = document.createElement('div');
    el.className = 'toast' + (err ? ' err' : '');
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, 2800);
  }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }

  /* --------------------------- Lưu cục bộ + Sheet --------------------------- */
  function loadLocal() {
    var raw = store(STORE_KEY);
    if (raw) {
      try {
        var d = JSON.parse(raw);
        if (d && Array.isArray(d.groups) && d.groups.length) {
          state.groups = d.groups; state.tasks = d.tasks || []; state.dirty = !!d.dirty;
          return true;
        }
      } catch (e) {}
    }
    var s = seedData();
    state.groups = s.groups; state.tasks = s.tasks; state.dirty = false;
    return false;
  }
  function saveLocal() {
    store(STORE_KEY, JSON.stringify({ groups: state.groups, tasks: state.tasks, dirty: state.dirty, savedAt: new Date().toISOString() }));
  }
  // Gọi sau mọi thay đổi
  function commit() {
    state.dirty = true;
    saveLocal();
    render();
    if (state.api) {
      setSync('busy', 'Đang lưu lên Sheet...');
      clearTimeout(pushTimer);
      pushTimer = setTimeout(push, 700);
    }
  }

  function push() {
    if (!state.api) return;
    var body = JSON.stringify({ groups: state.groups, tasks: state.tasks, confirmEmpty: state.tasks.length === 0 });
    setSync('busy', 'Đang lưu lên Sheet...');
    fetch(state.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.status === 'success') pushed();
        else { setSync('err', 'Lỗi: ' + (res && res.message || 'không rõ')); toast('Sheet báo lỗi: ' + (res && res.message), true); }
      })
      .catch(function () {
        // Trình duyệt chặn đọc phản hồi (CORS) -> gửi lại chế độ no-cors
        fetch(state.api, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: body })
          .then(pushed)
          .catch(function () { setSync('err', 'Mất kết nối — đã lưu trên máy'); });
      });
  }
  function pushed() {
    state.dirty = false; saveLocal();
    setSync('ok', 'Đã đồng bộ Sheet ' + stamp().slice(11, 16));
  }

  var jsonpN = 0;
  function pull(manual) {
    if (!state.api) return;
    if (state.dirty && manual !== true && manual !== 'connect') { push(); return; }
    setSync('busy', 'Đang tải từ Sheet...');
    fetch(state.api + (state.api.indexOf('?') > -1 ? '&' : '?') + '_t=' + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (res) { onPulled(res, manual); })
      .catch(function () { pullJsonp(manual); });
  }
  function pullJsonp(manual) {
    var cb = 'dauviec_cb_' + (++jsonpN) + '_' + Date.now();
    var s = document.createElement('script');
    var done = false;
    var timer = setTimeout(function () { finish(); setSync('err', 'Không kết nối được Sheet'); if (manual) toast('Hết thời gian chờ Google Sheet', true); }, 15000);
    function finish() { done = true; clearTimeout(timer); try { delete window[cb]; } catch (e) { window[cb] = undefined; } s.remove(); }
    window[cb] = function (res) { if (done) return; finish(); onPulled(res, manual); };
    s.onerror = function () { if (done) return; finish(); setSync('err', 'Không kết nối được Sheet'); if (manual) toast('URL Apps Script không đúng hoặc chưa cấp quyền "Bất kỳ ai"', true); };
    s.src = state.api + (state.api.indexOf('?') > -1 ? '&' : '?') + 'callback=' + cb + '&_t=' + Date.now();
    document.head.appendChild(s);
  }
  function onPulled(res, manual) {
    if (!res || res.status !== 'success') {
      setSync('err', 'Lỗi đọc Sheet'); toast('Lỗi đọc Sheet: ' + (res && res.message || ''), true); return;
    }
    if (!res.hasData) {
      // Sheet trống -> đẩy dữ liệu hiện có (lần đầu kết nối)
      push(); if (manual) toast('Sheet còn trống — đã ghi dữ liệu hiện có lên Sheet'); return;
    }
    if (state.dirty && !manual) { push(); return; }
    state.groups = res.data.groups; state.tasks = res.data.tasks; state.dirty = false;
    saveLocal(); render();
    setSync('ok', 'Đã đồng bộ Sheet ' + stamp().slice(11, 16));
    if (manual === 'connect') toast('Đã kết nối — hiển thị dữ liệu từ Google Sheet');
    else if (manual) toast('Đã tải dữ liệu mới nhất từ Google Sheet');
  }

  function setSync(kind, text) {
    state.sync = kind;
    ['syncDot', 'syncDot2'].forEach(function (id) { $(id).className = 'sync-dot' + (kind === 'local' ? '' : ' ' + kind); });
    $('syncLabel').textContent = text;
    $('syncText').textContent = state.api ? text : 'Chưa kết nối — dữ liệu chỉ lưu trên trình duyệt này';
  }

  /* ------------------------------ Render ------------------------------ */
  function matches(t) {
    if (state.hideDone && t.status === 'done') return false;
    if (!state.search) return true;
    var q = norm(state.search);
    return norm(t.title).indexOf(q) > -1 || norm(t.detail).indexOf(q) > -1;
  }

  function render() {
    renderStats();
    var board = $('board');
    board.innerHTML = '';
    state.groups.forEach(function (g, gi) { board.appendChild(renderColumn(g, gi)); });
    var add = document.createElement('button');
    add.className = 'add-group';
    add.innerHTML = '＋ Thêm nhóm công việc';
    add.onclick = function () { openGroupModal(null); };
    board.appendChild(add);
  }

  function renderStats() {
    var t = state.tasks;
    var c = function (f) { return t.filter(f).length; };
    $('stats').innerHTML = [
      ['#00529b', 'Tổng', t.length],
      ['#7c3aed', 'Việc chính', c(function (x) { return x.level === 'main'; })],
      ['#0b72b9', 'Đang làm', c(function (x) { return x.status === 'doing'; })],
      ['#10b981', 'Hoàn thành', c(function (x) { return x.status === 'done'; })],
      ['#ef4444', 'Quá hạn', c(isLate)]
    ].map(function (p) { return '<span class="pill"><i style="background:' + p[0] + '"></i>' + p[1] + ': <b>' + p[2] + '</b></span>'; }).join('');
  }

  function renderColumn(g, gi) {
    var col = document.createElement('section');
    col.className = 'col';
    col.style.setProperty('--gc', g.color || '#00529b');
    var total = state.tasks.filter(function (t) { return t.groupId === g.id; }).length;
    col.innerHTML =
      '<div class="col-head"><h2>' + esc(g.name) + '</h2><span class="count">' + total + '</span>' +
      '<div class="menu"><button class="icon-btn" data-act="menu" title="Tùy chọn nhóm">⋯</button><div class="menu-list">' +
      '<button data-act="edit-group">✎ Đổi tên / màu</button>' +
      (gi > 0 ? '<button data-act="left">← Chuyển sang trái</button>' : '') +
      (gi < state.groups.length - 1 ? '<button data-act="right">→ Chuyển sang phải</button>' : '') +
      '<button class="del" data-act="del-group">🗑 Xóa nhóm</button></div></div></div>' +
      '<div class="main-box"><div class="zone-label"><span>★ Việc chính</span><button data-act="add-main" title="Thêm việc chính">＋</button></div>' +
      '<div class="zone" data-group="' + g.id + '" data-level="main"></div></div>' +
      '<div class="sub-wrap"><div class="zone-label"><span>Việc khác</span></div>' +
      '<div class="zone" data-group="' + g.id + '" data-level="sub"></div></div>' +
      '<button class="add-row" data-act="add-sub">＋ Thêm việc</button>';

    col.querySelectorAll('.zone').forEach(function (zone) {
      var level = zone.dataset.level;
      var list = zoneTasks(g.id, level).filter(matches);
      if (!list.length) {
        zone.innerHTML = '<div class="empty">' + (level === 'main' ? 'Kéo việc vào đây để đánh dấu việc chính' : 'Chưa có việc — kéo thả hoặc bấm “Thêm việc”') + '</div>';
      }
      list.forEach(function (t) { zone.appendChild(renderCard(t)); });
      bindZone(zone);
    });

    col.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.dataset.act;
      if (act === 'menu') {
        e.stopPropagation();
        var m = b.parentNode, open = m.classList.contains('open');
        closeMenus(); if (!open) m.classList.add('open');
        return;
      }
      closeMenus();
      if (act === 'add-main') openTaskModal(null, g.id, 'main');
      if (act === 'add-sub') openTaskModal(null, g.id, 'sub');
      if (act === 'edit-group') openGroupModal(g.id);
      if (act === 'left' || act === 'right') moveGroup(g.id, act === 'left' ? -1 : 1);
      if (act === 'del-group') {
        askConfirm('Xóa nhóm “' + g.name + '”' + (total ? ' cùng ' + total + ' công việc trong nhóm' : '') + '? Không thể hoàn tác.', function () {
          if (state.groups.length === 1) { toast('Phải giữ lại ít nhất 1 nhóm', true); return; }
          state.groups = state.groups.filter(function (x) { return x.id !== g.id; });
          state.tasks = state.tasks.filter(function (t) { return t.groupId !== g.id; });
          commit(); toast('Đã xóa nhóm ' + g.name);
        });
      }
    });
    return col;
  }

  function renderCard(t) {
    var el = document.createElement('div');
    el.className = 'card' + (t.level === 'main' ? ' main' : '') + (t.status === 'done' ? ' done' : '');
    el.draggable = true;
    el.dataset.id = t.id;
    var tags = [];
    if (t.priority === 'urgent') tags.push('<span class="tag urgent">Khẩn</span>');
    if (t.priority === 'high') tags.push('<span class="tag high">Quan trọng</span>');
    if (t.status === 'doing') tags.push('<span class="tag doing">Đang làm</span>');
    if (t.deadline) tags.push('<span class="tag' + (isLate(t) ? ' late' : '') + '">' + (isLate(t) ? '⚠ Quá hạn ' : '⏱ ') + vnDate(t.deadline) + '</span>');
    el.innerHTML =
      '<input type="checkbox" title="Đánh dấu hoàn thành"' + (t.status === 'done' ? ' checked' : '') + '>' +
      '<div class="card-body"><div class="title">' + esc(t.title) + '</div>' +
      (t.detail ? '<div class="detail">' + esc(t.detail) + '</div>' : '') +
      '<div class="meta">' + tags.join('') + '</div></div>' +
      '<div class="card-actions"><button class="icon-btn" data-a="edit" title="Sửa">✎</button><button class="icon-btn del" data-a="del" title="Xóa">🗑</button></div>';

    el.querySelector('input').addEventListener('change', function (e) {
      t.status = e.target.checked ? 'done' : 'todo'; t.updatedAt = stamp(); commit();
    });
    el.addEventListener('click', function (e) {
      if (e.target.matches('input')) return;
      var a = e.target.closest('[data-a]');
      if (a && a.dataset.a === 'del') { deleteTask(t.id); return; }
      openTaskModal(t.id);
    });
    el.addEventListener('dragstart', function (e) {
      state.dragId = t.id;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', t.id); } catch (x) {}
      setTimeout(function () { el.classList.add('dragging'); }, 0);
    });
    el.addEventListener('dragend', function () {
      el.classList.remove('dragging'); state.dragId = null; clearDrop();
    });
    return el;
  }

  /* ------------------------------ Kéo thả ------------------------------ */
  var placeholder = document.createElement('div');
  placeholder.className = 'placeholder';

  function clearDrop() {
    placeholder.remove();
    document.querySelectorAll('.zone.over').forEach(function (z) { z.classList.remove('over'); });
  }
  function bindZone(zone) {
    zone.addEventListener('dragover', function (e) {
      if (!state.dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.zone.over').forEach(function (z) { if (z !== zone) z.classList.remove('over'); });
      zone.classList.add('over');
      var cards = Array.prototype.slice.call(zone.querySelectorAll('.card:not(.dragging)'));
      var before = null;
      for (var i = 0; i < cards.length; i++) {
        var r = cards[i].getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { before = cards[i]; break; }
      }
      var empty = zone.querySelector('.empty');
      if (empty) empty.style.display = 'none';
      if (before) zone.insertBefore(placeholder, before); else zone.appendChild(placeholder);
    });
    zone.addEventListener('dragleave', function (e) {
      if (!zone.contains(e.relatedTarget)) {
        zone.classList.remove('over');
        var empty = zone.querySelector('.empty');
        if (empty) empty.style.display = '';
        if (placeholder.parentNode === zone) placeholder.remove();
      }
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      var id = state.dragId || e.dataTransfer.getData('text/plain');
      if (!id) return;
      var next = placeholder.nextElementSibling;
      while (next && (!next.classList.contains('card') || next.classList.contains('dragging'))) next = next.nextElementSibling;
      moveTask(id, zone.dataset.group, zone.dataset.level, next ? next.dataset.id : null);
      clearDrop();
    });
  }

  function moveTask(id, gid, level, beforeId) {
    var t = taskById(id);
    if (!t) return;
    var list = zoneTasks(gid, level).filter(function (x) { return x.id !== id; });
    var idx = beforeId ? list.findIndex(function (x) { return x.id === beforeId; }) : -1;
    if (idx < 0) idx = list.length;
    list.splice(idx, 0, t);
    var changed = t.groupId !== gid || t.level !== level;
    t.groupId = gid; t.level = level;
    list.forEach(function (x, i) { x.order = i + 1; });
    t.updatedAt = stamp();
    commit();
    if (changed) toast('Đã chuyển “' + t.title + '” → ' + groupById(gid).name + (level === 'main' ? ' (việc chính)' : ''));
  }

  function moveGroup(id, dir) {
    var i = state.groups.findIndex(function (g) { return g.id === id; });
    var j = i + dir;
    if (j < 0 || j >= state.groups.length) return;
    var tmp = state.groups[i]; state.groups[i] = state.groups[j]; state.groups[j] = tmp;
    commit();
  }

  /* ------------------------------ Modal công việc ------------------------------ */
  function openModal(id) { $(id).classList.add('show'); }
  function closeModal(el) { el.classList.remove('show'); }
  document.querySelectorAll('.backdrop').forEach(function (bd) {
    bd.addEventListener('mousedown', function (e) { if (e.target === bd) closeModal(bd); });
    bd.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { closeModal(bd); }); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') document.querySelectorAll('.backdrop.show').forEach(closeModal);
  });
  function closeMenus() { document.querySelectorAll('.menu.open').forEach(function (m) { m.classList.remove('open'); }); }
  document.addEventListener('click', closeMenus);

  function openTaskModal(taskId, gid, level) {
    var t = taskId ? taskById(taskId) : null;
    state.editingTaskId = t ? t.id : null;
    $('taskModalTitle').textContent = t ? 'Sửa công việc' : 'Thêm công việc';
    $('deleteTaskBtn').style.display = t ? '' : 'none';
    $('fGroup').innerHTML = state.groups.map(function (g) { return '<option value="' + g.id + '">' + esc(g.name) + '</option>'; }).join('');
    $('fTitle').value = t ? t.title : '';
    $('fGroup').value = t ? t.groupId : (gid || state.groups[0].id);
    document.querySelector('input[name=fLevel][value=' + (t ? t.level : (level || 'sub')) + ']').checked = true;
    $('fDeadline').value = t ? t.deadline : '';
    $('fStatus').value = t ? t.status : 'todo';
    $('fPriority').value = t ? t.priority : 'normal';
    $('fDetail').value = t ? t.detail : '';
    openModal('taskModal');
    setTimeout(function () { $('fTitle').focus(); }, 50);
  }

  $('taskForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var title = $('fTitle').value.trim();
    if (!title) return;
    var data = {
      title: title, groupId: $('fGroup').value,
      level: document.querySelector('input[name=fLevel]:checked').value,
      deadline: $('fDeadline').value, status: $('fStatus').value,
      priority: $('fPriority').value, detail: $('fDetail').value.trim(), updatedAt: stamp()
    };
    var t = state.editingTaskId && taskById(state.editingTaskId);
    if (t) {
      var moved = t.groupId !== data.groupId || t.level !== data.level;
      Object.assign(t, data);
      if (moved) t.order = zoneTasks(data.groupId, data.level).length + 1;
      toast('Đã cập nhật công việc');
    } else {
      data.id = uid('t'); data.createdAt = stamp();
      data.order = zoneTasks(data.groupId, data.level).reduce(function (m, x) { return Math.max(m, x.order || 0); }, 0) + 1;
      state.tasks.push(data);
      toast('Đã thêm công việc mới');
    }
    closeModal($('taskModal'));
    commit();
  });

  $('deleteTaskBtn').addEventListener('click', function () {
    var id = state.editingTaskId;
    closeModal($('taskModal'));
    deleteTask(id);
  });

  function deleteTask(id) {
    var t = taskById(id);
    if (!t) return;
    askConfirm('Xóa công việc “' + t.title + '”?', function () {
      state.tasks = state.tasks.filter(function (x) { return x.id !== id; });
      commit(); toast('Đã xóa công việc');
    });
  }

  function askConfirm(text, fn, okLabel) {
    $('confirmText').textContent = text;
    $('confirmOk').textContent = okLabel || 'Xóa';
    confirmAction = fn;
    openModal('confirmModal');
  }
  $('confirmOk').addEventListener('click', function () {
    closeModal($('confirmModal'));
    if (confirmAction) confirmAction();
    confirmAction = null;
  });

  /* ------------------------------ Modal nhóm ------------------------------ */
  $('swatches').innerHTML = COLORS.map(function (c, i) {
    return '<label style="background:' + c + '" title="' + c + '"><input type="radio" name="gColor" value="' + c + '"' + (i === 0 ? ' checked' : '') + '></label>';
  }).join('');

  function openGroupModal(gid) {
    var g = gid ? groupById(gid) : null;
    state.editingGroupId = g ? g.id : null;
    $('groupModalTitle').textContent = g ? 'Sửa nhóm công việc' : 'Thêm nhóm công việc';
    $('gName').value = g ? g.name : '';
    var color = g ? g.color : COLORS[state.groups.length % COLORS.length];
    var radio = document.querySelector('input[name=gColor][value="' + color + '"]') || document.querySelector('input[name=gColor]');
    radio.checked = true;
    openModal('groupModal');
    setTimeout(function () { $('gName').focus(); }, 50);
  }
  $('groupForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('gName').value.trim();
    if (!name) return;
    var dup = state.groups.some(function (g) { return norm(g.name) === norm(name) && g.id !== state.editingGroupId; });
    if (dup) { toast('Đã có nhóm tên “' + name + '”', true); return; }
    var color = document.querySelector('input[name=gColor]:checked').value;
    var g = state.editingGroupId && groupById(state.editingGroupId);
    if (g) { g.name = name; g.color = color; toast('Đã cập nhật nhóm'); }
    else { state.groups.push({ id: uid('g'), name: name, color: color, createdAt: stamp() }); toast('Đã thêm nhóm ' + name); }
    closeModal($('groupModal'));
    commit();
  });

  /* ------------------------------ Đồng bộ UI ------------------------------ */
  $('syncBtn').addEventListener('click', function () { $('apiInput').value = state.api; setSync(state.sync, $('syncLabel').textContent); openModal('syncModal'); });
  $('saveApiBtn').addEventListener('click', function () {
    var url = $('apiInput').value.trim();
    if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url)) { toast('URL phải bắt đầu bằng https://script.google.com/...', true); return; }
    state.api = url; store(API_KEY, url);
    closeModal($('syncModal'));
    pull('connect');
  });
  $('pullBtn').addEventListener('click', function () {
    if (!state.api) { toast('Chưa nhập URL Apps Script', true); return; }
    if (state.dirty) {
      askConfirm('Trên máy có thay đổi chưa lưu lên Sheet. Tải lại từ Sheet sẽ bỏ các thay đổi đó?', function () { closeModal($('syncModal')); pull(true); }, 'Tải lại');
      return;
    }
    closeModal($('syncModal')); pull(true);
  });
  $('disconnectBtn').addEventListener('click', function () {
    state.api = ''; store(API_KEY, 'off'); setSync('local', 'Chỉ lưu trên máy'); closeModal($('syncModal')); toast('Đã ngắt kết nối Google Sheet');
  });

  /* ------------------------------ Khác ------------------------------ */
  $('newTaskBtn').addEventListener('click', function () { openTaskModal(null); });
  $('newGroupBtn').addEventListener('click', function () { openGroupModal(null); });
  $('search').addEventListener('input', function (e) { state.search = e.target.value.trim(); render(); });
  $('hideDone').addEventListener('change', function (e) { state.hideDone = e.target.checked; store('PCVT_DAU_VIEC_HIDE', e.target.checked ? '1' : '0'); render(); });
  $('exportBtn').addEventListener('click', exportCsv);

  function exportCsv() {
    var LV = { main: 'Việc chính', sub: 'Việc khác' }, ST = { todo: 'Chưa làm', doing: 'Đang làm', done: 'Hoàn thành' }, PR = { normal: 'Bình thường', high: 'Quan trọng', urgent: 'Khẩn' };
    var rows = [['STT', 'Nhóm', 'Cấp độ', 'Tên công việc', 'Nội dung chi tiết', 'Thời hạn', 'Trạng thái', 'Ưu tiên', 'Cập nhật']];
    var n = 0;
    state.groups.forEach(function (g) {
      ['main', 'sub'].forEach(function (lv) {
        zoneTasks(g.id, lv).forEach(function (t) {
          rows.push([++n, g.name, LV[lv], t.title, t.detail, vnDate(t.deadline), ST[t.status], PR[t.priority], t.updatedAt || '']);
        });
      });
    });
    var csv = rows.map(function (r) { return r.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'Quan_ly_dau_viec_' + todayIso() + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // Đồng bộ giữa các tab trên cùng máy
  window.addEventListener('storage', function (e) {
    if (e.key === STORE_KEY && e.newValue) { loadLocal(); render(); }
  });
  // Tự tải bản mới từ Sheet khi quay lại tab / mỗi 60 giây
  document.addEventListener('visibilitychange', function () { if (!document.hidden && state.api && !state.dirty) pull(false); });
  setInterval(function () { if (!document.hidden && state.api && !state.dirty && !state.dragId && !document.querySelector('.backdrop.show')) pull(false); }, 60000);
  window.addEventListener('beforeunload', function (e) { if (state.api && state.dirty && state.sync === 'busy') { e.preventDefault(); e.returnValue = ''; } });

  /* ------------------------------ Khởi động ------------------------------ */
  (function init() {
    var qs = new URLSearchParams(location.search).get('api');
    if (qs) store(API_KEY, qs);
    var saved = store(API_KEY);
    state.api = qs || (saved === 'off' ? '' : (saved || DEFAULT_API));
    state.hideDone = store('PCVT_DAU_VIEC_HIDE') === '1';
    $('hideDone').checked = state.hideDone;
    loadLocal();
    saveLocal();
    render();
    if (state.api) pull(false); else setSync('local', 'Chỉ lưu trên máy');
  })();
})();
