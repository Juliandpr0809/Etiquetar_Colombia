from datetime import datetime

from aplicacion.extensiones import db


class Banner(db.Model):
    __tablename__ = "banners"

    id = db.Column(db.Integer, primary_key=True)
    titulo = db.Column(db.String(180), nullable=False)
    imagen_url = db.Column(db.String(600), nullable=False)
    enlace_url = db.Column(db.String(600), nullable=True)
    activo = db.Column(db.Boolean, nullable=False, default=True, index=True)
    orden = db.Column(db.Integer, nullable=False, default=0)
    fecha_inicio = db.Column(db.DateTime, nullable=True)
    fecha_fin = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
