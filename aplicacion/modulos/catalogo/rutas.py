from collections import Counter
from datetime import datetime
import re

from flask import Blueprint, abort, jsonify, render_template, request
from sqlalchemy import func
from sqlalchemy.orm import joinedload

from aplicacion.extensiones import db
from aplicacion.modelos import (
    Categoria,
    KitProducto,
    Pedido,
    PedidoItem,
    Producto,
    ProductoCampoTecnicoValor,
)


catalogo_bp = Blueprint("catalogo", __name__, url_prefix="/catalogo")

PALABRAS_BLOQUEADAS_CATALOGO = ("test", "prueba", "smoke", "diag", "demo")


def _normalizar_texto(valor):
    return re.sub(r"\s+", " ", str(valor or "").strip().lower())


def _es_producto_real(producto):
    nombre = _normalizar_texto(producto.nombre)
    categoria = _normalizar_texto(producto.categoria.nombre if producto.categoria else "")
    return not any(palabra in nombre or palabra in categoria for palabra in PALABRAS_BLOQUEADAS_CATALOGO)


def _precio_final_producto(producto):
    try:
        return float(producto.precio_final)
    except Exception:
        return float(producto.precio or 0)


def _descuento_producto(producto):
    precio_final = _precio_final_producto(producto)
    precio_anterior = float(producto.precio_anterior or 0)
    if precio_anterior > precio_final and precio_anterior > 0:
        return round((1 - (precio_final / precio_anterior)) * 100)
    promo = producto.promocion_activa
    if promo and float(promo.porcentaje_descuento or 0) > 0:
        return round(float(promo.porcentaje_descuento))
    return 0


def _calcular_ventas_productos(productos):
    if not productos:
        return {}
    ids = [p.id for p in productos]
    filas = (
        db.session.query(PedidoItem.producto_id, func.sum(PedidoItem.cantidad))
        .join(Pedido, Pedido.id == PedidoItem.pedido_id)
        .filter(PedidoItem.producto_id.in_(ids))
        .filter(Pedido.estado != "cancelado")
        .group_by(PedidoItem.producto_id)
        .all()
    )
    return {int(producto_id): int(total or 0) for producto_id, total in filas}


def _serializar_producto_catalogo(producto, ventas_por_producto=None):
    ficha = producto.ficha_tecnica
    categoria = producto.categoria
    marca = (ficha.marca if ficha and ficha.marca else producto.marca) or ""
    referencia = (ficha.referencia if ficha and ficha.referencia else producto.referencia) or ""
    nombre = (ficha.nombre if ficha and ficha.nombre else producto.nombre) or ""
    descripcion = ((ficha.descripcion if ficha and ficha.descripcion else producto.descripcion) or "").strip()
    precio_final = _precio_final_producto(producto)
    precio_base = float(producto.precio or 0)
    precio_anterior = float(producto.precio_anterior or 0) if producto.precio_anterior is not None else None
    descuento = _descuento_producto(producto)

    campos_tecnicos = []
    for valor in sorted(producto.campos_tecnicos_valores, key=lambda x: (x.campo_tecnico.orden if x.campo_tecnico else 0, x.id)):
        campo = valor.campo_tecnico
        if not campo or not campo.activo:
            continue
        item = {
            "campo_id": campo.id,
            "campo_slug": campo.slug,
            "nombre": campo.nombre,
            "tipo_dato": campo.tipo_dato,
            "unidad_medida": campo.unidad_medida,
            "orden": campo.orden,
            "valor_mostrar": valor.valor_mostrar or "",
        }
        if valor.valor_numero is not None:
            try:
                item["valor_numero"] = float(valor.valor_numero)
            except (TypeError, ValueError):
                item["valor_numero"] = None
        if valor.valor_texto:
            item["valor_texto"] = valor.valor_texto
        if valor.valor_booleano is not None:
            item["valor_booleano"] = bool(valor.valor_booleano)
        if valor.valor_opcion:
            item["valor_opcion"] = valor.valor_opcion
        campos_tecnicos.append(item)

    imagenes_adicionales = [
        {
            "id": img.id,
            "imagen_url": img.imagen_url,
            "alt_text": img.alt_text or nombre,
        }
        for img in sorted(producto.imagenes_adicionales, key=lambda x: (x.orden, x.id))
    ]

    caracteristicas = [c.texto for c in sorted(producto.caracteristicas, key=lambda x: (x.orden, x.id)) if str(c.texto).strip()]

    return {
        "id": producto.id,
        "nombre": nombre,
        "slug": producto.slug,
        "linea": producto.linea,
        "tipo_producto": producto.tipo_producto or ("kit" if producto.es_kit else "estandar"),
        "es_kit": bool(producto.es_kit or (producto.tipo_producto in {"combo", "kit"})),
        "categoria_id": producto.categoria_id,
        "categoria_nombre": categoria.nombre if categoria else "Sin categoria",
        "categoria_slug": categoria.slug if categoria else None,
        "categoria_linea": categoria.linea if categoria else producto.linea,
        "marca": marca,
        "marca_logo_url": getattr(ficha, "marca_logo_url", None) if ficha else None,
        "referencia": referencia,
        "precio": float(precio_base),
        "precio_anterior": precio_anterior,
        "precio_final": float(precio_final),
        "descuento": descuento,
        "stock": int(producto.stock or 0),
        "imagen_url": producto.imagen_url,
        "ficha_url": producto.ficha_url or (ficha.ficha_pdf_url if ficha else None),
        "aplicacion_recomendada": ficha.aplicacion if ficha and ficha.aplicacion else producto.aplicacion_recomendada,
        "descripcion": descripcion,
        "created_at": producto.created_at.isoformat() if producto.created_at else None,
        "es_nuevo": bool(producto.created_at and (datetime.utcnow() - producto.created_at).days <= 30),
        "ventas_count": int((ventas_por_producto or {}).get(producto.id, 0)),
        "imagenes_adicionales": imagenes_adicionales,
        "caracteristicas": caracteristicas,
        "campos_tecnicos": campos_tecnicos,
        "especificaciones_tecnicas": producto.especificaciones_tecnicas or [],
    }


def _serializar_categoria_catalogo(categoria):
    campos = [
        {
            "id": campo.id,
            "slug": campo.slug,
            "nombre": campo.nombre,
            "tipo_dato": campo.tipo_dato,
            "unidad_medida": campo.unidad_medida,
            "obligatorio": bool(campo.obligatorio),
            "orden": campo.orden,
        }
        for campo in sorted(categoria.campos_tecnicos, key=lambda c: (c.orden, c.id))
        if campo.activo
    ]
    total_real = sum(
        1
        for producto in Producto.query.options(joinedload(Producto.categoria))
        .filter_by(activo=True, categoria_id=categoria.id)
        .all()
        if _es_producto_real(producto)
    )
    return {
        "id": categoria.id,
        "nombre": categoria.nombre,
        "slug": categoria.slug,
        "linea": categoria.linea,
        "total": total_real,
        "campos_tecnicos": campos,
    }


@catalogo_bp.get("/piscina")
@catalogo_bp.get("/piscina.html")
def catalogo_piscina():
    return render_template("catalogo/piscina.html")


@catalogo_bp.get("/agua")
@catalogo_bp.get("/agua.html")
def catalogo_agua():
    return render_template("catalogo/agua.html")


@catalogo_bp.get("")
@catalogo_bp.get("/")
@catalogo_bp.get("/catalogo.html")
def catalogo_general():
    return render_template("catalogo/piscina.html")


@catalogo_bp.get("/api/productos")
def api_productos():
    linea = (request.args.get("linea") or "").strip().lower()
    productos_query = (
        Producto.query.options(
            joinedload(Producto.categoria).joinedload(Categoria.campos_tecnicos),
            joinedload(Producto.ficha_tecnica),
            joinedload(Producto.imagenes_adicionales),
            joinedload(Producto.caracteristicas),
            joinedload(Producto.campos_tecnicos_valores).joinedload(ProductoCampoTecnicoValor.campo_tecnico),
        )
        .filter(Producto.activo.is_(True))
        .order_by(Producto.created_at.desc())
    )
    if linea in {"piscina", "agua"}:
        productos_query = productos_query.filter(Producto.linea == linea)

    productos = [p for p in productos_query.all() if _es_producto_real(p)]
    ventas_por_producto = _calcular_ventas_productos(productos)
    data = [_serializar_producto_catalogo(p, ventas_por_producto) for p in productos]

    marcas = Counter((item["marca"] or "").strip() for item in data if (item["marca"] or "").strip())
    precio_min = min((item["precio_final"] for item in data), default=0)
    precio_max = max((item["precio_final"] for item in data), default=0)
    categorias = Counter((item["categoria_slug"] or "sin-categoria") for item in data)

    return jsonify(
        {
            "items": data,
            "meta": {
                "total": len(data),
                "linea": linea or "all",
            },
            "facets": {
                "brands": [
                    {"nombre": marca, "total": total, "logo_url": None}
                    for marca, total in marcas.most_common()
                    if marca
                ],
                "price_min": precio_min,
                "price_max": precio_max,
                "categories": dict(categorias),
            },
        }
    )


@catalogo_bp.get("/api/categorias")
def api_categorias_catalogo():
    linea = (request.args.get("linea") or "").strip().lower()
    categorias = (
        Categoria.query.options(joinedload(Categoria.campos_tecnicos))
        .filter_by(activo=True)
        .order_by(Categoria.linea.asc(), Categoria.nombre.asc())
        .all()
    )
    data = []
    for categoria in categorias:
        if linea in {"piscina", "agua"} and categoria.linea != linea:
            continue
        serializada = _serializar_categoria_catalogo(categoria)
        if serializada["total"] <= 0:
            continue
        data.append(serializada)
    return jsonify(data)


@catalogo_bp.get("/producto/<string:slug>")
def producto_detalle(slug):
    producto = (
        Producto.query.options(
            joinedload(Producto.categoria),
            joinedload(Producto.imagenes_adicionales),
            joinedload(Producto.caracteristicas),
            joinedload(Producto.contenido_kit),
            joinedload(Producto.kit_componentes).joinedload(KitProducto.producto),
            joinedload(Producto.campos_tecnicos_valores),
            joinedload(Producto.recomendados),
        )
        .filter(Producto.slug == slug, Producto.activo.is_(True))
        .first()
    )
    if not producto:
        abort(404)

    especificaciones = []
    ficha = producto.ficha_tecnica
    descripcion_publica = (
        (ficha.descripcion if ficha and ficha.descripcion else producto.descripcion) or ""
    ).strip()
    marca_publica = (ficha.marca if ficha and ficha.marca else producto.marca)
    referencia_publica = (ficha.referencia if ficha and ficha.referencia else producto.referencia)
    aplicacion_publica = ficha.aplicacion if ficha and ficha.aplicacion else producto.aplicacion_recomendada
    garantia_publica_meses = producto.garantia_meses
    ficha_url_publica = producto.ficha_url or (ficha.ficha_pdf_url if ficha else None)
    
    # Especificaciones de campos técnicos de categoría (pre-definidos)
    for valor in producto.campos_tecnicos_valores:
        campo = valor.campo_tecnico
        if not campo or not campo.activo:
            continue
        valor_mostrar = valor.valor_mostrar or ""
        if campo.unidad_medida and valor_mostrar:
            valor_mostrar = f"{valor_mostrar} {campo.unidad_medida}".strip()
        especificaciones.append(
            {
                "nombre": campo.nombre,
                "valor": valor_mostrar,
                "orden": campo.orden,
                "seccion": "Informacion tecnica",
            }
        )
    
    # Especificaciones técnicas dinámicas (JSON)
    specs_fuente = None
    if ficha and isinstance(ficha.especificaciones, list) and ficha.especificaciones:
        specs_fuente = _normalizar_specs_ficha(ficha.especificaciones)
    elif producto.especificaciones_tecnicas and isinstance(producto.especificaciones_tecnicas, list):
        specs_fuente = producto.especificaciones_tecnicas

    if specs_fuente:
        for idx, spec in enumerate(specs_fuente):
            if not isinstance(spec, dict):
                continue
            nombre = spec.get("nombre", "").strip()
            tipo = spec.get("tipo", "").lower()
            if not nombre or tipo not in ("cuantitativa", "cualitativa"):
                continue
            
            if tipo == "cuantitativa":
                valor_numero = spec.get("valor_numero")
                unidad = spec.get("unidad", "").strip()
                if valor_numero is not None and unidad:
                    try:
                        valor_num = float(valor_numero)
                        valor_txt = str(int(valor_num)) if valor_num.is_integer() else str(valor_num)
                    except (TypeError, ValueError):
                        valor_txt = str(valor_numero)
                    valor_mostrar = f"{valor_txt} {unidad}".strip()
                else:
                    continue
            else:  # cualitativa
                valor_mostrar = spec.get("valor_texto", "").strip()
            
            especificaciones.append(
                {
                    "nombre": nombre,
                    "valor": valor_mostrar,
                    "orden": 5000 + idx,  # Agregar después de campos de categoría
                    "seccion": str(spec.get("seccion") or "Informacion tecnica"),
                }
            )
    
    # Fallback: productos antiguos con ficha tecnica embebida en descripcion (Clave: Valor).
    if not especificaciones and descripcion_publica:
        patron_claves = [
            "Marca",
            "Referencia",
            "Capacidad",
            "Volumen",
            "Material filtrante",
            "Conexión",
            "Conexion",
            "Garantía",
            "Garantia",
            "Aplicación",
            "Aplicacion",
        ]
        alternancia = "|".join(re.escape(k) for k in patron_claves)
        regex = re.compile(
            rf"({alternancia})\s*:\s*(.*?)(?=\s+(?:{alternancia})\s*:|$)",
            re.IGNORECASE,
        )
        coincidencias = list(regex.finditer(descripcion_publica))
        if coincidencias:
            inicio_specs = coincidencias[0].start()
            descripcion_publica = descripcion_publica[:inicio_specs].strip()
            for idx, match in enumerate(coincidencias):
                clave = (match.group(1) or "").strip()
                valor = (match.group(2) or "").strip()
                if not clave or not valor:
                    continue
                clave_normal = clave.lower()
                seccion = "Funciones" if clave_normal in {"aplicación", "aplicacion"} else "Informacion tecnica"
                especificaciones.append(
                    {
                        "nombre": clave,
                        "valor": valor,
                        "orden": 9000 + idx,
                        "seccion": seccion,
                    }
                )

    especificaciones.sort(key=lambda item: item["orden"])

    orden_secciones = ["Funciones", "Caracteristicas fisicas", "Informacion tecnica"]
    mapa_secciones = {k: [] for k in orden_secciones}
    for item in especificaciones:
        seccion = str(item.get("seccion") or "Informacion tecnica")
        if seccion not in mapa_secciones:
            mapa_secciones[seccion] = []
        mapa_secciones[seccion].append(item)

    secciones_especificaciones = [
        {"titulo": titulo, "items": mapa_secciones[titulo]}
        for titulo in orden_secciones
        if mapa_secciones.get(titulo)
    ]
    secciones_adicionales = [k for k in mapa_secciones.keys() if k not in orden_secciones and mapa_secciones.get(k)]
    for titulo in sorted(secciones_adicionales):
        secciones_especificaciones.append({"titulo": titulo, "items": mapa_secciones[titulo]})

    recomendados = [p for p in producto.recomendados if p.activo and p.id != producto.id][:8]
    kit_componentes = [
        {
            "producto_id": rel.producto.id,
            "nombre": rel.producto.nombre,
            "slug": rel.producto.slug,
            "imagen_url": rel.producto.imagen_url,
            "cantidad": float(rel.cantidad or 0),
            "cantidad_mostrar": str(int(float(rel.cantidad))) if float(rel.cantidad).is_integer() else str(float(rel.cantidad)),
            "nota": rel.nota or "",
            "referencia": rel.producto.referencia,
        }
        for rel in sorted(producto.kit_componentes, key=lambda x: (x.orden, x.id))
        if rel.producto and rel.producto.activo
    ]
    galeria = []
    if producto.imagen_url:
        galeria.append({"url": producto.imagen_url, "alt": producto.nombre})
    for img in sorted(producto.imagenes_adicionales, key=lambda x: (x.orden, x.id)):
        galeria.append({"url": img.imagen_url, "alt": img.alt_text or producto.nombre})

    return render_template(
        "producto-detalle.html",
        producto=producto,
        descripcion_publica=descripcion_publica,
        marca_publica=marca_publica,
        referencia_publica=referencia_publica,
        aplicacion_publica=aplicacion_publica,
        garantia_publica_meses=garantia_publica_meses,
        ficha_url_publica=ficha_url_publica,
        galeria=galeria,
        especificaciones=especificaciones,
        secciones_especificaciones=secciones_especificaciones,
        caracteristicas=(
            [str(x).strip() for x in ficha.caracteristicas if str(x).strip()]
            if ficha and isinstance(ficha.caracteristicas, list)
            else [c.texto for c in sorted(producto.caracteristicas, key=lambda x: (x.orden, x.id))]
        ),
        contenido_kit=(
            [
                (
                    f"{str(x.get('nombre') or '').strip()}"
                    f"{' x' + str(x.get('cantidad')) if x.get('cantidad') not in (None, '') else ''}"
                    f"{' (' + str(x.get('notas')).strip() + ')' if str(x.get('notas') or '').strip() else ''}"
                ).strip()
                if isinstance(x, dict)
                else str(x).strip()
                for x in (ficha.componentes or [])
                if (isinstance(x, dict) and str(x.get('nombre') or '').strip()) or str(x).strip()
            ]
            if ficha and isinstance(ficha.componentes, list)
            else [c.texto for c in sorted(producto.contenido_kit, key=lambda x: (x.orden, x.id))]
        ),
        kit_componentes=kit_componentes,
        recomendados=recomendados,
    )


def _normalizar_specs_ficha(especificaciones_ficha: list) -> list:
    normalizadas = []
    for item in especificaciones_ficha:
        if not isinstance(item, dict):
            continue
        nombre = str(item.get("nombre") or "").strip()
        tipo = str(item.get("tipo") or "").strip().lower()
        if not nombre or tipo not in {"cuantitativa", "cualitativa"}:
            continue
        if tipo == "cuantitativa":
            try:
                valor_numero = float(item.get("valor"))
            except (TypeError, ValueError):
                continue
            normalizadas.append(
                {
                    "nombre": nombre,
                    "tipo": "cuantitativa",
                    "valor_numero": valor_numero,
                    "unidad": str(item.get("unidad") or "").strip(),
                    "seccion": "Informacion tecnica",
                }
            )
        else:
            valor_texto = str(item.get("valor") or "").strip()
            if not valor_texto:
                continue
            normalizadas.append(
                {
                    "nombre": nombre,
                    "tipo": "cualitativa",
                    "valor_texto": valor_texto,
                    "seccion": "Informacion tecnica",
                }
            )
    return normalizadas
