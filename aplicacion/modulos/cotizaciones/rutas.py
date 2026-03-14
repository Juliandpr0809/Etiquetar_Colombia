from flask import Blueprint, render_template, request

from aplicacion.extensiones import db
from aplicacion.modelos import Cotizacion

cotizaciones_bp = Blueprint("cotizaciones", __name__)


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
    
    # Consolidar mensaje de varios campos del form si vienen por ID del HTML
    mensaje_principal = (payload.get("mensaje") or payload.get("q-products") or "").strip()
    tipo_solicitud = (payload.get("tipo") or payload.get("q-type") or "").strip()
    empresa = (payload.get("empresa") or payload.get("q-empresa") or "").strip()
    notas = (payload.get("notas") or payload.get("q-notes") or "").strip()

    full_mensaje = f"Línea: {payload.get('linea', 'No especificada')}\n"
    if tipo_solicitud: full_mensaje += f"Tipo: {tipo_solicitud}\n"
    if empresa: full_mensaje += f"Empresa: {empresa}\n"
    full_mensaje += f"\nREQUERIMIENTO:\n{mensaje_principal}"
    if notas: full_mensaje += f"\n\nNOTAS ADICIONALES:\n{notas}"

    if not nombre or not email or not mensaje_principal:
        return {
            "ok": False,
            "message": "Nombre, correo y requerimiento son obligatorios.",
        }, 400

    cotizacion = Cotizacion(
        nombre=nombre,
        email=email,
        telefono=telefono or None,
        ciudad=ciudad or None,
        mensaje=full_mensaje,
        estado="pendiente",
    )
    db.session.add(cotizacion)
    db.session.commit()

    return {
        "ok": True,
        "message": "Solicitud recibida. Pronto te enviaremos una cotización personalizada.",
        "data": {"id": cotizacion.id},
    }, 201
