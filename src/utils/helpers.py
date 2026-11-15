"""
Utility functions for SPHEREx ChronoSky: spherical geometry, MJD time conversions,
SHA-256 provenance hashing, and base64 image rendering.
"""
from __future__ import annotations

import base64
import hashlib
import io
import logging
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

try:
    from astropy.coordinates import SkyCoord, GeocentricTrueEcliptic  # type: ignore
    from astropy.time import Time  # type: ignore
    import astropy.units as u  # type: ignore
    HAS_ASTROPY = True
except ImportError:
    HAS_ASTROPY = False

from src.config.settings import Settings

logger = logging.getLogger(__name__)


class SPHERExHelpers:
    def __init__(self) -> None:
        self.coordinate_system = "icrs"

    def haversine_distance(
        self, ra1: float, dec1: float, ra2: float, dec2: float
    ) -> float:
        """Calculate exact spherical angular distance (deg) between two sky coordinates."""
        try:
            if HAS_ASTROPY:
                c1 = SkyCoord(ra=float(ra1) * u.deg, dec=float(dec1) * u.deg)
                c2 = SkyCoord(ra=float(ra2) * u.deg, dec=float(dec2) * u.deg)
                return float(c1.separation(c2).deg)

            r1, d1 = math.radians(ra1), math.radians(dec1)
            r2, d2 = math.radians(ra2), math.radians(dec2)
            dlon = r2 - r1
            dlat = d2 - d1
            a = math.sin(dlat / 2.0) ** 2 + math.cos(d1) * math.cos(d2) * math.sin(dlon / 2.0) ** 2
            return math.degrees(2.0 * math.asin(min(1.0, math.sqrt(max(0.0, a)))))
        except Exception as e:
            logger.error(f"Haversine distance calculation failed: {e}")
            return 0.0

    def angular_separation_and_pa(
        self, ra1: float, dec1: float, ra2: float, dec2: float
    ) -> Tuple[float, float]:
        """Returns (separation_arcsec, position_angle_deg) from (ra1, dec1) to (ra2, dec2)."""
        if HAS_ASTROPY:
            c1 = SkyCoord(ra=float(ra1) * u.deg, dec=float(dec1) * u.deg)
            c2 = SkyCoord(ra=float(ra2) * u.deg, dec=float(dec2) * u.deg)
            return float(c1.separation(c2).arcsec), float(c1.position_angle(c2).deg)

        mean_dec = math.radians(0.5 * (dec1 + dec2))
        dra_arcsec = (ra2 - ra1) * math.cos(mean_dec) * 3600.0
        ddec_arcsec = (dec2 - dec1) * 3600.0
        sep = math.hypot(dra_arcsec, ddec_arcsec)
        pa = (math.degrees(math.atan2(dra_arcsec, ddec_arcsec)) + 360.0) % 360.0
        return sep, pa

    def convert_coordinate_format(
        self,
        ra: float,
        dec: float,
        from_format: str = "deg",
        to_format: str = "deg",
    ) -> Tuple[float, float]:
        """Convert coordinates between degrees and hours-minutes-seconds."""
        try:
            if HAS_ASTROPY:
                unit_in = (u.hourangle, u.deg) if from_format == "hms" else (u.deg, u.deg)
                coord = SkyCoord(ra, dec, unit=unit_in)
                if to_format == "hms":
                    return float(coord.ra.hms[0]), float(coord.dec.dms[0])
                return float(coord.ra.degree), float(coord.dec.degree)
            return float(ra) % 360.0, float(dec)
        except Exception as e:
            logger.error(f"Coordinate conversion failed: {e}")
            return float(ra), float(dec)

    def validate_coordinates(
        self,
        ra: float,
        dec: float,
        ra_range: Tuple[float, float] = (0.0, 360.0),
        dec_range: Tuple[float, float] = (-90.0, 90.0),
    ) -> bool:
        """Validate sky coordinates."""
        try:
            return bool(ra_range[0] <= float(ra) <= ra_range[1] and dec_range[0] <= float(dec) <= dec_range[1])
        except Exception:
            return False

    @staticmethod
    def mjd_to_isot(mjd: float) -> str:
        """Convert Modified Julian Date (MJD) to ISO-8601 UTC timestamp."""
        if HAS_ASTROPY:
            try:
                return str(Time(float(mjd), format="mjd").isot)
            except Exception:
                pass
        epoch0 = datetime(1858, 11, 17, 0, 0, 0, tzinfo=timezone.utc)
        dt = epoch0 + timedelta(days=float(mjd))
        return dt.strftime("%Y-%m-%dT%H:%M:%S.000")

    @staticmethod
    def estimate_solar_elongation_deg(ra_deg: float, dec_deg: float, mjd: float) -> float:
        """
        Computes approximate solar elongation angle (deg) at observation MJD.
        SPHEREx observes within its sun-synchronous scan band near ~85-95 deg elongation.
        """
        # Approximate solar ecliptic longitude from MJD (J2000 = MJD 51544.5)
        days_j2000 = float(mjd) - 51544.5
        sun_lon_rad = math.radians((280.460 + 0.9856474 * days_j2000) % 360.0)
        eps = math.radians(23.43929)
        sun_ra = math.atan2(math.cos(eps) * math.sin(sun_lon_rad), math.cos(sun_lon_rad))
        sun_dec = math.asin(math.sin(eps) * math.sin(sun_lon_rad))

        ra_r, dec_r = math.radians(ra_deg), math.radians(dec_deg)
        cos_elong = (
            math.sin(sun_dec) * math.sin(dec_r)
            + math.cos(sun_dec) * math.cos(dec_r) * math.cos(ra_r - sun_ra)
        )
        elong_deg = math.degrees(math.acos(max(-1.0, min(1.0, cos_elong))))
        # Clamp to SPHEREx operational elongation window (65..115 deg) if synthetic
        return float(np.clip(elong_deg, 65.0, 115.0))

    @staticmethod
    def compute_sha256_hash(data: Any) -> str:
        """Computes a reproducible SHA-256 hex digest for an array, bytes, or dict."""
        if isinstance(data, np.ndarray):
            raw = np.ascontiguousarray(data, dtype=np.float32).tobytes()
        elif isinstance(data, (bytes, bytearray)):
            raw = bytes(data)
        else:
            raw = str(data).encode("utf-8")
        return hashlib.sha256(raw).hexdigest()

    @staticmethod
    def decode_spherex_flags(flag_mask_int: int) -> List[str]:
        """Decodes a 32-bit SPHEREx FLAGS integer into human-readable MP_* bit names."""
        active: List[str] = []
        for name, bit in Settings.FLAG_BITS.items():
            if int(flag_mask_int) & (1 << bit):
                active.append(name)
        return active if active else ["CLEAN_PIXEL"]

    @staticmethod
    def array_to_base64_png(
        arr: np.ndarray,
        cmap: str = "magma",
        vmin: Optional[float] = None,
        vmax: Optional[float] = None,
        title: str = "",
    ) -> str:
        """Renders a 2D science/SNR array into a stretched base64 PNG for the web frontend."""
        clean = np.nan_to_num(np.asarray(arr, dtype=np.float32), nan=0.0)
        if vmin is None or vmax is None:
            p_low, p_high = np.percentile(clean, [3.0, 99.2])
            if p_high <= p_low:
                p_low, p_high = float(clean.min()), float(clean.max() + 1e-4)
            vmin = p_low if vmin is None else vmin
            vmax = p_high if vmax is None else vmax

        fig, ax = plt.subplots(figsize=(4.0, 4.0), dpi=105)
        ax.imshow(clean, origin="lower", cmap=cmap, vmin=vmin, vmax=vmax)
        if title:
            ax.set_title(title, fontsize=8, color="#e2e8f0", pad=4)
        ax.axis("off")
        fig.patch.set_facecolor("#040711")
        plt.tight_layout(pad=0.05)

        buf = io.BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight", pad_inches=0.02, facecolor=fig.get_facecolor())
        plt.close(fig)
        return base64.b64encode(buf.getvalue()).decode("ascii")

    def filter_observations_by_criteria(
        self, observations: List[Dict[str, Any]], criteria: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Filter observations based on RA, Dec, MJD, collection, or flux criteria."""
        filtered: List[Dict[str, Any]] = []
        for obs in observations:
            if "ra_min" in criteria and "ra_max" in criteria:
                if not (criteria["ra_min"] <= obs.get("ra", 0.0) <= criteria["ra_max"]):
                    continue
            if "dec_min" in criteria and "dec_max" in criteria:
                if not (criteria["dec_min"] <= obs.get("dec", 0.0) <= criteria["dec_max"]):
                    continue
            if "t_min" in criteria and "t_max" in criteria:
                if not (criteria["t_min"] <= obs.get("t_min", 0.0) <= criteria["t_max"]):
                    continue
            if "collection" in criteria and obs.get("collection") != criteria["collection"]:
                continue
            filtered.append(obs)
        return filtered

    def calculate_statistics(
        self, data: List[Dict[str, Any]], value_key: str
    ) -> Dict[str, float]:
        """Calculate basic summary statistics for a numeric key in a list of dicts."""
        values = [float(d[value_key]) for d in data if value_key in d and d[value_key] is not None]
        if not values:
            return {"count": 0, "mean": 0.0, "std": 0.0, "min": 0.0, "max": 0.0, "median": 0.0}
        return {
            "count": len(values),
            "mean": float(np.mean(values)),
            "std": float(np.std(values)),
            "min": float(np.min(values)),
            "max": float(np.max(values)),
            "median": float(np.median(values)),
        }

    def export_to_csv(
        self, data: List[Dict[str, Any]], filename: str, include_timestamp: bool = True
    ) -> str:
        """Export list of dicts to CSV file."""
        df = pd.DataFrame(data)
        if include_timestamp:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{ts}_{filename}"
        out_dir = Settings.REPORTS_DIR / "data"
        out_dir.mkdir(parents=True, exist_ok=True)
        csv_path = out_dir / f"{filename}.csv"
        df.to_csv(csv_path, index=False)
        return str(csv_path)

# --- v3 Mission 5 Light-Time Ticker Helper ---
def format_light_time_stamp(distance_au: float, obs_mjd: float = 61360.0) -> dict:
    delay_sec = (max(0.01, float(distance_au)) * 149597870.7) / 299792.458
    hours = int(delay_sec // 3600)
    minutes = int((delay_sec % 3600) // 60)
    seconds = int(round(delay_sec % 60))
    if seconds == 60:
        seconds = 0
        minutes += 1
    if minutes == 60:
        minutes = 0
        hours += 1
    retarded_mjd = obs_mjd - (delay_sec / 86400.0)
    hhmmss = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    short_delay = f"{minutes}m {seconds}s" if hours == 0 else f"{hours}h {minutes}m {seconds}s"
    return {
        "delay_seconds": round(delay_sec, 2),
        "hhmmss": hhmmss,
        "retarded_mjd": round(retarded_mjd, 4),
        "display": f"Delay: {short_delay} -> target seen as at MJD {retarded_mjd:.3f}",
    }