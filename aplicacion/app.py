import os
import re
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

from flask import Flask, Response, abort, g, jsonify, render_template, request, session
from dotenv import load_dotenv
from sqlalchemy.orm import joinedload

from .config import config_by_name
from .extensiones import db, migrate
from .modelos import Banner, KitProducto, Producto, Usuario
from .servicios import config_cloudinary, get_destacados_home_payload


BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"


def create_app():
    load_dotenv(dotenv_path=ENV_FILE, override=True)

    env_name = os.getenv("FLASK_ENV", "development")
    app = Flask(
        __name__,
        template_folder="plantillas",
        static_folder="estaticos",
    )
    config_class = config_by_name.get(env_name, config_by_name["development"])
    app.config.from_object(config_class)
    config_class.init_app(app)
    config_cloudinary(app)

    db.init_app(app)
    migrate.init_app(app, db)

    # Importa modelos para que Flask-Migrate detecte tablas.
    from . import modelos  # noqa: F401

    _register_blueprints(app)
    _register_routes(app)
    _register_auth_context(app)

    return app


def _register_blueprints(app):
    from .modulos.admin.rutas import admin_bp
    from .modulos.autenticacion.rutas import autenticacion_bp
    from .modulos.carrito.rutas import carrito_bp
    from .modulos.catalogo.rutas import catalogo_bp
    from .modulos.cotizaciones.rutas import cotizaciones_bp

    app.register_blueprint(admin_bp)
    app.register_blueprint(autenticacion_bp)
    app.register_blueprint(carrito_bp)
    app.register_blueprint(catalogo_bp)
    app.register_blueprint(cotizaciones_bp)


def _register_routes(app):
    @app.get("/favicon.ico")
    def favicon():
        return Response(status=204)

    @app.get("/placeholder/<path:spec>")
    def placeholder_image(spec):
        parts = spec.split("/")
        if len(parts) != 3:
            return {"error": "placeholder spec invalido"}, 400

        size, background, foreground = parts
        size_match = re.fullmatch(r"(\d{2,4})x(\d{2,4})", size)
        color_match = re.compile(r"^[0-9a-fA-F]{3,8}$")

        if (
            not size_match
            or not color_match.fullmatch(background)
            or not color_match.fullmatch(foreground)
        ):
            return {"error": "placeholder spec invalido"}, 400

        width, height = size_match.groups()
        text = escape(request.args.get("text", "Producto"))
        font_size = max(18, min(int(width) // 11, 34))

        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="{text}">
<rect width="100%" height="100%" fill="#{background}"/>
<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#{foreground}" font-family="Barlow, Arial, sans-serif" font-size="{font_size}" font-weight="700">{text}</text>
</svg>'''

        return Response(svg, mimetype="image/svg+xml")

    @app.get("/")
    @app.get("/home")
    @app.get("/home.html")
    def home():
        ahora = datetime.utcnow()
        banners = (
            Banner.query.filter_by(activo=True)
            .filter((Banner.fecha_inicio.is_(None)) | (Banner.fecha_inicio <= ahora))
            .filter((Banner.fecha_fin.is_(None)) | (Banner.fecha_fin >= ahora))
            .order_by(Banner.orden.asc(), Banner.created_at.desc())
            .limit(6)
            .all()
        )
        return render_template("home.html", banners_activos=banners)

    @app.get("/piscina")
    @app.get("/piscina-landing")
    @app.get("/pool")
    def piscina_landing():
        return render_template("piscina-landing.html")

    @app.get("/agua")
    @app.get("/agua-landing")
    @app.get("/flow")
    def agua_landing():
        return render_template("agua-landing.html")

    @app.get("/industrial")
    def industrial_landing():
        return render_template("industrial-landing.html")

    @app.get("/api/home/mas-vendidos")
    def api_home_mas_vendidos():
        linea = (request.args.get("linea") or "").strip().lower()
        force_refresh = (request.args.get("refresh") or "") == "1"
        payload = get_destacados_home_payload(linea=linea, force_refresh=force_refresh)
        return jsonify({"ok": True, "data": payload})

    @app.get("/producto/<string:slug>")
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
        aplicacion_publica = (
            ficha.aplicacion if ficha and ficha.aplicacion else producto.aplicacion_recomendada
        )
        garantia_publica_meses = producto.garantia_meses
        ficha_url_publica = producto.ficha_url or (ficha.ficha_pdf_url if ficha else None)
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

        specs_fuente = None
        if ficha and isinstance(ficha.especificaciones, list) and ficha.especificaciones:
            specs_fuente = []
            for item in ficha.especificaciones:
                if not isinstance(item, dict):
                    continue
                nombre_item = str(item.get("nombre") or "").strip()
                tipo_item = str(item.get("tipo") or "").strip().lower()
                if not nombre_item or tipo_item not in {"cuantitativa", "cualitativa"}:
                    continue
                if tipo_item == "cuantitativa":
                    try:
                        valor_numero = float(item.get("valor"))
                    except (TypeError, ValueError):
                        continue
                    specs_fuente.append(
                        {
                            "nombre": nombre_item,
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
                    specs_fuente.append(
                        {
                            "nombre": nombre_item,
                            "tipo": "cualitativa",
                            "valor_texto": valor_texto,
                            "seccion": "Informacion tecnica",
                        }
                    )
        elif producto.especificaciones_tecnicas and isinstance(producto.especificaciones_tecnicas, list):
            specs_fuente = producto.especificaciones_tecnicas

        if specs_fuente:
            for idx, spec in enumerate(specs_fuente):
                if not isinstance(spec, dict):
                    continue
                nombre = str(spec.get("nombre") or "").strip()
                tipo = str(spec.get("tipo") or "").strip().lower()
                if not nombre or tipo not in {"cuantitativa", "cualitativa"}:
                    continue

                if tipo == "cuantitativa":
                    valor_numero = spec.get("valor_numero")
                    unidad = str(spec.get("unidad") or "").strip()
                    if valor_numero is None or not unidad:
                        continue
                    try:
                        valor_num = float(valor_numero)
                        valor_txt = str(int(valor_num)) if valor_num.is_integer() else str(valor_num)
                    except (TypeError, ValueError):
                        valor_txt = str(valor_numero)
                    valor_mostrar = f"{valor_txt} {unidad}".strip()
                else:
                    valor_mostrar = str(spec.get("valor_texto") or "").strip()
                    if not valor_mostrar:
                        continue

                especificaciones.append(
                    {
                        "nombre": nombre,
                        "valor": valor_mostrar,
                        "orden": 5000 + idx,
                        "seccion": str(spec.get("seccion") or "Informacion tecnica"),
                    }
                )
        # Fallback: algunos productos antiguos guardaron la ficha tecnica dentro de descripcion.
        # Si no hay especificaciones estructuradas, intentamos extraer pares "Clave: Valor".
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
                    str(x.get("nombre") or "").strip()
                    for x in (ficha.componentes or [])
                    if isinstance(x, dict) and str(x.get("nombre") or "").strip()
                ]
                if ficha and isinstance(ficha.componentes, list)
                else [c.texto for c in sorted(producto.contenido_kit, key=lambda x: (x.orden, x.id))]
            ),
            kit_componentes=kit_componentes,
            recomendados=recomendados,
        )

    @app.get("/blog")
    @app.get("/blog/listado.html")
    def blog_listado():
        return render_template("blog/listado.html")

    @app.get("/blog/como-elegir-bomba-piscina")
    @app.get("/blog/articulo-1-bomba-piscina.html")
    def blog_articulo_1():
        return render_template("blog/articulo-1-bomba-piscina.html")

    @app.get("/blog/purificador-agua-casa-precio-colombia")
    @app.get("/blog/articulo-2-purificador-agua.html")
    def blog_articulo_2():
        return render_template("blog/articulo-2-purificador-agua.html")

    @app.get("/blog/mantenimiento-piscinas-clima-calido")
    @app.get("/blog/articulo-3-mantenimiento-piscina.html")
    def blog_articulo_3():
        return render_template("blog/articulo-3-mantenimiento-piscina.html")

    @app.get("/nosotros")
    def nosotros():
        return render_template("pages/nosotros.html")

    @app.get("/contacto.html")
    @app.get("/contacto")
    @app.get("/pages/contacto.html")
    def contacto():
        return render_template("pages/contacto.html")

    @app.get("/health")
    def health():
        return {"status": "ok"}, 200


def _register_auth_context(app):
    @app.before_request
    def load_current_user():
        user_id = session.get("user_id")
        g.usuario_actual = Usuario.query.get(user_id) if user_id else None

    @app.context_processor
    def inject_auth_user():
        carrito = session.get("carrito", {})
        carrito_count = 0
        if isinstance(carrito, dict):
            for cantidad in carrito.values():
                try:
                    carrito_count += max(int(cantidad), 0)
                except (TypeError, ValueError):
                    continue

        return {
            "usuario_actual": getattr(g, "usuario_actual", None),
            "usuario_autenticado": bool(getattr(g, "usuario_actual", None)),
            "carrito_count": carrito_count,
        }
