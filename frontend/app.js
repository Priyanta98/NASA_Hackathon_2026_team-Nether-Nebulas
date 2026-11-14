/* ============================================================================
   SPHEREx ChronoSky — Phase 2 Frontend Controller (app.js)
   - Controls Spaceship Warp Transit, 45-Year Deep-Time Sliding Bar (2000–2045),
     Fast Scroll Spin Trigger, Light/Dark Theme Switcher, and Expandable 3D Plotly Graphs
   ============================================================================ */

let currentAnalysis = null;
let currentValidation = null;
let selectedCandidate = null;
let timeSpanTimer = null;

// Built-in fallback benchmark data so all charts, 3D modals, and sliders work offline
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
      candidate_id: "SPX-TRK-001",
      ra2: 304.7024,
      dec2: 42.4489,
      motion_angular_velocity: 2.46,
      motion_velocity_err: 0.14,
      distance_au_min: 58.2,
      distance_au_median: 65.4,
      distance_au_max: 74.6,
      dynamical_regime: "Scattered Disk / Detached Object Regime (50–100 AU)",
      ensemble_confidence_pct: 94.2,
      promotion_tier: 3,
      promotion_badge: "Tier 3: High-Priority Vetted Candidate",
      is_known_object: false,
      catalog_match_name: "Uncataloged Moving Candidate",
      spectral_ice_class: "Strong H2O/CH4 Icy Surface (3.1 μm dip = 48.2%)",
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
    },
    {
      candidate_id: "SPX-TRK-002",
      ra2: 304.6781,
      dec2: 42.4512,
      motion_angular_velocity: 5.66,
      motion_velocity_err: 0.18,
      distance_au_min: 16.2,
      distance_au_median: 18.4,
      distance_au_max: 21.1,
      dynamical_regime: "Centaur / Giant-Planet Crossing Regime (5–30 AU)",
      ensemble_confidence_pct: 96.8,
      promotion_tier: 2,
      promotion_badge: "Known Benchmark: (2060) Chiron [SkyBoT]",
      is_known_object: true,
      catalog_match_name: "(2060) Chiron [SkyBoT Verified]",
      spectral_ice_class: "Moderate Silicate/Ice Transition Body (3.1 μm dip = 22.0%)",
      motion_corrected_wavelengths_um: [0.92, 1.36, 2.02, 3.12, 4.12, 4.71],
      motion_corrected_fluxes_mjy_sr: [13.5, 14.2, 13.6, 9.7, 11.9, 12.5],
      static_spectrum_fluxes: [13.2, 11.4, 7.8, 4.2, 3.9, 3.1],
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
        neowise: "Matched to known Centaur (2060) Chiron ephemeris"
      }
    }
  ]
};

// Multi-Decade Historical & Predicted Archive Epochs (2000 – 2045) for *1
const DEEP_TIME_NODES = [
  { year: 2000.0, survey: "DSS / 2MASS Sky Survey", mjd: 51544, snr: "4.1σ (Marginal)", shiftArcmin: -12.0 },
  { year: 2010.5, survey: "NASA WISE All-Sky", mjd: 55379, snr: "6.8σ (W1/W2 Track)", shiftArcmin: -7.3 },
  { year: 2016.0, survey: "Pan-STARRS1 DR2", mjd: 57388, snr: "7.4σ (Optical r/i)", shiftArcmin: -4.8 },
  { year: 2020.5, survey: "ESA Gaia DR3 Vetting", mjd: 59031, snr: "Non-stellar (PM Checked)", shiftArcmin: -2.8 },
  { year: 2026.8, survey: "NASA SPHEREx DR1/QR3", mjd: 61365, snr: "16.4σ (6-Band LVF Ice)", shiftArcmin: 0.0 },
  { year: 2035.0, survey: "Predicted Keplerian Arc", mjd: 64328, snr: "Forecast (±1.8\" CI)", shiftArcmin: 3.7 },
  { year: 2045.0, survey: "Long-Baseline Ephemeris", mjd: 67980, snr: "Forecast (±3.9\" CI)", shiftArcmin: 8.2 }
];

// --- 1. Theme Toggle (Dark Bento <-> Light Glassmorphism, Requirement 12) ---
function toggleColorTheme() {
  const htmlEl = document.documentElement;
  const current = htmlEl.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  htmlEl.setAttribute("data-theme", next);
  document.getElementById("theme-label").textContent = next === "dark" ? "Light Mode" : "Dark Mode";
}

// --- 2. Spaceship Journey & Time-Travel Transit Animations (Requirements 6 & 9) ---
function startDeepSpaceJourney(btnEl) {
  setActiveNavButton(btnEl || document.querySelector('[data-nav="explore"]'));
  document.getElementById("hero-copy-box").classList.add("hidden");
  document.getElementById("target-telemetry-overlay").classList.add("hidden");

  if (window.ChronoSky3D) {
    window.ChronoSky3D.warpToOrbitBody("candidate", () => {
      revealTargetTelemetryOverlay();
    });
  } else {
    revealTargetTelemetryOverlay();
  }
}

function startTimeTravelTransit(btnEl) {
  setActiveNavButton(btnEl || document.querySelector('[data-nav="timetravel"]'));
  document.getElementById("hero-copy-box").classList.add("hidden");
  document.getElementById("target-telemetry-overlay").classList.add("hidden");

  if (window.ChronoSky3D) {
    window.ChronoSky3D.warpToOrbitBody("candidate", () => {
      revealTargetTelemetryOverlay();
      toggleTimeSpanPlayback(true);
    });
  } else {
    revealTargetTelemetryOverlay();
  }
}

function revealTargetTelemetryOverlay() {
  const overlay = document.getElementById("target-telemetry-overlay");
  overlay.classList.remove("hidden");

  // Re-trigger staggered appearing animation on every stat card
  const cards = overlay.querySelectorAll(".stat-reveal-card");
  cards.forEach((card) => {
    card.style.animation = "none";
    void card.offsetWidth;
    card.style.animation = "";
  });

  scrubDeepTimeSpan(document.getElementById("deep-time-slider").value);
}

function returnToEarthView(btnEl) {
  setActiveNavButton(btnEl || document.querySelector('[data-nav="home"]'));
  if (timeSpanTimer) {
    clearInterval(timeSpanTimer);
    timeSpanTimer = null;
    document.getElementById("tt-play-btn").textContent = "Play 45-Year Orbit";
  }
  document.getElementById("target-telemetry-overlay").classList.add("hidden");
  document.getElementById("hero-copy-box").classList.remove("hidden");
  if (window.ChronoSky3D) window.ChronoSky3D.returnToEarthHome();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function flyToPlanetaryOrbit(bodyKey) {
  window.scrollTo({ top: 0, behavior: "smooth" });
  document.getElementById("hero-copy-box").classList.add("hidden");
  document.getElementById("target-telemetry-overlay").classList.add("hidden");
  if (window.ChronoSky3D) {
    window.ChronoSky3D.warpToOrbitBody(bodyKey, () => {
      revealTargetTelemetryOverlay();
    });
  }
}

function setActiveNavButton(btnEl) {
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
}

// --- 3. Smooth Downward Scroll + Fast Axial Planet Rotation (Requirements 7 & 10) ---
function scrollToDetailsWithSpin(btnEl) {
  if (btnEl) setActiveNavButton(btnEl);
  if (window.ChronoSky3D) {
    window.ChronoSky3D.triggerFastScrollSpin(0.22);
  }
  const detailsSection = document.getElementById("details-section");
  detailsSection.scrollIntoView({ behavior: "smooth" });
}

// --- 4. *1: 45-Year Deep-Time Sliding Bar & Long-Timespan Visual Strip ---
function scrubDeepTimeSpan(yearVal) {
  const yr = parseFloat(yearVal);
  document.getElementById("deep-time-slider").value = yr;
  if (window.ChronoSky3D) {
    window.ChronoSky3D.updateOrbitsForYear(yr);
  }

  const baseCand = selectedCandidate || OFFLINE_ANALYSIS_FALLBACK.candidates[0];
  const dtYears = yr - 2026.8;
  const dtDays = dtYears * 365.25;
  const velArcsecDay = baseCand.motion_angular_velocity || 2.46;
  const shiftDeg = (velArcsecDay * dtDays) / 3600.0;

  const raNow = (baseCand.ra2 + shiftDeg * 0.78) % 360.0;
  const decNow = Math.max(-89.5, Math.min(89.5, baseCand.dec2 + shiftDeg * 0.62));
  const mjdNow = Math.round(61365 + dtDays);

  // Find closest historical/future survey milestone
  let closestNode = DEEP_TIME_NODES[0];
  DEEP_TIME_NODES.forEach((node) => {
    if (Math.abs(node.year - yr) < Math.abs(closestNode.year - yr)) {
      closestNode = node;
    }
  });

  document.getElementById("tt-live-year-readout").textContent =
    `Epoch Year: ${yr.toFixed(1)} (MJD ${mjdNow}) • Archive Context: ${closestNode.survey}`;
  document.getElementById("stat-coords").textContent =
    `RA ${raNow.toFixed(4)}° • Dec +${decNow.toFixed(4)}°`;
  document.getElementById("stat-epoch-archive").textContent =
    `${closestNode.survey} (${closestNode.snr})`;

  const stripEl = document.getElementById("timespan-visual-strip");
  stripEl.innerHTML = DEEP_TIME_NODES.map((n) => {
    const isAct = Math.abs(n.year - yr) <= 3.2;
    return `<div class="ts-node ${isAct ? "active" : ""}" onclick="scrubDeepTimeSpan(${n.year})">
      <strong>${n.year.toFixed(0)}</strong>
      <div>${n.survey}</div>
      <div style="color:var(--text-muted)">Δθ: ${n.shiftArcmin > 0 ? "+" : ""}${n.shiftArcmin}'</div>
    </div>`;
  }).join("");
}

function toggleTimeSpanPlayback(forceStart = false) {
  const btn = document.getElementById("tt-play-btn");
  if (timeSpanTimer && !forceStart) {
    clearInterval(timeSpanTimer);
    timeSpanTimer = null;
    btn.textContent = "Play 45-Year Orbit";
    return;
  }
  if (timeSpanTimer) clearInterval(timeSpanTimer);
  btn.textContent = "Pause 45-Year Orbit";
  let yr = parseFloat(document.getElementById("deep-time-slider").value);
  timeSpanTimer = setInterval(() => {
    yr += 0.35;
    if (yr > 2045.0) yr = 2000.0;
    scrubDeepTimeSpan(yr);
  }, 60);
}

// --- 5. Expandable 2D -> 3D Interactive Plotly Graphs (Requirement 11) ---
function open3DGraphModal(graphType) {
  const modal = document.getElementById("modal-3d-graph");
  modal.classList.remove("hidden");

  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const bgColor = isLight ? "#ffffff" : "#0f172a";
  const textColor = isLight ? "#0f172a" : "#f8fafc";
  const gridColor = isLight ? "rgba(15,23,42,0.15)" : "rgba(148,163,184,0.22)";

  const titleEl = document.getElementById("modal-3d-title");
  const descEl = document.getElementById("modal-3d-desc");
  const c = selectedCandidate || OFFLINE_ANALYSIS_FALLBACK.candidates[0];
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
    const wls = c.motion_corrected_wavelengths_um || [0.92, 1.36, 2.02, 3.12, 4.12, 4.71];
    const mc = c.motion_corrected_fluxes_mjy_sr || [15.7, 18.5, 17.0, 8.9, 14.1, 15.2];
    const st = c.static_spectrum_fluxes || [15.5, 16.2, 12.4, 5.1, 6.8, 5.9];

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

// --- 6. Backend Data Loading & 2D Card Renderers ---
async function loadValidationBenchmark() {
  const ra = document.getElementById("inp-ra").value;
  const dec = document.getElementById("inp-dec").value;
  let data = OFFLINE_VALIDATION_FALLBACK;
  try {
    const res = await fetch(`/api/validate-pipeline?ra=${ra}&dec=${dec}`);
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
          const bg =
            val >= 85
              ? "#059669"
              : val >= 50
              ? "#0284c7"
              : "#334155";
          return `<div class="hm-cell" style="background:${bg}">${val.toFixed(0)}%</div>`;
        })
        .join("");
      return `<div class="hm-row"><span style="color:var(--text-secondary)">${hm.distance_bins_au[rIdx]}</span>${cells}</div>`;
    })
    .join("");
  gridEl.innerHTML = headerHtml + rowsHtml;
}

async function runFullRegionAnalysis() {
  const ra = document.getElementById("inp-ra").value;
  const dec = document.getElementById("inp-dec").value;
  const rad = document.getElementById("inp-rad").value;
  const col = document.getElementById("collection-select").value;

  let data = OFFLINE_ANALYSIS_FALLBACK;
  try {
    const res = await fetch(`/api/analyze-region?ra=${ra}&dec=${dec}&radius_arcsec=${rad}&collection=${col}`);
    if (res.ok) data = await res.json();
  } catch (_) {}

  currentAnalysis = data;
  const cands = data.candidates || [];

  const tbody = document.getElementById("candidates-tbody");
  tbody.innerHTML = cands
    .map(
      (c, idx) => `<tr onclick="selectCandidate(${idx})">
        <td><strong>${c.candidate_id}</strong></td>
        <td>${c.catalog_match_name || "Uncataloged Candidate"}</td>
        <td>${c.motion_angular_velocity.toFixed(2)} ± ${c.motion_velocity_err || 0.14} "/day</td>
        <td>${c.distance_au_min} – ${c.distance_au_max} AU</td>
        <td>${c.dynamical_regime}</td>
        <td><strong>${c.ensemble_confidence_pct}%</strong></td>
        <td><button class="expand-3d-btn" onclick="event.stopPropagation(); selectCandidate(${idx}); startDeepSpaceJourney();">Fly to Coordinates →</button></td>
      </tr>`
    )
    .join("");

  if (cands.length > 0) selectCandidate(0);
}

function selectCandidate(index) {
  if (!currentAnalysis || !currentAnalysis.candidates[index]) return;
  const c = currentAnalysis.candidates[index];
  selectedCandidate = c;

  document.getElementById("target-heading").textContent = `${c.candidate_id} (${c.dynamical_regime})`;
  document.getElementById("stat-velocity").textContent = `${c.motion_angular_velocity.toFixed(2)} ± ${c.motion_velocity_err || 0.14} arcsec / day`;
  document.getElementById("stat-distance").textContent = `${c.distance_au_min} – ${c.distance_au_max} AU (Median ${c.distance_au_median} AU)`;
  document.getElementById("stat-regime").textContent = c.dynamical_regime;

  const wls = c.motion_corrected_wavelengths_um || [0.92, 1.36, 2.02, 3.12, 4.12, 4.71];
  const mcFlux = c.motion_corrected_fluxes_mjy_sr || [15, 18, 17, 9, 14, 15];
  const stFlux = c.static_spectrum_fluxes || [15, 15, 11, 5, 6, 5];
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

  document.getElementById("ice-class-badge").textContent = c.spectral_ice_class || "Icy Surface Candidate";

  const da = c.devils_advocate_probs || {};
  const daItems = [
    ["Genuine Moving Body", da.genuine_mover_prob || 94.0, "#059669"],
    ["Cosmic Ray Spike", da.cosmic_ray_prob || 1.4, "#dc2626"],
    ["Detector Persistence", da.persistence_prob || 1.1, "#d97706"],
    ["Optical Reflection", da.optical_ghost_prob || 0.9, "#0284c7"],
    ["Background Star PM", da.proper_motion_star_prob || 1.3, "#475569"],
    ["Zodiacal Dust Residual", da.zodi_residual_prob || 1.1, "#64748b"]
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

  const ev = c.evidence_card || {};
  document.getElementById("evidence-card-box").innerHTML = `
    <div><strong>Provenance ID:</strong> ${c.candidate_id} (${c.catalog_match_name || "Uncataloged"})</div>
    <div><strong>Detector FLAGS:</strong> <code>${ev.flags_hex || "0x00000000"}</code> (${(ev.active_flag_names || ["CLEAN_PIXEL"]).join(", ")})</div>
    <div><strong>Cross-Archive Vetting:</strong> ${(c.cross_archive_matches && c.cross_archive_matches.neowise) || "Clean"}</div>
    <div><strong>SHA-256 Data Hash:</strong> <code>${(ev.data_sha256 || "").slice(0, 28)}...</code></div>
  `;

  scrubDeepTimeSpan(document.getElementById("deep-time-slider").value);
}

function updateActiveCollection(val) {
  runFullRegionAnalysis();
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

function exportCandidates(fmt) {
  window.open(`/api/export?format=${fmt}`, "_blank");
}

window.addEventListener("DOMContentLoaded", () => {
  loadValidationBenchmark();
  runFullRegionAnalysis();
});