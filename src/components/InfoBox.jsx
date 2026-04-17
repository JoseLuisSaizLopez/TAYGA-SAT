import { useState, useEffect } from 'react';
import { SatelliteManager } from '../engine/SatelliteManager.js';
import { fetchSatelliteMetadata } from '../services/SatelliteDataService.js';

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
  'O/S': 'Other', 'NATO': 'NATO', 'RP': 'Philippines',
  'ISS': 'Int. Space Station'
};

const OBJECT_TYPES = {
  'PAY': 'Payload',
  'R/B': 'Rocket Body',
  'DEB': 'Debris',
  'UNK': 'Unknown'
};

export default function InfoBox({ satellite, onClose, tracking, onToggleTrack }) {
  const [metadata, setMetadata] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!satellite) return;

    let isMounted = true;
    setMetadata(null);
    setLoadingMeta(true);

    fetchSatelliteMetadata(satellite.noradId).then(data => {
      if (isMounted) {
        setMetadata(data);
        setLoadingMeta(false);
      }
    });

    return () => { isMounted = false; };
  }, [satellite?.noradId]);

  if (!satellite) return null;

  const orbitType = SatelliteManager.getOrbitType(satellite.alt);

  let countryDisplay = 'Loading…';
  let typeDisplay = 'Loading…';
  let launchDisplay = satellite.launchDate || '';

  if (!loadingMeta) {
    if (metadata) {
      countryDisplay = COUNTRY_NAMES[metadata.OWNER] || metadata.OWNER || 'Unknown';
      typeDisplay = OBJECT_TYPES[metadata.OBJECT_TYPE] || metadata.OBJECT_TYPE || 'Unknown';
      launchDisplay = metadata.LAUNCH_DATE || launchDisplay;
    } else {
      countryDisplay = 'Unavailable';
      typeDisplay = 'Unavailable';
    }
  }

  return (
    <section
      className={`infobox ${collapsed ? 'infobox--collapsed' : ''} ${tracking ? 'infobox--tracking' : ''}`}
      id="satellite-infobox"
      role="dialog"
      aria-label={`Satellite ${satellite.name}`}
    >
      <header className="infobox__header">
        <div className="infobox__title">
          <span className={`orbit-indicator orbit-indicator--${orbitType.toLowerCase()}`} aria-hidden="true" />
          <div className="infobox__titletext">
            <h2>{satellite.name}</h2>
            <span className="infobox__subtitle">NORAD {satellite.noradId}</span>
          </div>
        </div>
        <div className="infobox__actions">
          <button
            type="button"
            className={`infobox__btn infobox__btn--track ${tracking ? 'is-active' : ''}`}
            onClick={() => onToggleTrack?.(!tracking)}
            aria-pressed={!!tracking}
            aria-label={tracking ? 'Disable camera tracking' : 'Enable camera tracking'}
            title={tracking ? 'Tracking on — camera follows satellite' : 'Track satellite'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <circle cx="12" cy="12" r="8" strokeDasharray="2 3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="infobox__btn infobox__btn--collapse"
            onClick={() => setCollapsed(c => !c)}
            aria-expanded={!collapsed}
            aria-controls="infobox-grid"
            aria-label={collapsed ? 'Expand details' : 'Collapse details'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
              style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            className="infobox__btn infobox__btn--close"
            onClick={onClose}
            aria-label="Close satellite details"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <div id="infobox-grid" className="infobox__grid" aria-hidden={collapsed}>
        <DataCell label="Altitude" value={satellite.alt > 0 ? `${satellite.alt.toFixed(1)} km` : '—'} />
        <DataCell label="Speed" value={satellite.speed > 0 ? `${satellite.speed.toFixed(2)} km/s` : '—'} />
        <DataCell label="Latitude" value={`${satellite.lat.toFixed(4)}°`} mono />
        <DataCell label="Longitude" value={`${satellite.lon.toFixed(4)}°`} mono />
        <DataCell label="Country" value={countryDisplay} />
        <DataCell label="Type" value={typeDisplay} />
        <DataCell label="Orbit" value={<span className={`orbit-badge orbit-badge--${orbitType.toLowerCase()}`}>{orbitType}</span>} />
        {launchDisplay && <DataCell label="Launch" value={launchDisplay} />}
      </div>
    </section>
  );
}

function DataCell({ label, value, mono = false }) {
  return (
    <div className="info-cell">
      <span className="info-cell__label">{label}</span>
      <span className={`info-cell__value ${mono ? 'info-cell__value--mono' : ''}`}>{value}</span>
    </div>
  );
}
