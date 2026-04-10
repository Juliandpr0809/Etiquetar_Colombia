import ipaddress
import json
import re
from collections import Counter
from collections import defaultdict
from functools import lru_cache
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

from flask import Blueprint, current_app, flash, g, jsonify, redirect, render_template, request, session, url_for, render_template_string
import os
try:
    from weasyprint import HTML
    WEASYPRINT_AVAILABLE = True
except ImportError:
    WEASYPRINT_AVAILABLE = False

try:
    from flask_mail import Message
    from aplicacion.extensiones import mail
    MAIL_AVAILABLE = True
except ImportError:
    MAIL_AVAILABLE = False
from sqlalchemy import func, text, case
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import joinedload
from werkzeug.utils import secure_filename

from aplicacion.extensiones import db
from aplicacion.modelos import (
    AccesoPagina,
    Banner,
    CampoTecnico,
    Categoria,
    CategoriaCampoTecnico,
    FichaTecnica,
    ConfiguracionEnvio,
    Cotizacion,
    DestacadoHome,
    Notificacion,
    NotificacionUsuario,
    Pedido,
    Producto,
    ProductoCampoTecnicoValor,
    ProductoCaracteristica,
    ProductoContenidoKit,
    ProductoImagenAdicional,
    ProductoRecomendado,
    KitProducto,
    Promocion,
    Usuario,
)
from aplicacion.servicios import cloudinary_habilitado, subir_imagen_banner, subir_imagen_producto
from aplicacion.servicios.destacados_home import invalidate_destacados_cache


admin_bp = Blueprint("admin", __name__, url_prefix="/admin")


def _normalizar_validez_dias(valor, predeterminado=30):
    try:
        dias = int(valor)
    except (TypeError, ValueError):
        dias = int(predeterminado or 30)
    return max(1, min(365, dias))


def _sincronizar_cotizaciones_vencidas(commit=True):
    ahora = datetime.utcnow()
    estados_expirables = {"respondida", "vista_cliente", "en_negociacion"}

    actualizadas = (
        Cotizacion.query.filter(
            Cotizacion.fecha_vencimiento.isnot(None),
            Cotizacion.fecha_vencimiento < ahora,
            Cotizacion.estado.in_(estados_expirables),
        )
        .update(
            {
                Cotizacion.estado: "vencida",
                Cotizacion.updated_at: ahora,
            },
            synchronize_session=False,
        )
    )

    if actualizadas and commit:
        db.session.commit()
    return int(actualizadas or 0)


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
    return "Ubicacion no identificada"


def _ruta_comercial(path: str) -> bool:
    if not path:
        return False
    if path.startswith("/estaticos") or path.startswith("/placeholder"):
        return False
    if path.startswith("/favicon") or path.startswith("/health"):
        return False
    if "/api/" in path:
        return False
    return True


def _normalizar_param_analytics(days_raw: str | None, granularity_raw: str | None):
    opciones = {7, 14, 30, 60, 90, 180}
    try:
        dias = int(days_raw or 30)
    except (TypeError, ValueError):
        dias = 30

    if dias not in opciones:
        dias = 30

    granularity = (granularity_raw or "auto").strip().lower()
    if granularity not in {"auto", "day", "week", "month"}:
        granularity = "auto"

    if granularity == "auto":
        if dias <= 31:
            granularity = "day"
        elif dias <= 90:
            granularity = "week"
        else:
            granularity = "month"

    return dias, granularity


def _bucket_key(dt: datetime, granularity: str):
    if granularity == "day":
        return dt.strftime("%Y-%m-%d")
    if granularity == "week":
        y, w, _ = dt.isocalendar()
        return f"{y}-W{w:02d}"
    return dt.strftime("%Y-%m")


@admin_bp.before_app_request
def registrar_acceso_pagina():
    path = request.path or ""
    if request.method != "GET":
        return
    if not _ruta_comercial(path):
        return

    ip_cliente = _ip_cliente()
    origen = _resolver_origen_por_ip(ip_cliente)
    usuario_id = session.get("user_id") or getattr(getattr(g, "usuario_actual", None), "id", None)
    ruta = path[:250] or "/"

    # Para visitantes sin login, evita inflar cifras con repeticiones técnicas del mismo día.
    if not usuario_id:
        inicio_dia = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        fin_dia = inicio_dia + timedelta(days=1)
        ciudad = origen.get("ciudad") or ""
        region = origen.get("region") or ""
        pais = origen.get("pais") or ""

        existe_hoy = (
            db.session.query(AccesoPagina.id)
            .filter(AccesoPagina.usuario_id.is_(None))
            .filter(AccesoPagina.ruta == ruta)
            .filter(func.coalesce(AccesoPagina.ciudad, "") == ciudad)
            .filter(func.coalesce(AccesoPagina.region, "") == region)
            .filter(func.coalesce(AccesoPagina.pais, "") == pais)
            .filter(AccesoPagina.created_at >= inicio_dia, AccesoPagina.created_at < fin_dia)
            .first()
        )
        if existe_hoy:
            return

    acceso = AccesoPagina(
        ruta=ruta,
        usuario_id=usuario_id,
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


def _slug_tab_home(nombre):
    base = (nombre or "").strip().lower()
    base = (
        base.replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
    )
    base = re.sub(r"[^a-z0-9\s-]", "", base)
    base = re.sub(r"\s+", "-", base)
    base = re.sub(r"-+", "-", base).strip("-")
    return base or "otros"


def _serializar_destacado_admin(item):
    producto = item.producto
    precio_final = float(producto.precio_final or producto.precio or 0) if producto else 0
    precio_anterior = None
    if producto and producto.precio_anterior is not None:
        try:
            precio_anterior = float(producto.precio_anterior)
        except (TypeError, ValueError):
            precio_anterior = None
    if producto and (precio_anterior is None or precio_anterior <= precio_final):
        try:
            base = float(producto.precio or 0)
            if base > precio_final:
                precio_anterior = base
        except (TypeError, ValueError):
            precio_anterior = None
    descuento = 0
    if precio_anterior and precio_anterior > precio_final and precio_anterior > 0:
        descuento = int(round((1 - (precio_final / precio_anterior)) * 100))

    return {
        "id": item.id,
        "producto_id": item.producto_id,
        "tab_nombre": item.tab_nombre,
        "tab_slug": _slug_tab_home(item.tab_nombre),
        "orden": int(item.orden or 0),
        "activo": bool(item.activo),
        "creado_en": item.creado_en.isoformat() if item.creado_en else None,
        "producto": {
            "id": producto.id if producto else None,
            "nombre": producto.nombre if producto else "",
            "slug": producto.slug if producto else "",
            "referencia": (producto.referencia or "") if producto else "",
            "linea": producto.linea if producto else "",
            "imagen_url": producto.imagen_url if producto else None,
            "precio": float(producto.precio or 0) if producto else 0,
            "precio_final": precio_final,
            "precio_anterior": precio_anterior,
            "descuento": descuento,
            "activo": bool(producto.activo) if producto else False,
        },
    }


def _int_nonneg(value, default=0) -> int:
    try:
        texto = str(value if value is not None else "").strip()
        if not texto:
            return max(int(default), 0)
        texto = re.sub(r"[^0-9-]", "", texto)
        if texto in {"", "-"}:
            return max(int(default), 0)
        return max(int(texto), 0)
    except Exception:
        return max(int(default), 0)


def _imagen_valida(archivo) -> bool:
    if not archivo or not getattr(archivo, "filename", ""):
        return False
    mimetype = (getattr(archivo, "mimetype", "") or "").lower()
    return mimetype in {"image/jpeg", "image/jpg", "image/png", "image/webp"}


def _ficha_pdf_valida(archivo) -> bool:
    if not archivo or not getattr(archivo, "filename", ""):
        return False
    nombre = (getattr(archivo, "filename", "") or "").lower()
    mimetype = (getattr(archivo, "mimetype", "") or "").lower()
    return nombre.endswith(".pdf") or mimetype == "application/pdf"


def _guardar_ficha_local(archivo, slug: str) -> str:
    carpeta = Path(current_app.static_folder) / "manuales"
    carpeta.mkdir(parents=True, exist_ok=True)

    nombre_seguro = secure_filename(getattr(archivo, "filename", "") or "ficha.pdf")
    base = Path(nombre_seguro).stem or "ficha"
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    nombre_archivo = f"{slug}-{base}-{timestamp}.pdf"

    destino = carpeta / nombre_archivo
    archivo.save(destino)
    return f"/estaticos/manuales/{nombre_archivo}"


def _slugify(texto: str) -> str:
    texto = (texto or "").strip().lower()
    texto = re.sub(r"[^a-z0-9\s-]", "", texto)
    texto = re.sub(r"\s+", "-", texto)
    texto = re.sub(r"-+", "-", texto)
    return texto.strip("-")


def _bool_form(valor, default=False) -> bool:
    if valor is None:
        return default
    return str(valor).strip().lower() in {"1", "true", "on", "si", "yes"}


def _json_list_from_form(clave: str) -> list:
    raw = (request.form.get(clave) or "").strip()
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    return parsed if isinstance(parsed, list) else []


SECCIONES_ESPECIFICACIONES = {
    "funciones": "Funciones",
    "caracteristicas fisicas": "Caracteristicas fisicas",
    "informacion tecnica": "Informacion tecnica",
}


def _normalizar_seccion_especificacion(valor: str | None) -> str:
    texto = (valor or "").strip().lower()
    texto = re.sub(r"\s+", " ", texto)
    if texto in SECCIONES_ESPECIFICACIONES:
        return SECCIONES_ESPECIFICACIONES[texto]
    if texto in {"caracteristicas físicas", "caracteristicas físicas"}:
        return "Caracteristicas fisicas"
    return "Informacion tecnica"


def _serializar_campo_tecnico(campo: CategoriaCampoTecnico) -> dict:
    return {
        "id": campo.id,
        "nombre": campo.nombre,
        "slug": campo.slug,
        "tipo_dato": campo.tipo_dato,
        "unidad_medida": campo.unidad_medida,
        "obligatorio": bool(campo.obligatorio),
        "opciones": campo.opciones_json or [],
        "orden": campo.orden,
        "activo": bool(campo.activo),
    }


def _serializar_categoria(categoria: Categoria) -> dict:
    campos = sorted(categoria.campos_tecnicos, key=lambda c: (c.orden, c.id))
    return {
        "id": categoria.id,
        "nombre": categoria.nombre,
        "slug": categoria.slug,
        "linea": categoria.linea,
        "descripcion": categoria.descripcion or "",
        "activo": bool(categoria.activo),
        "campos_tecnicos": [_serializar_campo_tecnico(c) for c in campos if c.activo],
    }


def _normalizar_estado_disponibilidad(valor: str | None) -> str:
    estado = (valor or "").strip().lower()
    mapa = {
        "disponible_bajo_pedido": "disponible_bajo_pedido",
        "bajo_pedido": "disponible_bajo_pedido",
        "stock": "en_stock",
        "en stock": "en_stock",
        "en_stock": "en_stock",
        "borrador": "borrador",
    }
    return mapa.get(estado, "borrador")


def _serializar_ficha_tecnica(ficha: FichaTecnica) -> dict:
    productos = list(ficha.productos or [])
    primer_producto = productos[0] if productos else None
    return {
        "id": ficha.id,
        "nombre": ficha.nombre,
        "referencia": ficha.referencia,
        "marca": ficha.marca or "",
        "categoria_id": ficha.categoria_id,
        "categoria_nombre": ficha.categoria.nombre if ficha.categoria else None,
        "linea": ficha.linea,
        "descripcion": ficha.descripcion or "",
        "especificaciones": ficha.especificaciones if isinstance(ficha.especificaciones, list) else [],
        "caracteristicas": ficha.caracteristicas if isinstance(ficha.caracteristicas, list) else [],
        "componentes": ficha.componentes if isinstance(ficha.componentes, list) else [],
        "garantia": ficha.garantia or "",
        "aplicacion": ficha.aplicacion or "",
        "ficha_pdf_url": ficha.ficha_pdf_url,
        "tiene_producto_asociado": len(productos) > 0,
        "productos_asociados_count": len(productos),
        "producto_id": primer_producto.id if primer_producto else None,
        "producto_nombre": primer_producto.nombre if primer_producto else None,
        "creado_en": ficha.creado_en.isoformat() if ficha.creado_en else None,
        "actualizado_en": ficha.actualizado_en.isoformat() if ficha.actualizado_en else None,
    }


def _normalizar_especificaciones_import(valor) -> list:
    if not isinstance(valor, list):
        return []
    salida = []
    for item in valor:
        if not isinstance(item, dict):
            continue
        nombre = str(item.get("nombre") or "").strip()
        tipo = str(item.get("tipo") or "").strip().lower()
        if not nombre:
            continue
        if tipo == "cuantitativa":
            unidad = str(item.get("unidad") or "").strip()
            valor_bruto = item.get("valor")
            if valor_bruto in (None, ""):
                continue
            try:
                valor_numero = float(valor_bruto)
            except (TypeError, ValueError):
                continue
            salida.append(
                {
                    "nombre": nombre,
                    "tipo": "cuantitativa",
                    "valor_numero": valor_numero,
                    "unidad": unidad,
                    "seccion": "Informacion tecnica",
                }
            )
            continue

        valor_texto = str(item.get("valor") or "").strip()
        if not valor_texto:
            continue
        salida.append(
            {
                "nombre": nombre,
                "tipo": "cualitativa",
                "valor_texto": valor_texto,
                "seccion": "Informacion tecnica",
            }
        )
    return salida


def _sync_producto_desde_ficha(producto: Producto, ficha: FichaTecnica):
    producto.nombre = ficha.nombre
    producto.marca = ficha.marca or None
    producto.referencia = ficha.referencia or None
    producto.categoria_id = ficha.categoria_id
    producto.linea = ficha.linea if ficha.linea in {"piscina", "agua"} else producto.linea
    producto.descripcion = ficha.descripcion or None
    producto.especificaciones_tecnicas = _normalizar_especificaciones_import(ficha.especificaciones)
    producto.aplicacion_recomendada = ficha.aplicacion or None

    garantia_txt = (ficha.garantia or "").strip().lower()
    if garantia_txt:
        match = re.search(r"(\d+)", garantia_txt)
        if match:
            try:
                producto.garantia_meses = max(int(match.group(1)) * (12 if "ano" in garantia_txt or "año" in garantia_txt else 1), 0)
            except (TypeError, ValueError):
                pass

    if ficha.ficha_pdf_url and not producto.ficha_url:
        producto.ficha_url = ficha.ficha_pdf_url

    if isinstance(ficha.caracteristicas, list):
        producto.caracteristicas.clear()
        for idx, texto in enumerate([str(x).strip() for x in ficha.caracteristicas if str(x).strip()]):
            producto.caracteristicas.append(ProductoCaracteristica(texto=texto, orden=idx))

    if isinstance(ficha.componentes, list):
        producto.contenido_kit.clear()
        for idx, comp in enumerate(ficha.componentes):
            if isinstance(comp, dict):
                nombre = str(comp.get("nombre") or "").strip()
                cantidad = comp.get("cantidad")
                notas = str(comp.get("notas") or "").strip()
                texto = nombre
                if cantidad not in (None, ""):
                    texto = f"{texto} x{cantidad}"
                if notas:
                    texto = f"{texto} ({notas})"
                if texto.strip():
                    producto.contenido_kit.append(ProductoContenidoKit(texto=texto.strip(), orden=idx))


def _upsert_campos_tecnicos_categoria(categoria: Categoria, campos_payload: list):
    existentes_por_slug = {c.slug: c for c in categoria.campos_tecnicos}
    slugs_recibidos = set()

    for idx, item in enumerate(campos_payload):
        nombre = (item.get("nombre") or "").strip()
        if not nombre:
            continue

        slug = _slugify(item.get("slug") or nombre)
        if not slug or slug in slugs_recibidos:
            continue

        tipo_dato = (item.get("tipo_dato") or "texto").strip().lower()
        if tipo_dato not in {"texto", "numero", "booleano", "opcion"}:
            tipo_dato = "texto"
        opciones = item.get("opciones") if isinstance(item.get("opciones"), list) else []

        campo = existentes_por_slug.get(slug)
        if campo is None:
            campo = CategoriaCampoTecnico(categoria=categoria, slug=slug)
            db.session.add(campo)

        campo.nombre = nombre
        campo.slug = slug
        campo.tipo_dato = tipo_dato
        campo.unidad_medida = (item.get("unidad_medida") or "").strip() or None
        campo.obligatorio = bool(item.get("obligatorio"))
        campo.opciones_json = [str(o).strip() for o in opciones if str(o).strip()] if tipo_dato == "opcion" else None
        campo.orden = int(item.get("orden") or idx)
        campo.activo = True

        slugs_recibidos.add(slug)

    for campo in list(categoria.campos_tecnicos):
        if campo.slug not in slugs_recibidos:
            db.session.delete(campo)


def _actualizar_relaciones_producto(producto: Producto, categoria: Categoria | None):
    caracteristicas = [str(x).strip() for x in _json_list_from_form("caracteristicas_json") if str(x).strip()]
    contenido_kit = [str(x).strip() for x in _json_list_from_form("contenido_kit_json") if str(x).strip()]
    recomendados_ids = []
    for x in _json_list_from_form("recomendados_json"):
        try:
            recomendados_ids.append(int(x))
        except (TypeError, ValueError):
            continue

    campos_payload = _json_list_from_form("campos_tecnicos_json")
    mapa_campos_payload = {}
    for item in campos_payload:
        try:
            campo_id = int(item.get("campo_id"))
        except (TypeError, ValueError):
            continue
        mapa_campos_payload[campo_id] = item

    if categoria:
        requeridos_faltantes = []
        for campo in categoria.campos_tecnicos:
            if not campo.activo:
                continue
            payload = mapa_campos_payload.get(campo.id)
            valor = (payload or {}).get("valor")
            if campo.obligatorio and (valor is None or str(valor).strip() == ""):
                requeridos_faltantes.append(campo.nombre)
        if requeridos_faltantes:
            raise ValueError(
                "Faltan campos tecnicos obligatorios: " + ", ".join(requeridos_faltantes)
            )

    producto.caracteristicas.clear()
    for idx, texto in enumerate(caracteristicas):
        producto.caracteristicas.append(ProductoCaracteristica(texto=texto, orden=idx))

    producto.contenido_kit.clear()
    for idx, texto in enumerate(contenido_kit):
        producto.contenido_kit.append(ProductoContenidoKit(texto=texto, orden=idx))

    producto.campos_tecnicos_valores.clear()
    # Evita choque del UNIQUE (producto_id, campo_tecnico_id) en MySQL
    # cuando se reemplazan valores en la misma petición.
    db.session.flush()
    if categoria:
        for campo in categoria.campos_tecnicos:
            if not campo.activo:
                continue
            item = mapa_campos_payload.get(campo.id)
            if not item:
                continue
            valor_raw = item.get("valor")
            if valor_raw is None or str(valor_raw).strip() == "":
                continue
            valor = str(valor_raw).strip()
            registro = ProductoCampoTecnicoValor(campo_tecnico_id=campo.id, valor_mostrar=valor)
            if campo.tipo_dato == "numero":
                registro.valor_numero = _decimal(valor, "0")
            elif campo.tipo_dato == "booleano":
                registro.valor_booleano = _bool_form(valor)
            elif campo.tipo_dato == "opcion":
                registro.valor_opcion = valor
            else:
                registro.valor_texto = valor
            producto.campos_tecnicos_valores.append(registro)

    ProductoRecomendado.query.filter_by(producto_id=producto.id).delete()
    for recomendado_id in sorted(set(recomendados_ids)):
        if recomendado_id == producto.id:
            continue
        existe = db.session.query(Producto.id).filter_by(id=recomendado_id).first()
        if not existe:
            continue
        db.session.add(ProductoRecomendado(producto_id=producto.id, recomendado_id=recomendado_id))

    ids_eliminar_imagenes = []
    for x in _json_list_from_form("eliminar_imagenes_adicionales_json"):
        try:
            ids_eliminar_imagenes.append(int(x))
        except (TypeError, ValueError):
            continue
    if ids_eliminar_imagenes:
        ProductoImagenAdicional.query.filter(
            ProductoImagenAdicional.producto_id == producto.id,
            ProductoImagenAdicional.id.in_(ids_eliminar_imagenes),
        ).delete(synchronize_session=False)

    imagenes_adicionales = request.files.getlist("imagenes_adicionales")
    nuevas_imagenes = [img for img in imagenes_adicionales if _imagen_valida(img)]
    if nuevas_imagenes and not cloudinary_habilitado():
        raise ValueError("Cloudinary no esta configurado para subir imagenes adicionales.")

    orden_base = len(producto.imagenes_adicionales)
    for idx, imagen in enumerate(nuevas_imagenes):
        upload = subir_imagen_producto(
            imagen,
            slug=f"{producto.slug}-extra-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{idx}",
        )
        url = upload.get("secure_url")
        if not url:
            continue
        producto.imagenes_adicionales.append(
            ProductoImagenAdicional(
                imagen_public_id=upload.get("public_id"),
                imagen_url=url,
                orden=orden_base + idx,
                alt_text=f"{producto.nombre} - imagen {orden_base + idx + 1}",
            )
        )

    # Procesar especificaciones técnicas dinámicas
    especificaciones_raw = _json_list_from_form("especificaciones_tecnicas_json")
    especificaciones_validas = []
    for spec in especificaciones_raw:
        if not isinstance(spec, dict):
            continue
        nombre = (str(spec.get("nombre") or "")).strip()
        tipo = (str(spec.get("tipo") or "")).strip().lower()
        if not nombre or tipo not in ("cuantitativa", "cualitativa"):
            continue

        seccion = _normalizar_seccion_especificacion(spec.get("seccion"))
        categoria_sugerida = (str(spec.get("categoria_sugerida") or "")).strip() or seccion
        campo_tecnico_id = spec.get("campo_tecnico_id")
        campo = None
        if campo_tecnico_id not in (None, ""):
            try:
                campo = CampoTecnico.query.get(int(campo_tecnico_id))
            except (TypeError, ValueError):
                campo = None

        if campo is None:
            campo = CampoTecnico.query.filter(
                func.lower(CampoTecnico.nombre) == nombre.lower(),
                CampoTecnico.tipo == tipo,
            ).first()

        if campo is None:
            campo = CampoTecnico(
                nombre=nombre,
                tipo=tipo,
                unidad_defecto=(str(spec.get("unidad") or "")).strip() or None,
                categoria_sugerida=categoria_sugerida,
                veces_usado=0,
            )
            db.session.add(campo)
            db.session.flush()

        campo.veces_usado = int(campo.veces_usado or 0) + 1
        if not campo.categoria_sugerida:
            campo.categoria_sugerida = categoria_sugerida
        
        if tipo == "cuantitativa":
            valor_numero_raw = spec.get("valor_numero")
            unidad = (str(spec.get("unidad") or "")).strip() or (campo.unidad_defecto or "")
            if valor_numero_raw is None or not unidad:
                continue
            try:
                valor_numero = float(valor_numero_raw)
            except (TypeError, ValueError):
                continue
            if not campo.unidad_defecto:
                campo.unidad_defecto = unidad
            especificaciones_validas.append({
                "campo_tecnico_id": campo.id,
                "nombre": nombre,
                "tipo": tipo,
                "seccion": seccion,
                "valor_numero": valor_numero,
                "unidad": unidad,
            })
        else:  # cualitativa
            valor_texto = (str(spec.get("valor_texto") or "")).strip()
            if not valor_texto:
                continue
            especificaciones_validas.append({
                "campo_tecnico_id": campo.id,
                "nombre": nombre,
                "tipo": tipo,
                "seccion": seccion,
                "valor_texto": valor_texto,
            })
    
    producto.especificaciones_tecnicas = especificaciones_validas if especificaciones_validas else None

    componentes_raw = _json_list_from_form("kit_componentes_json")
    componentes_validos = []
    ids_componentes = set()
    for idx, item in enumerate(componentes_raw):
        if not isinstance(item, dict):
            continue
        try:
            producto_id = int(item.get("producto_id"))
        except (TypeError, ValueError):
            continue
        if producto_id == producto.id or producto_id in ids_componentes:
            continue

        try:
            cantidad = Decimal(str(item.get("cantidad") or "1"))
        except Exception:
            cantidad = Decimal("1")
        if cantidad <= 0:
            cantidad = Decimal("1")

        nota = (str(item.get("nota") or "")).strip()[:255] or None
        ids_componentes.add(producto_id)
        componentes_validos.append(
            {
                "producto_id": producto_id,
                "cantidad": cantidad,
                "nota": nota,
                "orden": idx,
            }
        )

    KitProducto.query.filter_by(kit_id=producto.id).delete()
    if producto.tipo_producto in {"combo", "kit"}:
        for item in componentes_validos:
            existe = db.session.query(Producto.id).filter_by(id=item["producto_id"]).first()
            if not existe:
                continue
            db.session.add(
                KitProducto(
                    kit_id=producto.id,
                    producto_id=item["producto_id"],
                    cantidad=item["cantidad"],
                    nota=item["nota"],
                    orden=item["orden"],
                )
            )


@admin_bp.get("/api/campos-tecnicos/sugerencias")
def sugerencias_campos_tecnicos_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    q = (request.args.get("q") or "").strip().lower()
    tipo = (request.args.get("tipo") or "").strip().lower()
    limite = min(max(int(request.args.get("limit") or 12), 1), 50)

    query = CampoTecnico.query
    if q:
        query = query.filter(func.lower(CampoTecnico.nombre).like(f"%{q}%"))
    if tipo in {"cuantitativa", "cualitativa"}:
        query = query.filter(CampoTecnico.tipo == tipo)

    items = query.order_by(CampoTecnico.veces_usado.desc(), CampoTecnico.nombre.asc()).limit(limite).all()
    return jsonify(
        {
            "ok": True,
            "data": [
                {
                    "id": c.id,
                    "nombre": c.nombre,
                    "tipo": c.tipo,
                    "unidad_defecto": c.unidad_defecto,
                    "categoria_sugerida": c.categoria_sugerida,
                    "veces_usado": c.veces_usado,
                }
                for c in items
            ],
        }
    )



@admin_bp.get("/api/reparar-db")
def reparar_db_banners():
    """
    Ruta temporal para agregar columnas faltantes a la tabla banners manualmente
    si las migraciones automáticas fallan.
    """
    try:
        # 1. Agregar columna 'tipo'
        try:
            db.session.execute(text("ALTER TABLE banners ADD COLUMN tipo VARCHAR(20) DEFAULT 'hero' NOT NULL AFTER id"))
            db.session.commit()
        except Exception:
            db.session.rollback()

        # 2. Agregar columna 'subtitulo'
        try:
            db.session.execute(text("ALTER TABLE banners ADD COLUMN subtitulo VARCHAR(180) NULL AFTER titulo"))
            db.session.commit()
        except Exception:
            db.session.rollback()

        # 3. Agregar columna 'descripcion'
        try:
            db.session.execute(text("ALTER TABLE banners ADD COLUMN descripcion TEXT NULL AFTER subtitulo"))
            db.session.commit()
        except Exception:
            db.session.rollback()

        # 4. Agregar columna 'texto_boton'
        try:
            db.session.execute(text("ALTER TABLE banners ADD COLUMN texto_boton VARCHAR(50) DEFAULT 'Comprar Ahora' NULL AFTER descripcion"))
            db.session.commit()
        except Exception:
            db.session.rollback()

        # 5. Agregar columna 'color_fondo'
        try:
            db.session.execute(text("ALTER TABLE banners ADD COLUMN color_fondo VARCHAR(20) DEFAULT '#f8fbf8' NULL AFTER enlace_url"))
            db.session.commit()
        except Exception:
            db.session.rollback()

        # 6. Asegurar que imagen_url sea nullable (Opcional si el workaround de "" funciona)
        try:
            db.session.execute(text("ALTER TABLE banners MODIFY imagen_url VARCHAR(600) NULL"))
            db.session.commit()
        except Exception as e:
            db.session.rollback()

        return jsonify({
            "ok": True, 
            "message": "¡Sistema sincronizado con éxito! Ya puedes crear anuncios. Si la imagen no carga, el sistema usará un espacio reservado invisible."
        })
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500


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
        .filter(~AccesoPagina.ruta.contains('/api/'))
        .filter(~AccesoPagina.ruta.startswith('/estaticos'))
        .filter(~AccesoPagina.ruta.startswith('/placeholder'))
        .scalar()
    )
    # Contar visitantes únicos: usuarios autenticados + IPs anónimas únicas
    visitantes_autenticados_7d = (
        db.session.query(func.count(func.distinct(AccesoPagina.usuario_id)))
        .filter(AccesoPagina.usuario_id.isnot(None))
        .filter(AccesoPagina.created_at >= ahora - timedelta(days=7))
        .filter(~AccesoPagina.ruta.contains('/api/'))
        .filter(~AccesoPagina.ruta.startswith('/estaticos'))
        .filter(~AccesoPagina.ruta.startswith('/placeholder'))
        .scalar()
    )
    visitantes_anonimos_7d = (
        db.session.query(func.count(func.distinct(AccesoPagina.ip)))
        .filter(AccesoPagina.usuario_id.is_(None))
        .filter(AccesoPagina.created_at >= ahora - timedelta(days=7))
        .filter(~AccesoPagina.ruta.contains('/api/'))
        .filter(~AccesoPagina.ruta.startswith('/estaticos'))
        .filter(~AccesoPagina.ruta.startswith('/placeholder'))
        .scalar()
    )
    visitantes_unicos_7d = (visitantes_autenticados_7d or 0) + (visitantes_anonimos_7d or 0)
    visitas_hoy = (
        db.session.query(func.count(func.distinct(case(
            (AccesoPagina.usuario_id.isnot(None), AccesoPagina.usuario_id),
            else_=AccesoPagina.ip
        ))))
        .filter(AccesoPagina.created_at >= ahora.replace(hour=0, minute=0, second=0, microsecond=0))
        .filter(~AccesoPagina.ruta.contains('/api/'))
        .filter(~AccesoPagina.ruta.startswith('/estaticos'))
        .filter(~AccesoPagina.ruta.startswith('/placeholder'))
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


@admin_bp.get("/api/categorias")
def listar_categorias_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    linea = (request.args.get("linea") or "").strip().lower()
    query = Categoria.query.order_by(Categoria.nombre.asc())
    if linea in {"piscina", "agua"}:
        query = query.filter(Categoria.linea == linea)

    categorias = query.all()
    return jsonify(
        {
            "ok": True,
            "data": [_serializar_categoria(c) for c in categorias],
        }
    )


@admin_bp.post("/api/categorias")
def crear_categoria_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    nombre = (request.form.get("nombre") or "").strip()
    slug = _slugify(request.form.get("slug") or nombre)
    linea = (request.form.get("linea") or "piscina").strip().lower()
    descripcion = (request.form.get("descripcion") or "").strip() or None
    activo = _bool_form(request.form.get("activo"), default=True)
    campos_payload = _json_list_from_form("campos_tecnicos_json")

    if not nombre:
        return jsonify({"ok": False, "message": "El nombre de la categoria es obligatorio."}), 400
    if not slug:
        return jsonify({"ok": False, "message": "El slug de la categoria es obligatorio."}), 400
    if linea not in {"piscina", "agua"}:
        return jsonify({"ok": False, "message": "Linea invalida para la categoria."}), 400
    if Categoria.query.filter((Categoria.nombre == nombre) | (Categoria.slug == slug)).first():
        return jsonify({"ok": False, "message": "Ya existe una categoria con ese nombre o slug."}), 409

    categoria = Categoria(
        nombre=nombre,
        slug=slug,
        linea=linea,
        descripcion=descripcion,
        activo=activo,
    )
    _upsert_campos_tecnicos_categoria(categoria, campos_payload)
    db.session.add(categoria)
    db.session.commit()

    return jsonify({"ok": True, "message": "Categoria creada.", "data": _serializar_categoria(categoria)}), 201


@admin_bp.patch("/api/categorias/<int:categoria_id>")
def editar_categoria_api(categoria_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    categoria = Categoria.query.get_or_404(categoria_id)
    nombre = (request.form.get("nombre") or categoria.nombre).strip()
    slug = _slugify(request.form.get("slug") or categoria.slug)
    linea = (request.form.get("linea") or categoria.linea).strip().lower()
    descripcion = (request.form.get("descripcion") or "").strip() or None
    activo = _bool_form(request.form.get("activo"), default=categoria.activo)
    campos_payload = _json_list_from_form("campos_tecnicos_json")

    existe = Categoria.query.filter(
        Categoria.id != categoria.id,
        (Categoria.nombre == nombre) | (Categoria.slug == slug),
    ).first()
    if existe:
        return jsonify({"ok": False, "message": "Ya existe una categoria con ese nombre o slug."}), 409

    categoria.nombre = nombre
    categoria.slug = slug
    categoria.linea = linea if linea in {"piscina", "agua"} else categoria.linea
    categoria.descripcion = descripcion
    categoria.activo = activo
    _upsert_campos_tecnicos_categoria(categoria, campos_payload)
    db.session.commit()

    return jsonify({"ok": True, "message": "Categoria actualizada.", "data": _serializar_categoria(categoria)})


@admin_bp.delete("/api/categorias/<int:categoria_id>")
def eliminar_categoria_api(categoria_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    categoria = Categoria.query.get_or_404(categoria_id)
    productos_count = Producto.query.filter_by(categoria_id=categoria.id).count()
    fichas_count = FichaTecnica.query.filter_by(categoria_id=categoria.id).count()

    if productos_count > 0 or fichas_count > 0:
        return jsonify(
            {
                "ok": False,
                "message": (
                    "No se puede eliminar la categoria porque tiene "
                    f"{productos_count} producto(s) y {fichas_count} ficha(s) asociada(s)."
                ),
            }
        ), 409

    db.session.delete(categoria)
    db.session.commit()
    return jsonify({"ok": True, "message": "Categoria eliminada."})


@admin_bp.get("/api/fichas-tecnicas")
def listar_fichas_tecnicas_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    q = (request.args.get("q") or "").strip().lower()
    linea = (request.args.get("linea") or "").strip().lower()
    categoria_id_raw = (request.args.get("categoria_id") or "").strip()
    solo_disponibles = _bool_form(request.args.get("solo_disponibles"), default=False)

    query = FichaTecnica.query
    if q:
        patron = f"%{q}%"
        query = query.filter(
            (func.lower(FichaTecnica.nombre).like(patron))
            | (func.lower(FichaTecnica.referencia).like(patron))
        )
    if linea in {"agua", "piscina"}:
        query = query.filter(FichaTecnica.linea == linea)
    if categoria_id_raw:
        try:
            query = query.filter(FichaTecnica.categoria_id == int(categoria_id_raw))
        except (TypeError, ValueError):
            pass
    if solo_disponibles:
        query = query.outerjoin(Producto, Producto.ficha_tecnica_id == FichaTecnica.id).filter(Producto.id.is_(None))

    fichas = query.order_by(FichaTecnica.nombre.asc()).limit(500).all()
    return jsonify({"ok": True, "data": [_serializar_ficha_tecnica(f) for f in fichas]})


@admin_bp.get("/api/fichas-tecnicas/buscar")
def buscar_fichas_tecnicas_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    q = (request.args.get("q") or "").strip().lower()
    limite = min(max(int(request.args.get("limit") or 20), 1), 60)
    if not q:
        return jsonify({"ok": True, "data": []})

    patron = f"%{q}%"
    fichas = (
        FichaTecnica.query.filter(
            (func.lower(FichaTecnica.nombre).like(patron))
            | (func.lower(FichaTecnica.referencia).like(patron))
        )
        .order_by(FichaTecnica.nombre.asc())
        .limit(limite)
        .all()
    )
    return jsonify({"ok": True, "data": [_serializar_ficha_tecnica(f) for f in fichas]})


@admin_bp.post("/api/fichas-tecnicas")
def crear_ficha_tecnica_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    payload = request.get_json(silent=True) or {}
    nombre = (payload.get("nombre") or "").strip()
    referencia = (payload.get("referencia") or "").strip()
    marca = (payload.get("marca") or "").strip() or None
    linea = (payload.get("linea") or "agua").strip().lower()
    descripcion = (payload.get("descripcion") or "").strip() or None
    garantia = (payload.get("garantia") or "").strip() or None
    aplicacion = (payload.get("aplicacion") or "").strip() or None
    ficha_pdf_url = (payload.get("ficha_pdf_url") or "").strip() or None
    categoria_id = payload.get("categoria_id")

    if not nombre or not referencia:
        return jsonify({"ok": False, "message": "Nombre y referencia son obligatorios para la ficha."}), 400
    if linea not in {"agua", "piscina"}:
        return jsonify({"ok": False, "message": "La linea de la ficha debe ser agua o piscina."}), 400
    if FichaTecnica.query.filter(func.lower(FichaTecnica.referencia) == referencia.lower()).first():
        return jsonify({"ok": False, "message": "Ya existe una ficha con esa referencia."}), 409

    categoria = None
    if categoria_id not in (None, ""):
        try:
            categoria = Categoria.query.get(int(categoria_id))
        except (TypeError, ValueError):
            categoria = None
        if not categoria:
            return jsonify({"ok": False, "message": "La categoria seleccionada no existe."}), 400
        linea = categoria.linea

    especificaciones = payload.get("especificaciones") if isinstance(payload.get("especificaciones"), list) else []
    caracteristicas = payload.get("caracteristicas") if isinstance(payload.get("caracteristicas"), list) else []
    componentes = payload.get("componentes") if isinstance(payload.get("componentes"), list) else []

    ficha = FichaTecnica(
        nombre=nombre,
        referencia=referencia,
        marca=marca,
        categoria_id=categoria.id if categoria else None,
        linea=linea,
        descripcion=descripcion,
        especificaciones=especificaciones,
        caracteristicas=caracteristicas,
        componentes=componentes,
        garantia=garantia,
        aplicacion=aplicacion,
        ficha_pdf_url=ficha_pdf_url,
    )
    db.session.add(ficha)
    db.session.commit()

    return jsonify({"ok": True, "message": "Ficha tecnica creada.", "data": _serializar_ficha_tecnica(ficha)}), 201


@admin_bp.patch("/api/fichas-tecnicas/<int:ficha_id>")
def editar_ficha_tecnica_api(ficha_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    ficha = FichaTecnica.query.get_or_404(ficha_id)
    payload = request.get_json(silent=True) or {}

    nombre = (payload.get("nombre") or ficha.nombre).strip()
    referencia = (payload.get("referencia") or ficha.referencia).strip()
    marca = (payload.get("marca") or "").strip() or None
    linea = (payload.get("linea") or ficha.linea).strip().lower()
    descripcion = (payload.get("descripcion") or "").strip() or None
    garantia = (payload.get("garantia") or "").strip() or None
    aplicacion = (payload.get("aplicacion") or "").strip() or None
    ficha_pdf_url = (payload.get("ficha_pdf_url") or "").strip() or None

    if not nombre or not referencia:
        return jsonify({"ok": False, "message": "Nombre y referencia son obligatorios."}), 400
    if linea not in {"agua", "piscina"}:
        return jsonify({"ok": False, "message": "La linea de la ficha debe ser agua o piscina."}), 400

    existe_ref = FichaTecnica.query.filter(
        FichaTecnica.id != ficha.id,
        func.lower(FichaTecnica.referencia) == referencia.lower(),
    ).first()
    if existe_ref:
        return jsonify({"ok": False, "message": "Ya existe otra ficha con esa referencia."}), 409

    categoria = None
    categoria_id = payload.get("categoria_id", ficha.categoria_id)
    if categoria_id not in (None, ""):
        try:
            categoria = Categoria.query.get(int(categoria_id))
        except (TypeError, ValueError):
            categoria = None
        if not categoria:
            return jsonify({"ok": False, "message": "La categoria seleccionada no existe."}), 400
        linea = categoria.linea

    ficha.nombre = nombre
    ficha.referencia = referencia
    ficha.marca = marca
    ficha.categoria_id = categoria.id if categoria else None
    ficha.linea = linea
    ficha.descripcion = descripcion
    ficha.garantia = garantia
    ficha.aplicacion = aplicacion
    ficha.ficha_pdf_url = ficha_pdf_url
    if isinstance(payload.get("especificaciones"), list):
        ficha.especificaciones = payload.get("especificaciones")
    if isinstance(payload.get("caracteristicas"), list):
        ficha.caracteristicas = payload.get("caracteristicas")
    if isinstance(payload.get("componentes"), list):
        ficha.componentes = payload.get("componentes")

    advertencia = None
    if ficha.productos:
        for producto_asociado in ficha.productos:
            _sync_producto_desde_ficha(producto_asociado, ficha)
        advertencia = "Se sincronizaron los cambios en los productos asociados (excepto precio, foto y stock)."

    db.session.commit()
    return jsonify(
        {
            "ok": True,
            "message": "Ficha tecnica actualizada.",
            "warning": advertencia,
            "data": _serializar_ficha_tecnica(ficha),
        }
    )


@admin_bp.delete("/api/fichas-tecnicas/<int:ficha_id>")
def eliminar_ficha_tecnica_api(ficha_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    ficha = FichaTecnica.query.get_or_404(ficha_id)
    productos_count = Producto.query.filter_by(ficha_tecnica_id=ficha.id).count()
    if productos_count > 0:
        return jsonify(
            {
                "ok": False,
                "message": (
                    "No se puede eliminar la ficha tecnica porque esta asociada a "
                    f"{productos_count} producto(s)."
                ),
            }
        ), 409

    db.session.delete(ficha)
    db.session.commit()
    return jsonify({"ok": True, "message": "Ficha tecnica eliminada."})


@admin_bp.post("/api/fichas-tecnicas/upload-pdf")
def subir_pdf_ficha_tecnica_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    archivo = request.files.get("archivo")
    if not _ficha_pdf_valida(archivo):
        return jsonify({"ok": False, "message": "Debes seleccionar un archivo PDF valido."}), 400

    nombre = (request.form.get("nombre") or "").strip()
    referencia = (request.form.get("referencia") or "").strip()
    slug_base = _slugify(referencia or nombre or "ficha-tecnica")
    if not slug_base:
        slug_base = f"ficha-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"

    url = _guardar_ficha_local(archivo, slug=slug_base)
    return jsonify({"ok": True, "message": "PDF cargado correctamente.", "data": {"url": url}})


@admin_bp.post("/api/fichas-tecnicas/importar-json")
def importar_fichas_tecnicas_json_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    payload = request.get_json(silent=True) or {}
    items = payload.get("items")
    dry_run = bool(payload.get("dry_run", True))

    if not isinstance(items, list) or not items:
        return jsonify({"ok": False, "message": "Debes enviar una lista JSON de fichas en 'items'."}), 400

    resumen = {
        "total": len(items),
        "validos": 0,
        "duplicados": 0,
        "creados": 0,
        "errores": 0,
        "errores_detalle": [],
    }

    existentes_ref = {
        (ref or "").strip().lower()
        for (ref,) in db.session.query(FichaTecnica.referencia).all()
        if ref
    }
    nuevas_fichas = []

    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            resumen["errores"] += 1
            resumen["errores_detalle"].append({"fila": idx + 1, "error": "Registro invalido (debe ser objeto JSON)."})
            continue

        nombre = str(item.get("nombre") or "").strip()
        referencia = str(item.get("referencia") or "").strip()
        categoria_nombre = str(item.get("categoria") or "").strip()
        linea = str(item.get("linea") or "").strip().lower()
        marca = str(item.get("marca") or "").strip() or None
        garantia = str(item.get("garantia") or "").strip() or None

        if not nombre or not referencia:
            resumen["errores"] += 1
            resumen["errores_detalle"].append({"fila": idx + 1, "referencia": referencia, "error": "Nombre y referencia son obligatorios."})
            continue

        ref_key = referencia.lower()
        if ref_key in existentes_ref:
            resumen["duplicados"] += 1
            resumen["errores_detalle"].append({"fila": idx + 1, "referencia": referencia, "error": "Referencia ya existe, se omitio."})
            continue

        categoria = None
        if not categoria_nombre:
            resumen["errores"] += 1
            resumen["errores_detalle"].append(
                {
                    "fila": idx + 1,
                    "referencia": referencia,
                    "error": "La categoria es obligatoria y debe existir exactamente en el sistema.",
                }
            )
            continue

        categoria = Categoria.query.filter(Categoria.nombre == categoria_nombre).first()
        if not categoria:
            resumen["errores"] += 1
            resumen["errores_detalle"].append(
                {
                    "fila": idx + 1,
                    "referencia": referencia,
                    "error": "Categoria no encontrada. Crea la categoria exacta antes de importar.",
                }
            )
            continue

        linea = categoria.linea

        especificaciones_raw = item.get("especificaciones") if isinstance(item.get("especificaciones"), list) else []
        caracteristicas_raw = item.get("caracteristicas") if isinstance(item.get("caracteristicas"), list) else []
        componentes_raw = item.get("componentes") if isinstance(item.get("componentes"), list) else []

        especificaciones = []
        for spec in especificaciones_raw:
            if not isinstance(spec, dict):
                continue
            nombre_spec = str(spec.get("nombre") or "").strip()
            tipo_spec = str(spec.get("tipo") or "").strip().lower()
            valor_raw = spec.get("valor")
            unidad = str(spec.get("unidad") or "").strip() or None
            if not nombre_spec or tipo_spec not in {"cuantitativa", "cualitativa"}:
                continue

            especificaciones.append(
                {
                    "nombre": nombre_spec,
                    "tipo": tipo_spec,
                    "valor": valor_raw,
                    "unidad": unidad,
                }
            )

        caracteristicas = [str(c).strip() for c in caracteristicas_raw if str(c).strip()]
        componentes = []
        for comp in componentes_raw:
            if not isinstance(comp, dict):
                continue
            nombre_comp = str(comp.get("nombre") or "").strip()
            if not nombre_comp:
                continue
            componentes.append(
                {
                    "nombre": nombre_comp,
                    "referencia": comp.get("referencia"),
                    "cantidad": comp.get("cantidad"),
                    "notas": comp.get("notas"),
                }
            )

        ficha = FichaTecnica(
            nombre=nombre,
            referencia=referencia,
            marca=marca,
            categoria_id=categoria.id if categoria else None,
            linea=linea,
            descripcion=str(item.get("descripcion") or "").strip() or None,
            especificaciones=especificaciones,
            caracteristicas=caracteristicas,
            componentes=componentes,
            garantia=garantia,
            aplicacion=str(item.get("aplicacion") or "").strip() or None,
            ficha_pdf_url=str(item.get("ficha_pdf_url") or "").strip() or None,
        )
        nuevas_fichas.append(ficha)
        existentes_ref.add(ref_key)
        resumen["validos"] += 1

    if not dry_run and nuevas_fichas:
        db.session.add_all(nuevas_fichas)
        db.session.commit()
        resumen["creados"] = len(nuevas_fichas)

    return jsonify(
        {
            "ok": True,
            "message": "Validacion completada." if dry_run else "Importacion completada.",
            "data": resumen,
        }
    )


@admin_bp.post("/api/fichas-tecnicas/preparar-categorias")
def preparar_categorias_desde_json_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    payload = request.get_json(silent=True) or {}
    items = payload.get("items")
    dry_run = bool(payload.get("dry_run", True))

    if not isinstance(items, list) or not items:
        return jsonify({"ok": False, "message": "Debes enviar una lista JSON de fichas en 'items'."}), 400

    resumen = {
        "total": len(items),
        "existentes": 0,
        "por_crear": 0,
        "creadas": 0,
        "errores": 0,
        "errores_detalle": [],
        "categorias_detectadas": [],
    }

    candidatos = {}
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            resumen["errores"] += 1
            resumen["errores_detalle"].append({"fila": idx + 1, "error": "Registro invalido (debe ser objeto JSON)."})
            continue

        categoria_nombre = str(item.get("categoria") or "").strip()
        linea = str(item.get("linea") or "").strip().lower()
        if not categoria_nombre:
            resumen["errores"] += 1
            resumen["errores_detalle"].append({"fila": idx + 1, "error": "Falta categoria."})
            continue
        if linea not in {"agua", "piscina"}:
            resumen["errores"] += 1
            resumen["errores_detalle"].append(
                {
                    "fila": idx + 1,
                    "categoria": categoria_nombre,
                    "error": "Linea invalida. Debe ser 'agua' o 'piscina'.",
                }
            )
            continue
        candidatos[categoria_nombre] = linea

    existentes = {
        c.nombre: c
        for c in Categoria.query.filter(Categoria.nombre.in_(list(candidatos.keys()))).all()
    }

    por_crear = []
    for nombre_cat, linea_cat in candidatos.items():
        if nombre_cat in existentes:
            resumen["existentes"] += 1
            resumen["categorias_detectadas"].append(
                {"nombre": nombre_cat, "linea": existentes[nombre_cat].linea, "estado": "existente"}
            )
            continue
        por_crear.append((nombre_cat, linea_cat))
        resumen["por_crear"] += 1
        resumen["categorias_detectadas"].append(
            {"nombre": nombre_cat, "linea": linea_cat, "estado": "faltante"}
        )

    if not dry_run and por_crear:
        slugs_ocupados = {s for (s,) in db.session.query(Categoria.slug).all() if s}
        for nombre_cat, linea_cat in por_crear:
            slug_base = _slugify(nombre_cat) or f"categoria-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
            slug_final = slug_base
            i = 2
            while slug_final in slugs_ocupados:
                slug_final = f"{slug_base}-{i}"
                i += 1
            slugs_ocupados.add(slug_final)
            db.session.add(
                Categoria(
                    nombre=nombre_cat,
                    slug=slug_final,
                    linea=linea_cat,
                    descripcion=None,
                    activo=True,
                )
            )
            resumen["creadas"] += 1
        db.session.commit()

    return jsonify(
        {
            "ok": True,
            "message": "Validacion de categorias completada." if dry_run else "Categorias creadas correctamente.",
            "data": resumen,
        }
    )


@admin_bp.post("/api/fichas-tecnicas/sincronizar-productos-existentes")
def sincronizar_fichas_desde_productos_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    payload = request.get_json(silent=True) or {}
    dry_run = bool(payload.get("dry_run", False))

    resumen = {
        "productos_total": 0,
        "ya_vinculados": 0,
        "fichas_creadas": 0,
        "vinculos_actualizados": 0,
        "omitidos_sin_categoria": 0,
        "errores": 0,
        "errores_detalle": [],
    }

    productos = Producto.query.order_by(Producto.id.asc()).all()
    resumen["productos_total"] = len(productos)

    referencias_existentes = {
        (ref or "").strip().lower()
        for (ref,) in db.session.query(FichaTecnica.referencia).all()
        if ref
    }

    for producto in productos:
        if producto.ficha_tecnica_id:
            resumen["ya_vinculados"] += 1
            continue
        if not producto.categoria_id:
            resumen["omitidos_sin_categoria"] += 1
            continue

        referencia_base = (producto.referencia or "").strip() or (producto.slug or "").strip() or f"PROD-{producto.id}"
        referencia = referencia_base
        suffix = 2
        while referencia.lower() in referencias_existentes:
            referencia = f"{referencia_base}-{suffix}"
            suffix += 1
        referencias_existentes.add(referencia.lower())

        garantia_txt = None
        if producto.garantia_meses not in (None, 0):
            meses = int(producto.garantia_meses)
            garantia_txt = f"{meses // 12} año" if meses % 12 == 0 and meses >= 12 else f"{meses} meses"

        especificaciones_ficha = []
        if isinstance(producto.especificaciones_tecnicas, list):
            for spec in producto.especificaciones_tecnicas:
                if not isinstance(spec, dict):
                    continue
                nombre = str(spec.get("nombre") or "").strip()
                tipo = str(spec.get("tipo") or "").strip().lower()
                if not nombre or tipo not in {"cuantitativa", "cualitativa"}:
                    continue
                if tipo == "cuantitativa":
                    especificaciones_ficha.append(
                        {
                            "nombre": nombre,
                            "tipo": "cuantitativa",
                            "valor": spec.get("valor_numero"),
                            "unidad": spec.get("unidad"),
                        }
                    )
                else:
                    especificaciones_ficha.append(
                        {
                            "nombre": nombre,
                            "tipo": "cualitativa",
                            "valor": spec.get("valor_texto"),
                            "unidad": None,
                        }
                    )

        ficha = FichaTecnica(
            nombre=producto.nombre,
            referencia=referencia,
            marca=producto.marca,
            categoria_id=producto.categoria_id,
            linea=producto.linea,
            descripcion=producto.descripcion,
            especificaciones=especificaciones_ficha,
            caracteristicas=[c.texto for c in sorted(producto.caracteristicas, key=lambda x: (x.orden, x.id))],
            componentes=[{"nombre": c.texto, "referencia": None, "cantidad": None, "notas": None} for c in sorted(producto.contenido_kit, key=lambda x: (x.orden, x.id))],
            garantia=garantia_txt,
            aplicacion=producto.aplicacion_recomendada,
            ficha_pdf_url=producto.ficha_url,
        )

        if not dry_run:
            db.session.add(ficha)
            db.session.flush()
            producto.ficha_tecnica_id = ficha.id

        resumen["fichas_creadas"] += 1
        resumen["vinculos_actualizados"] += 1

    if not dry_run:
        db.session.commit()

    return jsonify(
        {
            "ok": True,
            "message": "Sincronizacion completada.",
            "data": resumen,
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
    categoria_id_raw = (request.form.get("categoria_id") or "").strip()
    ficha_tecnica_id_raw = (request.form.get("ficha_tecnica_id") or "").strip()
    descripcion = (request.form.get("descripcion") or "").strip()
    tipo_producto = (request.form.get("tipo_producto") or "estandar").strip().lower()
    marca = (request.form.get("marca") or "").strip()
    referencia = (request.form.get("referencia") or "").strip()
    aplicacion_recomendada = (request.form.get("aplicacion_recomendada") or "").strip()
    garantia_meses_raw = (request.form.get("garantia_meses") or "").strip()
    precio = _decimal(request.form.get("precio"), "0")
    precio_anterior_raw = (request.form.get("precio_anterior") or "").strip()
    precio_anterior = _decimal(precio_anterior_raw, "0") if precio_anterior_raw else None
    stock = _int_nonneg(request.form.get("stock"), 0)
    estado_disponibilidad = _normalizar_estado_disponibilidad(request.form.get("estado_disponibilidad"))
    imagen_url = (request.form.get("imagen_url") or "").strip() or None
    imagen = request.files.get("imagen")
    ficha_pdf = request.files.get("ficha_pdf")

    categoria = None
    ficha_tecnica = None
    if ficha_tecnica_id_raw:
        try:
            ficha_tecnica = FichaTecnica.query.get(int(ficha_tecnica_id_raw))
        except (TypeError, ValueError):
            ficha_tecnica = None
        if not ficha_tecnica:
            return jsonify({"ok": False, "message": "La ficha tecnica seleccionada no existe."}), 400

    if categoria_id_raw:
        try:
            categoria = Categoria.query.get(int(categoria_id_raw))
        except (TypeError, ValueError):
            categoria = None
        if not categoria:
            return jsonify({"ok": False, "message": "La categoria seleccionada no existe."}), 400
        linea = categoria.linea

    garantia_meses = None
    if garantia_meses_raw:
        try:
            garantia_meses = max(int(garantia_meses_raw), 0)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "message": "La garantia debe estar en meses (numero entero)."}), 400

    if tipo_producto not in {"estandar", "combo", "kit"}:
        tipo_producto = "estandar"

    if not nombre or not slug:
        return jsonify({"ok": False, "message": "Nombre y slug son obligatorios."}), 400
    if Producto.query.filter_by(slug=slug).first():
        return jsonify({"ok": False, "message": "El slug ya existe."}), 409
    if imagen and not _imagen_valida(imagen):
        return jsonify({"ok": False, "message": "La foto debe ser JPG, PNG o WEBP."}), 400
    if ficha_pdf and getattr(ficha_pdf, "filename", "") and not _ficha_pdf_valida(ficha_pdf):
        return jsonify({"ok": False, "message": "La ficha tecnica debe ser un PDF valido."}), 400
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

    ficha_url = None
    if ficha_pdf and getattr(ficha_pdf, "filename", ""):
        try:
            ficha_url = _guardar_ficha_local(ficha_pdf, slug=slug)
        except Exception:
            return jsonify({"ok": False, "message": "No se pudo guardar la ficha tecnica en el servidor."}), 500

    producto = Producto(
        nombre=nombre,
        slug=slug,
        linea=linea if linea in {"piscina", "agua"} else "piscina",
        categoria_id=categoria.id if categoria else None,
        descripcion=descripcion or None,
        tipo_producto=tipo_producto,
        es_kit=(tipo_producto in {"combo", "kit"}),
        marca=marca or None,
        referencia=referencia or None,
        aplicacion_recomendada=aplicacion_recomendada or None,
        garantia_meses=garantia_meses,
        precio=precio,
        precio_anterior=precio_anterior,
        stock=max(stock, 0),
        activo=True,
        estado_disponibilidad=estado_disponibilidad,
        imagen_url=imagen_url,
        imagen_public_id=imagen_public_id,
        ficha_url=ficha_url,
        ficha_tecnica_id=ficha_tecnica.id if ficha_tecnica else None,
    )
    db.session.add(producto)
    db.session.flush()

    try:
        _actualizar_relaciones_producto(producto, categoria)
    except ValueError as exc:
        db.session.rollback()
        return jsonify({"ok": False, "message": str(exc)}), 400
    except Exception:
        db.session.rollback()
        return jsonify({"ok": False, "message": "No se pudieron guardar los datos avanzados del producto."}), 500

    if ficha_tecnica:
        _sync_producto_desde_ficha(producto, ficha_tecnica)
        if not ficha_url and ficha_tecnica.ficha_pdf_url:
            producto.ficha_url = ficha_tecnica.ficha_pdf_url

    db.session.commit()
    invalidate_destacados_cache()

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
                    "tipo_producto": p.tipo_producto or ("kit" if p.es_kit else "estandar"),
                    "es_kit": bool(p.es_kit or (p.tipo_producto in {"combo", "kit"})),
                    "categoria_id": p.categoria_id,
                    "categoria_nombre": p.categoria.nombre if p.categoria else None,
                    "descripcion": p.descripcion or "",
                    "marca": p.marca or "",
                    "referencia": p.referencia or "",
                    "ficha_tecnica_id": p.ficha_tecnica_id,
                    "ficha_tecnica_nombre": p.ficha_tecnica.nombre if p.ficha_tecnica else None,
                    "aplicacion_recomendada": p.aplicacion_recomendada or "",
                    "garantia_meses": p.garantia_meses,
                    "precio": float(p.precio),
                    "precio_anterior": float(p.precio_anterior) if p.precio_anterior is not None else None,
                    "stock": p.stock,
                    "estado_disponibilidad": p.estado_disponibilidad or "borrador",
                    "imagen_url": p.imagen_url,
                    "ficha_url": p.ficha_url,
                    "caracteristicas": [c.texto for c in sorted(p.caracteristicas, key=lambda x: (x.orden, x.id))],
                    "contenido_kit": [c.texto for c in sorted(p.contenido_kit, key=lambda x: (x.orden, x.id))],
                    "especificaciones_tecnicas": p.especificaciones_tecnicas or [],
                    "recomendados_ids": [int(r.id) for r in p.recomendados],
                    "campos_tecnicos": [
                        {
                            "campo_id": v.campo_tecnico_id,
                            "valor": v.valor_mostrar,
                        }
                        for v in p.campos_tecnicos_valores
                    ],
                    "imagenes_adicionales": [
                        {
                            "id": img.id,
                            "imagen_url": img.imagen_url,
                            "alt_text": img.alt_text,
                        }
                        for img in sorted(p.imagenes_adicionales, key=lambda x: (x.orden, x.id))
                    ],
                    "kit_componentes": [
                        {
                            "producto_id": rel.producto_id,
                            "nombre": rel.producto.nombre if rel.producto else "",
                            "slug": rel.producto.slug if rel.producto else "",
                            "cantidad": float(rel.cantidad or 0),
                            "nota": rel.nota or "",
                            "orden": rel.orden,
                        }
                        for rel in sorted(p.kit_componentes, key=lambda x: (x.orden, x.id))
                        if rel.producto
                    ],
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
    categoria_id_raw = (request.form.get("categoria_id") or "").strip()
    ficha_tecnica_id_raw = (request.form.get("ficha_tecnica_id") or "").strip()
    descripcion = (request.form.get("descripcion") or "").strip()
    tipo_producto = (request.form.get("tipo_producto") or ("kit" if producto.es_kit else "estandar")).strip().lower()
    marca = (request.form.get("marca") or "").strip()
    referencia = (request.form.get("referencia") or "").strip()
    aplicacion_recomendada = (request.form.get("aplicacion_recomendada") or "").strip()
    garantia_meses_raw = (request.form.get("garantia_meses") or "").strip()
    precio = _decimal(request.form.get("precio", producto.precio), str(producto.precio))
    precio_anterior_raw = (request.form.get("precio_anterior") or "").strip()
    precio_anterior = _decimal(precio_anterior_raw, "0") if precio_anterior_raw else None
    stock = _int_nonneg(request.form.get("stock", producto.stock), producto.stock)
    estado_disponibilidad = _normalizar_estado_disponibilidad(request.form.get("estado_disponibilidad") or producto.estado_disponibilidad)
    imagen = request.files.get("imagen")
    ficha_pdf = request.files.get("ficha_pdf")
    eliminar_ficha = (request.form.get("eliminar_ficha") or "").strip().lower() in {"1", "true", "on", "si"}

    categoria = None
    ficha_tecnica = None
    if ficha_tecnica_id_raw:
        try:
            ficha_tecnica = FichaTecnica.query.get(int(ficha_tecnica_id_raw))
        except (TypeError, ValueError):
            ficha_tecnica = None
        if not ficha_tecnica:
            return jsonify({"ok": False, "message": "La ficha tecnica seleccionada no existe."}), 400

    if categoria_id_raw:
        try:
            categoria = Categoria.query.get(int(categoria_id_raw))
        except (TypeError, ValueError):
            categoria = None
        if not categoria:
            return jsonify({"ok": False, "message": "La categoria seleccionada no existe."}), 400
        linea = categoria.linea

    garantia_meses = None
    if garantia_meses_raw:
        try:
            garantia_meses = max(int(garantia_meses_raw), 0)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "message": "La garantia debe estar en meses (numero entero)."}), 400

    if tipo_producto not in {"estandar", "combo", "kit"}:
        tipo_producto = producto.tipo_producto or "estandar"

    existe = Producto.query.filter(Producto.slug == slug, Producto.id != producto.id).first()
    if existe:
        return jsonify({"ok": False, "message": "Ese slug ya esta en uso."}), 409

    if imagen and not _imagen_valida(imagen):
        return jsonify({"ok": False, "message": "La foto debe ser JPG, PNG o WEBP."}), 400
    if ficha_pdf and getattr(ficha_pdf, "filename", "") and not _ficha_pdf_valida(ficha_pdf):
        return jsonify({"ok": False, "message": "La ficha tecnica debe ser un PDF valido."}), 400

    if imagen:
        try:
            upload = subir_imagen_producto(imagen, slug=slug)
            producto.imagen_url = upload.get("secure_url") or producto.imagen_url
            producto.imagen_public_id = upload.get("public_id") or producto.imagen_public_id
        except Exception:
            return jsonify({"ok": False, "message": "No se pudo actualizar la foto."}), 502

    if eliminar_ficha:
        producto.ficha_url = None

    if ficha_pdf and getattr(ficha_pdf, "filename", ""):
        try:
            producto.ficha_url = _guardar_ficha_local(ficha_pdf, slug=slug)
        except Exception:
            return jsonify({"ok": False, "message": "No se pudo guardar la ficha tecnica."}), 500

    producto.nombre = nombre
    producto.slug = slug
    producto.linea = linea if linea in {"piscina", "agua"} else producto.linea
    producto.categoria_id = categoria.id if categoria else None
    producto.descripcion = descripcion or None
    producto.tipo_producto = tipo_producto
    producto.es_kit = tipo_producto in {"combo", "kit"}
    producto.marca = marca or None
    producto.referencia = referencia or None
    producto.aplicacion_recomendada = aplicacion_recomendada or None
    producto.garantia_meses = garantia_meses
    producto.precio = precio
    producto.precio_anterior = precio_anterior
    producto.stock = max(stock, 0)
    producto.estado_disponibilidad = estado_disponibilidad
    producto.ficha_tecnica_id = ficha_tecnica.id if ficha_tecnica else None

    try:
        _actualizar_relaciones_producto(producto, categoria)
    except ValueError as exc:
        db.session.rollback()
        return jsonify({"ok": False, "message": str(exc)}), 400
    except Exception:
        db.session.rollback()
        return jsonify({"ok": False, "message": "No se pudieron actualizar los datos avanzados del producto."}), 500

    if ficha_tecnica:
        _sync_producto_desde_ficha(producto, ficha_tecnica)
        if not (ficha_pdf and getattr(ficha_pdf, "filename", "")) and ficha_tecnica.ficha_pdf_url:
            producto.ficha_url = ficha_tecnica.ficha_pdf_url

    db.session.commit()
    invalidate_destacados_cache()

    return jsonify({"ok": True, "message": "Producto actualizado correctamente."})


@admin_bp.delete("/api/productos/<int:producto_id>")
def eliminar_producto_api(producto_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    producto = Producto.query.get_or_404(producto_id)

    usado_en_kits = KitProducto.query.filter_by(producto_id=producto.id).count()
    if usado_en_kits > 0:
        return jsonify(
            {
                "ok": False,
                "message": (
                    "No se puede eliminar el producto porque esta siendo usado como componente en "
                    f"{usado_en_kits} kit(s)."
                ),
            }
        ), 409

    ProductoRecomendado.query.filter(
        (ProductoRecomendado.producto_id == producto.id)
        | (ProductoRecomendado.recomendado_id == producto.id)
    ).delete(synchronize_session=False)
    KitProducto.query.filter_by(kit_id=producto.id).delete(synchronize_session=False)
    DestacadoHome.query.filter_by(producto_id=producto.id).delete(synchronize_session=False)
    Promocion.query.filter_by(producto_id=producto.id).delete(synchronize_session=False)

    db.session.delete(producto)
    db.session.commit()
    invalidate_destacados_cache()
    return jsonify({"ok": True, "message": "Producto eliminado."})


@admin_bp.get("/api/productos/buscar")
def buscar_productos_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    q = (request.args.get("q") or "").strip().lower()
    excluir_id = request.args.get("exclude_id")
    limite = min(max(int(request.args.get("limit") or 20), 1), 80)

    query = Producto.query.order_by(Producto.nombre.asc())
    if q:
        query = query.filter(
            (func.lower(Producto.nombre).like(f"%{q}%"))
            | (func.lower(Producto.slug).like(f"%{q}%"))
            | (func.lower(func.coalesce(Producto.referencia, "")).like(f"%{q}%"))
        )
    if excluir_id:
        try:
            query = query.filter(Producto.id != int(excluir_id))
        except (TypeError, ValueError):
            pass

    items = query.limit(limite).all()
    return jsonify(
        {
            "ok": True,
            "data": [
                {
                    "id": p.id,
                    "nombre": p.nombre,
                    "slug": p.slug,
                    "referencia": p.referencia,
                    "linea": p.linea,
                    "tipo_producto": p.tipo_producto or ("kit" if p.es_kit else "estandar"),
                    "precio": float(p.precio or 0),
                    "precio_final": float(p.precio_final or p.precio or 0),
                    "stock": int(p.stock or 0),
                    "es_kit": bool(p.es_kit),
                    "imagen_url": p.imagen_url,
                }
                for p in items
            ],
        }
    )


@admin_bp.get("/api/destacados-home")
def listar_destacados_home_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    try:
        filas = (
            DestacadoHome.query.options(joinedload(DestacadoHome.producto))
            .order_by(DestacadoHome.orden.asc(), DestacadoHome.creado_en.asc())
            .all()
        )
    except (ProgrammingError, OperationalError):
        return jsonify(
            {
                "ok": True,
                "data": [],
                "meta": {"max_items": 12, "total": 0},
                "warning": "La tabla destacados_home aun no existe. Ejecuta migraciones.",
            }
        )
    return jsonify(
        {
            "ok": True,
            "data": [_serializar_destacado_admin(item) for item in filas if item.producto],
            "meta": {"max_items": 12, "total": len(filas)},
        }
    )


@admin_bp.post("/api/destacados-home")
def crear_destacado_home_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    payload = request.get_json(silent=True) or {}
    try:
        producto_id = int(payload.get("producto_id") or 0)
    except (TypeError, ValueError):
        producto_id = 0

    tab_nombre = (payload.get("tab_nombre") or "").strip()
    if not producto_id:
        return jsonify({"ok": False, "message": "Debes seleccionar un producto valido."}), 400
    if not tab_nombre:
        return jsonify({"ok": False, "message": "El nombre del tab es obligatorio."}), 400

    try:
        total_destacados = DestacadoHome.query.count()
    except (ProgrammingError, OperationalError):
        return jsonify({"ok": False, "message": "La tabla destacados_home aun no existe. Ejecuta migraciones."}), 503

    if total_destacados >= 12:
        return jsonify({"ok": False, "message": "Solo se permiten 12 productos destacados en total."}), 400

    try:
        existente = DestacadoHome.query.filter_by(producto_id=producto_id).first()
    except (ProgrammingError, OperationalError):
        return jsonify({"ok": False, "message": "La tabla destacados_home aun no existe. Ejecuta migraciones."}), 503
    if existente:
        return jsonify({"ok": False, "message": "Este producto ya esta en la lista de destacados."}), 409

    producto = Producto.query.get_or_404(producto_id)
    orden_max = db.session.query(func.max(DestacadoHome.orden)).scalar() or 0
    fila = DestacadoHome(
        producto_id=producto.id,
        tab_nombre=tab_nombre,
        orden=int(orden_max) + 1,
        activo=bool(payload.get("activo", True)),
    )
    db.session.add(fila)
    db.session.commit()
    invalidate_destacados_cache()

    return jsonify({"ok": True, "message": "Producto agregado a Mas Vendidos.", "data": _serializar_destacado_admin(fila)}), 201


@admin_bp.patch("/api/destacados-home/<int:destacado_id>")
def editar_destacado_home_api(destacado_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    payload = request.get_json(silent=True) or {}
    try:
        fila = DestacadoHome.query.options(joinedload(DestacadoHome.producto)).get_or_404(destacado_id)
    except (ProgrammingError, OperationalError):
        return jsonify({"ok": False, "message": "La tabla destacados_home aun no existe. Ejecuta migraciones."}), 503

    if payload.get("tab_nombre") is not None:
        tab_nombre = (payload.get("tab_nombre") or "").strip()
        if not tab_nombre:
            return jsonify({"ok": False, "message": "El nombre del tab no puede estar vacio."}), 400
        fila.tab_nombre = tab_nombre

    if payload.get("orden") is not None:
        try:
            fila.orden = max(0, int(payload.get("orden")))
        except (TypeError, ValueError):
            pass

    if payload.get("activo") is not None:
        fila.activo = bool(payload.get("activo"))

    db.session.commit()
    invalidate_destacados_cache()
    return jsonify({"ok": True, "message": "Destacado actualizado.", "data": _serializar_destacado_admin(fila)})


@admin_bp.patch("/api/destacados-home/reordenar")
def reordenar_destacados_home_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    payload = request.get_json(silent=True) or {}
    items = payload.get("items") or []
    if not isinstance(items, list) or not items:
        return jsonify({"ok": False, "message": "Debes enviar la lista de ordenamiento."}), 400

    mapa = {}
    for idx, item in enumerate(items, start=1):
        try:
            dest_id = int(item.get("id") if isinstance(item, dict) else 0)
        except (TypeError, ValueError):
            continue
        if dest_id > 0:
            mapa[dest_id] = idx

    try:
        filas = DestacadoHome.query.filter(DestacadoHome.id.in_(list(mapa.keys()))).all()
    except (ProgrammingError, OperationalError):
        return jsonify({"ok": False, "message": "La tabla destacados_home aun no existe. Ejecuta migraciones."}), 503
    for fila in filas:
        fila.orden = mapa.get(fila.id, fila.orden)

    db.session.commit()
    invalidate_destacados_cache()
    return jsonify({"ok": True, "message": "Orden actualizado."})


@admin_bp.delete("/api/destacados-home/<int:destacado_id>")
def eliminar_destacado_home_api(destacado_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    try:
        fila = DestacadoHome.query.get_or_404(destacado_id)
    except (ProgrammingError, OperationalError):
        return jsonify({"ok": False, "message": "La tabla destacados_home aun no existe. Ejecuta migraciones."}), 503
    db.session.delete(fila)
    db.session.commit()
    invalidate_destacados_cache()
    return jsonify({"ok": True, "message": "Producto removido de Mas Vendidos."})


@admin_bp.patch("/api/productos/<int:producto_id>/estado")
def cambiar_estado_producto_api(producto_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    producto = Producto.query.get_or_404(producto_id)
    payload = request.get_json(silent=True) or {}
    producto.activo = bool(payload.get("activo", not producto.activo))
    db.session.commit()
    invalidate_destacados_cache()
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
    producto.stock = _int_nonneg(stock, producto.stock)
    db.session.commit()
    invalidate_destacados_cache()
    return jsonify({"ok": True, "message": "Inventario actualizado."})


@admin_bp.get("/api/cotizaciones")
def listar_cotizaciones_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    _sincronizar_cotizaciones_vencidas(commit=True)

    estado = (request.args.get("estado") or "").strip().lower()
    busqueda = (request.args.get("q") or "").strip().lower()

    query = Cotizacion.query
    if estado and estado != "todas":
        query = query.filter(Cotizacion.estado == estado)

    if busqueda:
        patron = f"%{busqueda}%"
        query = query.filter(
            func.lower(Cotizacion.nombre).like(patron)
            | func.lower(Cotizacion.email).like(patron)
            | func.lower(func.coalesce(Cotizacion.telefono, "")).like(patron)
            | func.lower(func.coalesce(Cotizacion.ciudad, "")).like(patron)
            | func.lower(Cotizacion.mensaje).like(patron)
        )

    items = query.order_by(Cotizacion.created_at.desc()).limit(300).all()
    ahora = datetime.utcnow()
    return jsonify(
        {
            "ok": True,
            "data": [
                {
                    "id": c.id,
                    "nombre": c.nombre,
                    "email": c.email,
                    "telefono": c.telefono,
                    "empresa": c.empresa,
                    "ciudad": c.ciudad,
                    "linea": c.linea,
                    "tipo_solicitud": c.tipo_solicitud,
                    "productos": c.productos,
                    "mensaje": c.mensaje,
                    "info_adicional": c.info_adicional,
                    "estado": c.estado,
                    "tipo_origen": c.tipo_origen or "cliente",
                    "generado_por_admin_id": c.generado_por_admin_id,
                    "precio_ofertado": float(c.precio_ofertado) if c.precio_ofertado is not None else None,
                    "respuesta": c.respuesta,
                    "validez_dias": int(c.validez_dias or 30),
                    "fecha_vencimiento": c.fecha_vencimiento.isoformat() if c.fecha_vencimiento else None,
                    "dias_restantes": (
                        int((c.fecha_vencimiento - ahora).total_seconds() // 86400) + 1
                        if c.fecha_vencimiento
                        else None
                    ),
                    "created_at": c.created_at.isoformat(),
                    "responded_at": c.responded_at.isoformat() if c.responded_at else None,
                }
                for c in items
            ],
        }
    )


@admin_bp.get("/api/clientes/buscar")
def buscar_clientes_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    q = (request.args.get("q") or "").strip().lower()
    limite = min(max(int(request.args.get("limit") or 15), 1), 50)

    items = []
    if q:
        patron = f"%{q}%"
        usuarios = (
            Usuario.query.filter(
                func.lower(func.concat(Usuario.nombre, " ", Usuario.apellido)).like(patron)
                | func.lower(Usuario.email).like(patron)
                | func.lower(func.coalesce(Usuario.telefono, "")).like(patron)
            )
            .order_by(Usuario.updated_at.desc())
            .limit(limite)
            .all()
        )
        for u in usuarios:
            items.append(
                {
                    "source": "usuario",
                    "id": u.id,
                    "nombre": f"{u.nombre} {u.apellido}".strip(),
                    "email": u.email,
                    "telefono": u.telefono,
                    "ciudad": u.ciudad,
                }
            )

        if len(items) < limite:
            cotizaciones = (
                Cotizacion.query.filter(
                    func.lower(Cotizacion.nombre).like(patron)
                    | func.lower(Cotizacion.email).like(patron)
                    | func.lower(func.coalesce(Cotizacion.telefono, "")).like(patron)
                )
                .order_by(Cotizacion.created_at.desc())
                .limit(limite)
                .all()
            )
            existentes = {str(i.get("email") or "").lower() for i in items}
            for c in cotizaciones:
                email_key = str(c.email or "").lower()
                if email_key in existentes:
                    continue
                items.append(
                    {
                        "source": "cotizacion",
                        "id": c.id,
                        "nombre": c.nombre,
                        "email": c.email,
                        "telefono": c.telefono,
                        "ciudad": c.ciudad,
                    }
                )
                existentes.add(email_key)
                if len(items) >= limite:
                    break

    return jsonify({"ok": True, "data": items})


@admin_bp.post("/api/cotizaciones")
def crear_cotizacion_generada_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    payload = request.get_json(silent=True) or {}
    nombre = (payload.get("nombre") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    telefono = (payload.get("telefono") or "").strip() or None
    ciudad = (payload.get("ciudad") or "").strip() or None
    empresa = (payload.get("empresa") or "").strip() or None
    linea = (payload.get("linea") or "").strip().lower() or None
    tipo_solicitud = (payload.get("tipo_solicitud") or "propuesta_comercial").strip().lower()

    if not nombre or not email:
        return jsonify({"ok": False, "message": "Nombre y correo son obligatorios."}), 400

    cotizacion = Cotizacion(
        nombre=nombre,
        email=email,
        telefono=telefono,
        ciudad=ciudad,
        empresa=empresa,
        linea=linea,
        tipo_solicitud=tipo_solicitud,
        mensaje=None,
        info_adicional=None,
        tipo_origen="generada",
        generado_por_admin_id=admin.id,
        estado="pendiente",
    )
    db.session.add(cotizacion)
    db.session.flush()
    cotizacion.generar_numero_y_token()
    db.session.commit()

    return jsonify(
        {
            "ok": True,
            "message": "Cotizacion generada creada.",
            "data": {
                "id": cotizacion.id,
                "numero": cotizacion.numero,
                "estado": cotizacion.estado,
                "tipo_origen": cotizacion.tipo_origen,
            },
        }
    ), 201


@admin_bp.post("/api/cotizaciones/sincronizar-vencimientos")
def sincronizar_vencimientos_cotizaciones_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    total = _sincronizar_cotizaciones_vencidas(commit=True)
    return jsonify(
        {
            "ok": True,
            "message": "Sincronizacion de vencimientos ejecutada.",
            "data": {"actualizadas": total},
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
    cotizacion.validez_dias = cotizacion.validez_dias or 30
    cotizacion.fecha_vencimiento = datetime.utcnow() + timedelta(days=int(cotizacion.validez_dias or 30))
    cotizacion.estado = "respondida"
    cotizacion.responded_at = datetime.utcnow()
    db.session.commit()

    return jsonify({"ok": True, "message": "Cotizacion respondida."})


@admin_bp.post("/api/cotizaciones/<int:cotizacion_id>/cotizar")
def cotizar_profesional_api(cotizacion_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    payload = request.get_json(silent=True) or {}
    cotizacion = Cotizacion.query.get_or_404(cotizacion_id)
    validez_dias = _normalizar_validez_dias(payload.get("validez_dias"), predeterminado=cotizacion.validez_dias or 30)

    # Actualizar datos principales de la cotizacion
    cotizacion.precio_ofertado = str(payload.get("total", "0"))
    cotizacion.validez_dias = validez_dias
    cotizacion.fecha_vencimiento = datetime.utcnow() + timedelta(days=validez_dias)
    cotizacion.estado = "respondida"
    cotizacion.responded_at = datetime.utcnow()
    
    # Generar HTML para el PDF (mismo que la vista previa JS)
    year = datetime.now().year
    cot_num = f"COT-{year}-{str(cotizacion.id).zfill(4)}"
    fecha_emision = datetime.now().strftime("%d/%m/%Y")
    
    html_content = render_template_string("""
    <div style="font-family: Arial, sans-serif; max-width: 800px; padding: 40px; color: #1e3344; line-height: 1.5;">
        <div style="display:flex; justify-content:space-between; border-bottom: 3px solid #0F5A5F; padding-bottom: 16px; margin-bottom: 24px;">
            <div style="float: left; width: 60%;">
                <div style="font-size:20px; font-weight:700; color:#0F5A5F;">Etiquetar Colombia S.A.S.</div>
                <div style="font-size:12px; color:#647d8e;">NIT: 900.XXX.XXX-X · Barranquilla, Colombia</div>
                <div style="font-size:12px; color:#647d8e;">comercial@etiquetar.com</div>
            </div>
            <div style="float: right; width: 35%; text-align:right;">
                <div style="font-size:11px; color:#647d8e; text-transform:uppercase;">Cotización</div>
                <div style="font-size:18px; font-weight:700;">#{{ num }}</div>
                <div style="font-size:12px; color:#647d8e;">{{ fecha }}</div>
                <div style="font-size:12px; color:#647d8e;">Válida por {{ validez }} días</div>
            </div>
            <div style="clear: both;"></div>
        </div>

        <div style="margin-bottom: 30px;">
            <div style="float: left; width: 48%;">
                <h4 style="margin: 0 0 8px; font-size: 11px; text-transform: uppercase; color: #0F5A5F;">Cliente</h4>
                <div style="font-weight: 700; font-size: 14px;">{{ c.nombre }}</div>
                {% if c.empresa %}<div style="font-size: 13px; color: #4a5568;">{{ c.empresa }}</div>{% endif %}
                <div style="font-size: 13px; color: #4a5568;">{{ c.email }}</div>
                <div style="font-size: 13px; color: #4a5568;">{{ c.telefono }}</div>
                <div style="font-size: 13px; color: #4a5568;">{{ c.ciudad }}</div>
            </div>
            <div style="float: right; width: 48%; text-align: right;">
                <h4 style="margin: 0 0 8px; font-size: 11px; text-transform: uppercase; color: #0F5A5F;">Detalles</h4>
                <div style="font-size: 13px; color: #4a5568;"><strong>Línea:</strong> {{ c.linea or 'agua' }}</div>
                <div style="font-size: 13px; color: #4a5568;"><strong>Forma de pago:</strong> {{ p.forma_pago }}</div>
                <div style="font-size: 13px; color: #4a5568;"><strong>Entrega estimada:</strong> {{ p.entrega_estimada or 'Por definir' }}</div>
                <div style="font-size: 13px; color: #4a5568;"><strong>Asesor:</strong> {{ p.asesor or 'Administrador' }}</div>
                <div style="font-size: 13px; color: #4a5568;"><strong>Moneda:</strong> {{ p.moneda }}</div>
            </div>
            <div style="clear: both;"></div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 13px;">
            <thead>
                <tr style="background: #E6F1FB; color: #0C447C;">
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #0F5A5F;">#</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #0F5A5F;">Descripción</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #0F5A5F;">Ref.</th>
                    <th style="padding: 10px; text-align: center; border-bottom: 2px solid #0F5A5F;">Cant.</th>
                    <th style="padding: 10px; text-align: right; border-bottom: 2px solid #0F5A5F;">Unitario</th>
                    <th style="padding: 10px; text-align: right; border-bottom: 2px solid #0F5A5F;">Desc.</th>
                    <th style="padding: 10px; text-align: right; border-bottom: 2px solid #0F5A5F;">Subtotal</th>
                </tr>
            </thead>
            <tbody>
                {% for l in p.lineas %}
                <tr style="background: {{ loop.cycle('#fff', '#F8FBFE') }};">
                    <td style="padding: 10px; border-bottom: 1px solid #edf2f7;">{{ loop.index }}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #edf2f7;">{{ l.descripcion }}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #edf2f7;">{{ l.referencia or '-' }}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #edf2f7; text-align: center;">{{ l.cantidad }}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #edf2f7; text-align: right;">${{ "{:,.0f}".format(l.precio_unitario) }}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #edf2f7; text-align: right;">${{ "{:,.0f}".format(l.descuento or 0) }}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #edf2f7; text-align: right; font-weight: 600;">${{ "{:,.0f}".format(l.subtotal) }}</td>
                </tr>
                {% endfor %}
            </tbody>
        </table>

        <div style="text-align: right; margin-bottom: 30px;">
            <div style="display: inline-block; width: 220px; font-size: 14px;">
                <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #647d8e;">
                    <span>Subtotal bruto:</span>
                    <span>${{ "{:,.0f}".format(p.subtotal_bruto or p.subtotal) }}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #647d8e;">
                    <span>Subtotal con desc. linea:</span>
                    <span>${{ "{:,.0f}".format(p.subtotal) }}</span>
                </div>
                {% if (p.descuento_global_valor or 0) > 0 %}
                <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #647d8e;">
                    <span>Descuento global:</span>
                    <span>- ${{ "{:,.0f}".format(p.descuento_global_valor or 0) }}</span>
                </div>
                {% endif %}
                {% if p.iva_valor > 0 %}
                <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #647d8e;">
                    <span>IVA ({{ (p.iva_porcentaje * 100)|int }}%):</span>
                    <span>${{ "{:,.0f}".format(p.iva_valor) }}</span>
                </div>
                {% endif %}
                <div style="display: flex; justify-content: space-between; padding: 10px 0; border-top: 2px solid #1e3344; margin-top: 6px; font-weight: 800; font-size: 18px; color: #0F5A5F;">
                    <span>TOTAL:</span>
                    <span>${{ "{:,.0f}".format(p.total) }}</span>
                </div>
            </div>
        </div>

        {% if p.notas %}
        <div style="margin-bottom: 30px; padding: 15px; background: #F8FBFE; border-left: 4px solid #0F5A5F; border-radius: 4px;">
            <h4 style="margin: 0 0 8px; font-size: 11px; text-transform: uppercase; color: #0F5A5F;">Notas y Condiciones</h4>
            <div style="font-size: 12px; color: #4a5568;">{{ p.notas }}</div>
        </div>
        {% endif %}

        <div style="border-top: 1px solid #edf2f7; padding-top: 20px; text-align: center; font-size: 11px; color: #94a3b8;">
            <p>Esta cotización es válida por {{ validez }} días. Para aceptar, responda este correo o contáctenos al +57XXXXXXXXXX.</p>
            <p style="font-weight: 600; color: #647d8e;">Etiquetar Colombia S.A.S. — Soluciones Integrales en Agua y Piscinas</p>
        </div>
    </div>
    """, c=cotizacion, p=payload, num=cot_num, fecha=fecha_emision, validez=validez_dias)

    # Guardar PDF
    pdf_filename = f"cotizacion_{cotizacion.id}_{datetime.now().strftime('%Y%m%d%H%M%S')}.pdf"
    folder = Path(current_app.static_folder) / "cotizaciones"
    folder.mkdir(parents=True, exist_ok=True)
    pdf_path = folder / pdf_filename
    pdf_url = f"/estaticos/cotizaciones/{pdf_filename}"

    if WEASYPRINT_AVAILABLE:
        HTML(string=html_content).write_pdf(str(pdf_path))
    else:
        # Fallback si no hay weasyprint: solo guardamos los datos y el front usará window.print()
        pdf_url = None

    cotizacion.pdf_url = pdf_url
    db.session.commit()

    # Enviar Correo
    if payload.get("enviar_correo") and MAIL_AVAILABLE:
        try:
            msg = Message(
                subject=f"Cotización #{cot_num} — Etiquetar Colombia",
                recipients=[cotizacion.email],
                cc=[os.environ.get("ADMIN_EMAIL")],
                html=f"<p>Hola {cotizacion.nombre},</p><p>Adjunto encontrará la cotización formal solicitada por un valor de <strong>${payload.get('total'):,.0f}</strong>.</p><p>Quedamos atentos a sus comentarios.</p><p>Cordialmente,<br>Equipo de Etiquetar Colombia</p>"
            )
            if pdf_url:
                with open(pdf_path, 'rb') as f:
                    msg.attach(pdf_filename, "application/pdf", f.read())
            mail.send(msg)
        except Exception as e:
            print(f"Error enviando correo: {e}")

    return jsonify({
        "ok": True, 
        "message": "Cotización generada y enviada correctamente.",
        "pdf_url": pdf_url,
        "data": {"id": cotizacion.id, "numero": cot_num}
    })


@admin_bp.patch("/api/cotizaciones/<int:cotizacion_id>/estado")
def actualizar_estado_cotizacion_api(cotizacion_id):
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    payload = request.get_json(silent=True) or {}
    estado = (payload.get("estado") or "").strip().lower()
    estados_validos = {
        "pendiente",
        "respondida",
        "vista_cliente",
        "en_negociacion",
        "aprobada",
        "rechazada",
        "vencida",
        "descartada",
    }

    transiciones = {
        "pendiente": {"respondida", "vista_cliente", "en_negociacion", "aprobada", "rechazada", "vencida", "descartada"},
        "respondida": {"vista_cliente", "en_negociacion", "aprobada", "rechazada", "vencida", "descartada", "pendiente"},
        "vista_cliente": {"en_negociacion", "aprobada", "rechazada", "vencida", "descartada", "pendiente"},
        "en_negociacion": {"aprobada", "rechazada", "vencida", "descartada", "pendiente"},
        "aprobada": {"en_negociacion", "pendiente"},
        "rechazada": {"en_negociacion", "pendiente"},
        "vencida": {"en_negociacion", "pendiente"},
        "descartada": {"pendiente", "en_negociacion"},
    }

    if estado not in estados_validos:
        return jsonify({"ok": False, "message": "Estado de cotizacion invalido."}), 400

    cotizacion = Cotizacion.query.get_or_404(cotizacion_id)
    _sincronizar_cotizaciones_vencidas(commit=True)
    cotizacion = Cotizacion.query.get_or_404(cotizacion_id)
    estado_actual = (cotizacion.estado or "pendiente").strip().lower()
    if estado_actual == estado:
        return jsonify({"ok": True, "message": "La cotizacion ya esta en ese estado."})

    permitidos = transiciones.get(estado_actual, estados_validos)
    if estado not in permitidos:
        return jsonify(
            {
                "ok": False,
                "message": f"Transicion no permitida: {estado_actual} -> {estado}.",
            }
        ), 409

    cotizacion.estado = estado
    if estado in {"respondida", "vista_cliente", "en_negociacion", "aprobada", "rechazada", "vencida"}:
        cotizacion.responded_at = cotizacion.responded_at or datetime.utcnow()

    if estado in {"respondida", "vista_cliente", "en_negociacion"}:
        cotizacion.validez_dias = cotizacion.validez_dias or 30
        cotizacion.fecha_vencimiento = cotizacion.fecha_vencimiento or (
            datetime.utcnow() + timedelta(days=int(cotizacion.validez_dias or 30))
        )

    db.session.commit()

    return jsonify({"ok": True, "message": "Estado de cotizacion actualizado."})


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

    banner = Banner(
        tipo=(payload.get("tipo") or "hero").strip(),
        titulo=titulo,
        subtitulo=(payload.get("subtitulo") or "").strip() or None,
        descripcion=(payload.get("descripcion") or "").strip() or None,
        texto_boton=(payload.get("texto_boton") or "Comprar Ahora").strip(),
        color_fondo=(payload.get("color_fondo") or "#f8fbf8").strip(),
        imagen_url=imagen_url or "", # Usar string vacío para evitar IntegrityError si la DB es NOT NULL
        enlace_url=(payload.get("enlace_url") or "").strip() or None,
        orden=int(payload.get("orden") or 0),
        activo=bool(payload.get("activo", True)),
        fecha_inicio=datetime.fromisoformat(payload.get("fecha_inicio")) if payload.get("fecha_inicio") else None,
        fecha_fin=datetime.fromisoformat(payload.get("fecha_fin")) if payload.get("fecha_fin") else None,
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
                    "tipo": b.tipo,
                    "titulo": b.titulo,
                    "subtitulo": b.subtitulo or "",
                    "descripcion": b.descripcion or "",
                    "texto_boton": b.texto_boton or "Comprar Ahora",
                    "color_fondo": b.color_fondo or "#f8fbf8",
                    "imagen_url": b.imagen_url,
                    "enlace_url": b.enlace_url,
                    "activo": b.activo,
                    "orden": b.orden,
                    "fecha_inicio": b.fecha_inicio.isoformat() if b.fecha_inicio else None,
                    "fecha_fin": b.fecha_fin.isoformat() if b.fecha_fin else None,
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

    tipo = (payload.get("tipo") or banner.tipo).strip()
    titulo = (payload.get("titulo") or banner.titulo).strip()
    subtitulo = (payload.get("subtitulo") or banner.subtitulo or "").strip()
    descripcion = (payload.get("descripcion") or banner.descripcion or "").strip()
    texto_boton = (payload.get("texto_boton") or banner.texto_boton or "Comprar Ahora").strip()
    color_fondo = (payload.get("color_fondo") or banner.color_fondo or "#f8fbf8").strip()
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

    banner.tipo = tipo
    banner.titulo = titulo
    banner.subtitulo = subtitulo or None
    banner.descripcion = descripcion or None
    banner.texto_boton = texto_boton
    banner.color_fondo = color_fondo
    banner.imagen_url = imagen_url or ""
    banner.enlace_url = enlace_url
    banner.orden = orden
    if payload.get("fecha_inicio"):
        banner.fecha_inicio = datetime.fromisoformat(payload.get("fecha_inicio"))
    elif "fecha_inicio" in payload:
        banner.fecha_inicio = None

    if payload.get("fecha_fin"):
        banner.fecha_fin = datetime.fromisoformat(payload.get("fecha_fin"))
    elif "fecha_fin" in payload:
        banner.fecha_fin = None

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

    ventana = datetime.utcnow() - timedelta(days=30)
    filas = (
        db.session.query(
            AccesoPagina.ruta,
            AccesoPagina.usuario_id,
            AccesoPagina.ciudad,
            AccesoPagina.region,
            AccesoPagina.pais,
            AccesoPagina.created_at,
            Usuario.nombre,
            Usuario.apellido,
            Usuario.email,
        )
        .outerjoin(Usuario, Usuario.id == AccesoPagina.usuario_id)
        .filter(AccesoPagina.created_at >= ventana)
        .order_by(AccesoPagina.created_at.desc())
        .limit(6000)
        .all()
    )

    rutas_counter = Counter()
    origenes_counter = Counter()
    usuarios_counter = Counter()
    anon_vistos = set()
    user_rutas_vistos = set()  # Para detectar usuarios únicos por ruta
    user_origenes_vistos = set()  # Para detectar usuarios únicos por origen

    for fila in filas:
        ruta = (fila.ruta or "/").strip() or "/"
        if not _ruta_comercial(ruta):
            continue

        origen = _texto_origen(fila.ciudad, fila.region, fila.pais, None)
        fecha = fila.created_at.date() if fila.created_at else None

        if fila.usuario_id:
            # Para usuarios autenticados, contar USUARIOS ÚNICOS por ruta
            clave_user_ruta = (fila.usuario_id, ruta)
            if clave_user_ruta not in user_rutas_vistos:
                user_rutas_vistos.add(clave_user_ruta)
                rutas_counter[ruta] += 1

            # Para origen, también contar usuarios únicos
            clave_user_origen = (fila.usuario_id, origen)
            if clave_user_origen not in user_origenes_vistos:
                user_origenes_vistos.add(clave_user_origen)
                origenes_counter[origen] += 1

            nombre = f"{(fila.nombre or '').strip()} {(fila.apellido or '').strip()}".strip()
            nombre = nombre or (fila.email or f"Usuario {fila.usuario_id}")
            usuarios_counter[f"{nombre} - {origen}"] += 1
        else:
            # Para anónimos, ya estaban siendo deduplicados por fecha, ruta y origen
            clave_anon = (fecha, ruta, origen)
            if clave_anon in anon_vistos:
                continue
            anon_vistos.add(clave_anon)
            rutas_counter[ruta] += 1
            origenes_counter[origen] += 1

    rutas = rutas_counter.most_common(20)
    origenes = origenes_counter.most_common(20)
    accesos_usuarios = usuarios_counter.most_common(20)

    return jsonify(
        {
            "ok": True,
            "data": {
                "rutas": [{"ruta": r, "visitas": int(v)} for r, v in rutas],
                "origenes": [
                    {
                        "origen": origen,
                        "visitas": int(visitas),
                    }
                    for origen, visitas in origenes
                ],
                "usuarios": [
                    {
                        "usuario": usuario_origen,
                        "visitas": int(visitas),
                    }
                    for usuario_origen, visitas in accesos_usuarios
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


@admin_bp.get("/api/estadisticas")
def estadisticas_api():
    admin = _admin_requerido(api=True)
    if not isinstance(admin, Usuario):
        return admin

    dias, granularity = _normalizar_param_analytics(
        request.args.get("days"),
        request.args.get("granularity"),
    )
    ahora = datetime.utcnow()
    inicio = ahora - timedelta(days=dias)
    inicio_prev = inicio - timedelta(days=dias)

    accesos_raw = (
        db.session.query(
            AccesoPagina.ruta,
            AccesoPagina.usuario_id,
            AccesoPagina.ip,
            AccesoPagina.ciudad,
            AccesoPagina.region,
            AccesoPagina.pais,
            AccesoPagina.created_at,
        )
        .filter(AccesoPagina.created_at >= inicio_prev)
        .order_by(AccesoPagina.created_at.asc())
        .all()
    )

    pedidos_raw = (
        db.session.query(Pedido.created_at, Pedido.total)
        .filter(Pedido.created_at >= inicio_prev)
        .order_by(Pedido.created_at.asc())
        .all()
    )

    cotizaciones_raw = (
        db.session.query(Cotizacion.created_at)
        .filter(Cotizacion.created_at >= inicio_prev)
        .order_by(Cotizacion.created_at.asc())
        .all()
    )

    series = defaultdict(lambda: {"visitas": 0, "pedidos": 0, "cotizaciones": 0, "ventas": 0.0})
    series_prev = defaultdict(lambda: {"visitas": 0, "pedidos": 0, "cotizaciones": 0, "ventas": 0.0})

    anon_vistos = set()
    anon_vistos_prev = set()

    total_visitas = 0
    total_visitas_prev = 0

    for a in accesos_raw:
        ruta = (a.ruta or "").strip()
        if not _ruta_comercial(ruta):
            continue
        dt = a.created_at
        if not dt:
            continue

        bucket = _bucket_key(dt, granularity)
        origen = _texto_origen(a.ciudad, a.region, a.pais, None)

        if dt >= inicio:
            if a.usuario_id:
                series[bucket]["visitas"] += 1
                total_visitas += 1
            else:
                clave = (dt.date(), ruta, origen)
                if clave in anon_vistos:
                    continue
                anon_vistos.add(clave)
                series[bucket]["visitas"] += 1
                total_visitas += 1
        else:
            if a.usuario_id:
                series_prev[bucket]["visitas"] += 1
                total_visitas_prev += 1
            else:
                clave = (dt.date(), ruta, origen)
                if clave in anon_vistos_prev:
                    continue
                anon_vistos_prev.add(clave)
                series_prev[bucket]["visitas"] += 1
                total_visitas_prev += 1

    total_pedidos = 0
    total_pedidos_prev = 0
    total_ventas = 0.0
    total_ventas_prev = 0.0
    for created_at, total in pedidos_raw:
        if not created_at:
            continue
        bucket = _bucket_key(created_at, granularity)
        if created_at >= inicio:
            series[bucket]["pedidos"] += 1
            series[bucket]["ventas"] += float(total or 0)
            total_pedidos += 1
            total_ventas += float(total or 0)
        else:
            series_prev[bucket]["pedidos"] += 1
            series_prev[bucket]["ventas"] += float(total or 0)
            total_pedidos_prev += 1
            total_ventas_prev += float(total or 0)

    total_cotizaciones = 0
    total_cotizaciones_prev = 0
    for (created_at,) in cotizaciones_raw:
        if not created_at:
            continue
        bucket = _bucket_key(created_at, granularity)
        if created_at >= inicio:
            series[bucket]["cotizaciones"] += 1
            total_cotizaciones += 1
        else:
            series_prev[bucket]["cotizaciones"] += 1
            total_cotizaciones_prev += 1

    labels = sorted(series.keys())
    data = {
        "labels": labels,
        "visitas": [int(series[l]["visitas"]) for l in labels],
        "pedidos": [int(series[l]["pedidos"]) for l in labels],
        "cotizaciones": [int(series[l]["cotizaciones"]) for l in labels],
        "ventas": [round(float(series[l]["ventas"]), 2) for l in labels],
    }

    def _growth(actual, prev):
        if prev <= 0:
            return 100.0 if actual > 0 else 0.0
        return round(((actual - prev) / prev) * 100.0, 2)

    ticket_promedio = round((total_ventas / total_pedidos), 2) if total_pedidos > 0 else 0.0
    conv_visita_pedido = round((total_pedidos / total_visitas) * 100.0, 2) if total_visitas > 0 else 0.0
    conv_visita_cotizacion = round((total_cotizaciones / total_visitas) * 100.0, 2) if total_visitas > 0 else 0.0

    return jsonify(
        {
            "ok": True,
            "data": {
                "days": dias,
                "granularity": granularity,
                "series": data,
                "totals": {
                    "ventas": round(total_ventas, 2),
                    "visitas": int(total_visitas),
                    "pedidos": int(total_pedidos),
                    "cotizaciones": int(total_cotizaciones),
                    "ticket_promedio": ticket_promedio,
                    "conv_visita_pedido": conv_visita_pedido,
                    "conv_visita_cotizacion": conv_visita_cotizacion,
                    "growth_ventas": _growth(total_ventas, total_ventas_prev),
                    "growth_visitas": _growth(total_visitas, total_visitas_prev),
                    "growth_pedidos": _growth(total_pedidos, total_pedidos_prev),
                },
            },
        }
    )


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
