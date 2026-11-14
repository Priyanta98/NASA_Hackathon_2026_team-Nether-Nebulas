"""
All-Sky Mollweide Region Selector, Coverage Constraint Overlay, and Multi-Epoch
Sequence Visualizations (src/viz/sky_map.py) for SPHEREx ChronoSky.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import numpy as np
import plotly.graph_objects as go

from src.config.settings import Settings

logger = logging.getLogger(__name__)


class SkyMapVisualizer:
    def __init__(self) -> None:
        self.default_color = "#38bdf8"
        self.selection_color = "#f59e0b"
        self.selected_region: Optional[Dict[str, Any]] = None

    def create_all_sky_map(
        self,
        observations: List[Dict[str, Any]],
        selected_region: Optional[Dict[str, Any]] = None,
        show_corridors: bool = True,
    ) -> go.Figure:
        """
        Creates an interactive Mollweide all-sky map displaying SPHEREx observations,
        constrained search probability corridors, and the active search circle.
        """
        fig = go.Figure()

        if show_corridors:
            for corr in Settings.PROBABILITY_CORRIDORS:
                fig = self._add_selected_region(
                    fig,
                    {
                        "ra": corr["ra_center"],
                        "dec": corr["dec_center"],
                        "radius_deg": corr["span_deg"],
                    },
                    name=corr["zone_name"],
                    color="rgba(139, 92, 246, 0.35)",
                )

        if observations:
            ra_coords = [float(obs.get("ra", 0.0)) for obs in observations]
            dec_coords = [float(obs.get("dec", 0.0)) for obs in observations]
            flux_values = [max(float(obs.get("flux", 1.0)), 0.1) for obs in observations]

            fig.add_trace(
                go.Scattergeo(
                    lon=ra_coords,
                    lat=dec_coords,
                    text=[
                        f"ID: {obs.get('obs_id', '')}<br>MJD: {obs.get('t_min', 0):.2f}<br>Band: {obs.get('detector_band', 2)}"
                        for obs in observations
                    ],
                    mode="markers",
                    marker=dict(
                        size=np.clip(np.power(flux_values, 0.35) * 2.2, 5.0, 14.0),
                        color=flux_values,
                        colorscale="Viridis",
                        colorbar=dict(title="Exposure / Flux"),
                        opacity=0.82,
                    ),
                    name="SPHEREx Observations",
                )
            )

        if selected_region:
            rad_deg = float(selected_region.get("radius_deg", selected_region.get("radius_arcsec", 600.0) / 3600.0))
            fig = self._add_selected_region(
                fig,
                {
                    "ra": selected_region.get("ra", 304.69),
                    "dec": selected_region.get("dec", 42.44),
                    "radius_deg": max(rad_deg, 1.5),
                },
                name="Selected Search Region",
                color="rgba(56, 189, 248, 0.35)",
            )

        fig.update_layout(
            title="SPHEREx All-Sky Coverage & Constrained Search Corridors (Mollweide)",
            geo=dict(
                projection_type="mollweide",
                showland=False,
                showocean=True,
                oceancolor="rgb(6, 10, 22)",
                showcountries=False,
                showcoastlines=False,
                bgcolor="rgb(4, 7, 17)",
                lonaxis=dict(showgrid=True, gridcolor="rgba(148, 163, 184, 0.18)"),
                lataxis=dict(showgrid=True, gridcolor="rgba(148, 163, 184, 0.18)"),
            ),
            paper_bgcolor="#040711",
            font=dict(color="#f8fafc"),
            height=540,
            margin=dict(l=10, r=10, t=45, b=10),
            showlegend=True,
        )
        return fig

    def _add_selected_region(
        self,
        fig: go.Figure,
        region: Dict[str, Any],
        name: str = "Selected Region",
        color: str = "rgba(245, 158, 11, 0.25)",
    ) -> go.Figure:
        ra_c = float(region.get("ra", 0.0))
        dec_c = float(region.get("dec", 0.0))
        rad = float(region.get("radius_deg", 2.0))

        angles = np.linspace(0.0, 2.0 * np.pi, 72)
        ra_circle = (ra_c + rad * np.cos(angles)) % 360.0
        dec_circle = np.clip(dec_c + rad * np.sin(angles), -89.5, 89.5)

        fig.add_trace(
            go.Scattergeo(
                lon=ra_circle,
                lat=dec_circle,
                mode="lines",
                line=dict(color="#38bdf8", width=2),
                fill="toself",
                fillcolor=color,
                name=name,
            )
        )
        return fig

    def create_3d_observation_viewer(self, observations: List[Dict[str, Any]]) -> go.Figure:
        if not observations:
            return go.Figure()

        t0 = min(float(o.get("t_min", 60850.0)) for o in observations)
        days = [float(o.get("t_min", t0)) - t0 for o in observations]

        fig = go.Figure(
            data=[
                go.Scatter3d(
                    x=[float(o.get("ra", 0.0)) for o in observations],
                    y=[float(o.get("dec", 0.0)) for o in observations],
                    z=days,
                    mode="markers",
                    marker=dict(size=5, color=days, colorscale="Viridis", opacity=0.85),
                    text=[f"ID: {o.get('obs_id', '')}" for o in observations],
                    name="Observations",
                )
            ]
        )
        fig.update_layout(
            title="SPHEREx 3D Observation Cube",
            scene=dict(
                xaxis_title="RA (deg)",
                yaxis_title="Dec (deg)",
                zaxis_title="Days Elapsed",
                aspectratio=dict(x=1, y=1, z=0.8),
                aspectmode="manual",
            ),
            height=540,
        )
        return fig

    def create_observation_sequence_viewer(
        self, epochs: List[List[Dict[str, Any]]]
    ) -> go.Figure:
        if not epochs:
            return go.Figure()

        frames = []
        for idx, ep in enumerate(epochs):
            frames.append(
                go.Frame(
                    data=[
                        go.Scattergeo(
                            lon=[o.get("ra", 0.0) for o in ep],
                            lat=[o.get("dec", 0.0) for o in ep],
                            mode="markers",
                            marker=dict(size=7, color="#38bdf8"),
                        )
                    ],
                    name=f"Epoch {idx + 1}",
                )
            )
        return go.Figure(data=frames[0].data, frames=frames)