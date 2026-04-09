from datetime import datetime

from aplicacion.extensiones import db


class ProductoRecomendado(db.Model):
    __tablename__ = "producto_recomendados"

    producto_id = db.Column(db.Integer, db.ForeignKey("productos.id"), primary_key=True)
    recomendado_id = db.Column(db.Integer, db.ForeignKey("productos.id"), primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
