"""
One-command launcher for SPHEREx ChronoSky (FastAPI Backend + Interactive 3D Website).
Run with:
    python run_app.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


def main() -> int:
    print("🚀 Starting SPHEREx ChronoSky v5 (FastAPI + 3D Documentary Web Workbench)...")
    print("=" * 72)

    required_files = [
        "src/config/settings.py",
        "src/utils/helpers.py",
        "src/api/spherex_client.py",
        "src/io/fits_handler.py",
        "src/processing/image_processor.py",
        "src/detection/moving_object.py",
        "src/detection/ml_detector.py",
        "src/validation/validator.py",
        "src/catalog/crossmatch.py",
        "src/db/database.py",
        "src/viz/reports.py",
        "backend/main.py",
        "frontend/index.html",
        "frontend/style.css",
        "frontend/globe3d.js",
        "frontend/app.js",
    ]

    missing = [f for f in required_files if not (ROOT_DIR / f).exists()]
    if missing:
        print(f"❌ Missing required files: {missing}")
        return 1

    print("📦 Checking Python dependencies...")
    try:
        import fastapi  # noqa: F401
        import uvicorn  # noqa: F401
        import numpy  # noqa: F401
        import pandas  # noqa: F401
        import scipy  # noqa: F401
        import sklearn  # noqa: F401
        import skimage  # noqa: F401
        import matplotlib  # noqa: F401
        import requests  # noqa: F401

        print("✅ All core dependencies are installed.")
    except ImportError as exc:
        print(f"⚠️ Missing dependency: {exc}")
        print("Run: python -m pip install -r requirements.txt")
        return 1

    port = int(os.environ.get("PORT", "8000"))
    print(f"\n🌌 SPHEREx ChronoSky 3D Web Workbench running at: http://127.0.0.1:{port}")
    print(f"📘 Interactive FastAPI Swagger Docs running at:   http://127.0.0.1:{port}/docs")
    print("Press Ctrl+C to stop the server.\n")

    try:
        import uvicorn

        uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=True)
        return 0
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user.")
        return 0


if __name__ == "__main__":
    sys.exit(main())