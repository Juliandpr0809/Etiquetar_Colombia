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
    nombre = (request.form.get("nombre") or "").strip()
    email = (request.form.get("email") or "").strip().lower()
    telefono = (request.form.get("telefono") or "").strip()
    ciudad = (request.form.get("ciudad") or "").strip()
    mensaje = (request.form.get("mensaje") or "").strip()

    if not nombre or not email or not mensaje:
        return {
            "ok": False,
            "message": "Nombre, correo y requerimiento son obligatorios.",
        }, 400

    cotizacion = Cotizacion(
        nombre=nombre,
        email=email,
        telefono=telefono or None,
        ciudad=ciudad or None,
        mensaje=mensaje,
        estado="pendiente",
    )
    db.session.add(cotizacion)
    db.session.commit()

    return {
        "ok": True,
        "message": "Solicitud recibida. Pronto te enviaremos una cotizacion.",
        "data": {"id": cotizacion.id},
    }, 201
