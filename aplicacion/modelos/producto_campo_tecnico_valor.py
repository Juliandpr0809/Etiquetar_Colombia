from datetime import datetime

from aplicacion.extensiones import db


class ProductoCampoTecnicoValor(db.Model):
    __tablename__ = "producto_campo_tecnico_valores"

    id = db.Column(db.Integer, primary_key=True)
    producto_id = db.Column(db.Integer, db.ForeignKey("productos.id"), nullable=False, index=True)
    campo_tecnico_id = db.Column(db.Integer, db.ForeignKey("categoria_campos_tecnicos.id"), nullable=False, index=True)
    valor_texto = db.Column(db.Text, nullable=True)
    valor_numero = db.Column(db.Numeric(14, 4), nullable=True)
    valor_booleano = db.Column(db.Boolean, nullable=True)
    valor_opcion = db.Column(db.String(120), nullable=True)
    valor_mostrar = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    campo_tecnico = db.relationship("CategoriaCampoTecnico")

    __table_args__ = (
        db.UniqueConstraint("producto_id", "campo_tecnico_id", name="uq_producto_campo"),
    )
