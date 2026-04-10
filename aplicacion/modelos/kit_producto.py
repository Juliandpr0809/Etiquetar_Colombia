from aplicacion.extensiones import db


class KitProducto(db.Model):
    __tablename__ = "kit_productos"

    id = db.Column(db.Integer, primary_key=True)
    kit_id = db.Column(db.Integer, db.ForeignKey("productos.id", ondelete="CASCADE"), nullable=False, index=True)
    producto_id = db.Column(db.Integer, db.ForeignKey("productos.id", ondelete="RESTRICT"), nullable=False, index=True)
    cantidad = db.Column(db.Numeric(10, 2), nullable=False, default=1)
    nota = db.Column(db.String(255), nullable=True)
    orden = db.Column(db.Integer, nullable=False, default=0)

    kit = db.relationship("Producto", foreign_keys=[kit_id], overlaps="kit_componentes,kits_como_componente")
    producto = db.relationship("Producto", foreign_keys=[producto_id], overlaps="kit_componentes,kits_como_componente")

    __table_args__ = (
        db.UniqueConstraint("kit_id", "producto_id", name="uq_kit_producto_unico"),
    )
