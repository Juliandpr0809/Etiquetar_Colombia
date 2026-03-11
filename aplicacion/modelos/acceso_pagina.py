from datetime import datetime

from aplicacion.extensiones import db


class AccesoPagina(db.Model):
    __tablename__ = "accesos_pagina"

    id = db.Column(db.Integer, primary_key=True)
    ruta = db.Column(db.String(255), nullable=False, index=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=True, index=True)
    ip = db.Column(db.String(120), nullable=True)
    ciudad = db.Column(db.String(120), nullable=True, index=True)
    region = db.Column(db.String(120), nullable=True)
    pais = db.Column(db.String(120), nullable=True)
    user_agent = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    usuario = db.relationship("Usuario", lazy=True)
