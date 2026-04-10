from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import joinedload
from sqlalchemy.exc import ProgrammingError, OperationalError

from aplicacion.modelos import DestacadoHome, Producto

PALABRAS_BLOQUEADAS_CATALOGO = ("test", "prueba", "smoke", "diag", "demo")
CACHE_TTL = timedelta(minutes=10)
_CACHE: dict[str, dict[str, Any]] = {}


def _normalizar_texto(valor: Any) -> str:
    return re.sub(r"\s+", " ", str(valor or "").strip().lower())


def _slug_tab(nombre: str) -> str:
    base = _normalizar_texto(nombre)
    base = base.replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")
    base = re.sub(r"[^a-z0-9\s-]", "", base)
    base = re.sub(r"\s+", "-", base)
    base = re.sub(r"-+", "-", base).strip("-")
    return base or "otros"


def _es_producto_real(producto: Producto) -> bool:
    nombre = _normalizar_texto(producto.nombre)
    categoria = _normalizar_texto(producto.categoria.nombre if producto.categoria else "")
    return not any(palabra in nombre or palabra in categoria for palabra in PALABRAS_BLOQUEADAS_CATALOGO)


def _precio_final(producto: Producto) -> float:
    try:
        return float(producto.precio_final)
    except Exception:
        return float(producto.precio or 0)


def _precio_anterior(producto: Producto, precio_final: float) -> float | None:
    try:
        base = float(producto.precio or 0)
    except Exception:
        base = 0.0
    try:
        anterior = float(producto.precio_anterior) if producto.precio_anterior is not None else None
    except Exception:
        anterior = None
    if anterior is not None and anterior > precio_final:
        return anterior
    if base > precio_final:
        return base
    return None


def _descuento_porcentaje(precio_final: float, precio_anterior: float | None) -> int:
    if not precio_anterior or precio_anterior <= 0 or precio_anterior <= precio_final:
        return 0
    return int(round((1 - (precio_final / precio_anterior)) * 100))


def _serializar_producto(producto: Producto, tab_nombre: str, orden: int, origen: str) -> dict[str, Any]:
    precio_final = _precio_final(producto)
    precio_old = _precio_anterior(producto, precio_final)
    tab = (tab_nombre or (producto.categoria.nombre if producto.categoria else "General")).strip() or "General"

    return {
        "id": producto.id,
        "producto_id": producto.id,
        "nombre": producto.nombre,
        "slug": producto.slug,
        "referencia": producto.referencia or "",
        "linea": producto.linea,
        "imagen_url": producto.imagen_url,
        "precio_final": precio_final,
        "precio_anterior": precio_old,
        "descuento": _descuento_porcentaje(precio_final, precio_old),
        "tab_nombre": tab,
        "tab_slug": _slug_tab(tab),
        "orden": int(orden or 0),
        "origen": origen,
    }


def _construir_tabs(items: list[dict[str, Any]]) -> list[dict[str, str]]:
    vistos: set[str] = set()
    tabs: list[dict[str, str]] = []
    for item in items:
        slug = item["tab_slug"]
        if slug in vistos:
            continue
        vistos.add(slug)
        tabs.append({"nombre": item["tab_nombre"], "slug": slug})
    return tabs


def _consultar_manual(linea: str) -> list[dict[str, Any]]:
    try:
        filas = (
            DestacadoHome.query.options(joinedload(DestacadoHome.producto).joinedload(Producto.categoria))
            .join(Producto, Producto.id == DestacadoHome.producto_id)
            .filter(DestacadoHome.activo.is_(True), Producto.activo.is_(True), Producto.linea == linea)
            .order_by(DestacadoHome.orden.asc(), DestacadoHome.creado_en.asc())
            .limit(12)
            .all()
        )
    except (ProgrammingError, OperationalError):
        # Si la migracion aun no se ha ejecutado, cae a fallback sin romper el homepage.
        return []
    items: list[dict[str, Any]] = []
    for fila in filas:
        if not fila.producto or not _es_producto_real(fila.producto):
            continue
        items.append(_serializar_producto(fila.producto, fila.tab_nombre, fila.orden, "manual"))
    return items


def _consultar_fallback(linea: str) -> list[dict[str, Any]]:
    productos = (
        Producto.query.options(joinedload(Producto.categoria))
        .filter(Producto.activo.is_(True), Producto.linea == linea)
        .order_by(Producto.created_at.desc())
        .limit(24)
        .all()
    )
    items: list[dict[str, Any]] = []
    orden = 1
    for producto in productos:
        if not _es_producto_real(producto):
            continue
        tab = producto.categoria.nombre if producto.categoria and producto.categoria.nombre else "General"
        items.append(_serializar_producto(producto, tab, orden, "fallback"))
        orden += 1
        if len(items) >= 12:
            break
    return items


def invalidate_destacados_cache() -> None:
    _CACHE.clear()


def get_destacados_home_payload(linea: str, force_refresh: bool = False) -> dict[str, Any]:
    linea_normalizada = "agua" if str(linea).strip().lower() == "agua" else "piscina"
    ahora = datetime.utcnow()

    cache_item = _CACHE.get(linea_normalizada)
    if not force_refresh and cache_item and (ahora - cache_item["ts"]) < CACHE_TTL:
        return cache_item["payload"]

    items = _consultar_manual(linea_normalizada)
    origen = "manual"
    if not items:
        items = _consultar_fallback(linea_normalizada)
        origen = "fallback"

    payload = {
        "linea": linea_normalizada,
        "source": origen,
        "items": items,
        "tabs": _construir_tabs(items),
        "updated_at": ahora.isoformat(),
    }
    _CACHE[linea_normalizada] = {"ts": ahora, "payload": payload}
    return payload
