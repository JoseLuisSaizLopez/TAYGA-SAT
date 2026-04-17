/**
 * LoadingScreen — Tech HUD boot sequence shown while data loads
 */
export default function LoadingScreen({ progress, status }) {
  const clampedProgress = Math.max(0, Math.min(100, progress ?? 0));
  const pct = clampedProgress.toFixed(0).padStart(3, '0');

  return (
    <div className="boot" role="status" aria-live="polite" aria-label="Loading Tayga SAT">
      <div className="boot__grid" aria-hidden="true" />
      <div className="boot__vignette" aria-hidden="true" />

      <div className="boot__content">
        <div className="boot__orbits" aria-hidden="true">
          <span className="boot__ring boot__ring--1" />
          <span className="boot__ring boot__ring--2" />
          <span className="boot__ring boot__ring--3" />
          <span className="boot__core">
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="16" cy="16" r="6" />
              <ellipse cx="16" cy="16" rx="13.5" ry="5" transform="rotate(-28 16 16)" />
              <circle cx="28" cy="10" r="1.4" fill="currentColor" />
            </svg>
          </span>
        </div>

        <h1 className="boot__title">
          <span className="brand-primary">TAYGA</span>
          <span className="brand-secondary">SAT</span>
        </h1>
        <p className="boot__tagline">Real-time orbital intelligence · v1.0</p>

        <div className="boot__telemetry" aria-hidden="true">
          <span className="boot__telemetry-item">◉ NODE-01</span>
          <span className="boot__telemetry-item">LINK · STABLE</span>
          <span className="boot__telemetry-item">LAT 00.00 · LON 00.00</span>
        </div>

        <div className="boot__progress">
          <div className="boot__progress-track">
            <div className="boot__progress-fill" style={{ width: `${clampedProgress}%` }} />
            <div className="boot__progress-ticks" aria-hidden="true" />
          </div>
          <div className="boot__progress-meta">
            <span className="boot__status">{status || 'Initializing…'}</span>
            <span className="boot__percent">{pct}%</span>
          </div>
        </div>

        <div className="boot__hint">Establishing link with CelesTrak · SGP4 propagator warm-up</div>
      </div>
    </div>
  );
}
