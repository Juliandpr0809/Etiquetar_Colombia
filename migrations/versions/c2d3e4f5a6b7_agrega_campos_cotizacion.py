"""agrega campos a tabla cotizaciones

Revision ID: c2d3e4f5a6b7
Revises: b6c41f7a0d12
Create Date: 2026-03-18 10:25:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c2d3e4f5a6b7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("cotizaciones", schema=None) as batch_op:
        batch_op.add_column(sa.Column("numero", sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column("empresa", sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column("linea", sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column("tipo_solicitud", sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column("productos", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("info_adicional", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("fecha_creacion", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("token_consulta", sa.String(length=64), nullable=True))
        batch_op.create_unique_constraint("uq_cotizaciones_numero", ["numero"])
        batch_op.create_unique_constraint("uq_cotizaciones_token", ["token_consulta"])


def downgrade():
    with op.batch_alter_table("cotizaciones", schema=None) as batch_op:
        batch_op.drop_constraint("uq_cotizaciones_token", type_="unique")
        batch_op.drop_constraint("uq_cotizaciones_numero", type_="unique")
        batch_op.drop_column("token_consulta")
        batch_op.drop_column("fecha_creacion")
        batch_op.drop_column("info_adicional")
        batch_op.drop_column("productos")
        batch_op.drop_column("tipo_solicitud")
        batch_op.drop_column("linea")
        batch_op.drop_column("empresa")
        batch_op.drop_column("numero")
