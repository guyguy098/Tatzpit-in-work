/**
 * update-hormuz-data.js
 * Connects to AISStream.io for ~90 seconds, captures vessel positions
 * in the Strait of Hormuz / Persian Gulf, classifies them by zone
 * and type, then appends a snapshot to data/hormuz-metrics.jsonl
 */

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const API_KEY = process.env.AISSTREAM_API_KEY;
const OUT_FILE = path.join(__dirname, '..', 'data', 'hormuz-metrics.jsonl');
const COLLECT_SECONDS = 90;

if (!API_KEY) {
	console.error('No AISSTREAM_API_KEY set.');
	process.exit(1);
}

// Bounding box covering Persian Gulf + Strait of Hormuz + Gulf of Oman + part of Arabian Sea
// [lat_min, lng_min] to [lat_max, lng_max]
const BOUNDING_BOX = [[22.0, 47.0], [30.5, 62.0]];

// Zone definitions (lat, lng polygons simplified to boxes)
function classifyZone(lat, lng) {
	// Strait of Hormuz (narrowest part)
	if (lat >= 26.0 && lat <= 27.2 && lng >= 55.5 && lng <= 57.2) return 'strait';
	// Fujairah anchorage area (UAE east coast)
	if (lat >= 24.8 && lat <= 25.6 && lng >= 56.2 && lng <= 56.8) return 'fujairah';
	// Inside Persian Gulf
	if (lat >= 24.0 && lat <= 30.5 && lng >= 48.0 && lng <= 56.0) return 'inside_gulf';
	// Gulf of Oman
	if (lat >= 22.5 && lat <= 26.5 && lng >= 56.5 && lng <= 60.0) return 'gulf_oman';
	// Arabian Sea (entry queue)
	if (lat >= 22.0 && lat <= 25.0 && lng >= 58.0 && lng <= 62.0) return 'arabian_sea';
	return 'other';
}

// AIS ship type codes → broad category
function classifyType(shipType) {
	if (!shipType) return 'other';
	if (shipType >= 80 && shipType <= 89) return 'tanker'; // Tankers
	if (shipType === 70 || (shipType >= 71 && shipType <= 79)) return 'cargo';
	return 'other';
}

// Iran MMSI prefix is 422
function isIranFlagged(mmsi) {
	return String(mmsi).startsWith('422');
}

// Detect LNG/LPG vs crude tankers from name keywords (rough heuristic)
function detectTankerSubtype(name, shipType) {
	if (!name) return null;
	const n = name.toUpperCase();
	if (/LNG|GAS|METHANE|LPG/.test(n)) return 'lng_gas';
	if (/CRUDE|VLCC|SUEZMAX/.test(n)) return 'crude';
	if (shipType >= 80 && shipType <= 89) return 'tanker';
	return null;
}

const vessels = new Map(); // mmsi → latest data

console.log('Connecting to AISStream...');
const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

ws.on('open', () => {
	console.log('Connected. Subscribing to bounding box.');
	ws.send(JSON.stringify({
		APIKey: API_KEY,
		BoundingBoxes: [BOUNDING_BOX],
		FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
	}));
	console.log(`Listening for ${COLLECT_SECONDS}s...`);
	setTimeout(() => {
		ws.close();
	}, COLLECT_SECONDS * 1000);
});

ws.on('message', (raw) => {
	try {
		const msg = JSON.parse(raw);
		const meta = msg.MetaData;
		if (!meta) return;
		const mmsi = meta.MMSI;
		if (!mmsi) return;

		if (!vessels.has(mmsi)) {
			vessels.set(mmsi, { mmsi, name: meta.ShipName?.trim() || '', lat: null, lng: null, sog: 0, type: 0, flag: '' });
		}
		const v = vessels.get(mmsi);

		if (msg.MessageType === 'PositionReport' && msg.Message?.PositionReport) {
			const p = msg.Message.PositionReport;
			v.lat = p.Latitude;
			v.lng = p.Longitude;
			v.sog = p.Sog || 0;
		}
		if (msg.MessageType === 'ShipStaticData' && msg.Message?.ShipStaticData) {
			const s = msg.Message.ShipStaticData;
			v.type = s.Type || 0;
			if (s.Name) v.name = s.Name.trim();
		}
	} catch (e) { /* ignore parse errors */ }
});

ws.on('close', () => {
	console.log(`Captured ${vessels.size} unique vessels. Aggregating...`);
	aggregate();
});

ws.on('error', (e) => {
	console.error('WebSocket error:', e.message);
	process.exit(1);
});

function aggregate() {
	const snapshot = {
		timestamp: new Date().toISOString(),
		total_vessels: 0,
		total_tankers: 0,
		fujairah_anchored: 0, fujairah_moving: 0,
		inside_gulf_stuck: 0, inside_gulf_moving: 0,
		strait_transiting: 0, strait_slow: 0,
		gulf_oman_queue: 0, gulf_oman_moving: 0,
		arabian_sea_queue: 0,
		iran_flagged: 0,
		fujairah_destination: 0,
		avg_strait_speed: 0,
		zero_speed_tankers: 0,
		zones: { strait: 0, fujairah: 0, inside_gulf: 0, gulf_oman: 0, arabian_sea: 0, other: 0 },
		lng_gas_total: 0, lng_gas_stuck: 0, lng_gas_transiting: 0, lng_gas_anchored_fujairah: 0, lng_gas_inside_gulf: 0, lng_gas_queue_oman: 0,
		qatar_bound: 0, qatar_bound_stuck: 0,
		crude_total: 0, crude_stuck: 0, crude_transiting: 0, crude_anchored_fujairah: 0, crude_inside_gulf: 0, crude_queue_oman: 0,
		oil_terminal_bound: 0, oil_terminal_bound_stuck: 0,
		sample_vessels: { fujairah: [], strait: [], inside_gulf: [] },
		crisis_severity: 0,
	};

	let straitSpeedSum = 0, straitSpeedCount = 0;
	const STUCK_THRESHOLD = 0.5; // knots

	for (const v of vessels.values()) {
		if (v.lat === null || v.lng === null) continue;
		snapshot.total_vessels++;

		const zone = classifyZone(v.lat, v.lng);
		snapshot.zones[zone]++;

		const isTanker = (v.type >= 80 && v.type <= 89);
		const subtype = detectTankerSubtype(v.name, v.type);
		const stuck = v.sog < STUCK_THRESHOLD;

		if (isTanker) snapshot.total_tankers++;
		if (isIranFlagged(v.mmsi)) snapshot.iran_flagged++;
		if (isTanker && stuck) snapshot.zero_speed_tankers++;

		// Zone-based counters
		if (zone === 'fujairah') {
			if (stuck) snapshot.fujairah_anchored++; else snapshot.fujairah_moving++;
		} else if (zone === 'inside_gulf') {
			if (stuck) snapshot.inside_gulf_stuck++; else snapshot.inside_gulf_moving++;
		} else if (zone === 'strait') {
			if (stuck) snapshot.strait_slow++; else snapshot.strait_transiting++;
			if (v.sog > 0) { straitSpeedSum += v.sog; straitSpeedCount++; }
		} else if (zone === 'gulf_oman') {
			if (stuck) snapshot.gulf_oman_queue++; else snapshot.gulf_oman_moving++;
		} else if (zone === 'arabian_sea') {
			snapshot.arabian_sea_queue++;
		}

		// Subtype tracking
		if (subtype === 'lng_gas') {
			snapshot.lng_gas_total++;
			if (stuck) snapshot.lng_gas_stuck++;
			if (zone === 'strait' && !stuck) snapshot.lng_gas_transiting++;
			if (zone === 'fujairah' && stuck) snapshot.lng_gas_anchored_fujairah++;
			if (zone === 'inside_gulf') snapshot.lng_gas_inside_gulf++;
			if (zone === 'gulf_oman' && stuck) snapshot.lng_gas_queue_oman++;
		}
		if (subtype === 'crude') {
			snapshot.crude_total++;
			if (stuck) snapshot.crude_stuck++;
			if (zone === 'strait' && !stuck) snapshot.crude_transiting++;
			if (zone === 'fujairah' && stuck) snapshot.crude_anchored_fujairah++;
			if (zone === 'inside_gulf') snapshot.crude_inside_gulf++;
			if (zone === 'gulf_oman' && stuck) snapshot.crude_queue_oman++;
		}
		if (isTanker) {
			snapshot.oil_terminal_bound++;
			if (stuck) snapshot.oil_terminal_bound_stuck++;
		}

		// Sample vessels for tooltips (top 5 per major zone)
		if (snapshot.sample_vessels[zone] && snapshot.sample_vessels[zone].length < 5) {
			const flag = String(v.mmsi).slice(0, 3);
			snapshot.sample_vessels[zone].push(`${v.name || 'UNKNOWN'}(${flag},${v.sog.toFixed(1)}kn)`);
		}
	}

	snapshot.avg_strait_speed = straitSpeedCount > 0 ? +(straitSpeedSum / straitSpeedCount).toFixed(2) : 0;

	// Crisis severity: weighted score based on stuck tankers, low strait throughput, etc.
	snapshot.crisis_severity = +(
		snapshot.zero_speed_tankers * 2 +
		snapshot.gulf_oman_queue * 1.5 +
		snapshot.inside_gulf_stuck * 1.2 +
		(snapshot.avg_strait_speed < 3 ? 100 : 0)
	).toFixed(1);

	// Append to JSONL file
	fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
	fs.appendFileSync(OUT_FILE, JSON.stringify(snapshot) + '\n');

	console.log(`Snapshot written: ${snapshot.total_vessels} vessels, severity ${snapshot.crisis_severity}`);
	console.log('=== Done ===');
	process.exit(0);
}