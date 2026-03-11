from datetime import datetime

from aplicacion.extensiones import db


class Cotizacion(db.Model):
    __tablename__ = "cotizaciones"

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(140), nullable=False)
    email = db.Column(db.String(200), nullable=False, index=True)
    telefono = db.Column(db.String(40), nullable=True)
    ciudad = db.Column(db.String(120), nullable=True)
    mensaje = db.Column(db.Text, nullable=False)

    estado = db.Column(db.String(20), nullable=False, default="pendiente", index=True)
    precio_ofertado = db.Column(db.Numeric(12, 2), nullable=True)
    respuesta = db.Column(db.Text, nullable=True)
    responded_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
