import logging

import structlog


def configurar_logs(json: bool) -> None:
    renderizador = structlog.processors.JSONRenderer() if json else structlog.dev.ConsoleRenderer()
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            renderizador,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    )
