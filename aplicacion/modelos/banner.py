from datetime import datetime

from aplicacion.extensiones import db


class Banner(db.Model):
    __tablename__ = "banners"

    id = db.Column(db.Integer, primary_key=True)
    tipo = db.Column(db.String(20), nullable=False, default="hero") # top | hero
    titulo = db.Column(db.String(180), nullable=False)
    subtitulo = db.Column(db.String(180), nullable=True) # Kicker
    descripcion = db.Column(db.Text, nullable=True)
    texto_boton = db.Column(db.String(50), nullable=True, default="Comprar Ahora")
    imagen_url = db.Column(db.String(600), nullable=False) # Imagen del producto 3D
    enlace_url = db.Column(db.String(600), nullable=True)
    color_fondo = db.Column(db.String(20), nullable=True, default="#f8fbf8")
    activo = db.Column(db.Boolean, nullable=False, default=True, index=True)
    orden = db.Column(db.Integer, nullable=False, default=0)
    fecha_inicio = db.Column(db.DateTime, nullable=True)
    fecha_fin = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
