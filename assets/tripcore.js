/* NSTrip: the pure logic of the transporter trip ledger on bilty.niveshsahayak.in (India plan C).
   Records (all in the 'doc' store, one business = seller.name):
     tveh  vehicle:  { reg, name, owner, docs: { insurance, fitness, permit, pollution, tax } (dates yyyy-mm-dd), fixed (monthly fixed cost, optional) }
     tdrv  driver:   { name, phone, licence, licExp, batta (per trip or per day, optional) }
     ttrip trip:     { date, reg, driver, from, to, party, phone, lr (LR no.), km, freight, advance (taken from the party at loading),
                       dcash (cash handed to the driver), exp: [{ k: diesel|toll|repair|police|batta|other, amt, by: owner|driver, note }],
                       commission, hamali, recv: [{ date, amt }] (freight received later), done }
     tvexp vehicle cost outside a trip: { reg, date, k, amt, note }
   Driver cash is a hand-over, not a cost: costs are the expense lines. What the driver spent from his cash (by:'driver') is set off against it.
   Profit of a trip = freight - commission - hamali - all expense lines. Nothing here reads a server. Tests: node scripts/test_trip.js */
(function (G) {
  'use strict';
  function key(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function n(v) { var x = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(x) ? x : 0; }
  function r2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
  function pad(x) { return String(x).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = String(s || '').split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
  function days(a, b) { var x = parse(a), y = parse(b); return x && y ? Math.round((y - x) / 864e5) : 0; }   /* b - a */
  function addDays(s, k) { var d = parse(s); if (!d) return ''; d.setDate(d.getDate() + k); return iso(d); }
  function normReg(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function showReg(s) { var r = normReg(s), m = /^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/.exec(r); return m ? m[1] + ' ' + m[2] + ' ' + m[3] + ' ' + m[4] : String(s || '').trim().toUpperCase(); }
  function mine(d, type, who) { return d && d.type === type && (!who || key(d.seller && d.seller.name) === key(who)); }
  function inRange(date, from, to) { return (!from || String(date || '') >= from) && (!to || String(date || '') <= to); }
  var KINDS = ['diesel', 'toll', 'repair', 'police', 'batta', 'other'];
  var DOCKINDS = ['insurance', 'fitness', 'permit', 'pollution', 'tax'];

  /* the money of one trip */
  function calc(t) {
    var o = { freight: r2(n(t.freight)), advance: r2(n(t.advance)), commission: r2(n(t.commission)), hamali: r2(n(t.hamali)), dcash: r2(n(t.dcash)), byKind: {}, exp: 0, driverSpent: 0, ownerPaid: 0 };
    KINDS.forEach(function (k) { o.byKind[k] = 0; });
    (t.exp || []).forEach(function (e) {
      var a = n(e.amt); if (!a) return; var k = KINDS.indexOf(e.k) >= 0 ? e.k : 'other';
      o.byKind[k] = r2(o.byKind[k] + a); o.exp = r2(o.exp + a);
      if (e.by === 'driver') o.driverSpent = r2(o.driverSpent + a); else o.ownerPaid = r2(o.ownerPaid + a);
    });
    o.recvLater = r2((t.recv || []).reduce(function (a, x) { return a + n(x.amt); }, 0));
    o.received = r2(o.advance + o.recvLater);
    o.balance = r2(o.freight - o.received);               /* freight still to come from the party */
    o.cost = r2(o.exp + o.commission + o.hamali);
    o.profit = r2(o.freight - o.cost);
    o.driverBal = r2(o.dcash - o.driverSpent);            /* cash the driver still holds (+) or is owed back (-) */
    o.km = n(t.km); o.perKm = o.km > 0 ? r2(o.profit / o.km) : 0;
    return o;
  }
  function trips(docs, who, f) {
    f = f || {};
    return (docs || []).filter(function (d) {
      return mine(d, 'ttrip', who) && inRange(d.date, f.from, f.to) && (!f.reg || normReg(d.reg) === normReg(f.reg)) && (!f.driver || key(d.driver) === key(f.driver)) && (!f.party || key(d.party) === key(f.party));
    }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)) || (a.created || 0) - (b.created || 0); });
  }
  function sumTrips(list) {
    var s = { n: 0, km: 0, freight: 0, exp: 0, commission: 0, hamali: 0, profit: 0, balance: 0, byKind: {} };
    KINDS.forEach(function (k) { s.byKind[k] = 0; });
    list.forEach(function (t) {
      var c = calc(t); s.n++; s.km += c.km; s.freight += c.freight; s.exp += c.exp; s.commission += c.commission; s.hamali += c.hamali; s.profit += c.profit; s.balance += c.balance;
      KINDS.forEach(function (k) { s.byKind[k] += c.byKind[k]; });
    });
    ['km', 'freight', 'exp', 'commission', 'hamali', 'profit', 'balance'].forEach(function (k) { s[k] = r2(s[k]); });
    KINDS.forEach(function (k) { s.byKind[k] = r2(s.byKind[k]); });
    return s;
  }
  /* months between two dates, counted from the 1st of the first month to the end of the last (at least 1): used for the monthly fixed cost */
  function months(from, to) {
    var a = parse(from), b = parse(to); if (!a || !b || b < a) return 0;
    return Math.max(1, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + (b.getDate() >= a.getDate() ? 1 : 0));
  }
  /* profit statement of one vehicle for a period: trips, costs outside trips, fixed monthly cost, net profit */
  function vehicleReport(docs, who, reg, from, to) {
    var tl = trips(docs, who, { reg: reg, from: from, to: to }), s = sumTrips(tl);
    var vx = (docs || []).filter(function (d) { return mine(d, 'tvexp', who) && normReg(d.reg) === normReg(reg) && inRange(d.date, from, to); }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var other = r2(vx.reduce(function (a, x) { return a + n(x.amt); }, 0));
    var veh = (docs || []).filter(function (d) { return mine(d, 'tveh', who) && normReg(d.reg) === normReg(reg); })[0];
    var fixed = veh && n(veh.fixed) > 0 && from && to ? r2(n(veh.fixed) * months(from, to)) : 0;
    return { reg: normReg(reg), show: showReg(reg), trips: tl, vexp: vx, sum: s, other: other, fixed: fixed, net: r2(s.profit - other - fixed), perKm: s.km > 0 ? r2((s.profit - other - fixed) / s.km) : 0 };
  }
  function fleetReport(docs, who, from, to) {
    var regs = {}, out = [];
    (docs || []).forEach(function (d) { if ((mine(d, 'tveh', who) || mine(d, 'ttrip', who) || mine(d, 'tvexp', who)) && normReg(d.reg)) regs[normReg(d.reg)] = d.reg; });
    Object.keys(regs).sort().forEach(function (r) { out.push(vehicleReport(docs, who, r, from, to)); });
    return out;
  }
  /* driver statement: trips driven, cash handed over, spent from it, batta earned, and what is left */
  function driverReport(docs, who, name, from, to) {
    var tl = trips(docs, who, { driver: name, from: from, to: to }), r = { name: name, trips: tl, n: tl.length, km: 0, cash: 0, spent: 0, batta: 0, freight: 0 };
    tl.forEach(function (t) {
      var c = calc(t); r.km += c.km; r.cash += c.dcash; r.spent += c.driverSpent; r.freight += c.freight;
      (t.exp || []).forEach(function (e) { if (e.k === 'batta') r.batta += n(e.amt); });
    });
    ['km', 'cash', 'spent', 'batta', 'freight'].forEach(function (k) { r[k] = r2(r[k]); });
    r.hold = r2(r.cash - r.spent);   /* cash with the driver (+) or owed to him (-) before batta */
    return r;
  }
  /* freight dues by party: trips with balance freight, plus lorry receipts not paid. lrLeft(doc) -> amount still due on an LR (the App's books); a LR whose
     number is on a trip is counted once, through the trip. Returns [{ party, phone, trips: [..], lrs: [..], tripDue, lrDue, due }], biggest first. */
  function partyDues(docs, who, lrLeft) {
    var by = {}, linked = {};
    function slot(name, phone) { var k = key(name) || '(no name)'; var s = by[k] = by[k] || { party: String(name || '').trim() || '(no name)', phone: '', trips: [], lrs: [], tripDue: 0, lrDue: 0, due: 0 }; if (phone && !s.phone) s.phone = phone; return s; }
    trips(docs, who).forEach(function (t) {
      if (t.lr) linked[key(t.lr)] = 1;
      var c = calc(t); if (c.balance <= 0.004) return;
      var s = slot(t.party, t.phone); s.trips.push({ t: t, bal: c.balance }); s.tripDue = r2(s.tripDue + c.balance);
    });
    (docs || []).filter(function (d) { return d && d.type === 'lr' && (!who || key(d.seller && d.seller.name) === key(who)); }).forEach(function (d) {
      if (linked[key(d.no)]) return;
      var left = lrLeft ? n(lrLeft(d)) : (d.fstat === 'paid' || d.status === 'paid' ? 0 : n(d.total) - n(d.adv));
      if (left <= 0.004) return;
      var p = d.buyer || {}, s = slot(p.name, p.phone); s.lrs.push({ d: d, bal: r2(left) }); s.lrDue = r2(s.lrDue + left);
    });
    return Object.keys(by).map(function (k) { var s = by[k]; s.due = r2(s.tripDue + s.lrDue); return s; }).filter(function (s) { return s.due > 0.004; }).sort(function (a, b) { return b.due - a.due; });
  }
  /* lorry receipts that no trip carries yet (offered as "add to trips") */
  function unlinkedLrs(docs, who) {
    var linked = {}; trips(docs, who).forEach(function (t) { if (t.lr) linked[key(t.lr)] = 1; });
    return (docs || []).filter(function (d) { return d && d.type === 'lr' && (!who || key(d.seller && d.seller.name) === key(who)) && !linked[key(d.no)]; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(b.no).localeCompare(String(a.no)); });
  }
  /* a trip prefilled from a lorry receipt (the payer is in buyer once saved; cnor holds the consignor when the consignee pays) */
  function tripFromLr(lr) {
    var p = lr.buyer || {};
    return { date: lr.date || '', reg: lr.veh || '', driver: lr.driver || '', from: lr.from || '', to: lr.to || '', party: p.name || '', phone: p.phone || '', lr: lr.no || '',
      km: '', freight: n(lr.total) ? String(n(lr.total)) : '', advance: n(lr.adv) ? String(n(lr.adv)) : '', dcash: '', exp: [], commission: '', hamali: '', recv: [] };
  }
  /* vehicle and driver documents that are overdue or fall due within `ahead` days (default 30). Returns [{ kind, what, reg|name, date, left (days; negative = overdue) }] most urgent first */
  function dueDocs(docs, who, today, ahead) {
    var a = ahead != null ? ahead : 30, out = [];
    (docs || []).forEach(function (d) {
      if (mine(d, 'tveh', who)) DOCKINDS.forEach(function (k) { var dt = d.docs && d.docs[k]; if (dt) { var l = days(today, dt); if (l <= a) out.push({ kind: k, what: 'veh', reg: d.reg, show: showReg(d.reg), date: dt, left: l, name: d.name || '' }); } });
      if (mine(d, 'tdrv', who) && d.licExp) { var l2 = days(today, d.licExp); if (l2 <= a) out.push({ kind: 'licence', what: 'drv', reg: '', show: d.name, date: d.licExp, left: l2, name: d.name, phone: d.phone || '' }); }
    });
    return out.sort(function (x, y) { return x.left - y.left || String(x.show).localeCompare(String(y.show)); });
  }
  function reminderText(r, labels, fmt, shop) {
    var f = fmt || function (x) { return x; }, w = (labels && labels[r.kind]) || r.kind;
    return (r.what === 'drv' ? 'Driver ' + r.show + ': ' : 'Vehicle ' + r.show + ': ') + w + (r.left < 0 ? ' expired on ' : ' expires on ') + f(r.date) + (r.left < 0 ? ' (' + (-r.left) + ' days ago)' : ' (in ' + r.left + ' days)') + '. Please renew.' + (shop ? ' ' + shop : '');
  }
  function phone10(p) { var d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? d : ''; }
  function dueText(s, shop, fmt) {
    var f = fmt || function (x) { return x; };
    return 'Hello ' + s.party + ', freight due to ' + (shop || 'us') + ': Rs ' + s.due.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '.' +
      s.trips.map(function (x) { return ' ' + (x.t.lr ? 'LR ' + x.t.lr + ' ' : '') + f(x.t.date) + ' ' + (x.t.from || '') + '-' + (x.t.to || '') + ' Rs ' + x.bal; }).join(';') +
      s.lrs.map(function (x) { return ' LR ' + x.d.no + ' ' + f(x.d.date) + ' Rs ' + x.bal; }).join(';') + ' Please pay. Thank you.';
  }
  /* rows for Excel */
  function tripRows(list) {
    return [['Date', 'Vehicle', 'Driver', 'From', 'To', 'Party', 'LR no.', 'Km', 'Freight', 'Advance taken', 'Received later', 'Balance freight', 'Diesel', 'Toll', 'Repair', 'Police', 'Batta', 'Other', 'Commission', 'Hamali', 'Total cost', 'Profit', 'Driver cash given']].concat(list.map(function (t) {
      var c = calc(t), b = c.byKind; return [t.date, showReg(t.reg), t.driver || '', t.from || '', t.to || '', t.party || '', t.lr || '', c.km || '', c.freight, c.advance, c.recvLater, c.balance, b.diesel, b.toll, b.repair, b.police, b.batta, b.other, c.commission, c.hamali, c.cost, c.profit, c.dcash];
    }));
  }
  function vehicleRows(fleet) {
    return [['Vehicle', 'Trips', 'Km', 'Freight', 'Diesel', 'Toll', 'Repair', 'Police', 'Batta', 'Other trip costs', 'Commission', 'Hamali', 'Trip profit', 'Other vehicle costs', 'Fixed cost', 'Net profit', 'Net per km']].concat(fleet.map(function (v) {
      var s = v.sum, b = s.byKind; return [v.show, s.n, s.km || '', s.freight, b.diesel, b.toll, b.repair, b.police, b.batta, b.other, s.commission, s.hamali, s.profit, v.other, v.fixed, v.net, v.perKm || ''];
    }));
  }
  function driverRows(list) {
    return [['Driver', 'Trips', 'Km', 'Freight carried', 'Cash given', 'Spent from it', 'Cash with driver', 'Batta paid']].concat(list.map(function (d) { return [d.name, d.n, d.km || '', d.freight, d.cash, d.spent, d.hold, d.batta]; }));
  }
  function dueRowsX(list) {
    return [['Party', 'Phone', 'Trip freight due', 'Lorry receipts due', 'Total due']].concat(list.map(function (s) { return [s.party, s.phone, s.tripDue, s.lrDue, s.due]; }));
  }
  function docRows(list, labels) {
    return [['Vehicle / driver', 'Document', 'Valid till', 'Days left']].concat(list.map(function (r) { return [r.show, (labels && labels[r.kind]) || r.kind, r.date, r.left]; }));
  }
  var API = { key: key, n: n, r2: r2, normReg: normReg, showReg: showReg, days: days, addDays: addDays, months: months, KINDS: KINDS, DOCKINDS: DOCKINDS, calc: calc, trips: trips, sumTrips: sumTrips,
    vehicleReport: vehicleReport, fleetReport: fleetReport, driverReport: driverReport, partyDues: partyDues, unlinkedLrs: unlinkedLrs, tripFromLr: tripFromLr, dueDocs: dueDocs,
    reminderText: reminderText, phone10: phone10, dueText: dueText, tripRows: tripRows, vehicleRows: vehicleRows, driverRows: driverRows, dueRowsX: dueRowsX, docRows: docRows };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSTrip = API;
})(this);
