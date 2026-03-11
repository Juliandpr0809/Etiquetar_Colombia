"""modulo admin negocio

Revision ID: 91b7f3c6aa42
Revises: 4a0f9d2e1c31
Create Date: 2026-03-11 11:40:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "91b7f3c6aa42"
down_revision = "4a0f9d2e1c31"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("usuarios", schema=None) as batch_op:
        batch_op.add_column(sa.Column("es_admin", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.create_index(batch_op.f("ix_usuarios_es_admin"), ["es_admin"], unique=False)

    op.create_table(
        "cotizaciones",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=140), nullable=False),
        sa.Column("email", sa.String(length=200), nullable=False),
        sa.Column("telefono", sa.String(length=40), nullable=True),
        sa.Column("ciudad", sa.String(length=120), nullable=True),
        sa.Column("mensaje", sa.Text(), nullable=False),
        sa.Column("estado", sa.String(length=20), nullable=False),
        sa.Column("precio_ofertado", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("respuesta", sa.Text(), nullable=True),
        sa.Column("responded_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("cotizaciones", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_cotizaciones_email"), ["email"], unique=False)
        batch_op.create_index(batch_op.f("ix_cotizaciones_estado"), ["estado"], unique=False)

    op.create_table(
        "promociones",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("producto_id", sa.Integer(), nullable=False),
        sa.Column("porcentaje_descuento", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("fecha_inicio", sa.DateTime(), nullable=False),
        sa.Column("fecha_fin", sa.DateTime(), nullable=False),
        sa.Column("activa", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["producto_id"], ["productos.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("promociones", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_promociones_producto_id"), ["producto_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_promociones_fecha_inicio"), ["fecha_inicio"], unique=False)
        batch_op.create_index(batch_op.f("ix_promociones_fecha_fin"), ["fecha_fin"], unique=False)

    op.create_table(
        "banners",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("titulo", sa.String(length=180), nullable=False),
        sa.Column("imagen_url", sa.String(length=600), nullable=False),
        sa.Column("enlace_url", sa.String(length=600), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False),
        sa.Column("fecha_inicio", sa.DateTime(), nullable=True),
        sa.Column("fecha_fin", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("banners", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_banners_activo"), ["activo"], unique=False)

    op.create_table(
        "pedidos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=True),
        sa.Column("estado", sa.String(length=20), nullable=False),
        sa.Column("total", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("ciudad", sa.String(length=120), nullable=True),
        sa.Column("direccion", sa.String(length=220), nullable=True),
        sa.Column("metodo_pago", sa.String(length=40), nullable=False),
        sa.Column("contra_entrega", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("pedidos", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_pedidos_usuario_id"), ["usuario_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_pedidos_estado"), ["estado"], unique=False)

    op.create_table(
        "pedido_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pedido_id", sa.Integer(), nullable=False),
        sa.Column("producto_id", sa.Integer(), nullable=False),
        sa.Column("cantidad", sa.Integer(), nullable=False),
        sa.Column("precio_unitario", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.ForeignKeyConstraint(["pedido_id"], ["pedidos.id"]),
        sa.ForeignKeyConstraint(["producto_id"], ["productos.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("pedido_items", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_pedido_items_pedido_id"), ["pedido_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_pedido_items_producto_id"), ["producto_id"], unique=False)

    op.create_table(
        "configuraciones_envio",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ciudad", sa.String(length=120), nullable=False),
        sa.Column("costo", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("gratis_desde", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("contra_entrega_habilitado", sa.Boolean(), nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ciudad"),
    )

    op.create_table(
        "notificaciones",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("titulo", sa.String(length=180), nullable=False),
        sa.Column("mensaje", sa.Text(), nullable=False),
        sa.Column("tipo", sa.String(length=40), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "notificaciones_usuario",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("notificacion_id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("visto", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["notificacion_id"], ["notificaciones.id"]),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("notificaciones_usuario", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_notificaciones_usuario_notificacion_id"), ["notificacion_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_notificaciones_usuario_usuario_id"), ["usuario_id"], unique=False)

    op.create_table(
        "accesos_pagina",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ruta", sa.String(length=255), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=True),
        sa.Column("ip", sa.String(length=120), nullable=True),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("accesos_pagina", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_accesos_pagina_ruta"), ["ruta"], unique=False)
        batch_op.create_index(batch_op.f("ix_accesos_pagina_usuario_id"), ["usuario_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_accesos_pagina_created_at"), ["created_at"], unique=False)


def downgrade():
    with op.batch_alter_table("accesos_pagina", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_accesos_pagina_created_at"))
        batch_op.drop_index(batch_op.f("ix_accesos_pagina_usuario_id"))
        batch_op.drop_index(batch_op.f("ix_accesos_pagina_ruta"))
    op.drop_table("accesos_pagina")

    with op.batch_alter_table("notificaciones_usuario", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_notificaciones_usuario_usuario_id"))
        batch_op.drop_index(batch_op.f("ix_notificaciones_usuario_notificacion_id"))
    op.drop_table("notificaciones_usuario")
    op.drop_table("notificaciones")

    op.drop_table("configuraciones_envio")

    with op.batch_alter_table("pedido_items", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_pedido_items_producto_id"))
        batch_op.drop_index(batch_op.f("ix_pedido_items_pedido_id"))
    op.drop_table("pedido_items")

    with op.batch_alter_table("pedidos", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_pedidos_estado"))
        batch_op.drop_index(batch_op.f("ix_pedidos_usuario_id"))
    op.drop_table("pedidos")

    with op.batch_alter_table("banners", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_banners_activo"))
    op.drop_table("banners")

    with op.batch_alter_table("promociones", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_promociones_fecha_fin"))
        batch_op.drop_index(batch_op.f("ix_promociones_fecha_inicio"))
        batch_op.drop_index(batch_op.f("ix_promociones_producto_id"))
    op.drop_table("promociones")

    with op.batch_alter_table("cotizaciones", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_cotizaciones_estado"))
        batch_op.drop_index(batch_op.f("ix_cotizaciones_email"))
    op.drop_table("cotizaciones")

    with op.batch_alter_table("usuarios", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_usuarios_es_admin"))
        batch_op.drop_column("es_admin")
