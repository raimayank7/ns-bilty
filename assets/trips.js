/* trips.js: the "Trips and fleet" desk of bilty.niveshsahayak.in (India plan C). Opens from a button under the lorry receipt form.
   Vehicles, drivers, trips, costs outside trips, per-vehicle / per-driver profit statements for a period, freight dues by party, vehicle and
   licence due dates. Records are 'doc' records of type tveh / tdrv / ttrip / tvexp (logic and field list: engine/tripcore.js). They never
   reach NSBiz's accounts by themselves: the freight earned reaches the App through the lorry receipt (type 'lr') as before;
   the party dues here add the lorry receipts' balance from the App's books. No server; reminders are WhatsApp texts the owner sends. */
(function () {
  'use strict';
  var $ = NS.$, esc = NS.esc, num = NS.num, r2 = NS.r2, t = NS.t, T = window.NSTrip;
  var K, DOCS = [], view = 'trips', sub = 'veh', cur = null, from = '', to = '', filt = { reg: '', driver: '' }, SUB = {};
  var DOCL = function () { var o = {}; T.DOCKINDS.concat(['licence']).forEach(function (k) { o[k] = t('tp.d.' + k); }); return o; };
  function who() { return String(K.doc().seller.name || '').trim(); }
  function fd(x) { return NS.fmtDate(x); }
  function load() { return NSStore.list('doc').then(function (all) { DOCS = all; return all; }); }
  function mon() { var d = NS.today(); return [d.slice(0, 8) + '01', d]; }
  function lrLeft() {
    var left = {};
    try { NSBooks.bills(DOCS, who()).bills.forEach(function (b) { if (b.type === 'lr') left[b.id] = b.left; }); } catch (e) { return null; }
    return function (d) { return left[d.id] != null ? left[d.id] : 0; };
  }
  function fld(id, label, v, o) {
    o = o || {};
    var a = ' id="tpf-' + id + '" data-f="' + id + '"' + (o.mode ? ' inputmode="' + o.mode + '" dir="ltr"' : '') + (o.list ? ' list="' + o.list + '"' : '') + (o.max ? ' maxlength="' + o.max + '"' : '');
    var inner = o.type === 'select' ? '<select' + a + '>' + o.opts.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (String(v) === String(x[0]) ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>'
      : '<input' + a + ' type="' + (o.type || 'text') + '" value="' + esc(v == null ? '' : v) + '">';
    return '<div class="f' + (o.wide ? ' wide' : '') + '"><label for="tpf-' + id + '">' + esc(label) + '</label>' + inner + (o.hint ? '<small class="hint">' + esc(o.hint) + '</small>' : '') + '</div>';
  }
  function btn(attr, v, label, cls) { return '<button type="button" class="btn sm' + (cls ? ' ' + cls : '') + '" ' + attr + '="' + esc(v) + '">' + esc(label) + '</button>'; }
  function li(main, sub2, acts, warn) { return '<li' + (warn ? ' class="warn"' : '') + '><div class="gr-m">' + main + (sub2 ? '<small>' + sub2 + '</small>' : '') + '</div><div class="gr-a">' + acts + '</div></li>'; }
  function wa(phone, text) { var p = T.phone10(phone); return '<a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/' + (p ? '91' + p : '') + '?text=' + encodeURIComponent(text) + '">' + esc(t('tp.wa')) + '</a>'; }
  function mine(type) { return DOCS.filter(function (d) { return d.type === type && T.key(d.seller && d.seller.name) === T.key(who()); }); }
  function names(type, k) { var s = {}; mine(type).forEach(function (d) { if (d[k]) s[d[k]] = 1; }); return Object.keys(s); }
  function dl(id, list) { return '<datalist id="' + id + '">' + list.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>'; }
  function xl(name, sheets) { NS.xlsx(name, sheets.map(function (s) { return { name: s[0], rows: s[1] }; })); }

  /* ---------- printing a statement: a copy in the page that only prints ---------- */
  function printHtml(title, html) {
    var old = $('#tp-print'); if (old) old.remove();
    var s = who(), box = NS.el('div', { id: 'tp-print' }, '<h2>' + esc(s || 'Trips') + '</h2><h3>' + esc(title) + '</h3>' + html + '' + NS.creditLine('small') + '');
    document.body.appendChild(box); document.documentElement.classList.add('tp-on');
    var done = function () { document.documentElement.classList.remove('tp-on'); box.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done); setTimeout(function () { window.print(); }, 50);
  }
  function table(head, rows, foot) {
    return '<table class="day"><thead><tr>' + head.map(function (h, i) { return '<th' + (i ? ' class="n"' : '') + '>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (i ? ' class="n"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody>' +
      (foot ? '<tfoot><tr>' + foot.map(function (c, i) { return '<th' + (i ? ' class="n"' : '') + '>' + c + '</th>'; }).join('') + '</tr></tfoot>' : '') + '</table>';
  }
  var M = function (v) { return NS.money(v); };

  /* ---------- tabs ---------- */
  function head() {
    return '<div class="row gr-tabs">' + [['trips', 'tp.trips'], ['veh', 'tp.veh'], ['drv', 'tp.drv'], ['rep', 'tp.rep'], ['docs', 'tp.docs']].map(function (x) {
      var b = x[0] === 'docs' ? ' (' + T.dueDocs(DOCS, who(), NS.today()).length + ')' : '';
      return '<button type="button" class="btn sm' + (view === x[0] || (view === 'trip' && x[0] === 'trips') ? ' primary' : '') + '" data-tv="' + x[0] + '">' + esc(t(x[1])) + (x[0] === 'docs' && b !== ' (0)' ? b : '') + '</button>';
    }).join('') + '</div>';
  }
  function period() {
    return '<div class="row tp-per"><div class="f"><label for="tpf-from">' + esc(t('tp.from')) + '</label><input id="tpf-from" type="date" value="' + esc(from) + '"></div><div class="f"><label for="tpf-to">' + esc(t('tp.to')) + '</label><input id="tpf-to" type="date" value="' + esc(to) + '"></div></div>';
  }

  /* ---------- views ---------- */
  function vTrips() {
    var list = T.trips(DOCS, who(), { from: from, to: to, reg: filt.reg, driver: filt.driver }).reverse(), s = T.sumTrips(list), lrs = T.unlinkedLrs(DOCS, who());
    return head() + period() + '<div class="row"><button type="button" class="btn primary" data-new="trip">' + esc(t('tp.newtrip')) + '</button>' + (lrs.length ? btn('data-tv', 'lrs', t('tp.fromlr', { n: lrs.length })) : '') + '</div>' +
      '<div class="tiles"><div class="tile"><span>' + esc(t('tp.t.n')) + '</span><b>' + s.n + '</b></div><div class="tile"><span>' + esc(t('tp.t.freight')) + '</span><b>' + M(s.freight) + '</b></div><div class="tile"><span>' + esc(t('tp.t.cost')) + '</span><b>' + M(s.exp + s.commission + s.hamali) + '</b></div><div class="tile ok"><span>' + esc(t('tp.t.profit')) + '</span><b>' + M(s.profit) + '</b></div></div>' +
      (list.length ? '<ul class="gr-list">' + list.map(function (x) {
        var c = T.calc(x);
        return li('<b>' + esc(fd(x.date)) + '</b> ' + esc((x.from || '') + ' → ' + (x.to || '')) + ' · <span class="mono">' + esc(T.showReg(x.reg)) + '</span>', esc([x.party, x.driver, x.lr ? 'LR ' + x.lr : '', t('tp.l.freight') + ' ' + M(c.freight), t('tp.l.profit') + ' ' + M(c.profit), c.balance > 0.004 ? t('tp.l.bal') + ' ' + M(c.balance) : ''].filter(Boolean).join(' · ')), btn('data-edit', x.id, t('h.open')), c.balance > 0.004);
      }).join('') + '</ul><div class="row">' + btn('data-xl', 'trips', t('tp.excel')) + '</div>' : '<p>' + esc(t('tp.notrips')) + '</p>');
  }
  function vLrs() {
    var list = T.unlinkedLrs(DOCS, who());
    return head() + '<p class="hint">' + esc(t('tp.lrh')) + '</p>' + (list.length ? '<ul class="gr-list">' + list.map(function (d) {
      return li('<b class="mono">' + esc(d.no) + '</b> ' + esc(fd(d.date)) + ' ' + esc((d.from || '') + ' → ' + (d.to || '')), esc([d.veh, d.buyer && d.buyer.name, M(num(d.total))].filter(Boolean).join(' · ')), btn('data-lrtrip', d.id, t('tp.addtrip')));
    }).join('') + '</ul>' : '<p>' + esc(t('tp.nolr')) + '</p>');
  }
  function vTrip() {
    var c = cur, o = T.calc(c);
    var kinds = T.KINDS.map(function (k) { return [k, t('tp.k.' + k)]; });
    return head() + '<h3>' + esc(c.id ? t('tp.edittrip') : t('tp.newtrip')) + '</h3><div class="fg">' +
      fld('date', t('tp.date'), c.date, { type: 'date' }) + fld('reg', t('tp.reg'), c.reg, { list: 'tp-regs', max: 14 }) + fld('driver', t('tp.driver'), c.driver, { list: 'tp-drvs' }) +
      fld('from', t('tp.tfrom'), c.from) + fld('to', t('tp.tto'), c.to) + fld('km', t('tp.km'), c.km, { mode: 'decimal' }) +
      fld('party', t('tp.party'), c.party, { list: 'tp-parties' }) + fld('phone', t('tp.phone'), c.phone, { type: 'tel', mode: 'tel' }) + fld('lr', t('tp.lr'), c.lr, { list: 'tp-lrs' }) +
      fld('freight', t('tp.freight'), c.freight, { mode: 'decimal' }) + fld('advance', t('tp.adv'), c.advance, { mode: 'decimal', hint: t('tp.advh') }) +
      fld('dcash', t('tp.dcash'), c.dcash, { mode: 'decimal', hint: t('tp.dcashh') }) + fld('commission', t('tp.comm'), c.commission, { mode: 'decimal' }) + fld('hamali', t('tp.hamali'), c.hamali, { mode: 'decimal' }) + '</div>' +
      dl('tp-regs', mine('tveh').map(function (v) { return T.showReg(v.reg); }).concat(names('ttrip', 'reg'))) + dl('tp-drvs', mine('tdrv').map(function (d) { return d.name; }).concat(names('ttrip', 'driver'))) +
      dl('tp-parties', names('ttrip', 'party')) + dl('tp-lrs', DOCS.filter(function (d) { return d.type === 'lr'; }).map(function (d) { return d.no; })) +
      '<h4>' + esc(t('tp.exps')) + '</h4><p class="hint">' + esc(t('tp.exph')) + '</p>' + c.exp.map(function (e, i) {
        return '<div class="fg tp-row">' + fld('e' + i + 'k', t('tp.ek'), e.k, { type: 'select', opts: kinds }) + fld('e' + i + 'amt', t('tp.eamt'), e.amt, { mode: 'decimal' }) +
          fld('e' + i + 'by', t('tp.eby'), e.by, { type: 'select', opts: [['owner', t('tp.by.owner')], ['driver', t('tp.by.driver')]] }) + fld('e' + i + 'note', t('tp.enote'), e.note) + btn('data-rm', 'e' + i, t('tp.rm')) + '</div>';
      }).join('') + '<div class="row">' + btn('data-add', 'exp', t('tp.addexp')) + '</div>' +
      (c.id || c.recv.length ? '<h4>' + esc(t('tp.recv')) + '</h4>' + c.recv.map(function (e, i) {
        return '<div class="fg tp-row">' + fld('r' + i + 'date', t('tp.date'), e.date, { type: 'date' }) + fld('r' + i + 'amt', t('tp.eamt'), e.amt, { mode: 'decimal' }) + btn('data-rm', 'r' + i, t('tp.rm')) + '</div>';
      }).join('') + '<div class="row">' + btn('data-add', 'recv', t('tp.addrecv')) + '</div>' : '') +
      '<div class="sums" aria-live="polite"><span>' + esc(t('tp.s.cost', { v: M(o.cost) })) + '</span><b>' + esc(t('tp.s.profit', { v: M(o.profit) })) + '</b><span>' + esc(t('tp.s.bal', { v: M(o.balance) })) + '</span>' +
      (o.dcash ? '<span>' + esc(t('tp.s.hold', { v: M(o.driverBal) })) + '</span>' : '') + '</div>' +
      '<div class="row"><button type="button" class="btn primary" data-save="trip">' + esc(t('tp.save')) + '</button>' + btn('data-tv', 'trips', t('tp.cancel')) + (c.id ? btn('data-del', c.id, t('tp.delete')) : '') + '</div>';
  }
  function vVeh() {
    var vs = mine('tveh').sort(function (a, b) { return a.reg.localeCompare(b.reg); }), regs = {};
    vs.forEach(function (v) { regs[T.normReg(v.reg)] = 1; });
    var extra = names('ttrip', 'reg').filter(function (r) { return !regs[T.normReg(r)]; });
    var vx = mine('tvexp').sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 8);
    return head() + '<div class="row"><button type="button" class="btn primary" data-new="veh">' + esc(t('tp.newveh')) + '</button><button type="button" class="btn" data-new="vexp">' + esc(t('tp.newvexp')) + '</button></div>' +
      (vs.length ? '<ul class="gr-list">' + vs.map(function (v) {
        var late = T.dueDocs([v], who(), NS.today(), 30).length;
        return li('<b class="mono">' + esc(T.showReg(v.reg)) + '</b> ' + esc(v.name || ''), esc([v.owner ? t('tp.own.' + v.owner) : '', late ? t('tp.docsdue', { n: late }) : ''].filter(Boolean).join(' · ')), btn('data-edit', v.id, t('h.open')), late);
      }).join('') + '</ul>' : '<p>' + esc(t('tp.noveh')) + '</p>') +
      (extra.length ? '<p class="hint">' + esc(t('tp.extra')) + ' ' + esc(extra.join(', ')) + '</p>' : '') +
      (vx.length ? '<h4>' + esc(t('tp.vexps')) + '</h4><ul class="gr-list">' + vx.map(function (x) { return li(esc(fd(x.date)) + ' · <span class="mono">' + esc(T.showReg(x.reg)) + '</span> ' + esc(t('tp.k.' + (x.k || 'other'))), esc([M(num(x.amt)), x.note].filter(Boolean).join(' · ')), btn('data-edit', x.id, t('h.open'))); }).join('') + '</ul>' : '');
  }
  function vVehForm() {
    var c = cur;
    return head() + '<h3>' + esc(c.id ? t('tp.editveh') : t('tp.newveh')) + '</h3><div class="fg">' + fld('reg', t('tp.reg'), c.reg, { max: 14 }) + fld('name', t('tp.vname'), c.name) +
      fld('owner', t('tp.vowner'), c.owner || 'own', { type: 'select', opts: [['own', t('tp.own.own')], ['attached', t('tp.own.attached')]] }) + fld('fixed', t('tp.fixed'), c.fixed, { mode: 'decimal', hint: t('tp.fixedh') }) + '</div><h4>' + esc(t('tp.docsof')) + '</h4><p class="hint">' + esc(t('tp.docsh')) + '</p><div class="fg">' +
      T.DOCKINDS.map(function (k) { return fld('d' + k, t('tp.d.' + k), (c.docs || {})[k], { type: 'date' }); }).join('') + '</div>' +
      '<div class="row"><button type="button" class="btn primary" data-save="veh">' + esc(t('tp.save')) + '</button>' + btn('data-tv', 'veh', t('tp.cancel')) + (c.id ? btn('data-del', c.id, t('tp.delete')) : '') + '</div>';
  }
  function vVexpForm() {
    var c = cur;
    return head() + '<h3>' + esc(t('tp.newvexp')) + '</h3><p class="hint">' + esc(t('tp.vexph')) + '</p><div class="fg">' + fld('reg', t('tp.reg'), c.reg, { list: 'tp-regs', max: 14 }) + fld('date', t('tp.date'), c.date, { type: 'date' }) +
      fld('k', t('tp.ek'), c.k, { type: 'select', opts: T.KINDS.map(function (k) { return [k, t('tp.k.' + k)]; }) }) + fld('amt', t('tp.eamt'), c.amt, { mode: 'decimal' }) + fld('note', t('tp.enote'), c.note, { wide: true }) + '</div>' +
      dl('tp-regs', mine('tveh').map(function (v) { return T.showReg(v.reg); })) +
      '<div class="row"><button type="button" class="btn primary" data-save="vexp">' + esc(t('tp.save')) + '</button>' + btn('data-tv', 'veh', t('tp.cancel')) + (c.id ? btn('data-del', c.id, t('tp.delete')) : '') + '</div>';
  }
  function vDrv() {
    var ds = mine('tdrv').sort(function (a, b) { return a.name.localeCompare(b.name); });
    return head() + '<div class="row"><button type="button" class="btn primary" data-new="drv">' + esc(t('tp.newdrv')) + '</button></div>' +
      (ds.length ? '<ul class="gr-list">' + ds.map(function (d) {
        var l = d.licExp ? T.days(NS.today(), d.licExp) : null;
        return li('<b>' + esc(d.name) + '</b>', esc([d.phone, d.licence, d.licExp ? t('tp.d.licence') + ' ' + fd(d.licExp) : ''].filter(Boolean).join(' · ')), btn('data-edit', d.id, t('h.open')), l != null && l <= 30);
      }).join('') + '</ul>' : '<p>' + esc(t('tp.nodrv')) + '</p>');
  }
  function vDrvForm() {
    var c = cur;
    return head() + '<h3>' + esc(c.id ? t('tp.editdrv') : t('tp.newdrv')) + '</h3><div class="fg">' + fld('name', t('tp.dname'), c.name) + fld('phone', t('tp.phone'), c.phone, { type: 'tel', mode: 'tel' }) + fld('licence', t('tp.licno'), c.licence) + fld('licExp', t('tp.licexp'), c.licExp, { type: 'date' }) + '</div>' +
      '<div class="row"><button type="button" class="btn primary" data-save="drv">' + esc(t('tp.save')) + '</button>' + btn('data-tv', 'drv', t('tp.cancel')) + (c.id ? btn('data-del', c.id, t('tp.delete')) : '') + '</div>';
  }
  function repTabs() {
    return '<div class="row gr-tabs">' + [['veh', 'tp.r.veh'], ['drv', 'tp.r.drv'], ['party', 'tp.r.party']].map(function (x) { return '<button type="button" class="btn sm' + (sub === x[0] ? ' primary' : '') + '" data-rs="' + x[0] + '">' + esc(t(x[1])) + '</button>'; }).join('') + '</div>';
  }
  function repBody() {
    var w = who(), html = '', kk = T.KINDS;
    if (sub === 'veh') {
      var fl = T.fleetReport(DOCS, w, from, to);
      SUB = { title: t('tp.r.veh') + ' ' + fd(from) + ' – ' + fd(to), xl: ['vehicle-profit-' + to + '.xlsx', [['Vehicles', T.vehicleRows(fl)], ['Trips', T.tripRows(T.trips(DOCS, w, { from: from, to: to }))]]] };
      html = fl.length ? table([t('tp.r.vehicle'), t('tp.t.n'), t('tp.t.freight')].concat(['diesel', 'toll', 'repair'].map(function (k) { return t('tp.k.' + k); }), [t('tp.l.other'), t('tp.t.profit'), t('tp.fixedc'), t('tp.net')]),
        fl.map(function (v) { var s = v.sum; return [esc(v.show), s.n, M(s.freight), M(s.byKind.diesel), M(s.byKind.toll), M(s.byKind.repair), M(s.byKind.police + s.byKind.batta + s.byKind.other + s.commission + s.hamali + v.other), M(s.profit - v.other), M(v.fixed), '<b>' + M(v.net) + '</b>']; })) + '<p class="hint">' + esc(t('tp.r.vehh')) + '</p>' : '<p>' + esc(t('tp.nodata')) + '</p>';
    } else if (sub === 'drv') {
      var dn = {}; mine('tdrv').forEach(function (d) { dn[d.name] = 1; }); names('ttrip', 'driver').forEach(function (n) { dn[n] = 1; });
      var dr = Object.keys(dn).sort().map(function (n) { return T.driverReport(DOCS, w, n, from, to); }).filter(function (d) { return d.n; });
      SUB = { title: t('tp.r.drv') + ' ' + fd(from) + ' – ' + fd(to), xl: ['driver-statement-' + to + '.xlsx', [['Drivers', T.driverRows(dr)]]] };
      html = dr.length ? table([t('tp.driver'), t('tp.t.n'), t('tp.km'), t('tp.dcash'), t('tp.spent'), t('tp.hold'), t('tp.k.batta')], dr.map(function (d) { return [esc(d.name), d.n, d.km || '', M(d.cash), M(d.spent), '<b>' + M(d.hold) + '</b>', M(d.batta)]; })) + '<p class="hint">' + esc(t('tp.r.drvh')) + '</p>' : '<p>' + esc(t('tp.nodata')) + '</p>';
    } else {
      var pd = T.partyDues(DOCS, w, lrLeft());
      SUB = { title: t('tp.r.party'), xl: ['freight-dues-' + NS.today() + '.xlsx', [['Dues', T.dueRowsX(pd)]]] };
      html = pd.length ? '<ul class="gr-list">' + pd.map(function (s, i) {
        return li('<b>' + esc(s.party) + '</b> · ' + M(s.due), esc([s.tripDue ? t('tp.r.tripdue') + ' ' + M(s.tripDue) : '', s.lrDue ? t('tp.r.lrdue') + ' ' + M(s.lrDue) : ''].filter(Boolean).join(' · ')), wa(s.phone, T.dueText(s, w, fd)) + ' ' + (s.trips.length ? btn('data-rcv', String(i), t('tp.addrecv')) : ''), 1);
      }).join('') + '</ul><p class="hint">' + esc(t('tp.r.partyh')) + '</p>' : '<p>' + esc(t('tp.nodues')) + '</p>';
      SUB.pd = pd;
    }
    return html + '<div class="row">' + btn('data-xl', 'rep', t('tp.excel')) + btn('data-pr', 'rep', t('tp.print')) + '</div>';
  }
  function vRep() {
    return head() + repTabs() + (sub === 'party' ? '' : period()) + '<div id="tp-repb">' + repBody() + '</div>';
  }
  function vDocs() {
    var list = T.dueDocs(DOCS, who(), NS.today(), 30), labels = DOCL();
    SUB = { xl: ['vehicle-documents-' + NS.today() + '.xlsx', [['Due', T.docRows(list, labels)]]] };
    var drvPhone = {}; mine('tdrv').forEach(function (d) { drvPhone[d.name] = d.phone; });
    return head() + '<p class="hint">' + esc(t('tp.docsh2')) + '</p>' + (list.length ? '<ul class="gr-list">' + list.map(function (r) {
      var late = r.left < 0;
      return li('<b class="mono">' + esc(r.show) + '</b> ' + esc(labels[r.kind] || r.kind), esc(fd(r.date) + ' · ' + (late ? t('tp.expired', { n: -r.left }) : t('tp.in', { n: r.left }))), wa(r.phone || '', T.reminderText(r, { insurance: 'Insurance', fitness: 'Fitness certificate', permit: 'Permit', pollution: 'Pollution (PUC)', tax: 'Road tax', licence: 'Driving licence' }, fd, who())), late);
    }).join('') + '</ul><div class="row">' + btn('data-xl', 'docs', t('tp.excel')) + '</div>' : '<p>' + esc(t('tp.nodocsdue')) + '</p>');
  }

  /* ---------- the dialog ---------- */
  function render() {
    var d = $('#tp-dlg'), b = $('[data-tb]', d);
    load().then(function () {
      if (!from) { var m = mon(); from = m[0]; to = m[1]; }
      var h = { trips: vTrips, lrs: vLrs, trip: vTrip, veh: vVeh, vehf: vVehForm, vexp: vVexpForm, drv: vDrv, drvf: vDrvForm, rep: vRep, docs: vDocs }[view]();
      b.innerHTML = h; badge();
      if (!d.open) d.showModal ? d.showModal() : d.setAttribute('open', '');
    });
  }
  function badge() {
    var x = $('[data-tp="open"]'); if (!x) return;
    var n = T.dueDocs(DOCS, who(), NS.today()).length; x.textContent = t('tp.open') + (n ? ' (' + n + ')' : '');
  }
  function go(v) { view = v; render(); }
  /* the values typed in the open form go back into `cur` */
  function read() {
    var b = $('#tp-dlg [data-tb]'), g = function (id) { var e = $('#tpf-' + id, b); return e ? e.value : undefined; };
    if (!cur) return;
    if (view === 'trip') {
      ['date', 'reg', 'driver', 'from', 'to', 'km', 'party', 'phone', 'lr', 'freight', 'advance', 'dcash', 'commission', 'hamali'].forEach(function (k) { var v = g(k); if (v !== undefined) cur[k] = v; });
      cur.exp.forEach(function (e, i) { ['k', 'amt', 'by', 'note'].forEach(function (k) { var v = g('e' + i + k); if (v !== undefined) e[k] = v; }); });
      cur.recv.forEach(function (e, i) { ['date', 'amt'].forEach(function (k) { var v = g('r' + i + k); if (v !== undefined) e[k] = v; }); });
    } else if (view === 'vehf') {
      ['reg', 'name', 'owner', 'fixed'].forEach(function (k) { var v = g(k); if (v !== undefined) cur[k] = v; });
      cur.docs = cur.docs || {}; T.DOCKINDS.forEach(function (k) { var v = g('d' + k); if (v !== undefined) cur.docs[k] = v; });
    } else if (view === 'vexp') { ['reg', 'date', 'k', 'amt', 'note'].forEach(function (k) { var v = g(k); if (v !== undefined) cur[k] = v; }); }
    else if (view === 'drvf') { ['name', 'phone', 'licence', 'licExp'].forEach(function (k) { var v = g(k); if (v !== undefined) cur[k] = v; }); }
  }
  function blank(kind) {
    var seller = { name: who() };
    if (kind === 'trip') return { type: 'ttrip', seller: seller, date: NS.today(), reg: '', driver: '', from: '', to: '', party: '', phone: '', lr: '', km: '', freight: '', advance: '', dcash: '', exp: [], commission: '', hamali: '', recv: [] };
    if (kind === 'veh') return { type: 'tveh', seller: seller, reg: '', name: '', owner: 'own', fixed: '', docs: {} };
    if (kind === 'vexp') return { type: 'tvexp', seller: seller, reg: '', date: NS.today(), k: 'repair', amt: '', note: '' };
    return { type: 'tdrv', seller: seller, name: '', phone: '', licence: '', licExp: '' };
  }
  function msg(m) { NS.toast(m, 'bad'); }
  function save(kind) {
    read();
    var c = cur;
    if (!who()) return msg(t('tp.v.biz'));
    if (kind === 'trip') {
      if (!c.date) return msg(t('tp.v.date')); if (!T.normReg(c.reg)) return msg(t('tp.v.reg')); if (!num(c.freight) && !c.exp.length) return msg(t('tp.v.freight'));
      c.reg = T.showReg(c.reg); c.exp = c.exp.filter(function (e) { return num(e.amt); }); c.recv = c.recv.filter(function (e) { return num(e.amt); });
      if (num(c.advance) > num(c.freight) && num(c.freight)) return msg(t('tp.v.adv'));
      if (T.calc(c).balance < -0.004) return msg(t('tp.v.over'));
    } else if (kind === 'veh') {
      if (!T.normReg(c.reg)) return msg(t('tp.v.reg'));
      var dup = mine('tveh').filter(function (v) { return v.id !== c.id && T.normReg(v.reg) === T.normReg(c.reg); })[0]; if (dup) return msg(t('tp.v.dupveh'));
      c.reg = T.showReg(c.reg);
    } else if (kind === 'vexp') { if (!T.normReg(c.reg) || !num(c.amt)) return msg(t('tp.v.vexp')); c.reg = T.showReg(c.reg); }
    else { if (!String(c.name || '').trim()) return msg(t('tp.v.dname')); c.name = c.name.trim(); }
    NSStore.put('doc', c).then(function () { NS.toast(t('tp.saved')); cur = null; view = { trip: 'trips', veh: 'veh', vexp: 'veh', drv: 'drv' }[kind]; render(); }, function (e) { msg(e && e.message || t('tp.v.fail')); });
  }
  function onClick(e) {
    var x = e.target.closest('[data-tv],[data-new],[data-edit],[data-save],[data-del],[data-add],[data-rm],[data-lrtrip],[data-rs],[data-xl],[data-pr],[data-rcv],[data-close]');
    if (!x || x.hasAttribute('data-close')) return;
    if (x.hasAttribute('data-tv')) { cur = null; var v = x.getAttribute('data-tv'); view = v; if (v === 'rep' && !sub) sub = 'veh'; render(); }
    else if (x.hasAttribute('data-new')) { var k = x.getAttribute('data-new'); cur = blank(k); view = { trip: 'trip', veh: 'vehf', vexp: 'vexp', drv: 'drvf' }[k]; if (k === 'trip' && filt.reg) cur.reg = filt.reg; render(); }
    else if (x.hasAttribute('data-edit')) {
      var rec = DOCS.filter(function (d) { return d.id === x.getAttribute('data-edit'); })[0]; if (!rec) return;
      cur = JSON.parse(JSON.stringify(rec)); cur.exp = cur.exp || []; cur.recv = cur.recv || []; view = { ttrip: 'trip', tveh: 'vehf', tvexp: 'vexp', tdrv: 'drvf' }[rec.type]; render();
    }
    else if (x.hasAttribute('data-save')) save(x.getAttribute('data-save'));
    else if (x.hasAttribute('data-del')) {
      var id = x.getAttribute('data-del'), back = { ttrip: 'trips', tveh: 'veh', tvexp: 'veh', tdrv: 'drv' }[cur && cur.type] || 'trips';
      (NS.ask ? NS.ask(t('tp.delask')) : Promise.resolve(window.confirm(t('tp.delask')))).then(function (ok) { if (ok) NSStore.del('doc', id).then(function () { cur = null; view = back; render(); }); });
    }
    else if (x.hasAttribute('data-add')) { read(); if (x.getAttribute('data-add') === 'exp') cur.exp.push({ k: 'diesel', amt: '', by: 'owner', note: '' }); else cur.recv.push({ date: NS.today(), amt: '' }); render(); }
    else if (x.hasAttribute('data-rm')) { read(); var r = x.getAttribute('data-rm'); (r.charAt(0) === 'e' ? cur.exp : cur.recv).splice(+r.slice(1), 1); render(); }
    else if (x.hasAttribute('data-lrtrip')) { var lr = DOCS.filter(function (d) { return d.id === x.getAttribute('data-lrtrip'); })[0]; if (!lr) return; cur = Object.assign(blank('trip'), T.tripFromLr(lr)); view = 'trip'; render(); }
    else if (x.hasAttribute('data-rs')) { sub = x.getAttribute('data-rs'); render(); }
    else if (x.hasAttribute('data-rcv')) {
      var s = SUB.pd[+x.getAttribute('data-rcv')], first = s && s.trips[0]; if (!first) return;
      cur = JSON.parse(JSON.stringify(first.t)); cur.recv = cur.recv || []; cur.recv.push({ date: NS.today(), amt: String(first.bal) }); view = 'trip'; render();
    }
    else if (x.hasAttribute('data-xl')) {
      var a = x.getAttribute('data-xl');
      if (a === 'trips') xl('trips-' + NS.today() + '.xlsx', [['Trips', T.tripRows(T.trips(DOCS, who(), { from: from, to: to }))]]);
      else if (SUB.xl) xl(SUB.xl[0], SUB.xl[1]);
    }
    else if (x.hasAttribute('data-pr')) { var el = $('#tp-repb', $('#tp-dlg')); printHtml(SUB.title, el.innerHTML.replace(/<div class="row">[\s\S]*$/, '')); }
  }
  function onChange(e) {
    var el = e.target;
    if (el.id === 'tpf-from' || el.id === 'tpf-to') { if (el.id === 'tpf-from') from = el.value; else to = el.value; if (view === 'rep') { var b = $('#tp-repb'); if (b) b.innerHTML = repBody(); } else render(); }
    else if (view === 'trip' && /^tpf-(e\d+amt|e\d+by|e\d+k|freight|advance|dcash|commission|hamali|r\d+amt)$/.test(el.id)) {
      read(); var s = $('#tp-dlg .sums'), o = T.calc(cur);
      if (s) s.innerHTML = '<span>' + esc(t('tp.s.cost', { v: M(o.cost) })) + '</span><b>' + esc(t('tp.s.profit', { v: M(o.profit) })) + '</b><span>' + esc(t('tp.s.bal', { v: M(o.balance) })) + '</span>' + (o.dcash ? '<span>' + esc(t('tp.s.hold', { v: M(o.driverBal) })) + '</span>' : '');
    }
    else if (view === 'trip' && el.id === 'tpf-reg') { var dv = mine('ttrip').filter(function (x) { return T.normReg(x.reg) === T.normReg(el.value) && x.driver; }).pop(); var di = $('#tpf-driver'); if (dv && di && !di.value) di.value = dv.driver; }
    else if (view === 'trip' && el.id === 'tpf-lr') {
      var lr2 = DOCS.filter(function (d) { return d.type === 'lr' && d.no === el.value; })[0];
      if (lr2) { var f = T.tripFromLr(lr2); read(); ['from', 'to', 'party', 'phone', 'freight', 'advance', 'reg', 'driver'].forEach(function (k) { if (!String(cur[k] || '').trim() && f[k]) cur[k] = f[k]; }); render(); }
    }
  }

  function init(K0) {
    K = K0;
    var b = $('[data-tp="open"]'); if (b) b.addEventListener('click', function () { view = 'trips'; render(); });
    load().then(badge, function () {});
    if ($('#tp-dlg')) return;
    var x = NS.el('dialog', { id: 'tp-dlg', 'aria-labelledby': 'tp-dlg-h' }, '<div class="dlg-h"><h2 id="tp-dlg-h"></h2><button type="button" class="btn sm" data-close></button></div><div class="dlg-b" data-tb></div>');
    document.body.appendChild(x);
    $('[data-close]', x).addEventListener('click', function () { x.close(); cur = null; badge(); });
    x.addEventListener('click', onClick); x.addEventListener('change', onChange);
    function nm() { $('h2', x).textContent = t('tp.title'); $('[data-close]', x).textContent = t('close'); }
    nm(); document.addEventListener('ns-lang', function () { nm(); if (x.open && !cur) render(); });
  }
  window.NSTripUI = { init: init };
})();
