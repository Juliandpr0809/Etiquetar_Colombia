from flask import Blueprint, jsonify, render_template, request, session

from aplicacion.modelos import Producto


carrito_bp = Blueprint("carrito", __name__, url_prefix="/carrito")


def _get_cart() -> dict:
    carrito = session.get("carrito")
    if not isinstance(carrito, dict):
        carrito = {}
        session["carrito"] = carrito
    return carrito


def _set_cart(carrito: dict) -> None:
    session["carrito"] = carrito
    session.modified = True


def _cart_payload() -> dict:
    carrito = _get_cart()
    items = []
    total_items = 0
    subtotal = 0.0

    for producto_id, cantidad in carrito.items():
        try:
            producto_id_int = int(producto_id)
            cantidad_int = max(int(cantidad), 0)
        except (TypeError, ValueError):
            continue

        if cantidad_int <= 0:
            continue

        producto = Producto.query.get(producto_id_int)
        if not producto or not producto.activo:
            continue

        precio_original = float(producto.precio)
        precio_final = float(producto.precio_final)
        subtotal_item = precio_final * cantidad_int
        subtotal += subtotal_item
        total_items += cantidad_int
        items.append(
            {
                "id": producto.id,
                "nombre": producto.nombre,
                "slug": producto.slug,
                "linea": producto.linea,
                "precio": precio_final,
                "precio_original": precio_original,
                "tiene_descuento": producto.tiene_promocion,
                "porcentaje_descuento": float(producto.promocion_activa.porcentaje_descuento) if producto.tiene_promocion else 0,
                "cantidad": cantidad_int,
                "stock": producto.stock,
                "imagen_url": producto.imagen_url,
                "subtotal": subtotal_item,
            }
        )

    return {
        "items": items,
        "total_items": total_items,
        "subtotal": subtotal,
    }


@carrito_bp.get("/")
@carrito_bp.get("/carrito.html")
def ver_carrito():
    return render_template("carrito/carrito.html")


@carrito_bp.get("/checkout")
@carrito_bp.get("/checkout.html")
def checkout():
    return render_template("carrito/checkout.html")


@carrito_bp.get("/api")
def carrito_api():
    return jsonify({"ok": True, "data": _cart_payload()})


@carrito_bp.post("/api/items")
def agregar_item_api():
    payload = request.get_json(silent=True) or request.form.to_dict()
    producto_id = payload.get("producto_id")
    cantidad = payload.get("cantidad", 1)

    try:
        producto_id = int(producto_id)
        cantidad = max(int(cantidad), 1)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "message": "Producto o cantidad invalida."}), 400

    producto = Producto.query.get_or_404(producto_id)
    if not producto.activo:
        return jsonify({"ok": False, "message": "El producto no esta disponible."}), 400
    if producto.stock <= 0:
        return jsonify({"ok": False, "message": "Producto sin stock disponible."}), 409

    carrito = _get_cart()
    cantidad_actual = 0
    if str(producto_id) in carrito:
        try:
            cantidad_actual = int(carrito[str(producto_id)])
        except (TypeError, ValueError):
            cantidad_actual = 0

    nueva_cantidad = min(cantidad_actual + cantidad, max(producto.stock, 1))
    carrito[str(producto_id)] = nueva_cantidad
    _set_cart(carrito)

    return jsonify({"ok": True, "message": "Producto agregado al carrito.", "data": _cart_payload()})


@carrito_bp.patch("/api/items/<int:producto_id>")
def actualizar_item_api(producto_id):
    payload = request.get_json(silent=True) or {}
    cantidad = payload.get("cantidad")
    try:
        cantidad = int(cantidad)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "message": "Cantidad invalida."}), 400

    carrito = _get_cart()
    producto = Producto.query.get_or_404(producto_id)
    if cantidad <= 0:
        carrito.pop(str(producto_id), None)
    else:
        carrito[str(producto_id)] = min(cantidad, max(producto.stock, 1))

    _set_cart(carrito)
    return jsonify({"ok": True, "message": "Carrito actualizado.", "data": _cart_payload()})


@carrito_bp.delete("/api/items/<int:producto_id>")
def eliminar_item_api(producto_id):
    carrito = _get_cart()
    carrito.pop(str(producto_id), None)
    _set_cart(carrito)
    return jsonify({"ok": True, "message": "Producto eliminado del carrito.", "data": _cart_payload()})
