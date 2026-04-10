"""relacion ficha producto uno a muchos

Revision ID: f9a8b7c6d5e4
Revises: e2f3a4b5c6d7
Create Date: 2026-04-10 15:20:00

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "f9a8b7c6d5e4"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("productos", schema=None) as batch_op:
        batch_op.drop_constraint("fk_productos_ficha_tecnica", type_="foreignkey")
        batch_op.drop_index("ix_productos_ficha_tecnica_id")
        batch_op.create_index("ix_productos_ficha_tecnica_id", ["ficha_tecnica_id"], unique=False)
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
        batch_op.drop_index("ix_productos_ficha_tecnica_id")
        batch_op.create_index("ix_productos_ficha_tecnica_id", ["ficha_tecnica_id"], unique=True)
        batch_op.create_foreign_key(
            "fk_productos_ficha_tecnica",
            "fichas_tecnicas",
            ["ficha_tecnica_id"],
            ["id"],
            ondelete="SET NULL",
        )
