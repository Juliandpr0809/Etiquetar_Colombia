"""vencimiento automatico para cotizaciones

Revision ID: ab12cd34ef56
Revises: f9a8b7c6d5e4
Create Date: 2026-04-10 16:10:00

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "ab12cd34ef56"
down_revision = "f9a8b7c6d5e4"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("cotizaciones", schema=None) as batch_op:
        batch_op.add_column(sa.Column("validez_dias", sa.Integer(), nullable=False, server_default="30"))
        batch_op.add_column(sa.Column("fecha_vencimiento", sa.DateTime(), nullable=True))
        batch_op.create_index("ix_cotizaciones_fecha_vencimiento", ["fecha_vencimiento"], unique=False)


def downgrade():
    with op.batch_alter_table("cotizaciones", schema=None) as batch_op:
        batch_op.drop_index("ix_cotizaciones_fecha_vencimiento")
        batch_op.drop_column("fecha_vencimiento")
        batch_op.drop_column("validez_dias")
