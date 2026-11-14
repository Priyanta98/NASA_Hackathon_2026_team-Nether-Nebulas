"""
3D Viewer - Plotly 3-D scatter of SPHEREx observations.
"""
import logging
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from src.api.spherex_client import SPHERExClient

logger = logging.getLogger(__name__)


class SPHEREx3DViewer:
    def __init__(self, client: SPHERExClient):
        self.client = client

    def make_figure(
        self,
        ra: float,
        dec: float,
        radius_arcsec: float = 600,
        collection: str = "spherex_qr3",
    ) -> go.Figure:
        """
        Build a Plotly 3-D scatter of observations inside the requested sky region.
        Axes:
            x -> Right Ascension (deg)
            y -> Declination (deg)
            z -> Days since first observation (MJD offset)
        """
        obs = self.client.query_observations_by_position(
            ra=ra,
            dec=dec,
            radius_arcsec=radius_arcsec,
            collection=collection,
        )
        if not obs:
            logger.warning("No observations found for the selected region.")
            return go.Figure()

        df = pd.DataFrame(obs)
        t0 = float(df["t_min"].min())
        df["days_elapsed"] = df["t_min"] - t0

        fig = go.Figure(
            data=go.Scatter3d(
                x=df["ra"],
                y=df["dec"],
                z=df["days_elapsed"],
                mode="markers",
                marker=dict(
                    size=5,
                    color=df["days_elapsed"],
                    colorscale="Viridis",
                    colorbar=dict(title="Days"),
                    opacity=0.85,
                ),
                text=[
                    f"ID: {o['obs_id']}<br>RA: {o['ra']:.4f}°<br>Dec: {o['dec']:.4f}°<br>MJD: {o['t_min']:.2f}"
                    for o in df.to_dict("records")
                ],
                hoverinfo="text",
            )
        )

        fig.update_layout(
            title=f"SPHEREx 3-D Observation Geometry ({len(df)} epochs)",
            scene=dict(
                xaxis_title="RA (deg)",
                yaxis_title="Dec (deg)",
                zaxis_title=f"Days Since MJD {t0:.1f}",
                aspectratio=dict(x=1, y=1, z=0.8),
                aspectmode="manual",
            ),
            height=600,
            margin=dict(l=0, r=0, t=40, b=0),
        )
        return fig

    def render_page(self):
        """Render the 3-D Viewer page inside Streamlit."""
        st.title("🚀 3-D Observation Geometry")
        st.markdown(
            """
            **Select a sky region** and explore the 3-D positions of the observations.
            The axes are:
            - **X** – Right Ascension (degrees)
            - **Y** – Declination (degrees)
            - **Z** – Days since first observation (MJD offset)
            """
        )

        ra = st.slider("Right Ascension (deg)", 0.0, 360.0, 304.69, key="3d_ra")
        dec = st.slider("Declination (deg)", -90.0, 90.0, 42.44, key="3d_dec")
        radius = st.slider("Search radius (arcsec)", 10, 3600, 600, key="3d_radius")
        collection = st.selectbox(
            "Data collection",
            ["spherex_qr2", "spherex_qr3", "spherex_qr3_deep", "spherex_qr2_deep"],
            key="3d_collection",
        )

        if st.button("Refresh 3-D view"):
            with st.spinner("Fetching observations..."):
                fig = self.make_figure(ra, dec, radius, collection)
                st.plotly_chart(fig, use_container_width=True)

        if st.checkbox("Show statistics"):
            obs = self.client.query_observations_by_position(
                ra=ra, dec=dec, radius_arcsec=radius, collection=collection
            )
            if obs:
                df = pd.DataFrame(obs)
                st.write(
                    f"Found {len(obs)} observations  \n"
                    f"RA range: {df['ra'].min():.2f} → {df['ra'].max():.2f}°  \n"
                    f"Dec range: {df['dec'].min():.2f} → {df['dec'].max():.2f}°  \n"
                    f"Time span: {df['t_min'].min():.2f} → {df['t_min'].max():.2f} MJD"
                )