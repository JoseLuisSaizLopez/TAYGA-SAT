/**
 * SatelliteManager
 * Processes CelesTrak OMM JSON and performs SGP4 orbital propagation
 */
import * as satellite from 'satellite.js';

// Country code to name mapping for display
const COUNTRY_NAMES = {
  'US': 'United States', 'CIS': 'CIS (former USSR)', 'PRC': 'China',
  'JPN': 'Japan', 'IND': 'India', 'FR': 'France', 'ESA': 'ESA',
  'GER': 'Germany', 'UK': 'United Kingdom', 'IT': 'Italy',
  'CA': 'Canada', 'BRAZ': 'Brazil', 'ISR': 'Israel', 'KOR': 'South Korea',
  'TW': 'Taiwan', 'AU': 'Australia', 'ARGN': 'Argentina', 'SPN': 'Spain',
  'NZ': 'New Zealand', 'SAFR': 'South Africa', 'UAE': 'UAE',
  'TURK': 'Turkey', 'SWE': 'Sweden', 'NOR': 'Norway', 'FIN': 'Finland',
  'DEN': 'Denmark', 'NETH': 'Netherlands', 'AB': 'Saudi Arabia',
  'LUXE': 'Luxembourg', 'SING': 'Singapore', 'THAI': 'Thailand',
  'INDO': 'Indonesia', 'MALA': 'Malaysia', 'MEX': 'Mexico',
  'COL': 'Colombia', 'CZCH': 'Czechia', 'POL': 'Poland',
  'HUN': 'Hungary', 'ROM': 'Romania', 'PAKI': 'Pakistan',
  'IRAN': 'Iran', 'EGYP': 'Egypt', 'CHLE': 'Chile',
  'O/S': 'Other', 'NATO': 'NATO', 'RP': 'Philippines'
};

export class SatelliteManager {
  constructor() {
    /** @type {Map<number, SatelliteRecord>} */
    this.satellites = new Map();
    this.nameIndex = [];
  }

  /**
   * Load and process OMM JSON data
   * @param {Array} ommArray - Array of OMM records from CelesTrak
   * @returns {number} Number of successfully loaded satellites
   */
  loadSatellites(ommArray) {
    this.satellites.clear();
    this.nameIndex = [];
    let loaded = 0;

    for (const omm of ommArray) {
      try {
        let satrec;
        if (omm.TLE_LINE1 && omm.TLE_LINE2) {
          satrec = satellite.twoline2satrec(omm.TLE_LINE1, omm.TLE_LINE2);
        } else {
          satrec = this._ommToSatrec(omm);
        }

        if (!satrec || satrec.error) continue;

        const noradId = omm.NORAD_CAT_ID;
        const record = {
          noradId,
          name: omm.OBJECT_NAME || 'UNKNOWN',
          countryCode: omm.COUNTRY_CODE || 'UNK',
          countryName: 'Unknown',
          objectType: omm.OBJECT_TYPE || 'UNKNOWN',
          launchDate: omm.LAUNCH_DATE || null,
          satrec,
          position: null,
          velocity: null,
          lat: 0,
          lon: 0,
          alt: 0,
          speed: 0
        };

        this.satellites.set(noradId, record);
        this.nameIndex.push({ noradId, name: record.name.toLowerCase() });
        loaded++;
      } catch (e) {}
    }

    this.nameIndex.sort((a, b) => a.name.localeCompare(b.name));
    console.log(`[SatelliteManager] Loaded ${loaded} satellites reliably via explicit TLE parsing`);
    return loaded;
  }

  _ommToSatrec(omm) {
    try {
      const tleLine1 = this._buildTleLine1(omm);
      const tleLine2 = this._buildTleLine2(omm);
      return satellite.twoline2satrec(tleLine1, tleLine2);
    } catch (e) {
      return null;
    }
  }

  _buildTleLine1(omm) {
    let line = '1 '.padEnd(68, ' ');
    const set = (str, start, len) => {
      let s = String(str);
      if (s.length > len) s = s.substring(0, len);
      else s = s.padStart(len, ' ');
      line = line.substring(0, start) + s + line.substring(start + len);
    };

    set(omm.NORAD_CAT_ID || 0, 2, 5);
    set(omm.CLASSIFICATION_TYPE || 'U', 7, 1);
    set((omm.OBJECT_ID || '').replace(/-/, ''), 9, 8);
    set(this._dateToTleEpoch(omm.EPOCH), 18, 14);
    set(this._formatNdot(omm.MEAN_MOTION_DOT), 33, 10);
    set(this._formatNddot(omm.MEAN_MOTION_DDOT), 44, 8);
    set(this._formatBstar(omm.BSTAR), 53, 8);
    set(omm.EPHEMERIS_TYPE || 0, 62, 1);
    set(omm.ELEMENT_SET_NO || 999, 64, 4);

    return line.substring(0, 68) + String(this._tleChecksum(line.substring(0, 68)));
  }

  _buildTleLine2(omm) {
    let line = '2 '.padEnd(68, ' ');
    const set = (str, start, len) => {
      let s = String(str);
      if (s.length > len) s = s.substring(0, len);
      else s = s.padStart(len, ' ');
      line = line.substring(0, start) + s + line.substring(start + len);
    };

    set(omm.NORAD_CAT_ID || 0, 2, 5);
    set((omm.INCLINATION || 0).toFixed(4), 8, 8);
    set((omm.RA_OF_ASC_NODE || 0).toFixed(4), 17, 8);
    set((omm.ECCENTRICITY || 0).toFixed(7).substring(2), 26, 7);
    set((omm.ARG_OF_PERICENTER || 0).toFixed(4), 34, 8);
    set((omm.MEAN_ANOMALY || 0).toFixed(4), 43, 8);
    set((omm.MEAN_MOTION || 0).toFixed(8), 52, 11);
    set((omm.REV_AT_EPOCH || 0), 63, 5);

    return line.substring(0, 68) + String(this._tleChecksum(line.substring(0, 68)));
  }

  _dateToTleEpoch(epochStr) {
    if (!epochStr) return '00000.00000000';
    // CelesTrak OMM EPOCH is UTC but omits the trailing 'Z', so
    // `new Date(str)` parses it as local time and shifts by TZ offset.
    // Force UTC.
    const utcStr = /[Zz]|[+-]\d{2}:?\d{2}$/.test(epochStr) ? epochStr : epochStr + 'Z';
    const d = new Date(utcStr);
    const year = d.getUTCFullYear() % 100;
    const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const dayOfYear = (d - start) / 86400000 + 1;
    let dyStr = dayOfYear.toFixed(8);
    if(dyStr.length > 12) dyStr = dyStr.substring(0,12); // clamp
    return `${String(year).padStart(2, '0')}${dyStr.padStart(12, '0')}`;
  }

  _formatNdot(val) {
    let v = val || 0;
    if (v === 0) return ' .00000000';
    const sign = v < 0 ? '-' : ' ';
    const s = Math.abs(v).toFixed(8).substring(1);
    return sign + s;
  }

  _formatNddot(val) {
    let v = val || 0;
    if (v === 0) return ' 00000-0';
    const sign = v < 0 ? '-' : ' ';
    const abs = Math.abs(v);
    const exp = Math.floor(Math.log10(abs));
    let mantissa = (abs / Math.pow(10, exp)).toFixed(4).substring(1).replace('.', '');
    if (mantissa.length > 5) mantissa = mantissa.substring(0, 5);
    return `${sign}${mantissa}${exp >= 0 ? '+' : '-'}${Math.abs(exp)}`;
  }

  _formatBstar(val) {
    let v = val || 0;
    if (v === 0) return ' 00000-0';
    const sign = v < 0 ? '-' : ' ';
    const abs = Math.abs(v);
    if (abs === 0) return ' 00000-0';
    const exp = Math.floor(Math.log10(abs)) + 1;
    let mantissa = Math.round(abs / Math.pow(10, exp - 5));
    // Clamp to 5 digits
    let mantStr = String(mantissa).substring(0, 5).padStart(5, '0');
    let eExp = Math.abs(exp) > 9 ? 9 : Math.abs(exp); // Clamp exp to 1 char
    return `${sign}${mantStr}${exp >= 0 ? '+' : '-'}${eExp}`;
  }

  _tleChecksum(line) {
    let sum = 0;
    for (let i = 0; i < 68; i++) {
      const c = line[i];
      if (c >= '0' && c <= '9') sum += parseInt(c, 10);
      else if (c === '-') sum += 1;
    }
    return sum % 10;
  }

  /**
   * Propagate all satellites to the given date
   * @param {Date} date
   * @returns {Map<number, {lat, lon, alt, speed}>}
   */
  propagateAll(date) {
    const gmst = satellite.gstime(date);

    for (const [noradId, rec] of this.satellites) {
      try {
        const posVel = satellite.propagate(rec.satrec, date);
        if (!posVel.position || typeof posVel.position === 'boolean') continue;

        const posEci = posVel.position;
        const velEci = posVel.velocity;

        // Convert ECI to geodetic
        const geodetic = satellite.eciToGeodetic(posEci, gmst);

        const lat = satellite.degreesLat(geodetic.latitude);
        const lon = satellite.degreesLong(geodetic.longitude);
        const alt = geodetic.height;

        // Prevent NaN, infinite, or physically absurd values (e.g. SGP4 deep space singularities)
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(alt) || Math.abs(alt) > 1000000) {
          rec.alt = 0; // Ensures it gets skipped by the renderer
          continue;
        }

        rec.lat = lat;
        rec.lon = lon;
        rec.alt = alt; // km
        rec.speed = Math.sqrt(
          (velEci.x || 0) * (velEci.x || 0) +
          (velEci.y || 0) * (velEci.y || 0) +
          (velEci.z || 0) * (velEci.z || 0)
        ); // km/s
        rec.position = posEci;
        rec.velocity = velEci;
      } catch (e) {
        // Propagation failed for this satellite
      }
    }

    return this.satellites;
  }

  /**
   * Propagate a single satellite to the given date. Cheap — meant to be
   * called every frame for the currently selected satellite so its
   * lat/lon/alt/speed feel live instead of jumping at the 1 Hz tick.
   */
  propagateOne(noradId, date) {
    const rec = this.satellites.get(noradId);
    if (!rec) return null;
    try {
      const posVel = satellite.propagate(rec.satrec, date);
      if (!posVel.position || typeof posVel.position === 'boolean') return rec;
      const gmst = satellite.gstime(date);
      const geodetic = satellite.eciToGeodetic(posVel.position, gmst);
      const lat = satellite.degreesLat(geodetic.latitude);
      const lon = satellite.degreesLong(geodetic.longitude);
      const alt = geodetic.height;
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(alt) || Math.abs(alt) > 1_000_000) {
        return rec;
      }
      rec.lat = lat;
      rec.lon = lon;
      rec.alt = alt;
      const v = posVel.velocity;
      rec.speed = Math.sqrt((v.x || 0) ** 2 + (v.y || 0) ** 2 + (v.z || 0) ** 2);
      rec.position = posVel.position;
      rec.velocity = v;
    } catch {}
    return rec;
  }

  /**
   * Search satellites by name
   * @param {string} query
   * @param {number} limit
   * @returns {Array}
   */
  searchByName(query, limit = 50) {
    if (!query || query.length < 1) return [];
    const q = query.toLowerCase();
    const results = [];

    for (const entry of this.nameIndex) {
      if (entry.name.includes(q)) {
        results.push(this.satellites.get(entry.noradId));
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  /**
   * Get a satellite by its NORAD ID
   * @param {number} noradId
   * @returns {Object|undefined}
   */
  getSatelliteById(noradId) {
    return this.satellites.get(noradId);
  }

  /**
   * Get orbit type based on altitude
   */
  static getOrbitType(altKm) {
    if (altKm < 2000) return 'LEO';
    if (altKm < 20200) return 'MEO';
    if (altKm >= 35000 && altKm <= 36000) return 'GEO';
    return 'HEO';
  }

  /**
   * Get total count
   */
  get count() {
    return this.satellites.size;
  }
}
