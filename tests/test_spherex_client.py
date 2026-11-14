"""
Unit tests for SPHERExClient, FITSProcessor, ImageProcessor (Hero 2 Motion-Corrected Spectra),
MovingObjectDetector (50-100 AU distance range), and MLDetector (3-Stage Hybrid Ensemble).
"""
from __future__ import annotations

import pytest
from src.api.spherex_client import SPHERExClient
from src.detection.ml_detector import MLDetector
from src.detection.moving_object import MovingObjectDetector
from src.io.fits_handler import FITSProcessor
from src.processing.image_processor import ImageProcessor


class TestSPHERExClient:
    @pytest.fixture
    def client(self) -> SPHERExClient:
        return SPHERExClient()

    def test_init(self, client: SPHERExClient) -> None:
        assert client.base_url.startswith("https://")
        assert client.sia_url.endswith("/SIA")
        assert client.max_retries > 0

    def test_get_available_collections(self, client: SPHERExClient) -> None:
        collections = client.get_available_collections()
        assert "spherex_qr2" in collections
        assert "spherex_qr3" in collections

    def test_fallback_observations_and_coverage_grid(self, client: SPHERExClient) -> None:
        obs = client.generate_fallback_observations(304.6935, 42.4437, "spherex_qr2", count=12)
        assert len(obs) == 12
        assert obs[0]["t_min"] <= obs[-1]["t_min"]
        grid = client.compute_coverage_constraint_grid(obs)
        assert grid["total_visits"] == 12
        assert grid["5sigma_depth_mjy_sr"] > 0


class TestFITSAndMotionCorrectedSpectrum:
    def test_synthetic_mef_and_hero2_spectrum(self) -> None:
        fits_proc = FITSProcessor()
        epochs = fits_proc.generate_synthetic_mef_sequence(n_epochs=3, npix=64)
        assert len(epochs) == 3
        assert epochs[0]["image"].shape == (64, 64)

        img_proc = ImageProcessor()
        spec = img_proc.reconstruct_motion_corrected_spectrum(
            candidate_ra1=304.69,
            candidate_dec1=42.44,
            velocity_arcsec_day=3.2,
            pa_deg=45.0,
            base_flux_mjy_sr=18.0,
        )
        assert len(spec["wavelengths_um"]) == 6
        assert sum(spec["motion_corrected_fluxes_mjy_sr"]) > sum(spec["static_spectrum_fluxes"])
        assert spec["snr_recovery_gain_pct"] > 0


class TestAstrometryAndHybridMLEnsemble:
    def test_distance_range_includes_scattered_disk(self) -> None:
        detector = MovingObjectDetector()
        d_min, d_med, d_max, regime = detector.estimate_heliocentric_distance_range_au(
            velocity_arcsec_day=1.8, velocity_err_arcsec_day=0.15, solar_elongation_deg=90.0
        )
        assert d_min < d_med < d_max
        assert "50–100 AU" in regime or "AU" in regime

    def test_zero_shot_hybrid_ml_and_devils_advocate(self) -> None:
        fits_proc = FITSProcessor()
        epochs = fits_proc.generate_synthetic_mef_sequence(n_epochs=3, npix=64)
        detector = MovingObjectDetector()
        cands = detector.detect_from_epoch_sequence(epochs)
        assert len(cands) > 0

        ml = MLDetector()
        scored = ml.score_and_enrich_candidates(cands, epochs[-1]["image"], epochs[-1]["psf_kernel"])
        assert len(scored) == len(cands)
        top = scored[0]
        assert 0.0 <= top["ensemble_confidence_pct"] <= 100.0
        assert "cosmic_ray_prob" in top["devils_advocate_probs"]
        assert len(top["evidence_card"]["data_sha256"]) == 64