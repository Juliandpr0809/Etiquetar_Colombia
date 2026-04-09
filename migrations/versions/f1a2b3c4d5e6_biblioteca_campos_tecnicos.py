"""biblioteca campos tecnicos reutilizables

Revision ID: f1a2b3c4d5e6
Revises: c33ed85356e1
Create Date: 2026-04-09 18:15:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f1a2b3c4d5e6"
down_revision = "c33ed85356e1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "campos_tecnicos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=140), nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("unidad_defecto", sa.String(length=40), nullable=True),
        sa.Column("categoria_sugerida", sa.String(length=80), nullable=True),
        sa.Column("veces_usado", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("nombre", "tipo", name="uq_campos_tecnicos_nombre_tipo"),
    )
    op.create_index("ix_campos_tecnicos_nombre", "campos_tecnicos", ["nombre"], unique=False)
    op.create_index("ix_campos_tecnicos_veces_usado", "campos_tecnicos", ["veces_usado"], unique=False)


def downgrade():
    op.drop_index("ix_campos_tecnicos_veces_usado", table_name="campos_tecnicos")
    op.drop_index("ix_campos_tecnicos_nombre", table_name="campos_tecnicos")
    op.drop_table("campos_tecnicos")
