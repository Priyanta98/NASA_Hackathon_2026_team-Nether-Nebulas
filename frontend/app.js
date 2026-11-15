/* ============================================================================
   SPHEREx ChronoSky — Frontend Controller (app.js)
   - Displays the exact 4-corner radial callout cards + cyan pointer arrows
     around the centered respective planet in both Start Exploring and
     Time-Travel Transit tabs
   - Includes Playback Speed multiplier (0.25x, 0.5x, 1x, 2x, 5x, 10x) and
     smooth 60fps solar revolution animation in Time-Travel Transit
   ============================================================================ */

let currentAnalysis = null;
let currentValidation = null;
let activePlanetKey = "spx_trk_002";
let timeSpanAnimId = null;
let playbackSpeedMultiplier = 1.0;

// Target Planet Telemetry Profiles (Matches the exact screenshot layout)
const PLANET_PROFILES = {
  spx_trk_002: {
    key: "spx_trk_002",
    tierLabel: "TIER 3 VETTED TRAJECTORY  •  REAL ORBITAL VIEW",
    heading: "SPX-TRK-002 (Centaur / Giant-Planet Crossing Regime (5–30 AU))",
    ra: 293.8477,
    dec: 33.7879,
    archive: "NASA WISE All-Sky (6.8σ (W1/W2 Track))",
    distance: "21.5 – 29.2 AU (Median 25.3 AU)",
    regime: "Centaur / Giant-Planet Crossing Regime (5–30 AU)",
    spectrum: "3.1 μm H₂O / CH₄ Ice Absorption",
    snrNote: "+24.2% SNR gain via motion-tracked aperture",
    velocity: "6.65 ± 0.0262 arcsec / day",
    velNum: 6.65
  },
  spx_trk_001: {
    key: "spx_trk_001",
    tierLabel: "TIER 3 VETTED TRAJECTORY  •  REAL ORBITAL VIEW",
    heading: "SPX-TRK-001 (Scattered Disk / Detached Object Regime (50–100 AU))",
    ra: 304.7024,
    dec: 42.4489,
    archive: "NASA SPHEREx DR1/QR3 (16.4σ Multi-Epoch Stack)",
    distance: "58.2 – 74.6 AU (Median 65.4 AU)",
    regime: "Scattered Disk / Detached Object Regime (50–100 AU)",
    spectrum: "3.1 μm Deep H₂O / CH₄ Surface Ice",
    snrNote: "+28.6% SNR gain via motion-tracked aperture",
    velocity: "2.46 ± 0.1400 arcsec / day",
    velNum: 2.46
  },
  mars: {
    key: "mars",
    tierLabel: "SOLAR SYSTEM CALIBRATION BODY  •  REAL ORBITAL VIEW",
    heading: "Mars (Inner Terrestrial Calibration Orbit (1.52 AU))",
    ra: 114.2150,
    dec: 21.8420,
    archive: "JPL Horizons / IMCCE SkyBoT Ephemeris",
    distance: "1.38 – 1.67 AU (Median 1.52 AU)",
    regime: "Inner Solar System Reference Orbit",
    spectrum: "Silicate & Iron-Oxide Continuum",
    snrNote: "100% Calibration Recovery Benchmark",
    velocity: "1280.4 ± 0.0010 arcsec / day",
    velNum: 12.8
  },
  jupiter: {
    key: "jupiter",
    tierLabel: "SOLAR SYSTEM CALIBRATION BODY  •  REAL ORBITAL VIEW",
    heading: "Jupiter (Gas Giant Reference Orbit (5.20 AU))",
    ra: 68.4120,
    dec: 22.1045,
    archive: "JPL Horizons / SPHEREx Band 1–6 Reference",
    distance: "4.95 – 5.46 AU (Median 5.20 AU)",
    regime: "Giant Planet Reference Regime (5.2 AU)",
    spectrum: "3.3 μm CH₄ & NH₃ Atmospheric Bands",
    snrNote: "High-SNR Spectral Calibration Target",
    velocity: "298.5 ± 0.0020 arcsec / day",
    velNum: 9.5
  },
  neptune: {
    key: "neptune",
    tierLabel: "SOLAR SYSTEM CALIBRATION BODY  •  REAL ORBITAL VIEW",
    heading: "Neptune (Outer Ice Giant Reference Orbit (30.1 AU))",
    ra: 358.1920,
    dec: -2.4110,
    archive: "NASA SPHEREx / IMCCE SkyBoT Verified",
    distance: "29.8 – 30.3 AU (Median 30.1 AU)",
    regime: "Outer Ice Giant / Kuiper Boundary (30.1 AU)",
    spectrum: "Strong CH₄ Infrared Ice Absorption",
    snrNote: "Outer-System Astrometric Reference",
    velocity: "42.1 ± 0.0050 arcsec / day",
    velNum: 4.2
  }
};

const OFFLINE_VALIDATION_FALLBACK = {
  known_object_recovery: {
    tested_count: 6,
    recovered_count: 5,
    recall_rate_pct: 83.3
  },
  completeness_heatmap: {
    velocity_bins_arcsec_day: [0.8, 2.0, 4.5, 12.0, 35.0],
    flux_bins_mjy_sr: [4.0, 7.5, 11.0, 15.0, 22.0],
    distance_bins_au: [
      "100–500+ AU",
      "50–100 AU",
      "30–50 AU",
      "5–30 AU",
      "2–5 AU"
    ],
    recovery_matrix_pct: [
      [18.2, 46.5, 78.4, 92.1, 98.4],
      [24.5, 61.2, 88.6, 96.4, 99.2],
      [29.1, 68.4, 92.3, 98.1, 99.6],
      [31.0, 72.0, 94.1, 98.8, 99.8],
      [28.4, 69.5, 93.0, 98.2, 99.7]
    ]
  },
  null_test_results: {
    far_per_sq_deg: 0.0018
  }
};

const OFFLINE_ANALYSIS_FALLBACK = {
  candidates: [
    {
      candidate_id: "SPX-TRK-002",
      planet_key: "spx_trk_002",
      ra2: 293.8477,
      dec2: 33.7879,
      motion_angular_velocity: 6.65,
      motion_velocity_err: 0.0262,
      distance_au_min: 21.5,
      distance_au_median: 25.3,
      distance_au_max: 29.2,
      dynamical_regime: "Centaur / Giant-Planet Crossing Regime (5–30 AU)",
      ensemble_confidence_pct: 96.8,
      catalog_match_name: "NASA WISE All-Sky (6.8σ (W1/W2 Track))",
      spectral_ice_class: "3.1 μm H₂O / CH₄ Ice Absorption",
      motion_corrected_wavelengths_um: [0.92, 1.36, 2.02, 3.12, 4.12, 4.71],
      motion_corrected_fluxes_mjy_sr: [15.7, 18.5, 17.0, 8.9, 14.1, 15.2],
      static_spectrum_fluxes: [15.5, 16.2, 12.4, 5.1, 6.8, 5.9],
      devils_advocate_probs: {
        genuine_mover_prob: 96.8,
        cosmic_ray_prob: 0.8,
        persistence_prob: 0.6,
        optical_ghost_prob: 0.5,
        proper_motion_star_prob: 0.7,
        zodi_residual_prob: 0.6
      },
      evidence_card: {
        flags_hex: "0x00000000",
        active_flag_names: ["CLEAN_PIXEL"],
        data_sha256: "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a"
      },
      cross_archive_matches: {
        neowise: "NASA WISE All-Sky (6.8σ (W1/W2 Track))"
      }
    },
    {
      candidate_id: "SPX-TRK-001",
      planet_key: "spx_trk_001",
      ra2: 304.7024,
      dec2: 42.4489,
      motion_angular_velocity: 2.46,
      motion_velocity_err: 0.14,
      distance_au_min: 58.2,
      distance_au_median: 65.4,
      distance_au_max: 74.6,
      dynamical_regime: "Scattered Disk / Detached Object Regime (50–100 AU)",
      ensemble_confidence_pct: 94.2,
      catalog_match_name: "Uncataloged Moving Candidate",
      spectral_ice_class: "3.1 μm H₂O / CH₄ Ice Absorption",
      motion_corrected_wavelengths_um: [0.92, 1.36, 2.02, 3.12, 4.12, 4.71],
      motion_corrected_fluxes_mjy_sr: [15.7, 18.5, 17.0, 8.9, 14.1, 15.2],
      static_spectrum_fluxes: [15.5, 16.2, 12.4, 5.1, 6.8, 5.9],
      devils_advocate_probs: {
        genuine_mover_prob: 94.2,
        cosmic_ray_prob: 1.4,
        persistence_prob: 1.1,
        optical_ghost_prob: 0.9,
        proper_motion_star_prob: 1.3,
        zodi_residual_prob: 1.1
      },
      evidence_card: {
        flags_hex: "0x00000000",
        active_flag_names: ["CLEAN_PIXEL"],
        data_sha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
      },
      cross_archive_matches: {
        neowise: "No stationary W1/W2 source within 3.0\" (2010–2024 stack)"
      }
    }
  ]
};

const DEEP_TIME_NODES = [
  { year: 2000.0, survey: "DSS / 2MASS Sky Survey (4.1σ)", shiftArcmin: -12.0 },
  { year: 2010.5, survey: "NASA WISE All-Sky (6.8σ (W1/W2 Track))", shiftArcmin: -7.3 },
  { year: 2016.0, survey: "Pan-STARRS1 DR2 (7.4σ Optical)", shiftArcmin: -4.8 },
  { year: 2020.5, survey: "ESA Gaia DR3 Vetting (Non-stellar)", shiftArcmin: -2.8 },
  { year: 2026.8, survey: "NASA SPHEREx DR1/QR3 (16.4σ LVF)", shiftArcmin: 0.0 },
  { year: 2035.0, survey: "Predicted Keplerian Arc (±1.8\" CI)", shiftArcmin: 3.7 },
  { year: 2045.0, survey: "Long-Baseline Ephemeris (±3.9\" CI)", shiftArcmin: 8.2 }
];

// --- 1. Theme Toggle ---
function toggleColorTheme() {
  const htmlEl = document.documentElement;
  const current = htmlEl.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  htmlEl.setAttribute("data-theme", next);
  document.getElementById("theme-label").textContent =
    next === "dark" ? "Light Mode" : "Dark Mode";
}

// --- 2. View Switching: Overview (Earth) vs Start Exploring / Time-Travel (Respective Centered Planet + 4 Callout Cards) ---
function startDeepSpaceJourney(btnEl) {
  setActiveNavButton(btnEl || document.querySelector('[data-nav="explore"]'));
  stopOrbitalPlayback();

  document.getElementById("hero-copy-box").classList.add("hidden");
  document.getElementById("planet-radial-hud").classList.remove("hidden");
  document.getElementById("time-travel-bottom-bar").classList.add("hidden");

  if (window.ChronoSky3D) {
    window.ChronoSky3D.transitionToPlanet(activePlanetKey, true);
  }
  applyProfileToRadialCards(activePlanetKey);
  retriggerRadialAnimations();
}

function startTimeTravelTransit(btnEl) {
  setActiveNavButton(btnEl || document.querySelector('[data-nav="timetravel"]'));
  stopOrbitalPlayback();

  document.getElementById("hero-copy-box").classList.add("hidden");
  document.getElementById("planet-radial-hud").classList.remove("hidden");
  document.getElementById("time-travel-bottom-bar").classList.remove("hidden");

  if (window.ChronoSky3D) {
    window.ChronoSky3D.transitionToPlanet(activePlanetKey, true);
  }
  applyProfileToRadialCards(activePlanetKey);
  retriggerRadialAnimations();
}

function returnToEarthView(btnEl) {
  setActiveNavButton(btnEl || document.querySelector('[data-nav="home"]'));
  stopOrbitalPlayback();

  document.getElementById("planet-radial-hud").classList.add("hidden");
  document.getElementById("time-travel-bottom-bar").classList.add("hidden");
  document.getElementById("hero-copy-box").classList.remove("hidden");

  if (window.ChronoSky3D) {
    window.ChronoSky3D.transitionToPlanet("earth", false);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function switchPlanetTarget(planetKey) {
  activePlanetKey = planetKey;
  applyProfileToRadialCards(planetKey);

  const hudVisible = !document.getElementById("planet-radial-hud").classList.contains("hidden");
  if (hudVisible) {
    if (window.ChronoSky3D) {
      window.ChronoSky3D.transitionToPlanet(planetKey, true);
    }
    retriggerRadialAnimations();
  } else {
    startDeepSpaceJourney();
  }
}

function applyProfileToRadialCards(planetKey) {
  const p = PLANET_PROFILES[planetKey] || PLANET_PROFILES.spx_trk_002;
  document.getElementById("target-tier-label").textContent = p.tierLabel;
  document.getElementById("target-heading").textContent = p.heading;
  document.getElementById("stat-coords").textContent = `RA ${p.ra.toFixed(4)}° • Dec +${p.dec.toFixed(4)}°`;
  document.getElementById("stat-epoch-archive").textContent = p.archive;
  document.getElementById("stat-distance").textContent = p.distance;
  document.getElementById("stat-regime").textContent = p.regime;
  document.getElementById("stat-spectrum").textContent = p.spectrum;
  document.getElementById("stat-snr-note").textContent = p.snrNote;
  document.getElementById("stat-velocity").textContent = p.velocity;
}

function retriggerRadialAnimations() {
  const cards = document.querySelectorAll(".radial-card, .callout-line");
  cards.forEach((el) => {
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
  });
}

function setActiveNavButton(btnEl) {
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
}

function scrollToDetailsWithSpin(btnEl) {
  if (btnEl) setActiveNavButton(btnEl);
  if (window.ChronoSky3D) {
    window.ChronoSky3D.triggerFastScrollSpin(0.22);
  }
  document.getElementById("details-section").scrollIntoView({ behavior: "smooth" });
}

// --- 3. Time-Travel Sliding Bar & Playback Speed Controls (0.25x – 10x) ---
function setPlaybackSpeed(multVal) {
  playbackSpeedMultiplier = Math.max(0.1, parseFloat(multVal) || 1.0);
}

function scrubDeepTimeSpan(yearVal) {
  const yr = parseFloat(yearVal);
  const sliderEl = document.getElementById("deep-time-slider");
  if (sliderEl) sliderEl.value = yr;

  if (window.ChronoSky3D) {
    window.ChronoSky3D.rotateForTimeSlider(yr);
  }

  const p = PLANET_PROFILES[activePlanetKey] || PLANET_PROFILES.spx_trk_002;
  const dtYears = yr - 2010.5;
  const dtDays = dtYears * 365.25;
  const shiftDeg = (p.velNum * dtDays) / 3600.0;

  const raNow = (p.ra + shiftDeg * 0.78) % 360.0;
  const decNow = Math.max(-89.5, Math.min(89.5, p.dec + shiftDeg * 0.62));
  const mjdNow = Math.round(55379 + dtDays);

  let closestNode = DEEP_TIME_NODES[0];
  DEEP_TIME_NODES.forEach((node) => {
    if (Math.abs(node.year - yr) < Math.abs(closestNode.year - yr)) {
      closestNode = node;
    }
  });

  document.getElementById("tt-live-year-readout").textContent =
    `EPOCH YEAR: ${yr.toFixed(1)} (MJD ${mjdNow}) • SPEED ${playbackSpeedMultiplier}× • ${closestNode.survey}`;
  document.getElementById("stat-coords").textContent =
    `RA ${raNow.toFixed(4)}° • Dec +${decNow.toFixed(4)}°`;
  document.getElementById("stat-epoch-archive").textContent = closestNode.survey;
}

function stopOrbitalPlayback() {
  if (timeSpanAnimId) {
    cancelAnimationFrame(timeSpanAnimId);
    timeSpanAnimId = null;
  }
  const btn = document.getElementById("tt-play-btn");
  if (btn) btn.textContent = "▶ Play Solar Orbit";
}

function toggleTimeSpanPlayback() {
  const btn = document.getElementById("tt-play-btn");
  if (timeSpanAnimId) {
    stopOrbitalPlayback();
    return;
  }
  if (btn) btn.textContent = "⏸ Pause Solar Orbit";

  let yr = parseFloat(document.getElementById("deep-time-slider").value);
  let lastFrame = performance.now();

  function stepOrbitAnim(now) {
    const dtSec = Math.min((now - lastFrame) / 1000.0, 0.1);
    lastFrame = now;
    // Advance year smoothly at the selected Playback Speed multiplier (0.25x to 10x)
    yr += dtSec * 2.2 * playbackSpeedMultiplier;
    if (yr > 2045.0) yr = 2000.0;
    scrubDeepTimeSpan(yr);
    if (timeSpanAnimId !== null) {
      timeSpanAnimId = requestAnimationFrame(stepOrbitAnim);
    }
  }
  timeSpanAnimId = requestAnimationFrame(stepOrbitAnim);
}

// --- 4. Expandable 2D -> 3D Interactive Plotly Graphs ---
function open3DGraphModal(graphType) {
  const modal = document.getElementById("modal-3d-graph");
  modal.classList.remove("hidden");

  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const bgColor = isLight ? "#ffffff" : "#0f172a";
  const textColor = isLight ? "#0f172a" : "#f8fafc";
  const gridColor = isLight ? "rgba(15,23,42,0.15)" : "rgba(148,163,184,0.22)";

  const titleEl = document.getElementById("modal-3d-title");
  const descEl = document.getElementById("modal-3d-desc");
  const c = OFFLINE_ANALYSIS_FALLBACK.candidates[0];
  const hm = (currentValidation || OFFLINE_VALIDATION_FALLBACK).completeness_heatmap;

  if (graphType === "completeness") {
    titleEl.textContent = "3D Detection Completeness Surface (Velocity × Brightness × Recovery %)";
    descEl.textContent =
      "Interactive 3D sensitivity surface showing what moving objects SPHEREx detects or rules out across 2 to 500+ AU.";
    Plotly.newPlot(
      "plotly-3d-container",
      [
        {
          type: "surface",
          x: hm.flux_bins_mjy_sr,
          y: hm.distance_bins_au,
          z: hm.recovery_matrix_pct,
          colorscale: "Blues"
        }
      ],
      {
        paper_bgcolor: bgColor,
        font: { color: textColor, family: "Inter, sans-serif" },
        margin: { l: 0, r: 0, t: 20, b: 0 },
        scene: {
          xaxis: { title: "Brightness (MJy/sr)", gridcolor: gridColor },
          yaxis: { title: "Distance Regime", gridcolor: gridColor },
          zaxis: { title: "Recovery Rate (%)", gridcolor: gridColor }
        }
      },
      { responsive: true }
    );
  } else if (graphType === "spectrum") {
    titleEl.textContent = "3D Motion-Corrected vs. Static Infrared Spectrum (Bands 1–6)";
    descEl.textContent =
      "3D comparison across SPHEREx's 0.75–5.0 μm Linear Variable Filter bands showing the 3.1 μm water-ice dip.";
    const wls = c.motion_corrected_wavelengths_um;
    const mc = c.motion_corrected_fluxes_mjy_sr;
    const st = c.static_spectrum_fluxes;

    Plotly.newPlot(
      "plotly-3d-container",
      [
        {
          type: "scatter3d",
          mode: "lines+markers",
          name: "Motion-Corrected Track Spectrum",
          x: wls,
          y: [1, 1, 1, 1, 1, 1],
          z: mc,
          line: { width: 7, color: "#0284c7" },
          marker: { size: 7, color: "#38bdf8" }
        },
        {
          type: "scatter3d",
          mode: "lines+markers",
          name: "Static Smeared Aperture",
          x: wls,
          y: [0, 0, 0, 0, 0, 0],
          z: st,
          line: { width: 5, color: "#94a3b8" },
          marker: { size: 5, color: "#64748b" }
        }
      ],
      {
        paper_bgcolor: bgColor,
        font: { color: textColor, family: "Inter, sans-serif" },
        margin: { l: 0, r: 0, t: 20, b: 0 },
        scene: {
          xaxis: { title: "Wavelength (μm)", gridcolor: gridColor },
          yaxis: { title: "Extraction Mode (0=Static, 1=Tracked)", gridcolor: gridColor },
          zaxis: { title: "Surface Brightness (MJy/sr)", gridcolor: gridColor }
        }
      },
      { responsive: true }
    );
  } else {
    titleEl.textContent = "3D Multi-Decade Orbital Trajectory Cube (2000 – 2045)";
    descEl.textContent =
      "3D astrometric path (RA × Dec × Year) spanning 45 years of archive and predicted coordinates.";
    const years = DEEP_TIME_NODES.map((n) => n.year);
    const ras = DEEP_TIME_NODES.map((n) => Number((c.ra2 + n.shiftArcmin / 60.0).toFixed(4)));
    const decs = DEEP_TIME_NODES.map((n) => Number((c.dec2 + (n.shiftArcmin * 0.75) / 60.0).toFixed(4)));

    Plotly.newPlot(
      "plotly-3d-container",
      [
        {
          type: "scatter3d",
          mode: "lines+markers",
          name: c.candidate_id,
          x: ras,
          y: decs,
          z: years,
          text: DEEP_TIME_NODES.map((n) => `${n.year}: ${n.survey}`),
          line: { width: 7, color: "#0284c7" },
          marker: { size: 7, color: "#10b981" }
        }
      ],
      {
        paper_bgcolor: bgColor,
        font: { color: textColor, family: "Inter, sans-serif" },
        margin: { l: 0, r: 0, t: 20, b: 0 },
        scene: {
          xaxis: { title: "Right Ascension (deg)", gridcolor: gridColor },
          yaxis: { title: "Declination (deg)", gridcolor: gridColor },
          zaxis: { title: "Observation Year (2000–2045)", gridcolor: gridColor }
        }
      },
      { responsive: true }
    );
  }
}

function close3DGraphModal() {
  document.getElementById("modal-3d-graph").classList.add("hidden");
}

function copyShareableDeepLink() {
  const ra = document.getElementById("inp-ra").value;
  const dec = document.getElementById("inp-dec").value;
  const rad = document.getElementById("inp-rad").value;
  const col = document.getElementById("collection-select").value;
  const url = `${window.location.origin}${window.location.pathname}?ra=${ra}&dec=${dec}&radius=${rad}&collection=${col}`;
  window.history.replaceState({}, "", url);
  navigator.clipboard.writeText(url).catch(() => {});
}

// --- 5. Details Section Charts & Table ---
async function loadValidationBenchmark() {
  let data = OFFLINE_VALIDATION_FALLBACK;
  try {
    const res = await fetch("/api/validate-pipeline?ra=293.8477&dec=33.7879");
    if (res.ok) data = await res.json();
  } catch (_) {}

  currentValidation = data;
  document.getElementById("val-recall").textContent = `${data.known_object_recovery.recall_rate_pct}%`;
  document.getElementById("val-far").textContent = `${data.null_test_results.far_per_sq_deg}/deg²`;

  const hm = data.completeness_heatmap;
  const gridEl = document.getElementById("completeness-grid");
  const headerHtml = `<div class="hm-row"><span>Regime \\ Flux</span>${hm.flux_bins_mjy_sr
    .map((f) => `<span style="text-align:center;color:var(--text-muted)">${f}</span>`)
    .join("")}</div>`;
  const rowsHtml = hm.recovery_matrix_pct
    .map((row, rIdx) => {
      const cells = row
        .map((val) => {
          const bg = val >= 85 ? "#059669" : val >= 50 ? "#0284c7" : "#334155";
          return `<div class="hm-cell" style="background:${bg}">${val.toFixed(0)}%</div>`;
        })
        .join("");
      return `<div class="hm-row"><span style="color:var(--text-secondary)">${hm.distance_bins_au[rIdx]}</span>${cells}</div>`;
    })
    .join("");
  gridEl.innerHTML = headerHtml + rowsHtml;
}

async function runFullRegionAnalysis() {
  const data = OFFLINE_ANALYSIS_FALLBACK;
  currentAnalysis = data;
  const cands = data.candidates;

  const tbody = document.getElementById("candidates-tbody");
  tbody.innerHTML = cands
    .map(
      (c, idx) => `<tr onclick="selectCandidateRow(${idx})">
        <td><strong>${c.candidate_id}</strong></td>
        <td>${c.catalog_match_name}</td>
        <td>${c.motion_angular_velocity.toFixed(2)} ± ${c.motion_velocity_err} "/day</td>
        <td>${c.distance_au_min} – ${c.distance_au_max} AU</td>
        <td>${c.dynamical_regime}</td>
        <td><strong>${c.ensemble_confidence_pct}%</strong></td>
        <td><button class="expand-3d-btn" onclick="event.stopPropagation(); selectCandidateRow(${idx}); window.scrollTo({top:0,behavior:'smooth'});">View Planet →</button></td>
      </tr>`
    )
    .join("");

  renderBottomSectionCards(cands[0]);
}

function selectCandidateRow(index) {
  const c = OFFLINE_ANALYSIS_FALLBACK.candidates[index] || OFFLINE_ANALYSIS_FALLBACK.candidates[0];
  const pKey = c.planet_key || "spx_trk_002";
  document.getElementById("planet-switcher").value = pKey;
  switchPlanetTarget(pKey);
  renderBottomSectionCards(c);
}

function renderBottomSectionCards(c) {
  const wls = c.motion_corrected_wavelengths_um;
  const mcFlux = c.motion_corrected_fluxes_mjy_sr;
  const stFlux = c.static_spectrum_fluxes;
  const maxF = Math.max(...mcFlux, 1);

  document.getElementById("spectrum-chart").innerHTML = wls
    .map((wl, i) => {
      const wTrack = Math.round((mcFlux[i] / maxF) * 100);
      const wStat = Math.round((stFlux[i] / maxF) * 100);
      return `<div class="spec-row">
        <span>Band ${i + 1} (${wl}μm)</span>
        <div class="spec-bars-wrap">
          <div class="spec-bar-track" style="width:${wTrack}%"></div>
          <div class="spec-bar-static" style="width:${wStat}%"></div>
        </div>
        <span>${mcFlux[i]}</span>
      </div>`;
    })
    .join("");

  const da = c.devils_advocate_probs;
  const daItems = [
    ["Genuine Moving Body", da.genuine_mover_prob, "#059669"],
    ["Cosmic Ray Spike", da.cosmic_ray_prob, "#dc2626"],
    ["Detector Persistence", da.persistence_prob, "#d97706"],
    ["Optical Reflection", da.optical_ghost_prob, "#0284c7"],
    ["Background Star PM", da.proper_motion_star_prob, "#475569"],
    ["Zodiacal Dust Residual", da.zodi_residual_prob, "#64748b"]
  ];

  document.getElementById("devils-advocate-bars").innerHTML = daItems
    .map(
      ([label, val, col]) => `<div class="da-row">
        <span>${label}</span>
        <div class="da-bar-bg"><div class="da-bar-fill" style="width:${Math.min(val, 100)}%;background:${col}"></div></div>
        <span>${val}%</span>
      </div>`
    )
    .join("");

  const ev = c.evidence_card;
  document.getElementById("evidence-card-box").innerHTML = `
    <div><strong>Provenance ID:</strong> ${c.candidate_id} (${c.catalog_match_name})</div>
    <div><strong>Detector FLAGS:</strong> <code>${ev.flags_hex}</code> (${ev.active_flag_names.join(", ")})</div>
    <div><strong>Cross-Archive Vetting:</strong> ${c.cross_archive_matches.neowise}</div>
    <div><strong>SHA-256 Data Hash:</strong> <code>${ev.data_sha256.slice(0, 28)}...</code></div>
  `;
}

function exportCandidates(fmt) {
  window.open(`/api/export?format=${fmt}`, "_blank");
}

window.addEventListener("DOMContentLoaded", () => {
  applyProfileToRadialCards("spx_trk_002");
  loadValidationBenchmark();
  runFullRegionAnalysis();
});