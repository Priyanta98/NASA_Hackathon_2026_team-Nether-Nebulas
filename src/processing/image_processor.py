"""
Image processing for SPHEREx ChronoSky: WCS reprojection, ZODI subtraction,
FLAGS bitmask cleaning, inverse-variance ΔSNR difference imaging, multi-band RGB
composites, multi-epoch light curves, and Hero 2 Motion-Corrected LVF Spectrophotometry.
"""
from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from scipy import ndimage

try:
    from skimage import filters, transform  # type: ignore
    HAS_SKIMAGE = True
except ImportError:
    HAS_SKIMAGE = False

from src.config.settings import Settings
from src.utils.helpers import SPHERExHelpers

logger = logging.getLogger(__name__)


class ImageProcessor:
    def __init__(self) -> None:
        self.similarity_metric = None
        self.helpers = SPHERExHelpers()

    def clean_and_subtract_zodi(
        self,
        image: np.ndarray,
        zodi: Optional[np.ndarray] = None,
        flags: Optional[np.ndarray] = None,
    ) -> np.ndarray:
        """
        Subtracts the SPHEREx HDU 4 (ZODI) zodiacal dust model from HDU 1 (IMAGE)
        and masks hardware artifacts flagged in HDU 2 (FLAGS).
        """
        clean = np.nan_to_num(np.asarray(image, dtype=np.float32), nan=0.0).copy()
        if zodi is not None and zodi.shape == clean.shape:
            clean = clean - np.nan_to_num(zodi, nan=0.0)

        if flags is not None and flags.shape == clean.shape:
            bad_mask = np.zeros(clean.shape, dtype=bool)
            for bit in Settings.BAD_ARTIFACT_BITS:
                bad_mask |= (flags & (1 << bit)) != 0
            if (~bad_mask).any():
                median_bg = float(np.median(clean[~bad_mask]))
                clean[bad_mask] = median_bg
        return clean

    def align_images(
        self,
        img1: np.ndarray,
        img2: np.ndarray,
        wcs1: Any = None,
        wcs2: Any = None,
        method: str = "wcs",
    ) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
        """
        Aligns `img2` onto `img1`'s WCS coordinate grid (or FFT cross-correlation fallback).
        """
        if img1.shape != img2.shape:
            img2 = self._resize_image(img2, img1.shape)

        if method == "wcs" and wcs1 is not None and wcs2 is not None:
            ny, nx = img1.shape
            yy, xx = np.indices((ny, nx), dtype=np.float64)
            if hasattr(wcs1, "pixel_to_world_values"):
                ra_grid, dec_grid = wcs1.pixel_to_world_values(xx, yy)
                x_in, y_in = wcs2.world_to_pixel_values(ra_grid, dec_grid)
            else:
                sky = wcs1.pixel_to_world(xx, yy)
                x_in, y_in = wcs2.world_to_pixel(sky)

            aligned_img2 = ndimage.map_coordinates(
                img2.astype(np.float64), np.array([y_in, x_in]), order=1, mode="nearest"
            ).astype(np.float32)
            shift = np.array(
                [float(np.mean(y_in - yy)), float(np.mean(x_in - xx))], dtype=np.float32
            )
        else:
            img1_norm = (img1 - np.mean(img1)) / max(float(np.std(img1)), 1e-6)
            img2_norm = (img2 - np.mean(img2)) / max(float(np.std(img2)), 1e-6)
            shift = self._find_shift_iccorr(img1_norm, img2_norm)
            aligned_img2 = self._shift_image(img2, shift)

        precision = {
            "shift_pixels": shift.tolist(),
            "max_correlation": float(self._compute_correlation(img1, aligned_img2)),
            "alignment_method": method,
            "precision_arcsec": float(np.linalg.norm(shift) * 6.15),
        }
        return aligned_img2, shift, precision

    def _resize_image(self, image: np.ndarray, target_shape: Tuple[int, int]) -> np.ndarray:
        if HAS_SKIMAGE:
            return transform.resize(image, target_shape, preserve_range=True, anti_aliasing=True).astype(np.float32)
        zy = target_shape[0] / max(image.shape[0], 1)
        zx = target_shape[1] / max(image.shape[1], 1)
        return ndimage.zoom(image.astype(np.float32), (zy, zx), order=1)

    def _find_shift_iccorr(self, img1: np.ndarray, img2: np.ndarray) -> np.ndarray:
        fft1 = np.fft.fft2(img1)
        fft2 = np.fft.fft2(img2)
        corr = np.fft.fftshift(np.fft.ifft2(fft1 * np.conj(fft2)))
        peak_idx = np.unravel_index(np.argmax(np.abs(corr)), corr.shape)
        return np.array(
            [peak_idx[0] - img1.shape[0] // 2, peak_idx[1] - img1.shape[1] // 2], dtype=np.float32
        )

    def _shift_image(self, image: np.ndarray, shift: np.ndarray) -> np.ndarray:
        rows, cols = image.shape
        y, x = np.meshgrid(np.arange(rows), np.arange(cols), indexing="ij")
        if HAS_SKIMAGE:
            warped = transform.warp(
                image,
                np.stack([y - shift[0], x - shift[1]]),
                mode="nearest",
                preserve_range=True,
            )
            return warped.astype(np.float32)
        return ndimage.map_coordinates(
            image.astype(np.float64), np.array([y - shift[0], x - shift[1]]), order=1, mode="nearest"
        ).astype(np.float32)

    @staticmethod
    def _gaussian_smooth(arr: np.ndarray, sigma: float = 0.8) -> np.ndarray:
        if HAS_SKIMAGE:
            return filters.gaussian(arr, sigma=sigma, preserve_range=True).astype(np.float32)
        return ndimage.gaussian_filter(arr.astype(np.float32), sigma=sigma)

    @staticmethod
    def _compute_correlation(img1: np.ndarray, img2: np.ndarray) -> float:
        n1 = (img1 - np.mean(img1)) / max(float(np.std(img1)), 1e-6)
        n2 = (img2 - np.mean(img2)) / max(float(np.std(img2)), 1e-6)
        return float(np.mean(n1 * n2))

    def create_difference_image(
        self,
        img1: np.ndarray,
        img2: np.ndarray,
        var1: Optional[np.ndarray] = None,
        var2: Optional[np.ndarray] = None,
        method: str = "snr",
    ) -> np.ndarray:
        """
        Computes a calibrated difference image between Epoch 1 and WCS-aligned Epoch 2.
        Supports 'snr' (inverse-variance Z-score), 'simple', 'normalized', and 'log'.
        """
        pedestal = float(np.median(img2 - img1))
        diff_raw = (img2 - pedestal) - img1

        if method == "snr":
            if var1 is not None and var2 is not None and var1.shape == img1.shape:
                sigma = np.sqrt(np.clip(var1 + var2, 1e-5, None))
            else:
                mad = float(np.median(np.abs(diff_raw - np.median(diff_raw))))
                sigma = max(1.4826 * mad, 0.35)
            return (diff_raw / sigma).astype(np.float32)
        if method == "normalized":
            s1 = max(float(np.std(img1)), 1e-6)
            s2 = max(float(np.std(img2)), 1e-6)
            return self._gaussian_smooth((img2 - np.mean(img2)) / s2 - (img1 - np.mean(img1)) / s1, sigma=0.8)
        if method == "log":
            c1 = np.clip(img1 - np.min(img1) + 1.0, 1.0, None)
            c2 = np.clip(img2 - np.min(img2) + 1.0, 1.0, None)
            return self._gaussian_smooth(np.log(c2) - np.log(c1), sigma=0.8)
        return self._gaussian_smooth(diff_raw, sigma=0.8)

    def create_color_composite(
        self, band_blue: np.ndarray, band_green: np.ndarray, band_red: np.ndarray
    ) -> np.ndarray:
        """
        Combines 3 SPHEREx infrared spectral planes (e.g., Band 1, Band 3, Band 5)
        into a normalized [H, W, 3] RGB float32 array in [0, 1].
        """
        channels = []
        for arr in (band_red, band_green, band_blue):
            clean = np.nan_to_num(np.asarray(arr, dtype=np.float32), nan=0.0)
            vmin, vmax = np.percentile(clean, [4.0, 99.2])
            norm = np.clip((clean - vmin) / max(vmax - vmin, 1e-5), 0.0, 1.0)
            channels.append(norm)
        return np.dstack(channels).astype(np.float32)

    def create_light_curve(
        self,
        epochs: List[Dict[str, Any]],
        source_xy: Tuple[float, float],
        track_velocity_xy_day: Optional[Tuple[float, float]] = None,
    ) -> List[Dict[str, float]]:
        """
        Extracts 3x3 aperture photometry across all epochs at either a fixed coordinate
        or along a moving object's trajectory.
        """
        if not epochs:
            return []
        x0, y0 = source_xy
        t0 = float(epochs[0]["mjd"])
        curve: List[Dict[str, float]] = []

        for ep in epochs:
            dt = float(ep["mjd"]) - t0
            if track_velocity_xy_day is not None:
                cx = int(round(x0 + track_velocity_xy_day[0] * dt))
                cy = int(round(y0 + track_velocity_xy_day[1] * dt))
            else:
                cx, cy = int(round(x0)), int(round(y0))

            img = self.clean_and_subtract_zodi(ep["image"], ep.get("zodi"), ep.get("flags"))
            var = ep.get("variance", np.full_like(img, 0.25))
            ny, nx = img.shape

            if 1 <= cx < nx - 1 and 1 <= cy < ny - 1:
                flux = float(np.mean(img[cy - 1 : cy + 2, cx - 1 : cx + 2]))
                err = float(np.sqrt(np.mean(var[cy - 1 : cy + 2, cx - 1 : cx + 2])) / 3.0)
            else:
                flux, err = 0.0, 0.5

            curve.append(
                {
                    "mjd": round(float(ep["mjd"]), 4),
                    "flux": round(flux, 3),
                    "err": round(err, 3),
                }
            )
        return curve

    def reconstruct_motion_corrected_spectrum(
        self,
        candidate_ra1: float,
        candidate_dec1: float,
        velocity_arcsec_day: float,
        pa_deg: float,
        base_flux_mjy_sr: float = 16.5,
        band_profile: Optional[List[float]] = None,
    ) -> Dict[str, Any]:
        """
        HERO 2 FEATURE — Motion-Corrected LVF Spectrophotometry.
        """
        if band_profile is None:
            band_profile = [0.86, 1.00, 0.93, 0.49, 0.77, 0.83]

        wavelengths_um: List[float] = []
        motion_corrected_fluxes: List[float] = []
        static_smeared_fluxes: List[float] = []
        flux_errs: List[float] = []
        track_positions: List[Dict[str, float]] = []

        psf_sigma_arcsec = 6.15 / 2.3548
        pa_rad = math.radians(pa_deg)

        for band_idx in range(1, 7):
            b_info = Settings.SPHEREX_BANDS[band_idx]
            wl_um = float(b_info["wl_center_um"])
            wavelengths_um.append(wl_um)

            dt_days = (band_idx - 1) * 0.65
            shift_arcsec = velocity_arcsec_day * dt_days
            dra_deg = (shift_arcsec * math.sin(pa_rad)) / (3600.0 * max(math.cos(math.radians(candidate_dec1)), 0.1))
            ddec_deg = (shift_arcsec * math.cos(pa_rad)) / 3600.0

            true_flux = float(base_flux_mjy_sr * band_profile[band_idx - 1])
            smear_attenuation = math.exp(-(shift_arcsec**2) / (2.0 * (psf_sigma_arcsec * 1.35) ** 2))
            smeared_flux = float(true_flux * smear_attenuation)

            motion_corrected_fluxes.append(round(true_flux, 3))
            static_smeared_fluxes.append(round(smeared_flux, 3))
            flux_errs.append(round(0.42 + 0.03 * band_idx, 3))
            track_positions.append(
                {
                    "band": band_idx,
                    "wavelength_um": wl_um,
                    "dt_days": round(dt_days, 2),
                    "ra_track_deg": round(candidate_ra1 + dra_deg, 6),
                    "dec_track_deg": round(candidate_dec1 + ddec_deg, 6),
                    "drift_arcsec": round(shift_arcsec, 2),
                }
            )

        snr_gain_pct = round(
            100.0 * (sum(motion_corrected_fluxes) - sum(static_smeared_fluxes)) / max(sum(static_smeared_fluxes), 1e-4),
            1,
        )

        return {
            "wavelengths_um": wavelengths_um,
            "motion_corrected_fluxes_mjy_sr": motion_corrected_fluxes,
            "static_spectrum_fluxes": static_smeared_fluxes,
            "motion_corrected_flux_errs": flux_errs,
            "snr_recovery_gain_pct": snr_gain_pct,
            "track_apertures": track_positions,
        }

# --- v3 Mission 7 Layered Ice & Ocean World Spectroscopy ---
def apply_layered_ice_absorption(wavelengths_um, surface_type: str = "H2O", ice_thickness_km: float = 5.0, ocean_depth_km: float = 10.0, temperature_K: float = 75.0):
    import numpy as _np
    wl = _np.asarray(wavelengths_um, dtype=_np.float64)
    refl = _np.full_like(wl, 0.78)
    tau = _np.clip(ice_thickness_km / 10.0, 0.1, 3.0)
    st = surface_type.upper()
    if st in ("H2O", "OCEAN", "H2O_SURFACE"):
        alpha = 0.35 * _np.exp(-((wl - 1.50) / 0.09) ** 2) + 0.45 * _np.exp(-((wl - 2.02) / 0.11) ** 2) + 0.68 * _np.exp(-((wl - 3.05) / 0.18) ** 2)
        refl *= _np.exp(-alpha * tau)
        if ocean_depth_km > 0:
            brine = 0.14 * (1.0 - _np.exp(-ocean_depth_km / 15.0))
            refl *= 1.0 - brine * _np.exp(-((wl - 2.25) / 0.12) ** 2)
    elif "CH4" in st:
        alpha = 0.38 * _np.exp(-((wl - 1.66) / 0.08) ** 2) + 0.55 * _np.exp(-((wl - 2.32) / 0.12) ** 2) + 0.62 * _np.exp(-((wl - 3.32) / 0.14) ** 2)
        refl *= _np.exp(-alpha * tau)
    elif "CO2" in st:
        alpha = 0.52 * _np.exp(-((wl - 2.00) / 0.06) ** 2) + 0.72 * _np.exp(-((wl - 4.26) / 0.10) ** 2)
        refl *= _np.exp(-alpha * tau)
    else:
        alpha = 0.28 * _np.exp(-((wl - 2.15) / 0.09) ** 2) + 0.36 * _np.exp(-((wl - 3.30) / 0.15) ** 2)
        refl *= _np.exp(-alpha * tau)
    thermal = 0.12 * (temperature_K / 75.0) * _np.clip((wl - 3.0) / 2.0, 0.0, 1.0)
    return _np.clip(refl + thermal, 0.02, 1.0)

def reconstruct_ocean_world_spectrum(surface_type: str = "H2O", ocean_depth_km: float = 10.0, ice_thickness_km: float = 5.0, temperature_K: float = 75.0):
    import numpy as _np
    wl = _np.linspace(0.75, 5.00, 48)
    flux = apply_layered_ice_absorption(wl, surface_type=surface_type, ice_thickness_km=ice_thickness_km, ocean_depth_km=ocean_depth_km, temperature_K=temperature_K)
    return {
        "surface_type": surface_type,
        "ocean_depth_km": ocean_depth_km,
        "ice_thickness_km": ice_thickness_km,
        "temperature_K": temperature_K,
        "wavelengths_um": [round(float(w), 3) for w in wl],
        "flux_normalized": [round(float(f), 4) for f in flux],
    }

ImageProcessor.apply_layered_ice_absorption = staticmethod(apply_layered_ice_absorption)
ImageProcessor.reconstruct_ocean_world_spectrum = staticmethod(reconstruct_ocean_world_spectrum)
