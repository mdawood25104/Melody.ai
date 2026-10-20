"""Database engine, session dependency, and compatibility schema initialization."""

import os
from collections.abc import Generator

from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import Session

from app.models import Base, User


engine = create_engine(
    os.getenv("DATABASE_URL", "sqlite:///./melodyai.db"),
    pool_pre_ping=True,
)


def get_db() -> Generator[Session, None, None]:
    """Provide a request-scoped SQLAlchemy session."""
    with Session(engine) as session:
        yield session


def initialize_database() -> None:
    """Create tables and apply the small in-place upgrades used by existing installs."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    if "users" in existing_tables:
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if "name" not in user_columns:
            with engine.begin() as connection:
                connection.execute(
                    text("ALTER TABLE users ADD COLUMN name VARCHAR(100) NOT NULL DEFAULT ''")
                )

    Base.metadata.create_all(engine)

    generation_columns = {
        column["name"] for column in inspect(engine).get_columns("generations")
    }
    if "error_message" not in generation_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE generations ADD COLUMN error_message TEXT"))

    with Session(engine) as session:
        for user in session.scalars(select(User).where(User.name == "")):
            user.name = (
                user.email.partition("@")[0]
                .replace(".", " ")
                .replace("_", " ")
                .replace("-", " ")
                .title()
            )
        session.commit()
