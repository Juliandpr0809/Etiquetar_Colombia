from datetime import datetime

from aplicacion.extensiones import db


class Notificacion(db.Model):
    __tablename__ = "notificaciones"

    id = db.Column(db.Integer, primary_key=True)
    titulo = db.Column(db.String(180), nullable=False)
    mensaje = db.Column(db.Text, nullable=False)
    tipo = db.Column(db.String(40), nullable=False, default="promocion")
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class NotificacionUsuario(db.Model):
    __tablename__ = "notificaciones_usuario"

    id = db.Column(db.Integer, primary_key=True)
    notificacion_id = db.Column(db.Integer, db.ForeignKey("notificaciones.id"), nullable=False, index=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=False, index=True)
    visto = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    notificacion = db.relationship("Notificacion", lazy=True)
    usuario = db.relationship("Usuario", lazy=True)
