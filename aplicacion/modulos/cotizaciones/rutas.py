from datetime import datetime

from flask import Blueprint, render_template, request, redirect, url_for
from aplicacion.extensiones import db
from aplicacion.modelos import Cotizacion

cotizaciones_bp = Blueprint("cotizaciones", __name__)


def _sincronizar_cotizaciones_vencidas_publico():
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
    if actualizadas:
        db.session.commit()

@cotizaciones_bp.get("/cotizar")
@cotizaciones_bp.get("/pages/cotizar.html")
def cotizar_form():
    return render_template("pages/cotizar.html")

@cotizaciones_bp.post("/cotizar")
def cotizar_submit():
    if request.is_json:
        payload = request.get_json()
    else:
        payload = request.form

    nombre = (payload.get("nombre") or payload.get("q-nombre") or "").strip()
    email = (payload.get("email") or payload.get("q-email") or "").strip().lower()
    telefono = (payload.get("telefono") or payload.get("q-tel") or "").strip()
    ciudad = (payload.get("ciudad") or payload.get("q-city") or "").strip()
    empresa = (payload.get("empresa") or payload.get("q-empresa") or "").strip()
    linea = (payload.get("linea") or "").strip()
    tipo_solicitud = (payload.get("tipo") or payload.get("q-type") or "").strip()
    productos_raw = payload.get("productos") or payload.get("q-products") or ""
    if isinstance(productos_raw, list):
        productos = "\n".join(str(item).strip() for item in productos_raw if str(item).strip())
    else:
        productos = str(productos_raw or "").strip()

    selected_items = payload.get("selected_items")
    if not productos and isinstance(selected_items, list):
        lineas = []
        for item in selected_items:
            if not isinstance(item, dict):
                continue
            nombre_item = (item.get("nombre") or "Producto").strip()
            ref_item = (item.get("referencia") or "").strip()
            cantidad_item = item.get("cantidad") or 1
            ref_txt = f" ({ref_item})" if ref_item else ""
            lineas.append(f"- {nombre_item}{ref_txt} x{cantidad_item}")
        productos = "\n".join(lineas).strip()
    mensaje = (
        payload.get("mensaje")
        or payload.get("q-message")
        or payload.get("q-mensaje")
        or ""
    ).strip()
    info_adicional = (payload.get("info_adicional") or payload.get("q-notes") or payload.get("notas") or "").strip()

    if not mensaje and productos:
        mensaje = "Productos solicitados:\n" + productos

    if not nombre or not email:
        return {
            "ok": False,
            "message": "Nombre y correo son obligatorios.",
        }, 400

    cotizacion = Cotizacion(
        nombre=nombre,
        email=email,
        telefono=telefono or None,
        empresa=empresa or None,
        ciudad=ciudad or None,
        linea=linea or None,
        tipo_solicitud=tipo_solicitud or None,
        productos=productos or None,
        mensaje=mensaje or info_adicional or "Sin mensaje",
        info_adicional=info_adicional or None,
        tipo_origen="cliente",
        estado="pendiente",
    )
    
    db.session.add(cotizacion)
    db.session.flush() # Para obtener el ID antes del commit
    cotizacion.generar_numero_y_token()
    db.session.commit()

    if request.is_json:
        return {
            "ok": True,
            "message": "Solicitud recibida. Pronto te enviaremos una cotización personalizada.",
            "data": {
                "id": cotizacion.id,
                "numero": cotizacion.numero,
                "token": cotizacion.token_consulta,
                "selected_items": selected_items if isinstance(selected_items, list) else None,
                "redirect": url_for('cotizaciones.confirmacion_cotizacion', token=cotizacion.token_consulta)
            },
        }, 201
    
    return redirect(url_for('cotizaciones.confirmacion_cotizacion', token=cotizacion.token_consulta))

@cotizaciones_bp.route('/cotizar/confirmacion/<token>') 
def confirmacion_cotizacion(token): 
    _sincronizar_cotizaciones_vencidas_publico()
    cotizacion = Cotizacion.query.filter_by(token_consulta=token).first_or_404() 
    return render_template('cotizar/confirmacion.html', cotizacion=cotizacion) 

@cotizaciones_bp.route('/cotizar/consultar', methods=['GET', 'POST']) 
def consultar_cotizacion(): 
    _sincronizar_cotizaciones_vencidas_publico()
    cotizacion = None 
    error = None 
    if request.method == 'POST': 
        numero = request.form.get('numero', '').strip().upper() 
        email = request.form.get('email', '').strip().lower() 
        cotizacion = Cotizacion.query.filter_by( 
            numero=numero 
        ).filter( 
            db.func.lower(Cotizacion.email) == email 
        ).first() 
        if not cotizacion: 
            error = 'No encontramos una cotización con ese número y correo.' 
    return render_template('cotizar/consultar.html', 
                          cotizacion=cotizacion, error=error) 

@cotizaciones_bp.route('/cotizar/ver/<token>') 
def ver_cotizacion(token): 
    _sincronizar_cotizaciones_vencidas_publico()
    cotizacion = Cotizacion.query.filter_by(token_consulta=token).first_or_404() 
    return render_template('cotizar/ver_cotizacion.html', cotizacion=cotizacion)
