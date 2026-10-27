"""POST /api/chat — the "Ask my agent" endpoint (a Vercel Python serverless function)."""
import os
import sys
import time
from collections import defaultdict, deque
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).parent))

# Local development: read .env (Vercel injects env vars itself).
_env = Path(__file__).resolve().parents[1] / ".env"
if _env.exists():
    for line in _env.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

from _agent.graph import ask  # noqa: E402

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

LIMIT, WINDOW = 15, 600  # 15 questions per IP per 10 minutes (per warm instance)
_hits = defaultdict(deque)
FALLBACK = "The agent is busy right now. Please email Wajahat at muhammad.wajahat221@gmail.com — he'll get back to you."


class Msg(BaseModel):
    role: str
    content: str = Field(max_length=2000)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    history: list[Msg] = Field(default_factory=list, max_length=12)


def _limited(ip):
    now, q = time.time(), _hits[ip]
    while q and now - q[0] > WINDOW:
        q.popleft()
    if len(q) >= LIMIT:
        return True
    q.append(now)
    return False


@app.post("/api/chat")
def chat(body: ChatIn, request: Request):
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0].strip()
    if _limited(ip):
        return JSONResponse({"answer": "You've asked a lot of questions in a short time — try again in a few minutes, or email Wajahat directly.", "trace": ["rate limit"]}, status_code=429)
    try:
        return ask(body.message.strip(), [m.model_dump() for m in body.history])
    except Exception as e:  # never leak internals to the browser
        print("chat error:", repr(e))
        return JSONResponse({"answer": FALLBACK, "trace": ["error → fallback"]}, status_code=503)
