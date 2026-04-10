"""tipo origen para cotizaciones

Revision ID: bc23de45fa67
Revises: ab12cd34ef56
Create Date: 2026-04-10 17:10:00

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "bc23de45fa67"
down_revision = "ab12cd34ef56"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("cotizaciones", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "tipo_origen",
                sa.String(length=20),
                nullable=False,
                server_default="cliente",
            )
        )
        batch_op.add_column(sa.Column("generado_por_admin_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_cotizaciones_tipo_origen", ["tipo_origen"], unique=False)
        batch_op.create_index("ix_cotizaciones_generado_por_admin_id", ["generado_por_admin_id"], unique=False)
        batch_op.create_foreign_key(
            "fk_cotizaciones_generado_por_admin",
            "usuarios",
            ["generado_por_admin_id"],
            ["id"],
            ondelete="SET NULL",
        )

    op.execute("UPDATE cotizaciones SET tipo_origen='cliente' WHERE tipo_origen IS NULL OR tipo_origen='' ")


def downgrade():
    with op.batch_alter_table("cotizaciones", schema=None) as batch_op:
        batch_op.drop_constraint("fk_cotizaciones_generado_por_admin", type_="foreignkey")
        batch_op.drop_index("ix_cotizaciones_generado_por_admin_id")
        batch_op.drop_index("ix_cotizaciones_tipo_origen")
        batch_op.drop_column("generado_por_admin_id")
        batch_op.drop_column("tipo_origen")
