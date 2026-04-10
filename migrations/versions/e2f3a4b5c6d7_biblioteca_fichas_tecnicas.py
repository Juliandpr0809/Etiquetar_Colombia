"""biblioteca de fichas tecnicas e integracion con productos

Revision ID: e2f3a4b5c6d7
Revises: b0c1d2e3f4a5
Create Date: 2026-04-10 10:30:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e2f3a4b5c6d7"
down_revision = "b0c1d2e3f4a5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "fichas_tecnicas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=200), nullable=False),
        sa.Column("referencia", sa.String(length=120), nullable=False),
        sa.Column("marca", sa.String(length=120), nullable=True),
        sa.Column("categoria_id", sa.Integer(), nullable=True),
        sa.Column("linea", sa.String(length=20), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column("especificaciones", sa.JSON(), nullable=True),
        sa.Column("caracteristicas", sa.JSON(), nullable=True),
        sa.Column("componentes", sa.JSON(), nullable=True),
        sa.Column("garantia", sa.String(length=80), nullable=True),
        sa.Column("aplicacion", sa.Text(), nullable=True),
        sa.Column("ficha_pdf_url", sa.String(length=600), nullable=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["categoria_id"], ["categorias.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("referencia", name="uq_fichas_tecnicas_referencia"),
    )
    op.create_index("ix_fichas_tecnicas_nombre", "fichas_tecnicas", ["nombre"], unique=False)
    op.create_index("ix_fichas_tecnicas_linea", "fichas_tecnicas", ["linea"], unique=False)
    op.create_index("ix_fichas_tecnicas_categoria_id", "fichas_tecnicas", ["categoria_id"], unique=False)

    with op.batch_alter_table("productos", schema=None) as batch_op:
        batch_op.add_column(sa.Column("ficha_tecnica_id", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "estado_disponibilidad",
                sa.String(length=30),
                nullable=False,
                server_default="borrador",
            )
        )
        batch_op.create_index("ix_productos_ficha_tecnica_id", ["ficha_tecnica_id"], unique=True)
        batch_op.create_index("ix_productos_estado_disponibilidad", ["estado_disponibilidad"], unique=False)
        batch_op.create_foreign_key(
            "fk_productos_ficha_tecnica",
            "fichas_tecnicas",
            ["ficha_tecnica_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade():
    with op.batch_alter_table("productos", schema=None) as batch_op:
        batch_op.drop_constraint("fk_productos_ficha_tecnica", type_="foreignkey")
        batch_op.drop_index("ix_productos_estado_disponibilidad")
        batch_op.drop_index("ix_productos_ficha_tecnica_id")
        batch_op.drop_column("estado_disponibilidad")
        batch_op.drop_column("ficha_tecnica_id")

    op.drop_index("ix_fichas_tecnicas_categoria_id", table_name="fichas_tecnicas")
    op.drop_index("ix_fichas_tecnicas_linea", table_name="fichas_tecnicas")
    op.drop_index("ix_fichas_tecnicas_nombre", table_name="fichas_tecnicas")
    op.drop_table("fichas_tecnicas")
