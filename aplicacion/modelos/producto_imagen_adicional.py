from datetime import datetime

from aplicacion.extensiones import db


class ProductoImagenAdicional(db.Model):
    __tablename__ = "producto_imagenes_adicionales"

    id = db.Column(db.Integer, primary_key=True)
    producto_id = db.Column(db.Integer, db.ForeignKey("productos.id"), nullable=False, index=True)
    imagen_public_id = db.Column(db.String(255), nullable=True)
    imagen_url = db.Column(db.String(600), nullable=False)
    alt_text = db.Column(db.String(180), nullable=True)
    orden = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
