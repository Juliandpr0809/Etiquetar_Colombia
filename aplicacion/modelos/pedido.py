from datetime import datetime

from aplicacion.extensiones import db


class Pedido(db.Model):
    __tablename__ = "pedidos"

    id = db.Column(db.Integer, primary_key=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=True, index=True)
    estado = db.Column(db.String(20), nullable=False, default="pendiente", index=True)
    total = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    ciudad = db.Column(db.String(120), nullable=True)
    direccion = db.Column(db.String(220), nullable=True)
    metodo_pago = db.Column(db.String(40), nullable=False, default="pasarela")
    contra_entrega = db.Column(db.Boolean, nullable=False, default=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    usuario = db.relationship("Usuario", backref=db.backref("pedidos", lazy=True))


class PedidoItem(db.Model):
    __tablename__ = "pedido_items"

    id = db.Column(db.Integer, primary_key=True)
    pedido_id = db.Column(db.Integer, db.ForeignKey("pedidos.id"), nullable=False, index=True)
    producto_id = db.Column(db.Integer, db.ForeignKey("productos.id"), nullable=False, index=True)
    cantidad = db.Column(db.Integer, nullable=False, default=1)
    precio_unitario = db.Column(db.Numeric(12, 2), nullable=False)

    pedido = db.relationship("Pedido", backref=db.backref("items", lazy=True, cascade="all, delete-orphan"))
    producto = db.relationship("Producto", lazy=True)
