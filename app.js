/* 道德經 · 讀與寫
 * 閱讀：點原文句子 → 顯示白話
 * 書寫：Apple Pencil / 滑鼠在紙面上寫字；手指只負責捲動（防手掌誤觸）
 * 儲存：筆跡以向量存在瀏覽器 IndexedDB（失敗時退回 localStorage），可匯出／匯入備份
 */
(function () {
  'use strict';

  var CHAPTERS = window.DDJ || [];
  var app = document.getElementById('app');

  // ---------- 小工具 ----------
  var DIG = '〇一二三四五六七八九';
  function cn(n) {
    if (n < 10) return DIG[n];
    if (n === 10) return '十';
    if (n < 20) return '十' + DIG[n % 10];
    var t = Math.floor(n / 10), o = n % 10;
    return DIG[t] + '十' + (o ? DIG[o] : '');
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 忽略 */ } }
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }

  // ---------- 儲存層 ----------
  var Store = (function () {
    var dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise(function (resolve, reject) {
        if (!window.indexedDB) return reject(new Error('no idb'));
        var r = indexedDB.open('ddj-notes', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('ink'); };
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      });
      return dbp;
    }
    function tx(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var t = db.transaction('ink', mode), s = t.objectStore('ink'), req = fn(s);
          t.oncomplete = function () { resolve(req && req.result); };
          t.onerror = t.onabort = function () { reject(t.error); };
        });
      });
    }
    function lsKey(n) { return 'ddj-ink-' + n; }
    return {
      get: function (n) {
        return tx('readonly', function (s) { return s.get(n); }).catch(function () {
          try { return JSON.parse(lsGet(lsKey(n), 'null')); } catch (e) { return null; }
        });
      },
      set: function (n, strokes) {
        var rec = { strokes: strokes, updated: Date.now() };
        return tx('readwrite', function (s) { return strokes.length ? s.put(rec, n) : s.delete(n); })
          .catch(function () { lsSet(lsKey(n), JSON.stringify(rec)); });
      },
      keys: function () {
        return tx('readonly', function (s) { return s.getAllKeys(); }).catch(function () {
          var out = [];
          for (var n = 1; n <= 81; n++) if (lsGet(lsKey(n), null)) out.push(n);
          return out;
        });
      }
    };
  })();

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

  // ---------- 路由 ----------
  var cleanup = null;
  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    var m = location.hash.match(/^#\/(\d+)$/);
    var n = m ? parseInt(m[1], 10) : 0;
    window.scrollTo(0, 0);
    if (n >= 1 && n <= CHAPTERS.length) showChapter(n); else showToc();
  }
  window.addEventListener('hashchange', route);

  // ---------- 目錄 ----------
  function showToc() {
    document.title = '道德經 · 讀與寫';
    var last = parseInt(lsGet('ddj-last', '0'), 10);
    var html = '<main class="toc"><h1>道德經</h1>' +
      '<p class="lead">八十一章 · 王弼本 · 逐句白話 · 可手寫筆記</p>';
    if (last >= 1 && last <= CHAPTERS.length) {
      html += '<a class="resume" href="#/' + last + '">繼續閱讀　第' + cn(last) + '章　' + esc(CHAPTERS[last - 1].title) + '</a>';
    }
    ['道經', '德經'].forEach(function (part) {
      html += '<h2>' + (part === '道經' ? '上篇　道經' : '下篇　德經') + '</h2><div class="grid">';
      CHAPTERS.forEach(function (c) {
        if (c.part !== part) return;
        html += '<a class="card" data-n="' + c.n + '" href="#/' + c.n + '"><b>第' + cn(c.n) + '章</b><span>' + esc(c.title) + '</span></a>';
      });
      html += '</div>';
    });
    html += '<section class="tools"><p><b>筆記備份</b>：筆記存在這台裝置的瀏覽器裡，建議常匯出備份（存到「檔案」App 的 iCloud 雲碟）。</p>' +
      '<button id="exp">匯出全部筆記</button><button id="imp">匯入備份</button>' +
      '<input id="impfile" type="file" accept="application/json,.json" hidden>' +
      '<p>iPad 使用：Safari 開啟後，按「分享 → 加入主畫面」，就能像 App 一樣全螢幕使用，也能離線閱讀。</p></section>' +
      '<p class="foot">原文：王弼本（公有領域）　白話：本專案自行撰寫，由 AI 協助產生，僅供參考　章名：依河上公本傳統章名</p></main>';
    app.innerHTML = html;

    Store.keys().then(function (keys) {
      (keys || []).forEach(function (k) {
        var el = app.querySelector('.card[data-n="' + k + '"]');
        if (el) el.classList.add('has-ink');
      });
    });
    document.getElementById('exp').onclick = exportAll;
    var f = document.getElementById('impfile');
    document.getElementById('imp').onclick = function () { f.click(); };
    f.onchange = function () { if (f.files[0]) importFile(f.files[0]); f.value = ''; };
  }

  function exportAll() {
    var tasks = [];
    for (var n = 1; n <= CHAPTERS.length; n++) tasks.push(Store.get(n));
    Promise.all(tasks).then(function (recs) {
      var notes = {}, count = 0;
      recs.forEach(function (r, i) { if (r && r.strokes && r.strokes.length) { notes[i + 1] = r; count++; } });
      if (!count) { toast('目前還沒有任何筆記'); return; }
      var blob = new Blob([JSON.stringify({ app: 'ddj-notes', version: 1, exported: new Date().toISOString(), notes: notes })],
        { type: 'application/json' });
      var a = document.createElement('a');
      var d = new Date(), p = function (x) { return String(x).padStart(2, '0'); };
      a.href = URL.createObjectURL(blob);
      a.download = '道德經筆記備份_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      toast('已匯出 ' + count + ' 章的筆記');
    });
  }

  function importFile(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var j = JSON.parse(r.result);
        if (j.app !== 'ddj-notes' || !j.notes) throw new Error('格式不符');
        var keys = Object.keys(j.notes), ps = [];
        keys.forEach(function (k) {
          var n = parseInt(k, 10);
          if (n >= 1 && n <= 81 && j.notes[k] && Array.isArray(j.notes[k].strokes)) {
            ps.push(Store.get(n).then(function (old) {
              // 匯入採「合併」：同章已有筆跡時，把備份的筆跡接在後面，不覆蓋
              var base = (old && old.strokes) || [];
              var seen = {};
              base.forEach(function (s) { seen[JSON.stringify(s)] = 1; });
              var add = j.notes[k].strokes.filter(function (s) { return !seen[JSON.stringify(s)]; });
              return Store.set(n, base.concat(add));
            }));
          }
        });
        Promise.all(ps).then(function () { toast('已匯入 ' + ps.length + ' 章的筆記'); showToc(); });
      } catch (e) { toast('這不是有效的備份檔'); }
    };
    r.readAsText(file);
  }

  // ---------- 章節頁 ----------
  function showChapter(n) {
    var c = CHAPTERS[n - 1];
    lsSet('ddj-last', String(n));
    document.title = '第' + cn(n) + '章 ' + c.title + ' · 道德經';

    var sents = c.sents.map(function (s, i) {
      return '<div class="sent" data-i="' + i + '"><p class="orig">' + esc(s[0]) + '</p><p class="trans">' + esc(s[1]) + '</p></div>';
    }).join('');

    var prev = n > 1 ? '#/' + (n - 1) : '', next = n < CHAPTERS.length ? '#/' + (n + 1) : '';
    app.innerHTML =
      '<header class="top"><a class="nbtn" href="#/" aria-label="回到目錄">目錄</a>' +
      '<div class="title">第' + cn(n) + '章　' + esc(c.title) + '<small>' + c.part + '</small></div>' +
      '<a class="nbtn" href="' + prev + '" ' + (prev ? '' : 'aria-disabled="true"') + ' aria-label="上一章">‹</a>' +
      '<a class="nbtn" href="' + next + '" ' + (next ? '' : 'aria-disabled="true"') + ' aria-label="下一章">›</a></header>' +
      '<article class="paper" id="paper"><div class="part">' + c.part + '　第' + cn(n) + '章</div><h1>' + esc(c.title) + '</h1>' +
      sents + '<div class="notes-area"><span>我的心得</span></div><canvas id="ink"></canvas></article>' +
      '<nav class="pager"><a class="nbtn" href="' + prev + '" ' + (prev ? '' : 'aria-disabled="true"') + '>‹ 上一章</a>' +
      '<a class="nbtn" href="' + next + '" ' + (next ? '' : 'aria-disabled="true"') + '>下一章 ›</a></nav>' +
      '<div class="toolbar" id="tb">' +
      '<button class="tb" id="bMode" aria-pressed="false">✏️ 書寫</button>' +
      '<button class="tb" id="bAll" aria-pressed="false">白話全開</button>' +
      '<span class="sep write-only"></span>' +
      '<button class="dot write-only" data-color="#2b2620" aria-label="黑筆" aria-pressed="true"><i style="background:#2b2620"></i></button>' +
      '<button class="dot write-only" data-color="#c0392b" aria-label="紅筆" aria-pressed="false"><i style="background:#c0392b"></i></button>' +
      '<button class="dot write-only" data-color="#1f5fa8" aria-label="藍筆" aria-pressed="false"><i style="background:#1f5fa8"></i></button>' +
      '<button class="dot hl write-only" data-color="hl" aria-label="螢光筆" aria-pressed="false"><i style="background:#f4d03f"></i></button>' +
      '<span class="sep write-only"></span>' +
      '<button class="tb write-only" id="bW" title="筆的粗細">中</button>' +
      '<button class="tb write-only" id="bErase" aria-pressed="false">橡皮擦</button>' +
      '<button class="tb write-only" id="bUndo">復原</button>' +
      '<button class="tb write-only" id="bClear">清除</button>' +
      '<button class="tb write-only" id="bFinger" aria-pressed="false" title="預設只有 Apple Pencil 能寫，手指用來捲動">手指也寫</button>' +
      '</div>';

    var paper = document.getElementById('paper');
    var canvas = document.getElementById('ink');
    var ctx = canvas.getContext('2d');
    var tb = document.getElementById('tb');

    var strokes = [];       // 目前章節的所有筆畫
    var history = [];       // 復原用的快照
    var tool = { color: '#2b2620', hl: false, sizeIdx: 1, erase: false, finger: false };
    var SIZES = [{ n: '細', w: 1.6 }, { n: '中', w: 2.8 }, { n: '粗', w: 5 }];
    var cur = null, scrolling = null, saveTimer = null, loaded = false;

    Store.get(n).then(function (rec) {
      strokes = (rec && rec.strokes) || [];
      loaded = true;
      redraw();
    });

    // 句子點擊 → 切換白話
    paper.addEventListener('click', function (e) {
      if (paper.classList.contains('writing')) return;
      var s = e.target.closest('.sent');
      if (s) s.classList.toggle('open');
    });

    // ----- 畫布尺寸 -----
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    function sizeCanvas() {
      var w = paper.clientWidth, h = paper.scrollHeight;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    }
    var ro = window.ResizeObserver ? new ResizeObserver(function () {
      if (Math.abs(canvas.clientWidth - paper.clientWidth) > 1 || Math.abs(canvas.clientHeight - paper.scrollHeight) > 1) sizeCanvas();
    }) : null;
    if (ro) ro.observe(paper);
    sizeCanvas();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeCanvas);

    // ----- 繪圖 -----
    function widthAt(s, pr) {
      if (s.hl) return s.w;
      return s.w * (0.45 + 1.1 * (pr == null ? 0.5 : pr));
    }
    function drawSeg(s, a, b) {
      ctx.strokeStyle = s.hl ? 'rgba(244,208,63,.5)' : s.c;
      ctx.lineWidth = widthAt(s, (a[2] + b[2]) / 2);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    function drawStroke(s) {
      var p = s.p;
      if (p.length === 1) {
        ctx.fillStyle = s.hl ? 'rgba(244,208,63,.5)' : s.c;
        ctx.beginPath(); ctx.arc(p[0][0], p[0][1], widthAt(s, p[0][2]) / 2, 0, 6.2832); ctx.fill();
        return;
      }
      if (s.hl) {                 // 螢光筆：整條路徑一次畫完，半透明重疊處才不會變深
        ctx.strokeStyle = 'rgba(244,208,63,.5)'; ctx.lineWidth = s.w;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
        for (var j = 1; j < p.length; j++) ctx.lineTo(p[j][0], p[j][1]);
        ctx.stroke();
        return;
      }
      for (var i = 1; i < p.length; i++) drawSeg(s, p[i - 1], p[i]);
    }
    function redraw() {
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      strokes.forEach(drawStroke);
    }

    // ----- 儲存 -----
    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flush, 500);
    }
    function flush() {
      clearTimeout(saveTimer); saveTimer = null;
      if (loaded) Store.set(n, strokes);
    }
    function pushHistory() {
      history.push(strokes.slice());
      if (history.length > 60) history.shift();
    }

    // ----- 指標事件 -----
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      return [Math.round((e.clientX - r.left) * 10) / 10, Math.round((e.clientY - r.top) * 10) / 10,
        e.pointerType === 'pen' ? Math.round(e.pressure * 100) / 100 : 0.5];
    }
    function eraseAt(pt) {
      var R = 14, before = strokes.length;
      var kept = strokes.filter(function (s) {
        var r = R + s.w;
        for (var i = 0; i < s.p.length; i++) {
          var dx = s.p[i][0] - pt[0], dy = s.p[i][1] - pt[1];
          if (dx * dx + dy * dy < r * r) return false;
        }
        return true;
      });
      if (kept.length !== before) {
        if (!cur || !cur.erased) { pushHistory(); if (cur) cur.erased = true; }
        strokes = kept; redraw(); scheduleSave();
      }
    }

    canvas.addEventListener('pointerdown', function (e) {
      if (!paper.classList.contains('writing')) return;
      e.preventDefault();
      var canDraw = e.pointerType === 'pen' || e.pointerType === 'mouse' || tool.finger;
      if (!canDraw) {                        // 手指 → 手動捲動頁面
        scrolling = { id: e.pointerId, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      canvas.setPointerCapture(e.pointerId);
      var pt = pos(e);
      var erasing = tool.erase || (e.buttons & 32); // Pencil／觸控筆的橡皮擦端
      if (erasing) { cur = { id: e.pointerId, erasing: true, erased: false }; eraseAt(pt); return; }
      var size = SIZES[tool.sizeIdx].w;
      cur = { id: e.pointerId, s: { c: tool.color, w: tool.hl ? size * 6 : size, hl: tool.hl ? 1 : 0, p: [pt] } };
      if (!tool.hl) delete cur.s.hl;
      drawStroke(cur.s);
    });

    canvas.addEventListener('pointermove', function (e) {
      if (scrolling && e.pointerId === scrolling.id) {
        window.scrollBy(0, scrolling.y - e.clientY);
        scrolling.y = e.clientY;
        return;
      }
      if (!cur || e.pointerId !== cur.id) return;
      e.preventDefault();
      var evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
      if (!evs.length) evs = [e];
      for (var i = 0; i < evs.length; i++) {
        var pt = pos(evs[i]);
        if (cur.erasing) { eraseAt(pt); continue; }
        var last = cur.s.p[cur.s.p.length - 1];
        if (Math.abs(pt[0] - last[0]) + Math.abs(pt[1] - last[1]) < 0.6) continue;
        cur.s.p.push(pt);
        if (!cur.s.hl) drawSeg(cur.s, last, pt);
      }
      if (cur.s && cur.s.hl) { redraw(); drawStroke(cur.s); }
    });

    function endPointer(e) {
      if (scrolling && e.pointerId === scrolling.id) { scrolling = null; return; }
      if (!cur || e.pointerId !== cur.id) return;
      if (!cur.erasing) {
        pushHistory();
        strokes = strokes.concat([cur.s]);
        scheduleSave();
      }
      cur = null;
    }
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // ----- 工具列 -----
    function setPressed(el, on) { el.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    var bMode = document.getElementById('bMode');
    function setMode(writing) {
      paper.classList.toggle('writing', writing);
      tb.classList.toggle('writing-bar', writing);
      setPressed(bMode, writing);
      bMode.textContent = writing ? '📖 閱讀' : '✏️ 書寫';
      if (writing) sizeCanvas();
    }
    bMode.onclick = function () { setMode(!paper.classList.contains('writing')); };
    var bAll = document.getElementById('bAll');
    bAll.onclick = function () {
      var on = paper.classList.toggle('show-all');
      setPressed(bAll, on);
      bAll.textContent = on ? '白話全關' : '白話全開';
    };
    tb.querySelectorAll('.dot').forEach(function (b) {
      b.onclick = function () {
        tb.querySelectorAll('.dot').forEach(function (x) { setPressed(x, x === b); });
        tool.hl = b.dataset.color === 'hl';
        if (!tool.hl) tool.color = b.dataset.color;
        tool.erase = false; setPressed(bErase, false); paper.classList.remove('erasing');
      };
    });
    var bW = document.getElementById('bW');
    bW.onclick = function () {
      tool.sizeIdx = (tool.sizeIdx + 1) % SIZES.length;
      bW.textContent = SIZES[tool.sizeIdx].n;
    };
    var bErase = document.getElementById('bErase');
    bErase.onclick = function () {
      tool.erase = !tool.erase;
      setPressed(bErase, tool.erase);
      paper.classList.toggle('erasing', tool.erase);
    };
    document.getElementById('bUndo').onclick = function () {
      if (!history.length) { toast('沒有可復原的動作'); return; }
      strokes = history.pop(); redraw(); scheduleSave();
    };
    document.getElementById('bClear').onclick = function () {
      if (!strokes.length) return;
      if (confirm('要清除這一章的全部筆跡嗎？（清除後可按「復原」救回）')) {
        pushHistory(); strokes = []; redraw(); scheduleSave();
      }
    };
    var bFinger = document.getElementById('bFinger');
    bFinger.onclick = function () { tool.finger = !tool.finger; setPressed(bFinger, tool.finger); };

    // 鍵盤：左右鍵換章
    function onKey(e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === 'ArrowLeft' && prev) location.hash = prev;
      if (e.key === 'ArrowRight' && next) location.hash = next;
    }
    document.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });

    cleanup = function () {
      flush();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', flush);
      if (ro) ro.disconnect();
    };
  }

  // ---------- 離線快取 ----------
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  route();
})();
