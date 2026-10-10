// ── EXPORT ──
function getWeekSessions() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now); monday.setDate(now.getDate() - day + 1); monday.setHours(0,0,0,0);
  return state.sessions.filter(s => new Date(s.start) >= monday);
}


// ── HELPERS GRAPHIQUES SVG (pour export PDF) ──
// Génère des graphiques en SVG natif (pas de dépendance externe/CDN,
// compatible impression navigateur → "Enregistrer en PDF").
function svgBarChart(labels, values, opts) {
  opts = opts || {};
  const w = opts.width || 680, h = opts.height || 220;
  const padL = 40, padR = 10, padT = 10, padB = 30;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const maxVal = Math.max(1, ...values) * 1.15;
  const n = values.length;
  const gap = 6;
  const barW = Math.max(2, (plotW / n) - gap);
  const color = opts.color || '#1a73e8';

  let bars = '';
  let labelsSvg = '';
  const gridLines = [0, 1, 2, 3].map(g => {
    const y = padT + plotH - (g / 3) * plotH;
    const val = (maxVal * g / 3).toFixed(1);
    return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#e0e0e0" stroke-width="1"/><text x="2" y="${y + 4}" font-size="9" fill="#888">${val}${opts.unit || ''}</text>`;
  }).join('');

  values.forEach((v, i) => {
    const x = padL + i * (plotW / n) + (plotW / n - barW) / 2;
    const barH = (v / maxVal) * plotH;
    bars += `<rect x="${x}" y="${padT + plotH - barH}" width="${barW}" height="${barH}" fill="${color}" rx="2"/>`;
    if (n <= 14 || i % Math.ceil(n / 14) === 0) {
      labelsSvg += `<text x="${x + barW / 2}" y="${h - 6}" font-size="9" fill="#888" text-anchor="middle">${labels[i]}</text>`;
    }
  });

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    ${gridLines}
    ${bars}
    ${labelsSvg}
  </svg>`;
}

function svgDonutChart(segments, opts) {
  opts = opts || {};
  const size = opts.size || 200;
  const cx = size / 2, cy = size / 2, r = size / 2 - 10, innerR = r * 0.55;
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return '<div style="font-size:12px;color:#888;">Aucune donnée</div>';

  let angle = -Math.PI / 2;
  let paths = '';
  let legend = '';
  segments.forEach(seg => {
    const frac = seg.value / total;
    const startAngle = angle;
    const endAngle = angle + frac * 2 * Math.PI;
    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(startAngle), iy1 = cy + innerR * Math.sin(startAngle);
    const ix2 = cx + innerR * Math.cos(endAngle), iy2 = cy + innerR * Math.sin(endAngle);
    const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;
    paths += `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z" fill="${seg.color}"/>`;
    legend += `<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#333;margin-bottom:3px;"><span style="width:10px;height:10px;border-radius:2px;background:${seg.color};display:inline-block;"></span>${seg.label}: ${seg.value}${opts.unit || ''} (${(frac * 100).toFixed(0)}%)</div>`;
    angle = endAngle;
  });

  return `<div style="display:flex;align-items:center;gap:20px;">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>
    <div>${legend}</div>
  </div>`;
}

// Prépare les données des graphiques inclus dans l'export PDF : heures
// travaillées sur 12 semaines, répartition des congés, revenus sur 6 mois.
function buildPdfChartsHtml() {
  let out = '<h2>📊 Graphiques</h2>';

  const now = new Date();
  const thisMonday = getMondayOf(now);
  const weekLabels = [], weekValues = [];
  for (let i = 11; i >= 0; i--) {
    const wkStart = new Date(thisMonday); wkStart.setDate(thisMonday.getDate() - i * 7);
    const wkEnd = new Date(wkStart); wkEnd.setDate(wkStart.getDate() + 7);
    const ms = state.sessions.filter(s => s.start >= wkStart.getTime() && s.start < wkEnd.getTime()).reduce((a, s) => a + (s.net || 0), 0);
    weekLabels.push('S' + wkStart.getDate() + '/' + (wkStart.getMonth() + 1));
    weekValues.push(Math.round((ms / 3600000) * 10) / 10);
  }
  out += '<h3>Heures travaillées — 12 dernières semaines</h3>';
  out += svgBarChart(weekLabels, weekValues, { color: '#1a73e8', unit: 'h' });

  if (typeof state.conges !== 'undefined' && state.conges.length) {
    const congeTotals = {};
    state.conges.forEach(c => { congeTotals[c.type] = (congeTotals[c.type] || 0) + c.days; });
    const segments = Object.keys(congeTotals).map(t => ({
      label: getCongeTypeLabel(t), value: congeTotals[t], color: getCongeTypeColor(t)
    }));
    if (segments.length) {
      out += '<h3>Répartition des congés pris (tous types confondus)</h3>';
      out += svgDonutChart(segments, { unit: 'j' });
    }
  }

  if (remuneration.enabled && remuneration.tauxHoraire) {
    const monthLabels = [], monthValues = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const brut = calcGainsMois(d.getFullYear(), d.getMonth()) + getPrimesForMonth(d.getFullYear(), d.getMonth());
      monthLabels.push(d.toLocaleDateString('fr-FR', { month: 'short' }));
      monthValues.push(Math.round(brut));
    }
    out += '<h3>Revenus bruts estimés — 6 derniers mois (primes incluses)</h3>';
    out += svgBarChart(monthLabels, monthValues, { color: '#3ecf8e', unit: '€' });
  }

  return out;
}

function exportPDF() {
    const sessions = state.sessions;
    if (!sessions.length) { showToast('Aucune session à exporter'); return; }

    // Week key helper (ISO week), basée sur l'horodatage réel (s.date est un texte
    // affiché en français, pas une date ISO exploitable pour du calcul de date)
    function weekKey(ts) {
      const d = new Date(ts);
      d.setHours(0, 0, 0, 0);
      const day = d.getDay() || 7;
      const mon = new Date(d); mon.setDate(d.getDate() - day + 1);
      const thu = new Date(mon); thu.setDate(mon.getDate() + 3);
      const year = thu.getFullYear();
      const jan1 = new Date(year, 0, 1);
      const w = Math.ceil(((thu - jan1) / 86400000 + jan1.getDay() + 1) / 7);
      return { key: `${year}-S${String(w).padStart(2,'0')}`, week: w, year };
    }

    const fmtMs = ms => {
      if (ms < 0) ms = 0;
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      return h + 'h' + String(m).padStart(2, '0');
    };

    // Group by day (clé ISO dérivée de s.start, triable et parsable de façon fiable)
    const byDay = {};
    sessions.forEach(s => {
      const dayKey = toLocalISO(new Date(s.start));
      if (!byDay[dayKey]) byDay[dayKey] = [];
      byDay[dayKey].push(s);
    });

    // Group by week
    const byWeek = {};
    sessions.forEach(s => {
      const { key, week, year } = weekKey(s.start);
      if (!byWeek[key]) byWeek[key] = { week, year, sessions: [] };
      byWeek[key].sessions.push(s);
    });

    // Group by year
    const byYear = {};
    sessions.forEach(s => {
      const y = String(new Date(s.start).getFullYear());
      if (!byYear[y]) byYear[y] = [];
      byYear[y].push(s);
    });

    let html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Historique Orvia</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #111; background: #fff; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 18px; color: #1a73e8; margin-top: 36px; margin-bottom: 10px;
         border-bottom: 2px solid #1a73e8; padding-bottom: 6px; }
    h3 { font-size: 14px; color: #444; margin-top: 18px; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 12px; }
    th { background: #1a73e8; color: #fff; padding: 7px 10px; text-align: left; }
    td { padding: 6px 10px; border-bottom: 1px solid #e0e0e0; }
    tr:nth-child(even) td { background: #f5f8ff; }
    .total td { font-weight: bold; background: #e8f0fe !important; }
    .week-row td:first-child { font-weight: 700; color: #1a73e8; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>📋 Historique Orvia</h1>
  <p style="color:#888;font-size:12px;">Exporté le ${new Date().toLocaleDateString('fr-FR', {day:'2-digit', month:'long', year:'numeric'})}</p>`;

    // ══ PAR JOUR ══
    html += '<h2>📅 Par jour</h2>';
    Object.keys(byDay).sort().forEach(date => {
      const ss = byDay[date];
      const total = ss.reduce((a, s) => a + s.net, 0);
      const d = new Date(date + 'T00:00:00');
      const label = d.toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
      html += `<h3>${label} — <span style="color:#1a73e8">${fmtMs(total)}</span></h3>
      <table>
        <tr><th>Début</th><th>Fin</th><th>Pause</th><th>Net</th><th>Note</th></tr>`;
      ss.forEach(s => {
        const dep = new Date(s.start).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
        const arr = new Date(s.end).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
        html += `<tr><td>${dep}</td><td>${arr}</td><td>${fmtMs(s.pauseMs || 0)}</td><td>${fmtMs(s.net)}</td><td>${escapeHtml(s.note || '')}</td></tr>`;
      });
      html += `<tr class="total"><td colspan="3">Total du jour</td><td>${fmtMs(total)}</td><td></td></tr>
      </table>`;
    });

    // ══ PAR SEMAINE ══
    html += '<h2>📆 Par semaine</h2>';
    html += `<table>
      <tr><th>Semaine</th><th>Période</th><th>Jours travaillés</th><th>Total</th></tr>`;
    Object.keys(byWeek).sort().forEach(wk => {
      const { week, year, sessions: ss } = byWeek[wk];
      const total = ss.reduce((a, s) => a + s.net, 0);
      const jours = new Set(ss.map(s => toLocalISO(new Date(s.start)))).size;
      // Compute Mon-Fri of the week à partir du premier horodatage réel de la semaine
      const firstStart = Math.min(...ss.map(s => s.start));
      const d = new Date(firstStart);
      const dow = d.getDay() || 7;
      const mon = new Date(d); mon.setDate(d.getDate() - dow + 1);
      const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
      const fmt = t => t.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' });
      html += `<tr class="week-row">
        <td>S${week} ${year}</td>
        <td>${fmt(mon)} → ${fmt(fri)}</td>
        <td>${jours} jour${jours > 1 ? 's' : ''}</td>
        <td>${fmtMs(total)}</td>
      </tr>`;
    });
    html += '</table>';

    // ══ PAR ANNÉE ══
    html += '<h2>📊 Par année</h2>';
    html += `<table>
      <tr><th>Année</th><th>Jours travaillés</th><th>Semaines</th><th>Total</th></tr>`;
    Object.keys(byYear).sort().forEach(yr => {
      const ss = byYear[yr];
      const total = ss.reduce((a, s) => a + s.net, 0);
      const jours = new Set(ss.map(s => toLocalISO(new Date(s.start)))).size;
      const semaines = new Set(ss.map(s => weekKey(s.start).key)).size;
      html += `<tr><td>${yr}</td><td>${jours}</td><td>${semaines}</td><td>${fmtMs(total)}</td></tr>`;
    });
    html += '</table>';

    if (getExportIncludeConges() && (state.conges || []).length) {
      html += '<h2>📅 Congés</h2>';
      html += `<table>
        <tr><th>Type</th><th>Début</th><th>Fin</th><th>Jours</th><th>Note</th></tr>`;
      getCongesExportRows().forEach(r => {
        html += `<tr><td>${escapeHtml(r[0])}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${escapeHtml(r[4])}</td></tr>`;
      });
      html += '</table>';
    }

    html += buildPdfChartsHtml();

    html += '</body></html>';

    const win = window.open('', '_blank');
    if (!win) { showToast('Autorise les popups pour exporter'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  
  
function _crc32Table() {
  if (window._crc32TableCache) return window._crc32TableCache;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  window._crc32TableCache = table;
  return table;
}

function _crc32(bytes) {
  const table = _crc32Table();
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function _strToBytes(str) {
  return new TextEncoder().encode(str);
}

function _buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const dosTime = 0, dosDate = 0x21;

  files.forEach(f => {
    const nameBytes = _strToBytes(f.name);
    const dataBytes = _strToBytes(f.content);
    const crc = _crc32(dataBytes);
    const size = dataBytes.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + dataBytes.length;
  });

  const centralSize = centralParts.reduce((a, p) => a + p.length, 0);
  const centralOffset = offset;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);
  ev.setUint16(20, 0, true);

  const totalSize = offset + centralSize + eocd.length;
  const result = new Uint8Array(totalSize);
  let pos = 0;
  [...localParts, ...centralParts, eocd].forEach(part => {
    result.set(part, pos);
    pos += part.length;
  });
  return result;
}

function _xlsxColLetter(n) {
  let s = '';
  n += 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function _xmlEscape(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _buildXlsxBytes(headers, rows, sheetName) {
  const allRows = [headers, ...rows];
  const colWidths = headers.map((_, ci) =>
    Math.max(...allRows.map(r => _xmlEscape(r[ci] ?? '').length)) + 2
  );

  const sheetDataXml = allRows.map((row, ri) => {
    const rowNum = ri + 1;
    const styleAttr = ri === 0 ? ' s="1"' : '';
    const cells = row.map((val, ci) => {
      const ref = `${_xlsxColLetter(ci)}${rowNum}`;
      if (typeof val === 'number' && Number.isFinite(val)) return `<c r="${ref}"${styleAttr}><v>${val}</v></c>`;
      return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${_xmlEscape(val)}</t></is></c>`;
    }).join('');
    return `<row r="${rowNum}">${cells}</row>`;
  }).join('');

  const colsXml = colWidths.map((w, i) => `<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('');

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${_xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF6C63FF"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols>${colsXml}</cols>
<sheetData>${sheetDataXml}</sheetData>
</worksheet>`;

  const files = [
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: rootRels },
    { name: 'xl/workbook.xml', content: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRels },
    { name: 'xl/styles.xml', content: stylesXml },
    { name: 'xl/worksheets/sheet1.xml', content: sheetXml }
  ];

  return _buildZip(files);
}

function exportXLSX() {
  const headers = ['Date', 'Arrivee', 'Depart', 'Pause min', 'Net h', 'Note', 'Localisation depart', 'Localisation fin'];
  const rows = (state.sessions || []).map(s => [
    s.date || '',
    fmtTime(s.start),
    fmtTime(s.end),
    Math.round((s.pauseMs || 0) / 60000),
    Math.round((s.net || 0) / 36000) / 100,
    s.note || '',
    s.startGeo ? s.startGeo.label : '',
    s.endGeo ? s.endGeo.label : ''
  ]);

  if (getExportIncludeConges() && (state.conges || []).length) {
    rows.push(['', '', '', '', '', '', '', '']);
    rows.push(['— CONGÉS —', '', '', '', '', '', '', '']);
    rows.push(['Type', 'Debut', 'Fin', 'Jours', 'Note', '', '', '']);
    getCongesExportRows().forEach(r => rows.push([r[0], r[1], r[2], r[3], r[4], '', '', '']));
  }

  const bytes = _buildXlsxBytes(headers, rows, 'Heures');
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'heures_travail.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Excel téléchargé');
}

  
// ── OPTION D'EXPORT : INCLURE LES CONGÉS ──
function getExportIncludeConges() {
  return localStorage.getItem('orvia_export_include_conges') === 'true';
}

function onExportIncludeCongesChange() {
  const el = document.getElementById('exportIncludeConges');
  const enabled = el ? el.checked : false;
  localStorage.setItem('orvia_export_include_conges', String(enabled));
  showToast(enabled ? 'Congés inclus dans les exports' : 'Congés exclus des exports');
}

function renderExportIncludeCongesToggle() {
  const el = document.getElementById('exportIncludeConges');
  if (el) el.checked = getExportIncludeConges();
}

function getCongesExportRows() {
  const sorted = [...(state.conges || [])].sort((a, b) => a.start.localeCompare(b.start));
  return sorted.map(c => [
    getCongeTypeLabel(c.type),
    c.start,
    c.end,
    String(c.days || 0),
    c.note || ''
  ]);
}

function exportCongesCSV() {
  if (!state.conges.length) { showToast('Aucun congé à exporter'); return; }
  const rows = [['Type','Debut','Fin','Jours','Note']];
  getCongesExportRows().forEach(r => rows.push(r));
  const csv = rows.map(r => r.map(c => '"' + String(c).replaceAll('"','""') + '"').join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'conges.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('CSV congés téléchargé');
}

function exportCongesXLSX() {
  if (!state.conges.length) { showToast('Aucun congé à exporter'); return; }
  const headers = ['Type','Debut','Fin','Jours','Note'];
  const rows = getCongesExportRows();
  const bytes = _buildXlsxBytes(headers, rows, 'Congés');
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'conges.xlsx';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Excel congés téléchargé');
}

function exportCSV() {
    const rows = [['Date','Arrivee','Depart','Pause min','Net h','Note','Localisation depart','Localisation fin']];
    (state.sessions || []).forEach(s => rows.push([
      s.date || '', fmtTime(s.start), fmtTime(s.end), Math.round((s.pauseMs || 0)/60000), ((s.net || 0)/3600000).toFixed(2), s.note || '', s.startGeo ? s.startGeo.label : '', s.endGeo ? s.endGeo.label : ''
    ]));
    if (getExportIncludeConges() && (state.conges || []).length) {
      rows.push([]);
      rows.push(['— CONGÉS —']);
      rows.push(['Type','Debut','Fin','Jours','Note']);
      getCongesExportRows().forEach(r => rows.push(r));
    }
    const csv = rows.map(r => r.map(c => '"' + String(c).replaceAll('"','""') + '"').join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'heures_travail.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('CSV téléchargé');
  }

  function copyWeekSummary() {
  const ws = getWeekSessions();
  if (!ws.length) { showToast('Aucune session cette semaine'); return; }
  const byDate = {};
  ws.forEach(s => { if (!byDate[s.date]) byDate[s.date] = []; byDate[s.date].push(s); });
  let text = '📋 Heures de la semaine\n\n';
  Object.keys(byDate).sort().forEach(date => {
    const total = byDate[date].reduce((a,s) => a+s.net, 0);
    text += `${date} : ${fmtHM(total)}\n`;
    byDate[date].forEach(s => { text += `  • ${fmtTime(s.start)}→${fmtTime(s.end)} — ${s.note}\n`; });
  });
  const total = ws.reduce((a,s) => a+s.net, 0);
  text += `\nTotal semaine : ${fmtHM(total)}`;
  navigator.clipboard.writeText(text).then(() => showToast('Résumé copié ✓')).catch(() => showToast('Erreur de copie'));
}

// ── DOUBLE CONFIRMATION POUR SUPPRESSIONS SENSIBLES ──
// Pour les actions irréversibles à fort impact (effacement de tout
// l'historique, réinitialisation des données de rémunération), une simple
// boîte de dialogue "OK/Annuler" est trop facile à valider par réflexe.
// On exige ici de retaper un mot de confirmation avant d'exécuter l'action.
let _dangerConfirmAction = null;
let _dangerConfirmWord = '';

function openDangerConfirmModal(opts) {
  _dangerConfirmAction = opts.onConfirm;
  _dangerConfirmWord = opts.word || 'SUPPRIMER';
  const titleEl = document.getElementById('dangerConfirmTitle');
  const msgEl = document.getElementById('dangerConfirmMessage');
  const labelEl = document.getElementById('dangerConfirmInputLabel');
  const inputEl = document.getElementById('dangerConfirmInput');
  const errEl = document.getElementById('dangerConfirmError');
  if (titleEl) titleEl.textContent = opts.title || '⚠️ Confirmation requise';
  if (msgEl) msgEl.textContent = opts.message || 'Cette action est irréversible.';
  if (labelEl) labelEl.textContent = `Tape "${_dangerConfirmWord}" pour confirmer :`;
  if (inputEl) { inputEl.value = ''; inputEl.placeholder = _dangerConfirmWord; }
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  const modal = document.getElementById('dangerConfirmModal');
  if (modal) modal.style.display = 'flex';
}

function closeDangerConfirmModal() {
  const modal = document.getElementById('dangerConfirmModal');
  if (modal) modal.style.display = 'none';
  _dangerConfirmAction = null;
}

function submitDangerConfirmModal() {
  const inputEl = document.getElementById('dangerConfirmInput');
  const errEl = document.getElementById('dangerConfirmError');
  const typed = inputEl ? inputEl.value.trim() : '';
  if (typed !== _dangerConfirmWord) {
    if (errEl) { errEl.textContent = `Le texte ne correspond pas à "${_dangerConfirmWord}".`; errEl.style.display = 'block'; }
    return;
  }
  const action = _dangerConfirmAction;
  closeDangerConfirmModal();
  if (typeof action === 'function') action();
}

function clearAll() {
  openDangerConfirmModal({
    title: '⚠️ Effacer tout l\'historique',
    message: `Toutes tes sessions (${state.sessions.length}) seront définitivement supprimées. Cette action est irréversible et ne peut pas être annulée.`,
    word: 'SUPPRIMER',
    onConfirm: () => {
      logAuditEntry('session', 'suppression', `Effacement complet de l'historique (${state.sessions.length} session(s))`);
      state.sessions = [];
      save();
      renderToday();
      renderHistory();
      switchTab('today');
      showToast('Données effacées ✓');
    }
  });
}

function resetRemunerationData() {
  openDangerConfirmModal({
    title: '⚠️ Réinitialiser la rémunération',
    message: `Le taux horaire actuel, tout l'historique des taux (${tauxHoraireHistory.length} entrée(s)) et toutes les primes enregistrées (${primesHistory.length} entrée(s)) seront définitivement supprimés.`,
    word: 'REINITIALISER',
    onConfirm: () => {
      logAuditEntry('taux', 'suppression', `Réinitialisation complète (taux + ${tauxHoraireHistory.length} entrée(s) d'historique)`);
      logAuditEntry('prime', 'suppression', `Réinitialisation complète (${primesHistory.length} prime(s) supprimée(s))`);
      remuneration.enabled = false;
      remuneration.tauxHoraire = 0;
      tauxHoraireHistory = [];
      primesHistory = [];
      saveRemuneration();
      saveTauxHoraireHistory();
      savePrimesHistory();
      renderToday();
      showToast('Données de rémunération réinitialisées ✓');
    }
  });
}

