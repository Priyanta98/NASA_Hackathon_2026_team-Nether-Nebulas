"""
Automated unit tests for Hero 1 Credibility & Validation Layer (tests/test_validator.py):
  - Known-Object Recovery Recall Benchmark
  - Synthetic Source Injection Completeness Heatmap
  - Time-Scrambled Null Test False-Alarm Rate (FAR)
"""
from __future__ import annotations

from src.validation.validator import PipelineValidator


class TestPipelineValidator:
    def test_known_object_recovery(self) -> None:
        validator = PipelineValidator()
        res = validator.run_known_object_recovery()
        assert res["tested_count"] >= 5
        assert res["recovered_count"] >= 4
        assert res["recall_rate_pct"] >= 80.0

    def test_synthetic_completeness_grid(self) -> None:
        validator = PipelineValidator()
        grid = validator.run_synthetic_completeness_grid()
        assert len(grid["velocity_bins_arcsec_day"]) == 5
        assert len(grid["flux_bins_mjy_sr"]) == 5
        assert any("50–100 AU" in d for d in grid["distance_bins_au"])
        assert len(grid["recovery_matrix_pct"]) == 5

    def test_time_scrambled_null_test(self) -> None:
        validator = PipelineValidator()
        null_res = validator.run_time_scrambled_null_test(trials=4)
        assert null_res["scrambled_trials"] == 4
        assert null_res["far_per_sq_deg"] >= 0.0
        assert null_res["tier2_promotion_snr_threshold"] >= 4.5