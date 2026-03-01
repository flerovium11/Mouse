import time
from collections import defaultdict
from fastapi import HTTPException


class RateLimiter:
    """Simple in-memory sliding-window rate limiter, keyed by user ID."""

    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)

    def check(self, user_id: str) -> None:
        """Raise 429 if the user has exceeded the rate limit."""
        now = time.monotonic()
        cutoff = now - self.window_seconds

        # Prune old entries
        hits = self._hits[user_id]
        self._hits[user_id] = hits = [t for t in hits if t > cutoff]

        if len(hits) >= self.max_requests:
            retry_after = int(hits[0] - cutoff) + 1
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Try again in {retry_after}s.",
                headers={"Retry-After": str(retry_after)},
            )

        hits.append(now)


# /dump  — generous: 30 requests per 60 s (page navigations)
dump_limiter = RateLimiter(max_requests=30, window_seconds=60)

# /gen   — tighter: 10 requests per 60 s (each hits Gemini)
gen_limiter = RateLimiter(max_requests=10, window_seconds=60)
