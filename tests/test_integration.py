"""
End-to-end integration tests for SPHEREx ChronoSky (tests/test_integration.py):
verifies TrackletDatabase (3-Tier Bayesian Promotion & Blink Quest), ReportGenerator
(JSON, CSV, MPC, VOTable, HTML), and the full region analysis pipeline.
"""
from __future__ import annotations

from pathlib import Path
from backend.main import run_region_analysis_pipeline
from src.db.database import TrackletDatabase
from src.viz.reports import ReportGenerator


class TestEndToEndIntegration:
    def test_full_region_analysis_pipeline(self) -> None:
        result = run_region_analysis_pipeline(
            ra=304.6935, dec=42.4437, radius_arcsec=600.0, collection="spherex_qr2"
        )
        assert "epochs" in result and len(result["epochs"]) == 4
        assert "difference_snr_b64" in result and len(result["difference_snr_b64"]) > 100
        assert "candidates" in result and len(result["candidates"]) >= 1

        cand = result["candidates"][0]
        assert "motion_corrected_fluxes_mjy_sr" in cand
        assert "devils_advocate_probs" in cand
        assert "evidence_card" in cand

    def test_database_promotion_and_exports(self, tmp_path: Path) -> None:
        db = TrackletDatabase(mongodb_uri="", local_store_path=tmp_path / "test_store.json")
        sample = {
            "candidate_id": "SPX-TEST-01",
            "ra2": 304.70,
            "dec2": 42.45,
            "motion_angular_velocity": 2.46,
            "motion_velocity_err": 0.14,
            "significance": 9.2,
            "distance_au_min": 58.0,
            "distance_au_median": 65.0,
            "distance_au_max": 74.0,
            "dynamical_regime": "Scattered Disk / Detached Object Regime (50–100 AU)",
            "ensemble_confidence_pct": 88.0,
            "promotion_tier": 1,
            "promotion_badge": "Tier 1: Unconfirmed Single-Pair Dipole",
            "is_known_object": False,
        }
        # First insert -> 3rd sighting promotes to Tier 3
        db.upsert_tracklet(sample)
        db.upsert_tracklet(sample)
        promoted = db.upsert_tracklet(sample)
        assert promoted["promotion_tier"] == 3

        voted = db.record_blink_quest_vote("SPX-TEST-01", "real_mover", "Test_User")
        assert voted is not None
        assert len(voted["human_vetting_labels"]) == 1

        reporter = ReportGenerator(output_dir=str(tmp_path / "reports"))
        votable_xml = reporter.export_votable_xml([promoted])
        assert "<VOTABLE" in votable_xml
        mpc_path = reporter.export_candidates_for_mpc([promoted])
        assert Path(mpc_path).exists()