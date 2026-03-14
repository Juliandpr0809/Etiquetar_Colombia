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
    productos = (
        Producto.query.filter_by(activo=True)
        .order_by(Producto.created_at.desc())
        .limit(100)
        .all()
    )

    data = [
        {
            "id": p.id,
            "nombre": p.nombre,
            "slug": p.slug,
            "linea": p.linea,
            "precio": float(p.precio),
            "precio_anterior": float(p.precio_anterior) if p.precio_anterior is not None else None,
            "precio_final": float(p.precio_final),
            "descuento": float(p.promocion_activa.porcentaje_descuento) if p.tiene_promocion else 0,
            "stock": p.stock,
            "imagen_url": p.imagen_url,
            "ficha_url": p.ficha_url,
        }
        for p in productos
    ]
    return jsonify(data)
