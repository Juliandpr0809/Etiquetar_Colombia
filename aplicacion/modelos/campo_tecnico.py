from aplicacion.extensiones import db


class CampoTecnico(db.Model):
    __tablename__ = "campos_tecnicos"

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(140), nullable=False)
    tipo = db.Column(db.String(20), nullable=False)  # cuantitativa | cualitativa
    unidad_defecto = db.Column(db.String(40), nullable=True)
    categoria_sugerida = db.Column(db.String(80), nullable=True)
    veces_usado = db.Column(db.Integer, nullable=False, default=0)

    __table_args__ = (
        db.UniqueConstraint("nombre", "tipo", name="uq_campos_tecnicos_nombre_tipo"),
        db.Index("ix_campos_tecnicos_nombre", "nombre"),
        db.Index("ix_campos_tecnicos_veces_usado", "veces_usado"),
    )
