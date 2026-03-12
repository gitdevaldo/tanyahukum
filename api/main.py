"""TanyaHukum FastAPI Backend."""
import os
import uuid
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from api.config import settings
from api.routers import analyze, chat, health, booking

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# H-04: Rate limiter (shared instance used by routers via app.state.limiter)
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])


# E-02: Graceful shutdown — close MongoDB on app teardown
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("TanyaHukum API starting up")
    yield
    # Shutdown: close MongoDB connections
    try:
        from api.services.rag import _client
        if _client:
            _client.close()
            logger.info("MongoDB connection closed")
    except Exception:
        pass
    logger.info("TanyaHukum API shut down")


# H-06: Disable docs in production
is_dev = os.getenv("ENV", "production") == "dev"

app = FastAPI(
    title="TanyaHukum API",
    description="Indonesian Legal Contract Risk Analysis API",
    version="1.0.0",
    docs_url="/docs" if is_dev else None,
    redoc_url="/redoc" if is_dev else None,
    lifespan=lifespan,
)

# Attach rate limiter to app
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# M-08: Security response headers middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response


# E-01: Request tracing middleware — adds X-Request-ID
class RequestTracingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:8])
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestTracingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key", "X-Request-ID"],
)

app.include_router(analyze.router, prefix="/api", tags=["Analysis"])
app.include_router(chat.router, prefix="/api", tags=["Chat"])
app.include_router(booking.router, prefix="/api", tags=["Booking"])
app.include_router(health.router, prefix="/api", tags=["Health"])


@app.get("/")
async def root():
    return {"service": "TanyaHukum API", "status": "running"}
