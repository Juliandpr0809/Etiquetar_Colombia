from datetime import datetime

from aplicacion.extensiones import db


class ConfiguracionEnvio(db.Model):
    __tablename__ = "configuraciones_envio"

    id = db.Column(db.Integer, primary_key=True)
    ciudad = db.Column(db.String(120), nullable=False, unique=True)
    costo = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    gratis_desde = db.Column(db.Numeric(12, 2), nullable=True)
    contra_entrega_habilitado = db.Column(db.Boolean, nullable=False, default=True)
    activo = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
