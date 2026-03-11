from datetime import datetime

from aplicacion.extensiones import db


class Producto(db.Model):
    __tablename__ = "productos"

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(200), nullable=False)
    slug = db.Column(db.String(220), nullable=False, unique=True, index=True)
    linea = db.Column(db.String(20), nullable=False, index=True)  # piscina | agua
    descripcion = db.Column(db.Text, nullable=True)
    sku = db.Column(db.String(80), nullable=True, unique=True)
    precio = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    stock = db.Column(db.Integer, nullable=False, default=0)
    activo = db.Column(db.Boolean, nullable=False, default=True)

    categoria_id = db.Column(db.Integer, db.ForeignKey("categorias.id"), nullable=True)
    categoria = db.relationship("Categoria", back_populates="productos")

    # Cloudinary (imagenes y ficha tecnica)
    imagen_public_id = db.Column(db.String(255), nullable=True)
    imagen_url = db.Column(db.String(600), nullable=True)
    ficha_public_id = db.Column(db.String(255), nullable=True)
    ficha_url = db.Column(db.String(600), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
