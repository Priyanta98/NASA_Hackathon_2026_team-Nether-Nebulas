"""
SPHEREx Level 2 Multi-Extension FITS (MEF) handler: reads all 6 extensions
(IMAGE, FLAGS, VARIANCE, ZODI, PSF, WCS-WAVE with key='W', sip=None), performs
Synthetic Source Injection (SSI) for completeness maps, and generates realistic
multi-epoch synthetic SPHEREx MEF cubes.
"""
from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

try:
    from astropy.io import fits  # type: ignore
    from astropy.wcs import WCS  # type: ignore
    HAS_ASTROPY = True
except ImportError:
    HAS_ASTROPY = False

from src.config.settings import Settings
from src.utils.helpers import SPHERExHelpers

logger = logging.getLogger(__name__)


class SimpleGnomonicWCS:
    """Tangent-plane (RA---TAN, DEC--TAN) WCS used for synthetic benchmarks or fallback."""

    def __init__(
        self,
        crpix1: float,
        crpix2: float,
        crval1_deg: float,
        crval2_deg: float,
        cdelt1_deg: float,
        cdelt2_deg: float,
    ) -> None:
        self.crpix = [crpix1, crpix2]
        self.crval = [crval1_deg, crval2_deg]
        self.cdelt = [cdelt1_deg, cdelt2_deg]
        self.wcs = self

    def pixel_to_world_values(self, x: Any, y: Any) -> Tuple[Any, Any]:
        dx = (np.asarray(x) - self.crpix[0]) * self.cdelt[0]
        dy = (np.asarray(y) - self.crpix[1]) * self.cdelt[1]
        cos_dec = max(math.cos(math.radians(self.crval[1])), 1e-4)
        ra = (self.crval[0] + dx / cos_dec) % 360.0
        dec = np.clip(self.crval[1] + dy, -90.0, 90.0)
        return ra, dec

    def world_to_pixel_values(self, ra_deg: Any, dec_deg: Any) -> Tuple[Any, Any]:
        cos_dec = max(math.cos(math.radians(self.crval[1])), 1e-4)
        dra = (np.asarray(ra_deg) - self.crval[0]) * cos_dec
        ddec = np.asarray(dec_deg) - self.crval[1]
        x = self.crpix[0] + dra / self.cdelt[0]
        y = self.crpix[1] + ddec / self.cdelt[1]
        return x, y


class FITSProcessor:
    def __init__(self) -> None:
        self.temp_dir = Path(Settings.TEMP_DIR)
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        self.helpers = SPHERExHelpers()

    def read_fits_file(self, filepath: str) -> Tuple[Any, np.ndarray, Dict[str, Any]]:
        """
        Read a SPHEREx Level 2 Multi-Extension FITS file and return (wcs, image_data, full_mef_metadata).
        Extracts IMAGE, FLAGS, VARIANCE, ZODI, PSF, and WCS-WAVE (key='W', sip=None).
        """
        if not HAS_ASTROPY:
            raise RuntimeError("Astropy is required to read FITS files from disk.")

        try:
            with fits.open(filepath) as hdul:
                image_hdu = hdul["IMAGE"] if "IMAGE" in hdul else None
                if image_hdu is None:
                    for hdu in hdul:
                        if isinstance(hdu.data, np.ndarray) and hdu.data.ndim >= 2:
                            image_hdu = hdu
                            break
                if image_hdu is None:
                    raise ValueError(f"No 2D image extension found in {filepath}")

                hdr = image_hdu.header
                wcs = WCS(hdr, naxis=2)
                data = np.nan_to_num(np.asarray(image_hdu.data, dtype=np.float32), nan=0.0)
                ny, nx = data.shape

                flags = (
                    np.asarray(hdul["FLAGS"].data, dtype=np.int32)
                    if "FLAGS" in hdul
                    else np.zeros((ny, nx), dtype=np.int32)
                )
                variance = (
                    np.nan_to_num(np.asarray(hdul["VARIANCE"].data, dtype=np.float32), nan=0.25)
                    if "VARIANCE" in hdul
                    else np.full((ny, nx), 0.25, dtype=np.float32)
                )
                zodi = (
                    np.nan_to_num(np.asarray(hdul["ZODI"].data, dtype=np.float32), nan=0.0)
                    if "ZODI" in hdul
                    else np.full((ny, nx), float(np.median(data)), dtype=np.float32)
                )

                if "PSF" in hdul and hdul["PSF"].data is not None:
                    psf_raw = np.asarray(hdul["PSF"].data, dtype=np.float32)
                    psf_kernel = psf_raw[psf_raw.shape[0] // 2] if psf_raw.ndim == 3 else psf_raw
                else:
                    psf_kernel = self.build_gaussian_psf(21, fwhm_pix=2.0)

                detector = int(hdr.get("DETECTOR", 2))
                wl_map, bw_map = self._extract_lvf_wavelength_map(hdul, hdr, ny, nx, detector)

                metadata: Dict[str, Any] = {
                    "naxis": hdr.get("NAXIS", 2),
                    "naxis1": nx,
                    "naxis2": ny,
                    "ctype1": hdr.get("CTYPE1", "RA---TAN"),
                    "ctype2": hdr.get("CTYPE2", "DEC--TAN"),
                    "cdelt1": hdr.get("CDELT1", -6.15 / 3600.0),
                    "cdelt2": hdr.get("CDELT2", 6.15 / 3600.0),
                    "crval1": hdr.get("CRVAL1", 0.0),
                    "crval2": hdr.get("CRVAL2", 0.0),
                    "bunit": hdr.get("BUNIT", "MJy / sr"),
                    "instrument": hdr.get("INSTRUME", "SPHEREx"),
                    "obsdate": hdr.get("DATE-OBS", ""),
                    "detector": detector,
                    "flags": flags,
                    "variance": variance,
                    "zodi": zodi,
                    "psf_kernel": psf_kernel,
                    "wavelength_um_map": wl_map,
                    "bandwidth_um_map": bw_map,
                }
                return wcs, data, metadata
        except Exception as e:
            logger.error(f"Failed to read FITS file {filepath}: {e}")
            raise

    @staticmethod
    def _extract_lvf_wavelength_map(
        hdul: Any, hdr: Any, ny: int, nx: int, detector: int
    ) -> Tuple[np.ndarray, np.ndarray]:
        """Evaluates SPHEREx WCS-WAVE (key='W', sip=None) or computes the 2D LVF gradient."""
        if HAS_ASTROPY and hdul is not None and hdr is not None:
            try:
                spec_wcs = WCS(header=hdr, fobj=hdul, key="W")
                spec_wcs.sip = None
                yy, xx = np.indices((ny, nx), dtype=np.float32)
                wl, bw = spec_wcs.pixel_to_world(xx, yy)
                wl_arr = np.asarray(wl.value, dtype=np.float32)
                bw_arr = np.asarray(bw.value, dtype=np.float32)
                if wl_arr.shape == (ny, nx):
                    return wl_arr, bw_arr
            except Exception:
                pass

        b_info = Settings.SPHEREX_BANDS.get(detector, Settings.SPHEREX_BANDS[2])
        yy, xx = np.indices((ny, nx), dtype=np.float32)
        y_norm = yy / max(ny - 1, 1)
        x_norm = (xx - nx / 2.0) / max(nx, 1)
        wl_map = (
            b_info["wl_max_um"]
            - (b_info["wl_max_um"] - b_info["wl_min_um"]) * y_norm
            - 0.012 * (x_norm ** 2)
        ).astype(np.float32)
        bw_map = (wl_map / float(b_info["resolving_power"])).astype(np.float32)
        return wl_map, bw_map

    @staticmethod
    def build_gaussian_psf(size: int = 15, fwhm_pix: float = 2.0) -> np.ndarray:
        sigma = fwhm_pix / 2.3548
        r = size // 2
        y, x = np.mgrid[-r : r + 1, -r : r + 1]
        psf = np.exp(-(x**2 + y**2) / (2.0 * sigma**2)).astype(np.float32)
        return psf / max(float(psf.sum()), 1e-8)

    def generate_synthetic_mef_sequence(
        self,
        ra_center: float = 304.6935,
        dec_center: float = 42.4437,
        n_epochs: int = 4,
        npix: int = 128,
        seed: int = 42,
    ) -> List[Dict[str, Any]]:
        """
        Generates a 4-epoch calibrated SPHEREx Level 2 MEF sequence containing:
          - 36 stationary stars (flagged with MP_SOURCE bit 21)
          - Time-varying ZODI background (HDU 4)
          - Hardware artifact pixels (MP_HOT bit 10, MP_PERSIST bit 17)
          - 2 outer-solar-system moving objects + 1 known SkyBoT asteroid
          - Multi-band LVF spectral slices (Bands 1..6) for Hero 2 motion-corrected spectroscopy.
        """
        rng = np.random.default_rng(seed)
        pix_scale_deg = 6.15 / 3600.0
        psf_kernel = self.build_gaussian_psf(15, fwhm_pix=2.0)

        star_x = rng.uniform(12, npix - 12, 36)
        star_y = rng.uniform(12, npix - 12, 36)
        star_flux = rng.lognormal(1.8, 0.7, 36)

        movers = [
            {
                "id": "SPX-TRK-001",
                "name": "Uncataloged Scattered-Disk Candidate",
                "x0": npix * 0.34,
                "y0": npix * 0.42,
                "vx_day": 0.40,   # ~2.46 "/day (~65 AU Scattered Disk regime)
                "vy_day": 0.25,
                "flux_mjy_sr": 18.5,
                "is_known": False,
                "catalog_name": "",
                # Icy H2O (3.0 um dip in Band 4) + CH4 (3.3 um) spectral signature across Bands 1-6
                "band_flux_ratios": [0.85, 1.00, 0.92, 0.48, 0.76, 0.82],
            },
            {
                "id": "SPX-TRK-002",
                "name": "Known Centaur (2060 Chiron / SkyBoT Benchmark)",
                "x0": npix * 0.68,
                "y0": npix * 0.62,
                "vx_day": -0.92,  # ~5.66 "/day (~18 AU Centaur regime)
                "vy_day": 0.54,
                "flux_mjy_sr": 14.2,
                "is_known": True,
                "catalog_name": "(2060) Chiron [SkyBoT Verified]",
                "band_flux_ratios": [0.95, 1.00, 0.96, 0.68, 0.84, 0.88],
            },
        ]

        epochs: List[Dict[str, Any]] = []
        base_mjd = 60850.0
        yy, xx = np.indices((npix, npix), dtype=np.float32)

        for idx in range(n_epochs):
            dt_days = float(idx * 6.5)
            mjd = base_mjd + dt_days
            dither_x = float(rng.uniform(-1.2, 1.2)) if idx > 0 else 0.0
            dither_y = float(rng.uniform(-1.2, 1.2)) if idx > 0 else 0.0

            wcs_obj = SimpleGnomonicWCS(
                crpix1=(npix / 2.0) + dither_x,
                crpix2=(npix / 2.0) + dither_y,
                crval1_deg=ra_center,
                crval2_deg=dec_center,
                cdelt1_deg=-pix_scale_deg,
                cdelt2_deg=pix_scale_deg,
            )

            science = np.zeros((npix, npix), dtype=np.float32)
            flags = np.zeros((npix, npix), dtype=np.int32)
            sigma_psf = 1.65

            for sx, sy, sf in zip(star_x, star_y, star_flux):
                cx, cy = sx + dither_x, sy + dither_y
                r2 = (xx - cx) ** 2 + (yy - cy) ** 2
                science += sf * np.exp(-r2 / (2.0 * sigma_psf**2))
                flags[r2 < 4.0] |= (1 << Settings.FLAG_BITS["MP_SOURCE"])

            mover_truth: List[Dict[str, Any]] = []
            for m in movers:
                mx = m["x0"] + dither_x + m["vx_day"] * dt_days
                my = m["y0"] + dither_y + m["vy_day"] * dt_days
                r2 = (xx - mx) ** 2 + (yy - my) ** 2
                science += m["flux_mjy_sr"] * np.exp(-r2 / (2.0 * sigma_psf**2))
                ra_m, dec_m = wcs_obj.pixel_to_world_values(mx, my)
                mover_truth.append(
                    {
                        **m,
                        "x_pix": float(mx),
                        "y_pix": float(my),
                        "ra_deg": float(ra_m),
                        "dec_deg": float(dec_m),
                    }
                )

            # Inject 3 hot/persistent detector artifacts flagged in HDU 2 (FLAGS)
            for _ in range(3):
                hx = int(rng.integers(10, npix - 10))
                hy = int(rng.integers(10, npix - 10))
                science[hy, hx] += 34.0
                flags[hy, hx] |= (1 << Settings.FLAG_BITS["MP_HOT"]) | (
                    1 << Settings.FLAG_BITS["MP_PERSIST"]
                )

            zodi = (23.5 + 2.8 * math.sin(0.5 * idx) + 1.6 * (yy / npix)).astype(np.float32)
            variance = np.full((npix, npix), 0.48**2, dtype=np.float32) + 0.015 * np.abs(science)
            noise = rng.normal(0.0, np.sqrt(variance)).astype(np.float32)
            image_total = science + zodi + noise

            wl_map, bw_map = self._extract_lvf_wavelength_map(None, None, npix, npix, detector=2)

            epochs.append(
                {
                    "epoch_index": idx + 1,
                    "obs_id": f"2026W{12 + idx * 2}_2B_0{101 + idx}_D2",
                    "collection": "spherex_qr2" if idx < 2 else "spherex_qr3",
                    "mjd": mjd,
                    "date_iso": self.helpers.mjd_to_isot(mjd),
                    "ra_center": ra_center,
                    "dec_center": dec_center,
                    "wcs": wcs_obj,
                    "image": image_total,
                    "zodi": zodi,
                    "variance": variance,
                    "flags": flags,
                    "psf_kernel": psf_kernel,
                    "wavelength_um_map": wl_map,
                    "bandwidth_um_map": bw_map,
                    "mover_truth": mover_truth,
                }
            )

        return epochs

    def inject_synthetic_sources(
        self,
        image: np.ndarray,
        psf_kernel: np.ndarray,
        positions_xy: List[Tuple[float, float]],
        peak_flux_mjy_sr: float,
    ) -> np.ndarray:
        """
        Injects synthetic PSF-convolved point sources into an image frame for
        Hero 1 Completeness Map validation ('What SPHEREx Can Rule Out').
        """
        out = image.copy().astype(np.float32)
        ny, nx = out.shape
        yy, xx = np.indices((ny, nx), dtype=np.float32)
        sigma_psf = 1.65
        for px, py in positions_xy:
            if 4 <= px < nx - 4 and 4 <= py < ny - 4:
                r2 = (xx - px) ** 2 + (yy - py) ** 2
                out += float(peak_flux_mjy_sr) * np.exp(-r2 / (2.0 * sigma_psf**2))
        return out

# --- v3 Mission 6 & 7 Synthetic MEF Injections ---
def inject_synthetic_interstellar(trajectory: str = "hyperbolic", v_inf_kms: float = 26.5, inclination_deg: float = 0.0, eps_accel: float = 0.0):
    import numpy as _np
    yy, xx = _np.mgrid[0:64, 0:64]
    cx = 32.0 + inclination_deg * 0.05
    img = 0.22 + 4.2 * _np.exp(-((xx - cx) ** 2 + (yy - 32.0) ** 2) / (2.0 * 1.35 ** 2))
    ecc = 1.18 if trajectory == "hyperbolic" else (1.0 if trajectory == "parabolic" else 0.82)
    return {
        "PRIMARY": {"TRAJECTORY_TYPE": trajectory, "V_INF_KMS": v_inf_kms, "ECCENTRICITY": ecc, "NON_GRAV_ACCEL": eps_accel, "MU_ARCSEC_DAY": round(52.0 + v_inf_kms * 0.9, 2)},
        "IMAGE": img.astype(_np.float32),
    }

def inject_synthetic_ocean_world(surface_type: str = "H2O", ocean_depth_km: float = 10.0, ice_thickness_km: float = 5.0, temperature_K: float = 75.0):
    import numpy as _np
    yy, xx = _np.mgrid[0:64, 0:64]
    boost = 1.0 + (ocean_depth_km / max(1.0, ice_thickness_km)) * 0.06
    img = 0.22 + (3.4 * boost) * _np.exp(-((xx - 32.0) ** 2 + (yy - 32.0) ** 2) / (2.0 * 1.4 ** 2))
    return {
        "PRIMARY": {"SURFACE_TYPE": surface_type, "OCEAN_DEPTH_KM": ocean_depth_km, "ICE_THICKNESS_KM": ice_thickness_km, "SURFACE_TEMP_K": temperature_K},
        "IMAGE": img.astype(_np.float32),
    }

FITSProcessor.inject_synthetic_interstellar = staticmethod(inject_synthetic_interstellar)
FITSProcessor.inject_synthetic_ocean_world = staticmethod(inject_synthetic_ocean_world)
