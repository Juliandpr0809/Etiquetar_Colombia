from datetime import datetime

from werkzeug.security import check_password_hash, generate_password_hash

from aplicacion.extensiones import db


class Usuario(db.Model):
    __tablename__ = "usuarios"

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(120), nullable=False)
    apellido = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(200), nullable=False, unique=True, index=True)
    telefono = db.Column(db.String(40), nullable=True)
    ciudad = db.Column(db.String(120), nullable=True)
    direccion = db.Column(db.String(200), nullable=True)
    foto_url = db.Column(db.String(600), nullable=True)
    es_admin = db.Column(db.Boolean, nullable=False, default=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    activo = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)
