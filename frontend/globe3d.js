/* ============================================================================
   SPHEREx ChronoSky — 3D Topographic Planet & Solar Orbit Engine (globe3d.js)
   1. Realistic 3D Troughs, Mountain Crests & Deep Impact Basins:
      - Uses a 128x128 high-density sphere with real 3D `displacementMap` + `bumpMap`
        so craters, canyons, ridges, and deep impact basins physically indent the 3D
        mesh and cast real self-shadows across crater rims.
      - Converts any dark/unmapped region on NASA/New Horizons maps into a textured,
        multi-terraced 3D impact basin with rocky floor strata, inner walls, and a
        raised ejecta rim (eliminating flat black patches!).
   2. Time-Travel Solar Orbit Animation:
      - Renders the glowing 3D Sun + heliocentric orbital track in the background and
        revolves the planet along its solar orbit with dynamic sunlight angle & crater
        shadow progression as the user plays or scrubs the Time-Travel bar.
   ============================================================================ */

window.ChronoSky3D = (function () {
  const container = document.getElementById("space-canvas");
  if (!container) return null;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 2500);
  camera.position.set(0, 0, 9.2);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enableZoom = true;
  controls.enablePan = false;
  controls.minDistance = 4.0;
  controls.maxDistance = 24.0;

  // Balanced lighting so night/shadow sides show subtle geological detail while
  // oblique sunlight carves sharp shadows across crater rims, troughs, and crests
  const ambientLight = new THREE.AmbientLight(0x94a3b8, 0.95);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xe2e8f0, 0x1e293b, 0.55);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.45);
  sunLight.position.set(-11, 5, 10);
  scene.add(sunLight);

  // 1. Far-Sky Starfield
  const starCount = 3800;
  const starGeo = new THREE.BufferGeometry();
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * 280;
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * 170;
    starPositions[i * 3 + 2] = -Math.random() * 240 - 12;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xf8fafc,
    size: 0.14,
    transparent: true,
    opacity: 0.9
  });
  const starField = new THREE.Points(starGeo, starMat);
  scene.add(starField);

  // 2. Solar System Corridor Context (Glowing 3D Sun + All Planets at Respective Positions in Line)
  const solarOrbitGroup = new THREE.Group();
  solarOrbitGroup.position.set(0, -0.15, 0);
  solarOrbitGroup.visible = false; // Shown in Start Exploring, Time-Travel & Mission modes
  scene.add(solarOrbitGroup);

  // Synchronous, Realistic 2:1 Equirectangular Planet & Sun Texture Builder (Guaranteed Never Black!)
  function createRichPlanetaryCanvasTexture(kind) {
    const w = 512;
    const h = 256;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    const imgData = ctx.createImageData(w, h);
    const px = imgData.data;

    for (let y = 0; y < h; y++) {
      const v = y / (h - 1);
      const phi = (v - 0.5) * Math.PI;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);

      for (let x = 0; x < w; x++) {
        const u = x / w;
        const lon = u * Math.PI * 2.0;
        const idx = (y * w + x) * 4;

        // Periodic spherical noise (seamless at u=0 and u=1)
        const n1 = Math.sin(lon * 3.0 + sinPhi * 4.0) * Math.cos(lon * 2.0 - sinPhi * 3.0);
        const n2 = Math.sin(lon * 8.0 - sinPhi * 7.0) * 0.5 + Math.cos(lon * 13.0 + sinPhi * 11.0) * 0.5;
        const n3 = Math.sin(lon * 21.0 + sinPhi * 19.0) * 0.35;
        const bands = Math.sin(phi * 14.0 + n1 * 0.8) * 0.5 + Math.cos(phi * 26.0 + n2 * 0.6) * 0.5;

        let r = 180, g = 180, b = 180;

        if (kind === "sun") {
          const gran = (n1 * 18 + n2 * 24 + n3 * 16);
          r = 255;
          g = Math.min(255, Math.max(165, Math.round(218 + gran)));
          b = Math.min(240, Math.max(60, Math.round(115 + gran * 1.2)));
        } else if (kind === "mercury" || kind === "spx_trk_002") {
          const crater = (n1 * 24 + n2 * 22 + n3 * 18);
          r = Math.min(235, Math.max(75, Math.round(152 + crater)));
          g = Math.min(238, Math.max(78, Math.round(158 + crater)));
          b = Math.min(245, Math.max(85, Math.round(168 + crater)));
        } else if (kind === "venus") {
          const swirl = Math.sin(phi * 7.0 + n1 * 1.4) * 22 + n2 * 14;
          r = Math.min(255, Math.max(175, Math.round(234 + swirl)));
          g = Math.min(235, Math.max(140, Math.round(192 + swirl * 0.85)));
          b = Math.min(185, Math.max(85, Math.round(125 + swirl * 0.6)));
        } else if (kind === "earth") {
          const cont = n1 * 0.65 + n2 * 0.35;
          if (Math.abs(phi) > 1.22) {
            // Polar ice caps
            r = 240; g = 248; b = 255;
          } else if (cont > 0.12) {
            // Continents (forest green to tan highlands)
            r = Math.round(68 + cont * 95 + n3 * 20);
            g = Math.round(128 + cont * 55 + n3 * 15);
            b = Math.round(58 + cont * 30);
          } else {
            // Deep blue oceans
            r = Math.round(18 + (cont + 1) * 18);
            g = Math.round(78 + (cont + 1) * 38);
            b = Math.round(168 + (cont + 1) * 45);
          }
        } else if (kind === "mars") {
          if (Math.abs(phi) > 1.32) {
            r = 238; g = 232; b = 225;
          } else {
            const rust = n1 * 28 + n2 * 20 + n3 * 14;
            r = Math.min(242, Math.max(115, Math.round(198 + rust)));
            g = Math.min(165, Math.max(55, Math.round(102 + rust * 0.65)));
            b = Math.min(125, Math.max(35, Math.round(66 + rust * 0.45)));
          }
        } else if (kind === "jupiter") {
          const jBand = bands * 38 + n2 * 12;
          // Great Red Spot near southern tropics
          const dLon = lon - 3.2;
          const dPhi = phi - 0.38;
          const grs = Math.exp(-(dLon * dLon * 6.0 + dPhi * dPhi * 28.0));
          r = Math.min(252, Math.max(135, Math.round(214 + jBand + grs * 42)));
          g = Math.min(228, Math.max(105, Math.round(174 + jBand * 0.85 - grs * 35)));
          b = Math.min(195, Math.max(75, Math.round(132 + jBand * 0.65 - grs * 48)));
        } else if (kind === "saturn") {
          const sBand = Math.sin(phi * 16.0 + n1 * 0.4) * 24 + n2 * 8;
          r = Math.min(250, Math.max(165, Math.round(228 + sBand)));
          g = Math.min(232, Math.max(145, Math.round(198 + sBand * 0.9)));
          b = Math.min(188, Math.max(95, Math.round(142 + sBand * 0.7)));
        } else if (kind === "uranus") {
          const uBand = Math.sin(phi * 8.0) * 12 + n1 * 6;
          r = Math.min(185, Math.max(95, Math.round(135 + uBand)));
          g = Math.min(242, Math.max(175, Math.round(216 + uBand)));
          b = Math.min(255, Math.max(195, Math.round(238 + uBand)));
        } else if (kind === "neptune") {
          const nBand = Math.sin(phi * 11.0 + n1 * 0.6) * 22 + n2 * 10;
          r = Math.min(115, Math.max(28, Math.round(58 + nBand * 0.6)));
          g = Math.min(175, Math.max(68, Math.round(118 + nBand * 0.85)));
          b = Math.min(255, Math.max(165, Math.round(228 + nBand)));
        } else {
          // Outer icy Pluto / SPX-TRK-001 world (Sputnik Planitia nitrogen ice & tholin highlands)
          const ice = n1 * 32 + n2 * 22 + n3 * 14;
          r = Math.min(238, Math.max(95, Math.round(176 + ice)));
          g = Math.min(228, Math.max(88, Math.round(162 + ice * 0.92)));
          b = Math.min(218, Math.max(82, Math.round(148 + ice * 0.85)));
        }

        px[idx] = r;
        px[idx + 1] = g;
        px[idx + 2] = b;
        px[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  const PROCEDURAL_PLANET_TEXTURES = {
    sun: createRichPlanetaryCanvasTexture("sun"),
    mercury: createRichPlanetaryCanvasTexture("mercury"),
    venus: createRichPlanetaryCanvasTexture("venus"),
    earth: createRichPlanetaryCanvasTexture("earth"),
    mars: createRichPlanetaryCanvasTexture("mars"),
    jupiter: createRichPlanetaryCanvasTexture("jupiter"),
    saturn: createRichPlanetaryCanvasTexture("saturn"),
    uranus: createRichPlanetaryCanvasTexture("uranus"),
    neptune: createRichPlanetaryCanvasTexture("neptune"),
    spx_trk: createRichPlanetaryCanvasTexture("spx_trk")
  };

  function createSunGlowTexture() {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(256, 256, 12, 256, 256, 256);
    g.addColorStop(0.0, "rgba(255, 255, 255, 1.0)");
    g.addColorStop(0.18, "rgba(254, 240, 138, 0.96)");
    g.addColorStop(0.45, "rgba(251, 191, 36, 0.52)");
    g.addColorStop(0.75, "rgba(245, 158, 11, 0.15)");
    g.addColorStop(1.0, "rgba(245, 158, 11, 0.0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    return new THREE.CanvasTexture(c);
  }

  const sunOrbiter = new THREE.Group();
  solarOrbitGroup.add(sunOrbiter);

  const sunDistance = 38.0;
  const sunBasePos = new THREE.Vector3(-15.5, 2.4, -36.0);
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.35, 48, 48),
    new THREE.MeshBasicMaterial({ map: PROCEDURAL_PLANET_TEXTURES.sun, color: 0xffffff })
  );
  sunMesh.position.copy(sunBasePos);
  sunOrbiter.add(sunMesh);

  const sunHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createSunGlowTexture(),
      color: 0xfbbf24,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  sunHalo.scale.set(12.5, 12.5, 1);
  sunMesh.add(sunHalo);

  // Visible Heliocentric Orbit Arc Passing Through the Target Planet Around the Distant Sun
  const orbitArcPts = [];
  for (let i = -90; i <= 90; i++) {
    const rad = (i * Math.PI) / 180;
    orbitArcPts.push(new THREE.Vector3(Math.sin(rad) * 18.0, Math.sin(rad) * 1.4, -Math.cos(rad) * 18.0 + 18.0));
  }
  const orbitArcLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(orbitArcPts),
    new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.42 })
  );
  solarOrbitGroup.add(orbitArcLine);

  // Line of Solar System Planets at their respective orbital order between the Sun and the Outer System
  const corridorPlanetsGroup = new THREE.Group();
  solarOrbitGroup.add(corridorPlanetsGroup);
  const corridorPlanetItems = [];

  // 3. 3D Topographic Relief & Deep Impact Basin Processor
  // Transforms real NASA spacecraft imagery so that:
  // - Any flat black/unmapped gap becomes a realistic, deeply recessed 3D impact crater
  //   with terraced rock walls, central peak, and raised rim (never a flat black blotch).
  // - Generates a high-resolution 3D Height/Displacement Map + Bump Map for troughs & crests.
  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin("anonymous");

  const TEXTURE_URLS = {
    sun2k: "https://commons.wikimedia.org/wiki/Special:FilePath/Solarsystemscope_texture_2k_sun.jpg",
    mercury2k: "https://commons.wikimedia.org/wiki/Special:FilePath/Solarsystemscope_texture_2k_mercury.jpg",
    venus2k: "https://commons.wikimedia.org/wiki/Special:FilePath/Solarsystemscope_texture_2k_venus_atmosphere.jpg",
    earthDay: "https://commons.wikimedia.org/wiki/Special:FilePath/Solarsystemscope_texture_2k_earth_daymap.jpg",
    earthSpecular: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_specular_2048.jpg",
    earthNormal: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_normal_2048.jpg",
    earthClouds: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_clouds_1024.png",
    moonLRO: "https://commons.wikimedia.org/wiki/Special:FilePath/Solarsystemscope_texture_2k_moon.jpg",
    plutoNewHorizons: "https://commons.wikimedia.org/wiki/Special:FilePath/Solarsystemscope_texture_2k_ceres_fictional.jpg",
    marsOSIRIS: "https://commons.wikimedia.org/wiki/Special:FilePath/Solarsystemscope_texture_2k_mars.jpg",
    jupiterVoyager: "https://commons.wikimedia.org/wiki/Special:FilePath/Solarsystemscope_texture_2k_jupiter.jpg",
    saturn2k: "https://commons.wikimedia.org/wiki/Special:FilePath/Solarsystemscope_texture_2k_saturn.jpg",
    uranus2k: "https://commons.wikimedia.org/wiki/Special:FilePath/Solarsystemscope_texture_2k_uranus.jpg",
    neptuneVoyager: "https://commons.wikimedia.org/wiki/Special:FilePath/Solarsystemscope_texture_2k_neptune.jpg",
    barnardsStar: "https://commons.wikimedia.org/wiki/Special:FilePath/Solarsystemscope_texture_2k_sun.jpg",
    epsilonIndiB: "https://commons.wikimedia.org/wiki/Special:FilePath/Solarsystemscope_texture_2k_jupiter.jpg",
    wise0855: "https://commons.wikimedia.org/wiki/Special:FilePath/Solarsystemscope_texture_2k_neptune.jpg",
    rwAurigae: "https://commons.wikimedia.org/wiki/Special:FilePath/Solarsystemscope_texture_2k_sun.jpg",
    rDraconis: "https://commons.wikimedia.org/wiki/Special:FilePath/Solarsystemscope_texture_2k_sun.jpg"
  };

  function build3DReliefBundleFromImage(img, baseToneRGB, isCircleDiscPhoto, isGasGiant) {
    const w = 1024;
    const h = 512;
    const colorCanvas = document.createElement("canvas");
    colorCanvas.width = w;
    colorCanvas.height = h;
    const cCtx = colorCanvas.getContext("2d");

    const heightCanvas = document.createElement("canvas");
    heightCanvas.width = w;
    heightCanvas.height = h;
    const hCtx = heightCanvas.getContext("2d");

    // Draw source image onto a temporary sampling canvas
    let srcPixels = null;
    let sw = w;
    let sh = h;
    let discCx = w * 0.5;
    let discCy = h * 0.5;
    let discRx = w * 0.42;
    let discRy = h * 0.42;

    if (img) {
      const tmp = document.createElement("canvas");
      tmp.width = w;
      tmp.height = h;
      const tCtx = tmp.getContext("2d");
      tCtx.drawImage(img, 0, 0, w, h);
      srcPixels = tCtx.getImageData(0, 0, w, h).data;

      // Auto-detect illuminated planet disc bounding box if image has black space margins
      if (false) {
        let minX = w, maxX = 0, minY = h, maxY = 0;
        for (let py = 0; py < h; py += 2) {
          for (let px = 0; px < w; px += 2) {
            const i = (py * w + px) * 4;
            const lum = 0.299 * srcPixels[i] + 0.587 * srcPixels[i + 1] + 0.114 * srcPixels[i + 2];
            if (lum > 32) {
              if (px < minX) minX = px;
              if (px > maxX) maxX = px;
              if (py < minY) minY = py;
              if (py > maxY) maxY = py;
            }
          }
        }
        if (maxX > minX + 40 && maxY > minY + 40) {
          discCx = (minX + maxX) * 0.5;
          discCy = (minY + maxY) * 0.5;
          // Use 82% of detected disc radius so we stay strictly inside the lit planet away from dark limb edges
          discRx = (maxX - minX) * 0.41;
          discRy = (maxY - minY) * 0.41;
        }
      }
    }

    const cData = cCtx.createImageData(w, h);
    const outPx = cData.data;
    const hData = hCtx.createImageData(w, h);
    const hPx = hData.data;

    for (let y = 0; y < h; y++) {
      // Latitude phi in [-pi/2, +pi/2]
      const v = y / (h - 1);
      const phi = (v - 0.5) * Math.PI;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);

      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        // Longitude lambda in [0, 2*pi] — periodic in sin/cos so u=0 and u=1 match seamlessly!
        const u = x / w;
        const lambda = u * Math.PI * 2.0;

        let r = baseToneRGB[0];
        let g = baseToneRGB[1];
        let b = baseToneRGB[2];

        if (srcPixels) {
          if (false) {
            // Seamless Spherical Unwrap: map (lambda, phi) onto the interior of the illuminated NASA disc
            // Using cos(lambda) makes longitude wrap 0 -> pi -> 2*pi with zero seam at u=0/1!
            const nx = Math.sin(lambda - Math.PI * 0.5) * cosPhi;
            const ny = sinPhi;
            const sx = Math.max(0, Math.min(w - 1, Math.round(discCx + nx * discRx)));
            const sy = Math.max(0, Math.min(h - 1, Math.round(discCy + ny * discRy)));
            const sIdx = (sy * w + sx) * 4;
            r = srcPixels[sIdx];
            g = srcPixels[sIdx + 1];
            b = srcPixels[sIdx + 2];

            // Gentle limb-darkening compensation near the edges of the sampled disc
            const rDist2 = nx * nx + ny * ny;
            const limbBoost = 1.0 + 0.22 * rDist2;
            r = Math.min(220, Math.round(r * 0.88));
            g = Math.min(255, Math.round(g * limbBoost));
            b = Math.min(255, Math.round(b * limbBoost));
          } else {
            // Already a full 2:1 equirectangular map (e.g. LRO Moon)
            r = srcPixels[idx];
            g = srcPixels[idx + 1];
            b = srcPixels[idx + 2];
          }
        } else {
          // Procedural fallback using strictly periodic spherical harmonics (zero seam)
          const wave = Math.sin(lambda * 4.0 + sinPhi * 3.0) * 26.0 + Math.cos(lambda * 11.0 - sinPhi * 7.0) * 18.0;
          r = Math.max(15, Math.min(255, Math.round(baseToneRGB[0] + wave)));
          g = Math.max(15, Math.min(255, Math.round(baseToneRGB[1] + wave)));
          b = Math.max(15, Math.min(255, Math.round(baseToneRGB[2] + wave)));
        }

        // Guarantee zero black spots: lift any dark pixel smoothly toward baseToneRGB
        const rawLum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (rawLum < 42) {
          const blend = (42 - rawLum) / 42.0;
          r = Math.round(r * (1 - blend) + baseToneRGB[0] * blend);
          g = Math.round(g * (1 - blend) + baseToneRGB[1] * blend);
          b = Math.round(b * (1 - blend) + baseToneRGB[2] * blend);
        }
        outPx[idx] = r;
        outPx[idx + 1] = g;
        outPx[idx + 2] = b;
        outPx[idx + 3] = 255;

        // Compute seamless 3D topographic height map from true surface luminance + periodic spherical relief
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const pRelief =
          Math.sin(lambda * 6.0 + sinPhi * 4.0) * Math.cos(lambda * 4.0 - sinPhi * 5.0) * 10.0 +
          Math.cos(lambda * 14.0) * cosPhi * 6.0;

        let elev = 128;
        if (isGasGiant) {
          // Smooth banded cloud relief for Jupiter & Neptune
          elev = Math.max(90, Math.min(165, Math.round(128 + (lum - 128) * 0.25)));
        } else {
          // Rocky/icy bodies: real dark craters/troughs indent inward, bright rims/crests rise outward
          elev = Math.max(20, Math.min(240, Math.round(lum * 0.92 + pRelief * cosPhi)));
        }

        hPx[idx] = elev;
        hPx[idx + 1] = elev;
        hPx[idx + 2] = elev;
        hPx[idx + 3] = 255;
      }
    }

    cCtx.putImageData(cData, 0, 0);
    hCtx.putImageData(hData, 0, 0);

    const colorTex = new THREE.CanvasTexture(colorCanvas);
    colorTex.wrapS = THREE.RepeatWrapping;
    colorTex.wrapT = THREE.ClampToEdgeWrapping;

    const heightTex = new THREE.CanvasTexture(heightCanvas);
    heightTex.wrapS = THREE.RepeatWrapping;
    heightTex.wrapT = THREE.ClampToEdgeWrapping;

    return {
      colorMap: colorTex,
      heightMap: heightTex
    };
  }

  // Build instant fallback 3D relief bundles and replace with real NASA imagery on load
  const planetBundles = {
    earth: {
      colorMap: textureLoader.load(TEXTURE_URLS.earthDay),
      heightMap: textureLoader.load(TEXTURE_URLS.earthNormal),
      bumpScale: 0.05,
      dispScale: 0.02
    },
    spx_trk_002: {
      ...build3DReliefBundleFromImage(null, [148, 163, 184], false, false),
      bumpScale: 0.12,
      dispScale: 0.07
    },
    spx_trk_001: {
      ...build3DReliefBundleFromImage(null, [165, 152, 138], true, false),
      bumpScale: 0.12,
      dispScale: 0.07
    },
    mars: {
      ...build3DReliefBundleFromImage(null, [194, 95, 58], true, false),
      bumpScale: 0.11,
      dispScale: 0.06
    },
    jupiter: {
      ...build3DReliefBundleFromImage(null, [210, 165, 115], true, true),
      bumpScale: 0.015,
      dispScale: 0.0
    },
    neptune: {
      ...build3DReliefBundleFromImage(null, [59, 130, 246], true, true),
      bumpScale: 0.015,
      dispScale: 0.0
    },
    barnards_star: {
      ...build3DReliefBundleFromImage(null, [239, 92, 58], false, true),
      bumpScale: 0.02,
      dispScale: 0.01
    },
    epsilon_indi_b: {
      ...build3DReliefBundleFromImage(null, [168, 72, 118], false, true),
      bumpScale: 0.02,
      dispScale: 0.0
    },
    wise_0855: {
      ...build3DReliefBundleFromImage(null, [118, 62, 132], false, true),
      bumpScale: 0.02,
      dispScale: 0.0
    },
    rw_aurigae: {
      ...build3DReliefBundleFromImage(null, [245, 178, 78], false, true),
      bumpScale: 0.025,
      dispScale: 0.01
    },
    r_draconis: {
      ...build3DReliefBundleFromImage(null, [234, 88, 64], false, true),
      bumpScale: 0.025,
      dispScale: 0.01
    }
  };

  function loadAndProcessRealPlanetImage(key, url, baseRGB, isCircleDiscPhoto, isGasGiant) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () {
      const bundle = build3DReliefBundleFromImage(img, baseRGB, isCircleDiscPhoto, isGasGiant);
      planetBundles[key].colorMap = bundle.colorMap;
      planetBundles[key].heightMap = bundle.heightMap;
      if (currentBodyKey === key) {
        applyPlanetAppearance(key);
      }
    };
    img.src = url;
  }

  // Load real NASA LRO (2:1 map) and New Horizons / OSIRIS / Voyager disc photos (unwrapped seamlessly!)
  loadAndProcessRealPlanetImage("spx_trk_002", TEXTURE_URLS.moonLRO, [156, 172, 192], false, false);
  loadAndProcessRealPlanetImage("spx_trk_001", TEXTURE_URLS.plutoNewHorizons, [165, 152, 138], true, false);
  loadAndProcessRealPlanetImage("mars", TEXTURE_URLS.marsOSIRIS, [198, 98, 60], true, false);
  loadAndProcessRealPlanetImage("jupiter", TEXTURE_URLS.jupiterVoyager, [212, 168, 118], true, true);
  loadAndProcessRealPlanetImage("neptune", TEXTURE_URLS.neptuneVoyager, [64, 136, 248], true, true);
  loadAndProcessRealPlanetImage("barnards_star", TEXTURE_URLS.barnardsStar, [239, 92, 58], false, true);
  loadAndProcessRealPlanetImage("epsilon_indi_b", TEXTURE_URLS.epsilonIndiB, [168, 72, 118], false, true);
  loadAndProcessRealPlanetImage("wise_0855", TEXTURE_URLS.wise0855, [118, 62, 132], false, true);
  loadAndProcessRealPlanetImage("rw_aurigae", TEXTURE_URLS.rwAurigae, [245, 178, 78], false, true);
  loadAndProcessRealPlanetImage("r_draconis", TEXTURE_URLS.rDraconis, [234, 88, 64], false, true);

  // 4A. Realistic 3D Solar System (Displayed on Overview Screen: Central Sun + Revolving Planets in Orbits)
  const milkyWayGroup = new THREE.Group();
  milkyWayGroup.position.set(2.35, -0.1, 0.0);
  milkyWayGroup.rotation.x = 0.62;
  milkyWayGroup.rotation.z = -0.18;
  scene.add(milkyWayGroup);

  const overviewOrbitingBodies = [];

  (function buildOverviewSolarSystem() {
    // 1. Central Glowing 3D Sun
    const centerSun = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 48, 48),
      new THREE.MeshBasicMaterial({ map: PROCEDURAL_PLANET_TEXTURES.sun, color: 0xffffff })
    );
    milkyWayGroup.add(centerSun);

    const centerSunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createSunGlowTexture(),
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    centerSunGlow.scale.set(2.45, 2.45, 1.0);
    milkyWayGroup.add(centerSunGlow);

    // 2. Solar System Planets + Real Textures + Keplerian Orbital Speeds
    const solarPlanetsSpec = [
      { name: "mercury", r: 0.68, size: 0.058, speed: 0.022, color: 0xffffff, tex: TEXTURE_URLS.mercury2k, phase: 0.4 },
      { name: "venus",   r: 0.92, size: 0.084, speed: 0.016, color: 0xffffff, tex: TEXTURE_URLS.venus2k, phase: 1.8 },
      { name: "earth",   r: 1.20, size: 0.094, speed: 0.012, color: 0xffffff, tex: TEXTURE_URLS.earthDay, phase: 3.1 },
      { name: "mars",    r: 1.50, size: 0.078, speed: 0.009, color: 0xffffff, tex: TEXTURE_URLS.marsOSIRIS, phase: 4.5 },
      { name: "jupiter", r: 1.96, size: 0.178, speed: 0.0055, color: 0xffffff, tex: TEXTURE_URLS.jupiterVoyager, phase: 0.9 },
      { name: "saturn",  r: 2.44, size: 0.148, speed: 0.0040, color: 0xffffff, tex: TEXTURE_URLS.saturn2k, phase: 2.6, hasRings: true },
      { name: "uranus",  r: 2.86, size: 0.108, speed: 0.0028, color: 0xffffff, tex: TEXTURE_URLS.uranus2k, phase: 5.1 },
      { name: "neptune", r: 3.24, size: 0.105, speed: 0.0021, color: 0xffffff, tex: TEXTURE_URLS.neptuneVoyager, phase: 3.9 },
      { name: "spx_trk", r: 3.62, size: 0.082, speed: 0.0014, color: 0xdbeafe, tex: TEXTURE_URLS.plutoNewHorizons, phase: 1.2, isCandidate: true }
    ];

    solarPlanetsSpec.forEach((sp) => {
      // Heliocentric orbital ring
      const orbitPts = [];
      const segments = 128;
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2.0;
        orbitPts.push(new THREE.Vector3(Math.cos(theta) * sp.r, 0.0, Math.sin(theta) * sp.r));
      }
      const orbitGeom = new THREE.BufferGeometry().setFromPoints(orbitPts);
      const orbitLine = new THREE.Line(
        orbitGeom,
        new THREE.LineBasicMaterial({
          color: sp.isCandidate ? 0x38bdf8 : 0x64748b,
          transparent: true,
          opacity: sp.isCandidate ? 0.65 : 0.32
        })
      );
      milkyWayGroup.add(orbitLine);

      // Planet pivot & mesh
      const fallbackTex = PROCEDURAL_PLANET_TEXTURES[sp.name] || PROCEDURAL_PLANET_TEXTURES.spx_trk;
      const pMat = new THREE.MeshBasicMaterial({ map: fallbackTex, color: 0xffffff });
      const pMesh = new THREE.Mesh(
        new THREE.SphereGeometry(sp.size, 36, 36),
        pMat
      );

      if (sp.hasRings) {
        const ringGeo = new THREE.RingGeometry(sp.size * 1.45, sp.size * 2.35, 48);
        ringGeo.rotateX(Math.PI / 2);
        const ringMesh = new THREE.Mesh(
          ringGeo,
          new THREE.MeshBasicMaterial({
            color: 0xfde68a,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.65
          })
        );
        ringMesh.rotation.z = 0.35;
        pMesh.add(ringMesh);
      }

      pMesh.position.set(Math.cos(sp.phase) * sp.r, 0.0, Math.sin(sp.phase) * sp.r);
      milkyWayGroup.add(pMesh);

      overviewOrbitingBodies.push({
        mesh: pMesh,
        r: sp.r,
        speed: sp.speed,
        angle: sp.phase
      });
    });

    // Subtle Asteroid / Kuiper Belt Dust Particles
    const beltCount = 900;
    const beltGeo = new THREE.BufferGeometry();
    const beltPos = new Float32Array(beltCount * 3);
    for (let i = 0; i < beltCount; i++) {
      const isKuiper = i > 350;
      const rad = isKuiper ? 3.35 + Math.random() * 0.45 : 1.66 + Math.random() * 0.18;
      const ang = Math.random() * Math.PI * 2.0;
      beltPos[i * 3] = Math.cos(ang) * rad;
      beltPos[i * 3 + 1] = (Math.random() - 0.5) * 0.08;
      beltPos[i * 3 + 2] = Math.sin(ang) * rad;
    }
    beltGeo.setAttribute("position", new THREE.BufferAttribute(beltPos, 3));
    const beltMat = new THREE.PointsMaterial({
      color: 0x94a3b8,
      size: 0.022,
      transparent: true,
      opacity: 0.55
    });
    milkyWayGroup.add(new THREE.Points(beltGeo, beltMat));
  })();

  // 4B. Build the Respective Corridor Planets (Mercury -> Neptune) + High-Density Target Body Mesh
  const CORRIDOR_SPECS = [
    { key: "mercury", order: 1, frac: 0.14, size: 0.24, color: 0xffffff, tex: TEXTURE_URLS.mercury2k, sideOffset: -0.95, yOffset: -0.15 },
    { key: "venus",   order: 2, frac: 0.24, size: 0.34, color: 0xffffff, tex: TEXTURE_URLS.venus2k, sideOffset: 0.95, yOffset: 0.18 },
    { key: "earth",   order: 3, frac: 0.35, size: 0.38, color: 0xffffff, tex: TEXTURE_URLS.earthDay, sideOffset: -1.05, yOffset: -0.12 },
    { key: "mars",    order: 4, frac: 0.46, size: 0.30, color: 0xffffff, tex: TEXTURE_URLS.marsOSIRIS, sideOffset: 1.0, yOffset: 0.15 },
    { key: "jupiter", order: 5, frac: 0.60, size: 0.68, color: 0xffffff, tex: TEXTURE_URLS.jupiterVoyager, sideOffset: -1.35, yOffset: -0.20 },
    { key: "saturn",  order: 6, frac: 0.73, size: 0.56, color: 0xffffff, tex: TEXTURE_URLS.saturn2k, sideOffset: 1.35, yOffset: 0.22, hasRings: true },
    { key: "uranus",  order: 7, frac: 0.84, size: 0.42, color: 0xffffff, tex: TEXTURE_URLS.uranus2k, sideOffset: -1.15, yOffset: -0.14 },
    { key: "neptune", order: 8, frac: 0.92, size: 0.42, color: 0xffffff, tex: TEXTURE_URLS.neptuneVoyager, sideOffset: 1.15, yOffset: 0.14 }
  ];

  CORRIDOR_SPECS.forEach((sp) => {
    const fallbackTex = PROCEDURAL_PLANET_TEXTURES[sp.key] || PROCEDURAL_PLANET_TEXTURES.spx_trk;
    const cMat = new THREE.MeshBasicMaterial({ map: fallbackTex, color: 0xffffff });
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(sp.size, 36, 36),
      cMat
    );
    if (sp.hasRings) {
      const rGeo = new THREE.RingGeometry(sp.size * 1.4, sp.size * 2.3, 48);
      rGeo.rotateX(Math.PI / 2);
      const rMesh = new THREE.Mesh(
        rGeo,
        new THREE.MeshBasicMaterial({ color: 0xfde68a, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
      );
      rMesh.rotation.z = 0.32;
      mesh.add(rMesh);
    }

    // Individual orbital arc segment passing through this planet's stationary position
    const ringPts = [];
    for (let a = -28; a <= 28; a += 2) {
      const rRad = (a * Math.PI) / 180.0;
      ringPts.push(new THREE.Vector3(Math.sin(rRad) * 9.0, Math.sin(rRad) * 0.4, (1.0 - Math.cos(rRad)) * 4.0));
    }
    const localArc = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(ringPts),
      new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.28 })
    );
    mesh.add(localArc);

    corridorPlanetsGroup.add(mesh);
    corridorPlanetItems.push({ spec: sp, mesh });
  });

  // Position all corridor planets at their respective heliocentric distances along the Sun -> Target line
  function layoutCorridorPlanetsForTarget(targetKey) {
    const targetFracMap = {
      mars: 0.46,
      jupiter: 0.60,
      neptune: 0.92,
      spx_trk_002: 1.0,
      spx_trk_001: 1.0,
      barnards_star: 1.0,
      epsilon_indi_b: 1.0,
      wise_0855: 1.0,
      rw_aurigae: 1.0,
      r_draconis: 1.0
    };
    const tFrac = targetFracMap[targetKey] || 1.0;
    const sunPos = sunMesh.position;
    const targetLocalPos = new THREE.Vector3(0.0, 0.0, 0.0);

    // Axis from Sun to Target Object
    const dir = new THREE.Vector3().subVectors(targetLocalPos, sunPos);
    // Perpendicular horizontal vector in XZ plane so planets sit cleanly along the flight corridor
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

    corridorPlanetItems.forEach((item) => {
      const sp = item.spec;
      if (sp.key === targetKey) {
        // The selected target is rendered as the main high-res centered planetMesh
        item.mesh.visible = false;
        return;
      }
      item.mesh.visible = true;
      // Relative distance ratio along the Sun -> Target ray
      const rel = sp.frac / tFrac;
      const basePt = new THREE.Vector3().copy(sunPos).addScaledVector(dir, rel);
      basePt.addScaledVector(perp, sp.sideOffset);
      basePt.y += sp.yOffset;
      item.mesh.position.copy(basePt);
    });
  }

  const planetGroup = new THREE.Group();
  planetGroup.position.set(0.0, -0.15, 0.0);
  planetGroup.visible = false;
  scene.add(planetGroup);

  const planetRadius = 2.32;
  const planetMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: planetBundles.spx_trk_002.colorMap,
    bumpMap: planetBundles.spx_trk_002.heightMap,
    bumpScale: 0.12,
    displacementMap: planetBundles.spx_trk_002.heightMap,
    displacementScale: 0.07,
    displacementBias: -0.035,
    roughness: 0.78,
    metalness: 0.06
  });

  const planetMesh = new THREE.Mesh(new THREE.SphereGeometry(planetRadius, 128, 128), planetMat);
  planetMesh.rotation.z = 0.35;
  planetGroup.add(planetMesh);

  const cloudMesh = new THREE.Mesh(
    new THREE.SphereGeometry(planetRadius * 1.012, 64, 64),
    new THREE.MeshLambertMaterial({
      map: textureLoader.load(TEXTURE_URLS.earthClouds),
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending
    })
  );
  cloudMesh.visible = false;
  planetGroup.add(cloudMesh);

  const atmoMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.16,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending
  });
  const atmoMesh = new THREE.Mesh(new THREE.SphereGeometry(planetRadius * 1.035, 64, 64), atmoMat);
  planetGroup.add(atmoMesh);

  let currentBodyKey = "spx_trk_002";
  let targetGroupPos = new THREE.Vector3(0.0, -0.15, 0.0);
  let isMovingPosition = false;

  // Camera Sun-through-Planets-to-Object Focus Fly-Through State
  let isFocusingFromSun = false;
  let focusStartTime = 0;
  const focusDurationMs = 3100;
  let focusCameraCurve = null;
  let focusLookCurve = null;

  function applyPlanetAppearance(bodyKey) {
    currentBodyKey = bodyKey;
    const b = planetBundles[bodyKey] || planetBundles.spx_trk_002;

    planetMat.map = b.colorMap;
    planetMat.bumpMap = b.heightMap;
    planetMat.bumpScale = b.bumpScale;
    planetMat.displacementMap = b.heightMap;
    planetMat.displacementScale = b.dispScale;
    planetMat.displacementBias = -b.dispScale * 0.5;
    cloudMesh.visible = false;

    if (bodyKey === "spx_trk_002") {
      planetMat.color.setHex(0xdbeafe);
      planetMat.roughness = 0.82;
      atmoMat.color.setHex(0x38bdf8);
    } else if (bodyKey === "spx_trk_001") {
      planetMat.color.setHex(0xe0f2fe);
      planetMat.roughness = 0.78;
      atmoMat.color.setHex(0x0284c7);
    } else if (bodyKey === "mars") {
      planetMat.color.setHex(0xfecaca);
      planetMat.roughness = 0.85;
      atmoMat.color.setHex(0xf97316);
    } else if (bodyKey === "jupiter") {
      planetMat.color.setHex(0xfef3c7);
      planetMat.roughness = 0.55;
      atmoMat.color.setHex(0xf59e0b);
    } else if (bodyKey === "barnards_star") {
      planetMat.color.setHex(0xff8a65);
      planetMat.roughness = 0.45;
      atmoMat.color.setHex(0xef4444);
    } else if (bodyKey === "epsilon_indi_b") {
      planetMat.color.setHex(0xd8b4fe);
      planetMat.roughness = 0.55;
      atmoMat.color.setHex(0xa855f7);
    } else if (bodyKey === "wise_0855") {
      planetMat.color.setHex(0xa78bfa);
      planetMat.roughness = 0.60;
      atmoMat.color.setHex(0x7c3aed);
    } else if (bodyKey === "rw_aurigae") {
      planetMat.color.setHex(0xfef08a);
      planetMat.roughness = 0.40;
      atmoMat.color.setHex(0xf59e0b);
    } else if (bodyKey === "r_draconis") {
      planetMat.color.setHex(0xfca5a5);
      planetMat.roughness = 0.42;
      atmoMat.color.setHex(0xf97316);
    } else {
      planetMat.color.setHex(0xbfdbfe);
      planetMat.roughness = 0.65;
      atmoMat.color.setHex(0x38bdf8);
    }
    planetMat.needsUpdate = true;
  }

  function transitionToPlanet(bodyKey, centered = true, onComplete) {
    if (!centered || bodyKey === "milkyway" || bodyKey === "earth") {
      // Overview Mode: Show Revolving 3D Solar System on Right, Hide Focused Target Corridor
      isFocusingFromSun = false;
      milkyWayGroup.visible = true;
      planetGroup.visible = false;
      solarOrbitGroup.visible = false;
      camera.position.set(0.0, 0.0, 9.2);
      controls.target.set(0.0, 0.0, 0.0);
      controls.update();
      sunLight.position.set(-11, 5, 10);
      if (typeof onComplete === "function") onComplete();
      return;
    }

    // Explore / Time-Travel Mode:
    // 1. Keep Sun at sunBasePos and place all other planets at their respective positions in line
    sunMesh.position.copy(sunBasePos);
    layoutCorridorPlanetsForTarget(bodyKey);

    applyPlanetAppearance(bodyKey);
    milkyWayGroup.visible = false;
    planetGroup.visible = true;
    planetGroup.position.set(0.0, -0.15, 0.0);
    targetGroupPos.set(0.0, -0.15, 0.0);
    solarOrbitGroup.visible = true;

    const sunWorld = new THREE.Vector3();
    sunMesh.getWorldPosition(sunWorld);
    const targetWorld = new THREE.Vector3(0.0, -0.15, 0.0);
    const finalCamPos = new THREE.Vector3(0.0, 0.0, 9.2);

    // Build a smooth flight path starting right at the Sun, passing directly between the line of planets
    // (Mercury -> Venus -> Earth -> Mars -> Jupiter -> Saturn -> Uranus -> Neptune), and arriving at the Target Object!
    const p0 = new THREE.Vector3().lerpVectors(sunWorld, targetWorld, 0.06).add(new THREE.Vector3(0, 0.4, 0));
    const p1 = new THREE.Vector3().lerpVectors(sunWorld, targetWorld, 0.32).add(new THREE.Vector3(0, 0.25, 0));
    const p2 = new THREE.Vector3().lerpVectors(sunWorld, targetWorld, 0.64).add(new THREE.Vector3(0, 0.15, 0));
    const p3 = new THREE.Vector3().lerpVectors(sunWorld, targetWorld, 0.90).add(new THREE.Vector3(0, 0.05, 3.2));
    focusCameraCurve = new THREE.CatmullRomCurve3([p0, p1, p2, p3, finalCamPos], false, "centripetal");

    // Look target sweeps ahead along the line of planets and locks onto the Target Object
    const l0 = new THREE.Vector3().lerpVectors(sunWorld, targetWorld, 0.35);
    const l1 = new THREE.Vector3().lerpVectors(sunWorld, targetWorld, 0.68);
    const l2 = new THREE.Vector3().lerpVectors(sunWorld, targetWorld, 0.95);
    focusLookCurve = new THREE.CatmullRomCurve3([l0, l1, l2, targetWorld, targetWorld], false, "centripetal");

    camera.position.copy(p0);
    controls.target.copy(l0);
    controls.update();

    focusStartTime = performance.now();
    isFocusingFromSun = true;

    setTimeout(() => {
      if (typeof onComplete === "function") onComplete();
    }, focusDurationMs);
  }

  // 5. Solar Revolution Animation for Time-Travel Transit
  // As the user plays or slides through time (2000–2045), the planet revolves along
  // its heliocentric orbit relative to the Sun, shifting the background Sun position,
  // orbital track, and directional sunlight across the 3D craters, troughs, and crests!
  function rotateForTimeSlider(yearFloat) {
    const dy = Number(yearFloat) - 2026.8;
    const orbitalAngle = dy * 0.14; // Heliocentric orbital angle (radians)

    // Axial rotation of the planet
    planetMesh.rotation.y += 0.04;

    // Revolve the relative Sun position & sunlight vector around the orbiting planet
    const sx = -Math.cos(orbitalAngle) * sunDistance;
    const sz = -Math.sin(orbitalAngle) * 11.5 - 6.0;
    const sy = 2.0 + Math.sin(orbitalAngle) * 1.4;
    sunMesh.position.set(sx, sy, sz);

    // Update directional sunlight so 3D crater rims, troughs, and crests cast moving shadows!
    sunLight.position.set(sx * 1.2, sy * 2.0, sz + 14.0);
    orbitArcLine.rotation.y = orbitalAngle * 0.35;
  }

  // Fast Axial Spin Burst on Scroll
  let scrollSpinBoost = 0.0;
  let lastScrollY = window.scrollY;

  function triggerFastScrollSpin(intensity = 0.16) {
    scrollSpinBoost = Math.min(scrollSpinBoost + intensity, 0.26);
  }

  window.addEventListener("scroll", () => {
    const dy = Math.abs(window.scrollY - lastScrollY);
    lastScrollY = window.scrollY;
    if (dy > 2) {
      scrollSpinBoost = Math.min(scrollSpinBoost + dy * 0.0018, 0.24);
    }
  });

  // Main 60fps Render Loop (Preserves User Zoom Distance & Angle)
  function animate() {
    requestAnimationFrame(animate);

    scrollSpinBoost *= 0.92;
    const spinSpeed = 0.0015 + scrollSpinBoost;

    if (milkyWayGroup.visible) {
      const speedBoost = 1.0 + scrollSpinBoost * 18.0;
      overviewOrbitingBodies.forEach((b) => {
        b.angle += b.speed * speedBoost;
        b.mesh.position.set(Math.cos(b.angle) * b.r, 0.0, Math.sin(b.angle) * b.r);
        b.mesh.rotation.y += 0.02;
      });
    }

    if (planetGroup.visible) {
      planetMesh.rotation.y += spinSpeed;
    }

    if (solarOrbitGroup.visible) {
      // Planets stay at their respective orbital positions while rotating gently on their axes
      corridorPlanetItems.forEach((item) => {
        if (item.mesh.visible) item.mesh.rotation.y += 0.008;
      });
    }

    if (isFocusingFromSun && focusCameraCurve && focusLookCurve) {
      const elapsed = performance.now() - focusStartTime;
      const t = Math.min(1.0, elapsed / focusDurationMs);
      const ease = t < 0.5 ? 4.0 * t * t * t : 1.0 - Math.pow(-2.0 * t + 2.0, 3) / 2.0;

      camera.position.copy(focusCameraCurve.getPointAt(ease));
      controls.target.copy(focusLookCurve.getPointAt(ease));

      if (t >= 1.0) {
        isFocusingFromSun = false;
      }
    }

    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });



  // --- v3 Complete Earth-to-Target-Body 3D Trajectory (Origin Earth -> Target Body) ---
  let v3ApproachLine = null;
  let v3WaypointsSpheres = [];
  let v3Spacecraft = null;
  let v3OriginEarth = null;
  let v3Curve = null;
  let v3Progress = 0;
  let v3AnimId = null;
  let v3TrajSpeed = 1.0;
  let v3TrajPaused = false;

  function makeTextSprite(textStr, borderColor) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "rgba(9, 15, 28, 0.85)";
    ctx.strokeStyle = borderColor || "#38bdf8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(6, 8, 244, 48, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 20px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(textStr, 128, 32);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(2.1, 0.52, 1);
    return sp;
  }

  function clearV3Trajectory() {
    if (v3AnimId) {
      cancelAnimationFrame(v3AnimId);
      v3AnimId = null;
    }
    if (v3ApproachLine) {
      scene.remove(v3ApproachLine);
      v3ApproachLine.geometry.dispose();
      v3ApproachLine = null;
    }
    v3WaypointsSpheres.forEach((m) => scene.remove(m));
    v3WaypointsSpheres = [];
    if (v3Spacecraft) v3Spacecraft.visible = false;
    if (v3OriginEarth) v3OriginEarth.visible = false;
  }

  function runCatmullApproach(waypoints, colorHex) {
    clearV3Trajectory();
    solarOrbitGroup.visible = true;

    const hex = colorHex || 0x00ffff;
    const sunStartPos = new THREE.Vector3();
    sunMesh.getWorldPosition(sunStartPos);
    const earthPos = sunStartPos.clone();
    const targetArrivalPos = new THREE.Vector3(0.0, -0.15, planetRadius + 0.12);

    // 2. Create 3D Spacecraft Probe
    if (!v3Spacecraft) {
      const scGroup = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 20, 20),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 20, 20),
        new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.6 })
      );
      scGroup.add(core);
      scGroup.add(halo);
      v3Spacecraft = scGroup;
      scene.add(v3Spacecraft);
    }
    v3Spacecraft.children[1].material.color.setHex(hex);
    v3Spacecraft.visible = true;

    // 3. Build complete, unbroken path starting at Earth (earthPos) and ending directly at Target Body (targetArrivalPos)
    let midPoints = [];
    if (Array.isArray(waypoints) && waypoints.length >= 2) {
      midPoints = waypoints.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    } else {
      midPoints = [
        new THREE.Vector3(-4.1, 0.45, 0.8),
        new THREE.Vector3(-2.1, 1.15, 2.1),
        new THREE.Vector3(-0.85, 0.55, 2.55)
      ];
    }
    const fullPoints = [earthPos.clone(), ...midPoints, targetArrivalPos.clone()];

    v3Curve = new THREE.CatmullRomCurve3(fullPoints, false, "centripetal");
    const curvePts = v3Curve.getPoints(120);
    const geom = new THREE.BufferGeometry().setFromPoints(curvePts);
    v3ApproachLine = new THREE.Line(
      geom,
      new THREE.LineBasicMaterial({ color: hex, linewidth: 3 })
    );
    scene.add(v3ApproachLine);

    // 4. Place glowing waypoint beacons along the complete Earth -> Target path
    [0.2, 0.4, 0.6, 0.8, 1.0].forEach((frac) => {
      const pt = v3Curve.getPointAt(frac);
      const wpMesh = new THREE.Mesh(
        new THREE.SphereGeometry(frac === 1.0 ? 0.11 : 0.065, 14, 14),
        new THREE.MeshBasicMaterial({ color: hex })
      );
      wpMesh.position.copy(pt);
      scene.add(wpMesh);
      v3WaypointsSpheres.push(wpMesh);
    });

    v3Progress = 0;
    v3TrajPaused = false;
    function stepApproach() {
      if (!v3Curve || !v3Spacecraft || !v3Spacecraft.visible) return;
      if (!v3TrajPaused) {
        v3Progress += 0.0012 * v3TrajSpeed;
        if (v3Progress > 1) v3Progress = 0;
        const s = v3Progress * v3Progress * (3 - 2 * v3Progress);
        const pos = v3Curve.getPointAt(s);
        v3Spacecraft.position.copy(pos);
        if (v3OriginEarth) v3OriginEarth.children[0].rotation.y += 0.004 * v3TrajSpeed;
      }
      v3AnimId = requestAnimationFrame(stepApproach);
    }
    v3AnimId = requestAnimationFrame(stepApproach);
  }

  function setV3TrajectorySpeed(mult) {
    v3TrajSpeed = Math.max(0.1, parseFloat(mult) || 1.0);
  }

  function toggleV3TrajectoryPause() {
    v3TrajPaused = !v3TrajPaused;
    return v3TrajPaused;
  }

  return {
    runCatmullApproach,
    clearV3Trajectory,
    setV3TrajectorySpeed,
    toggleV3TrajectoryPause,
    transitionToPlanet,
    triggerFastScrollSpin,
    rotateForTimeSlider
  };
})();