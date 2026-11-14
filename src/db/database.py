"""
Dual-mode Database Layer (src/db/database.py) for SPHEREx ChronoSky (Idea D):
  - Uses MongoDB Atlas with a 2dsphere geospatial index on [ra - 180, dec] when MONGODB_URI is set.
  - Automatically falls back to local JSON persistence (data/tracklets_store.json) when offline
    or when MONGODB_URI is not configured.
  - Supports Null-Test-calibrated 3-Tier Bayesian Tracklet Promotion, cone searches,
    Serendipity Feed queries, Blink Quest active-learning votes, and collaborative annotations.
"""
from __future__ import annotations

import datetime
import json
import logging
import math
from pathlib import Path
from typing import Any, Dict, List, Optional

from src.config.settings import Settings
from src.utils.helpers import SPHERExHelpers

logger = logging.getLogger(__name__)


class TrackletDatabase:
    def __init__(
        self,
        mongodb_uri: Optional[str] = None,
        local_store_path: Optional[Path] = None,
    ) -> None:
        self.mongodb_uri = mongodb_uri if mongodb_uri is not None else Settings.MONGODB_URI
        self.local_path = Path(local_store_path or Settings.LOCAL_TRACKLETS_FILE)
        self.local_path.parent.mkdir(parents=True, exist_ok=True)
        self.helpers = SPHERExHelpers()

        self.db_mode = "local_json"
        self._mongo_col = None
        self.last_sweep_utc: str = datetime.datetime.now(datetime.timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )

        if self.mongodb_uri:
            try:
                from pymongo import MongoClient, GEOSPHERE  # type: ignore

                client = MongoClient(self.mongodb_uri, serverSelectionTimeoutMS=3000)
                client.admin.command("ping")
                db = client[Settings.MONGODB_DB_NAME]
                self._mongo_col = db["tracklets"]
                self._mongo_col.create_index([("location", GEOSPHERE)])
                self._mongo_col.create_index("candidate_id", unique=True)
                self.db_mode = "mongodb"
                logger.info("Connected to MongoDB Atlas with 2dsphere spatial index.")
            except Exception as e:
                logger.warning(f"MongoDB unavailable ({e}); using local JSON store at {self.local_path}.")
                self.db_mode = "local_json"

        self._ensure_local_store()

    def _ensure_local_store(self) -> None:
        if not self.local_path.exists():
            self.local_path.write_text("[]", encoding="utf-8")
        else:
            try:
                content = self.local_path.read_text(encoding="utf-8").strip()
                if not content:
                    self.local_path.write_text("[]", encoding="utf-8")
            except Exception:
                self.local_path.write_text("[]", encoding="utf-8")

    def _read_local_all(self) -> List[Dict[str, Any]]:
        try:
            data = json.loads(self.local_path.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except Exception:
            return []

    def _write_local_all(self, records: List[Dict[str, Any]]) -> None:
        self.local_path.write_text(json.dumps(records, indent=2, default=str), encoding="utf-8")

    @staticmethod
    def _to_geojson_point(ra_deg: float, dec_deg: float) -> Dict[str, Any]:
        """Maps RA [0, 360] -> GeoJSON longitude [-180, 180] and Dec [-90, 90] -> latitude."""
        lon = ((float(ra_deg) + 180.0) % 360.0) - 180.0
        lat = max(-90.0, min(90.0, float(dec_deg)))
        return {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}

    def upsert_tracklet(self, candidate: Dict[str, Any]) -> Dict[str, Any]:
        """
        Inserts a new candidate or promotes an existing tracklet along the 3-Tier Bayesian
        verification ladder when a subsequent evaluation sweep re-detects it.
        """
        cand_id = str(candidate.get("candidate_id", "SPX-TRK-001"))
        ra = float(candidate.get("ra2", candidate.get("ra", 0.0)))
        dec = float(candidate.get("dec2", candidate.get("dec", 0.0)))

        doc = {
            **candidate,
            "candidate_id": cand_id,
            "location": self._to_geojson_point(ra, dec),
            "updated_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        doc.setdefault("annotations", [])
        doc.setdefault("human_vetting_labels", [])
        doc.setdefault("sweep_sightings", 1)

        if self.db_mode == "mongodb" and self._mongo_col is not None:
            existing = self._mongo_col.find_one({"candidate_id": cand_id}, {"_id": 0})
            if existing:
                doc = self._merge_and_promote(existing, doc)
            self._mongo_col.replace_one({"candidate_id": cand_id}, doc, upsert=True)
            return doc

        records = self._read_local_all()
        updated = False
        for i, rec in enumerate(records):
            if rec.get("candidate_id") == cand_id:
                doc = self._merge_and_promote(rec, doc)
                records[i] = doc
                updated = True
                break
        if not updated:
            records.append(doc)
        self._write_local_all(records)
        return doc

    @staticmethod
    def _merge_and_promote(existing: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
        sightings = int(existing.get("sweep_sightings", 1)) + 1
        old_conf = float(existing.get("ensemble_confidence_pct", 75.0))
        new_conf = min(99.5, round(max(old_conf, float(incoming.get("ensemble_confidence_pct", 75.0))) + 1.2, 1))
        is_known = bool(incoming.get("is_known_object", existing.get("is_known_object", False)))

        tier = int(incoming.get("promotion_tier", existing.get("promotion_tier", 1)))
        if sightings >= 3 and new_conf >= 82.0 and not is_known:
            tier = 3
            badge = "Tier 3: High-Priority Vetted Candidate"
        elif sightings >= 2 or tier >= 2:
            tier = max(tier, 2)
            badge = (
                "Tier 3: High-Priority Vetted Candidate"
                if tier == 3
                else "Tier 2: Promoted Multi-Epoch Tracklet"
            )
        else:
            badge = "Tier 1: Unconfirmed Single-Pair Dipole"

        inc_anns = incoming.get("annotations", [])
        ext_anns = existing.get("annotations", [])
        merged_anns = inc_anns if len(inc_anns) >= len(ext_anns) else ext_anns

        inc_votes = incoming.get("human_vetting_labels", [])
        ext_votes = existing.get("human_vetting_labels", [])
        merged_votes = inc_votes if len(inc_votes) >= len(ext_votes) else ext_votes

        return {
            **existing,
            **incoming,
            "sweep_sightings": sightings,
            "ensemble_confidence_pct": new_conf,
            "promotion_tier": tier,
            "promotion_badge": badge,
            "annotations": merged_anns,
            "human_vetting_labels": merged_votes,
        }

    def get_all_tracklets(self, limit: int = 100) -> List[Dict[str, Any]]:
        if self.db_mode == "mongodb" and self._mongo_col is not None:
            cursor = self._mongo_col.find({}, {"_id": 0}).sort("ensemble_confidence_pct", -1).limit(limit)
            return list(cursor)
        records = self._read_local_all()
        records.sort(key=lambda r: float(r.get("ensemble_confidence_pct", 0.0)), reverse=True)
        return records[:limit]

    def cone_search_tracklets(
        self, ra_deg: float, dec_deg: float, radius_deg: float = 2.0
    ) -> List[Dict[str, Any]]:
        if self.db_mode == "mongodb" and self._mongo_col is not None:
            try:
                pt = self._to_geojson_point(ra_deg, dec_deg)
                radians = math.radians(radius_deg)
                cursor = self._mongo_col.find(
                    {"location": {"$geoWithin": {"$centerSphere": [pt["coordinates"], radians]}}},
                    {"_id": 0},
                )
                return list(cursor)
            except Exception:
                pass

        all_recs = self.get_all_tracklets(limit=200)
        return [
            r
            for r in all_recs
            if self.helpers.haversine_distance(
                ra_deg, dec_deg, float(r.get("ra2", 0.0)), float(r.get("dec2", 0.0))
            )
            <= radius_deg
        ]

    def get_serendipity_feed(self, limit: int = 20) -> List[Dict[str, Any]]:
        records = self.get_all_tracklets(limit=200)
        records.sort(key=lambda r: float(r.get("isolation_anomaly_score", 0.0)), reverse=True)
        return records[:limit]

    def add_annotation(
        self, candidate_id: str, author: str, tag: str, comment: str
    ) -> Optional[Dict[str, Any]]:
        entry = {
            "author": author or "Team_Member",
            "tag": tag or "review",
            "comment": comment,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        records = self.get_all_tracklets(limit=500)
        for rec in records:
            if rec.get("candidate_id") == candidate_id:
                anns = list(rec.get("annotations", []))
                anns.append(entry)
                rec["annotations"] = anns
                return self.upsert_tracklet(rec)
        return None

    def record_blink_quest_vote(
        self, candidate_id: str, vote: str, user: str = "Observer"
    ) -> Optional[Dict[str, Any]]:
        vote_entry = {
            "user": user,
            "vote": vote,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        records = self.get_all_tracklets(limit=500)
        for rec in records:
            if rec.get("candidate_id") == candidate_id:
                votes = list(rec.get("human_vetting_labels", []))
                votes.append(vote_entry)
                rec["human_vetting_labels"] = votes
                if vote == "real_mover":
                    rec["ensemble_confidence_pct"] = min(
                        99.6, round(float(rec.get("ensemble_confidence_pct", 80.0)) + 2.5, 1)
                    )
                elif vote == "artifact":
                    rec["ensemble_confidence_pct"] = max(
                        5.0, round(float(rec.get("ensemble_confidence_pct", 50.0)) - 20.0, 1)
                    )
                return self.upsert_tracklet(rec)
        return None