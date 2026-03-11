"""agrega campos de perfil de usuario

Revision ID: 4a0f9d2e1c31
Revises: 984121d58751
Create Date: 2026-03-11 10:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "4a0f9d2e1c31"
down_revision = "984121d58751"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("usuarios", schema=None) as batch_op:
        batch_op.add_column(sa.Column("ciudad", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("direccion", sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column("foto_url", sa.String(length=600), nullable=True))


def downgrade():
    with op.batch_alter_table("usuarios", schema=None) as batch_op:
        batch_op.drop_column("foto_url")
        batch_op.drop_column("direccion")
        batch_op.drop_column("ciudad")
