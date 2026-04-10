from datetime import datetime
from decimal import Decimal

from aplicacion.extensiones import db


class Producto(db.Model):
    __tablename__ = "productos"

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(200), nullable=False)
    slug = db.Column(db.String(220), nullable=False, unique=True, index=True)
    linea = db.Column(db.String(20), nullable=False, index=True)  # piscina | agua
    descripcion = db.Column(db.Text, nullable=True)
    sku = db.Column(db.String(80), nullable=True, unique=True)
    marca = db.Column(db.String(120), nullable=True)
    referencia = db.Column(db.String(120), nullable=True)
    garantia_meses = db.Column(db.Integer, nullable=True)
    tipo_producto = db.Column(db.String(20), nullable=False, default="estandar", index=True)
    es_kit = db.Column(db.Boolean, nullable=False, default=False, index=True)
    aplicacion_recomendada = db.Column(db.Text, nullable=True)
    precio = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    precio_anterior = db.Column(db.Numeric(12, 2), nullable=True)  # Precio tachado (oferta)
    stock = db.Column(db.Integer, nullable=False, default=0)
    activo = db.Column(db.Boolean, nullable=False, default=True)

    categoria_id = db.Column(db.Integer, db.ForeignKey("categorias.id"), nullable=True)
    categoria = db.relationship("Categoria", back_populates="productos")
    ficha_tecnica_id = db.Column(db.Integer, db.ForeignKey("fichas_tecnicas.id"), nullable=True, index=True)
    ficha_tecnica = db.relationship("FichaTecnica", back_populates="productos")
    estado_disponibilidad = db.Column(db.String(30), nullable=False, default="borrador", index=True)

    caracteristicas = db.relationship(
        "ProductoCaracteristica",
        cascade="all, delete-orphan",
        lazy=True,
        order_by="ProductoCaracteristica.orden.asc()",
    )
    contenido_kit = db.relationship(
        "ProductoContenidoKit",
        cascade="all, delete-orphan",
        lazy=True,
        order_by="ProductoContenidoKit.orden.asc()",
    )
    imagenes_adicionales = db.relationship(
        "ProductoImagenAdicional",
        cascade="all, delete-orphan",
        lazy=True,
        order_by="ProductoImagenAdicional.orden.asc()",
    )
    campos_tecnicos_valores = db.relationship(
        "ProductoCampoTecnicoValor",
        cascade="all, delete-orphan",
        lazy=True,
    )
    recomendados = db.relationship(
        "Producto",
        secondary="producto_recomendados",
        primaryjoin="Producto.id==ProductoRecomendado.producto_id",
        secondaryjoin="Producto.id==ProductoRecomendado.recomendado_id",
        lazy="select",
    )
    kit_componentes = db.relationship(
        "KitProducto",
        foreign_keys="KitProducto.kit_id",
        cascade="all, delete-orphan",
        lazy=True,
        order_by="KitProducto.orden.asc()",
        overlaps="kit,producto,kits_como_componente",
    )
    kits_como_componente = db.relationship(
        "KitProducto",
        foreign_keys="KitProducto.producto_id",
        lazy=True,
        overlaps="kit,producto,kit_componentes",
    )

    # Cloudinary (imagenes y ficha tecnica)
    imagen_public_id = db.Column(db.String(255), nullable=True)
    imagen_url = db.Column(db.String(600), nullable=True)
    ficha_public_id = db.Column(db.String(255), nullable=True)
    ficha_url = db.Column(db.String(600), nullable=True)

    # Especificaciones técnicas dinámicas (JSON)
    # Formato: [
    #   {nombre: "Capacidad", tipo: "cuantitativa", valor_numero: 61, unidad: "litros"},
    #   {nombre: "Conexión", tipo: "cualitativa", valor_texto: "2.5\" NPSM"}
    # ]
    especificaciones_tecnicas = db.Column(db.JSON, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    @property
    def promocion_activa(self):
        """Devuelve la promocion vigente mas reciente si existe."""
        ahora = datetime.utcnow()
        for promo in sorted(self.promociones, key=lambda x: x.created_at, reverse=True):
            if promo.activa and promo.fecha_inicio <= ahora <= promo.fecha_fin:
                return promo
        return None

    @property
    def tiene_promocion(self) -> bool:
        return self.promocion_activa is not None

    @property
    def precio_final(self) -> Decimal:
        promo = self.promocion_activa
        if promo:
            factor = Decimal("1") - (promo.porcentaje_descuento / Decimal("100"))
            return (self.precio * factor).quantize(Decimal("0.01"))
        return self.precio

    @property
    def es_bundle(self) -> bool:
        return (self.tipo_producto or "estandar") in {"combo", "kit"}
