"""productos avanzados y campos dinamicos por categoria

Revision ID: d5e6f7a8b9c0
Revises: c2d3e4f5a6b7
Create Date: 2026-04-09 18:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "d5e6f7a8b9c0"
down_revision = "c2d3e4f5a6b7"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("categorias", schema=None) as batch_op:
        batch_op.add_column(sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("1")))
        batch_op.add_column(sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")))

    with op.batch_alter_table("productos", schema=None) as batch_op:
        batch_op.add_column(sa.Column("marca", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("referencia", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("garantia_meses", sa.Integer(), nullable=True))

    op.create_table(
        "categoria_campos_tecnicos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("categoria_id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=120), nullable=False),
        sa.Column("slug", sa.String(length=140), nullable=False),
        sa.Column("tipo_dato", sa.String(length=20), nullable=False),
        sa.Column("unidad_medida", sa.String(length=30), nullable=True),
        sa.Column("obligatorio", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("opciones_json", sa.JSON(), nullable=True),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["categoria_id"], ["categorias.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("categoria_id", "slug", name="uq_categoria_slug_campo"),
    )
    with op.batch_alter_table("categoria_campos_tecnicos", schema=None) as batch_op:
        batch_op.create_index("ix_categoria_campos_tecnicos_categoria_id", ["categoria_id"], unique=False)
        batch_op.create_index("ix_categoria_campos_tecnicos_activo", ["activo"], unique=False)

    op.create_table(
        "producto_campo_tecnico_valores",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("producto_id", sa.Integer(), nullable=False),
        sa.Column("campo_tecnico_id", sa.Integer(), nullable=False),
        sa.Column("valor_texto", sa.Text(), nullable=True),
        sa.Column("valor_numero", sa.Numeric(precision=14, scale=4), nullable=True),
        sa.Column("valor_booleano", sa.Boolean(), nullable=True),
        sa.Column("valor_opcion", sa.String(length=120), nullable=True),
        sa.Column("valor_mostrar", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["campo_tecnico_id"], ["categoria_campos_tecnicos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["producto_id"], ["productos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("producto_id", "campo_tecnico_id", name="uq_producto_campo"),
    )
    with op.batch_alter_table("producto_campo_tecnico_valores", schema=None) as batch_op:
        batch_op.create_index("ix_producto_campo_tecnico_valores_producto_id", ["producto_id"], unique=False)
        batch_op.create_index("ix_producto_campo_tecnico_valores_campo_tecnico_id", ["campo_tecnico_id"], unique=False)

    op.create_table(
        "producto_caracteristicas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("producto_id", sa.Integer(), nullable=False),
        sa.Column("texto", sa.String(length=255), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["producto_id"], ["productos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("producto_caracteristicas", schema=None) as batch_op:
        batch_op.create_index("ix_producto_caracteristicas_producto_id", ["producto_id"], unique=False)

    op.create_table(
        "producto_contenido_kit",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("producto_id", sa.Integer(), nullable=False),
        sa.Column("texto", sa.String(length=255), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["producto_id"], ["productos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("producto_contenido_kit", schema=None) as batch_op:
        batch_op.create_index("ix_producto_contenido_kit_producto_id", ["producto_id"], unique=False)

    op.create_table(
        "producto_imagenes_adicionales",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("producto_id", sa.Integer(), nullable=False),
        sa.Column("imagen_public_id", sa.String(length=255), nullable=True),
        sa.Column("imagen_url", sa.String(length=600), nullable=False),
        sa.Column("alt_text", sa.String(length=180), nullable=True),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["producto_id"], ["productos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("producto_imagenes_adicionales", schema=None) as batch_op:
        batch_op.create_index("ix_producto_imagenes_adicionales_producto_id", ["producto_id"], unique=False)

    op.create_table(
        "producto_recomendados",
        sa.Column("producto_id", sa.Integer(), nullable=False),
        sa.Column("recomendado_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["producto_id"], ["productos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recomendado_id"], ["productos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("producto_id", "recomendado_id"),
    )
    with op.batch_alter_table("producto_recomendados", schema=None) as batch_op:
        batch_op.create_index("ix_producto_recomendados_producto_id", ["producto_id"], unique=False)
        batch_op.create_index("ix_producto_recomendados_recomendado_id", ["recomendado_id"], unique=False)


def downgrade():
    with op.batch_alter_table("producto_recomendados", schema=None) as batch_op:
        batch_op.drop_index("ix_producto_recomendados_recomendado_id")
        batch_op.drop_index("ix_producto_recomendados_producto_id")
    op.drop_table("producto_recomendados")

    with op.batch_alter_table("producto_imagenes_adicionales", schema=None) as batch_op:
        batch_op.drop_index("ix_producto_imagenes_adicionales_producto_id")
    op.drop_table("producto_imagenes_adicionales")

    with op.batch_alter_table("producto_contenido_kit", schema=None) as batch_op:
        batch_op.drop_index("ix_producto_contenido_kit_producto_id")
    op.drop_table("producto_contenido_kit")

    with op.batch_alter_table("producto_caracteristicas", schema=None) as batch_op:
        batch_op.drop_index("ix_producto_caracteristicas_producto_id")
    op.drop_table("producto_caracteristicas")

    with op.batch_alter_table("producto_campo_tecnico_valores", schema=None) as batch_op:
        batch_op.drop_index("ix_producto_campo_tecnico_valores_campo_tecnico_id")
        batch_op.drop_index("ix_producto_campo_tecnico_valores_producto_id")
    op.drop_table("producto_campo_tecnico_valores")

    with op.batch_alter_table("categoria_campos_tecnicos", schema=None) as batch_op:
        batch_op.drop_index("ix_categoria_campos_tecnicos_activo")
        batch_op.drop_index("ix_categoria_campos_tecnicos_categoria_id")
    op.drop_table("categoria_campos_tecnicos")

    with op.batch_alter_table("productos", schema=None) as batch_op:
        batch_op.drop_column("garantia_meses")
        batch_op.drop_column("referencia")
        batch_op.drop_column("marca")

    with op.batch_alter_table("categorias", schema=None) as batch_op:
        batch_op.drop_column("updated_at")
        batch_op.drop_column("activo")
