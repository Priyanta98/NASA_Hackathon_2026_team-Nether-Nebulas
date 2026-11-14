"""
FastAPI REST Server & Continuous Background Evaluator (backend/main.py)
for SPHEREx ChronoSky.

Run locally from project root:
    uvicorn backend.main:app --reload --port 8000
"""
from __future__ import annotations

import asyncio
import contextlib
import datetime
import json
import logging
import sys
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional

import pandas as pd

# Ensure project root is on sys.path so `from src...` always resolves cleanly
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from src.api.spherex_client import SPHERExClient
from src.catalog.crossmatch import CatalogCrossMatcher
from src.config.settings import Settings
from src.db.database import TrackletDatabase
from src.detection.ml_detector import MLDetector
from src.detection.moving_object import MovingObjectDetector
from src.io.fits_handler import FITSProcessor
from src.processing.image_processor import ImageProcessor
from src.utils.helpers import SPHERExHelpers
from src.validation.validator import PipelineValidator
from src.viz.reports import ReportGenerator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Core Singleton Pipeline Services
spherex_client = SPHERExClient()
fits_processor = FITSProcessor()
image_processor = ImageProcessor()
moving_detector = MovingObjectDetector()
ml_detector = MLDetector()
crossmatcher = CatalogCrossMatcher()
validator = PipelineValidator()
tracklet_db = TrackletDatabase()
reporter = ReportGenerator()
helpers = SPHERExHelpers()


class BlinkQuestVoteRequest(BaseModel):
    candidate_id: str
    vote: str  # "real_mover" | "artifact" | "variable"
    user: str = "Observer"


class AnnotationRequest(BaseModel):
    candidate_id: str
    author: str = "Team_Nether_Nebulas"
    tag: str = "review"
    comment: str


def run_region_analysis_pipeline(
    ra: float = 304.6935,
    dec: float = 42.4437,
    radius_arcsec: float = 600.0,
    collection: str = "spherex_qr2",
) -> Dict[str, Any]:
    """
    Executes the full SPHEREx ChronoSky multi-epoch analysis pipeline on a sky region.
    """
    epochs = fits_processor.generate_synthetic_mef_sequence(
        ra_center=ra, dec_center=dec, n_epochs=4, npix=128
    )

    ep1_clean = image_processor.clean_and_subtract_zodi(
        epochs[0]["image"], epochs[0]["zodi"], epochs[0]["flags"]
    )
    ep_last_clean = image_processor.clean_and_subtract_zodi(
        epochs[-1]["image"], epochs[-1]["zodi"], epochs[-1]["flags"]
    )
    ep_last_aligned, _, _ = image_processor.align_images(
        ep1_clean, ep_last_clean, epochs[0]["wcs"], epochs[-1]["wcs"], method="wcs"
    )
    diff_snr = image_processor.create_difference_image(
        ep1_clean, ep_last_aligned, epochs[0]["variance"], epochs[-1]["variance"], method="snr"
    )

    rgb_arr = image_processor.create_color_composite(
        ep1_clean * 0.9, ep_last_aligned, ep_last_aligned * 1.15
    )

    raw_candidates = moving_detector.detect_from_epoch_sequence(epochs, snr_threshold=4.5)
    catalog_vetted = crossmatcher.check_known_objects(raw_candidates)
    scored_candidates = ml_detector.score_and_enrich_candidates(
        catalog_vetted,
        cutout_image=ep_last_aligned,
        psf_kernel=epochs[-1]["psf_kernel"],
    )

    persisted_candidates: List[Dict[str, Any]] = []
    for cand in scored_candidates:
        saved = tracklet_db.upsert_tracklet(cand)
        persisted_candidates.append(saved)

    epochs_out = []
    for ep in epochs:
        clean_ep = image_processor.clean_and_subtract_zodi(ep["image"], ep["zodi"], ep["flags"])
        epochs_out.append(
            {
                "epoch_index": ep["epoch_index"],
                "obs_id": ep["obs_id"],
                "collection": ep["collection"],
                "mjd": ep["mjd"],
                "date_iso": ep["date_iso"],
                "image_b64": helpers.array_to_base64_png(
                    clean_ep, cmap="magma", title=f"{ep['obs_id']} (MJD {ep['mjd']:.1f})"
                ),
            }
        )

    return {
        "scientific_disclaimer": Settings.SCIENTIFIC_DISCLAIMER,
        "region": {
            "ra": ra,
            "dec": dec,
            "radius_arcsec": radius_arcsec,
            "collection": collection,
        },
        "epochs": epochs_out,
        "difference_snr_b64": helpers.array_to_base64_png(
            diff_snr, cmap="coolwarm", vmin=-8.0, vmax=8.0, title="WCS-Aligned ΔSNR (t4 − t1)"
        ),
        "rgb_composite_b64": helpers.array_to_base64_png(
            rgb_arr[:, :, 0], cmap="viridis", title="Multi-Band LVF Composite"
        ),
        "candidates": persisted_candidates,
        "probability_corridors": Settings.PROBABILITY_CORRIDORS,
    }


async def _continuous_evaluator_loop() -> None:
    await asyncio.sleep(1.0)
    while True:
        try:
            corridor = Settings.PROBABILITY_CORRIDORS[0]
            run_region_analysis_pipeline(
                ra=corridor["ra_center"],
                dec=corridor["dec_center"],
                radius_arcsec=600.0,
                collection="spherex_qr2",
            )
            tracklet_db.last_sweep_utc = datetime.datetime.now(datetime.timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            )
        except Exception as e:
            logger.warning(f"Background evaluation sweep warning: {e}")
        await asyncio.sleep(Settings.SWEEP_INTERVAL_SECONDS)


@contextlib.asynccontextmanager
async def lifespan(app_instance: FastAPI) -> AsyncIterator[None]:
    try:
        run_region_analysis_pipeline(304.6935, 42.4437, 600.0, "spherex_qr2")
    except Exception as e:
        logger.warning(f"Initial seed warning: {e}")

    task = asyncio.create_task(_continuous_evaluator_loop())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(
    title="SPHEREx ChronoSky API",
    description=Settings.SCIENTIFIC_DISCLAIMER,
    version="5.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def get_health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "service": "SPHEREx ChronoSky v5",
        "db_mode": tracklet_db.db_mode,
        "last_sweep_utc": tracklet_db.last_sweep_utc,
        "scientific_disclaimer": Settings.SCIENTIFIC_DISCLAIMER,
    }


@app.get("/api/observations")
def get_observations(
    ra: float = Query(304.6935, ge=0.0, le=360.0),
    dec: float = Query(42.4437, ge=-90.0, le=90.0),
    radius_arcsec: float = Query(600.0, ge=10.0, le=3600.0),
    collection: str = Query("spherex_qr2"),
) -> Dict[str, Any]:
    obs = spherex_client.query_observations_by_position(
        ra=ra, dec=dec, radius_arcsec=radius_arcsec, collection=collection
    )
    coverage = spherex_client.compute_coverage_constraint_grid(obs)
    return {
        "count": len(obs),
        "observations": obs[:150],
        "coverage_summary": coverage,
    }


@app.get("/api/probability-corridors")
def get_probability_corridors() -> Dict[str, Any]:
    return {
        "scientific_disclaimer": Settings.SCIENTIFIC_DISCLAIMER,
        "corridors": Settings.PROBABILITY_CORRIDORS,
    }


@app.get("/api/validate-pipeline")
def validate_pipeline(
    ra: float = Query(304.6935),
    dec: float = Query(42.4437),
    collection: str = Query("spherex_qr2"),
) -> Dict[str, Any]:
    return validator.run_validation_suite(ra=ra, dec=dec)


@app.get("/api/analyze-region")
def analyze_region(
    ra: float = Query(304.6935, ge=0.0, le=360.0),
    dec: float = Query(42.4437, ge=-90.0, le=90.0),
    radius_arcsec: float = Query(600.0, ge=10.0, le=3600.0),
    collection: str = Query("spherex_qr2"),
) -> Dict[str, Any]:
    return run_region_analysis_pipeline(
        ra=ra, dec=dec, radius_arcsec=radius_arcsec, collection=collection
    )


@app.get("/api/serendipity-feed")
def get_serendipity_feed(limit: int = Query(20, ge=1, le=100)) -> Dict[str, Any]:
    return {
        "scientific_disclaimer": Settings.SCIENTIFIC_DISCLAIMER,
        "items": tracklet_db.get_serendipity_feed(limit=limit),
    }


@app.get("/api/watchlist")
def get_watchlist() -> Dict[str, Any]:
    all_trk = tracklet_db.get_all_tracklets(limit=100)
    return {
        "db_mode": tracklet_db.db_mode,
        "last_sweep_utc": tracklet_db.last_sweep_utc,
        "total_tracklets": len(all_trk),
        "tier3_count": sum(1 for t in all_trk if t.get("promotion_tier") == 3),
        "tier2_count": sum(1 for t in all_trk if t.get("promotion_tier") == 2),
        "tier1_count": sum(1 for t in all_trk if t.get("promotion_tier") == 1),
        "tracklets": all_trk,
    }


@app.post("/api/trigger-sweep")
def trigger_sweep(
    ra: float = Query(304.6935),
    dec: float = Query(42.4437),
) -> Dict[str, Any]:
    res = run_region_analysis_pipeline(ra=ra, dec=dec, radius_arcsec=600.0, collection="spherex_qr2")
    tracklet_db.last_sweep_utc = datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    return {
        "status": "sweep_completed",
        "last_sweep_utc": tracklet_db.last_sweep_utc,
        "candidates_updated": len(res["candidates"]),
        "watchlist": get_watchlist(),
    }


@app.post("/api/blink-quest-vote")
def post_blink_quest_vote(payload: BlinkQuestVoteRequest) -> Dict[str, Any]:
    updated = tracklet_db.record_blink_quest_vote(
        candidate_id=payload.candidate_id, vote=payload.vote, user=payload.user
    )
    if updated is None:
        raise HTTPException(status_code=404, detail=f"Candidate {payload.candidate_id} not found")
    feat_vec = ml_detector._extract_single_features(updated)
    ml_status = ml_detector.update_with_human_labels(feat_vec, payload.vote)
    return {"candidate": updated, "active_learning": ml_status}


@app.post("/api/annotate")
def post_annotation(payload: AnnotationRequest) -> Dict[str, Any]:
    updated = tracklet_db.add_annotation(
        candidate_id=payload.candidate_id,
        author=payload.author,
        tag=payload.tag,
        comment=payload.comment,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail=f"Candidate {payload.candidate_id} not found")
    return {"status": "annotated", "candidate": updated}


@app.get("/api/export")
def export_report(format: str = Query("json", pattern="^(json|csv|mpc|votable|html)$")) -> Any:
    cands = tracklet_db.get_all_tracklets(limit=100)
    if format == "mpc":
        path = reporter.export_candidates_for_mpc(cands)
        return PlainTextResponse(Path(path).read_text(encoding="utf-8"))
    if format == "votable":
        xml_str = reporter.export_votable_xml(cands)
        return PlainTextResponse(xml_str, media_type="application/x-votable+xml")
    if format == "html":
        html_str = reporter._generate_html_template(
            {"report_id": "LIVE", "candidates": cands}
        )
        return HTMLResponse(html_str)
    if format == "csv":
        df = pd.DataFrame(cands) if cands else pd.DataFrame()
        return PlainTextResponse(df.to_csv(index=False), media_type="text/csv")
    return JSONResponse(
        {
            "scientific_disclaimer": Settings.SCIENTIFIC_DISCLAIMER,
            "exported_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "candidates": cands,
        }
    )


FRONTEND_DIR = ROOT_DIR / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")