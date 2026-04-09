from datetime import datetime

from aplicacion.extensiones import db


class Categoria(db.Model):
    __tablename__ = "categorias"

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(120), nullable=False, unique=True)
    slug = db.Column(db.String(140), nullable=False, unique=True, index=True)
    linea = db.Column(db.String(20), nullable=False, index=True)  # piscina | agua
    descripcion = db.Column(db.Text, nullable=True)
    activo = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    productos = db.relationship("Producto", back_populates="categoria", lazy=True)
    campos_tecnicos = db.relationship(
        "CategoriaCampoTecnico",
        back_populates="categoria",
        cascade="all, delete-orphan",
        lazy=True,
        order_by="CategoriaCampoTecnico.orden.asc()",
    )
