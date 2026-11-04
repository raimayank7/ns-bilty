/* bilty.niveshsahayak.in: a transporter's lorry receipt (LR, bilty, consignment note) and freight bill.
   Record type 'lr'. The consignor is kept in `buyer`, the consignee in `cnee`; the party who pays the freight is the
   customer in the Nivesh Sahayak App. GST on goods transport agency (GTA) service: reverse charge 5% paid by the
   recipient (the usual case), or forward charge 5% without input tax credit, or 18% with credit (12% before 22 Sep 2025). */
(function () {
  'use strict';
  var $ = NS.$, esc = NS.esc, num = NS.num, r2 = NS.r2, t = NS.t;
  var COPIES = ['Consignor copy', 'Consignee copy', 'Driver copy', 'Office copy'];
  var CHG = [['hamali', 'Loading / hamali'], ['door', 'Door delivery'], ['st', 'Statistical / LR charges'], ['other', 'Other charges']];
  function pkg() { return { n: '', pack: 'Bags', desc: '', wt: '', cwt: '' }; }
  function party() { return { name: '', addr: '', state: '', gstin: '', phone: '' }; }
  function sums(d) {
    var o = { pk: 0, wt: 0, cwt: 0 };
    d.pkgs.forEach(function (p) { o.pk += num(p.n); o.wt += num(p.wt); o.cwt += num(p.cwt || p.wt); });
    o.freight = d.basis === 'fixed' ? r2(num(d.frate)) : d.basis === 'kg' ? r2(o.cwt * num(d.frate)) : d.basis === 'ton' ? r2(o.cwt / 1000 * num(d.frate)) : r2(o.pk * num(d.frate));
    o.chg = r2(CHG.reduce(function (a, c) { return a + num(d.chg[c[0]]); }, 0));
    o.taxable = r2(o.freight + o.chg);
    var g = d.gstMode === 'f18' ? 18 : d.gstMode === 'f5' ? 5 : 0; o.g = g;
    o.tax = r2(o.taxable * g / 100);
    var home = d.seller.state, other = (d.payer === 'cnee' ? d.cnee : d.buyer).state;
    o.intra = !home || !other || home === other;
    if (o.intra) { o.cgst = r2(o.tax / 2); o.sgst = r2(o.tax - o.cgst); o.igst = 0; } else { o.igst = o.tax; o.cgst = o.sgst = 0; }
    var total = r2(o.taxable + o.tax); o.roundOff = r2(Math.round(total) - total); o.total = r2(total + o.roundOff);
    o.rcm = d.gstMode === 'rcm' ? r2(o.taxable * 5 / 100) : 0;
    o.adv = num(d.adv); o.due = d.fstat === 'paid' ? 0 : r2(o.total - o.adv);
    return o;
  }
  function who(d) { return d.payer === 'cnee' ? d.cnee : d.buyer; }

  NS.kit({
    type: 'lr', prefix: 'LR', digits: 4, paper: 'a5', papers: ['a5', 'a4'], copies: 4, copyLabels: COPIES,
    name: function (d) { return d.print === 'bill' ? 'Freight Bill' : 'Lorry Receipt'; },
    blank: function () {
      return { print: 'lr', from: '', to: '', veh: '', driver: '', dphone: '', invNo: '', invVal: '', ewb: '', risk: 'owner', basis: 'fixed', frate: '', adv: '',
        chg: { hamali: '', door: '', st: '', other: '' }, fstat: 'topay', payer: 'cnee', gstMode: 'rcm', cnee: party(), pkgs: [pkg()], delivery: 'godown' };
    },
    newRow: function () { return pkg(); },
    keepOnNew: function (d) { return { gstMode: d.gstMode, paper: d.paper, from: d.from, copies: d.copies }; },
    party: 'customer',
    form: function (K) {
      var pf = function (pre, lg) {
        return K.card(lg, '<div class="fg">' + K.f(pre + '.name', t('l.cname'), { wide: true }) + K.f(pre + '.addr', t('l.addr'), { type: 'textarea', wide: true }) +
          K.f(pre + '.state', t('l.state'), { type: 'select', opts: K.states() }) + K.f(pre + '.gstin', t('l.gstin'), { max: 15, ltr: 1 }) + K.f(pre + '.phone', t('l.phone'), { type: 'tel', mode: 'tel', ltr: 1 }) + '</div>');
      };
      return K.numCard(K.f('from', t('lr.from'), { hint: '' }) + K.f('to', t('lr.to')) + K.f('veh', t('l.veh'), { ltr: 1, ph: 'PB10AB1234' }) + K.f('driver', t('lr.driver')) + K.f('dphone', t('lr.dphone'), { type: 'tel', mode: 'tel', ltr: 1 }) +
          K.f('print', t('lr.print'), { type: 'select', opts: [['lr', t('lr.plr')], ['bill', t('lr.pbill')]], hint: t('lr.printh') }), t('lr.lg')) +
        pf('buyer', t('lr.cnor')) + pf('cnee', t('lr.cnee')) +
        K.card(t('lr.goods'), K.list('pkgs', t('lr.addpkg')) + '<div class="fg">' +
          K.f('invNo', t('lr.inv'), { ltr: 1 }) + K.f('invVal', t('lr.invval'), { mode: 'decimal', ltr: 1 }) + K.f('ewb', t('lr.ewb'), { mode: 'numeric', ltr: 1, max: 12, hint: t('lr.ewbh') }) +
          K.f('risk', t('lr.risk'), { type: 'select', opts: [['owner', t('lr.rowner')], ['carrier', t('lr.rcarrier')]] }) + K.f('delivery', t('lr.deliv'), { type: 'select', opts: [['godown', t('lr.dgod')], ['door', t('lr.ddoor')]] }) + '</div>') +
        K.card(t('lr.freight'), '<div class="fg">' +
          K.f('basis', t('lr.basis'), { type: 'select', opts: [['fixed', t('lr.bfix')], ['kg', t('lr.bkg')], ['ton', t('lr.bton')], ['pkg', t('lr.bpkg')]] }) + K.f('frate', t('lr.frate'), { mode: 'decimal', ltr: 1 }) +
          CHG.map(function (c) { return K.f('chg.' + c[0], t('lr.c.' + c[0]), { mode: 'decimal', ltr: 1 }); }).join('') +
          K.f('fstat', t('lr.fstat'), { type: 'select', opts: [['paid', t('lr.paid')], ['topay', t('lr.topay')], ['tbb', t('lr.tbb')]] }) +
          K.f('payer', t('lr.payer'), { type: 'select', opts: [['cnor', t('lr.cnor')], ['cnee', t('lr.cnee')]] }) + K.f('adv', t('lr.adv'), { mode: 'decimal', ltr: 1, show: '!fstat=paid' }) +
          K.f('gstMode', t('lr.gst'), { type: 'select', wide: true, opts: [['rcm', t('lr.grcm')], ['f5', t('lr.gf5')], ['f18', t('lr.gf18')], ['ex', t('lr.gex')]], hint: t('lr.gsth') }) +
          '<div class="sums wide" id="ed-sums" aria-live="polite"></div></div>') +
        K.bizCard({ lg: t('lr.gta') }) + K.lookCard();
    },
    rows: {
      pkgs: function (p, i, K) {
        return K.rf('pkgs', i, 'n', t('lr.npk'), { mode: 'numeric', ltr: 1 }) + K.rf('pkgs', i, 'pack', t('lr.pack'), { list: 'dl-pack' }) +
          K.rf('pkgs', i, 'desc', t('lr.said'), { cls: 'it-d' }) + K.rf('pkgs', i, 'wt', t('lr.wt'), { mode: 'decimal', ltr: 1 }) + K.rf('pkgs', i, 'cwt', t('lr.cwt'), { mode: 'decimal', ltr: 1 }) +
          (i ? '' : '<datalist id="dl-pack"><option value="Bags"><option value="Boxes"><option value="Cartons"><option value="Bundles"><option value="Drums"><option value="Bales"><option value="Pieces"><option value="Loose"></datalist>');
      }
    },
    wire: function (ed, K) {
      var n = $('[data-b="cnee.name"]', ed);
      if (n) NS.suggest(n, function () { return NSStore.list('party'); }, function (x) { return x.name; }, function (p) { var d = K.doc(); d.cnee = { name: p.name, addr: p.addr || '', state: p.state || '', gstin: p.gstin || '', phone: p.phone || '' }; K.refill(); });
    },
    input: function (p, el, d, K) {
      if (p === 'cnee.gstin' && NS.gstinCheck(el.value).ok && NS.gstinCheck(el.value).state && !d.cnee.state) { d.cnee.state = NS.gstinCheck(el.value).state; K.refill(); }
      if (p === 'veh') { d.veh = el.value.toUpperCase().replace(/\s+/g, ''); }
    },
    sums: sums,
    edSums: function (d, o) {
      return '<span>' + esc(t('lr.s.pk', { n: o.pk, w: NS.qty(o.cwt) })) + '</span><span>' + esc(t('lr.s.fr', { v: NS.money(o.taxable) })) + '</span>' + (o.tax ? '<span>' + esc(t('sum.gst', { v: NS.money(o.tax) })) + '</span>' : '') +
        '<b>' + esc(t('sum.total', { v: NS.money(o.total) })) + '</b>' + (o.rcm ? '<span>' + esc(t('lr.s.rcm', { v: NS.money(o.rcm) })) + '</span>' : '') + (o.due ? '<span>' + esc(t('lr.s.due', { v: NS.money(o.due) })) + '</span>' : '');
    },
    validate: function (d, o) {
      var p = [];
      if (!String(d.buyer.name || '').trim()) p.push(['k-buyer-name', t('lr.v.cnor')]);
      if (!String(d.cnee.name || '').trim()) p.push(['k-cnee-name', t('lr.v.cnee')]);
      if (!String(d.from).trim() || !String(d.to).trim()) p.push([!String(d.from).trim() ? 'k-from' : 'k-to', t('lr.v.route')]);
      if (!o.pk && !o.wt) p.push(['r-pkgs-n-0', t('lr.v.pkg')]);
      if (d.cnee.gstin && !NS.gstinCheck(d.cnee.gstin).ok) p.push(['k-cnee-gstin', t('v.bg')]);
      if ((d.gstMode === 'f5' || d.gstMode === 'f18') && !d.seller.gstin) p.push(['k-seller-gstin', t('v.tax')]);
      if (d.ewb && !/^\d{12}$/.test(d.ewb)) p.push(['k-ewb', t('lr.v.ewb')]);
      return p;
    },
    confirm: function (d) { return num(d.invVal) > 50000 && !d.ewb ? t('lr.c.ewb') : ''; },
    /* for the books: the freight as one line, the payer as the customer */
    record: function (rec, o) {
      var g = o.g; rec.kind = g ? 'tax' : 'plain'; rec.withGst = !!g;
      rec.items = [{ desc: 'Freight ' + (rec.from || '') + ' to ' + (rec.to || '') + ' (LR ' + rec.no + ')', hsn: '9965', qty: 1, unit: 'Trip', rate: String(o.taxable), disc: '', gst: g }];
      rec.status = rec.fstat === 'paid' ? 'paid' : 'unpaid';
      rec.pos = (who(rec) || {}).state || '';
      if (rec.payer === 'cnee') { rec.cnor = rec.buyer; rec.buyer = rec.cnee; }   /* the App reads the payer as the customer */
    },
    load: function (d) { if (d.cnor) { d.buyer = d.cnor; delete d.cnor; } },
    saved: function (rec) {
      /* the consignee is saved to the parties too */
      var c = rec.payer === 'cnee' ? rec.cnor : rec.cnee; if (!c || !String(c.name || '').trim()) return;
      NSStore.list('party').then(function (all) {
        var k = String(c.name).trim().toLowerCase(), hit = all.filter(function (x) { return String(x.name || '').trim().toLowerCase() === k; })[0];
        if (!hit) NSStore.put('party', { name: c.name.trim(), addr: c.addr || '', state: c.state || '', gstin: c.gstin || '', phone: c.phone || '', role: 'customer' });
      });
    },
    copyOf: function (d) { d.veh = ''; d.driver = ''; d.dphone = ''; d.invNo = ''; d.invVal = ''; d.ewb = ''; d.adv = ''; },
    histName: function (d) { return (d.from || '') + ' → ' + (d.to || '') + ' · ' + (d.cnee && d.cnee.name || ''); },
    histText: function (d) { return [d.veh, d.cnee && d.cnee.name, d.invNo, d.ewb].join(' '); },
    histPill: function (d) { return ' <span class="pill ' + (d.fstat === 'paid' ? 'ok' : '') + '">' + esc(t('lr.' + (d.fstat || 'topay'))) + '</span>'; },
    shareText: function (d, o) { return '\n' + (d.from || '') + ' to ' + (d.to || '') + (d.veh ? '\nVehicle: ' + d.veh : '') + (o.due ? '\nFreight due: ' + NS.money(o.due) : ''); },
    upiShare: false,
    sheet: function (d, o, K, label) {
      var bill = d.print === 'bill', s = d.seller, pay = who(d);
      var gstLine = d.gstMode === 'rcm' ? 'GST on this freight is payable by the ' + (d.payer === 'cnee' ? 'consignee' : 'consignor') + ' under reverse charge (5%). Not charged by the transporter.'
        : d.gstMode === 'ex' ? 'GST: exempt / not applicable on this consignment.' : 'GST charged by the transporter (goods transport agency) at ' + o.g + '% under forward charge.';
      var meta = [[bill ? 'Bill No.' : 'LR No.', '<span class="mono">' + esc(d.no) + '</span>'], ['Date', NS.fmtDate(d.date)], ['From', esc(d.from)], ['To', esc(d.to)], ['Vehicle No.', '<span class="mono">' + esc(d.veh) + '</span>'],
        d.driver ? ['Driver', esc(d.driver) + (d.dphone ? ' (' + esc(d.dphone) + ')' : '')] : null, d.invNo ? ['Invoice No.', esc(d.invNo)] : null, num(d.invVal) ? ['Value of goods', NS.money(num(d.invVal))] : null,
        d.ewb ? ['E-way bill No.', '<span class="mono">' + esc(d.ewb) + '</span>'] : null, ['Freight', { paid: 'PAID', topay: 'TO PAY', tbb: 'TO BE BILLED' }[d.fstat]],
        ['Risk', d.risk === 'carrier' ? 'Carrier’s risk' : 'Owner’s risk'], ['Delivery', d.delivery === 'door' ? 'Door delivery' : 'Godown delivery']];
      var pk = '<table class="lines"><thead><tr><th class="n">Pkgs</th><th>Packing</th><th class="l">Said to contain</th><th class="n">Actual wt (kg)</th><th class="n">Charged wt (kg)</th></tr></thead><tbody>' +
        d.pkgs.filter(function (p) { return p.n || p.desc || p.wt; }).map(function (p) { return '<tr><td class="n">' + esc(p.n) + '</td><td>' + esc(p.pack) + '</td><td class="l">' + esc(p.desc) + '</td><td class="n">' + (num(p.wt) ? NS.qty(num(p.wt)) : '') + '</td><td class="n">' + (num(p.cwt || p.wt) ? NS.qty(num(p.cwt || p.wt)) : '') + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><th class="n">' + o.pk + '</th><th></th><th class="l">Total</th><th class="n">' + NS.qty(o.wt) + '</th><th class="n">' + NS.qty(o.cwt) + '</th></tr></tfoot></table>';
      var basis = { fixed: 'Fixed', kg: NS.money(num(d.frate)) + ' per kg', ton: NS.money(num(d.frate)) + ' per tonne', pkg: NS.money(num(d.frate)) + ' per package' }[d.basis];
      var tot = K.tot([['Freight (' + basis + ')', NS.money(o.freight)]].concat(CHG.filter(function (c) { return num(d.chg[c[0]]); }).map(function (c) { return [c[1], NS.money(num(d.chg[c[0]]))]; }))
        .concat([o.tax ? ['Taxable value', NS.money(o.taxable)] : null, o.cgst ? ['CGST ' + o.g / 2 + '%', NS.money(o.cgst)] : null, o.sgst ? ['SGST ' + o.g / 2 + '%', NS.money(o.sgst)] : null, o.igst ? ['IGST ' + o.g + '%', NS.money(o.igst)] : null,
          o.roundOff ? ['Round off', (o.roundOff > 0 ? '+' : '−') + NS.money(Math.abs(o.roundOff))] : null, ['Total freight', NS.money(o.total), 'grand'], o.adv && d.fstat !== 'paid' ? ['Advance received', '−' + NS.money(o.adv)] : null,
          o.due ? ['Balance ' + (d.fstat === 'topay' ? 'to pay at delivery' : 'to be billed'), NS.money(o.due)] : null]));
      return K.open(d, 'lr') + K.head(d, bill ? 'FREIGHT BILL' : 'LORRY RECEIPT / CONSIGNMENT NOTE', label || '', s.pan ? '<p>PAN: <b class="mono">' + esc(s.pan) + '</b></p>' : '') + K.meta(meta) +
        '<div class="parties">' + K.party(d.buyer, 'Consignor') + K.party(d.cnee, 'Consignee') + '</div>' + pk +
        '<div class="foot"><div class="foot-l">' + K.words(o.total) + '<p class="small"><b>Freight payable by:</b> ' + esc(pay.name || (d.payer === 'cnee' ? 'consignee' : 'consignor')) + (pay.gstin ? ' (GSTIN ' + esc(pay.gstin) + ')' : '') + '</p>' +
          '<p class="small">' + gstLine + ' SAC 9965.</p>' + (d.notes ? '<p class="small">' + esc(d.notes).replace(/\n/g, '<br>') + '</p>' : '') +
          (bill ? '' : '<p class="small">Goods received in apparent good order, contents and value unknown to the transporter (said to contain).</p>') +
        '</div><div class="foot-r">' + tot + '</div></div>' +
        '<div class="signs">' + (bill ? '' : K.blankSign('', 'Consignor’s signature')) + (bill ? '' : K.blankSign('', 'Received by consignee')) + K.sign(d, '', 'For the transporter') + '</div>' + K.made() + '</div>';
    }
  });
})();
