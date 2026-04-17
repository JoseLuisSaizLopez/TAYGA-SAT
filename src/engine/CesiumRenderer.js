/**
 * CesiumRenderer
 * Manages CesiumJS PointPrimitiveCollection for high-performance satellite rendering
 */
import * as Cesium from 'cesium';
import { SatelliteManager } from './SatelliteManager.js';
import * as satellite from 'satellite.js';

// Orbit type color palette
const ORBIT_COLORS = {
  LEO: new Cesium.Color(0.0, 0.85, 1.0, 0.9),    // Cyan
  MEO: new Cesium.Color(1.0, 0.85, 0.0, 0.9),     // Amber
  GEO: new Cesium.Color(1.0, 0.5, 0.0, 0.9),      // Orange
  HEO: new Cesium.Color(1.0, 0.2, 0.3, 0.9),      // Red
};

const HIGHLIGHT_COLOR = new Cesium.Color(0.0, 1.0, 0.4, 1.0); // Green highlight
const DEFAULT_PIXEL_SIZE = 5;
const HIGHLIGHT_PIXEL_SIZE = 12;

export class CesiumRenderer {
  constructor() {
    this.viewer = null;
    this.pointCollection = null;
    this.orbitCollection = null;
    this.pointMap = new Map();
    this.selectedId = null;
    this.hoveredId = null;
    this.trackingId = null;
    this.satellitesCache = null;
    this._handler = null;
    this._preRenderListener = null;
    this.cloudLayer = null;
    
    // UI Tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'satellite-tooltip';
    this.tooltip.style.display = 'none';
  }

  initViewer(container) {
    this.viewer = new Cesium.Viewer(container, {
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      vrButton: false,
      infoBox: false,
      selectionIndicator: false,
      creditContainer: document.createElement('div'),
      imageryProvider: false,
      requestRenderMode: false,
      maximumRenderTimeChange: Infinity,
      skyBox: new Cesium.SkyBox({
        sources: {
          positiveX: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_px.jpg'),
          negativeX: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_mx.jpg'),
          positiveY: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_py.jpg'),
          negativeY: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_my.jpg'),
          positiveZ: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_pz.jpg'),
          negativeZ: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_mz.jpg'),
        }
      }),
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      contextOptions: {
        webgl: {
          alpha: false,
          antialias: true,
          preserveDrawingBuffer: false,
          failIfMajorPerformanceCaveat: false,
          depth: true,
          stencil: false,
        }
      }
    });

    // Sync Cesium clock to real wall time so sun lighting, terminator
    // and Earth-fixed frame stay aligned with satellite propagation
    // (which always uses `new Date()`).
    this.viewer.clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK;
    this.viewer.clock.shouldAnimate = true;
    this.viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date());

    const scene = this.viewer.scene;
    scene.globe.enableLighting = true;
    scene.sun.show = true;
    scene.moon.show = true;
    scene.fog.enabled = true;
    scene.fog.density = 0.0002;
    scene.globe.depthTestAgainstTerrain = true;
    scene.backgroundColor = new Cesium.Color(0.0, 0.0, 0.02, 1.0);

    // Atmosphere is off by default — controlled by the Sidebar toggle
    scene.skyAtmosphere.show = false;
    scene.globe.showGroundAtmosphere = false;

    this.pointCollection = new Cesium.PointPrimitiveCollection();
    scene.primitives.add(this.pointCollection);

    this.orbitCollection = new Cesium.PolylineCollection();
    scene.primitives.add(this.orbitCollection);

    this.velocityCollection = new Cesium.PolylineCollection();
    scene.primitives.add(this.velocityCollection);

    this.velocityLabels = new Cesium.LabelCollection();
    scene.primitives.add(this.velocityLabels);

    // Lock camera so it can only rotate around earth; zoom is handled manually
    // below so the globe stays centered instead of drifting toward the cursor.
    const cameraController = scene.screenSpaceCameraController;
    cameraController.enableTranslate = false;
    cameraController.enableTilt = false;
    cameraController.enableZoom = false;
    cameraController.minimumZoomDistance = 500000;
    cameraController.maximumZoomDistance = 200000000;

    this._minZoom = 500000;
    this._maxZoom = 200000000;
    // Minimum height while track mode is active — keeps the satellite
    // framed with its label visible, not glued to the point primitive.
    this._trackMinZoom = 2_500_000;
    this._applyZoomDelta = (delta) => {
      const camera = scene.camera;
      // Abort any in-flight flyTo — otherwise the tween keeps pulling the
      // camera back to its destination and the user's zoom drifts away.
      if (this._flying) {
        camera.cancelFlight();
        this._flying = false;
      }
      const radius = scene.globe.ellipsoid.maximumRadius;
      const distFromCenter = Cesium.Cartesian3.magnitude(camera.positionWC);
      // When tracking, use the stored target height so zoom events don't
      // fight the per-frame setView. Otherwise fall back to live height.
      const referenceHeight = (this.trackingId != null && this._trackHeight != null)
        ? this._trackHeight
        : distFromCenter - radius;
      const factor = Math.min(Math.max(Math.abs(delta) / 100, 0.05), 1.5);
      const step = referenceHeight * 0.18 * factor;
      let newHeight = delta > 0 ? referenceHeight + step : referenceHeight - step;
      const min = this.trackingId != null ? this._trackMinZoom : this._minZoom;
      newHeight = Math.max(min, Math.min(this._maxZoom, newHeight));

      if (this.trackingId != null) {
        this._trackHeight = newHeight;
      } else {
        const liveHeight = distFromCenter - radius;
        const amount = liveHeight - newHeight;
        if (amount > 0) camera.zoomIn(amount);
        else if (amount < 0) camera.zoomOut(-amount);
      }
    };

    this._wheelHandler = (event) => {
      event.preventDefault();
      this._applyZoomDelta(event.deltaY);
    };
    container.addEventListener('wheel', this._wheelHandler, { passive: false });

    // Touch pinch → zoom. Two fingers spreading = zoom in, pinching = zoom out.
    let lastPinchDist = null;
    const pinchDist = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };
    this._touchStartHandler = (e) => {
      if (e.touches.length === 2) {
        lastPinchDist = pinchDist(e.touches);
        e.preventDefault();
      }
    };
    this._touchMoveHandler = (e) => {
      if (e.touches.length === 2 && lastPinchDist != null) {
        const dist = pinchDist(e.touches);
        // Scale pinch delta to roughly match wheel deltaY magnitudes.
        const delta = (lastPinchDist - dist) * 2;
        this._applyZoomDelta(delta);
        lastPinchDist = dist;
        e.preventDefault();
      }
    };
    this._touchEndHandler = (e) => {
      if (e.touches.length < 2) lastPinchDist = null;
    };
    container.addEventListener('touchstart', this._touchStartHandler, { passive: false });
    container.addEventListener('touchmove', this._touchMoveHandler, { passive: false });
    container.addEventListener('touchend', this._touchEndHandler);
    container.addEventListener('touchcancel', this._touchEndHandler);

    Cesium.ArcGisMapServerImageryProvider.fromUrl(
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer', {
        enablePickFeatures: false
      }
    ).then((provider) => {
      if (this.viewer && !this.viewer.isDestroyed()) {
        this.viewer.imageryLayers.addImageryProvider(provider);
      }
    }).catch(err => console.warn('Failed to load ArcGIS imagery:', err));

    container.appendChild(this.tooltip);

    // Pin tooltip to point space frame by frame
    this._preRenderListener = this.viewer.scene.preRender.addEventListener(() => {
      const activeId = this.selectedId || this.hoveredId;
      if (activeId && this.satellitesCache) {
         const sat = this.satellitesCache.get(activeId);
         const point = this.pointMap.get(activeId);
         if (sat && point) {
            const screenPos = Cesium.SceneTransforms.worldToWindowCoordinates(this.viewer.scene, point.position);
            if (screenPos) {
                this.tooltip.style.display = 'flex';
                this.tooltip.style.left = Math.round(screenPos.x) + 'px';
                this.tooltip.style.top = Math.round(screenPos.y - 15) + 'px';
                
                const type = SatelliteManager.getOrbitType(sat.alt);
                this.tooltip.innerHTML = `<span class="tooltip-name">${sat.name}</span><span class="tooltip-type">${type} ORBIT</span>`;
                return;
            }
         }
      }
      this.tooltip.style.display = 'none';
    });

    return this.viewer;
  }

  initClickHandler(onSatelliteClick) {
    this._handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);

    const isTouch = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(pointer: coarse)').matches;

    // Selection Handler
    this._handler.setInputAction((click) => {
      const pickedObject = this.viewer.scene.pick(click.position);
      if (Cesium.defined(pickedObject) && pickedObject.primitive instanceof Cesium.PointPrimitive) {
        const point = pickedObject.primitive;
        for (const [noradId, p] of this.pointMap) {
          if (p === point) {
            onSatelliteClick(noradId);
            return;
          }
        }
      } else if (!isTouch) {
        // On touch devices, keep current selection — only the close button
        // in the info sheet should deselect.
        onSatelliteClick(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Hover Handler — pointer devices only
    if (!isTouch) {
      this._handler.setInputAction((movement) => {
        const pickedObject = this.viewer.scene.pick(movement.endPosition);
        let newHoverId = null;

        if (Cesium.defined(pickedObject) && pickedObject.primitive instanceof Cesium.PointPrimitive) {
          const point = pickedObject.primitive;
          for (const [id, p] of this.pointMap) {
            if (p === point) {
              newHoverId = id;
              break;
            }
          }
        }

        if (this.hoveredId !== newHoverId) {
          this.hoveredId = newHoverId;
          if (this.satellitesCache) {
             this.updateTargetPositions(this.satellitesCache);
          }
        }
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }
  }

  initializePoints(satellites) {
    this.satellitesCache = satellites;
    this.pointCollection.removeAll();
    this.pointMap.clear();

    for (const [noradId, sat] of satellites) {
      if (sat.alt <= 0) continue;

      const orbitType = SatelliteManager.getOrbitType(sat.alt);
      const color = ORBIT_COLORS[orbitType] || ORBIT_COLORS.LEO;

      const position = Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt * 1000);

      const point = this.pointCollection.add({
        position: position,
        color,
        pixelSize: DEFAULT_PIXEL_SIZE,
        scaleByDistance: new Cesium.NearFarScalar(1.0e3, 2.5, 1.0e8, 0.5),
        translucencyByDistance: new Cesium.NearFarScalar(1.0e3, 1.0, 1.5e8, 0.2)
      });
      
      // Store custom target property for interpolation
      point.targetPosition = Cesium.Cartesian3.clone(position);

      this.pointMap.set(noradId, point);
    }
  }

  updateTargetPositions(satellites) {
    this.satellitesCache = satellites;

    for (const [noradId, sat] of satellites) {
      const point = this.pointMap.get(noradId);
      if (!point || sat.alt <= 0) continue;

      point.targetPosition = Cesium.Cartesian3.fromDegrees(
        sat.lon, sat.lat, sat.alt * 1000
      );

      // Color/Visibility management
      if (this.selectedId === null) {
        point.show = true;
        if (noradId === this.hoveredId) {
            point.color = Cesium.Color.WHITE;
            point.pixelSize = HIGHLIGHT_PIXEL_SIZE;
        } else {
            const orbitType = SatelliteManager.getOrbitType(sat.alt);
            point.color = ORBIT_COLORS[orbitType] || ORBIT_COLORS.LEO;
            point.pixelSize = DEFAULT_PIXEL_SIZE;
        }
      } else {
        if (noradId === this.selectedId) {
          point.show = true;
          point.color = HIGHLIGHT_COLOR;
          point.pixelSize = HIGHLIGHT_PIXEL_SIZE;
        } else if (noradId === this.hoveredId) {
          point.show = true;
          point.color = Cesium.Color.WHITE;
          point.pixelSize = HIGHLIGHT_PIXEL_SIZE;
        } else {
          point.show = false;
        }
      }
    }

    // Velocity vectors for selected sat (orbit is drawn on selection only
    // in highlightSatellite() — rebuilding 240 points at 1Hz caused jitter
    // and is unnecessary for one orbital period of visual accuracy).
    if (this.selectedId !== null) {
      const selectedSat = satellites.get(this.selectedId);
      if (selectedSat) {
        this.drawVelocityVectors(selectedSat);
      }
    }
  }

  /**
   * Live per-frame update for the selected satellite: snaps the point
   * primitive straight to the freshly propagated position (no lerp) and
   * refreshes velocity vectors so camera tracking is smooth.
   */
  updateSelectedFrame(sat) {
    if (!sat || this.selectedId == null) return;
    const point = this.pointMap.get(this.selectedId);
    if (!point) return;
    const pos = Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt * 1000);
    point.position = pos;
    point.targetPosition = pos;
    this.drawVelocityVectors(sat);

    // Refresh the orbital ellipse roughly once per second so it stays
    // aligned with Earth's rotation (the drawn curve uses a single GMST,
    // so it must track real time). 1 Hz keeps sat-on-line to <0.02°.
    const now = performance.now();
    if (!this._lastOrbitDraw || now - this._lastOrbitDraw > 1000) {
      this.drawOrbit(sat);
      this._lastOrbitDraw = now;
    }
  }

  interpolatePositions(dt) {
    // We smooth interpolate from current to target over 1 second window
    const smoothing = Math.min(1.0, dt * 2.0); 
    const scratch = new Cesium.Cartesian3();

    for (const [noradId, point] of this.pointMap) {
      // Selected sat gets exact propagated position each frame via
      // updateSelectedFrame() — skip lerp so tracking stays smooth.
      if (noradId === this.selectedId) continue;
      if (point.show && point.targetPosition && point.position) {
         if (!Cesium.Cartesian3.equals(point.position, point.targetPosition)) {
            const newPos = Cesium.Cartesian3.lerp(point.position, point.targetPosition, smoothing, scratch);
            point.position = newPos; // Triggers Cesium dirty flag
         }
      }
    }
  }

  drawVelocityVectors(sat, date = new Date()) {
    this.velocityCollection.removeAll();
    this.velocityLabels.removeAll();
    if (!sat || !sat.satrec || sat.alt <= 0) return;

    const dt = 60;
    const pv1 = satellite.propagate(sat.satrec, date);
    const dateNext = new Date(date.getTime() + dt * 1000);
    const pv2 = satellite.propagate(sat.satrec, dateNext);
    if (!pv1.position || typeof pv1.position === 'boolean') return;
    if (!pv2.position || typeof pv2.position === 'boolean') return;

    const gmst1 = satellite.gstime(date);
    const gmst2 = satellite.gstime(dateNext);
    const g1 = satellite.eciToGeodetic(pv1.position, gmst1);
    const g2 = satellite.eciToGeodetic(pv2.position, gmst2);

    if (!Number.isFinite(g1.latitude) || !Number.isFinite(g1.longitude) || !Number.isFinite(g1.height)) return;

    const p1 = Cesium.Cartesian3.fromRadians(g1.longitude, g1.latitude, g1.height * 1000);
    const p2 = Cesium.Cartesian3.fromRadians(g2.longitude, g2.latitude, g2.height * 1000);

    // Velocity in fixed frame (m/s)
    const velFixed = Cesium.Cartesian3.subtract(p2, p1, new Cesium.Cartesian3());
    Cesium.Cartesian3.multiplyByScalar(velFixed, 1.0 / dt, velFixed);

    // Radial unit vector (Earth center → satellite)
    const radialHat = Cesium.Cartesian3.normalize(p1, new Cesium.Cartesian3());

    // Decompose: radial (lateral/vertical) vs horizontal (forward/along-track)
    const radialMag = Cesium.Cartesian3.dot(velFixed, radialHat);
    const radialComp = Cesium.Cartesian3.multiplyByScalar(radialHat, radialMag, new Cesium.Cartesian3());
    const horizontal = Cesium.Cartesian3.subtract(velFixed, radialComp, new Cesium.Cartesian3());
    const horizontalMag = Cesium.Cartesian3.magnitude(horizontal);

    // Visual scale: 1 m/s → 600 m on screen (≈ 4500 km for 7.5 km/s)
    const SCALE = 600;
    const horizontalScaled = Cesium.Cartesian3.multiplyByScalar(horizontal, SCALE, new Cesium.Cartesian3());
    const forwardEnd = Cesium.Cartesian3.add(p1, horizontalScaled, new Cesium.Cartesian3());

    // Lateral vector scaled — amplify since radial usually small vs horizontal
    const LATERAL_SCALE = SCALE * 8;
    const lateralScaled = Cesium.Cartesian3.multiplyByScalar(radialHat, radialMag * LATERAL_SCALE, new Cesium.Cartesian3());
    const lateralEnd = Cesium.Cartesian3.add(p1, lateralScaled, new Cesium.Cartesian3());

    const FORWARD_COLOR = new Cesium.Color(0.0, 1.0, 0.4, 0.95);
    const LATERAL_COLOR = new Cesium.Color(1.0, 0.55, 0.0, 0.95);

    this.velocityCollection.add({
      positions: [p1, forwardEnd],
      width: 3.0,
      material: Cesium.Material.fromType('Color', { color: FORWARD_COLOR })
    });

    if (Math.abs(radialMag) > 0.5) {
      this.velocityCollection.add({
        positions: [p1, lateralEnd],
        width: 3.0,
        material: Cesium.Material.fromType('Color', { color: LATERAL_COLOR })
      });
    }

    const labelBase = {
      font: '600 12px Inter, sans-serif',
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      pixelOffset: new Cesium.Cartesian2(0, -6),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      showBackground: true,
      backgroundColor: new Cesium.Color(0.0, 0.0, 0.0, 0.55),
      backgroundPadding: new Cesium.Cartesian2(6, 3)
    };

    this.velocityLabels.add({
      ...labelBase,
      position: forwardEnd,
      text: `▶ ${(horizontalMag / 1000).toFixed(2)} km/s`,
      fillColor: FORWARD_COLOR
    });

    if (Math.abs(radialMag) > 0.5) {
      const arrow = radialMag >= 0 ? '▲' : '▼';
      this.velocityLabels.add({
        ...labelBase,
        position: lateralEnd,
        text: `${arrow} ${(Math.abs(radialMag) / 1000).toFixed(3)} km/s`,
        fillColor: LATERAL_COLOR
      });
    }
  }

  drawOrbit(sat) {
    this.orbitCollection.removeAll();
    if (!sat || !sat.satrec) return;

    // Draw the inertial orbital ellipse as it appears in the Earth-fixed
    // frame at the current instant: all 240 samples are ECI positions
    // over one revolution, all projected with a SINGLE "now" GMST.
    // Because the live satellite also uses that same instant's GMST for
    // its geodetic position, it always sits on this curve. Refreshed
    // periodically (see updateSelectedFrame) so the ellipse stays aligned
    // with Earth's rotation.
    const positions = [];
    const date0 = new Date();
    const gmstNow = satellite.gstime(date0);

    const noRadMin = sat.satrec.no || sat.satrec.no_kozai || 0;
    const periodMin = noRadMin > 0 ? (2 * Math.PI) / noRadMin : 90;
    const periodMs = Math.min(periodMin, 24 * 60) * 60 * 1000;

    const STEPS = 240;
    const dtMs = periodMs / STEPS;
    const halfSpan = periodMs / 2;

    for (let i = 0; i <= STEPS; i++) {
      const d = new Date(date0.getTime() - halfSpan + i * dtMs);
      const posVel = satellite.propagate(sat.satrec, d);
      if (!posVel.position || typeof posVel.position === 'boolean') continue;

      const geodetic = satellite.eciToGeodetic(posVel.position, gmstNow);
      const lat = satellite.degreesLat(geodetic.latitude);
      const lon = satellite.degreesLong(geodetic.longitude);
      const alt = geodetic.height * 1000;
      if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(alt)) {
        positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, alt));
      }
    }

    // Close the loop: inertial orbit is a closed curve at a single GMST.
    if (positions.length > 1) {
      positions.push(positions[0]);
    }

    if (positions.length > 0) {
      this.orbitCollection.add({
        positions: positions,
        width: 2.0,
        material: Cesium.Material.fromType('Color', {
          color: new Cesium.Color(0.0, 1.0, 0.4, 0.4)
        })
      });
    }
  }

  setTrackingId(id) {
    this.trackingId = id;
    // Reset stored track height — it will be initialised on the first
    // updateTracking() call using whatever camera height is active then.
    this._trackHeight = null;
  }

  /**
   * Per-frame: if a satellite is being tracked, rotate the camera around
   * the globe so the satellite remains in the view centre. The user's
   * current zoom distance is preserved.
   */
  updateTracking() {
    if (this._flying) return;
    if (!this.trackingId || !this.viewer) return;
    const point = this.pointMap.get(this.trackingId);
    if (!point || !point.position) return;

    const scene = this.viewer.scene;
    const camera = scene.camera;
    const radius = scene.globe.ellipsoid.maximumRadius;

    const cartographic = Cesium.Cartographic.fromCartesian(point.position);
    if (!cartographic) return;

    const min = this._trackMinZoom || 2_500_000;
    const max = this._maxZoom || 200_000_000;
    // Initialise stored track height on first frame from the live camera
    // so the existing zoom carries over. Subsequent frames keep whatever
    // the user has dialled via the wheel.
    if (this._trackHeight == null) {
      const liveHeight = Cesium.Cartesian3.magnitude(camera.positionWC) - radius;
      this._trackHeight = Math.max(min, Math.min(max, liveHeight));
    }
    const clampedHeight = Math.max(min, Math.min(max, this._trackHeight));
    this._trackHeight = clampedHeight;

    const destination = Cesium.Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      clampedHeight
    );

    camera.setView({
      destination,
      orientation: {
        heading: 0,
        pitch: -Cesium.Math.PI_OVER_TWO,
        roll: 0,
      },
    });
  }

  /**
   * Rotate and zoom camera so the satellite is framed in view centre.
   * Camera moves along an arc around Earth to the satellite's sub-point
   * then descends to the target altitude — Earth stays globe-centred.
   */
  zoomToSatellite(sat) {
    if (!this.viewer || !sat) return;
    const camera = this.viewer.scene.camera;

    const altM = Math.max(0, sat.alt || 0) * 1000;
    // Give a comfortable framing: sat altitude plus base context, then
    // respect the track-mode minimum so we don't start glued to the dot.
    let targetHeight = altM * 2.2 + 3_500_000;
    const min = this._trackMinZoom || 2_500_000;
    const max = this._maxZoom || 200_000_000;
    targetHeight = Math.max(min, Math.min(max, targetHeight));

    const lat = Number.isFinite(sat.lat) ? sat.lat : 0;
    const lon = Number.isFinite(sat.lon) ? sat.lon : 0;

    const destination = Cesium.Cartesian3.fromDegrees(lon, lat, targetHeight);

    this._flying = true;
    camera.flyTo({
      destination,
      orientation: {
        heading: 0,
        pitch: -Cesium.Math.PI_OVER_TWO,
        roll: 0,
      },
      duration: 1.2,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
      complete: () => { this._flying = false; },
      cancel: () => { this._flying = false; },
    });
  }

  highlightSatellite(noradId, satellites) {
    this.selectedId = noradId;
    this.orbitCollection.removeAll();
    this.velocityCollection.removeAll();
    this.velocityLabels.removeAll();
    this._lastOrbitDraw = 0;

    if (noradId !== null) {
      const sat = satellites.get(noradId);
      if (sat && sat.satrec) {
        this.drawOrbit(sat);
        this._lastOrbitDraw = performance.now();

        this.drawVelocityVectors(sat);
      }
    }

    this.updateTargetPositions(satellites);
  }

  toggleAtmosphere(show) {
    if (!this.viewer || this.viewer.isDestroyed()) return;
    const scene = this.viewer.scene;
    const sky = scene.skyAtmosphere;
    const globe = scene.globe;

    if (show) {
      sky.show = true;
      globe.showGroundAtmosphere = true;

      // Sun-reactive dynamic atmosphere (realistic day/night scattering)
      globe.dynamicAtmosphereLighting = true;
      globe.dynamicAtmosphereLightingFromSun = true;

      // Rayleigh scattering — responsible for the blue sky color
      sky.atmosphereRayleighCoefficient = new Cesium.Cartesian3(5.5e-6, 13.0e-6, 28.4e-6);
      sky.atmosphereRayleighScaleHeight = 10000.0;

      // Mie scattering — responsible for the soft haze near the horizon/sunset glow
      sky.atmosphereMieCoefficient = new Cesium.Cartesian3(21e-6, 21e-6, 21e-6);
      sky.atmosphereMieScaleHeight = 3200.0;
      sky.atmosphereMieAnisotropy = 0.9;

      // Sun intensity driving the scattering
      if ('atmosphereLightIntensity' in sky) sky.atmosphereLightIntensity = 12.0;
      if ('atmosphereLightIntensity' in globe) globe.atmosphereLightIntensity = 12.0;

      // Higher quality per-fragment atmosphere shading
      if ('perFragmentAtmosphere' in sky) sky.perFragmentAtmosphere = true;

      // Slight tint for a more natural hue
      sky.hueShift = 0.0;
      sky.saturationShift = 0.1;
      sky.brightnessShift = 0.0;
    } else {
      sky.show = false;
      globe.showGroundAtmosphere = false;
    }
  }

  async toggleClouds(show) {
    if (show) {
      if (!this.cloudLayer) {
        try {
          // Real-time OpenWeatherMap clouds via UrlTemplateImageryProvider
          const provider = new Cesium.UrlTemplateImageryProvider({
            url: 'https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=b1b15e88fa797225412429c1c50c122a1',
            maximumLevel: 6
          });
          
          if (this.viewer && !this.viewer.isDestroyed()) {
             this.cloudLayer = this.viewer.imageryLayers.addImageryProvider(provider);
             // OWM clouds are already transparent white, so we just set alpha.
             this.cloudLayer.alpha = 0.8; 
          }
        } catch (err) {
          console.error("Cloud layer failed to load:", err);
        }
      } else {
        this.cloudLayer.show = true;
      }
    } else {
      if (this.cloudLayer) {
        this.cloudLayer.show = false;
      }
    }
  }

  destroy() {
    if (this._preRenderListener) {
      this._preRenderListener();
      this._preRenderListener = null;
    }
    if (this._handler) {
      this._handler.destroy();
      this._handler = null;
    }
    if (this.viewer) {
      const c = this.viewer.container;
      if (this._wheelHandler) c.removeEventListener('wheel', this._wheelHandler);
      if (this._touchStartHandler) c.removeEventListener('touchstart', this._touchStartHandler);
      if (this._touchMoveHandler) c.removeEventListener('touchmove', this._touchMoveHandler);
      if (this._touchEndHandler) {
        c.removeEventListener('touchend', this._touchEndHandler);
        c.removeEventListener('touchcancel', this._touchEndHandler);
      }
      this._wheelHandler = null;
      this._touchStartHandler = null;
      this._touchMoveHandler = null;
      this._touchEndHandler = null;
    }
    if (this.tooltip && this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
    }
    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
    }
  }
}
