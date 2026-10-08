import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import DATABASE_URL
from app.modelos import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def executar_offline() -> None:
    context.configure(url=DATABASE_URL, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def _migrar(conexao) -> None:
    context.configure(connection=conexao, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def executar_online() -> None:
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conexao:
        await conexao.run_sync(_migrar)
    await engine.dispose()


if context.is_offline_mode():
    executar_offline()
else:
    asyncio.run(executar_online())
