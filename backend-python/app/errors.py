from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.exceptions import AppError


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"error": exc.message})

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, str) else "error"
        return JSONResponse(status_code=exc.status_code, content={"error": detail})

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = exc.errors()
        msg = "validation failed"
        if errors:
            err = errors[0]
            loc = err.get("loc") or ()
            if "name" in loc:
                msg = "name is required"
            elif "item_id" in loc:
                msg = "invalid item id"
            else:
                detail = err.get("msg")
                if detail:
                    msg = str(detail)
        return JSONResponse(status_code=400, content={"error": msg})
