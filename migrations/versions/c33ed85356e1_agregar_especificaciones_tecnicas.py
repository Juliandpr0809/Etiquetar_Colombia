"""agregar especificaciones tecnicas

Revision ID: c33ed85356e1
Revises: d5e6f7a8b9c0
Create Date: 2026-04-09 16:57:33.698783

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c33ed85356e1'
down_revision = 'd5e6f7a8b9c0'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('productos', sa.Column('especificaciones_tecnicas', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('productos', 'especificaciones_tecnicas')
