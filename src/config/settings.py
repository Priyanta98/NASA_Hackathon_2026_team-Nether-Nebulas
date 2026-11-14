"""
Central configuration, mission constants, bitmasks, and dynamical bins for SPHEREx ChronoSky.
Updated with all 5 official IRSA SIA2 SPHEREx collections (DR1 + QR3).
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List


class Settings:
    # Project Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    CACHED_DEMO_DIR: Path = DATA_DIR / "cached_demo"
    CACHED_DEMO_FILE: Path = CACHED_DEMO_DIR / "benchmark_epochs.json"
    LOCAL_TRACKLETS_FILE: Path = DATA_DIR / "tracklets_store.json"
    TEMP_DIR: str = str(DATA_DIR / "temp_fits")
    REPORTS_DIR: Path = BASE_DIR / "reports"

    # NASA/IPAC IRSA SIA v2 & Browsable Directories Configuration (Public — no API key required)
    IRSA_BASE_URL: str = os.environ.get("IRSA_BASE_URL", "https://irsa.ipac.caltech.edu").rstrip("/")
    IRSA_SIA2_URL: str = f"{IRSA_BASE_URL}/SIA"
    IRSA_TAP_URL: str = f"{IRSA_BASE_URL}/TAP/sync"
    IRSA_IBE_ROOT: str = f"{IRSA_BASE_URL}/ibe/data/spherex"
    MAX_REC_DEFAULT: int = 200
    IMAGE_DISPLAY_DPI: int = 120

    # Database & Continuous Background Evaluator Settings
    MONGODB_URI: str = os.environ.get("MONGODB_URI", "")
    MONGODB_DB_NAME: str = os.environ.get("MONGODB_DB_NAME", "spherex_chronosky")
    SWEEP_INTERVAL_SECONDS: int = int(os.environ.get("SWEEP_INTERVAL_SECONDS", "900"))

    # Mandatory Scientific Disclaimer
    SCIENTIFIC_DISCLAIMER: str = (
        "This application visualizes temporal changes, motion-corrected infrared spectrophotometry, "
        "and candidate moving objects across multi-epoch NASA/IPAC SPHEREx observations. "
        "It does not claim the discovery of Planet Nine nor imply that SPHEREx is dedicated "
        "to Planet Nine detection."
    )

    # Official SPHEREx Public Collections at IRSA (DR1 + QR3 + Legacy QR2 Browsable)
    COLLECTIONS: List[str] = [
        "spherex_dr1",
        "spherex_dr1_deep",
        "spherex_dr1_cube",
        "spherex_qr3",
        "spherex_qr3_deep",
        "spherex_qr2",
    ]

    # SPHEREx 6 Detector Linear Variable Filter (LVF) Bands (0.75 - 5.00 um)
    SPHEREX_BANDS: Dict[int, Dict[str, Any]] = {
        1: {"name": "Band 1 (LVF 1)", "wl_min_um": 0.75, "wl_max_um": 1.09, "wl_center_um": 0.92, "resolving_power": 39},
        2: {"name": "Band 2 (LVF 2)", "wl_min_um": 1.10, "wl_max_um": 1.62, "wl_center_um": 1.36, "resolving_power": 41},
        3: {"name": "Band 3 (LVF 3)", "wl_min_um": 1.63, "wl_max_um": 2.41, "wl_center_um": 2.02, "resolving_power": 41},
        4: {"name": "Band 4 (LVF 4)", "wl_min_um": 2.42, "wl_max_um": 3.82, "wl_center_um": 3.12, "resolving_power": 35},
        5: {"name": "Band 5 (LVF 5)", "wl_min_um": 3.83, "wl_max_um": 4.41, "wl_center_um": 4.12, "resolving_power": 112},
        6: {"name": "Band 6 (LVF 6)", "wl_min_um": 4.42, "wl_max_um": 5.00, "wl_center_um": 4.71, "resolving_power": 128},
    }

    # SPHEREx HDU 2 (FLAGS) 32-Bit Detector Bitmask Definitions
    FLAG_BITS: Dict[str, int] = {
        "MP_TRANSIENT": 0,
        "MP_OVERFLOW": 1,
        "MP_SUR_ERROR": 2,
        "MP_PHANTOM": 4,
        "MP_REFERENCE": 5,
        "MP_NONFUNC": 6,
        "MP_DICHROIC": 7,
        "MP_MISSING_DATA": 9,
        "MP_HOT": 10,
        "MP_COLD": 11,
        "MP_FULLSAMPLE": 12,
        "MP_PHANMISS": 14,
        "MP_NONLINEAR": 15,
        "MP_PERSIST": 17,
        "MP_OUTLIER": 19,
        "MP_SOURCE": 21,
    }

    BAD_ARTIFACT_BITS: List[int] = [1, 2, 4, 5, 6, 9, 10, 11, 15, 17]

    # Gap-Free Dynamical Heliocentric Distance Bins (including 50-100 AU Scattered Disk)
    DYNAMICAL_BINS: List[Dict[str, Any]] = [
        {"min_au": 0.5, "max_au": 5.0, "label": "Main-Belt / Jupiter Trojan Regime (2–5 AU)"},
        {"min_au": 5.0, "max_au": 30.0, "label": "Centaur / Giant-Planet Crossing Regime (5–30 AU)"},
        {"min_au": 30.0, "max_au": 50.0, "label": "Classical Kuiper Belt / Plutino Regime (30–50 AU)"},
        {"min_au": 50.0, "max_au": 100.0, "label": "Scattered Disk / Detached Object Regime (50–100 AU)"},
        {"min_au": 100.0, "max_au": 2000.0, "label": "Sednoid / Inner Oort / Extreme TNO Regime (100–500+ AU)"},
    ]

    PROBABILITY_CORRIDORS: List[Dict[str, Any]] = [
        {
            "zone_id": "ZONE-NEP-DEEP",
            "zone_name": "North Ecliptic Pole Deep Calibration Corridor",
            "ra_center": 304.6935,
            "dec_center": 42.4437,
            "span_deg": 2.5,
            "sensitivity_limit_mjy_sr": 11.8,
            "coverage_epochs": 48,
            "constraint_summary": "High-cadence SPHEREx orbital overlap zone; rules out slow movers >12 MJy/sr out to 120 AU.",
        },
        {
            "zone_id": "ZONE-TAURUS-ECL",
            "zone_name": "Ecliptic Scattered-Disk Search Corridor (Taurus)",
            "ra_center": 65.4200,
            "dec_center": 21.8500,
            "span_deg": 4.0,
            "sensitivity_limit_mjy_sr": 14.5,
            "coverage_epochs": 16,
            "constraint_summary": "Low ecliptic latitude corridor rich in known SkyBoT asteroids, Centaurs, and KBO trajectories.",
        },
        {
            "zone_id": "ZONE-ORION-APHELION",
            "zone_name": "High-Inclination Aphelion Constraint Corridor",
            "ra_center": 82.5000,
            "dec_center": -12.3000,
            "span_deg": 5.0,
            "sensitivity_limit_mjy_sr": 15.2,
            "coverage_epochs": 12,
            "constraint_summary": "Constrained search corridor for ultra-slow (<8 arcsec/day) detached/Sednoid trajectories.",
        },
    ]

    @classmethod
    def ensure_directories(cls) -> None:
        cls.DATA_DIR.mkdir(parents=True, exist_ok=True)
        cls.CACHED_DEMO_DIR.mkdir(parents=True, exist_ok=True)
        Path(cls.TEMP_DIR).mkdir(parents=True, exist_ok=True)
        (cls.REPORTS_DIR / "data").mkdir(parents=True, exist_ok=True)
        (cls.REPORTS_DIR / "docs").mkdir(parents=True, exist_ok=True)
        (cls.REPORTS_DIR / "images").mkdir(parents=True, exist_ok=True)


Settings.ensure_directories()