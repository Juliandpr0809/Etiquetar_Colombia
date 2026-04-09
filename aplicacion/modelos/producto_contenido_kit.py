from datetime import datetime

from aplicacion.extensiones import db


class ProductoContenidoKit(db.Model):
    __tablename__ = "producto_contenido_kit"

    id = db.Column(db.Integer, primary_key=True)
    producto_id = db.Column(db.Integer, db.ForeignKey("productos.id"), nullable=False, index=True)
    texto = db.Column(db.String(255), nullable=False)
    orden = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
