// ══════════════════════════════════════════════════════════════════════════
// ALERT ANALYTICS
// Colors: Red=#f87171 Rockets | Orange=#fb923c Drones | Purple=#a78bfa Infiltration
//         Teal=#2dd4bf Hazmat | Blue=#60a5fa Stats | Green=#34d399 Calm | Yellow=#fbbf24 Warn
// ══════════════════════════════════════════════════════════════════════════

let _analyticsRawEvents = null;
let _analyticsFilter    = 'all';
let _analyticsChartRange = '24h';
let _analyticsCityStats = {};

const AA_THREAT_LABELS = {
	0:'Rockets / Missiles',1:'Unconventional Threat',2:'Terrorist Infiltration',
	3:'Hazmat / Chemical',4:'Earthquake',5:'Hostile Aircraft / Drones',6:'Tsunami',7:'Radiological',
	11:'Update / Info',13:'All Clear',14:'Early Warning'
};
const AA_THREAT_ICONS = {
	0:'fa-rocket',1:'fa-skull-crossbones',2:'fa-person-running',
	3:'fa-biohazard',4:'fa-wave-square',5:'fa-plane-slash',6:'fa-water',7:'fa-radiation',
	11:'fa-info-circle',13:'fa-check-circle',14:'fa-bolt'
};
const AA_THREAT_COLORS = {
	0:'#f87171',1:'#e879f9',2:'#a78bfa',3:'#2dd4bf',4:'#60a5fa',5:'#fb923c',6:'#38bdf8',7:'#fbbf24',
	11:'#94a3b8',13:'#34d399',14:'#fbbf24'
};

const AA_isNorth      = c => /מטולה|קריית שמונה|נהריה|עכו|חיפה|טבריה|נצרת|גליל|כרמל|עפולה|בית שאן|שגור|מעלות|שלומי|נקרה|כינרת|צפת|גולן|בוקעתא|שמס|מסעדה|כצרין|קצרין|יזרעאל|קריית אתא|קריית ביאליק|קריית מוצקין|קריית ים|נשר|טירת כרמל|שפרעם|פקיעין|מגדל|זיכרון/.test(c);
const AA_isSouth      = c => /שדרות|ספיר|נתיבות|אופקים|רהט|באר שבע|אשקלון|אשדוד|גן יבנה|קריית גת|ניר עם|כיסופים|נירים|ניר עוז|בארי|עזה|נחל עוז|רעים|כפר עזה|מבקיעים|ניר משה|שוקדה|תקומה|יד מרדכי|לכיש|אשכול/.test(c);
const AA_isCenter     = c => /תל אביב|ראשון לציון|פתח תקווה|רמת גן|בת ים|חולון|הרצליה|נתניה|כפר סבא|רעננה|הוד השרון|רמת השרון|גבעתיים|בני ברק|אור יהודה|יהוד|לוד|רמלה|ראש העין|אלעד/.test(c);
const AA_isJerusalem  = c => /ירושלים|בית שמש|מבשרת|גבעת זאב|עציון|תקוע|הר גילה/.test(c);
const AA_isWestBank   = c => /אריאל|שומרון|בנימין|אלפי מנשה|קרני שומרון|עפרה|שילה|קדומים|אלקנה|ברקן|מעלה אדומים|מודיעין עילית|ביתר עילית|נוקדים|כוכב השחר|מעלה מכמש|מצפה יריחו/.test(c);

function AA_getRegion(city) {
	if (AA_isNorth(city))     return { r:'North',        src:'Hezbollah (Lebanon)',       sc:'#fb923c' };
	if (AA_isJerusalem(city)) return { r:'Jerusalem',    src:'Multiple',                  sc:'#a78bfa' };
	if (AA_isWestBank(city))  return { r:'West Bank',    src:'Palestinian Militias',      sc:'#e879f9' };
	if (AA_isSouth(city))     return { r:'South (Gaza)', src:'Hamas / PIJ',               sc:'#f87171' };
	if (AA_isCenter(city))    return { r:'Center',       src:'Long-range (Hamas/Houthis)',sc:'#60a5fa' };
	return                           { r:'Other',        src:'Unknown',                   sc:'#94a3b8' };
}

function AA_formatTime(s) {
	if (!s||s<=0) return '0s';
	if (s<60) return s+'s';
	if (s<3600) return Math.round(s/60)+'m';
	return (s/3600).toFixed(1)+'h';
}

function openAlertAnalytics() {
	document.getElementById('alertAnalyticsOverlay').classList.add('active');
	document.body.style.overflow = 'hidden';
	document.documentElement.style.overflow = 'hidden';
	if (!_analyticsRawEvents) fetchAlertAnalytics();
	else renderAnalytics();
}

function closeAlertAnalytics() {
	document.getElementById('alertAnalyticsOverlay').classList.remove('active');
	if (!document.querySelector('.ai-sum-overlay.active')) {
		document.body.style.overflow = '';
		document.documentElement.style.overflow = '';
	}
}

async function fetchAlertAnalytics() {
	const loading = document.getElementById('alertAnalyticsLoading');
	const content = document.getElementById('alertAnalyticsContent');
	const btn     = document.getElementById('alertAnalyticsRefreshBtn');
	loading.classList.add('active');
	content.style.display = 'none';
	btn.disabled = true;

	let data = null;

	// Step 1: Try global variable (loaded via <script> tag — works with file://)
	if (typeof ALERT_HISTORY_DATA !== 'undefined' && ALERT_HISTORY_DATA.events && ALERT_HISTORY_DATA.events.length > 0) {
		data = ALERT_HISTORY_DATA.events;
		console.log('Alert data loaded from script tag: ' + data.length + ' events (updated: ' + ALERT_HISTORY_DATA.updated + ')');
	}

	// Step 1b: Try fetch (works on GitHub Pages / localhost, not file://)
	if (!data) {
		try {
			const resp = await fetch('data/alert-history.json?v=' + Math.floor(Date.now()/60000));
			if (resp.ok) {
				const json = await resp.json();
				if (json.events && Array.isArray(json.events) && json.events.length > 0) {
					data = json.events;
					console.log('Alert data loaded from JSON fetch: ' + data.length + ' events');
				}
			}
		} catch(e) { /* file:// will fail here, that's OK */ }
	}

	// Step 2: Fallback — fetch live from tzevadom.com (has CORS, paginated)
	if (!data) {
		try {
			const allEvents = [];
			for (let page = 1; page <= 30; page++) {
				const r = await fetch(
					`https://tzevadom.com/api/alerts-history/recent?page=${page}&limit=100`,
					{ signal: AbortSignal.timeout(10000) }
				);
				if (!r.ok) break;
				const batch = await r.json();
				if (!Array.isArray(batch) || batch.length === 0) break;

				let hitOld = false;
				for (const ev of batch) {
					// Only keep last 30 days
					if (ev.startTime < (Date.now()/1000 - 30*86400)) { hitOld = true; continue; }
					allEvents.push({
						id: ev.id,
						description: ev.description || null,
						alerts: [{ time: ev.startTime, cities: ev.cities||[], threat: ev.type??0, isDrill: false }],
					});
				}
				if (hitOld) break;
			}
			if (allEvents.length > 0) {
				data = allEvents;
				console.log(`Alert data loaded live from tzevadom.com: ${data.length} events`);
			}
		} catch(e) { console.warn('tzevadom.com fallback failed:', e.message); }
	}

	// Step 3: Legacy fallback — try CORS proxies for tzevaadom.co.il
	if (!data) {
		const ALERT_API = 'https://api.tzevaadom.co.il/alerts-history';
		for (const proxy of [
			'https://api.allorigins.win/raw?url='+encodeURIComponent(ALERT_API),
			'https://corsproxy.io/?url='+encodeURIComponent(ALERT_API)
		]) {
			try {
				const r = await fetch(proxy, { cache:'no-store', signal: AbortSignal.timeout(8000) });
				if (r.ok) { data = await r.json(); if (Array.isArray(data) && data.length) break; data = null; }
			} catch(e) {}
		}
	}

	loading.classList.remove('active');
	btn.disabled = false;

	if (!data || !Array.isArray(data) || !data.length) {
		content.innerHTML = '<p style="color:rgba(255,255,255,0.4);text-align:center;padding:3rem;">Could not fetch alert data. The data pipeline may not have run yet.<br><span style="font-size:0.75rem;color:rgba(255,255,255,0.25);margin-top:0.5rem;display:inline-block;">If running locally, place alert-history.json in the data/ folder.</span></p>';
		content.style.display = 'block';
		return;
	}

	_analyticsRawEvents = data;
	_analyticsFilter = 'all';
	_analyticsChartRange = '24h';
	renderAnalytics();
}

function setAnalyticsFilter(f) { _analyticsFilter=f; renderAnalytics(); }

function setChartRange(r)      { _analyticsChartRange=r; renderTimeChart(); }

function searchAlertCity() {
	const input = document.getElementById('citySearchInput');
	const results = document.getElementById('citySearchResults');
	if (!input || !results) return;
	const q = input.value.trim();
	if (q.length < 2) { results.innerHTML = '<div style="color:rgba(255,255,255,0.25);font-size:0.78rem;padding:0.5rem;">Type at least 2 characters...</div>'; return; }
	const matches = Object.entries(_analyticsCityStats)
		.filter(([city]) => city.includes(q))
		.sort((a, b) => b[1].waves - a[1].waves)
		.slice(0, 20);
	if (!matches.length) { results.innerHTML = '<div style="color:rgba(255,255,255,0.25);font-size:0.78rem;padding:0.5rem;">No cities found for "' + q.replace(/</g,'&lt;') + '"</div>'; return; }
	const maxW = matches[0][1].waves;
	results.innerHTML = matches.map(([city, s]) => {
		const pct = Math.round(s.waves / maxW * 100);
		const reg = AA_getRegion(city);
		const lastStr = s.last ? new Date(s.last * 1000).toLocaleDateString('en-IL', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : '?';
		const safeCity = city.replace(/'/g, "\\'");
		return `<div style="padding:0.45rem 0.6rem;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;" onclick="showCityDetail('${safeCity}')">
			<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.2rem;">
				<span style="color:white;font-weight:600;font-size:0.82rem;">${city}</span>
				<span style="color:${reg.sc};font-size:0.7rem;font-weight:600;">${reg.r}</span>
			</div>
			<div style="display:flex;gap:1rem;font-size:0.73rem;color:rgba(255,255,255,0.45);margin-bottom:0.25rem;">
				<span>🔔 <strong style="color:#f87171;">${s.waves}</strong> waves</span>
				<span>📋 <strong style="color:#60a5fa;">${s.events}</strong> events</span>
				<span>🕐 Last: <strong style="color:rgba(255,255,255,0.7);">${lastStr}</strong></span>
			</div>
			<div style="height:3px;background:rgba(255,255,255,0.05);border-radius:2px;">
				<div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#f87171,#fb923c);border-radius:2px;"></div>
			</div>
		</div>`;
	}).join('');
}

function showCityDetail(city) {
	const detail = document.getElementById('cityDetailPanel');
	if (!detail || !_analyticsRawEvents) return;

	const cityAlerts = [];
	for (const ev of _analyticsRawEvents) {
		for (const a of (ev.alerts || [])) {
			if (a.isDrill) continue;
			if ((a.cities || []).includes(city)) {
				cityAlerts.push({ time: a.time, threat: parseInt(a.threat) });
			}
		}
	}
	cityAlerts.sort(function(a, b) { return a.time - b.time; });
	if (!cityAlerts.length) { detail.innerHTML = '<div style="color:rgba(255,255,255,0.25);padding:1rem;text-align:center;">No alerts found.</div>'; detail.style.display = 'block'; return; }

	var reg = AA_getRegion(city);
	var now = Math.floor(Date.now() / 1000);
	var SKIP = new Set([11, 13, 14]);
	var real = cityAlerts.filter(function(a) { return !SKIP.has(a.threat); });
	var first = real.length ? real[0].time : cityAlerts[0].time;
	var last = real.length ? real[real.length - 1].time : cityAlerts[cityAlerts.length - 1].time;
	var totalDays = Math.max(1, Math.round((last - first) / 86400));
	var avgPerDay = (real.length / totalDays).toFixed(1);
	var todayStart = Math.floor((now + 7200) / 86400) * 86400 - 7200;
	var WAR_TS = 1772236800;

	var threatCounts = {};
	real.forEach(function(a) { threatCounts[a.threat] = (threatCounts[a.threat] || 0) + 1; });
	var tKeys = Object.keys(threatCounts).sort(function(a, b) { return Number(a) - Number(b); });

	var threatHtml = Object.entries(threatCounts).sort(function(a, b) { return b[1] - a[1]; }).map(function(e) {
		var t = e[0], cnt = e[1];
		return '<span style="font-size:0.73rem;color:' + (AA_THREAT_COLORS[t] || '#94a3b8') + ';"><i class="fas ' + (AA_THREAT_ICONS[t] || 'fa-exclamation-triangle') + '"></i> ' + (AA_THREAT_LABELS[t] || 'Type ' + t) + ': <strong>' + cnt + '</strong></span>';
	}).join('&nbsp;&nbsp;·&nbsp;&nbsp;');

	var secTitle = function(t) { return '<div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.07em;color:rgba(255,255,255,0.35);font-weight:600;margin-bottom:0.45rem;">' + t + '</div>'; };
	var panel = function(inner) { return '<div style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:0.85rem;">' + inner + '</div>'; };

	// ═══ QUIET PERIODS ═══
	var realTimes = real.map(function(a) { return a.time; }).sort(function(a, b) { return a - b; });
	var gaps = [];
	for (var gi = 1; gi < realTimes.length; gi++) gaps.push(realTimes[gi] - realTimes[gi - 1]);
	var longestGap = gaps.length ? Math.max.apply(null, gaps) : 0;
	var avgGap = gaps.length ? Math.round(gaps.reduce(function(s, v) { return s + v; }, 0) / gaps.length) : 0;
	var currentQuiet = now - last;

	var quietHtml = secTitle('Quiet Periods') +
		'<div style="display:flex;flex-direction:column;gap:0.5rem;">' +
			'<div><div style="font-size:0.6rem;color:rgba(255,255,255,0.3);">Current quiet</div><div style="font-size:1.2rem;font-weight:800;color:#34d399;">' + AA_formatTime(currentQuiet) + '</div></div>' +
			'<div><div style="font-size:0.6rem;color:rgba(255,255,255,0.3);">Longest gap</div><div style="font-size:1.2rem;font-weight:800;color:#34d399;">' + AA_formatTime(longestGap) + '</div></div>' +
			'<div><div style="font-size:0.6rem;color:rgba(255,255,255,0.3);">Avg between</div><div style="font-size:1.2rem;font-weight:800;color:#34d399;">' + AA_formatTime(avgGap) + '</div></div>' +
		'</div>';

	// ═══ TODAY GAUGE ═══
	var todayAlerts = real.filter(function(a) { return a.time >= todayStart; });
	var todayByType = {};
	todayAlerts.forEach(function(a) { todayByType[a.threat] = (todayByType[a.threat] || 0) + 1; });
	var todayEntries = Object.entries(todayByType).sort(function(a, b) { return b[1] - a[1]; });
	var todayTotal = todayAlerts.length;

	var gaugeR = 78, gCx = 92, gCy = 86;
	var gaugeCirc = Math.PI * gaugeR;
	var gaugeSvg = '<path d="M ' + (gCx - gaugeR) + ' ' + gCy + ' A ' + gaugeR + ' ' + gaugeR + ' 0 0 1 ' + (gCx + gaugeR) + ' ' + gCy + '" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="14" stroke-linecap="round"/>';
	if (todayTotal > 0) {
		var gOff = 0;
		todayEntries.forEach(function(e) {
			var t = e[0], cnt = e[1], frac = cnt / todayTotal, dash = frac * gaugeCirc;
			gaugeSvg += '<path d="M ' + (gCx - gaugeR) + ' ' + gCy + ' A ' + gaugeR + ' ' + gaugeR + ' 0 0 1 ' + (gCx + gaugeR) + ' ' + gCy + '" fill="none" stroke="' + (AA_THREAT_COLORS[Number(t)] || '#94a3b8') + '" stroke-width="14" stroke-linecap="butt" stroke-dasharray="' + dash.toFixed(1) + ' ' + (gaugeCirc - dash).toFixed(1) + '" stroke-dashoffset="' + (-gOff).toFixed(1) + '" opacity="0.85"/>';
			gOff += dash;
		});
	}
	gaugeSvg += '<text x="' + gCx + '" y="' + (gCy - 14) + '" text-anchor="middle" fill="white" font-size="26" font-weight="900">' + todayTotal + '</text>';
	gaugeSvg += '<text x="' + gCx + '" y="' + (gCy + 4) + '" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-size="8">today</text>';
	var gLegend = todayEntries.map(function(e) {
		var t = e[0], cnt = e[1], tn = (AA_THREAT_LABELS[Number(t)] || 'Type ' + t).split('/')[0].trim();
		return '<div style="display:flex;align-items:center;gap:4px;"><div style="width:8px;height:8px;border-radius:50%;background:' + (AA_THREAT_COLORS[Number(t)] || '#94a3b8') + ';"></div><span style="font-size:0.68rem;color:rgba(255,255,255,0.55);">' + tn + ' ' + cnt + '</span></div>';
	}).join('');
	if (!todayEntries.length) gLegend = '<div style="font-size:0.68rem;color:rgba(255,255,255,0.2);text-align:center;">No alerts today</div>';

	var gaugeHtml = secTitle('Today by Threat Type') +
		'<div style="display:flex;align-items:center;gap:0.6rem;">' +
			'<svg viewBox="0 0 184 94" style="width:210px;flex-shrink:0;">' + gaugeSvg + '</svg>' +
			'<div style="flex:1;">' + gLegend + '</div>' +
		'</div>';

	// ═══ THREAT TREND (14 days) ═══
	var trendDays = 14;
	var trendByType = {};
	tKeys.forEach(function(t) { trendByType[t] = []; });
	for (var ti2 = trendDays - 1; ti2 >= 0; ti2--) {
		var tds = todayStart - ti2 * 86400, tde = tds + 86400;
		tKeys.forEach(function(t) { trendByType[t].push(real.filter(function(a) { return a.time >= tds && a.time < tde && a.threat === Number(t); }).length); });
	}
	var trendItems = tKeys.map(function(t) {
		var data = trendByType[t];
		var mx = Math.max.apply(null, data.concat([1]));
		var total = data.reduce(function(s, v) { return s + v; }, 0);
		var recent7 = data.slice(-7).reduce(function(s, v) { return s + v; }, 0);
		var prev7 = data.slice(0, 7).reduce(function(s, v) { return s + v; }, 0);
		var arrow = recent7 > prev7 ? '↑' : recent7 < prev7 ? '↓' : '→';
		var arrowC = recent7 > prev7 ? '#f87171' : recent7 < prev7 ? '#34d399' : '#94a3b8';
		var tc = AA_THREAT_COLORS[Number(t)] || '#94a3b8';
		var tn = (AA_THREAT_LABELS[Number(t)] || 'Type ' + t).split('/')[0].trim();
		var sparkW = 150, sparkH = 26;
		var pts = data.map(function(v, i) { return (i * sparkW / (trendDays - 1)).toFixed(1) + ',' + (sparkH - 2 - (v / mx) * (sparkH - 4)).toFixed(1); }).join(' ');
		return '<div style="display:flex;align-items:center;gap:0.4rem;padding:0.2rem 0;border-bottom:1px solid rgba(255,255,255,0.03);">' +
			'<span style="color:' + tc + ';font-size:0.75rem;font-weight:700;min-width:70px;">' + tn + '</span>' +
			'<svg viewBox="0 0 ' + sparkW + ' ' + sparkH + '" style="width:150px;height:26px;flex-shrink:0;"><polyline points="' + pts + '" fill="none" stroke="' + tc + '" stroke-width="1.5" stroke-linejoin="round"/></svg>' +
			'<span style="font-size:0.85rem;color:' + arrowC + ';font-weight:800;">' + arrow + '</span>' +
			'<span style="font-size:0.58rem;color:rgba(255,255,255,0.25);">' + recent7 + ' vs ' + prev7 + '</span>' +
		'</div>';
	}).join('');
	var trendHtml = secTitle('Threat Trend — Last 14 Days') + trendItems +
		'<div style="font-size:0.5rem;color:rgba(255,255,255,0.15);margin-top:0.25rem;">↑ increasing vs prior week</div>';

	// ═══ LAST 10 ALERTS (timeline) ═══
	var recentAlerts = real.slice(-15).reverse();
	var alertCards = recentAlerts.map(function(a, i) {
		var d = new Date(a.time * 1000);
		var dateStr = d.toLocaleDateString('en-IL', {day: 'numeric', month: 'short'});
		var timeStr = d.toLocaleTimeString('en-IL', {hour: '2-digit', minute: '2-digit'});
		var tc = AA_THREAT_COLORS[a.threat] || '#94a3b8';
		var tn = (AA_THREAT_LABELS[a.threat] || 'Unknown').split('/')[0].trim();
		var ti = AA_THREAT_ICONS[a.threat] || 'fa-exclamation-triangle';
		var agoMin = Math.round((now - a.time) / 60);
		var agoStr = agoMin < 60 ? agoMin + 'm' : agoMin < 1440 ? Math.round(agoMin / 60) + 'h' : Math.round(agoMin / 1440) + 'd';
		return '<div style="display:flex;align-items:stretch;gap:0;">' +
			'<div style="display:flex;flex-direction:column;align-items:center;width:16px;flex-shrink:0;">' +
				(i > 0 ? '<div style="width:2px;flex:1;background:rgba(255,255,255,0.06);"></div>' : '<div style="flex:1;"></div>') +
				'<div style="width:8px;height:8px;border-radius:50%;background:' + tc + ';flex-shrink:0;box-shadow:0 0 4px ' + tc + '44;"></div>' +
				(i < recentAlerts.length - 1 ? '<div style="width:2px;flex:1;background:rgba(255,255,255,0.06);"></div>' : '<div style="flex:1;"></div>') +
			'</div>' +
			'<div style="flex:1;display:flex;align-items:center;gap:0.4rem;padding:0.3rem 0.5rem;margin:0.1rem 0;background:rgba(255,255,255,0.02);border-radius:6px;border-left:2px solid ' + tc + ';">' +
				'<i class="fas ' + ti + '" style="color:' + tc + ';font-size:0.7rem;width:14px;text-align:center;"></i>' +
				'<div style="flex:1;min-width:0;">' +
					'<div style="font-size:0.72rem;color:' + tc + ';font-weight:700;">' + tn + '</div>' +
					'<div style="font-size:0.58rem;color:rgba(255,255,255,0.25);">' + dateStr + ' ' + timeStr + '</div>' +
				'</div>' +
				'<div style="font-size:0.6rem;color:rgba(255,255,255,0.2);">' + agoStr + '</div>' +
			'</div>' +
		'</div>';
	}).join('');
	var alertsHtml = secTitle('Last ' + recentAlerts.length + ' Alerts') +
		'<div style="display:flex;flex-direction:column;">' + alertCards + '</div>';

	// ═══ DAILY STACKED BAR (last 30 days, diagonal labels) ═══
	var chartDays = Math.min(30, totalDays + 1);
	var dailyByThreat = {};
	var dailyTotal2 = [];
	var dailyLabels = [];
	var dailyDow = [];
	tKeys.forEach(function(t) { dailyByThreat[t] = []; });
	var dowShort = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
	for (var i = chartDays - 1; i >= 0; i--) {
		var ds = todayStart - i * 86400, de = ds + 86400;
		var dayAlerts = real.filter(function(a) { return a.time >= ds && a.time < de; });
		dailyTotal2.push(dayAlerts.length);
		tKeys.forEach(function(t) { dailyByThreat[t].push(dayAlerts.filter(function(a) { return a.threat === Number(t); }).length); });
		var dd = new Date(ds * 1000);
		dailyLabels.push(dd.getDate() + '/' + (dd.getMonth() + 1));
		dailyDow.push(dowShort[dd.getDay()]);
	}
	var dailyMax = Math.max.apply(null, dailyTotal2.concat([1]));
	var bSvgW = 700, bSvgH = 100, bPad = 24, bBottom = 55;
	var bGap = 2, bW = Math.max(4, Math.floor((bSvgW - bPad * 2) / chartDays) - bGap);
	var totalSvgH = bSvgH + bBottom;

	var barsSvg = '';
	// Y grid
	var gridSteps = dailyMax <= 3 ? dailyMax : dailyMax <= 8 ? dailyMax : 5;
	var baseY = bSvgH - 6;
	barsSvg += '<line x1="' + bPad + '" y1="' + baseY + '" x2="' + (bSvgW - bPad) + '" y2="' + baseY + '" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>';
	barsSvg += '<text x="' + (bPad - 3) + '" y="' + (baseY + 3) + '" text-anchor="end" fill="rgba(255,255,255,0.2)" font-size="7">0</text>';
	for (var g = 1; g <= gridSteps; g++) {
		var gVal = dailyMax <= 8 ? g : Math.round(dailyMax / gridSteps * g);
		var gy = baseY - (gVal / dailyMax) * (bSvgH - 26);
		barsSvg += '<line x1="' + bPad + '" y1="' + gy + '" x2="' + (bSvgW - bPad) + '" y2="' + gy + '" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>';
		barsSvg += '<text x="' + (bPad - 3) + '" y="' + (gy + 3) + '" text-anchor="end" fill="rgba(255,255,255,0.25)" font-size="7">' + gVal + '</text>';
	}

	for (var i = 0; i < chartDays; i++) {
		var bx = bPad + i * (bW + bGap);
		var stackY = baseY;
		tKeys.forEach(function(t) {
			var cnt = dailyByThreat[t][i];
			if (cnt <= 0) return;
			var segH = Math.max(2, Math.round((cnt / dailyMax) * (bSvgH - 26)));
			barsSvg += '<rect x="' + bx + '" y="' + (stackY - segH) + '" width="' + bW + '" height="' + segH + '" fill="' + (AA_THREAT_COLORS[Number(t)] || '#94a3b8') + '" rx="3" opacity="0.85"/>';
			stackY -= segH;
		});
		if (dailyTotal2[i] > 0) barsSvg += '<text x="' + (bx + bW / 2) + '" y="' + (stackY - 3) + '" text-anchor="middle" fill="rgba(255,255,255,0.6)" font-size="6.5" font-weight="700">' + dailyTotal2[i] + '</text>';
		// Tick mark
		var tickX = bx + bW / 2;
		barsSvg += '<line x1="' + tickX + '" y1="' + baseY + '" x2="' + tickX + '" y2="' + (baseY + 3) + '" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>';
		// Diagonal label: date + day
		var lblY = baseY + 8;
		var isSab = dailyDow[i] === 'Fri' || dailyDow[i] === 'Sat';
		var lblColor = isSab ? 'rgba(96,165,250,0.6)' : 'rgba(255,255,255,0.3)';
		barsSvg += '<text x="' + tickX + '" y="' + lblY + '" text-anchor="end" fill="' + lblColor + '" font-size="6" transform="rotate(-55 ' + tickX + ' ' + lblY + ')">' + dailyLabels[i] + ' ' + dailyDow[i] + '</text>';
	}

	var barLegend = tKeys.map(function(t) {
		return '<span style="font-size:0.62rem;color:' + (AA_THREAT_COLORS[Number(t)] || '#94a3b8') + ';">▮ ' + (AA_THREAT_LABELS[Number(t)] || 'Type ' + t).split('/')[0].trim() + '</span>';
	}).join('&nbsp;&nbsp;');
	var dailyChartHtml = secTitle('Daily Alerts — Last ' + chartDays + ' Days (Stacked)') +
		'<div style="overflow-x:auto;"><svg viewBox="0 0 ' + bSvgW + ' ' + totalSvgH + '" style="width:100%;min-width:450px;display:block;">' + barsSvg + '</svg></div>' +
		'<div style="display:flex;flex-wrap:wrap;gap:0.2rem 0.6rem;margin-top:0.2rem;">' + barLegend + '&nbsp;&nbsp;<span style="font-size:0.58rem;color:rgba(96,165,250,0.5);">▮ Fri-Sat</span></div>';

// ═══ HEATMAP (last 7 actual days, with summary row) ═══
	var heatDays = [];
	for (var hdi = 6; hdi >= 0; hdi--) {
		var hdTs = todayStart - hdi * 86400;
		var hdDate = new Date(hdTs * 1000);
		var hdRow = Array(24).fill(0);
		real.forEach(function(a) {
			if (a.time >= hdTs && a.time < hdTs + 86400) hdRow[new Date(a.time * 1000).getHours()]++;
		});
		heatDays.push({ ts: hdTs, date: hdDate, row: hdRow, label: hdDate.toLocaleDateString('en-IL', {day:'numeric', month:'short'}) + ' ' + dowShort[hdDate.getDay()] });
	}
	// Summary row
	var summaryRow = Array(24).fill(0);
	heatDays.forEach(function(d) { d.row.forEach(function(v, h) { summaryRow[h] += v; }); });
	var heatAllMax = Math.max.apply(null, heatDays.reduce(function(a, d) { return a.concat(d.row); }, []).concat(summaryRow).concat([1]));

	var heatRows = heatDays.map(function(d) {
		var isSab = d.date.getDay() === 5 || d.date.getDay() === 6;
		return '<tr><td style="font-size:0.6rem;color:' + (isSab ? 'rgba(96,165,250,0.8)' : 'rgba(255,255,255,0.35)') + ';padding:1px 2px 1px 0;white-space:nowrap;font-weight:600;">' + d.label + '</td>' +
			d.row.map(function(cnt, h) {
				var isN = h < 6 || h >= 22;
				var intensity = cnt / heatAllMax;
				var base = isN ? '139,92,246' : '248,113,113';
				var bg = cnt === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(' + base + ',' + (0.15 + intensity * 0.82).toFixed(2) + ')';
				return '<td title="' + d.label + ' ' + h + ':00 — ' + cnt + '" style="background:' + bg + ';border:1px solid rgba(255,255,255,0.03);height:20px;text-align:center;font-size:0.5rem;color:' + (cnt > 0 ? 'rgba(255,255,255,0.45)' : 'transparent') + ';">' + (cnt > 0 ? cnt : '') + '</td>';
			}).join('') + '</tr>';
	}).join('');
	// Summary row
	heatRows += '<tr style="border-top:2px solid rgba(255,255,255,0.08);"><td style="font-size:0.6rem;color:rgba(251,191,36,0.7);padding:1px 2px 1px 0;font-weight:700;">Total</td>' +
		summaryRow.map(function(cnt, h) {
			var isN = h < 6 || h >= 22;
			var intensity = cnt / heatAllMax;
			var base = isN ? '139,92,246' : '251,191,36';
			var bg = cnt === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(' + base + ',' + (0.15 + intensity * 0.82).toFixed(2) + ')';
			return '<td style="background:' + bg + ';border:1px solid rgba(255,255,255,0.03);height:20px;text-align:center;font-size:0.55rem;color:' + (cnt > 0 ? 'rgba(255,255,255,0.55)' : 'transparent') + ';font-weight:700;">' + (cnt > 0 ? cnt : '') + '</td>';
		}).join('') + '</tr>';

	var heatTable = '<table style="border-collapse:collapse;width:100%;table-layout:fixed;"><thead><tr>' +
		'<td style="font-size:0.55rem;color:rgba(255,255,255,0.2);padding:0;width:75px;"></td>' +
		Array.from({length: 24}, function(_, h) { return '<td style="font-size:0.55rem;color:rgba(255,255,255,0.22);text-align:center;padding:0;">' + h + '</td>'; }).join('') +
		'</tr></thead><tbody>' + heatRows + '</tbody></table>';

	var heatmapHtml = secTitle('Last 7 Days × Hour Heatmap') +
		'<div style="overflow-x:auto;">' + heatTable + '</div>' +
		'<div style="display:flex;gap:0.75rem;margin-top:0.25rem;"><span style="font-size:0.58rem;color:rgba(248,113,113,0.6);">▮ Day</span><span style="font-size:0.58rem;color:rgba(139,92,246,0.6);">▮ Night</span><span style="font-size:0.58rem;color:rgba(96,165,250,0.6);">▮ Fri-Sat</span><span style="font-size:0.58rem;color:rgba(251,191,36,0.5);">▮ Total</span></div>';
		
	// ═══ ASSEMBLE ═══
	detail.style.display = 'block';
	detail.innerHTML =
		// Header
		'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem;padding-bottom:0.5rem;border-bottom:1px solid rgba(255,255,255,0.08);">' +
			'<div><span style="color:white;font-weight:800;font-size:1.1rem;">' + city + '</span>' +
			'<span style="color:' + reg.sc + ';font-size:0.78rem;margin-left:0.6rem;">' + reg.r + ' — ' + reg.src + '</span></div>' +
			'<button onclick="document.getElementById(\'cityDetailPanel\').style.display=\'none\'" style="background:none;border:none;color:rgba(255,255,255,0.3);font-size:1.3rem;cursor:pointer;padding:0.2rem 0.5rem;">✕</button>' +
		'</div>' +

		// Stat boxes
		'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.5rem;margin-bottom:0.6rem;">' +
			'<div style="text-align:center;background:rgba(248,113,113,0.08);border-radius:8px;padding:0.5rem;"><div style="font-size:1.4rem;font-weight:900;color:#f87171;">' + real.length + '</div><div style="font-size:0.62rem;color:rgba(255,255,255,0.35);">total waves</div></div>' +
			'<div style="text-align:center;background:rgba(96,165,250,0.08);border-radius:8px;padding:0.5rem;"><div style="font-size:1.4rem;font-weight:900;color:#60a5fa;">' + (_analyticsCityStats[city]?.events || 0) + '</div><div style="font-size:0.62rem;color:rgba(255,255,255,0.35);">events</div></div>' +
			'<div style="text-align:center;background:rgba(251,191,36,0.08);border-radius:8px;padding:0.5rem;"><div style="font-size:1.4rem;font-weight:900;color:#fbbf24;">' + avgPerDay + '</div><div style="font-size:0.62rem;color:rgba(255,255,255,0.35);">avg/day</div></div>' +
			'<div style="text-align:center;background:rgba(52,211,153,0.08);border-radius:8px;padding:0.5rem;"><div style="font-size:1.4rem;font-weight:900;color:#34d399;">' + totalDays + '</div><div style="font-size:0.62rem;color:rgba(255,255,255,0.35);">days span</div></div>' +
		'</div>' +

		// Threat text
		'<div style="margin-bottom:0.6rem;">' + threatHtml + '</div>' +

		// ── ROW 1: Quiet | Gauge | Trend (3 columns) ──
		'<div style="display:grid;grid-template-columns:0.7fr 1.3fr 1.3fr;gap:0.55rem;margin-bottom:0.55rem;">' +
			panel(quietHtml) +
			panel(gaugeHtml) +
			panel(trendHtml) +
		'</div>' +

		// ── ROW 2: Last 10 (left quarter) | Charts (right 3/4) ──
		'<div style="display:grid;grid-template-columns:1fr 4fr;gap:0.55rem;">' +
			// Left: Last 10 Alerts
			panel(alertsHtml) +
			// Right: 3 charts stacked
			'<div style="display:flex;flex-direction:column;gap:0.55rem;">' +
				panel(dailyChartHtml) +
				panel(heatmapHtml) +
			'</div>' +
		'</div>';
}

function toggleMoreCities(id) {
	const el=document.getElementById(id), btn=document.getElementById(id+'-btn');
	if(el.style.display==='none'){el.style.display='flex';btn.textContent='▲ Show less';}
	else{el.style.display='none';btn.textContent='▼ Show all '+btn.dataset.total+' areas';}
}

function renderAnalytics() {
	const content=document.getElementById('alertAnalyticsContent');
	content.innerHTML=buildAnalyticsHTML(_analyticsRawEvents);
	content.style.display='block';
	renderTimeChart();
}

function renderTimeChart() {
	const chartDiv=document.getElementById('alertTimeChart');
	if(!chartDiv||!_analyticsRawEvents) return;
	const f=_analyticsFilter;
	const chartAlerts=[];
	for(const ev of _analyticsRawEvents) for(const a of (ev.alerts||[])) {
		if(a.isDrill) continue;
		const t=parseInt(a.threat);
		if(f==='all'||(f==='other'&&t!==0&&t!==5&&t!==2)||(f!=='all'&&f!=='other'&&t===parseInt(f))) chartAlerts.push(a);
	}
	const now=Math.floor(Date.now()/1000);
	const cfgs={'24h':{sec:86400,bkt:3600},'7d':{sec:604800,bkt:21600},'30d':{sec:2592000,bkt:86400},'90d':{sec:7776000,bkt:259200},'180d':{sec:15552000,bkt:604800},'365d':{sec:31536000,bkt:1209600}};
	const cfg=cfgs[_analyticsChartRange]||cfgs['24h'];
	const rangeStart=now-cfg.sec, numBuckets=Math.ceil(cfg.sec/cfg.bkt), buckets=Array(numBuckets).fill(0);
	let inRange=0;
	for(const a of chartAlerts) if(a.time>=rangeStart){const idx=Math.min(numBuckets-1,Math.floor((a.time-rangeStart)/cfg.bkt));buckets[idx]++;inRange++;}

	const maxVal=Math.max(...buckets,1), chartH=100;
	const gap=numBuckets>80?0:1;
	const svgW=chartDiv.offsetWidth||900;
	const barW=Math.max(2,Math.floor(svgW/numBuckets)-gap);
	const actualW=numBuckets*(barW+gap);

	let bars='',labels='',dayLines='';
	let prevDateStr='';

	// Determine label interval — show date when day changes
	const labelEvery=numBuckets<=14?1:numBuckets<=30?2:numBuckets<=60?5:Math.ceil(numBuckets/20);

	for(let i=0;i<numBuckets;i++){
		const bTime=rangeStart+i*cfg.bkt;
		const d=new Date(bTime*1000);
		const hr=d.getHours(), isNight=hr<6||hr>=22;
		const h=Math.round((buckets[i]/maxVal)*chartH), x=i*(barW+gap);
		const color=buckets[i]===0?'rgba(255,255,255,0.04)':isNight?'#a78bfa':'#f87171';
		const dateStr=d.getDate()+'/'+(d.getMonth()+1);

		bars+=`<rect x="${x}" y="${chartH-h}" width="${barW}" height="${Math.max(h,buckets[i]>0?2:0)}" fill="${color}" rx="3" opacity="0.82"><title>${dateStr} ${String(hr).padStart(2,'0')}:00 — ${buckets[i]} waves</title></rect>`;

		// Tick under every column
		labels+=`<line x1="${x+barW/2}" y1="${chartH+1}" x2="${x+barW/2}" y2="${chartH+4}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;

		// Day separator — vertical line when date changes
		if(dateStr!==prevDateStr && i>0){
			dayLines+=`<line x1="${x}" y1="0" x2="${x}" y2="${chartH}" stroke="rgba(96,165,250,0.2)" stroke-width="1" stroke-dasharray="2,2"/>`;
		}

		// Date label at intervals or when day changes
		const isNewDay=dateStr!==prevDateStr;
		if(isNewDay || (cfg.sec<=86400 && i%labelEvery===0)){
			const lbl=cfg.sec<=86400 ? String(hr).padStart(2,'0')+':00' : dateStr;
			const bold=isNewDay && cfg.sec>86400;
			labels+=`<text x="${x+barW/2}" y="${chartH+15}" text-anchor="middle" fill="${bold?'rgba(96,165,250,0.6)':'rgba(255,255,255,0.3)'}" font-size="${bold?'9':'8'}" font-weight="${bold?'700':'400'}">${lbl}</text>`;
		}

		prevDateStr=dateStr;
	}

	const peakIdx=buckets.indexOf(Math.max(...buckets)), peakX=peakIdx*(barW+gap)+barW/2;
	chartDiv.innerHTML=`
		<div style="color:rgba(255,255,255,0.3);font-size:0.73rem;margin-bottom:0.4rem;">${inRange} alert waves in range${inRange===0?' — dataset may not go back this far':''}</div>
		<div style="overflow-x:auto;"><svg width="${actualW}" height="${chartH+22}" style="display:block;min-width:100%;">
			${dayLines}${bars}${labels}
			${maxVal>1?`<line x1="${peakX}" y1="0" x2="${peakX}" y2="${chartH}" stroke="rgba(255,255,255,0.18)" stroke-dasharray="3,2" stroke-width="1"/>`:''} 
		</svg></div>
		<div style="display:flex;gap:1.5rem;margin-top:0.4rem;">
			<span style="font-size:0.7rem;color:rgba(167,139,250,0.8);">▮ Night (22–06)</span>
			<span style="font-size:0.7rem;color:rgba(248,113,113,0.8);">▮ Day</span>
			<span style="font-size:0.7rem;color:rgba(96,165,250,0.5);">┊ Day boundary</span>
			<span style="font-size:0.7rem;color:rgba(255,255,255,0.25);">— Peak</span>
		</div>`;
	document.querySelectorAll('[id^="chartRangeBtn_"]').forEach(b=>{
		const active=b.id==='chartRangeBtn_'+_analyticsChartRange;
		b.style.borderColor=active?'#60a5fa':'rgba(255,255,255,0.1)';
		b.style.background=active?'rgba(96,165,250,0.15)':'rgba(255,255,255,0.04)';
		b.style.color=active?'#60a5fa':'rgba(255,255,255,0.4)';
	});
}

function buildAnalyticsHTML(events) {
	const now=Math.floor(Date.now()/1000), f=_analyticsFilter;
	const allAlertsRaw=[], allAlerts=[];
	for(const ev of events) for(const a of (ev.alerts||[])){
		const ta={...a,eventId:ev.id}; allAlertsRaw.push(ta);
		const t=parseInt(a.threat);
		if(f==='all'||(f==='other'&&t!==0&&t!==5&&t!==2)||(f!=='all'&&f!=='other'&&t===parseInt(f))) allAlerts.push(ta);
	}
	const ndRaw=allAlertsRaw.filter(a=>!a.isDrill), ndAlerts=allAlerts.filter(a=>!a.isDrill);
	const ndEvents=events.filter(ev=>ev.alerts&&ev.alerts.some(a=>{
		if(a.isDrill) return false; const t=parseInt(a.threat);
		return f==='all'||(f==='other'&&t!==0&&t!==5&&t!==2)||(f!=='all'&&f!=='other'&&t===parseInt(f));
	}));
	const card=(h,ex='')=>`<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:1.2rem;${ex}">${h}</div>`;
	const lbl=(t,c='rgba(255,255,255,0.38)')=>`<div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.07em;color:${c};margin-bottom:0.4rem;font-weight:600;">${t}</div>`;
	const big=(n,c='#60a5fa',sub='')=>`<div style="font-size:1.9rem;font-weight:800;color:${c};line-height:1;">${n}</div>${sub?`<div style="font-size:0.74rem;color:rgba(255,255,255,0.32);margin-top:0.25rem;">${sub}</div>`:''}`;
	let html=`<div style="display:grid;gap:0.9rem;">`;

	// Filter tabs
	const tCounts={};
	for(const a of ndRaw) tCounts[parseInt(a.threat)]=(tCounts[parseInt(a.threat)]||0)+1;
	const tabs=[
		{f:'all',lbl:`All (${ndRaw.length})`,c:'#94a3b8'},
		{f:'0',lbl:`🚀 Rockets (${tCounts[0]||0})`,c:'#f87171'},
		...(tCounts[5]?[{f:'5',lbl:`✈️ Drones (${tCounts[5]})`,c:'#fb923c'}]:[]),
		...(tCounts[2]?[{f:'2',lbl:`🏃 Infiltration (${tCounts[2]})`,c:'#a78bfa'}]:[]),
		...(Object.keys(tCounts).some(t=>t!=0&&t!=5&&t!=2)?[{f:'other',lbl:'⚠️ Other',c:'#2dd4bf'}]:[]),
	];
	html+=`<div style="display:flex;flex-wrap:wrap;gap:0.35rem;">${tabs.map(tab=>{const active=f===tab.f;return`<button onclick="setAnalyticsFilter('${tab.f}')" style="padding:0.3rem 0.7rem;border-radius:20px;font-size:0.78rem;font-weight:600;cursor:pointer;border:1px solid ${active?tab.c:'rgba(255,255,255,0.1)'};background:${active?tab.c+'22':'rgba(255,255,255,0.04)'};color:${active?tab.c:'rgba(255,255,255,0.45)'};">${tab.lbl}</button>`;}).join('')}</div>`;

	// City search
	const topCityCount = Object.keys(_analyticsCityStats).length;
	html += `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:1rem;">
		<div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
			<div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.07em;color:rgba(255,255,255,0.38);font-weight:600;">🔍 City Alert Lookup</div>
			<div style="font-size:0.68rem;color:rgba(255,255,255,0.2);">${topCityCount} cities in dataset since 28/2/2026</div>
			<div style="flex:1;min-width:200px;position:relative;">
				<input id="citySearchInput" type="text" placeholder="Search city name (Hebrew)..." oninput="searchAlertCity()"
					style="width:100%;padding:0.45rem 0.75rem;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:white;font-size:0.82rem;outline:none;direction:rtl;"
					onfocus="this.style.borderColor='#60a5fa'" onblur="this.style.borderColor='rgba(255,255,255,0.15)'">
			</div>
		</div>
		<div id="citySearchResults" style="max-height:280px;overflow-y:auto;margin-top:0.5rem;border-radius:8px;background:rgba(0,0,0,0.15);">
			<div style="color:rgba(255,255,255,0.2);font-size:0.78rem;padding:0.5rem;text-align:center;">Type a city name to see its alert history · Click a city for full breakdown</div>
		</div>
		<div id="cityDetailPanel" style="display:none;margin-top:0.75rem;padding:1rem;background:rgba(255,255,255,0.03);border:1px solid rgba(96,165,250,0.2);border-radius:10px;"></div>
	</div>
	<div style="border-top:2px solid rgba(96,165,250,0.15);margin:0.5rem 0;padding-top:0.5rem;">
		<div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:rgba(96,165,250,0.4);font-weight:700;margin-bottom:0.5rem;text-align:center;">📊 Overall War Analytics — All Cities</div>
	</div>`;
	
	if(!ndAlerts.length){html+=`<p style="color:rgba(255,255,255,0.4);text-align:center;padding:2rem;">No alerts of this type in the dataset.</p></div>`;return html;}

// Build city stats for search
	_analyticsCityStats = {};
	for (const ev of events) {
		const evCities = new Set();
		for (const a of (ev.alerts || [])) {
			if (a.isDrill) continue;
			for (const c of (a.cities || [])) {
				if (!_analyticsCityStats[c]) _analyticsCityStats[c] = { waves: 0, events: 0, last: 0 };
				_analyticsCityStats[c].waves++;
				if (a.time > _analyticsCityStats[c].last) _analyticsCityStats[c].last = a.time;
				evCities.add(c);
			}
		}
		for (const c of evCities) _analyticsCityStats[c].events++;
	}
	
	const latestTime=ndAlerts.length?Math.max(...ndAlerts.map(a=>a.time)):null;
	const oldestTime=ndAlerts.length?Math.min(...ndAlerts.map(a=>a.time)):null;
	const currentQuiet=latestTime?now-latestTime:0;
	const drillCount=allAlertsRaw.filter(a=>a.isDrill).length;
	const drillPct=allAlertsRaw.length?Math.round(drillCount/allAlertsRaw.length*100):0;
	const evH1=ndEvents.filter(ev=>ev.alerts.some(a=>a.time>=now-3600));
	const evH6=ndEvents.filter(ev=>ev.alerts.some(a=>a.time>=now-21600));
	const evH12=ndEvents.filter(ev=>ev.alerts.some(a=>a.time>=now-43200));
	const evH24=ndEvents.filter(ev=>ev.alerts.some(a=>a.time>=now-86400));
	const salvoData=ndEvents.map(ev=>{const as=ev.alerts.filter(a=>!a.isDrill);const cities=as.reduce((s,a)=>s+(a.cities||[]).length,0);const tS=Math.min(...as.map(a=>a.time));const tE=Math.max(...as.map(a=>a.time));return{cities,duration:tE-tS,waves:as.length,tStart:tS};});
	const maxSalvo=Math.max(...salvoData.map(s=>s.cities),0);
	const avgSalvo=salvoData.length?Math.round(salvoData.reduce((s,v)=>s+v.cities,0)/salvoData.length):0;
	const maxDur=Math.max(...salvoData.map(s=>s.duration),0);
	const avgDur=salvoData.length?Math.round(salvoData.reduce((s,v)=>s+v.duration,0)/salvoData.length):0;
	const eTimes=salvoData.map(s=>s.tStart).sort((a,b)=>a-b);
	const gaps=[];for(let i=1;i<eTimes.length;i++) gaps.push(eTimes[i]-eTimes[i-1]);
	const longestGap=Math.max(...gaps,0), avgGap=gaps.length?Math.round(gaps.reduce((s,v)=>s+v,0)/gaps.length):0;
	const rate1h=evH1.length, rate6h=evH6.length/6;
	const trend=rate1h>rate6h*1.5?'↑ Escalating':rate1h<rate6h*0.5&&rate6h>0?'↓ De-escalating':rate1h===0&&rate6h===0?'— Calm':'→ Stable';
	const trendC=trend.startsWith('↑')?'#f87171':trend.startsWith('↓')?'#34d399':trend.includes('Calm')?'#34d399':'#60a5fa';
	const nd6h=ndAlerts.filter(a=>a.time>=now-21600);
	const sevMap={0:1.5,5:1.2,2:2.0,1:2.5,7:2.5,3:1.8,4:1.0,6:2.0};
	const maxSev=nd6h.length?Math.max(...[...new Set(nd6h.map(a=>a.threat))].map(t=>sevMap[t]||1)):1;
	const northA=nd6h.some(a=>(a.cities||[]).some(AA_isNorth)), southA=nd6h.some(a=>(a.cities||[]).some(AA_isSouth));
	const multiFront=northA&&southA;
	const avgCit6h=nd6h.length&&evH6.length?nd6h.reduce((s,a)=>s+(a.cities||[]).length,0)/evH6.length:0;
	const rawScore=Math.min(10,(rate6h*1.5+(avgCit6h/20)+(multiFront?2:0))*maxSev);
	const scoreC=rawScore>=7?'#f87171':rawScore>=4?'#fb923c':rawScore>=2?'#fbbf24':'#34d399';
	const scoreLbl=rawScore>=7?'CRITICAL':rawScore>=4?'HIGH':rawScore>=2?'MODERATE':rawScore>0?'LOW':'NONE';

	// ── Dashboards ────────────────────────────────────────────────────────────
	const _IL_OFF = 7200; // UTC+2 (Israel Standard Time; change to 10800 for DST / UTC+3)
	const _todS2 = Math.floor((now + _IL_OFF) / 86400) * 86400 - _IL_OFF;			const SINCE_328 = 1743120000; // 28 Mar 2026 00:00 UTC
	const SINCE_228 = 1740700800; // 28 Feb 2026 00:00 UTC
	const DIST_COLS = {'North':'#fb923c','Center':'#60a5fa','South (Gaza)':'#f87171','Jerusalem':'#a78bfa','West Bank':'#e879f9','Other':'#94a3b8'};

	const _arc = (segs, total, cx, cy, r, centerLbl) => {
		if (!total) return `<text x="${cx}" y="${cy+4}" text-anchor="middle" fill="rgba(255,255,255,0.25)" font-size="8">No data</text>`;
		const circ=2*Math.PI*r; let off=0, out='';
		for (const s of segs) { const dash=(s.v/total)*circ; out+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.c}" stroke-width="11" stroke-dasharray="${dash.toFixed(1)} ${(circ-dash).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})" opacity="0.85"/>`; off+=dash; }
		return out+`<text x="${cx}" y="${cy-3}" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="9" font-weight="700">${total}</text><text x="${cx}" y="${cy+9}" text-anchor="middle" fill="rgba(255,255,255,0.32)" font-size="7">${centerLbl}</text>`;
	};
	const _legend = (segs, total) => segs.length ? segs.map(s=>`<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;"><div style="width:7px;height:7px;border-radius:50%;background:${s.c};flex-shrink:0;"></div><span style="font-size:0.6rem;color:rgba(255,255,255,0.55);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.lbl}</span><span style="font-size:0.6rem;color:rgba(255,255,255,0.3);">${total?Math.round(s.v/total*100):'0'}%</span></div>`).join('') : '<span style="font-size:0.6rem;color:rgba(255,255,255,0.25);">No data</span>';
	const _dCard = (title, inner) => `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:0.85rem;display:flex;flex-direction:column;gap:0.4rem;min-width:0;overflow:hidden;"><div style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.07em;color:rgba(255,255,255,0.35);font-weight:600;margin-bottom:0.2rem;">${title}</div>${inner}</div>`;

	// Row 1 – Chart 1: daily events past 7 days (line + markers)
	const _wkL=[], _wkC=[];
	for(let i=6;i>=0;i--){const ds=_todS2-i*86400,de=ds+86400;const cnt=ndEvents.filter(ev=>{const t=Math.min(...ev.alerts.map(a=>a.time));return t>=ds&&t<de;}).length;const d=new Date(ds*1000);_wkL.push((d.getMonth()+1)+'/'+(d.getDate()));_wkC.push(cnt);}
	const _wkMax=Math.max(..._wkC,1),_svgW=230,_svgH=68,_svgPad=10;
	const _xs=_wkC.map((_,i)=>_svgPad+i*(_svgW-_svgPad*2)/6);
	const _ys=_wkC.map(v=>_svgH-4-(v/_wkMax)*(_svgH-16));
	let _lineSvg=`<line x1="${_svgPad}" y1="${_svgH-4}" x2="${_svgW-_svgPad}" y2="${_svgH-4}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/><polyline points="${_xs.map((x,i)=>x+','+_ys[i]).join(' ')}" fill="none" stroke="rgba(96,165,250,0.5)" stroke-width="1.5" stroke-linejoin="round"/>`;
	_xs.forEach((x,i)=>{_lineSvg+=`<circle cx="${x}" cy="${_ys[i]}" r="3.5" fill="#60a5fa" opacity="0.9"/>`;if(_wkC[i]>0)_lineSvg+=`<text x="${x}" y="${_ys[i]-7}" text-anchor="middle" fill="#60a5fa" font-size="8" font-weight="700">${_wkC[i]}</text>`;_lineSvg+=`<text x="${x}" y="${_svgH+6}" text-anchor="middle" fill="rgba(255,255,255,0.28)" font-size="7">${_wkL[i]}</text>`;});

	// Row 1 – Chart 2: total attacks by type since 28/3/2026 (pie)
	const _stC={}, _stSkip=new Set([11,13,14]);
	for(const a of ndAlerts){if(a.time>=SINCE_328){const t=parseInt(a.threat);if(!_stSkip.has(t))_stC[t]=(_stC[t]||0)+1;}}
	const _stE=Object.entries(_stC).sort((a,b)=>b[1]-a[1]);
	const _stTotal=_stE.reduce((s,[,v])=>s+v,0);
	const _stSegs=_stE.map(([t,v])=>({v,c:AA_THREAT_COLORS[parseInt(t)]||'#94a3b8',lbl:(AA_THREAT_LABELS[parseInt(t)]||'Other').split('/')[0].trim()}));
	
	// Row 1 – Chart 3: today's waves by type (donut)
	const _tdTC={};
	for(const a of ndAlerts){if(a.time>=_todS2){const t=parseInt(a.threat);_tdTC[t]=(_tdTC[t]||0)+1;}}
	const _tdTSegs=Object.entries(_tdTC).map(([t,v])=>({v,c:AA_THREAT_COLORS[parseInt(t)]||'#94a3b8',lbl:(AA_THREAT_LABELS[parseInt(t)]||'Other').split('/')[0].trim()}));
	const _tdTTot=_tdTSegs.reduce((s,x)=>s+x.v,0);

	// Row 2 – Chart 4: today's waves by district (donut)
	const _tdDC={};
	for(const a of ndAlerts){if(a.time>=_todS2)for(const c of(a.cities||[])){const r=AA_getRegion(c).r;_tdDC[r]=(_tdDC[r]||0)+1;}}
	const _tdDSegs=Object.entries(_tdDC).map(([r,v])=>({v,c:DIST_COLS[r]||'#94a3b8',lbl:r}));
	const _tdDTot=_tdDSegs.reduce((s,x)=>s+x.v,0);

	// Row 2 – Chart 5: attack waves by hour today (column)
	const _hrC=Array(24).fill(0);
	for(const a of ndAlerts){if(a.time>=_todS2){const h=new Date(a.time*1000).getHours();_hrC[h]++;}}
	const _hrMax=Math.max(..._hrC,1),_hrW=Math.floor(228/24);
	let _hrSvg='';
	const _hrPad=8,_hrBarW2=Math.floor((228-_hrPad*2)/24)-1;
	_hrC.forEach((v,h)=>{const bH=Math.round((v/_hrMax)*50);const isN=h<6||h>=22;const c=v===0?'rgba(255,255,255,0.05)':isN?'#a78bfa':'#f87171';const bx=_hrPad+h*(_hrBarW2+1);_hrSvg+=`<rect x="${bx}" y="${58-bH}" width="${_hrBarW2}" height="${Math.max(bH,v>0?2:0)}" fill="${c}" rx="1" opacity="0.85"/>`;if(v>0)_hrSvg+=`<text x="${bx+_hrBarW2/2}" y="${58-bH-3}" text-anchor="middle" fill="${c}" font-size="5">${v}</text>`;_hrSvg+=`<line x1="${bx+_hrBarW2/2}" y1="59" x2="${bx+_hrBarW2/2}" y2="61" stroke="rgba(255,255,255,0.12)" stroke-width="0.5"/>`;_hrSvg+=`<text x="${bx+_hrBarW2/2}" y="67" text-anchor="middle" fill="rgba(255,255,255,0.28)" font-size="4.5">${h}</text>`;});

	// Row 2 – Chart 6: total waves since 28/2/2026 by district (donut)
	const _sDistC={};
	for(const a of ndAlerts){if(a.time>=SINCE_228)for(const c of(a.cities||[])){const r=AA_getRegion(c).r;_sDistC[r]=(_sDistC[r]||0)+1;}}
	const _sDistSegs=Object.entries(_sDistC).map(([r,v])=>({v,c:DIST_COLS[r]||'#94a3b8',lbl:r}));
	const _sDistTot=_sDistSegs.reduce((s,x)=>s+x.v,0);

// ── War Analytics Frame ─────────────────────────────────────────────
	const datasetDays = oldestTime ? Math.round((now - oldestTime) / 86400) : 0;
	const datasetStart = oldestTime ? new Date(oldestTime*1000).toLocaleDateString('en-IL',{year:'numeric',month:'short',day:'numeric'}) : '?';
	const datasetEnd   = latestTime ? new Date(latestTime*1000).toLocaleDateString('en-IL',{year:'numeric',month:'short',day:'numeric'}) : '?';
	const minAgo=latestTime?Math.round((now-latestTime)/60):null;
	const timeStr=minAgo===null?'—':minAgo<2?'🔴 Just now':minAgo<60?`🟠 ${minAgo}m ago`:minAgo<1440?`🟡 ${Math.round(minAgo/60)}h ago`:`🟢 ${Math.round(minAgo/1440)}d ago`;

	// Find last DB update from ALERT_HISTORY_DATA
	let dbUpdateStr = '?';
	if (typeof ALERT_HISTORY_DATA !== 'undefined' && ALERT_HISTORY_DATA.updated) {
		dbUpdateStr = new Date(ALERT_HISTORY_DATA.updated).toLocaleString('en-IL', {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
	}

	html+=`<div style="background:rgba(96,165,250,0.03);border:2px solid rgba(96,165,250,0.12);border-radius:14px;padding:1rem;margin-top:0.5rem;">`;

	// Dataset bar
	html+=`<div style="display:flex;gap:0.75rem;align-items:stretch;margin-bottom:0.75rem;">
		<div style="background:rgba(${scoreC==='#f87171'?'248,113,113':scoreC==='#fb923c'?'251,146,60':scoreC==='#fbbf24'?'251,191,36':'52,211,153'},0.08);border:1px solid ${scoreC}33;border-radius:10px;padding:0.6rem 1rem;text-align:center;min-width:90px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
			<div style="font-size:0.55rem;text-transform:uppercase;letter-spacing:0.07em;color:rgba(255,255,255,0.35);font-weight:600;">Threat</div>
			<div style="font-size:2rem;font-weight:900;color:${scoreC};line-height:1;">${rawScore.toFixed(1)}</div>
			<div style="font-size:0.55rem;font-weight:800;color:${scoreC};">${scoreLbl}</div>
			<div style="height:3px;width:100%;background:rgba(255,255,255,0.07);border-radius:2px;margin-top:0.2rem;"><div style="height:100%;width:${rawScore*10}%;background:${scoreC};border-radius:2px;"></div></div>
		</div>
		<div style="flex:1;display:flex;flex-wrap:wrap;gap:0.4rem 1.2rem;align-items:center;padding:0.5rem 0.8rem;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.15);border-radius:10px;font-size:0.76rem;">
		<span style="color:rgba(255,255,255,0.4);">📊 Dataset:</span>
		<span style="color:white;font-weight:700;">${datasetStart}</span>
		<span style="color:rgba(255,255,255,0.25);">→</span>
		<span style="color:white;font-weight:700;">${datasetEnd}</span>
		<span style="color:#60a5fa;font-weight:800;">(${datasetDays}d)</span>
		<span style="color:rgba(255,255,255,0.15);">│</span>
		<span style="color:rgba(255,255,255,0.4);">${ndEvents.length} events</span>
		<span style="color:rgba(255,255,255,0.15);">│</span>
		<span style="color:rgba(255,255,255,0.4);">Last alert:</span>
		<span style="font-weight:700;">${timeStr}</span>
		<span style="color:rgba(255,255,255,0.15);">│</span>
		<span style="color:rgba(255,255,255,0.3);">DB update: ${dbUpdateStr}</span>
	</div></div>`;

	const regHits={};
	for(const a of ndAlerts) for(const c of (a.cities||[])){const rg=AA_getRegion(c);if(!regHits[rg.r])regHits[rg.r]={count:0,sc:rg.sc};regHits[rg.r].count++;}
	const regTotal=Object.values(regHits).reduce((s,r)=>s+r.count,0);
	const regSegs=Object.entries(regHits).map(([r,d])=>({v:d.count,c:d.sc,lbl:r}));
	
	html+=`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:0.75rem;">
		${_dCard('Daily Attacks — Past Week',`<svg viewBox="0 0 ${_svgW} ${_svgH+10}" style="width:100%;overflow:visible;">${_lineSvg}</svg>`)}
		${_dCard('Total Attacks by Type — Since 28/3/2026',`<div style="display:flex;align-items:center;gap:0.5rem;"><svg viewBox="0 0 100 100" style="width:180px;height:180px;flex-shrink:0;"><circle cx="50" cy="50" r="38" fill="rgba(255,255,255,0.03)"/>${_arc(_stSegs,_stTotal,50,50,38,'attacks')}</svg><div style="flex:1;overflow:hidden;">${_stE.map(([t,v])=>{const pct=_stTotal?Math.round(v/_stTotal*100):0;return'<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;"><div style="width:7px;height:7px;border-radius:50%;background:'+(AA_THREAT_COLORS[parseInt(t)]||'#94a3b8')+';flex-shrink:0;"></div><span style="font-size:0.65rem;color:rgba(255,255,255,0.55);">'+(AA_THREAT_LABELS[parseInt(t)]||'Other').split('/')[0].trim()+'</span><span style="font-size:0.65rem;color:rgba(255,255,255,0.3);margin-left:auto;">'+v+' ('+pct+'%)</span></div>';}).join('')}</div></div>`)}
		${_dCard("Today's Waves by Type",`<div style="display:flex;align-items:center;gap:0.6rem;">${(()=>{const gR=60,gCx=70,gCy=66,gCirc=Math.PI*gR;let gSvg='<path d="M '+(gCx-gR)+' '+gCy+' A '+gR+' '+gR+' 0 0 1 '+(gCx+gR)+' '+gCy+'" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="13" stroke-linecap="round"/>';if(_tdTTot>0){let gOff=0;_tdTSegs.forEach(s=>{const dash=(s.v/_tdTTot)*gCirc;gSvg+='<path d="M '+(gCx-gR)+' '+gCy+' A '+gR+' '+gR+' 0 0 1 '+(gCx+gR)+' '+gCy+'" fill="none" stroke="'+s.c+'" stroke-width="13" stroke-linecap="butt" stroke-dasharray="'+dash.toFixed(1)+' '+(gCirc-dash).toFixed(1)+'" stroke-dashoffset="'+(-gOff).toFixed(1)+'" opacity="0.85"/>';gOff+=dash;});}gSvg+='<text x="'+gCx+'" y="'+(gCy-14)+'" text-anchor="middle" fill="white" font-size="24" font-weight="900">'+_tdTTot+'</text>';gSvg+='<text x="'+gCx+'" y="'+(gCy+1)+'" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-size="8">today</text>';return'<svg viewBox="0 0 140 74" style="width:190px;flex-shrink:0;">'+gSvg+'</svg>';})()}<div style="flex:1;overflow:hidden;">${_tdTSegs.map(s=>'<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;"><div style="width:8px;height:8px;border-radius:50%;background:'+s.c+';flex-shrink:0;"></div><span style="font-size:0.65rem;color:rgba(255,255,255,0.55);">'+s.lbl+'</span><span style="font-size:0.65rem;color:rgba(255,255,255,0.3);margin-left:auto;">'+s.v+(_tdTTot?' ('+Math.round(s.v/_tdTTot*100)+'%)':'')+'</span></div>').join('')||'<span style="font-size:0.62rem;color:rgba(255,255,255,0.25);">No alerts today</span>'}</div></div>`)}
	</div>
	<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:0.75rem;">
		${_dCard("Today's Waves by District",`<div style="display:flex;align-items:center;gap:0.5rem;"><svg viewBox="0 0 100 100" style="width:180px;height:180px;flex-shrink:0;"><circle cx="50" cy="50" r="38" fill="rgba(255,255,255,0.03)"/>${_arc(_tdDSegs.filter(s=>s.lbl!=='Other'),_tdDSegs.filter(s=>s.lbl!=='Other').reduce((a,b)=>a+b.v,0),50,50,38,'areas')}</svg><div style="flex:1;overflow:hidden;">${_legend(_tdDSegs.filter(s=>s.lbl!=='Other'),_tdDSegs.filter(s=>s.lbl!=='Other').reduce((a,b)=>a+b.v,0))}</div></div>`)}
		${_dCard('Geographic Targeting & Origin',`<div style="display:flex;align-items:center;gap:0.5rem;"><svg viewBox="0 0 100 100" style="width:180px;height:180px;flex-shrink:0;"><circle cx="50" cy="50" r="38" fill="rgba(255,255,255,0.03)"/>${_arc(regSegs.filter(s=>s.lbl!=='Other'),regSegs.filter(s=>s.lbl!=='Other').reduce((a,b)=>a+b.v,0),50,50,38,'hits')}</svg><div style="flex:1;overflow:hidden;">${regSegs.filter(s=>s.lbl!=='Other').map(s=>{const tot=regSegs.filter(x=>x.lbl!=='Other').reduce((a,b)=>a+b.v,0);const pct=tot?Math.round(s.v/tot*100):0;return'<div style="display:flex;align-items:center;gap:5px;margin-bottom:4px;"><div style="width:8px;height:8px;border-radius:50%;background:'+s.c+';"></div><span style="font-size:0.75rem;color:rgba(255,255,255,0.6);">'+s.lbl+'</span><span style="font-size:0.75rem;color:rgba(255,255,255,0.35);margin-left:auto;">'+s.v+' ('+pct+'%)</span></div>';}).join('')}</div></div>`)}
	</div>`;

	// regHits/regSegs already computed before render grid

	// Attack timeline chart
	const chartRanges=[['24h','1D'],['7d','1W'],['30d','1M'],['90d','3M'],['180d','6M'],['365d','1Y']];
	html+=card(`${lbl('Attack Timeline')}<div style="display:flex;flex-wrap:wrap;gap:0.28rem;margin-bottom:0.65rem;">${chartRanges.map(([val,lb])=>`<button onclick="setChartRange('${val}')" id="chartRangeBtn_${val}" style="padding:0.22rem 0.5rem;border-radius:4px;font-size:0.73rem;font-weight:600;cursor:pointer;border:1px solid ${_analyticsChartRange===val?'#60a5fa':'rgba(255,255,255,0.1)'};background:${_analyticsChartRange===val?'rgba(96,165,250,0.15)':'rgba(255,255,255,0.04)'};color:${_analyticsChartRange===val?'#60a5fa':'rgba(255,255,255,0.4)'};">${lb}</button>`).join('')}</div><div id="alertTimeChart" style="min-height:200px;width:100%;"><div style="color:rgba(255,255,255,0.2);text-align:center;padding:2rem;font-size:0.8rem;">Building chart...</div></div>`);
	
	// ── Point 5: Quiet hour heatmap (7×24) ───────────────────────────────
	const heatmap = Array.from({length:7},()=>Array(24).fill(0));
	for (const ev of ndEvents) {
		const d = new Date(Math.min(...ev.alerts.map(a=>a.time))*1000);
		heatmap[d.getDay()][d.getHours()]++;
	}
	const maxCell = Math.max(...heatmap.flat(), 1);
	const dowLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
	html += card(`
		${lbl('Attack Frequency Heatmap — Day × Hour (Israel Time) (Since 28/2/2026)')}
		<div style="overflow-x:auto;margin-top:0.75rem;">
			<table style="border-collapse:collapse;width:100%;min-width:420px;">
				<thead>
					<tr>
						<td style="font-size:0.6rem;color:rgba(255,255,255,0.25);padding:1px 4px;width:28px;"></td>
						${Array.from({length:24},(_,h)=>`<td style="font-size:0.55rem;color:rgba(255,255,255,0.28);text-align:center;padding:1px;">${h}</td>`).join('')}
					</tr>
				</thead>
				<tbody>
					${heatmap.map((row,d)=>`
						<tr>
							<td style="font-size:0.6rem;color:${d===5||d===6?'rgba(96,165,250,0.7)':'rgba(255,255,255,0.32)'};padding:2px 4px;white-space:nowrap;">${dowLabels[d]}</td>
							${row.map((cnt,h)=>{
								const isNight=h<6||h>=22;
								const intensity=cnt/maxCell;
								const base = isNight ? '139,92,246' : '248,113,113';
								const bg = cnt===0 ? 'rgba(255,255,255,0.03)' : `rgba(${base},${0.15+intensity*0.82})`;
								const title = `${dowLabels[d]} ${h}:00 — ${cnt} event${cnt!==1?'s':''}`;
								return `<td title="${title}" style="background:${bg};border:1px solid rgba(255,255,255,0.04);border-radius:2px;width:calc(100%/24);height:18px;cursor:default;"></td>`;
							}).join('')}
						</tr>
					`).join('')}
				</tbody>
			</table>
		</div>
		<div style="display:flex;gap:1.25rem;margin-top:0.55rem;flex-wrap:wrap;">
			<span style="font-size:0.68rem;color:rgba(248,113,113,0.75);">▮ Day attacks</span>
			<span style="font-size:0.68rem;color:rgba(139,92,246,0.75);">▮ Night attacks (22–06)</span>
			<span style="font-size:0.68rem;color:rgba(96,165,250,0.7);">▮ Fri–Sat (Shabbat)</span>
			<span style="font-size:0.68rem;color:rgba(255,255,255,0.18);">▮ No attacks</span>
			<span style="font-size:0.68rem;color:rgba(255,255,255,0.28);margin-left:auto;">Hover cell for count</span>
		</div>
	`);

	// Red Alert Map
	html+=card(`${lbl('Red Alert Map — Since 28/2/2026')}
		<iframe src="https://redalerts.pages.dev/" style="width:100%;height:500px;border:1px solid rgba(255,255,255,0.1);border-radius:10px;" frameborder="0" loading="lazy"></iframe>
		<div style="font-size:0.62rem;color:rgba(255,255,255,0.2);margin-top:0.3rem;">Source: redalerts.pages.dev</div>
	`);
	
	// ── Placeholders for async sections (7 & 9) ───────────────────────────
	html+=`</div>`; // close war analytics frame
	html+=`</div>`; // close main grid
	return html;
}

// ── Point 7: IDF Telegram intercept scraper ───────────────────────────────
async function fetchTelegramIntercepts() {
	const div = document.getElementById('telegramInterceptDiv');
	if (!div) return;

	let found = null;

	// Step 1: Try static JSON (updated by GitHub Actions pipeline)
	try {
		const resp = await fetch(`data/telegram-idf.json?v=${Math.floor(Date.now()/60000)}`);
		if (resp.ok) {
			const json = await resp.json();
			if (json.messages && json.messages.length > 0) {
				found = json.messages;
				console.log(`Telegram data loaded from static JSON: ${found.length} messages (updated: ${json.updated})`);
			}
		}
	} catch(e) { console.warn('Static Telegram JSON not available:', e.message); }

	// Step 2: Fallback — try CORS proxy for live scraping
	if (!found) {
		const TG_URL = 'https://t.me/s/IDFSpokesperson';
		let html = null;
		for (const proxy of [
			'https://api.allorigins.win/raw?url=' + encodeURIComponent(TG_URL),
			'https://corsproxy.io/?url=' + encodeURIComponent(TG_URL),
		]) {
			try {
				const r = await fetch(proxy, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
				if (r.ok) { html = await r.text(); break; }
			} catch(e) {}
		}
		if (html) {
			const parser   = new DOMParser();
			const doc      = parser.parseFromString(html, 'text/html');
			const msgEls   = doc.querySelectorAll('.tgme_widget_message_text');
			const keywords = /intercept|rocket|missile|launched|fired|UAV|drone|projectile|aerial|threat|iron dome/i;
			const numberRx = /(\d+)\s*(rocket|missile|projectile|UAV|drone|aerial)/gi;
			const interceptRx = /intercept(?:ed)?\s+(\d+)/gi;
			found = [];
			msgEls.forEach(el => {
				const text = el.innerText || el.textContent || '';
				if (keywords.test(text) && found.length < 6) {
					const nums = [], m1 = [...text.matchAll(numberRx)], m2 = [...text.matchAll(interceptRx)];
					m1.forEach(m=>nums.push(m[0])); m2.forEach(m=>nums.push('intercepted '+m[1]));
					const tEl = el.closest('.tgme_widget_message')?.querySelector('time');
					const ts  = tEl ? tEl.getAttribute('datetime') : null;
					found.push({ text: text.slice(0,220).replace(/\n+/g,' '), nums, ts });
				}
			});
			if (!found.length) found = null;
		}
	}

	// Render results
	if (!found || !found.length) {
		div.innerHTML = `<div style="color:rgba(255,255,255,0.35);font-size:0.8rem;text-align:center;padding:0.5rem;">
			<div style="margin-bottom:0.5rem;">No recent intercept reports available.</div>
			<a href="https://t.me/s/IDFSpokesperson" target="_blank" style="color:#34d399;text-decoration:underline;">Open IDF Spokesperson channel directly ↗</a>
		</div>`;
		return;
	}

	div.innerHTML = `
		<div style="display:flex;flex-direction:column;gap:0.55rem;width:100%;">
			${found.map(f => {
				const tsFormatted = f.ts ? new Date(f.ts).toLocaleString('en-IL',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
				return `
				<div style="background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.15);border-radius:8px;padding:0.6rem 0.8rem;">
					<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;margin-bottom:0.3rem;">
						<div style="display:flex;flex-wrap:wrap;gap:0.3rem;">
							${(f.nums||[]).map(n=>`<span style="background:rgba(52,211,153,0.15);border:1px solid rgba(52,211,153,0.3);border-radius:4px;padding:0.1rem 0.4rem;font-size:0.72rem;color:#34d399;font-weight:700;">${n}</span>`).join('')}
						</div>
						<span style="font-size:0.65rem;color:rgba(255,255,255,0.25);white-space:nowrap;">${tsFormatted}</span>
					</div>
					<div style="font-size:0.74rem;color:rgba(255,255,255,0.55);line-height:1.4;">${f.text}${f.text.length>=220?'…':''}</div>
				</div>`;
			}).join('')}
			<a href="https://t.me/s/IDFSpokesperson" target="_blank" style="font-size:0.72rem;color:rgba(52,211,153,0.6);text-align:right;">Open full IDF Spokesperson channel ↗</a>
		</div>`;
}

// ── Point 9: Weather correlation (open-meteo, no API key) ─────────────────
async function fetchWeatherCorrelation() {
	const div = document.getElementById('weatherCorrelationDiv');
	if (!div || !_analyticsRawEvents) return;

	// Collect all real non-drill events
	const realEvents = _analyticsRawEvents.filter(ev => ev.alerts && ev.alerts.some(a=>!a.isDrill));
	if (!realEvents.length) { div.innerHTML='<span style="color:rgba(255,255,255,0.25);font-size:0.8rem;">No events to correlate.</span>'; return; }

	const times     = realEvents.flatMap(ev=>ev.alerts.filter(a=>!a.isDrill).map(a=>a.time));
	const minT      = Math.min(...times), maxT = Math.max(...times);
	const startDate = new Date(minT*1000).toISOString().slice(0,10);
	const endDate   = new Date(Math.min(maxT, Date.now()/1000 - 86400)*1000).toISOString().slice(0,10); // open-meteo needs yesterday max

	// Tel Aviv coords (central Israel)
	const WEATHER_URL = `https://archive-api.open-meteo.com/v1/archive?latitude=32.08&longitude=34.78&start_date=${startDate}&end_date=${endDate}&hourly=wind_speed_10m,visibility,precipitation&timezone=Asia%2FJerusalem&wind_speed_unit=kmh`;

	let weather = null;
	try {
		const r = await fetch(WEATHER_URL);
		if (r.ok) weather = await r.json();
	} catch(e) {}

	if (!weather || !weather.hourly) {
		div.innerHTML = '<span style="color:rgba(255,255,255,0.25);font-size:0.8rem;">Weather data unavailable for this date range.</span>';
		return;
	}

	// Build hourly lookup: ISO-hour → { wind, visibility, rain }
	const hourlyMap = {};
	weather.hourly.time.forEach((ts, i) => {
		hourlyMap[ts] = {
			wind:   weather.hourly.wind_speed_10m?.[i] ?? null,
			vis:    weather.hourly.visibility?.[i] ?? null,
			rain:   weather.hourly.precipitation?.[i] ?? 0,
		};
	});

	function getHourKey(ts) {
		const d = new Date(ts*1000);
		return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'T'+String(d.getHours()).padStart(2,'0')+':00';
	}

	// Separate rocket vs drone events and get weather at each
	const byThreat = { rocket: [], drone: [], other: [] };
	for (const ev of realEvents) {
		const t = parseInt(ev.alerts.find(a=>!a.isDrill)?.threat ?? 0);
		const evTime = Math.min(...ev.alerts.map(a=>a.time));
		const w = hourlyMap[getHourKey(evTime)];
		if (!w) continue;
		const key = t===0?'rocket':t===5?'drone':'other';
		if (w.wind!==null) byThreat[key].push(w);
	}

	// Get overall baseline weather (all hours in dataset)
	const allWeather = Object.values(hourlyMap);
	const avg = arr => arr.length ? (arr.reduce((s,v)=>s+v,0)/arr.length).toFixed(1) : '—';
	const avgWind = arr => avg(arr.map(w=>w.wind).filter(v=>v!==null));
	const avgVis  = arr => avg(arr.map(w=>w.vis).filter(v=>v!==null&&v<100000));
	const rainPct = arr => arr.length ? Math.round(arr.filter(w=>w.rain>0.1).length/arr.length*100) : 0;

	const baseWind = avgWind(allWeather), rocketWind = avgWind(byThreat.rocket), droneWind = avgWind(byThreat.drone);
	const baseVis  = avgVis(allWeather),  rocketVis  = avgVis(byThreat.rocket),  droneVis  = avgVis(byThreat.drone);
	const droneRain = rainPct(byThreat.drone), rocketRain = rainPct(byThreat.rocket);

	const diff = (a, b) => {
		if (a==='—'||b==='—') return '';
		const d = (parseFloat(a)-parseFloat(b)).toFixed(1);
		return parseFloat(d)>0?`<span style="color:#f87171;font-size:0.7rem;"> (+${d})</span>`
			:parseFloat(d)<0?`<span style="color:#34d399;font-size:0.7rem;"> (${d})</span>`:'';
	};

	div.innerHTML = `
		<div style="width:100%;">
			<div style="font-size:0.7rem;color:rgba(255,255,255,0.28);margin-bottom:0.6rem;">Tel Aviv weather at time of each attack vs dataset baseline. Lower wind + higher visibility = better drone conditions.</div>
			<table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
				<thead>
					<tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
						<th style="text-align:left;padding:0.3rem 0.5rem;color:rgba(255,255,255,0.35);font-weight:600;font-size:0.68rem;">Metric</th>
						<th style="text-align:center;padding:0.3rem;color:rgba(255,255,255,0.35);font-weight:600;font-size:0.68rem;">Overall Avg</th>
						<th style="text-align:center;padding:0.3rem;color:#f87171;font-weight:600;font-size:0.68rem;">During 🚀 Rockets</th>
						<th style="text-align:center;padding:0.3rem;color:#fb923c;font-weight:600;font-size:0.68rem;">During ✈️ Drones</th>
					</tr>
				</thead>
				<tbody>
					<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
						<td style="padding:0.35rem 0.5rem;color:rgba(255,255,255,0.6);">💨 Wind speed (km/h)</td>
						<td style="text-align:center;color:white;font-weight:700;">${baseWind}</td>
						<td style="text-align:center;color:#f87171;font-weight:700;">${rocketWind}${diff(rocketWind,baseWind)}</td>
						<td style="text-align:center;color:#fb923c;font-weight:700;">${droneWind}${diff(droneWind,baseWind)}</td>
					</tr>
					<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
						<td style="padding:0.35rem 0.5rem;color:rgba(255,255,255,0.6);">👁 Visibility (m)</td>
						<td style="text-align:center;color:white;font-weight:700;">${baseVis}</td>
						<td style="text-align:center;color:#f87171;font-weight:700;">${rocketVis}${diff(rocketVis,baseVis)}</td>
						<td style="text-align:center;color:#fb923c;font-weight:700;">${droneVis}${diff(droneVis,baseVis)}</td>
					</tr>
					<tr>
						<td style="padding:0.35rem 0.5rem;color:rgba(255,255,255,0.6);">🌧 % of attacks during rain</td>
						<td style="text-align:center;color:white;font-weight:700;">${rainPct(allWeather)}%</td>
						<td style="text-align:center;color:#f87171;font-weight:700;">${rocketRain}%</td>
						<td style="text-align:center;color:#fb923c;font-weight:700;">${droneRain}%</td>
					</tr>
				</tbody>
			</table>
			${byThreat.drone.length<3?'<div style="font-size:0.68rem;color:rgba(255,255,255,0.22);margin-top:0.4rem;">⚠ Too few drone events in dataset for reliable correlation.</div>':''}
			<div style="font-size:0.65rem;color:rgba(255,255,255,0.18);margin-top:0.35rem;">Data: open-meteo.com Archive API — Tel Aviv (32.08°N, 34.78°E). No API key required.</div>
		</div>`;
}
// ── End Alert Analytics ───────────────────────────────────────────────────