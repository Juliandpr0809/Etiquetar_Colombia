from datetime import datetime

from flask import Blueprint, jsonify, render_template

from aplicacion.modelos import Producto, Promocion


catalogo_bp = Blueprint("catalogo", __name__, url_prefix="/catalogo")


@catalogo_bp.get("/piscina")
@catalogo_bp.get("/piscina.html")
def catalogo_piscina():
    return render_template("catalogo/piscina.html")


@catalogo_bp.get("/agua")
@catalogo_bp.get("/agua.html")
def catalogo_agua():
    return render_template("catalogo/agua.html")


@catalogo_bp.get("/api/productos")
def api_productos():
    ahora = datetime.utcnow()
    productos = (
        Producto.query.filter_by(activo=True)
        .order_by(Producto.created_at.desc())
        .limit(100)
        .all()
    )
    promociones_activas = (
        Promocion.query.filter_by(activa=True)
        .filter(Promocion.fecha_inicio <= ahora, Promocion.fecha_fin >= ahora)
        .all()
    )
    promo_por_producto = {p.producto_id: p for p in promociones_activas}

    data = [
        {
            "id": p.id,
            "nombre": p.nombre,
            "slug": p.slug,
            "linea": p.linea,
            "precio": float(p.precio),
            "precio_final": (
                float(p.precio)
                if p.id not in promo_por_producto
                else round(float(p.precio) * (1 - float(promo_por_producto[p.id].porcentaje_descuento) / 100), 2)
            ),
            "descuento": (
                float(promo_por_producto[p.id].porcentaje_descuento)
                if p.id in promo_por_producto
                else 0
            ),
            "stock": p.stock,
            "imagen_url": p.imagen_url,
            "ficha_url": p.ficha_url,
        }
        for p in productos
    ]
    return jsonify(data)
