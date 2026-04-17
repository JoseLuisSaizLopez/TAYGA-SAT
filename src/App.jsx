import { useState, useRef, useCallback, useEffect } from 'react';
import CesiumViewer from './components/CesiumViewer.jsx';
import Sidebar from './components/Sidebar.jsx';
import SearchBar from './components/SearchBar.jsx';
import InfoBox from './components/InfoBox.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import { SatelliteManager } from './engine/SatelliteManager.js';
import { CesiumRenderer } from './engine/CesiumRenderer.js';
import { fetchSatelliteData } from './services/SatelliteDataService.js';
import './App.css';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('Connecting to CelesTrak...');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedSatellite, setSelectedSatellite] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [showClouds, setShowClouds] = useState(false);
  const [showAtmosphere, setShowAtmosphere] = useState(false);

  const managerRef = useRef(null);
  const rendererRef = useRef(null);
  const animFrameRef = useRef(null);
  const viewerReadyRef = useRef(false);
  const initDoneRef = useRef(false);

  if (!managerRef.current) {
    managerRef.current = new SatelliteManager();
  }
  if (!rendererRef.current) {
    rendererRef.current = new CesiumRenderer();
  }

  const handleViewerReady = useCallback(async (viewer) => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;
    viewerReadyRef.current = true;

    const manager = managerRef.current;
    const renderer = rendererRef.current;

    try {
      setLoadingStatus('Downloading satellite catalog...');
      setLoadingProgress(20);

      const data = await fetchSatelliteData();

      setLoadingStatus(`Processing ${data.length.toLocaleString()} satellites...`);
      setLoadingProgress(50);

      await new Promise(resolve => setTimeout(resolve, 100));
      manager.loadSatellites(data);

      setLoadingStatus('Computing orbital positions...');
      setLoadingProgress(70);

      await new Promise(resolve => setTimeout(resolve, 100));
      manager.propagateAll(new Date());

      setLoadingStatus('Rendering satellite constellation...');
      setLoadingProgress(85);

      await new Promise(resolve => setTimeout(resolve, 100));
      renderer.initializePoints(manager.satellites);

      renderer.initClickHandler((noradId) => {
        if (noradId === null) {
          setSelectedSatellite(null);
          setTracking(false);
          renderer.setTrackingId(null);
          renderer.highlightSatellite(null, manager.satellites);
        } else {
          const sat = manager.getSatelliteById(noradId);
          if (sat) {
            setSelectedSatellite({ ...sat });
            renderer.highlightSatellite(noradId, manager.satellites);
          }
        }
      });

      setLoadingProgress(100);
      setLoadingStatus('Ready');

      await new Promise(resolve => setTimeout(resolve, 500));
      setLoading(false);

      startAnimationLoop();

    } catch (err) {
      console.error('[App] Initialization failed:', err);
      setLoadingStatus(`Error: ${err.message}`);
    }
  }, []);

  const startAnimationLoop = useCallback(() => {
    const manager = managerRef.current;
    const renderer = rendererRef.current;

    let lastPropagation = 0;
    let lastFrame = performance.now();
    const PROPAGATION_INTERVAL = 1000;

    const loop = (timestamp) => {
      const dt = (timestamp - lastFrame) / 1000.0;
      lastFrame = timestamp;

      if (timestamp - lastPropagation > PROPAGATION_INTERVAL) {
        manager.propagateAll(new Date());
        renderer.updateTargetPositions(manager.satellites);
        lastPropagation = timestamp;
      }

      // Live per-frame refresh for the currently selected satellite:
      // propagate exactly, update its point primitive + velocity vectors,
      // then the tracking camera reads an up-to-date position.
      if (renderer.selectedId != null) {
        const fresh = manager.propagateOne(renderer.selectedId, new Date());
        if (fresh) {
          setSelectedSatellite({ ...fresh });
          renderer.updateSelectedFrame(fresh);
        }
      }

      renderer.interpolatePositions(dt);
      renderer.updateTracking();

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  const handleSelectSatellite = useCallback((noradId) => {
    const manager = managerRef.current;
    const renderer = rendererRef.current;

    const sat = manager.getSatelliteById(noradId);
    if (sat) {
      setSelectedSatellite({ ...sat });
      renderer.highlightSatellite(noradId, manager.satellites);
      renderer.zoomToSatellite(sat);
      // Search-triggered selection enables tracking by default
      setTracking(true);
      renderer.setTrackingId(noradId);
    }
  }, []);

  const handleToggleTrack = useCallback((enabled) => {
    const renderer = rendererRef.current;
    setTracking(enabled);
    if (enabled && selectedSatellite) {
      renderer.setTrackingId(selectedSatellite.noradId);
    } else {
      renderer.setTrackingId(null);
    }
  }, [selectedSatellite]);

  const handleCloseInfo = useCallback(() => {
    const renderer = rendererRef.current;
    const manager = managerRef.current;

    setSelectedSatellite(null);
    setTracking(false);
    renderer.setTrackingId(null);
    renderer.highlightSatellite(null, manager.satellites);
  }, []);

  const handleToggleClouds = useCallback((show) => {
    setShowClouds(show);
    const renderer = rendererRef.current;
    if (renderer) {
      renderer.toggleClouds(show);
    }
  }, []);

  const handleToggleAtmosphere = useCallback((show) => {
    setShowAtmosphere(show);
    const renderer = rendererRef.current;
    if (renderer) {
      renderer.toggleAtmosphere(show);
    }
  }, []);

  return (
    <div className={`app ${sidebarOpen ? 'app--sidebar-open' : ''} ${selectedSatellite ? 'app--has-selection' : ''}`}>
      <CesiumViewer
        rendererRef={rendererRef}
        onViewerReady={handleViewerReady}
      />

      {loading && (
        <LoadingScreen
          progress={loadingProgress}
          status={loadingStatus}
        />
      )}

      {!loading && (
        <>
          <Sidebar
            satelliteManager={managerRef.current}
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen(o => !o)}
            showClouds={showClouds}
            onToggleClouds={handleToggleClouds}
            showAtmosphere={showAtmosphere}
            onToggleAtmosphere={handleToggleAtmosphere}
          />

          <SearchBar
            satelliteManager={managerRef.current}
            onSelectSatellite={handleSelectSatellite}
            selectedId={selectedSatellite?.noradId}
          />

          <InfoBox
            satellite={selectedSatellite}
            onClose={handleCloseInfo}
            tracking={tracking}
            onToggleTrack={handleToggleTrack}
          />

          <ClockDisplay />
        </>
      )}
    </div>
  );
}

function ClockDisplay() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="clock" id="utc-clock" role="status" aria-label="Coordinated Universal Time">
      <span className="clock__dot" aria-hidden="true" />
      <span className="clock__label">UTC</span>
      <span className="clock__time">{time.toISOString().slice(11, 19)}</span>
    </div>
  );
}
