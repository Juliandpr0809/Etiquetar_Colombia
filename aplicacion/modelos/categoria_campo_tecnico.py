from datetime import datetime

from aplicacion.extensiones import db


class CategoriaCampoTecnico(db.Model):
    __tablename__ = "categoria_campos_tecnicos"

    id = db.Column(db.Integer, primary_key=True)
    categoria_id = db.Column(db.Integer, db.ForeignKey("categorias.id"), nullable=False, index=True)
    nombre = db.Column(db.String(120), nullable=False)
    slug = db.Column(db.String(140), nullable=False)
    tipo_dato = db.Column(db.String(20), nullable=False, default="texto")
    unidad_medida = db.Column(db.String(30), nullable=True)
    obligatorio = db.Column(db.Boolean, nullable=False, default=False)
    opciones_json = db.Column(db.JSON, nullable=True)
    orden = db.Column(db.Integer, nullable=False, default=0)
    activo = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    categoria = db.relationship("Categoria", back_populates="campos_tecnicos")

    __table_args__ = (
        db.UniqueConstraint("categoria_id", "slug", name="uq_categoria_slug_campo"),
    )
