"""destacados home admin

Revision ID: c9d8e7f6a5b4
Revises: bc23de45fa67
Create Date: 2026-04-10 11:10:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c9d8e7f6a5b4"
down_revision = "bc23de45fa67"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "destacados_home",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("producto_id", sa.Integer(), nullable=False),
        sa.Column("tab_nombre", sa.String(length=120), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("creado_en", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["producto_id"], ["productos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("producto_id", name="uq_destacados_home_producto_id"),
    )
    op.create_index("ix_destacados_home_producto_id", "destacados_home", ["producto_id"], unique=False)
    op.create_index("ix_destacados_home_orden", "destacados_home", ["orden"], unique=False)
    op.create_index("ix_destacados_home_activo", "destacados_home", ["activo"], unique=False)


def downgrade():
    op.drop_index("ix_destacados_home_activo", table_name="destacados_home")
    op.drop_index("ix_destacados_home_orden", table_name="destacados_home")
    op.drop_index("ix_destacados_home_producto_id", table_name="destacados_home")
    op.drop_table("destacados_home")
