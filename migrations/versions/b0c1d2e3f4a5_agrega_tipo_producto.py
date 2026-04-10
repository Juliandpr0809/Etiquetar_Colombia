"""agrega tipo_producto a productos

Revision ID: b0c1d2e3f4a5
Revises: a7b8c9d0e1f2
Create Date: 2026-04-09 18:40:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b0c1d2e3f4a5"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "productos",
        sa.Column("tipo_producto", sa.String(length=20), nullable=False, server_default="estandar"),
    )
    op.create_index("ix_productos_tipo_producto", "productos", ["tipo_producto"], unique=False)
    op.execute("UPDATE productos SET tipo_producto = 'kit' WHERE es_kit = 1")


def downgrade():
    op.drop_index("ix_productos_tipo_producto", table_name="productos")
    op.drop_column("productos", "tipo_producto")