from datetime import datetime
import re

from flask import Blueprint, abort, jsonify, render_template
from sqlalchemy.orm import joinedload

from aplicacion.modelos import Categoria, Producto


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
        Producto.query.options(joinedload(Producto.categoria))
        .filter_by(activo=True)
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
            "categoria_id": p.categoria_id,
            "categoria_nombre": p.categoria.nombre if p.categoria else "Sin categoria",
            "categoria_slug": p.categoria.slug if p.categoria else None,
            "marca": p.marca,
            "referencia": p.referencia,
            "precio": float(p.precio),
            "precio_anterior": float(p.precio_anterior) if p.precio_anterior is not None else None,
            "precio_final": float(p.precio_final),
            "descuento": float(p.promocion_activa.porcentaje_descuento) if p.tiene_promocion else 0,
            "stock": p.stock,
            "imagen_url": p.imagen_url,
            "ficha_url": p.ficha_url,
            "especificaciones_tecnicas": p.especificaciones_tecnicas or [],
        }
        for p in productos
    ]
    return jsonify(data)


@catalogo_bp.get("/api/categorias")
def api_categorias_catalogo():
    categorias = (
        Categoria.query.filter_by(activo=True)
        .order_by(Categoria.linea.asc(), Categoria.nombre.asc())
        .all()
    )
    data = []
    for categoria in categorias:
        total = (
            Producto.query.filter_by(activo=True, categoria_id=categoria.id)
            .count()
        )
        data.append(
            {
                "id": categoria.id,
                "nombre": categoria.nombre,
                "slug": categoria.slug,
                "linea": categoria.linea,
                "total": total,
            }
        )
    return jsonify(data)


@catalogo_bp.get("/producto/<string:slug>")
def producto_detalle(slug):
    producto = (
        Producto.query.options(
            joinedload(Producto.categoria),
            joinedload(Producto.imagenes_adicionales),
            joinedload(Producto.caracteristicas),
            joinedload(Producto.contenido_kit),
            joinedload(Producto.campos_tecnicos_valores),
            joinedload(Producto.recomendados),
        )
        .filter(Producto.slug == slug, Producto.activo.is_(True))
        .first()
    )
    if not producto:
        abort(404)

    especificaciones = []
    descripcion_publica = (producto.descripcion or "").strip()
    
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
    if producto.especificaciones_tecnicas and isinstance(producto.especificaciones_tecnicas, list):
        for idx, spec in enumerate(producto.especificaciones_tecnicas):
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
    galeria = []
    if producto.imagen_url:
        galeria.append({"url": producto.imagen_url, "alt": producto.nombre})
    for img in sorted(producto.imagenes_adicionales, key=lambda x: (x.orden, x.id)):
        galeria.append({"url": img.imagen_url, "alt": img.alt_text or producto.nombre})

    return render_template(
        "producto-detalle.html",
        producto=producto,
        descripcion_publica=descripcion_publica,
        galeria=galeria,
        especificaciones=especificaciones,
        secciones_especificaciones=secciones_especificaciones,
        caracteristicas=[c.texto for c in sorted(producto.caracteristicas, key=lambda x: (x.orden, x.id))],
        contenido_kit=[c.texto for c in sorted(producto.contenido_kit, key=lambda x: (x.orden, x.id))],
        recomendados=recomendados,
    )
