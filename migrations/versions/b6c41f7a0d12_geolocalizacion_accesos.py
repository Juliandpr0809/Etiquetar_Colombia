"""geolocalizacion accesos

Revision ID: b6c41f7a0d12
Revises: 91b7f3c6aa42
Create Date: 2026-03-11 12:20:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "b6c41f7a0d12"
down_revision = "91b7f3c6aa42"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("accesos_pagina", schema=None) as batch_op:
        batch_op.add_column(sa.Column("ciudad", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("region", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("pais", sa.String(length=120), nullable=True))
        batch_op.create_index(batch_op.f("ix_accesos_pagina_ciudad"), ["ciudad"], unique=False)


def downgrade():
    with op.batch_alter_table("accesos_pagina", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_accesos_pagina_ciudad"))
        batch_op.drop_column("pais")
        batch_op.drop_column("region")
        batch_op.drop_column("ciudad")
