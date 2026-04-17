import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { SatelliteManager } from '../engine/SatelliteManager.js';

const ORBIT_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'LEO', label: 'LEO' },
  { key: 'MEO', label: 'MEO' },
  { key: 'GEO', label: 'GEO' },
  { key: 'HEO', label: 'HEO' },
];

/**
 * SearchBar — Floating command-style search, separated from sidebar.
 * Keyboard: ⌘/Ctrl+K focus, Arrow keys navigate, Enter selects, Esc clears.
 */
export default function SearchBar({ satelliteManager, onSelectSatellite, selectedId }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const rootRef = useRef(null);

  const results = useMemo(() => {
    if (!satelliteManager || query.trim().length < 1) return [];
    const found = satelliteManager.searchByName(query.trim(), 60);
    if (filter === 'ALL') return found.slice(0, 40);
    return found.filter(s => SatelliteManager.getOrbitType(s.alt) === filter).slice(0, 40);
  }, [satelliteManager, query, filter]);

  useEffect(() => { setActiveIndex(0); }, [query, filter]);

  useEffect(() => {
    const onKey = (e) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const open = focused && query.length > 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && rootRef.current.contains(e.target)) return;
      e.stopPropagation();
      e.preventDefault();
      setFocused(false);
      inputRef.current?.blur();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('mousedown', onDown, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('mousedown', onDown, true);
    };
  }, [open]);

  const commitSelection = useCallback((idx) => {
    const sat = results[idx];
    if (!sat) return;
    onSelectSatellite(sat.noradId);
    setFocused(false);
    inputRef.current?.blur();
  }, [results, onSelectSatellite]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, Math.max(0, results.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commitSelection(activeIndex);
    } else if (e.key === 'Escape') {
      if (query) setQuery('');
      else inputRef.current?.blur();
    }
  };

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${activeIndex}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const totalCount = satelliteManager?.count ?? 0;

  return (
    <div ref={rootRef} className={`searchbar ${open ? 'searchbar--open' : ''}`} role="search">
      <div className="searchbar__field">
        <svg className="searchbar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7.5" />
          <path d="M20 20l-4-4" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="searchbar__input"
          placeholder={`Search ${totalCount.toLocaleString()} satellites…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck="false"
          aria-label="Search satellites by name or NORAD ID"
          aria-controls="search-results"
          aria-expanded={open}
          aria-activedescendant={open && results[activeIndex] ? `result-${results[activeIndex].noradId}` : undefined}
        />
        {query ? (
          <button
            type="button"
            className="searchbar__clear"
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            aria-label="Clear search"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        ) : (
          <kbd className="searchbar__kbd" aria-hidden="true">⌘K</kbd>
        )}
      </div>

      {open && (
        <div className="searchbar__panel" role="listbox" id="search-results" aria-label="Search results">
          <div className="searchbar__filters" role="tablist" aria-label="Filter by orbit">
            {ORBIT_FILTERS.map(f => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                className={`chip chip--${f.key.toLowerCase()} ${filter === f.key ? 'chip--active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setFilter(f.key)}
              >
                {f.key !== 'ALL' && <span className={`chip__dot chip__dot--${f.key.toLowerCase()}`} />}
                {f.label}
              </button>
            ))}
          </div>

          <div className="searchbar__meta">
            <span>{results.length} match{results.length === 1 ? '' : 'es'}</span>
            <span className="searchbar__hints">
              <kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>↵</kbd> select · <kbd>Esc</kbd> clear
            </span>
          </div>

          <ul className="searchbar__list" ref={listRef}>
            {results.length === 0 ? (
              <li className="searchbar__empty">No satellites matched <strong>{query}</strong></li>
            ) : (
              results.map((sat, idx) => {
                const orbit = SatelliteManager.getOrbitType(sat.alt);
                const active = idx === activeIndex;
                const chosen = selectedId === sat.noradId;
                return (
                  <li
                    key={sat.noradId}
                    id={`result-${sat.noradId}`}
                    data-idx={idx}
                    role="option"
                    aria-selected={active}
                    className={`result ${active ? 'result--active' : ''} ${chosen ? 'result--selected' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => commitSelection(idx)}
                  >
                    <span className={`result__orbit result__orbit--${orbit.toLowerCase()}`}>{orbit}</span>
                    <span className="result__name">{sat.name}</span>
                    <span className="result__meta">
                      <span className="result__id">#{sat.noradId}</span>
                      <span className="result__alt">{sat.alt > 0 ? `${Math.round(sat.alt)} km` : '—'}</span>
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
