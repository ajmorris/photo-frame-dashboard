// Replaces the mock calendar with live events from /api/calendar. Falls back to the last good copy
// (localStorage) so the wall display still shows a calendar when the network drops.
(function () {
  'use strict';
  var D = window.DATA, KEY = 'homehq.calendar.v1', POLL = 5 * 60 * 1000;

  function revive(e) {
    var o = Object.assign({}, e);
    if (e.allDay) {
      var s = e.start.split('-'), n = e.end.split('-');
      o.start = new Date(+s[0], +s[1] - 1, +s[2]);
      o.end = new Date(+n[0], +n[1] - 1, +n[2]);
    } else { o.start = new Date(e.start); o.end = new Date(e.end); }
    return o;
  }
  function apply(list) {
    D.events.length = 0;
    list.forEach(function (e) { D.events.push(revive(e)); });
    App.emit('data');
    App.rerender();
  }
  function load() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/calendar');
    xhr.onload = function () {
      if (xhr.status !== 200) return;
      try {
        var body = JSON.parse(xhr.responseText);
        if (!body.events || !body.events.length) return;
        try { localStorage.setItem(KEY, JSON.stringify(body.events)); } catch (e) {}
        apply(body.events);
      } catch (e) {}
    };
    xhr.send();
  }

  // Only go live when served by the Worker; plain `vite dev` keeps the mock data.
  if (window.CALENDAR_LIVE === false) return;
  try {
    var cached = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (cached && cached.length) apply(cached);
  } catch (e) {}
  load();
  setInterval(load, POLL);
})();
