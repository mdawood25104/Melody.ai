"""Consistent API error responses with request IDs for log correlation."""

import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


logger = logging.getLogger("melodyai")


def register_error_handlers(app: FastAPI) -> None:
    """Install request correlation and normalized error response handlers."""

    @app.middleware("http")
    async def attach_request_id(request: Request, call_next):
        request.state.request_id = str(uuid.uuid4())
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    def error_response(
        request: Request,
        status_code: int,
        detail: object,
        headers: dict[str, str] | None = None,
    ) -> JSONResponse:
        request_id = getattr(request.state, "request_id", "unavailable")
        return JSONResponse(
            status_code=status_code,
            content={"detail": detail, "request_id": request_id},
            headers={"X-Request-ID": request_id, **(headers or {})},
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(request: Request, exc: StarletteHTTPException):
        return error_response(request, exc.status_code, exc.detail, exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError):
        errors = [
            {
                "field": ".".join(str(part) for part in error["loc"] if part != "body"),
                "message": error["msg"],
            }
            for error in exc.errors()
        ]
        return error_response(request, 422, errors)

    @app.exception_handler(Exception)
    async def unexpected_error_handler(request: Request, exc: Exception):
        logger.exception(
            "Unhandled request error request_id=%s method=%s path=%s",
            getattr(request.state, "request_id", "unavailable"),
            request.method,
            request.url.path,
        )
        return error_response(request, 500, "An unexpected server error occurred.")
