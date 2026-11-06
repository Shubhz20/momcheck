"""Database engine and session helpers."""
from __future__ import annotations

import logging
from collections.abc import Iterator

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from .config import get_settings

log = logging.getLogger("db")

_settings = get_settings()
_connect_args = {"check_same_thread": False} if _settings.database_url.startswith("sqlite") else {}
engine = create_engine(_settings.database_url, connect_args=_connect_args, pool_pre_ping=True)


def _sql_literal(value: object) -> str | None:
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    return None  # no default, or a callable default (e.g. timestamps)


def _add_missing_columns() -> None:
    """create_all() never alters existing tables, so add columns introduced after the first deploy.

    New columns are added as nullable, with the model's scalar default (existing rows get that value).
    """
    inspector = inspect(engine)
    quote = engine.dialect.identifier_preparer.quote
    with engine.begin() as conn:
        for table in SQLModel.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue
            existing = {c["name"] for c in inspector.get_columns(table.name)}
            for col in table.columns:
                if col.name in existing:
                    continue
                ddl = f"ALTER TABLE {quote(table.name)} ADD COLUMN {quote(col.name)} {col.type.compile(engine.dialect)}"
                literal = _sql_literal(getattr(col.default, "arg", None))
                if literal is not None:
                    ddl += f" DEFAULT {literal}"
                conn.execute(text(ddl))
                if col.index:
                    conn.execute(
                        text(f"CREATE INDEX IF NOT EXISTS {quote(f'ix_{table.name}_{col.name}')} ON {quote(table.name)} ({quote(col.name)})")
                    )
                log.info("Added column %s.%s", table.name, col.name)


def init_db() -> None:
    from . import models  # noqa: F401  (register tables)
    from .seed import ensure_demo_accounts

    SQLModel.metadata.create_all(engine)
    _add_missing_columns()
    with Session(engine) as session:
        ensure_demo_accounts(session)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
