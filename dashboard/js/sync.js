// Polls worker APIs and keeps window.DATA in sync. No-ops when routes are unavailable (plain vite).
(function () {
  'use strict';
  var D = window.DATA;
  var POLL = 60 * 1000;
  var CLASSROOM_POLL = 5 * 60 * 1000;
  var LUNCH_POLL = 30 * 60 * 1000;
  var CLASSROOM_KID = 'maya';
  var CLASSROOM_KEY = 'homehq.classroom.' + CLASSROOM_KID + '.v2';
  var LUNCH_KEY = 'homehq.lunch.v1';

  function get(path, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', path);
    xhr.onload = function () {
      if (xhr.status !== 200) return;
      try { cb(JSON.parse(xhr.responseText)); } catch (e) {}
    };
    xhr.send();
  }

  function getAny(path, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', path);
    xhr.onload = function () {
      try { cb(xhr.status, JSON.parse(xhr.responseText)); } catch (e) {}
    };
    xhr.onerror = function () {};
    xhr.send();
  }

  function post(path, body, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.onload = function () {
      if (xhr.status < 200 || xhr.status >= 300) return;
      try { cb && cb(JSON.parse(xhr.responseText)); } catch (e) { cb && cb(null); }
    };
    xhr.send(JSON.stringify(body));
  }
  App.apiPost = post;

  function applyPresence(body) {
    if (!body || !body.people) return;
    D.people.forEach(function (p) {
      var s = body.people[p.id];
      if (!s) return;
      p.home = !!s.home;
      p.status = s.status || '';
      p.eta = s.eta == null ? null : s.eta;
      p.updatedAt = s.updatedAt || null;
    });
    App.emit('data');
  }

  function applyWeather(body) {
    if (!body || !body.t) return;
    D.weather.hi = body.hi;
    D.weather.lo = body.lo;
    D.weather.t = body.t;
    D.weather.c = body.c;
    D.weather.p = body.p;
    App.emit('data');
  }

  function applyChores(body) {
    if (!body || !body.chores) return;
    D.chores.length = 0;
    body.chores.forEach(function (c) { D.chores.push(c); });
    if (body.kidDefaults) D.kidDefaults = body.kidDefaults;
    App.emit('data');
  }

  function applyShopping(body) {
    if (!body || !body.shopping) return;
    D.groceries.length = 0;
    body.shopping.forEach(function (g) { D.groceries.push(g); });
    App.emit('data');
  }

  function ensureClassroom() {
    if (!D.classroom) D.classroom = {};
    if (!D.classroom[CLASSROOM_KID]) {
      D.classroom[CLASSROOM_KID] = {
        configured: false,
        pastDue: [],
        due: [],
        truncated: { pastDue: 0, due: 0 },
      };
    }
    return D.classroom[CLASSROOM_KID];
  }

  function applyClassroom(status, body) {
    if (!body || body.kid !== CLASSROOM_KID) return;
    var cur = ensureClassroom();
    if (body.configured === false) {
      cur.configured = false;
      App.emit('data');
      return;
    }
    if (status !== 200) return;
    if (!Array.isArray(body.pastDue) || !Array.isArray(body.due)) return;
    cur.configured = true;
    cur.fetchedAt = body.fetchedAt || null;
    cur.pastDue = body.pastDue;
    cur.due = body.due;
    cur.truncated = body.truncated || { pastDue: 0, due: 0 };
    try { localStorage.setItem(CLASSROOM_KEY, JSON.stringify(cur)); } catch (e) {}
    App.emit('data');
  }

  function loadClassroomCache() {
    try {
      var cached = JSON.parse(localStorage.getItem(CLASSROOM_KEY) || 'null');
      if (!cached || !Array.isArray(cached.pastDue)) return;
      var cur = ensureClassroom();
      cur.configured = cached.configured !== false;
      cur.fetchedAt = cached.fetchedAt || null;
      cur.pastDue = cached.pastDue;
      cur.due = cached.due || [];
      cur.truncated = cached.truncated || { pastDue: 0, due: 0 };
      App.emit('data');
    } catch (e) {}
  }

  function tickClassroom() {
    getAny('/api/classroom?kid=' + CLASSROOM_KID, applyClassroom);
  }

  function applyLunch(status, body) {
    if (status !== 200 || !body || !Array.isArray(body.days)) return;
    D.lunch = {
      school: body.school || 'Herbison Woods',
      menuType: body.menuType || null,
      source: body.source || 'nutrislice',
      fetchedAt: body.fetchedAt || null,
      days: body.days,
    };
    try { localStorage.setItem(LUNCH_KEY, JSON.stringify(D.lunch)); } catch (e) {}
    App.emit('data');
  }

  function loadLunchCache() {
    try {
      var cached = JSON.parse(localStorage.getItem(LUNCH_KEY) || 'null');
      if (!cached || !Array.isArray(cached.days)) return;
      D.lunch = cached;
      App.emit('data');
    } catch (e) {}
  }

  function tickLunch() {
    getAny('/api/lunch', applyLunch);
  }

  App.pushShopping = function () {
    post('/api/shopping', { action: 'replace', shopping: D.groceries });
  };
  App.pushChoreToggle = function (c) {
    post('/api/chores', { action: 'setDone', id: c.id, done: !!c.done, doneBy: c.doneBy || null }, function (body) {
      if (body) applyChores(body);
    });
  };

  function tick() {
    get('/api/presence', applyPresence);
    get('/api/weather', applyWeather);
    get('/api/chores', applyChores);
    get('/api/shopping', applyShopping);
  }

  App.on('ready', function () {
    tick();
    setInterval(tick, POLL);
    loadClassroomCache();
    tickClassroom();
    setInterval(tickClassroom, CLASSROOM_POLL);
    loadLunchCache();
    tickLunch();
    setInterval(tickLunch, LUNCH_POLL);
  });
})();
