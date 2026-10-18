// Hudson: two-week personal schedule + Scott lunch (no Classroom).
(function () {
  'use strict';
  var D = window.DATA;
  var KID = 'otto';
  var V = { el: null, lunchByDate: {}, pending: {}, bound: false };
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function kidEvents() {
    return (D.events || []).filter(function (e) {
      return e && Array.isArray(e.people) && e.people.indexOf(KID) > -1;
    });
  }

  function weekStart(d) {
    var x = App.dayStart(d);
    x.setDate(x.getDate() - x.getDay());
    return x;
  }

  function eventChipMeta(e) {
    if (e.allDay) return 'All day';
    if (!e.start || Number.isNaN(+e.start)) return '';
    return App.fmt.time(e.start, false) + ' ' + App.fmt.ampm(e.start);
  }

  function weekRow(start, byDay, offset, now) {
    var cols = '';
    for (var i = 0; i < 7; i++) {
      var d = App.addDays(start, offset + i);
      var items = byDay[offset + i] || [];
      var isToday = App.sameDay(d, now);
      var isPast = App.dayStart(d) < App.dayStart(now);
      var chips = items.length
        ? items.map(function (e) {
          var meta = eventChipMeta(e);
          return '<button type="button" class="cl-chip" data-ev="' + App.esc(e.id) + '">' +
            '<b>' + App.esc(e.title) + '</b>' +
            (meta ? '<small>' + App.esc(meta) + '</small>' : '') +
            '</button>';
        }).join('')
        : '<div class="cl-chip-free serif"><i>Free</i></div>';
      cols += '<div class="cl-day' + (isToday ? ' is-today' : '') + (isPast ? ' is-past' : '') + '">' +
        '<div class="cl-day-head">' +
        '<b>' + DOW[d.getDay()] + '</b>' +
        '<span class="num">' + d.getDate() + '</span></div>' +
        '<div class="cl-day-list">' + chips + '</div></div>';
    }
    return '<div class="cl-week">' + cols + '</div>';
  }

  function weekCalendar(list) {
    var start = weekStart(App.now());
    var now = App.now();
    var byDay = {};
    for (var i = 0; i < 14; i++) byDay[i] = [];

    list.forEach(function (e) {
      if (!e.start || Number.isNaN(+e.start)) return;
      var day = App.dayStart(e.start);
      var idx = Math.round((day - start) / 864e5);
      if (idx < 0 || idx > 13) return;
      byDay[idx].push(e);
    });

    for (var j = 0; j < 14; j++) {
      byDay[j].sort(function (a, b) {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return +a.start - +b.start;
      });
    }

    var end = App.addDays(start, 13);
    var weekLabel = App.fmt.monthShort(start) + ' ' + start.getDate() +
      ' – ' + App.fmt.monthShort(end) + ' ' + end.getDate();

    return '<div class="cl-panel cl-panel--week">' +
      '<div class="cl-panel-head">' +
      '<span class="label">Schedule</span>' +
      '<span class="cl-week-range">' + App.esc(weekLabel) + '</span></div>' +
      '<div class="cl-weeks">' +
      weekRow(start, byDay, 0, now) +
      '<div class="cl-week-sub label">Next week</div>' +
      weekRow(start, byDay, 7, now) +
      '</div></div>';
  }

  function lunchData() {
    return (D.lunch && D.lunch[KID]) || { school: 'Scott', days: [] };
  }

  function parseLunchDate(key) {
    var p = String(key || '').split('-');
    if (p.length !== 3) return null;
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return Number.isNaN(+d) ? null : d;
  }

  function lunchDayKey(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function lunchDays() {
    var lunch = lunchData();
    var byKey = {};
    (lunch.days || []).forEach(function (day) {
      if (!day || !day.date) return;
      byKey[day.date] = {
        date: day.date,
        entrees: Array.isArray(day.entrees) ? day.entrees.filter(Boolean) : [],
      };
    });
    return byKey;
  }

  function schoolDaysAhead(from, count) {
    var out = [];
    var d = App.dayStart(from);
    for (var i = 0; i < 21 && out.length < count; i++) {
      var x = App.addDays(d, i);
      var dow = x.getDay();
      if (dow === 0 || dow === 6) continue;
      out.push(x);
    }
    return out;
  }

  function heroLunchDay(byKey, now) {
    var candidates = schoolDaysAhead(now, 10);
    for (var i = 0; i < candidates.length; i++) {
      var key = lunchDayKey(candidates[i]);
      var day = byKey[key];
      if (day && day.entrees && day.entrees.length) {
        return { date: candidates[i], key: key, entrees: day.entrees, isToday: i === 0 && App.sameDay(candidates[i], now) };
      }
    }
    if (candidates.length) {
      return {
        date: candidates[0],
        key: lunchDayKey(candidates[0]),
        entrees: (byKey[lunchDayKey(candidates[0])] || {}).entrees || [],
        isToday: App.sameDay(candidates[0], now),
      };
    }
    return null;
  }

  function truncateEntrees(list, max) {
    max = max || 3;
    var names = list.slice(0, max);
    var extra = list.length - names.length;
    return { names: names, extra: extra > 0 ? extra : 0 };
  }

  function lunchSheet(day) {
    if (!day) return;
    var p = App.person(KID);
    var d = parseLunchDate(day.date) || new Date();
    var items = (day.entrees || []).map(function (name) {
      return '<li>' + App.esc(name) + '</li>';
    }).join('');
    App.sheet(
      '<div class="cl-sheet" style="' + App.pstyle(p) + '">' +
      '<div class="cl-sheet-band">' +
      '<div class="label label--on">Lunch</div>' +
      '<h2 class="serif">' + App.esc(DOW_FULL[d.getDay()]) + '</h2>' +
      '<div class="cl-lunch-sheet-date">' + App.esc(App.fmt.monthShort(d) + ' ' + d.getDate()) + '</div>' +
      '</div>' +
      '<div class="cl-sheet-body">' +
      (items
        ? '<ul class="cl-lunch-sheet-list">' + items + '</ul>'
        : '<div class="cl-none serif"><i>No lunch menu yet.</i></div>') +
      '</div></div>',
      { cls: 'sheet--chloe' }
    );
  }

  function lunchPanel() {
    V.lunchByDate = {};
    var lunch = lunchData();
    var byKey = lunchDays();
    var now = App.now();
    var hero = heroLunchDay(byKey, now);
    var school = lunch.school || 'Scott';

    if (!hero) {
      return '<div class="cl-panel cl-lunch">' +
        '<div class="cl-panel-head"><span class="label">Lunch · ' + App.esc(school) + '</span></div>' +
        '<div class="cl-none serif"><i>No lunch menu yet.</i></div></div>';
    }

    V.lunchByDate[hero.key] = { date: hero.key, entrees: hero.entrees };
    var heroLabel = hero.isToday ? 'Today' : DOW_FULL[hero.date.getDay()];
    var heroList = hero.entrees.length
      ? '<ul class="cl-lunch-hero-list">' + hero.entrees.map(function (n) {
        return '<li>' + App.esc(n) + '</li>';
      }).join('') + '</ul>'
      : '<div class="cl-none serif"><i>No lunch menu yet.</i></div>';

    var upcoming = [];
    schoolDaysAhead(now, 8).forEach(function (d) {
      var key = lunchDayKey(d);
      if (key === hero.key) return;
      var day = byKey[key] || { date: key, entrees: [] };
      if (!day.entrees.length && App.dayStart(d) < App.dayStart(hero.date)) return;
      V.lunchByDate[key] = { date: key, entrees: day.entrees || [] };
      upcoming.push({ date: d, key: key, entrees: day.entrees || [] });
    });
    upcoming = upcoming.slice(0, 5);

    var rows = upcoming.map(function (u) {
      var trunc = truncateEntrees(u.entrees, 2);
      var preview = trunc.names.length
        ? App.esc(trunc.names.join(' · ')) + (trunc.extra ? ' <span class="cl-lunch-more">+' + trunc.extra + '</span>' : '')
        : '<i class="cl-lunch-empty">No menu</i>';
      return '<button type="button" class="cl-lunch-row" data-lunch-date="' + App.esc(u.key) + '">' +
        '<span class="cl-lunch-dow">' + App.esc(DOW[u.date.getDay()]) + '</span>' +
        '<span class="cl-lunch-preview">' + preview + '</span></button>';
    }).join('');

    return '<div class="cl-panel cl-lunch" style="' + App.pstyle(App.person(KID)) + '">' +
      '<div class="cl-panel-head"><span class="label">Lunch · ' + App.esc(school) + '</span></div>' +
      '<button type="button" class="cl-lunch-hero" data-lunch-date="' + App.esc(hero.key) + '">' +
      '<div class="cl-lunch-hero-label">' + App.esc(heroLabel) + '</div>' +
      '<div class="cl-lunch-hero-date num">' + App.esc(App.fmt.monthShort(hero.date) + ' ' + hero.date.getDate()) + '</div>' +
      heroList +
      '</button>' +
      (rows
        ? '<div class="cl-lunch-upcoming"><div class="cl-lunch-up-label label">Upcoming</div>' + rows + '</div>'
        : '') +
      '</div>';
  }

  function todoList() {
    var r = App.currentRoutine();
    return (D.chores || []).filter(function (c) {
      return c.who === KID && c.r === r.id;
    }).sort(function (a, b) {
      return (a.done - b.done) || ((b.overdue ? 1 : 0) - (a.overdue ? 1 : 0));
    });
  }

  function todoPanel() {
    var r = App.currentRoutine();
    var list = todoList();
    var done = list.filter(function (c) { return c.done; }).length;
    var rows = list.length
      ? list.map(function (c) {
        var pend = V.pending[c.id];
        return '<button type="button" class="ch' + (c.done ? ' is-done' : '') + (pend ? ' is-checking' : '') +
          (c.overdue && !c.done ? ' is-overdue' : '') + '" data-ch="' + App.esc(c.id) + '">' +
          '<span class="ch-emoji">' + (c.emoji || '✅') +
          '<span class="ch-check"><svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span></span>' +
          '<span class="ch-text"><b>' + App.esc(c.title) + '</b>' +
          (c.overdue && !c.done ? '<small class="ch-late">Overdue</small>' : '') +
          '</span></button>';
      }).join('')
      : '<div class="cl-none serif"><i>Nothing for ' + App.esc(r.name.toLowerCase()) + '.</i></div>';

    return '<div class="cl-panel cl-todos" style="' + App.pstyle(App.person(KID)) + '">' +
      '<div class="cl-panel-head">' +
      '<span class="label">To-do · ' + App.esc(r.name) + '</span>' +
      (list.length ? '<span class="cl-count num">' + done + '/' + list.length + '</span>' : '') +
      '</div>' +
      '<div class="cl-todo-list">' + rows + '</div></div>';
  }

  function toggleTodo(id, btn) {
    var c = (D.chores || []).filter(function (x) { return x.id === id; })[0];
    if (!c || V.pending[c.id]) return;
    if (c.done) {
      c.done = false;
      delete c.doneBy;
      if (App.pushChoreToggle) App.pushChoreToggle(c);
      paint();
      App.emit('data');
      return;
    }
    V.pending[c.id] = true;
    if (btn) btn.classList.add('is-checking');
    setTimeout(function () {
      delete V.pending[c.id];
      c.done = true;
      c.doneBy = KID;
      if (App.pushChoreToggle) App.pushChoreToggle(c);
      paint();
      App.emit('data');
    }, 350);
  }

  function paint() {
    var p = App.person(KID);
    V.el.innerHTML = '<div class="chloe">' +
      '<header class="cl-head" style="' + App.pstyle(p) + '">' +
      App.avatar(p, 56) +
      '<div class="cl-title"><div class="label">School · Schedule</div>' +
      '<h1 class="serif">' + App.esc(p.name) + '</h1></div>' +
      '</header>' +
      '<div class="cl-body">' +
      '<div class="cl-main" style="' + App.pstyle(p) + '">' +
      weekCalendar(kidEvents()) +
      '</div>' +
      '<aside class="cl-side">' + lunchPanel() + todoPanel() + '</aside>' +
      '</div></div>';
  }

  function onClick(e) {
    var lunch = e.target.closest('[data-lunch-date]');
    if (lunch && V.el.contains(lunch)) {
      lunchSheet(V.lunchByDate[lunch.getAttribute('data-lunch-date')]);
      return;
    }
    var ch = e.target.closest('[data-ch]');
    if (ch && V.el.contains(ch)) {
      toggleTodo(ch.getAttribute('data-ch'), ch);
      return;
    }
    var t = e.target.closest('[data-ev]');
    if (!t || !V.el.contains(t)) return;
    App.eventSheet(App.findEvent(t.getAttribute('data-ev')));
  }

  App.register('hudson', {
    minutely: true,
    show: function (el) {
      V.el = el;
      if (!V.bound) {
        el.addEventListener('click', onClick);
        V.bound = true;
      }
      paint();
    }
  });
  App.on('data', function () { if (App.current === 'hudson') paint(); });
  App.on('minute', function () { if (App.current === 'hudson' && V.el) paint(); });
})();
