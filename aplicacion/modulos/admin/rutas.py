import ipaddress
import json
import re
from functools import lru_cache
from datetime import datetime, timedelta
from decimal import Decimal
from urllib.error import URLError
from urllib.request import urlopen

from flask import Blueprint, flash, g, jsonify, redirect, render_template, request, url_for
from sqlalchemy import func

from aplicacion.extensiones import db
from aplicacion.modelos import (
    AccesoPagina,
    Banner,
    ConfiguracionEnvio,
    Cotizacion,
    Notificacion,
    NotificacionUsuario,
    Pedido,
    Producto,
    Promocion,
    Usuario,
)
from aplicacion.servicios import cloudinary_habilitado, subir_imagen_banner, subir_imagen_producto


admin_bp = Blueprint("admin", __name__, url_prefix="/admin")


def _ip_cliente() -> str:
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()[:120]
    return (request.remote_addr or "")[:120]


def _es_ip_publica(ip: str) -> bool:
    try:
        ip_obj = ipaddress.ip_address(ip)
    except ValueError:
        return False

    return not any(
        [
            ip_obj.is_private,
            ip_obj.is_loopback,
            ip_obj.is_reserved,
            ip_obj.is_multicast,
            ip_obj.is_unspecified,
            getattr(ip_obj, "is_link_local", False),
        ]
    )


@lru_cache(maxsize=512)
def _resolver_origen_por_ip(ip: str) -> dict:
    if not ip:
        return {"ciudad": None, "region": None, "pais": None}

    if not _es_ip_publica(ip):
        return {"ciudad": "Local", "region": "Red privada", "pais": "Desarrollo"}

    try:
        with urlopen(f"https://ipwho.is/{ip}", timeout=2.5) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return {"ciudad": None, "region": None, "pais": None}

    if not data.get("success"):
        return {"ciudad": None, "region": None, "pais": None}

    return {
        "ciudad": (data.get("city") or "").strip() or None,
        "region": (data.get("region") or "").strip() or None,
        "pais": (data.get("country") or "").strip() or None,
    }


def _texto_origen(ciudad: str | None, region: str | None, pais: str | None, ip: str | None) -> str:
    partes = [parte for parte in [ciudad, region, pais] if parte]
    if partes:
        return ", ".join(partes)
    return ip or "Sin dato"


@admin_bp.before_app_request
def registrar_acceso_pagina():
    path = request.path or ""
    if path.startswith("/estaticos") or path.startswith("/placeholder"):
        return
    if path.startswith("/favicon"):
        return

    ip_cliente = _ip_cliente()
    origen = _resolver_origen_por_ip(ip_cliente)

    acceso = AccesoPagina(
        ruta=(path[:250] or "/"),
        usuario_id=getattr(getattr(g, "usuario_actual", None), "id", None),
        ip=ip_cliente,
        ciudad=origen.get("ciudad"),
        region=origen.get("region"),
        pais=origen.get("pais"),
        user_agent=(request.user_agent.string or "")[:250],
    )
    db.session.add(acceso)
    db.session.commit()


def _admin_requerido(api=False):
    usuario = getattr(g, "usuario_actual", None)
    if usuario and getattr(usuario, "es_admin", False):
        return usuario

    if api:
        return jsonify({"ok": False, "message": "Acceso restringido para administradores."}), 403

    flash("No tienes permisos para entrar al panel administrativo.", "error")
    return redirect(url_for("autenticacion.login"))


def _decimal(value, default="0"):
    try:
        texto = str(value or "").strip().upper()
        if not texto:
            return Decimal(default)

        # Permite entradas como: "120000", "120.000", "120,000", "$120.000", "COP 120.000"
        texto = texto.replace("COP", "").replace("$", "")
        texto = re.sub(r"\s+", "", texto)
        texto = re.sub(r"[^0-9,.-]", "", texto)

        if not texto or texto in {"-", ".", ","}:
            return Decimal(default)

        if "," in texto and "." in texto:
            # Si la coma está al final, asumimos decimal europeo: 1.234,56
            if texto.rfind(",") > texto.rfind("."):
                texto = texto.replace(".", "").replace(",", ".")
            else:
                # Formato tipo 1,234.56
                texto = texto.replace(",", "")
        elif "," in texto:
            izquierda, derecha = texto.rsplit(",", 1)
            if len(derecha) <= 2:
                texto = izquierda.replace(".", "") + "." + derecha
            else:
                texto = texto.replace(",", "")
        elif texto.count(".") > 1:
            texto = texto.replace(".", "")
        elif texto.count(".") == 1:
            izquierda, derecha = texto.split(".")
            # En COP, un único punto con 3 dígitos suele ser miles: 120.000
            if len(derecha) == 3:
                texto = izquierda + derecha

        return Decimal(texto)
    except Exception:
        return Decimal(default)


def _imagen_valida(archivo) -> bool:
    if not archivo or not getattr(archivo, "filename", ""):
        return False
    mimetype = (getattr(archivo, "mimetype", "") or "").lower()
    return mimetype in {"image/jpeg", "image/jpg", "image/png", "image/webp"}


@admin_bp.get("/")
def panel():
    admin = _admin_requerido(api=False)
    if not isinstance(admin, Usuario):
        return admin
    return render_template("admin/panel.html")


@admin_bp.get("/api/resumen")
def resumen_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    ahora = datetime.utcnow()
    inicio_mes = datetime(ahora.year, ahora.month, 1)
    inicio_mes_anterior = (inicio_mes - timedelta(days=1)).replace(day=1)

    ventas_mes = (
        db.session.query(func.coalesce(func.sum(Pedido.total), 0))
        .filter(Pedido.created_at >= inicio_mes)
        .scalar()
    )
    ventas_mes_anterior = (
        db.session.query(func.coalesce(func.sum(Pedido.total), 0))
        .filter(Pedido.created_at >= inicio_mes_anterior, Pedido.created_at < inicio_mes)
        .scalar()
    )

    top_productos = (
        db.session.query(Producto.nombre, func.sum(func.coalesce(Producto.stock, 0)).label("stock"))
        .group_by(Producto.id)
        .order_by(Producto.created_at.desc())
        .limit(5)
        .all()
    )

    accesos_7d = (
        db.session.query(func.count(AccesoPagina.id))
        .filter(AccesoPagina.created_at >= ahora - timedelta(days=7))
        .scalar()
    )
    visitantes_unicos_7d = (
        db.session.query(func.count(func.distinct(AccesoPagina.ip)))
        .filter(AccesoPagina.created_at >= ahora - timedelta(days=7))
        .scalar()
    )
    visitas_hoy = (
        db.session.query(func.count(AccesoPagina.id))
        .filter(AccesoPagina.created_at >= ahora.replace(hour=0, minute=0, second=0, microsecond=0))
        .scalar()
    )

    cotizaciones_pendientes = Cotizacion.query.filter_by(estado="pendiente").count()
    pedidos_pendientes = Pedido.query.filter(Pedido.estado.in_(["pendiente", "enviado"])) .count()

    return jsonify(
        {
            "ok": True,
            "data": {
                "ventas_mes": float(ventas_mes or 0),
                "ventas_mes_anterior": float(ventas_mes_anterior or 0),
                "accesos_7d": int(accesos_7d or 0),
                "visitantes_unicos_7d": int(visitantes_unicos_7d or 0),
                "visitas_hoy": int(visitas_hoy or 0),
                "clientes": Usuario.query.count(),
                "productos": Producto.query.count(),
                "cotizaciones_pendientes": cotizaciones_pendientes,
                "pedidos_pendientes": pedidos_pendientes,
                "top_productos": [{"nombre": n, "stock": int(s or 0)} for n, s in top_productos],
            },
        }
    )


@admin_bp.post("/api/productos")
def crear_producto_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    nombre = (request.form.get("nombre") or "").strip()
    slug = (request.form.get("slug") or "").strip().lower()
    linea = (request.form.get("linea") or "piscina").strip().lower()
    descripcion = (request.form.get("descripcion") or "").strip()
    precio = _decimal(request.form.get("precio"), "0")
    stock = int(request.form.get("stock") or 0)
    imagen_url = (request.form.get("imagen_url") or "").strip() or None
    imagen = request.files.get("imagen")

    if not nombre or not slug:
        return jsonify({"ok": False, "message": "Nombre y slug son obligatorios."}), 400
    if Producto.query.filter_by(slug=slug).first():
        return jsonify({"ok": False, "message": "El slug ya existe."}), 409
    if imagen and not _imagen_valida(imagen):
        return jsonify({"ok": False, "message": "La foto debe ser JPG, PNG o WEBP."}), 400
    if imagen and not cloudinary_habilitado():
        return jsonify({"ok": False, "message": "Cloudinary no esta configurado en el servidor."}), 500

    imagen_public_id = None
    if imagen:
        try:
            upload = subir_imagen_producto(imagen, slug=slug)
            imagen_url = upload.get("secure_url") or imagen_url
            imagen_public_id = upload.get("public_id")
        except Exception:
            return jsonify({"ok": False, "message": "No se pudo subir la foto del producto."}), 502

    producto = Producto(
        nombre=nombre,
        slug=slug,
        linea=linea if linea in {"piscina", "agua"} else "piscina",
        descripcion=descripcion or None,
        precio=precio,
        stock=max(stock, 0),
        activo=True,
        imagen_url=imagen_url,
        imagen_public_id=imagen_public_id,
    )
    db.session.add(producto)
    db.session.commit()

    return jsonify({"ok": True, "message": "Producto creado.", "data": {"id": producto.id}}), 201


@admin_bp.get("/api/productos")
def listar_productos_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    productos = Producto.query.order_by(Producto.created_at.desc()).limit(300).all()
    return jsonify(
        {
            "ok": True,
            "data": [
                {
                    "id": p.id,
                    "nombre": p.nombre,
                    "slug": p.slug,
                    "linea": p.linea,
                    "descripcion": p.descripcion or "",
                    "precio": float(p.precio),
                    "stock": p.stock,
                    "imagen_url": p.imagen_url,
                    "activo": p.activo,
                }
                for p in productos
            ],
        }
    )


@admin_bp.patch("/api/productos/<int:producto_id>")
def editar_producto_api(producto_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    producto = Producto.query.get_or_404(producto_id)
    nombre = (request.form.get("nombre") or request.form.get("nombre", producto.nombre) or producto.nombre).strip()
    slug = (request.form.get("slug") or request.form.get("slug", producto.slug) or producto.slug).strip().lower()
    linea = (request.form.get("linea") or producto.linea).strip().lower()
    descripcion = (request.form.get("descripcion") or "").strip()
    precio = _decimal(request.form.get("precio", producto.precio), str(producto.precio))
    stock = int(request.form.get("stock", producto.stock) or producto.stock)
    imagen = request.files.get("imagen")

    existe = Producto.query.filter(Producto.slug == slug, Producto.id != producto.id).first()
    if existe:
        return jsonify({"ok": False, "message": "Ese slug ya esta en uso."}), 409

    if imagen and not _imagen_valida(imagen):
        return jsonify({"ok": False, "message": "La foto debe ser JPG, PNG o WEBP."}), 400

    if imagen:
        try:
            upload = subir_imagen_producto(imagen, slug=slug)
            producto.imagen_url = upload.get("secure_url") or producto.imagen_url
            producto.imagen_public_id = upload.get("public_id") or producto.imagen_public_id
        except Exception:
            return jsonify({"ok": False, "message": "No se pudo actualizar la foto."}), 502

    producto.nombre = nombre
    producto.slug = slug
    producto.linea = linea if linea in {"piscina", "agua"} else producto.linea
    producto.descripcion = descripcion or None
    producto.precio = precio
    producto.stock = max(stock, 0)
    db.session.commit()

    return jsonify({"ok": True, "message": "Producto actualizado correctamente."})


@admin_bp.patch("/api/productos/<int:producto_id>/estado")
def cambiar_estado_producto_api(producto_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    producto = Producto.query.get_or_404(producto_id)
    payload = request.get_json(silent=True) or {}
    producto.activo = bool(payload.get("activo", not producto.activo))
    db.session.commit()
    return jsonify({"ok": True, "message": "Estado del producto actualizado."})


@admin_bp.patch("/api/productos/<int:producto_id>/stock")
def actualizar_stock_api(producto_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    payload = request.get_json(silent=True) or {}
    stock = payload.get("stock")
    if stock is None:
        return jsonify({"ok": False, "message": "Stock es obligatorio."}), 400

    producto = Producto.query.get_or_404(producto_id)
    producto.stock = max(int(stock), 0)
    db.session.commit()
    return jsonify({"ok": True, "message": "Inventario actualizado."})


@admin_bp.get("/api/cotizaciones")
def listar_cotizaciones_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    items = Cotizacion.query.order_by(Cotizacion.created_at.desc()).limit(200).all()
    return jsonify(
        {
            "ok": True,
            "data": [
                {
                    "id": c.id,
                    "nombre": c.nombre,
                    "email": c.email,
                    "telefono": c.telefono,
                    "ciudad": c.ciudad,
                    "mensaje": c.mensaje,
                    "estado": c.estado,
                    "precio_ofertado": float(c.precio_ofertado) if c.precio_ofertado is not None else None,
                    "respuesta": c.respuesta,
                    "created_at": c.created_at.isoformat(),
                }
                for c in items
            ],
        }
    )


@admin_bp.post("/api/cotizaciones/<int:cotizacion_id>/responder")
def responder_cotizacion_api(cotizacion_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    payload = request.get_json(silent=True) or {}
    respuesta = (payload.get("respuesta") or "").strip()
    precio_ofertado = payload.get("precio_ofertado")

    if not respuesta:
        return jsonify({"ok": False, "message": "La respuesta es obligatoria."}), 400

    cotizacion = Cotizacion.query.get_or_404(cotizacion_id)
    cotizacion.respuesta = respuesta
    cotizacion.precio_ofertado = _decimal(precio_ofertado, "0") if precio_ofertado is not None else None
    cotizacion.estado = "respondida"
    cotizacion.responded_at = datetime.utcnow()
    db.session.commit()

    return jsonify({"ok": True, "message": "Cotizacion respondida."})


@admin_bp.post("/api/promociones")
def crear_promocion_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    payload = request.get_json(silent=True) or {}
    producto_id = payload.get("producto_id")
    porcentaje = _decimal(payload.get("porcentaje_descuento"), "0")
    fecha_inicio = payload.get("fecha_inicio")
    fecha_fin = payload.get("fecha_fin")

    if not producto_id or not fecha_inicio or not fecha_fin:
        return jsonify({"ok": False, "message": "Faltan campos obligatorios de promocion."}), 400

    producto = Producto.query.get_or_404(int(producto_id))
    inicio = datetime.fromisoformat(fecha_inicio)
    fin = datetime.fromisoformat(fecha_fin)

    promocion = Promocion(
        producto_id=producto.id,
        porcentaje_descuento=max(Decimal("0"), min(porcentaje, Decimal("90"))),
        fecha_inicio=inicio,
        fecha_fin=fin,
        activa=True,
    )
    db.session.add(promocion)
    db.session.commit()

    return jsonify({"ok": True, "message": "Promocion programada."}), 201


@admin_bp.get("/api/promociones")
def listar_promociones_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    items = Promocion.query.order_by(Promocion.created_at.desc()).limit(200).all()
    ahora = datetime.utcnow()
    return jsonify(
        {
            "ok": True,
            "data": [
                {
                    "id": p.id,
                    "producto_id": p.producto_id,
                    "producto": p.producto.nombre if p.producto else "-",
                    "porcentaje_descuento": float(p.porcentaje_descuento),
                    "fecha_inicio": p.fecha_inicio.isoformat(),
                    "fecha_fin": p.fecha_fin.isoformat(),
                    "activa": bool(p.activa),
                    "vigente": bool(p.activa and p.fecha_inicio <= ahora <= p.fecha_fin),
                }
                for p in items
            ],
        }
    )


@admin_bp.patch("/api/promociones/<int:promocion_id>")
def editar_promocion_api(promocion_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    payload = request.get_json(silent=True) or {}
    promocion = Promocion.query.get_or_404(promocion_id)

    if payload.get("producto_id"):
        producto = Producto.query.get_or_404(int(payload.get("producto_id")))
        promocion.producto_id = producto.id

    if payload.get("porcentaje_descuento") is not None:
        porcentaje = _decimal(payload.get("porcentaje_descuento"), str(promocion.porcentaje_descuento))
        promocion.porcentaje_descuento = max(Decimal("0"), min(porcentaje, Decimal("90")))

    if payload.get("fecha_inicio"):
        promocion.fecha_inicio = datetime.fromisoformat(payload.get("fecha_inicio"))
    if payload.get("fecha_fin"):
        promocion.fecha_fin = datetime.fromisoformat(payload.get("fecha_fin"))

    if payload.get("activa") is not None:
        promocion.activa = bool(payload.get("activa"))

    db.session.commit()
    return jsonify({"ok": True, "message": "Promocion actualizada."})


@admin_bp.patch("/api/promociones/<int:promocion_id>/estado")
def cambiar_estado_promocion_api(promocion_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    promocion = Promocion.query.get_or_404(promocion_id)
    payload = request.get_json(silent=True) or {}
    promocion.activa = bool(payload.get("activa", not promocion.activa))
    db.session.commit()

    return jsonify({"ok": True, "message": "Estado de promocion actualizado."})


@admin_bp.delete("/api/promociones/<int:promocion_id>")
def eliminar_promocion_api(promocion_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    promocion = Promocion.query.get_or_404(promocion_id)
    db.session.delete(promocion)
    db.session.commit()
    return jsonify({"ok": True, "message": "Promocion eliminada."})


@admin_bp.post("/api/banners")
def crear_banner_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    if request.content_type and "multipart/form-data" in request.content_type:
        payload = request.form or {}
        archivo = request.files.get("imagen")
    else:
        payload = request.get_json(silent=True) or {}
        archivo = None

    titulo = (payload.get("titulo") or "").strip()
    imagen_url = (payload.get("imagen_url") or "").strip()

    if not titulo:
        return jsonify({"ok": False, "message": "El titulo es obligatorio."}), 400

    if archivo and getattr(archivo, "filename", ""):
        if not _imagen_valida(archivo):
            return jsonify({"ok": False, "message": "Formato de imagen no permitido. Usa JPG, PNG o WEBP."}), 400
        if not cloudinary_habilitado():
            return jsonify({"ok": False, "message": "Cloudinary no esta configurado en el servidor."}), 500

        slug_banner = f"banner-{titulo.lower().replace(' ', '-')[:60]}"
        resultado = subir_imagen_banner(archivo, slug=slug_banner)
        imagen_url = (resultado.get("secure_url") or "").strip()

    if not imagen_url:
        return jsonify({"ok": False, "message": "Debes cargar una imagen o escribir la URL."}), 400

    banner = Banner(
        titulo=titulo,
        imagen_url=imagen_url,
        enlace_url=(payload.get("enlace_url") or "").strip() or None,
        orden=int(payload.get("orden") or 0),
        activo=bool(payload.get("activo", True)),
    )
    db.session.add(banner)
    db.session.commit()

    return jsonify({"ok": True, "message": "Banner creado."}), 201


@admin_bp.get("/api/banners")
def listar_banners_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    banners = Banner.query.order_by(Banner.orden.asc(), Banner.created_at.desc()).all()
    return jsonify(
        {
            "ok": True,
            "data": [
                {
                    "id": b.id,
                    "titulo": b.titulo,
                    "imagen_url": b.imagen_url,
                    "enlace_url": b.enlace_url,
                    "activo": b.activo,
                    "orden": b.orden,
                }
                for b in banners
            ],
        }
    )


@admin_bp.patch("/api/banners/<int:banner_id>")
def editar_banner_api(banner_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    banner = Banner.query.get_or_404(banner_id)
    if request.content_type and "multipart/form-data" in request.content_type:
        payload = request.form or {}
        archivo = request.files.get("imagen")
    else:
        payload = request.get_json(silent=True) or {}
        archivo = None

    titulo = (payload.get("titulo") or banner.titulo).strip()
    enlace_url = (payload.get("enlace_url") or "").strip() or None
    orden = int(payload.get("orden", banner.orden) or banner.orden)
    imagen_url = (payload.get("imagen_url") or "").strip() or banner.imagen_url

    if archivo and getattr(archivo, "filename", ""):
        if not _imagen_valida(archivo):
            return jsonify({"ok": False, "message": "Formato de imagen no permitido. Usa JPG, PNG o WEBP."}), 400
        if not cloudinary_habilitado():
            return jsonify({"ok": False, "message": "Cloudinary no esta configurado en el servidor."}), 500
        slug_banner = f"banner-{titulo.lower().replace(' ', '-')[:60]}"
        resultado = subir_imagen_banner(archivo, slug=slug_banner)
        imagen_url = (resultado.get("secure_url") or "").strip() or imagen_url

    banner.titulo = titulo
    banner.imagen_url = imagen_url
    banner.enlace_url = enlace_url
    banner.orden = orden
    if payload.get("activo") is not None:
        banner.activo = bool(payload.get("activo"))

    db.session.commit()
    return jsonify({"ok": True, "message": "Banner actualizado."})


@admin_bp.patch("/api/banners/<int:banner_id>/estado")
def cambiar_estado_banner_api(banner_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    banner = Banner.query.get_or_404(banner_id)
    payload = request.get_json(silent=True) or {}
    banner.activo = bool(payload.get("activo", not banner.activo))
    db.session.commit()

    return jsonify({"ok": True, "message": "Estado de banner actualizado."})


@admin_bp.delete("/api/banners/<int:banner_id>")
def eliminar_banner_api(banner_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    banner = Banner.query.get_or_404(banner_id)
    db.session.delete(banner)
    db.session.commit()
    return jsonify({"ok": True, "message": "Banner eliminado."})


@admin_bp.get("/api/pedidos")
def listar_pedidos_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    pedidos = Pedido.query.order_by(Pedido.created_at.desc()).limit(200).all()
    return jsonify(
        {
            "ok": True,
            "data": [
                {
                    "id": p.id,
                    "cliente": f"{p.usuario.nombre} {p.usuario.apellido}" if p.usuario else "Invitado",
                    "email": p.usuario.email if p.usuario else None,
                    "estado": p.estado,
                    "total": float(p.total),
                    "ciudad": p.ciudad,
                    "metodo_pago": p.metodo_pago,
                    "contra_entrega": p.contra_entrega,
                    "created_at": p.created_at.isoformat(),
                }
                for p in pedidos
            ],
        }
    )


@admin_bp.patch("/api/pedidos/<int:pedido_id>/estado")
def actualizar_pedido_estado_api(pedido_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    payload = request.get_json(silent=True) or {}
    estado = (payload.get("estado") or "").strip().lower()
    if estado not in {"pendiente", "enviado", "entregado"}:
        return jsonify({"ok": False, "message": "Estado invalido."}), 400

    pedido = Pedido.query.get_or_404(pedido_id)
    pedido.estado = estado
    db.session.commit()
    return jsonify({"ok": True, "message": "Estado de pedido actualizado."})


@admin_bp.get("/api/clientes")
def listar_clientes_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    clientes = Usuario.query.order_by(Usuario.created_at.desc()).limit(500).all()
    return jsonify(
        {
            "ok": True,
            "data": [
                {
                    "id": u.id,
                    "nombre": f"{u.nombre} {u.apellido}",
                    "email": u.email,
                    "telefono": u.telefono,
                    "ciudad": u.ciudad,
                    "created_at": u.created_at.isoformat(),
                }
                for u in clientes
            ],
        }
    )


@admin_bp.get("/api/accesos")
def accesos_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    rutas = (
        db.session.query(AccesoPagina.ruta, func.count(AccesoPagina.id).label("visitas"))
        .group_by(AccesoPagina.ruta)
        .order_by(func.count(AccesoPagina.id).desc())
        .limit(20)
        .all()
    )

    origenes = (
        db.session.query(
            AccesoPagina.ciudad,
            AccesoPagina.region,
            AccesoPagina.pais,
            AccesoPagina.ip,
            func.count(AccesoPagina.id).label("visitas"),
        )
        .group_by(
            AccesoPagina.ciudad,
            AccesoPagina.region,
            AccesoPagina.pais,
            AccesoPagina.ip,
        )
        .order_by(func.count(AccesoPagina.id).desc())
        .limit(20)
        .all()
    )

    return jsonify(
        {
            "ok": True,
            "data": {
                "rutas": [{"ruta": r, "visitas": int(v)} for r, v in rutas],
                "origenes": [
                    {
                        "origen": _texto_origen(ciudad, region, pais, ip),
                        "visitas": int(visitas),
                    }
                    for ciudad, region, pais, ip, visitas in origenes
                ],
            },
        }
    )


@admin_bp.get("/api/ventas-grafica")
def ventas_grafica_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    ahora = datetime.utcnow()
    puntos = []
    for i in range(5, -1, -1):
        inicio = (ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=31 * i))
        fin = inicio + timedelta(days=31)
        total = (
            db.session.query(func.coalesce(func.sum(Pedido.total), 0))
            .filter(Pedido.created_at >= inicio, Pedido.created_at < fin)
            .scalar()
        )
        puntos.append({"mes": inicio.strftime("%Y-%m"), "total": float(total or 0)})

    return jsonify({"ok": True, "data": puntos})


@admin_bp.post("/api/envios")
def configurar_envio_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    payload = request.get_json(silent=True) or {}
    ciudad = (payload.get("ciudad") or "").strip()
    if not ciudad:
        return jsonify({"ok": False, "message": "Ciudad es obligatoria."}), 400

    conf = ConfiguracionEnvio.query.filter_by(ciudad=ciudad).first()
    if not conf:
        conf = ConfiguracionEnvio(ciudad=ciudad)
        db.session.add(conf)

    conf.costo = _decimal(payload.get("costo"), "0")
    gratis_desde = payload.get("gratis_desde")
    conf.gratis_desde = _decimal(gratis_desde, "0") if gratis_desde not in [None, ""] else None
    conf.contra_entrega_habilitado = bool(payload.get("contra_entrega_habilitado", True))
    conf.activo = bool(payload.get("activo", True))
    db.session.commit()

    return jsonify({"ok": True, "message": "Configuracion de envio guardada."})


@admin_bp.get("/api/envios")
def listar_envios_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    envios = ConfiguracionEnvio.query.order_by(ConfiguracionEnvio.ciudad.asc()).all()
    return jsonify(
        {
            "ok": True,
            "data": [
                {
                    "id": e.id,
                    "ciudad": e.ciudad,
                    "costo": float(e.costo),
                    "gratis_desde": float(e.gratis_desde) if e.gratis_desde is not None else None,
                    "contra_entrega_habilitado": e.contra_entrega_habilitado,
                    "activo": e.activo,
                }
                for e in envios
            ],
        }
    )


@admin_bp.patch("/api/envios/<int:envio_id>")
def editar_envio_api(envio_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    envio = ConfiguracionEnvio.query.get_or_404(envio_id)
    payload = request.get_json(silent=True) or {}

    ciudad = (payload.get("ciudad") or envio.ciudad).strip()
    envio.ciudad = ciudad
    envio.costo = _decimal(payload.get("costo", envio.costo), str(envio.costo))

    gratis_desde = payload.get("gratis_desde", envio.gratis_desde)
    envio.gratis_desde = _decimal(gratis_desde, "0") if gratis_desde not in [None, ""] else None

    if payload.get("contra_entrega_habilitado") is not None:
        envio.contra_entrega_habilitado = bool(payload.get("contra_entrega_habilitado"))
    if payload.get("activo") is not None:
        envio.activo = bool(payload.get("activo"))

    db.session.commit()
    return jsonify({"ok": True, "message": "Envio actualizado."})


@admin_bp.delete("/api/envios/<int:envio_id>")
def eliminar_envio_api(envio_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    envio = ConfiguracionEnvio.query.get_or_404(envio_id)
    db.session.delete(envio)
    db.session.commit()
    return jsonify({"ok": True, "message": "Envio eliminado."})


@admin_bp.post("/api/notificaciones")
def crear_notificacion_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    payload = request.get_json(silent=True) or {}
    titulo = (payload.get("titulo") or "").strip()
    mensaje = (payload.get("mensaje") or "").strip()
    tipo = (payload.get("tipo") or "promocion").strip()

    if not titulo or not mensaje:
        return jsonify({"ok": False, "message": "Titulo y mensaje son obligatorios."}), 400

    notificacion = Notificacion(titulo=titulo, mensaje=mensaje, tipo=tipo)
    db.session.add(notificacion)
    db.session.flush()

    usuarios = Usuario.query.filter_by(activo=True).all()
    enlaces = [
        NotificacionUsuario(notificacion_id=notificacion.id, usuario_id=u.id, visto=False)
        for u in usuarios
    ]
    db.session.add_all(enlaces)
    db.session.commit()

    return jsonify(
        {
            "ok": True,
            "message": f"Notificacion enviada a {len(usuarios)} clientes.",
        }
    )


@admin_bp.get("/api/notificaciones")
def listar_notificaciones_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    items = Notificacion.query.order_by(Notificacion.created_at.desc()).limit(300).all()
    return jsonify(
        {
            "ok": True,
            "data": [
                {
                    "id": n.id,
                    "titulo": n.titulo,
                    "mensaje": n.mensaje,
                    "tipo": n.tipo,
                    "created_at": n.created_at.isoformat(),
                }
                for n in items
            ],
        }
    )


@admin_bp.patch("/api/notificaciones/<int:notificacion_id>")
def editar_notificacion_api(notificacion_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    payload = request.get_json(silent=True) or {}
    item = Notificacion.query.get_or_404(notificacion_id)

    item.titulo = (payload.get("titulo") or item.titulo).strip()
    item.mensaje = (payload.get("mensaje") or item.mensaje).strip()
    item.tipo = (payload.get("tipo") or item.tipo).strip()

    db.session.commit()
    return jsonify({"ok": True, "message": "Notificacion actualizada."})


@admin_bp.delete("/api/notificaciones/<int:notificacion_id>")
def eliminar_notificacion_api(notificacion_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    enlaces = NotificacionUsuario.query.filter_by(notificacion_id=notificacion_id).all()
    for enlace in enlaces:
        db.session.delete(enlace)

    item = Notificacion.query.get_or_404(notificacion_id)
    db.session.delete(item)
    db.session.commit()

    return jsonify({"ok": True, "message": "Notificacion eliminada."})
