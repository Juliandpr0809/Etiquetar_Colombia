from datetime import datetime

from aplicacion.extensiones import db


class FichaTecnica(db.Model):
    __tablename__ = "fichas_tecnicas"

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(200), nullable=False)
    referencia = db.Column(db.String(120), nullable=False, unique=True, index=True)
    marca = db.Column(db.String(120), nullable=True)
    categoria_id = db.Column(db.Integer, db.ForeignKey("categorias.id"), nullable=True, index=True)
    linea = db.Column(db.String(20), nullable=False, index=True)
    descripcion = db.Column(db.Text, nullable=True)
    especificaciones = db.Column(db.JSON, nullable=True)
    caracteristicas = db.Column(db.JSON, nullable=True)
    componentes = db.Column(db.JSON, nullable=True)
    garantia = db.Column(db.String(80), nullable=True)
    aplicacion = db.Column(db.Text, nullable=True)
    ficha_pdf_url = db.Column(db.String(600), nullable=True)
    creado_en = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    actualizado_en = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    categoria = db.relationship("Categoria", lazy="joined")
    productos = db.relationship("Producto", back_populates="ficha_tecnica", lazy=True)
