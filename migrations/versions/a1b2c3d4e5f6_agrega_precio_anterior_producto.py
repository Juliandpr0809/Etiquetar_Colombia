"""agrega precio_anterior a producto (precio tachado)

Revision ID: a1b2c3d4e5f6
Revises: b6c41f7a0d12
Create Date: 2026-03-13

"""
from alembic import op
import sqlalchemy as sa


revision = "a1b2c3d4e5f6"
down_revision = "b6c41f7a0d12"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("productos", schema=None) as batch_op:
        batch_op.add_column(sa.Column("precio_anterior", sa.Numeric(precision=12, scale=2), nullable=True))


def downgrade():
    with op.batch_alter_table("productos", schema=None) as batch_op:
        batch_op.drop_column("precio_anterior")
