"""agrega tipo kit y componentes

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6
Create Date: 2026-04-09 20:10:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a7b8c9d0e1f2"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "productos",
        sa.Column("es_kit", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "productos",
        sa.Column("aplicacion_recomendada", sa.Text(), nullable=True),
    )
    op.create_index("ix_productos_es_kit", "productos", ["es_kit"], unique=False)

    op.create_table(
        "kit_productos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("kit_id", sa.Integer(), nullable=False),
        sa.Column("producto_id", sa.Integer(), nullable=False),
        sa.Column("cantidad", sa.Numeric(10, 2), nullable=False, server_default="1"),
        sa.Column("nota", sa.String(length=255), nullable=True),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["kit_id"], ["productos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["producto_id"], ["productos.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("kit_id", "producto_id", name="uq_kit_producto_unico"),
    )
    op.create_index("ix_kit_productos_kit_id", "kit_productos", ["kit_id"], unique=False)
    op.create_index("ix_kit_productos_producto_id", "kit_productos", ["producto_id"], unique=False)


def downgrade():
    op.drop_index("ix_kit_productos_producto_id", table_name="kit_productos")
    op.drop_index("ix_kit_productos_kit_id", table_name="kit_productos")
    op.drop_table("kit_productos")

    op.drop_index("ix_productos_es_kit", table_name="productos")
    op.drop_column("productos", "aplicacion_recomendada")
    op.drop_column("productos", "es_kit")
