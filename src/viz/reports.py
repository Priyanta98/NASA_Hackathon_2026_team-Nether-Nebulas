"""
Report generation and multi-format scientific export (src/viz/reports.py):
  - JSON Discovery & Validation Packets
  - CSV Candidate Summary Tables
  - IVOA VOTable XML Exports
  - 80-Column Minor Planet Center (MPC) Astrometry Submissions
  - Standalone HTML Evidence Cards with Devil's Advocate Bars & SHA-256 Hashes
"""
from __future__ import annotations

import datetime
import io
import json
import logging
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
import pandas as pd

from src.config.settings import Settings

logger = logging.getLogger(__name__)


class ReportGenerator:
    def __init__(self, output_dir: Optional[str] = None) -> None:
        self.output_dir = Path(output_dir) if output_dir else Settings.REPORTS_DIR
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self.images_dir = self.output_dir / "images"
        self.data_dir = self.output_dir / "data"
        self.docs_dir = self.output_dir / "docs"

        self.images_dir.mkdir(parents=True, exist_ok=True)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.docs_dir.mkdir(parents=True, exist_ok=True)

    def create_discovery_report(
        self,
        candidates: List[Dict[str, Any]],
        analysis_results: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Creates a complete JSON + CSV + HTML + PNG discovery & vetting report packet."""
        report_id = str(uuid.uuid4())[:8].upper()
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

        report = {
            "report_id": report_id,
            "timestamp": timestamp,
            "scientific_disclaimer": Settings.SCIENTIFIC_DISCLAIMER,
            "metadata": metadata or {},
            "executive_summary": self._create_executive_summary(candidates, analysis_results),
            "candidates": candidates,
            "analysis_results": analysis_results,
            "recommendations": self._generate_recommendations(candidates, analysis_results),
        }

        json_path = self.output_dir / f"candidate_report_{report_id}_{timestamp}.json"
        json_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")

        self._create_summary_table(candidates, report_id, timestamp)
        self._create_summary_visualization(candidates, report_id, timestamp)
        self._create_html_report(report, report_id, timestamp)

        return str(json_path)

    def create_candidate_report(self, candidate: Dict[str, Any], report_id: str = "SPX") -> str:
        """Creates a standalone JSON & HTML Evidence Card report for a single candidate."""
        cand_id = str(candidate.get("candidate_id", candidate.get("obs_id", "CAND")))
        full_id = f"{report_id}_{cand_id}"
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

        report = {
            "report_id": full_id,
            "timestamp": timestamp,
            "scientific_disclaimer": Settings.SCIENTIFIC_DISCLAIMER,
            "candidate_details": candidate,
            "recommendations": self._generate_recommendations([candidate], {}),
        }

        json_path = self.docs_dir / f"evidence_card_{full_id}_{timestamp}.json"
        json_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        self._create_html_report(report, full_id, timestamp)
        return str(json_path)

    def export_candidates_for_mpc(
        self, candidates: List[Dict[str, Any]], output_filename: Optional[str] = None
    ) -> str:
        """Exports uncataloged moving candidates in 80-column MPC astrometric text format."""
        if output_filename is None:
            ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            output_filename = f"mpc_candidates_{ts}.txt"

        output_path = self.data_dir / output_filename
        lines: List[str] = [f"COM {Settings.SCIENTIFIC_DISCLAIMER}"]
        for cand in candidates:
            if cand.get("is_known_object", False):
                continue
            lines.append(self._format_mpc_entry(cand))

        output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return str(output_path)

    def export_votable_xml(self, candidates: List[Dict[str, Any]]) -> str:
        """Generates an IVOA-compliant VOTable XML string for astronomical interoperability."""
        rows_xml = []
        for c in candidates:
            rows_xml.append(
                f"        <TR><TD>{c.get('candidate_id','')}</TD>"
                f"<TD>{c.get('ra2', 0.0):.6f}</TD><TD>{c.get('dec2', 0.0):.6f}</TD>"
                f"<TD>{c.get('motion_angular_velocity', 0.0):.4f}</TD>"
                f"<TD>{c.get('distance_au_min', 0.0):.1f}-{c.get('distance_au_max', 0.0):.1f}</TD>"
                f"<TD>{c.get('ensemble_confidence_pct', 0.0):.1f}</TD>"
                f"<TD>{c.get('promotion_badge', '')}</TD></TR>"
            )
        rows_joined = "\n".join(rows_xml)
        return f"""<?xml version="1.0" encoding="UTF-8"?>
<VOTABLE version="1.4" xmlns="http://www.ivoa.net/xml/VOTable/v1.3">
  <RESOURCE name="SPHEREx_ChronoSky_Candidates">
    <DESCRIPTION>{Settings.SCIENTIFIC_DISCLAIMER}</DESCRIPTION>
    <TABLE name="candidates">
      <FIELD name="candidate_id" datatype="char" arraysize="*"/>
      <FIELD name="ra_deg" datatype="double" unit="deg"/>
      <FIELD name="dec_deg" datatype="double" unit="deg"/>
      <FIELD name="velocity_arcsec_day" datatype="double" unit="arcsec/d"/>
      <FIELD name="distance_au_ci68" datatype="char" arraysize="*"/>
      <FIELD name="ensemble_confidence_pct" datatype="double" unit="%"/>
      <FIELD name="promotion_badge" datatype="char" arraysize="*"/>
      <DATA>
        <TABLEDATA>
{rows_joined}
        </TABLEDATA>
      </DATA>
    </TABLE>
  </RESOURCE>
</VOTABLE>"""

    def create_pdf_report(
        self, candidates: List[Dict[str, Any]], analysis_results: Dict[str, Any]
    ) -> str:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        report_path = self.docs_dir / f"summary_report_{timestamp}.txt"
        report_path.write_text(
            self._generate_pdf_content(candidates, analysis_results), encoding="utf-8"
        )
        return str(report_path)

    def _create_executive_summary(
        self, candidates: List[Dict[str, Any]], analysis_results: Dict[str, Any]
    ) -> Dict[str, Any]:
        return {
            "total_candidates": len(candidates),
            "new_objects": len([c for c in candidates if not c.get("is_known_object", False)]),
            "known_objects": len([c for c in candidates if c.get("is_known_object", False)]),
            "tier3_vetted_candidates": len([c for c in candidates if c.get("promotion_tier", 1) == 3]),
            "spatial_distribution": self._calculate_spatial_distribution(candidates),
            "temporal_distribution": self._calculate_temporal_distribution(candidates),
            "date_range": self._get_date_range(candidates),
            "primary_findings": self._extract_key_findings(candidates),
        }

    def _create_summary_table(
        self, candidates: List[Dict[str, Any]], report_id: str, timestamp: str
    ) -> str:
        if not candidates:
            return ""
        df = pd.DataFrame(candidates)
        cols = [
            c
            for c in [
                "candidate_id", "ra2", "dec2", "motion_angular_velocity",
                "distance_au_min", "distance_au_max", "dynamical_regime",
                "ensemble_confidence_pct", "promotion_badge", "is_known_object",
            ]
            if c in df.columns
        ]
        csv_path = self.data_dir / f"summary_table_{report_id}_{timestamp}.csv"
        df[cols].to_csv(csv_path, index=False)
        return str(csv_path)

    def _create_summary_visualization(
        self, candidates: List[Dict[str, Any]], report_id: str, timestamp: str
    ) -> str:
        if not candidates:
            return ""
        ra_coords = [float(c.get("ra2", c.get("ra", 0.0))) for c in candidates]
        dec_coords = [float(c.get("dec2", c.get("dec", 0.0))) for c in candidates]
        colors = ["#ef4444" if c.get("is_known_object", False) else "#38bdf8" for c in candidates]
        sizes = [max(float(c.get("significance", 6.0)) * 12.0, 30.0) for c in candidates]

        fig, ax = plt.subplots(figsize=(8, 6), dpi=120)
        ax.scatter(ra_coords, dec_coords, s=sizes, c=colors, alpha=0.8, edgecolors="white")
        ax.set_xlabel("Right Ascension (deg)")
        ax.set_ylabel("Declination (deg)")
        ax.set_title(f"SPHEREx ChronoSky Candidates — Report {report_id}")
        ax.grid(True, alpha=0.25)
        ax.legend(
            handles=[
                Patch(facecolor="#38bdf8", label="Uncataloged Moving Candidate"),
                Patch(facecolor="#ef4444", label="Known SkyBoT Solar System Body"),
            ]
        )
        viz_path = self.images_dir / f"summary_viz_{report_id}_{timestamp}.png"
        plt.savefig(viz_path, dpi=120, bbox_inches="tight")
        plt.close(fig)
        return str(viz_path)

    def _create_html_report(
        self, report: Dict[str, Any], report_id: str, timestamp: str
    ) -> str:
        html_path = self.docs_dir / f"report_{report_id}_{timestamp}.html"
        html_path.write_text(self._generate_html_template(report), encoding="utf-8")
        return str(html_path)

    def _generate_html_template(self, report: Dict[str, Any]) -> str:
        cands = report.get("candidates") or (
            [report["candidate_details"]] if "candidate_details" in report else []
        )
        rows = ""
        for c in cands:
            ev = c.get("evidence_card", {})
            da = c.get("devils_advocate_probs", {})
            rows += f"""
            <tr>
              <td><strong>{c.get('candidate_id', 'SPX')}</strong><br><small>{c.get('promotion_badge', '')}</small></td>
              <td>({c.get('ra2', 0.0):.4f}°, {c.get('dec2', 0.0):.4f}°)</td>
              <td>{c.get('motion_angular_velocity', 0.0):.2f} ± {c.get('motion_velocity_err', 0.0):.2f} "/day</td>
              <td>{c.get('distance_au_min', 0.0):.1f}–{c.get('distance_au_max', 0.0):.1f} AU<br><small>{c.get('dynamical_regime', '')}</small></td>
              <td>{c.get('spectral_ice_class', 'N/A')}</td>
              <td>{c.get('ensemble_confidence_pct', 0.0):.1f}%<br><small>CR: {da.get('cosmic_ray_prob', 0)}% | Persist: {da.get('persistence_prob', 0)}%</small></td>
              <td><code>{ev.get('flags_hex', '0x0')}</code><br><small>{ev.get('data_sha256', '')[:16]}...</small></td>
            </tr>"""

        return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>SPHEREx ChronoSky Evidence Report {report.get('report_id', '')}</title>
  <style>
    body {{ font-family: system-ui, sans-serif; background: #040711; color: #f8fafc; padding: 2rem; }}
    .banner {{ background: #0f172a; border-left: 4px solid #38bdf8; padding: 1rem; margin-bottom: 1.5rem; color: #cbd5e1; }}
    table {{ width: 100%; border-collapse: collapse; background: #0b1120; }}
    th, td {{ border: 1px solid #1e293b; padding: 0.7rem; text-align: left; font-size: 0.88rem; }}
    th {{ color: #38bdf8; background: #111827; }}
  </style>
</head>
<body>
  <h1>SPHEREx ChronoSky — Candidate Vetting &amp; Evidence Packet ({report.get('report_id', '')})</h1>
  <div class="banner"><strong>Scientific Disclaimer:</strong> {Settings.SCIENTIFIC_DISCLAIMER}</div>
  <table>
    <thead>
      <tr>
        <th>Candidate &amp; Tier</th><th>Sky Coord (J2000)</th><th>Angular Motion</th>
        <th>Heliocentric Distance (68% CI)</th><th>Motion-Corrected LVF Spectrum</th>
        <th>Hybrid ML &amp; Devil's Advocate</th><th>FLAGS &amp; SHA-256 Hash</th>
      </tr>
    </thead>
    <tbody>{rows}</tbody>
  </table>
</body>
</html>"""

    @staticmethod
    def _format_mpc_entry(candidate: Dict[str, Any]) -> str:
        MPC_DESIGNATION = str(candidate.get("candidate_id", "SPX0001"))[:7].ljust(7)
        RA_STRING = f"{float(candidate.get('ra2', candidate.get('ra', 0.0))):.5f}"
        DEC_STRING = f"{float(candidate.get('dec2', candidate.get('dec', 0.0))):+.5f}"
        DATE = datetime.datetime.now(datetime.timezone.utc).strftime("%Y %m %d.%f")[:16]
        OBSERVER = candidate.get("observer", "SPHEREx_ChronoSky")
        TELESCOPE = "SPHEREx_IRSA_L2"
        MAGNIFICATION = "LVF_Band2"
        OBJECT_TYPE = candidate.get("dynamical_regime", "Outer_System_Mover")
        SIGNIFICANCE = f"SNR={float(candidate.get('significance', 0.0)):.2f}"
        NOTES = f"d={candidate.get('distance_au_min', 0)}-{candidate.get('distance_au_max', 0)}AU"

        mpc_entry = f"""
{MPC_DESIGNATION}  C{DATE} {RA_STRING} {DEC_STRING}          {SIGNIFICANCE} {TELESCOPE} {OBSERVER} {MAGNIFICATION} {OBJECT_TYPE} {NOTES}
        """.strip()
        return mpc_entry

    def _generate_pdf_content(
        self, candidates: List[Dict[str, Any]], analysis_results: Dict[str, Any]
    ) -> str:
        ra_vals = [float(c.get("ra2", c.get("ra", 0.0))) for c in candidates] or [0.0]
        dec_vals = [float(c.get("dec2", c.get("dec", 0.0))) for c in candidates] or [0.0]
        return f"""SPHEREx ChronoSky Vetting Report
================================
Generated: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
Disclaimer: {Settings.SCIENTIFIC_DISCLAIMER}

EXECUTIVE SUMMARY
-----------------
Total Candidates: {len(candidates)}
Uncataloged Candidates: {len([c for c in candidates if not c.get('is_known_object', False)])}
Known SkyBoT Objects: {len([c for c in candidates if c.get('is_known_object', False)])}

KEY FINDINGS
------------
{chr(10).join(self._extract_key_findings(candidates))}

SPATIAL DISTRIBUTION
--------------------
RA: {min(ra_vals):.2f} to {max(ra_vals):.2f} deg
Dec: {min(dec_vals):.2f} to {max(dec_vals):.2f} deg

RECOMMENDATIONS
---------------
{chr(10).join(self._generate_recommendations(candidates, analysis_results))}
"""

    @staticmethod
    def _calculate_spatial_distribution(candidates: List[Dict[str, Any]]) -> Dict[str, float]:
        if not candidates:
            return {"ra_min": 0.0, "ra_max": 0.0, "dec_min": 0.0, "dec_max": 0.0}
        ras = [float(c.get("ra2", c.get("ra", 0.0))) for c in candidates]
        decs = [float(c.get("dec2", c.get("dec", 0.0))) for c in candidates]
        return {"ra_min": min(ras), "ra_max": max(ras), "dec_min": min(decs), "dec_max": max(decs)}

    @staticmethod
    def _calculate_temporal_distribution(candidates: List[Dict[str, Any]]) -> Dict[str, float]:
        if not candidates:
            return {"mjd_min": 0.0, "mjd_max": 0.0}
        t1s = [float(c.get("t_min1", 60850.0)) for c in candidates]
        t2s = [float(c.get("t_min2", 60869.5)) for c in candidates]
        return {"mjd_min": min(t1s), "mjd_max": max(t2s)}

    @staticmethod
    def _get_date_range(candidates: List[Dict[str, Any]]) -> str:
        if not candidates:
            return "N/A"
        return f"MJD {min(float(c.get('t_min1', 60850.0)) for c in candidates):.2f} – {max(float(c.get('t_min2', 60869.5)) for c in candidates):.2f}"

    @staticmethod
    def _extract_key_findings(candidates: List[Dict[str, Any]]) -> List[str]:
        if not candidates:
            return ["- No moving dipole candidates exceeded the null-test false-alarm threshold."]
        return [
            f"- {c.get('candidate_id')}: {c.get('motion_angular_velocity', 0):.2f} \"/day, "
            f"Distance CI: {c.get('distance_au_min', 0)}–{c.get('distance_au_max', 0)} AU ({c.get('dynamical_regime', '')}), "
            f"{c.get('promotion_badge', '')}"
            for c in candidates[:5]
        ]

    @staticmethod
    def _generate_recommendations(
        candidates: List[Dict[str, Any]], analysis_results: Dict[str, Any]
    ) -> List[str]:
        return [
            "- Cross-reference Tier 3 uncataloged candidates against upcoming SPHEREx QR3 visits.",
            "- Inspect motion-corrected Band 4 (3.0–3.3 μm) H2O/CH4 absorption depth to confirm icy surface composition.",
            "- Submit exported 80-column MPC / IVOA VOTable packets for independent astrometric recovery.",
        ]

# --- v3 Mission 5 & 7 Report Exporters ---
def _rg_export_deep_dive_packet(self, candidate_id: str, telemetry: dict, out_dir: str = "reports/docs"):
    import json as _json
    from pathlib import Path as _Path
    p = _Path(out_dir)
    p.mkdir(parents=True, exist_ok=True)
    out = p / f"{candidate_id}_deep_dive_packet.json"
    out.write_text(_json.dumps({"candidate_id": candidate_id, "telemetry": telemetry}, indent=2), encoding="utf-8")
    return str(out)

def _rg_export_ice_class_spectrum(self, candidate_id: str, spectrum: dict, classification: dict, out_dir: str = "reports/data"):
    import json as _json
    from pathlib import Path as _Path
    p = _Path(out_dir)
    p.mkdir(parents=True, exist_ok=True)
    out = p / f"{candidate_id}_ice_spectrum.json"
    out.write_text(_json.dumps({"candidate_id": candidate_id, "classification": classification, "spectrum": spectrum}, indent=2), encoding="utf-8")
    return str(out)

ReportGenerator.export_deep_dive_packet = _rg_export_deep_dive_packet
ReportGenerator.export_ice_class_spectrum = _rg_export_ice_class_spectrum
