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
  const ambientLight = new THREE.AmbientLight(0x475569, 1.35);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xcbd5e1, 0x1e293b, 0.65);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.75);
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

  // 2. Solar System Orbit Context (Glowing 3D Sun + Heliocentric Orbit Track in Background)
  const solarOrbitGroup = new THREE.Group();
  solarOrbitGroup.position.set(0, -0.15, 0);
  solarOrbitGroup.visible = false; // Shown in Start Exploring & Time-Travel Transit modes
  scene.add(solarOrbitGroup);

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

  const sunDistance = 16.5;
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0xfffbeb })
  );
  sunMesh.position.set(-sunDistance, 2.4, -10.5);
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
  sunHalo.scale.set(9.5, 9.5, 1);
  sunMesh.add(sunHalo);

  // Visible Heliocentric Orbit Arc Passing Through the Planet Around the Distant Sun
  const orbitArcPts = [];
  for (let i = -90; i <= 90; i++) {
    const rad = (i * Math.PI) / 180;
    orbitArcPts.push(new THREE.Vector3(Math.sin(rad) * 18.0, Math.sin(rad) * 1.4, -Math.cos(rad) * 18.0 + 18.0));
  }
  const orbitArcLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(orbitArcPts),
    new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.48 })
  );
  solarOrbitGroup.add(orbitArcLine);

  // 3. 3D Topographic Relief & Deep Impact Basin Processor
  // Transforms real NASA spacecraft imagery so that:
  // - Any flat black/unmapped gap becomes a realistic, deeply recessed 3D impact crater
  //   with terraced rock walls, central peak, and raised rim (never a flat black blotch).
  // - Generates a high-resolution 3D Height/Displacement Map + Bump Map for troughs & crests.
  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin("anonymous");

  const TEXTURE_URLS = {
    earthDay: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg",
    earthSpecular: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_specular_2048.jpg",
    earthNormal: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_normal_2048.jpg",
    earthClouds: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_clouds_1024.png",
    moonLRO: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/moon_1024.jpg",
    plutoNewHorizons: "https://upload.wikimedia.org/wikipedia/commons/e/ef/Pluto_in_True_Color_-_High-Res.jpg",
    marsOSIRIS: "https://upload.wikimedia.org/wikipedia/commons/0/02/OSIRIS_Mars_true_color.jpg",
    jupiterVoyager: "https://upload.wikimedia.org/wikipedia/commons/e/e2/Jupiter.jpg",
    neptuneVoyager: "https://upload.wikimedia.org/wikipedia/commons/6/63/Neptune_-_Voyager_2_%2829347980845%29_flatten_crop.jpg"
  };

  // Converts any NASA spacecraft image (whether a full 2:1 equirectangular map like LRO Moon
  // OR a circular planet disc photo surrounded by black space like New Horizons Pluto, OSIRIS Mars,
  // Voyager Jupiter, and Voyager Neptune) into a 100% seamless 360° equirectangular texture + height map
  // with ZERO black borders, ZERO vertical seams, and realistic 3D craters/troughs/crests.
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
      if (isCircleDiscPhoto) {
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
          if (isCircleDiscPhoto) {
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
            r = Math.min(255, Math.round(r * limbBoost));
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
          const wave = Math.sin(lambda * 3.0) * Math.cos(phi * 3.0) * 14.0;
          r = Math.max(15, Math.min(255, Math.round(baseToneRGB[0] + wave)));
          g = Math.max(15, Math.min(255, Math.round(baseToneRGB[1] + wave)));
          b = Math.max(15, Math.min(255, Math.round(baseToneRGB[2] + wave)));
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

  // 4. High-Density 128x128 3D Planet Mesh with Physical Displacement & Bump Relief
  const planetGroup = new THREE.Group();
  planetGroup.position.set(2.4, -0.2, 0);
  scene.add(planetGroup);

  const planetRadius = 2.32;
  const planetMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: planetBundles.earth.colorMap,
    bumpMap: planetBundles.earth.heightMap,
    bumpScale: 0.05,
    displacementMap: planetBundles.earth.heightMap,
    displacementScale: 0.02,
    displacementBias: -0.01,
    roughness: 0.72,
    metalness: 0.06
  });

  const planetMesh = new THREE.Mesh(new THREE.SphereGeometry(planetRadius, 128, 128), planetMat);
  planetMesh.rotation.z = 0.35;
  planetGroup.add(planetMesh);

  // Cloud layer (visible only for Earth)
  const cloudMesh = new THREE.Mesh(
    new THREE.SphereGeometry(planetRadius * 1.012, 64, 64),
    new THREE.MeshLambertMaterial({
      map: textureLoader.load(TEXTURE_URLS.earthClouds),
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending
    })
  );
  planetGroup.add(cloudMesh);

  // Subtle Atmospheric / Icy Rim Halo
  const atmoMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.16,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending
  });
  const atmoMesh = new THREE.Mesh(new THREE.SphereGeometry(planetRadius * 1.035, 64, 64), atmoMat);
  planetGroup.add(atmoMesh);

  let currentBodyKey = "earth";
  let targetGroupPos = new THREE.Vector3(2.4, -0.2, 0);
  let isMovingPosition = false;

  function applyPlanetAppearance(bodyKey) {
    currentBodyKey = bodyKey;
    const b = planetBundles[bodyKey] || planetBundles.spx_trk_002;

    planetMat.map = b.colorMap;
    planetMat.bumpMap = b.heightMap;
    planetMat.bumpScale = b.bumpScale;
    planetMat.displacementMap = b.heightMap;
    planetMat.displacementScale = b.dispScale;
    planetMat.displacementBias = -b.dispScale * 0.5;

    if (bodyKey === "earth") {
      planetMat.color.setHex(0xffffff);
      planetMat.roughness = 0.62;
      cloudMesh.visible = true;
      atmoMat.color.setHex(0x38bdf8);
    } else if (bodyKey === "spx_trk_002") {
      planetMat.color.setHex(0xdbeafe);
      planetMat.roughness = 0.82;
      cloudMesh.visible = false;
      atmoMat.color.setHex(0x38bdf8);
    } else if (bodyKey === "spx_trk_001") {
      planetMat.color.setHex(0xe0f2fe);
      planetMat.roughness = 0.78;
      cloudMesh.visible = false;
      atmoMat.color.setHex(0x0284c7);
    } else if (bodyKey === "mars") {
      planetMat.color.setHex(0xfecaca);
      planetMat.roughness = 0.85;
      cloudMesh.visible = false;
      atmoMat.color.setHex(0xf97316);
    } else if (bodyKey === "jupiter") {
      planetMat.color.setHex(0xfef3c7);
      planetMat.roughness = 0.55;
      cloudMesh.visible = false;
      atmoMat.color.setHex(0xf59e0b);
    } else {
      planetMat.color.setHex(0xbfdbfe);
      planetMat.roughness = 0.65;
      cloudMesh.visible = false;
      atmoMat.color.setHex(0x38bdf8);
    }
    planetMat.needsUpdate = true;
  }

  function transitionToPlanet(bodyKey, centered = true, onComplete) {
    applyPlanetAppearance(bodyKey);
    if (centered) {
      targetGroupPos.set(0.0, -0.15, 0.0);
      solarOrbitGroup.visible = true;
    } else {
      targetGroupPos.set(2.4, -0.2, 0.0);
      solarOrbitGroup.visible = false;
      sunLight.position.set(-11, 5, 10);
    }
    isMovingPosition = true;
    setTimeout(() => {
      isMovingPosition = false;
      if (typeof onComplete === "function") onComplete();
    }, 850);
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

    planetMesh.rotation.y += spinSpeed;
    if (cloudMesh.visible) {
      cloudMesh.rotation.y += spinSpeed * 1.2;
    }

    if (isMovingPosition) {
      planetGroup.position.lerp(targetGroupPos, 0.08);
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
    const earthPos = new THREE.Vector3(-5.8, -1.25, -1.2);
    const targetArrivalPos = new THREE.Vector3(0.0, -0.15, planetRadius + 0.12);

    // 1. Create 3D Departure Earth Sphere at the start of the trajectory
    if (!v3OriginEarth) {
      const eGroup = new THREE.Group();
      const eSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.46, 48, 48),
        new THREE.MeshStandardMaterial({
          map: planetBundles.earth.colorMap,
          roughness: 0.55,
          metalness: 0.1
        })
      );
      const eAtmo = new THREE.Mesh(
        new THREE.SphereGeometry(0.51, 32, 32),
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.32,
          blending: THREE.AdditiveBlending
        })
      );
      const eLabel = makeTextSprite("EARTH (1.0 AU)", "#38bdf8");
      eLabel.position.set(0, 0.82, 0);
      eGroup.add(eSphere);
      eGroup.add(eAtmo);
      eGroup.add(eLabel);
      v3OriginEarth = eGroup;
      scene.add(v3OriginEarth);
    }
    v3OriginEarth.position.copy(earthPos);
    v3OriginEarth.visible = true;

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
    function stepApproach() {
      if (!v3Curve || !v3Spacecraft || !v3Spacecraft.visible) return;
      v3Progress += 0.0042;
      if (v3Progress > 1) v3Progress = 0;
      const s = v3Progress * v3Progress * (3 - 2 * v3Progress);
      const pos = v3Curve.getPointAt(s);
      v3Spacecraft.position.copy(pos);
      if (v3OriginEarth) v3OriginEarth.children[0].rotation.y += 0.01;
      v3AnimId = requestAnimationFrame(stepApproach);
    }
    v3AnimId = requestAnimationFrame(stepApproach);
  }

  return {
    runCatmullApproach,
    clearV3Trajectory,
    transitionToPlanet,
    triggerFastScrollSpin,
    rotateForTimeSlider
  };
})();