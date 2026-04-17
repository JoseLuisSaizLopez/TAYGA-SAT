/**
 * SatelliteDataService
 * Handles fetching satellite OMM data from CelesTrak with CORS proxy fallback
 */

const CELESTRAK_TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';
const CELESTRAK_JSON_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json';

const PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://api.codetabs.com/v1/proxy?quest=',
  'https://proxy.cors.sh/',
  'https://api.cors.lol/?url='
];
const LOCAL_FALLBACK = './data/satellites.json';

async function tryFetchJson(url, timeoutMs = 10000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) throw new Error('Empty or invalid payload');
  return data;
}

async function tryFetchTle(url, timeoutMs = 30000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  const data = parseTleText(text);
  if (data.length === 0) throw new Error('Empty TLE payload');
  return data;
}

/**
 * Parse classic 3-line TLE text into OMM-shaped records.
 * Each satellite: line1=name, line2=TLE_LINE1, line3=TLE_LINE2.
 */
function parseTleText(text) {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, ''));
  const out = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i].trim();
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (!l1 || !l2 || l1[0] !== '1' || l2[0] !== '2') continue;
    const noradId = parseInt(l1.substring(2, 7), 10);
    const intlDes = l1.substring(9, 17).trim();
    out.push({
      OBJECT_NAME: name,
      NORAD_CAT_ID: noradId,
      OBJECT_ID: intlDes,
      TLE_LINE1: l1,
      TLE_LINE2: l2,
      COUNTRY_CODE: 'UNK',
      OBJECT_TYPE: 'UNKNOWN',
      LAUNCH_DATE: null
    });
  }
  return out;
}

export async function fetchSatelliteData() {
  // Strategy 1: Try direct TLE fetch — TLE format is what SGP4 needs natively;
  // OMM JSON would require manual TLE reconstruction with fragile column-exact formatting.
  try {
    console.log('[DataService] Fetching live TLE data from CelesTrak...');
    const data = await tryFetchTle(CELESTRAK_TLE_URL, 30000);
    console.log(`[DataService] ✓ Loaded ${data.length} satellites directly (TLE)`);
    return data;
  } catch (err) {
    console.warn(`[DataService] Direct TLE fetch unavailable (${err.message}). Trying CORS proxies...`);
  }

  // Strategy 2: CORS proxies don't cooperate with the TLE endpoint (consistent
  // 403/500). Skip straight to JSON OMM via proxy — it works reliably and the
  // downstream SatelliteManager reconstructs the TLE correctly.

  // Strategy 3: JSON OMM fallback (reconstructs TLE internally)
  try {
    const data = await tryFetchJson(CELESTRAK_JSON_URL);
    console.log(`[DataService] ✓ Loaded ${data.length} satellites directly (OMM JSON)`);
    return data;
  } catch (err) {}
  for (const proxy of PROXIES) {
    try {
      const proxyUrl = proxy + encodeURIComponent(CELESTRAK_JSON_URL);
      const data = await tryFetchJson(proxyUrl, 15000);
      console.log(`[DataService] ✓ Loaded ${data.length} satellites via proxy OMM JSON`);
      return data;
    } catch (err) {}
  }

  // Strategy 4: Local fallback
  try {
    console.log('[DataService] Proxies unavailable. Loading local fallback...');
    const response = await fetch(LOCAL_FALLBACK + '?v=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Local file returned ${response.status}`);
    const data = await response.json();
    console.log(`[DataService] ✓ Loaded ${data.length} satellites from local cache`);
    return data;
  } catch (err) {
    console.error('[DataService] All sources failed:', err.message);
    throw new Error('Unable to load satellite data from any source');
  }
}

const metadataCache = new Map();

export async function fetchSatelliteMetadata(noradId) {
  if (metadataCache.has(noradId)) return metadataCache.get(noradId);
  
  const targetUrl = `https://celestrak.org/satcat/records.php?CATNR=${noradId}&FORMAT=json`;

  // Strategy 1: Direct fetch
  try {
    const res = await fetch(targetUrl, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
       const data = await res.json();
       if (data && data[0]) {
          metadataCache.set(noradId, data[0]);
          return data[0];
       }
    }
  } catch (e) {
    // fallback to proxies
  }
  
  // Strategy 2: Proxy fallback
  for (const proxy of PROXIES) {
     try {
       const proxyUrl = proxy.includes('codetabs') || proxy.includes('allorigins') 
         ? proxy + encodeURIComponent(targetUrl)
         : proxy + encodeURIComponent(targetUrl);
         
       const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(5000) });
       if (res.ok) {
          const data = await res.json();
          if (data && data[0]) {
             metadataCache.set(noradId, data[0]);
             return data[0];
          }
       }
     } catch(e) {}
  }
  
  return null;
}
