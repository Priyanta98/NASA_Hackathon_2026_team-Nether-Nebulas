# SPHEREx ChronoSky — Master System Specification & Multi-Model Generation Prompt (v2: Validation-First & Motion-Corrected Spectra Edition)

Copy and paste **Part 1 + Part 2** into your multi-model pipeline as the **Shared System Context**, then run the **4 Batch Prompts** in **Part 3**. This v2 specification integrates the **Credibility & Validation Layer**, the **3 Hero Moments** (Known-Object Recovery, Motion-Corrected LVF Spectra, and Serendipity/Devil's Advocate Vetting), and the corrected solar-elongation parallax geometry.

---

## PART 1: MASTER SYSTEM PROMPT (FEED TO ALL MODELS AS SHARED CONTEXT)

```text
You are a Principal Astroinformatics & Full-Stack Engineer building "SPHEREx ChronoSky", an interactive 3D web application and validation-first moving-object & spectrophotometric discovery workbench for the NASA Hackathon.

### 1. SCIENTIFIC SCOPE, MISSION INTEGRITY & "VALIDATE BEFORE YOU EXPLORE" PHILOSOPHY
- Persistent Non-Dismissable Disclaimer (on every view & exported report):
  "This application visualizes temporal changes, motion-corrected infrared spectrophotometry, and candidate moving objects across multi-epoch NASA/IPAC SPHEREx observations. It does not claim the discovery of Planet Nine nor imply that SPHEREx is dedicated to Planet Nine detection."
- Never use the word "Discovery" for unconfirmed candidates. Frame coverage overlays strictly as: "What parameter space (brightness, velocity, distance) can this SPHEREx dataset constrain or rule out?"
- Organize the user experience around THREE HERO MOMENTS:
  - Hero 1 (Credibility & Validation): Recover a known Solar System body (asteroid/Centaur/TNO via IMCCE SkyBoT), display the pipeline's empirical recall rate, plot the Synthetic Injection Completeness Map (Velocity vs. Brightness/Distance), and calibrate tier promotion using a Time-Scrambled Null Test (false-alarm rate per deg^2).
  - Hero 2 (Motion-Corrected LVF Spectrophotometry): Because SPHEREx's Linear Variable Filters (LVFs) sample different wavelengths at different exposure times (t_i), a moving object's spectrum gets smeared if extracted at fixed (RA, Dec). Reconstruct the candidate's 0.75-5.0 um spectrum by shifting the extraction aperture along its predicted trajectory (RA(t_i), Dec(t_i)) at each exposure's timestamp and evaluating `WCS-WAVE` (key="W", sip=None).
  - Hero 3 (Serendipity Feed & Devil's Advocate Evidence Card): Rank unusual spectrophotometric and morphological outliers via `IsolationForest`, and pair every candidate with a "Devil's Advocate Panel" that explicitly quantifies falsification probabilities for 5 artifacts (Cosmic Ray, Detector Persistence, Optical Ghost, High-Proper-Motion Star, Zodiacal Residual) plus a SHA-256-hashed Evidence Card.

### 2. AUTHORITATIVE NASA/IPAC SPHEREx API & FITS SPECIFICATIONS
1. IRSA SIA v2 Endpoint (`https://irsa.ipac.caltech.edu/SIA`):
   - Public API — NO API key required.
   - Collections: `spherex_qr2` (Wide baseline), `spherex_qr3` (Latest Wide), `spherex_qr2_deep` (Deep baseline), `spherex_qr3_deep` (Latest Deep).
   - Query format: `GET https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_qr2&POS=circle+{ra_deg}+{dec_deg}+{radius_deg}&RESPONSEFORMAT=CSV`
2. IRSA On-Premises Cutout Service (`https://irsa.ipac.caltech.edu/ibe/cutouts.html`):
   - Append `?center={ra_deg},{dec_deg}&size={size_deg}` to any on-prem `access_url` to fetch fast server-side multi-extension FITS cutouts.
   - Offline Safety: Always cache loaded cutouts and ship a pre-cached multi-epoch benchmark bundle in `data/cached_demo/` so all 3 Hero Moments work instantaneously even if IRSA is unreachable during judging.
3. SPHEREx Level 2 Multi-Extension FITS (MEF) Structure (6 Extensions, ~6.15 arcsec/pixel):
   - HDU 0 (`PRIMARY`): Primary header.
   - HDU 1 (`IMAGE`): Calibrated surface brightness in `MJy / sr` (float32, zodiacal light NOT subtracted).
   - HDU 2 (`FLAGS`): 32-bit int bitmap (`MP_TRANSIENT=0`, `MP_OVERFLOW=1`, `MP_SUR_ERROR=2`, `MP_PHANTOM=4`, `MP_REFERENCE=5`, `MP_NONFUNC=6`, `MP_DICHROIC=7`, `MP_MISSING_DATA=9`, `MP_HOT=10`, `MP_COLD=11`, `MP_FULLSAMPLE=12`, `MP_PHANMISS=14`, `MP_NONLINEAR=15`, `MP_PERSIST=17`, `MP_OUTLIER=19`, `MP_SOURCE=21`).
   - HDU 3 (`VARIANCE`): Per-pixel variance in `(MJy / sr)^2` (float32).
   - HDU 4 (`ZODI`): Modeled zodiacal dust background in `MJy / sr` (float32). Always compute `IMAGE - ZODI` prior to differencing.
   - HDU 5 (`PSF`): 101x101x121 super-resolution Point Spread Function cube across an 11x11 detector grid.
   - HDU 6 (`WCS-WAVE`): Evaluated via `WCS(header=hdulist["IMAGE"].header, fobj=hdulist, key="W")` with `spectral_wcs.sip = None` to obtain per-pixel central wavelength (um) and bandwidth (um).
4. SPHEREx 6 Detector LVF Bands:
   - Band 1: 0.75-1.09 um (R=39) | Band 2: 1.10-1.62 um (R=41) | Band 3: 1.63-2.41 um (R=41)
   - Band 4: 2.42-3.82 um (R=35) | Band 5: 3.83-4.41 um (R=112) | Band 6: 4.42-5.00 um (R=128)

### 3. CORRECTED ASTROMETRIC PHYSICS & CONTINUOUS DISTANCE BINS
- Full Solar-Elongation Parallax & Keplerian Geometry (`estimate_heliocentric_distance_range_au`):
  - SPHEREx observes near solar elongation ~90 deg (great-circle scan). At ~500 AU, reflex parallax is ~6-7 arcsec/day (~1 SPHEREx pixel/day).
  - Never report a single exact AU number! Always propagate centroid + WCS astrometric uncertainty (`sigma_arcsec`) and solar elongation angle (`elongation_deg`) to return a 68% confidence interval `[d_min_au, d_median_au, d_max_au]`.
- Complete, Gap-Free Dynamical Regime Bins:
  1. `2 - 5 AU`: Main-Belt / Jupiter Trojan Regime
  2. `5 - 30 AU`: Centaur / Giant-Planet Crossing Regime
  3. `30 - 50 AU`: Classical Kuiper Belt / Plutino Regime
  4. `50 - 100 AU`: Scattered Disk / Detached Object Regime (CRITICAL: do not skip 50-100 AU!)
  5. `100 - 1000+ AU`: Sednoid / Inner Oort / Extreme Trans-Neptunian Regime
```

---

## PART 2: STRICT INTER-FILE DATA CONTRACTS (DO NOT ALTER NAMES)

Every model generating code MUST obey these exact file paths, class names, and dictionary schemas so all files integrate without import errors:

### 1. Standard Observation Dict Schema
Returned by `SPHERExClient.query_observations_by_position()`:
```python
{
    "obs_id": str,
    "ra": float,              # 0.0 to 360.0 deg
    "dec": float,             # -90.0 to 90.0 deg
    "t_min": float,           # MJD
    "t_max": float,           # MJD
    "collection": str,        # e.g. "spherex_qr2" or "spherex_qr3"
    "access_url": str,
    "cutout_url": str,
    "dataproduct_type": str,
    "s_fov": float,
    "s_resolution": float,    # arcsec (~6.15 for SPHEREx)
    "solar_elongation_deg": float,
    "instrument_name": str,
    "calib_level": int,
    "target_name": str,
    "detector_band": int,     # 1 to 6
    "flux": float
}
```

### 2. Standard Candidate / Tracklet Dict Schema
Returned by `MovingObjectDetector`, `MLDetector`, and stored in `TrackletDatabase`:
```python
{
    "candidate_id": str,                     # e.g. "SPX-TRK-001"
    "obs_id1": str,
    "obs_id2": str,
    "ra1": float,
    "dec1": float,
    "ra2": float,
    "dec2": float,
    "t_min1": float,
    "t_min2": float,
    "flux1": float,
    "flux2": float,
    "motion_angular_velocity": float,        # arcsec / day
    "motion_velocity_err": float,            # arcsec / day (1-sigma uncertainty)
    "motion_pa_deg": float,                  # position angle (deg)
    "significance": float,                   # delta SNR (sigma)
    "positional_uncertainty": float,         # arcsec (1-sigma ellipse radius)
    "distance_au_min": float,                # 68% CI lower bound (AU)
    "distance_au_median": float,             # Median estimate (AU)
    "distance_au_max": float,                # 68% CI upper bound (AU)
    "dynamical_regime": str,                 # Includes 50-100 AU Scattered Disk bin
    "static_spectrum_fluxes": list[float],   # Uncorrected fixed-coord fluxes (smeared)
    "motion_corrected_wavelengths_um": list[float], # Hero 2: LVF wavelengths along track
    "motion_corrected_fluxes_mjy_sr": list[float],  # Hero 2: Reconstructed track fluxes
    "motion_corrected_flux_errs": list[float],
    "spectral_ice_class": str,               # e.g. "H2O/CH4 Icy Surface Candidate"
    "psf_correlation": float,                # Stage 1 score (0..1)
    "isolation_anomaly_score": float,        # Stage 2 serendipity/outlier score (0..1)
    "supervised_prob": float,                # Stage 3 ensemble score (0..1)
    "ensemble_confidence_pct": float,        # Combined 0..100%
    "false_alarm_p_value": float,            # Calibrated against Time-Scrambled Null Test
    "devils_advocate_probs": {               # Hero 3: Falsification breakdown
        "cosmic_ray_prob": float,
        "persistence_prob": float,
        "optical_ghost_prob": float,
        "proper_motion_star_prob": float,
        "zodi_residual_prob": float,
        "genuine_mover_prob": float
    },
    "evidence_card": {                       # Hero 3: Reproducible provenance card
        "flags_hex": str,
        "active_flag_names": list[str],
        "catalog_queried_utc": str,
        "data_sha256": str,
        "cutout_b64": str
    },
    "promotion_tier": int,                   # 1, 2, or 3 (gated by Null Test FAR)
    "promotion_badge": str,
    "is_known_object": bool,
    "catalog_match_name": str,
    "cross_archive_matches": dict,           # {"neowise": str, "panstarrs": str, "gaia_dr3_pm": float}
    "light_curve": list[dict],               # [{"mjd": float, "flux": float, "err": float}]
    "orbit_fit_points": list[dict],          # [{"mjd": float, "ra": float, "dec": float, "x_au": float, "y_au": float, "z_au": float}]
    "human_vetting_labels": list[dict],      # Blink Quest active-learning labels
    "annotations": list[dict]
}
```

### 3. Validation Benchmark Dict Schema
Returned by `PipelineValidator.run_validation_suite()` in `src/validation/validator.py`:
```python
{
    "known_object_recovery": {
        "tested_count": int,
        "recovered_count": int,
        "recall_rate_pct": float,
        "recovered_objects": list[dict]      # Known SkyBoT asteroids/Centaurs recovered
    },
    "completeness_heatmap": {
        "velocity_bins_arcsec_day": list[float],
        "snr_bins": list[float],
        "distance_bins_au": list[str],       # ["2-5 AU", "5-30 AU", "30-50 AU", "50-100 AU", "100-500+ AU"]
        "recovery_matrix_pct": list[list[float]],
        "50pct_completeness_limit_mjy_sr": float
    },
    "null_test_results": {
        "scrambled_trials": int,
        "false_alarms_detected": int,
        "far_per_sq_deg": float,
        "tier2_promotion_snr_threshold": float
    }
}
```

### 4. Exact Module & Class Map (12 Files)
1. `src/config/settings.py` $\to$ `class Settings`
2. `src/api/spherex_client.py` $\to$ `class SPHERExClient`
3. `src/io/fits_handler.py` $\to$ `class FITSProcessor`
4. `src/processing/image_processor.py` $\to$ `class ImageProcessor`
5. `src/detection/moving_object.py` $\to$ `class MovingObjectDetector`
6. `src/detection/ml_detector.py` $\to$ `class MLDetector`
7. `src/validation/validator.py` $\to$ `class PipelineValidator` *(NEW: Credibility Layer)*
8. `src/catalog/crossmatch.py` $\to$ `class CatalogCrossMatcher`
9. `src/db/database.py` $\to$ `class TrackletDatabase`
10. `src/viz/reports.py` $\to$ `class ReportGenerator`
11. `backend/main.py` $\to$ `app = FastAPI(...)` + Continuous Evaluator `asyncio` worker
12. `frontend/index.html`, `frontend/style.css`, `frontend/globe3d.js`, `frontend/app.js`

---

## PART 3: 4 BATCH PROMPTS TO RUN IN YOUR MULTI-MODEL PIPELINE

Send **Part 1 + Part 2** above as system context, then execute these **4 Batch Prompts**:

### Batch Prompt 1 — Core Data, FITS, Motion-Corrected Spectra & Image Processing (`src/config`, `src/api`, `src/io`, `src/processing`)
> Using the Master System Specification (v2) and Data Contracts, generate the complete, production-ready Python code for:
> 1. `src/config/settings.py` (`Settings` class with IRSA SIA2 URLs, SPHEREx Bands 1-6, `FLAGS` bitmask constants, gap-free dynamical distance bins including `50-100 AU Scattered Disk`, MongoDB URI, and offline demo cache path `data/cached_demo/`).
> 2. `src/api/spherex_client.py` (`SPHERExClient` querying `https://irsa.ipac.caltech.edu/SIA`, building cutout URLs, computing coverage & sensitivity constraint maps, and providing an automatic offline cached benchmark fallback).
> 3. `src/io/fits_handler.py` (`FITSProcessor` reading all 6 SPHEREx MEF extensions `IMAGE`, `FLAGS`, `VARIANCE`, `ZODI`, `PSF`, `WCS-WAVE` `key="W"`, `sip=None`, plus `inject_synthetic_sources()` for completeness testing and `generate_synthetic_mef_sequence()`).
> 4. `src/processing/image_processor.py` (`ImageProcessor` implementing WCS reprojection, `IMAGE - ZODI` subtraction, `FLAGS` bitmask cleaning, inverse-variance `ΔSNR` difference imaging, `create_color_composite()`, `create_light_curve()`, and **Hero 2: `reconstruct_motion_corrected_spectrum()`** which shifts the extraction aperture along the moving object's predicted `(RA(t_i), Dec(t_i))` track across multi-band exposures and compares it against the smeared static-coordinate spectrum).
> Write complete, syntax-verified Python code with zero placeholders.

### Batch Prompt 2 — Astrometry, Hybrid ML Ensemble, Devil's Advocate & Credibility Validator (`src/detection`, `src/validation`, `src/catalog`)
> Using the Master System Specification (v2) and Data Contracts, generate the complete, production-ready Python code for:
> 1. `src/detection/moving_object.py` (`MovingObjectDetector` with 3D `KDTree` epoch linking, dipole pair matching, astrometric uncertainty ellipses, `fit_preliminary_orbit()`, and `estimate_heliocentric_distance_range_au()` using full solar-elongation viewing geometry and astrometric error propagation to output `[distance_au_min, distance_au_median, distance_au_max]` across all 5 dynamical bins including `50-100 AU`).
> 2. `src/detection/ml_detector.py` (`MLDetector` implementing the **3-Stage Hybrid Ensemble**: 2D PSF-Dipole matched filter + unsupervised `IsolationForest` Serendipity scorer + soft-voting `HistGradientBoostingClassifier` + `RandomForestClassifier` + `ExtraTreesClassifier` auto-pretrained on startup via Synthetic Source Injection, **Hero 3: `compute_devils_advocate_probabilities()`** [cosmic ray, persistence, ghost, proper-motion star, zodi residual], `build_evidence_card()` with SHA-256 hash, and `update_with_human_labels()` for Blink Quest active learning).
> 3. `src/validation/validator.py` (`PipelineValidator` implementing **Hero 1**: `run_known_object_recovery()` against SkyBoT movers, `run_synthetic_completeness_grid()` returning a 2D velocity-vs-SNR/distance recovery matrix, and `run_time_scrambled_null_test()` computing the empirical false-alarm rate per sq deg to set Tier 2/3 promotion thresholds).
> 4. `src/catalog/crossmatch.py` (`CatalogCrossMatcher` querying SIMBAD, IMCCE SkyBoT/MPC, and cross-archive WISE/NEOWISE, Pan-STARRS, and Gaia DR3 proper motion checks, plus `classify_lvf_spectrum()`).

### Batch Prompt 3 — Continuous Evaluator, MongoDB (`2dsphere`) & Reports (`src/db`, `src/viz`, `backend`)
> Using the Master System Specification (v2) and Data Contracts, generate the complete, production-ready Python code for:
> 1. `src/db/database.py` (`TrackletDatabase` with dual-mode MongoDB Atlas `2dsphere` index + automatic local JSON/SQLite fallback, supporting `upsert_tracklet()`, `cone_search_tracklets()`, Null-Test-calibrated 3-Tier Bayesian Tracklet Promotion, Serendipity Feed queries, and `record_blink_quest_vote()`).
> 2. `src/viz/reports.py` (`ReportGenerator` exporting JSON, CSV, IVOA VOTable, 80-column MPC format, and standalone HTML Evidence Cards with Devil's Advocate probabilities and SHA-256 data hashes).
> 3. `backend/main.py` (FastAPI server mounting `frontend/`, running the async Continuous Background Evaluator loop, and exposing `/api/observations`, `/api/validate-pipeline` [Hero 1], `/api/analyze-region` [Hero 2 & 3], `/api/serendipity-feed`, `/api/blink-quest-vote`, `/api/watchlist`, and `/api/export`).

### Batch Prompt 4 — Interactive 3D Website Frontend Arranged Around the 3 Hero Moments (`frontend/`)
> Using the Master System Specification (v2) and Data Contracts, generate the complete, production-ready frontend files:
> 1. `frontend/index.html` & `frontend/style.css` (Space-grade dark UI featuring the persistent scientific disclaimer banner and a 3-Hero-Moment workflow:
>    - **Hero Tab 1 — Credibility & Coverage Constraint Lab**: Known-Object Recovery scorecard, Synthetic Completeness Heatmap ("What SPHEREx Can Rule Out"), Time-Scrambled Null Test FAR meter, and Mollweide All-Sky Coverage Constraint Selector.
>    - **Hero Tab 2 — Motion-Corrected LVF Spectrum & Deep-Time Blink**: Side-by-side comparison of Smeared Static Spectrum vs. Motion-Corrected Track Spectrum (0.75-5.0 um with H2O/CH4 ice bands), Alpha-Blend Blink Comparator + NEOWISE/Pan-STARRS Deep-Time toggle, and Multi-Epoch Light Curve.
>    - **Hero Tab 3 — Serendipity Feed, Devil's Advocate Card & Blink Quest**: IsolationForest Serendipity ranking, 5-bar Devil's Advocate falsification breakdown, SHA-256 Evidence Card, and gamified "Blink Quest" active-learning human vetting buttons).
> 2. `frontend/globe3d.js` & `frontend/app.js` (Three.js 3D scene rendering Earth's orbit, Sun vector, SPHEREx sightline cones, 3D Celestial Sphere, and preliminary 3D orbit fits with uncertainty bands; URL query-string deep links; and async `fetch('/api/...')` integration).