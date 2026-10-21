class AppError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


class NotFoundError(AppError):
    def __init__(self, message: str = "item not found") -> None:
        super().__init__(404, message)


class BadRequestError(AppError):
    def __init__(self, message: str = "bad request") -> None:
        super().__init__(400, message)
