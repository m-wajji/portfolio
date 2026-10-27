"""Local preview with the agent: builds the site, then serves dist/ and /api/chat together.

    .venv/Scripts/python dev.py     ->  http://localhost:8000
"""
import sys
from pathlib import Path

import uvicorn
from fastapi.staticfiles import StaticFiles

import build

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "api"))

if __name__ == "__main__":
    build.build()
    from chat import app  # api/chat.py

    app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="site")
    uvicorn.run(app, host="127.0.0.1", port=int(sys.argv[1]) if len(sys.argv) > 1 else 8000)
