from datetime import datetime

from aplicacion.extensiones import db


class DestacadoHome(db.Model):
    __tablename__ = "destacados_home"

    id = db.Column(db.Integer, primary_key=True)
    producto_id = db.Column(db.Integer, db.ForeignKey("productos.id", ondelete="CASCADE"), nullable=False, index=True)
    tab_nombre = db.Column(db.String(120), nullable=False)
    orden = db.Column(db.Integer, nullable=False, default=0, index=True)
    activo = db.Column(db.Boolean, nullable=False, default=True, index=True)
    creado_en = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    producto = db.relationship("Producto", lazy="joined")
