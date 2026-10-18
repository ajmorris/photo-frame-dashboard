// Polls worker APIs and keeps window.DATA in sync. No-ops when routes are unavailable (plain vite).
(function () {
  'use strict';
  var D = window.DATA;
  var POLL = 60 * 1000;

  function get(path, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', path);
    xhr.onload = function () {
      if (xhr.status !== 200) return;
      try { cb(JSON.parse(xhr.responseText)); } catch (e) {}
    };
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
  });
})();
