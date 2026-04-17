import { useEffect, useRef } from 'react';
import 'cesium/Build/Cesium/Widgets/widgets.css';

/**
 * CesiumViewer — Creates the Cesium Viewer imperatively
 * Manages the viewer lifecycle and exposes it via ref
 */
export default function CesiumViewer({ rendererRef, onViewerReady }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !rendererRef.current) return;

    const renderer = rendererRef.current;
    const viewer = renderer.initViewer(containerRef.current);

    if (onViewerReady) {
      onViewerReady(viewer);
    }

    return () => {
      renderer.destroy();
    };
  }, []);

  return (
    <div
      id="cesium-container"
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden'
      }}
    />
  );
}
