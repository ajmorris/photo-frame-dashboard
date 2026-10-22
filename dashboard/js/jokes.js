// Kid jokes of the day. Same pool, different offset per kid.
(function () {
  'use strict';

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

  var OFFSET = { maya: 0, otto: 7 };

  function jokeOfDay(kid, now) {
    now = now || App.now();
    var start = new Date(now.getFullYear(), 0, 0);
    var day = Math.floor((now - start) / 86400000);
    var off = OFFSET[kid] || 0;
    return JOKES[(day + off) % JOKES.length];
  }

  function jokeTile(kid) {
    var j = jokeOfDay(kid);
    var p = App.person(kid);
    return '<button type="button" class="cl-panel cl-joke" data-joke="' + App.esc(kid) + '" style="' + App.pstyle(p) + '">' +
      '<div class="cl-panel-head"><span class="label">Joke of the day</span></div>' +
      '<p class="cl-joke-q">' + App.esc(j.q) + '</p>' +
      '<span class="cl-joke-hint">Tap for punchline</span>' +
      '</button>';
  }

  function openJoke(kid) {
    var j = jokeOfDay(kid);
    var p = App.person(kid);
    App.sheet(
      '<div class="cl-sheet" style="' + App.pstyle(p) + '">' +
      '<div class="cl-sheet-band">' +
      '<div class="label label--on">Joke of the day</div>' +
      '<h2 class="serif">' + App.esc(j.q) + '</h2>' +
      '</div>' +
      '<div class="cl-sheet-body">' +
      '<p class="cl-joke-punch">' + App.esc(j.a) + '</p>' +
      '</div></div>',
      { cls: 'sheet--chloe' }
    );
  }

  App.jokeOfDay = jokeOfDay;
  App.jokeTile = jokeTile;
  App.openJoke = openJoke;
})();
