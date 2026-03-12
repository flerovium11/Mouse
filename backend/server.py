import dotenv
dotenv.load_dotenv()

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uuid as uuid_lib
import os
import time
from typing import Optional, List

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

from models import (
    DumpRequest, GenRequest, DetailedGenRequest,
    RegisterResponse, GenResponse,
    Suggestion,
)
from ratelimit import dump_limiter, gen_limiter
from agent import Agent, UserContext
from gemini_agent import GeminiAgent, PROMPTS_DIR

# --- Config ---

EMBEDDING_DIM = 3072
BENCHMARK_MODE = os.getenv("BENCHMARK_MODE", "").lower() in ("1", "true", "yes")

# Authentication: set AUTH_TOKEN in .env (or environment) to require a
# Bearer token on every request.  Set DEV_MODE=true to skip the check
# entirely during local development.
AUTH_TOKEN: Optional[str] = os.getenv("AUTH_TOKEN")
print("[server] Authentication is " + ("disabled (no AUTH_TOKEN set)" if not AUTH_TOKEN else"enabled"))
# Show token value
DEV_MODE: bool = os.getenv("DEV_MODE", "").lower() in ("1", "true", "yes")
#BENCHMARK_MODE = True  # Force benchmark mode for now, to generate more data for prompt tuning

# --- Singletons ---

app = FastAPI(title="Mouse API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
qdrant = QdrantClient(":memory:")

# Primary agent used for actual responses
agent: Agent = GeminiAgent(name="Gemini-Original")

# All agents to evaluate in benchmark mode.
benchmark_agents: List[Agent] = [
    agent,
    GeminiAgent(
        name="Gemini-CoT",
        gen_prompt_path=os.path.join(PROMPTS_DIR, "gen_prompt_cot.txt"),
    ),
    GeminiAgent(
        name="Gemini-Strict",
        gen_prompt_path=os.path.join(PROMPTS_DIR, "gen_prompt_strict.txt"),
    ),
    GeminiAgent(
        name="Gemini-Minimal",
        gen_prompt_path=os.path.join(PROMPTS_DIR, "gen_prompt_minimal.txt"),
    ),
]

# Track registered users
registered_users: set[str] = set()


# --- Helpers ---

def _ensure_all_collections(user_id: str):
    """Create Qdrant collections for all registered agents for this user."""
    existing = {c.name for c in qdrant.get_collections().collections}
    for a in benchmark_agents:
        col_name = a.collection_name(user_id)
        if col_name not in existing:
            qdrant.create_collection(
                col_name,
                vectors_config=VectorParams(
                    size=EMBEDDING_DIM,
                    distance=Distance.COSINE,
                ),
            )


def _verify_auth(authorization: Optional[str]) -> None:
    """Check the Authorization header unless DEV_MODE is enabled."""
    if DEV_MODE:
        return
    # If no AUTH_TOKEN is configured server-side, treat auth as disabled.
    if not AUTH_TOKEN:
        return
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or token != AUTH_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid or expired token")


def _get_user_id(x_user_id: Optional[str]) -> str:
    """Validate the X-User-Id header and auto-register if needed."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header")
    # Auto-register users that were registered before a server restart
    if x_user_id not in registered_users:
        registered_users.add(x_user_id)
        _ensure_all_collections(x_user_id)
    return x_user_id


# --- Routes ---

@app.post("/register", response_model=RegisterResponse)
async def register(authorization: Optional[str] = Header(None)):
    """Register a new user and return a UUID."""
    _verify_auth(authorization)
    user_id = str(uuid_lib.uuid4())
    registered_users.add(user_id)
    _ensure_all_collections(user_id)
    return RegisterResponse(uuid=user_id)


@app.post("/dump")
async def dump(body: DumpRequest, x_user_id: Optional[str] = Header(None), authorization: Optional[str] = Header(None)):
    """Store a visited page's chunks in the user's vector DB collection."""
    _verify_auth(authorization)
    user_id = _get_user_id(x_user_id)
    dump_limiter.check(user_id)
    result = agent.dump(user_id, qdrant, body)

    if BENCHMARK_MODE:
        for a in benchmark_agents:
            if a is not agent:
                a.dump(user_id, qdrant, body)

    return result


def _benchmark_log(agent_name: str, suggestions: List[Suggestion], elapsed: float):
    """Print a single agent's benchmark results to the console."""
    print(f"  [{agent_name}] ({elapsed:.2f}s) →")
    if suggestions:
        for s in suggestions:
            print(f"    • {s.text}")
    else:
        print("    (no suggestions)")


@app.post("/gen", response_model=GenResponse)
async def gen(body: GenRequest, x_user_id: Optional[str] = Header(None), authorization: Optional[str] = Header(None)):
    """Generate autocomplete suggestions for the current element."""
    _verify_auth(authorization)
    user_id = _get_user_id(x_user_id)
    gen_limiter.check(user_id)
    print(f"[mouse] gen result={body}")

    t0 = time.perf_counter()
    suggestions = agent.generate(user_id, qdrant, body)
    elapsed = time.perf_counter() - t0

    if BENCHMARK_MODE:
        print(f"\n{'='*60}")
        print(f"BENCHMARK — element: <{body.element.tag}> value=\"{body.element.value or ''}\"")
        print(f"{'='*60}")
        _benchmark_log(agent.name, suggestions, elapsed)

        for a in benchmark_agents:
            if a is not agent:
                t1 = time.perf_counter()
                alt_suggestions = a.generate(user_id, qdrant, body)
                alt_elapsed = time.perf_counter() - t1
                _benchmark_log(a.name, alt_suggestions, alt_elapsed)

        print(f"{'='*60}\n")

    return GenResponse(suggestions=suggestions)


@app.post("/gen-detailed", response_model=GenResponse)
async def gen_detailed(body: DetailedGenRequest, x_user_id: Optional[str] = Header(None), authorization: Optional[str] = Header(None)):
    """Generate autocomplete suggestions with additional user-provided context."""
    _verify_auth(authorization)
    user_id = _get_user_id(x_user_id)
    gen_limiter.check(user_id)

    t0 = time.perf_counter()
    ctx = UserContext(text=body.additionalDetails, images=body.images or [])
    suggestions = agent.generate(user_id, qdrant, body, user_context=ctx)
    elapsed = time.perf_counter() - t0

    if BENCHMARK_MODE:
        print(f"\n{'='*60}")
        print(f"BENCHMARK (detailed) — element: <{body.element.tag}> value=\"{body.element.value or ''}\"")
        print(f"  Additional details: {body.additionalDetails or '(none)'}")
        print(f"{'='*60}")
        _benchmark_log(agent.name, suggestions, elapsed)

        for a in benchmark_agents:
            if a is not agent:
                t1 = time.perf_counter()
                alt_suggestions = a.generate(user_id, qdrant, body, user_context=ctx)
                alt_elapsed = time.perf_counter() - t1
                _benchmark_log(a.name, alt_suggestions, alt_elapsed)

        print(f"{'='*60}\n")

    return GenResponse(suggestions=suggestions)
