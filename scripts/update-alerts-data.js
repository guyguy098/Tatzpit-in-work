/**
 * update-alerts-data.js
 * Runs via GitHub Actions every 30 minutes.
 * 1. Fetches FULL alert history from tzevadom.com (paginated, free, no key)
 * 2. Transforms to the format alert-analytics.js expects
 * 3. Merges with existing data (preserves anything tzevadom.com may have dropped)
 * 4. Writes data/alert-history.json
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'alert-history.json');
const TELEGRAM_FILE = path.join(__dirname, 'data', 'telegram-idf.json');
const TG_URL = 'https://t.me/s/IDFSpokesperson';

// tzevadom.com — paginated history API (free, no API key, has CORS)
const HISTORY_API = 'https://tzevadom.com/api/alerts-history/recent';
const PAGE_LIMIT = 100;            // max per page
const WAR_START = 1772236800;       // Feb 28, 2026 00:00 UTC

async function fetchAllWarAlerts() {
    const allEvents = [];
    let page = 1;
    let reachedPreWar = false;

    console.log('Fetching alert history from tzevadom.com...');

    while (!reachedPreWar && page <= 200) {   // safety cap
        const url = `${HISTORY_API}?page=${page}&limit=${PAGE_LIMIT}`;
        try {
            const resp = await fetch(url, {
                headers: { 'User-Agent': 'TatzpitBot/1.0' },
                signal: AbortSignal.timeout(15000),
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();

            if (!Array.isArray(data) || data.length === 0) {
                console.log(`  Page ${page}: empty — end of data`);
                break;
            }

            let kept = 0;
            for (const ev of data) {
                if (ev.startTime < WAR_START) {
                    reachedPreWar = true;
                    continue;   // skip pre-war events
                }
                allEvents.push(ev);
                kept++;
            }

            console.log(`  Page ${page}: ${data.length} events, ${kept} kept (war-period)`);
            page++;

            // Be polite — small delay between pages
            await new Promise(r => setTimeout(r, 300));

        } catch (e) {
            console.error(`  Page ${page} failed: ${e.message}`);
            // Retry once after a pause
            await new Promise(r => setTimeout(r, 2000));
            page++;
        }
    }

    console.log(`Total war-period events fetched: ${allEvents.length}`);
    return allEvents;
}

/**
 * Transform tzevadom.com flat format → tzevaadom.co.il nested format
 * so alert-analytics.js works without changes.
 */
function transformEvents(tzevadomEvents) {
    return tzevadomEvents.map(ev => ({
        id: ev.id,
        description: ev.description || null,
        alerts: [{
            time: ev.startTime,
            cities: ev.cities || [],
            threat: ev.type ?? 0,
            isDrill: false,
        }],
        // Keep extra fields for future use
        endTime: ev.endTime || null,
    }));
}

function mergeAlerts(existing, fresh) {
    if (!existing || !existing.events) return fresh;
    if (!fresh || fresh.length === 0) return existing.events;

    const byId = new Map();
    for (const ev of existing.events) {
        byId.set(ev.id, ev);
    }
    for (const ev of fresh) {
        byId.set(ev.id, ev);   // fresh overwrites
    }
    return [...byId.values()].sort((a, b) => {
        const tA = a.alerts?.[0]?.time || 0;
        const tB = b.alerts?.[0]?.time || 0;
        return tB - tA;   // newest first
    });
}

async function main() {
    console.log('=== Alert History Update ===');
    console.log(`Time: ${new Date().toISOString()}`);

    // Load existing data
    let existing = null;
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        existing = JSON.parse(raw);
        console.log(`Loaded existing: ${existing.events?.length || 0} events`);
    } catch (e) {
        console.log('No existing data file, starting fresh.');
    }

    // Fetch from tzevadom.com (paginated — gets full war history)
    const rawEvents = await fetchAllWarAlerts();
    const transformed = transformEvents(rawEvents);

    // Merge with existing (preserves any data tzevadom might have pruned)
    const merged = mergeAlerts(existing, transformed);

    if (!merged || merged.length === 0) {
        console.error('No data available at all. Exiting.');
        process.exit(existing ? 0 : 1);
    }

    const output = {
        updated: new Date().toISOString(),
        source: 'tzevadom.com',
        event_count: merged.length,
        events: merged,
    };

    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(output));
    console.log(`Written ${merged.length} events to ${DATA_FILE}`);

    // ── Telegram IDF Spokesperson ──────────────────────────────────────────
    console.log('\nFetching IDF Spokesperson Telegram...');
    try {
        const tgResp = await fetch(TG_URL, {
            headers: { 'User-Agent': 'TatzpitBot/1.0' },
            signal: AbortSignal.timeout(15000),
        });
        if (!tgResp.ok) throw new Error(`HTTP ${tgResp.status}`);
        const tgHtml = await tgResp.text();

        const messages = [];
        const msgRegex = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
        const timeRegex = /<time[^>]*datetime="([^"]*)"[^>]*>/gi;

        const timestamps = [];
        let timeMatch;
        while ((timeMatch = timeRegex.exec(tgHtml)) !== null) {
            timestamps.push(timeMatch[1]);
        }

        let msgMatch;
        let msgIndex = 0;
        const keywords = /intercept|rocket|missile|launched|fired|UAV|drone|projectile|aerial|threat|iron dome|שיגור|יירוט|רקט/i;
        const numberRx = /(\d+)\s*(rocket|missile|projectile|UAV|drone|aerial)/gi;
        const interceptRx = /intercept(?:ed)?\s+(\d+)/gi;

        while ((msgMatch = msgRegex.exec(tgHtml)) !== null) {
            const rawText = msgMatch[1]
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<[^>]+>/g, '')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#039;/g, "'")
                .trim();

            if (keywords.test(rawText) && messages.length < 10) {
                const nums = [];
                const m1 = [...rawText.matchAll(numberRx)];
                const m2 = [...rawText.matchAll(interceptRx)];
                m1.forEach(m => nums.push(m[0]));
                m2.forEach(m => nums.push('intercepted ' + m[1]));

                messages.push({
                    text: rawText.slice(0, 300),
                    nums,
                    ts: timestamps[msgIndex] || null,
                });
            }
            msgIndex++;
        }

        const tgOutput = {
            updated: new Date().toISOString(),
            source: 'IDF Spokesperson Telegram',
            message_count: messages.length,
            messages,
        };

        fs.writeFileSync(TELEGRAM_FILE, JSON.stringify(tgOutput, null, 2));
        console.log(`Written ${messages.length} intercept messages to ${TELEGRAM_FILE}`);
    } catch (e) {
        console.warn('Telegram fetch failed:', e.message);
    }

    console.log('=== Done ===');
}

main().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});