// Home / Today: bento overview. Never scrolls.
// Shared next-school-day lunch when menus match; one open-task list per kid.
(function () {
  'use strict';
  var D = window.DATA, V = { pending: {} };
  var KIDS = [
    { id: 'maya', view: 'chloe', label: 'School · Classroom' },
    { id: 'otto', view: 'hudson', label: 'School · Schedule' },
  ];
  var AGENDA_MAX = 2;
  var ASSIGN_MAX = 2;
  var EVENT_MAX = 2;
  var LUNCH_MAX = 4;
  var TASK_MAX = 7;

  function ring(done, total, size) {
    var r = size / 2 - 5, c = 2 * Math.PI * r, f = total ? done / total : 0;
    return '<svg class="ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="ring-bg"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="ring-fg" stroke-dasharray="' + (c * f) + ' ' + c + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>';
  }
  App.ring = ring;

  function clock() {
    var n = App.now();
    return '<div class="h-time num">' + App.fmt.time(n, false) + '<span class="h-ampm">' + App.fmt.ampm(n) + '</span></div>' +
      '<div class="h-date"><b>' + App.fmt.day(n) + '</b> ' + App.fmt.month(n) + ' ' + n.getDate() + '</div>';
  }

  function weather() {
    var w = App.weatherNow();
    return '<div class="h-wx">' +
      '<span class="h-wx-icon">' + App.icon(w.cond, 42) + '</span>' +
      '<span class="h-wx-temp num">' + w.temp + '°</span>' +
      '<span class="h-wx-meta">' +
      '<b>' + App.esc(w.label) + '</b>' +
      '<span>H ' + w.hi + '° · L ' + w.lo + '°</span>' +
      '</span>' +
      '<em class="h-wx-advice">' + App.esc(w.advice) + '</em>' +
      '</div>';
  }

  function dayKey(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function cleanTitle(raw) {
    return String(raw || '').replace(/\s+/g, ' ').trim().replace(/^assignment\s*/i, '');
  }

  function cleanCourse(raw) {
    return String(raw || '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s*-\s*\d{4}\/\d{4}\s*$/g, '')
      .replace(/\s*Posted\b.*$/i, '')
      .replace(/\s*-\s*/g, ' · ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ---- today agenda
  function agendaItems() {
    var now = App.now();
    var allDay = App.allDayOn(now);
    var timed = App.timedOn(now).filter(function (e) { return e.end > now; });
    return allDay.concat(timed);
  }

  function agenda() {
    var now = App.now();
    var list = agendaItems();
    var shown = list.slice(0, AGENDA_MAX);
    var more = list.length - shown.length;
    var rows = shown.length
      ? shown.map(function (e) {
        var cur = !e.allDay && e.start <= now;
        var when = e.allDay ? 'All day' : (cur ? 'Now' : App.fmt.time(e.start, false));
        return '<button type="button" class="h-ag-row' + (cur ? ' is-now' : '') + '" data-ev="' + App.esc(e.id) + '">' +
          '<span class="h-ag-t">' + App.esc(when) + '</span>' +
          '<span class="h-ag-n">' + App.esc(e.title) + '</span></button>';
      }).join('')
      : '<div class="h-ag-empty">Nothing left today</div>';
    return '<div class="cl-panel-head"><span class="label">Today</span></div>' +
      '<div class="h-ag-list">' + rows + '</div>' +
      (more > 0 ? '<button type="button" class="h-ag-more" data-go="calendar">+' + more + ' more</button>' : '');
  }

  // ---- data helpers
  function classroomFor(kid) {
    return (D.classroom && D.classroom[kid]) || {
      configured: false, pastDue: [], due: [], truncated: { pastDue: 0, due: 0 },
    };
  }

  function lunchFor(kid) {
    var lunch = D.lunch || {};
    if (lunch[kid]) return lunch[kid];
    if (kid === 'maya' && Array.isArray(lunch.days)) return lunch;
    return { school: kid === 'otto' ? 'Scott' : 'Herbison Woods', days: [] };
  }

  function lunchEntrees(kid, day) {
    var key = dayKey(day);
    var days = lunchFor(kid).days || [];
    for (var i = 0; i < days.length; i++) {
      if (days[i] && days[i].date === key) {
        return (days[i].entrees || []).filter(Boolean);
      }
    }
    return [];
  }

  // Next weekday on or after `from` (the next school day).
  function nextSchoolDay(from) {
    var d = App.dayStart(from);
    for (var i = 0; i < 8; i++) {
      var x = App.addDays(d, i);
      var dow = x.getDay();
      if (dow !== 0 && dow !== 6) return x;
    }
    return d;
  }

  function sameEntrees(a, b) {
    if (!a.length && !b.length) return true;
    if (a.length !== b.length) return false;
    var sa = a.slice().sort();
    var sb = b.slice().sort();
    for (var i = 0; i < sa.length; i++) {
      if (sa[i] !== sb[i]) return false;
    }
    return true;
  }

  function assignmentsOn(kid, day) {
    if (kid !== 'maya') return [];
    var cl = classroomFor(kid);
    if (cl.configured === false) return [];
    var start = App.dayStart(day);
    return (cl.due || []).filter(function (item) {
      if (!item || !item.due) return false;
      var d = new Date(item.due);
      return !Number.isNaN(+d) && App.sameDay(d, start);
    }).map(function (item) {
      return { id: item.id, title: cleanTitle(item.title), course: cleanCourse(item.course) };
    });
  }

  function pastDueCount(kid) {
    if (kid !== 'maya') return 0;
    var cl = classroomFor(kid);
    if (cl.configured === false) return 0;
    return (cl.pastDue || []).length + ((cl.truncated && cl.truncated.pastDue) || 0);
  }

  function eventsOn(kid, day) {
    return App.allDayOn(day, kid).concat(App.timedOn(day, kid));
  }

  function openTasks(kid) {
    return (D.chores || []).filter(function (c) {
      return c.who === kid && !c.done;
    }).sort(function (a, b) {
      var order = { morning: 0, after: 1, evening: 2 };
      return (order[a.r] || 0) - (order[b.r] || 0) || ((b.overdue ? 1 : 0) - (a.overdue ? 1 : 0));
    });
  }

  // ---- bento tiles
  function dueTile(kid) {
    if (kid !== 'maya') return '';
    var now = App.now();
    var list = assignmentsOn(kid, now);
    var past = pastDueCount(kid);
    var shown = list.slice(0, ASSIGN_MAX);
    var more = list.length - shown.length;
    var hot = shown.length > 0;
    var chips;
    if (shown.length) {
      chips = shown.map(function (a) {
        return '<div class="cl-chip h-due-chip">' +
          '<b>' + App.esc(a.title) + '</b>' +
          (a.course ? '<small>' + App.esc(a.course) + '</small>' : '') +
          '</div>';
      }).join('');
    } else if (past) {
      chips = '<div class="cl-chip h-due-chip is-late"><b>' + past + ' past due</b><small>Open for details</small></div>';
    } else {
      chips = '';
    }
    var empty = !hot && !past;
    return '<div class="cl-panel h-tile h-tile--due' + (hot ? ' is-hot' : '') + (past && !hot ? ' is-late' : '') + (empty ? ' is-empty' : '') + '">' +
      '<div class="cl-panel-head">' +
      '<span class="label">' + (hot ? 'Due today' : (past ? 'Past due' : 'Due')) + '</span>' +
      (empty ? '<span class="h-tile-empty">Nothing due</span>' : '') +
      (hot || past ? '<span class="cl-count num">' + (hot ? list.length : past) + '</span>' : '') +
      '</div>' +
      (chips ? '<div class="h-chip-list">' + chips + '</div>' : '') +
      (more > 0 ? '<div class="h-more-n">+' + more + ' more</div>' : '') +
      '</div>';
  }

  function scheduleTile(kid) {
    if (kid !== 'otto') return '';
    var list = eventsOn(kid, App.now());
    var shown = list.slice(0, EVENT_MAX);
    var more = list.length - shown.length;
    var chips = shown.length
      ? shown.map(function (e) {
        var meta = e.allDay ? 'All day' : App.fmt.time(e.start, false) + ' ' + App.fmt.ampm(e.start);
        return '<button type="button" class="cl-chip" data-ev="' + App.esc(e.id) + '">' +
          '<b>' + App.esc(e.title) + '</b>' +
          '<small>' + App.esc(meta) + '</small></button>';
      }).join('')
      : '';
    var empty = !shown.length;
    return '<div class="cl-panel h-tile h-tile--sched' + (empty ? ' is-empty' : '') + '" style="' + App.pstyle(App.person(kid)) + '">' +
      '<div class="cl-panel-head">' +
      '<span class="label">Schedule</span>' +
      (empty ? '<span class="h-tile-empty">Free today</span>' : '') +
      '</div>' +
      (chips ? '<div class="h-chip-list">' + chips + '</div>' : '') +
      (more > 0 ? '<div class="h-more-n">+' + more + ' more</div>' : '') +
      '</div>';
  }

  function tasksTile(cfg) {
    var p = App.person(cfg.id);
    var list = openTasks(cfg.id);
    var shown = list.slice(0, TASK_MAX);
    var more = list.length - shown.length;
    var rows = shown.length
      ? shown.map(function (c) {
        var pend = V.pending[c.id];
        return '<button type="button" class="ch' + (pend ? ' is-checking' : '') +
          (c.overdue ? ' is-overdue' : '') + '" data-ch="' + App.esc(c.id) + '">' +
          '<span class="ch-emoji">' + (c.emoji || '✅') +
          '<span class="ch-check"><svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span></span>' +
          '<span class="ch-text"><b>' + App.esc(c.title) + '</b></span></button>';
      }).join('')
      : '<div class="h-tile-empty">All done</div>';
    return '<div class="cl-panel h-tile h-tile--tasks" style="' + App.pstyle(p) + '">' +
      '<div class="cl-panel-head">' +
      '<span class="label">To-do · ' + App.esc(p.name) + '</span>' +
      (list.length ? '<span class="cl-count num" style="color:var(--ink-2)">' + list.length + '</span>' : '') +
      '</div>' +
      '<div class="h-todo-list">' + rows + '</div>' +
      (more > 0 ? '<div class="h-more-n">+' + more + ' more</div>' : '') +
      '</div>';
  }

  var JOKES = [
    { q: 'Why did the banana go to the doctor?', a: 'It wasn\'t peeling well.' },
    { q: 'What do you call a bear with no teeth?', a: 'A gummy bear.' },
    { q: 'Why can\'t you give Elsa a balloon?', a: 'Because she will let it go.' },
    { q: 'What do you call cheese that isn\'t yours?', a: 'Nacho cheese.' },
    { q: 'Why did the kid bring a ladder to school?', a: 'Because it was high school.' },
    { q: 'What\'s brown and sticky?', a: 'A stick.' },
    { q: 'Why do bees have sticky hair?', a: 'They always use honeycombs.' },
    { q: 'How do you make a tissue dance?', a: 'Put a little boogie in it.' },
    { q: 'What do you call a sleeping bull?', a: 'A bulldozer.' },
    { q: 'Why did the cookie go to the nurse?', a: 'It felt crummy.' },
    { q: 'What has ears but cannot hear?', a: 'A cornfield.' },
    { q: 'Why did the math book look so sad?', a: 'It had too many problems.' },
    { q: 'What do you call a fish wearing a bowtie?', a: 'Sofishticated.' },
    { q: 'Why don\'t eggs tell jokes?', a: 'They\'d crack each other up.' },
    { q: 'What\'s a skeleton\'s favorite instrument?', a: 'A trombone. No organs.' },
  ];

  function jokeOfDay(now) {
    var start = new Date(now.getFullYear(), 0, 0);
    var day = Math.floor((now - start) / 86400000);
    return JOKES[day % JOKES.length];
  }

  function lunchCard(school, day, entrees, shared) {
    var head = shared
      ? 'Lunch'
      : ('Lunch · ' + App.esc(school));
    var list = entrees.length
      ? '<ul class="h-lunch-list">' + entrees.slice(0, LUNCH_MAX).map(function (n) {
        return '<li>' + App.esc(n) + '</li>';
      }).join('') + '</ul>' +
        (entrees.length > LUNCH_MAX ? '<div class="h-more-n">+' + (entrees.length - LUNCH_MAX) + ' more</div>' : '')
      : '<div class="h-tile-empty">No menu yet</div>';
    var schoolLine = shared
      ? '<div class="h-lunch-schools">Herbison Woods · Scott</div>'
      : '';
    return '<div class="cl-panel h-tile h-tile--lunch' + (shared ? ' is-shared' : '') + '">' +
      '<div class="cl-panel-head">' +
      '<span class="label">' + head + '</span>' +
      '<span class="h-day-date num">' + App.esc(App.fmt.monthShort(day) + ' ' + day.getDate()) + '</span>' +
      '</div>' +
      '<div class="h-lunch-day num">' + App.esc(App.fmt.day(day)) + '</div>' +
      '<div class="h-lunch-sub">Next school day</div>' +
      schoolLine +
      list +
      '</div>';
  }

  function jokeTile() {
    var j = jokeOfDay(App.now());
    return '<div class="cl-panel h-tile h-tile--joke">' +
      '<div class="cl-panel-head"><span class="label">Joke of the day</span></div>' +
      '<p class="h-joke-q">' + App.esc(j.q) + '</p>' +
      '<p class="h-joke-a">' + App.esc(j.a) + '</p>' +
      '</div>';
  }

  function sideTiles() {
    var day = nextSchoolDay(App.now());
    var maya = lunchEntrees('maya', day);
    var otto = lunchEntrees('otto', day);
    var schoolMaya = lunchFor('maya').school || 'Herbison Woods';
    var schoolOtto = lunchFor('otto').school || 'Scott';
    var lunch = sameEntrees(maya, otto)
      ? lunchCard(schoolMaya, day, maya.length ? maya : otto, true)
      : ('<div class="h-lunch-split">' +
        lunchCard(schoolMaya, day, maya, false) +
        lunchCard(schoolOtto, day, otto, false) +
        '</div>');
    return '<div class="h-side">' + lunch + jokeTile() + '</div>';
  }

  function kidHeader(cfg) {
    var p = App.person(cfg.id);
    var dueN = cfg.id === 'maya' ? assignmentsOn(cfg.id, App.now()).length : 0;
    var pastN = cfg.id === 'maya' ? pastDueCount(cfg.id) : 0;
    var cue = dueN > 0
      ? '<span class="h-kid-cue is-due">' + dueN + ' due</span>'
      : (pastN > 0
        ? '<span class="h-kid-cue is-late">' + pastN + ' late</span>'
        : (cfg.id === 'maya' ? '<span class="h-kid-cue is-ok">Caught up</span>' : ''));
    return '<button type="button" class="h-kid-identity" data-go="' + cfg.view + '" style="' + App.pstyle(p) + '">' +
      App.avatar(p, 56) +
      '<div class="cl-title">' +
      '<div class="label">' + App.esc(cfg.label) + '</div>' +
      '<h2 class="serif">' + App.esc(p.name) + '</h2></div>' +
      cue +
      '<span class="h-kid-open">Open</span></button>';
  }

  function kidTile(cfg) {
    var p = App.person(cfg.id);
    var dueN = cfg.id === 'maya' ? assignmentsOn(cfg.id, App.now()).length : 0;
    var pastN = cfg.id === 'maya' ? pastDueCount(cfg.id) : 0;
    var focus = cfg.id === 'maya' ? dueTile(cfg.id) : scheduleTile(cfg.id);
    return '<section class="h-kid' + (dueN || pastN ? ' has-due' : '') +
      '" style="' + App.pstyle(p) + '" data-kid="' + cfg.id + '">' +
      kidHeader(cfg) +
      '<div class="h-kid-stack">' +
      focus +
      tasksTile(cfg) +
      '</div></section>';
  }

  function bento() {
    return kidTile(KIDS[0]) + kidTile(KIDS[1]) + sideTiles();
  }

  function toggleChore(id, btn) {
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
      c.doneBy = c.who;
      if (App.pushChoreToggle) App.pushChoreToggle(c);
      paint();
      App.emit('data');
    }, 280);
  }

  function paint() {
    var el = V.el;
    if (!el || !el.firstChild) return;
    el.querySelector('.h-clock').innerHTML = clock();
    el.querySelector('.h-weather').innerHTML = weather();
    el.querySelector('.h-agenda').innerHTML = agenda();
    el.querySelector('.h-bento').innerHTML = bento();
  }

  App.register('home', {
    show: function (el) {
      V.el = el;
      if (!el.firstChild) {
        el.innerHTML = '<div class="home">' +
          '<div class="h-clock cl-panel" data-go="calendar"></div>' +
          '<div class="h-weather cl-panel"></div>' +
          '<div class="h-agenda cl-panel"></div>' +
          '<div class="h-bento"></div></div>';
        el.addEventListener('click', function (e) {
          var ch = e.target.closest('[data-ch]');
          if (ch && el.contains(ch)) { toggleChore(ch.dataset.ch, ch); return; }
          var ev = e.target.closest('[data-ev]');
          if (ev) { App.eventSheet(App.findEvent(ev.dataset.ev)); return; }
          var g = e.target.closest('[data-go]');
          if (g) App.go(g.dataset.go);
        });
      }
      paint();
    }
  });

  App.on('minute', function (n) {
    if (!V.el || !V.el.firstChild) return;
    V.el.querySelector('.h-clock').innerHTML = clock();
    V.el.querySelector('.h-agenda').innerHTML = agenda();
    if (n.getMinutes() === 0) {
      V.el.querySelector('.h-weather').innerHTML = weather();
      V.el.querySelector('.h-bento').innerHTML = bento();
    }
  });
  App.on('data', function () { if (App.current === 'home') paint(); });
})();
