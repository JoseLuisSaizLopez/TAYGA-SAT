import { useMemo } from 'react';
import { SatelliteManager } from '../engine/SatelliteManager.js';

/**
 * Sidebar — Brand, live stats, legend, and view settings.
 * Search lives in its own top-center command bar (see SearchBar.jsx).
 */
export default function Sidebar({
  satelliteManager,
  isOpen,
  onToggle,
  showClouds,
  onToggleClouds,
  showAtmosphere,
  onToggleAtmosphere,
}) {
  const totalCount = satelliteManager ? satelliteManager.count : 0;

  const counts = useMemo(() => {
    const buckets = { LEO: 0, MEO: 0, GEO: 0, HEO: 0 };
    if (!satelliteManager) return buckets;
    for (const sat of satelliteManager.satellites.values()) {
      const t = SatelliteManager.getOrbitType(sat.alt);
      if (buckets[t] !== undefined) buckets[t]++;
    }
    return buckets;
  }, [satelliteManager, totalCount]);

  const maxBucket = Math.max(counts.LEO, counts.MEO, counts.GEO, counts.HEO, 1);

  return (
    <>
      <div
        className={`sidebar-backdrop ${isOpen ? 'sidebar-backdrop--visible' : ''}`}
        onClick={onToggle}
        aria-hidden="true"
      />
      <button
        id="sidebar-toggle"
        className={`sidebar-toggle ${isOpen ? 'sidebar-toggle--open' : ''}`}
        onClick={onToggle}
        aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-expanded={isOpen}
        aria-controls="sidebar"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          {isOpen ? (
            <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      </button>

      <aside
        className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}
        id="sidebar"
        aria-label="Mission panel"
        aria-hidden={!isOpen}
      >
        <header className="sidebar__brand">
          <div className="sidebar__logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="16" cy="16" r="6" />
              <ellipse cx="16" cy="16" rx="13.5" ry="5" transform="rotate(-28 16 16)" />
              <circle cx="28" cy="10" r="1.4" fill="currentColor" />
            </svg>
          </div>
          <div className="sidebar__wordmark">
            <h1>
              <span className="brand-primary">TAYGA</span>
              <span className="brand-secondary">SAT</span>
            </h1>
            <span className="brand-tag">Real-time orbital tracker</span>
          </div>
        </header>

        <section className="sidebar__section" aria-label="Live statistics">
          <div className="stat-hero">
            <div className="stat-hero__label">
              <span className="pulse-dot" aria-hidden="true" />
              Tracking now
            </div>
            <div className="stat-hero__value">{totalCount.toLocaleString()}</div>
            <div className="stat-hero__unit">active satellites</div>
          </div>

          <div className="orbit-legend" role="list">
            {[
              { k: 'LEO', label: 'Low Earth', range: '<2,000 km' },
              { k: 'MEO', label: 'Medium', range: '2–35k km' },
              { k: 'GEO', label: 'Geosync', range: '≈35,786 km' },
              { k: 'HEO', label: 'High', range: '>35k km' },
            ].map(({ k, label, range }) => {
              const pct = (counts[k] / maxBucket) * 100;
              return (
                <div className={`legend-row legend-row--${k.toLowerCase()}`} role="listitem" key={k}>
                  <div className="legend-row__head">
                    <span className={`legend-dot legend-dot--${k.toLowerCase()}`} />
                    <span className="legend-key">{k}</span>
                    <span className="legend-count">{counts[k].toLocaleString()}</span>
                  </div>
                  <div className="legend-row__meta">
                    <span className="legend-label">{label}</span>
                    <span className="legend-range">{range}</span>
                  </div>
                  <div className="legend-bar" aria-hidden="true">
                    <div className={`legend-bar__fill legend-bar__fill--${k.toLowerCase()}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="sidebar__section" aria-label="View settings">
          <h2 className="section-title">View settings</h2>
          <ToggleRow
            id="toggle-clouds"
            label="Atmospheric clouds"
            hint="Volumetric cloud layer"
            checked={showClouds}
            onChange={onToggleClouds}
          />
          <ToggleRow
            id="toggle-atmosphere"
            label="Atmosphere glow"
            hint="Rayleigh scattering halo"
            checked={showAtmosphere}
            onChange={onToggleAtmosphere}
          />
        </section>

        <footer className="sidebar__footer">
          <span>Data · CelesTrak GP</span>
          <span className="sidebar__footer-dot" aria-hidden="true">·</span>
          <span>SGP4 propagation</span>
        </footer>
      </aside>
    </>
  );
}

function ToggleRow({ id, label, hint, checked, onChange }) {
  return (
    <label className="toggle-row" htmlFor={id}>
      <span className="toggle-row__text">
        <span className="toggle-row__label">{label}</span>
        <span className="toggle-row__hint">{hint}</span>
      </span>
      <span className="toggle-switch">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="toggle-switch__track">
          <span className="toggle-switch__thumb" />
        </span>
      </span>
    </label>
  );
}
