from datetime import datetime
import re

from flask import Blueprint, abort, jsonify, render_template
from sqlalchemy.orm import joinedload

from aplicacion.modelos import Categoria, KitProducto, Producto


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
            "nombre": (p.ficha_tecnica.nombre if p.ficha_tecnica and p.ficha_tecnica.nombre else p.nombre),
            "slug": p.slug,
            "linea": p.linea,
            "tipo_producto": p.tipo_producto or ("kit" if p.es_kit else "estandar"),
            "es_kit": bool(p.es_kit or (p.tipo_producto in {"combo", "kit"})),
            "categoria_id": p.categoria_id,
            "categoria_nombre": p.categoria.nombre if p.categoria else "Sin categoria",
            "categoria_slug": p.categoria.slug if p.categoria else None,
            "marca": (p.ficha_tecnica.marca if p.ficha_tecnica and p.ficha_tecnica.marca else p.marca),
            "referencia": (p.ficha_tecnica.referencia if p.ficha_tecnica and p.ficha_tecnica.referencia else p.referencia),
            "precio": float(p.precio),
            "precio_anterior": float(p.precio_anterior) if p.precio_anterior is not None else None,
            "precio_final": float(p.precio_final),
            "descuento": float(p.promocion_activa.porcentaje_descuento) if p.tiene_promocion else 0,
            "stock": p.stock,
            "imagen_url": p.imagen_url,
            "ficha_url": p.ficha_url or (p.ficha_tecnica.ficha_pdf_url if p.ficha_tecnica else None),
            "aplicacion_recomendada": (
                p.ficha_tecnica.aplicacion
                if p.ficha_tecnica and p.ficha_tecnica.aplicacion
                else p.aplicacion_recomendada
            ),
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
