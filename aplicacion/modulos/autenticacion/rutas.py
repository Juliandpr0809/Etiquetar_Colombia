import os
import re
import uuid
from pathlib import Path
from typing import Optional

from flask import (
    Blueprint,
    current_app,
    flash,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from werkzeug.utils import secure_filename

from aplicacion.extensiones import db
from aplicacion.modelos import Usuario


autenticacion_bp = Blueprint("autenticacion", __name__)

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}


def _email_normalizado(email: str) -> str:
    return (email or "").strip().lower()


def _usuario_requerido(api: bool = False):
    usuario = getattr(g, "usuario_actual", None)
    if usuario:
        return usuario

    if api:
        return jsonify({"ok": False, "message": "Debes iniciar sesion."}), 401

    flash("Debes iniciar sesion para ver tu perfil.", "error")
    return redirect(url_for("autenticacion.login"))


def _extension_valida(nombre_archivo: str) -> bool:
    if not nombre_archivo or "." not in nombre_archivo:
        return False
    extension = nombre_archivo.rsplit(".", 1)[1].lower()
    return extension in ALLOWED_IMAGE_EXTENSIONS


def _guardar_foto_perfil(archivo_storage, foto_anterior: Optional[str]) -> str:
    nombre_seguro = secure_filename(archivo_storage.filename or "")
    extension = nombre_seguro.rsplit(".", 1)[1].lower()
    nombre_final = f"perfil-{uuid.uuid4().hex}.{extension}"

    carpeta_relativa = Path("img") / "perfiles"
    carpeta_absoluta = Path(current_app.static_folder) / carpeta_relativa
    carpeta_absoluta.mkdir(parents=True, exist_ok=True)

    ruta_destino = carpeta_absoluta / nombre_final
    archivo_storage.save(ruta_destino)

    if foto_anterior and foto_anterior.startswith("/estaticos/img/perfiles/"):
        nombre_anterior = foto_anterior.split("/estaticos/img/perfiles/", 1)[1]
        ruta_anterior = carpeta_absoluta / nombre_anterior
        if ruta_anterior.exists() and ruta_anterior.is_file():
            try:
                os.remove(ruta_anterior)
            except OSError:
                pass

    return f"/estaticos/img/perfiles/{nombre_final}"


@autenticacion_bp.get("/login")
@autenticacion_bp.get("/autenticacion/login.html")
def login():
    if getattr(g, "usuario_actual", None):
        flash("Ya tienes una sesion iniciada.", "success")
        return redirect(url_for("home"))

    return render_template("autenticacion/login.html")


@autenticacion_bp.post("/login")
def login_post():
    email = _email_normalizado(request.form.get("email"))
    password = request.form.get("password", "")

    if not email or not password:
        flash("Debes ingresar correo y contrasena.", "error")
        return render_template("autenticacion/login.html"), 400

    usuario = Usuario.query.filter_by(email=email, activo=True).first()
    if not usuario or not usuario.check_password(password):
        flash("Correo o contrasena incorrectos.", "error")
        return render_template("autenticacion/login.html"), 401

    session["user_id"] = usuario.id
    flash(f"Bienvenido, {usuario.nombre}.", "success")

    if getattr(usuario, "es_admin", False):
        return redirect(url_for("admin.panel"))

    return redirect(url_for("home"))


@autenticacion_bp.get("/registro")
@autenticacion_bp.get("/autenticacion/registro.html")
def registro():
    if getattr(g, "usuario_actual", None):
        flash("Ya tienes una sesion iniciada.", "success")
        return redirect(url_for("home"))

    return render_template("autenticacion/registro.html")


@autenticacion_bp.post("/registro")
def registro_post():
    nombre = (request.form.get("nombre") or "").strip()
    apellido = (request.form.get("apellido") or "").strip()
    email = _email_normalizado(request.form.get("email"))
    telefono = (request.form.get("telefono") or "").strip()
    password = request.form.get("password", "")
    password2 = request.form.get("password2", "")

    if not all([nombre, apellido, email, password, password2]):
        flash("Completa todos los campos obligatorios.", "error")
        return render_template("autenticacion/registro.html"), 400

    if not EMAIL_REGEX.match(email):
        flash("Ingresa un correo electronico valido.", "error")
        return render_template("autenticacion/registro.html"), 400

    if len(password) < 8:
        flash("La contrasena debe tener al menos 8 caracteres.", "error")
        return render_template("autenticacion/registro.html"), 400

    if password != password2:
        flash("Las contrasenas no coinciden.", "error")
        return render_template("autenticacion/registro.html"), 400

    existe = Usuario.query.filter_by(email=email).first()
    if existe:
        flash("Ese correo ya esta registrado.", "error")
        return render_template("autenticacion/registro.html"), 409

    usuario = Usuario(
        nombre=nombre,
        apellido=apellido,
        email=email,
        telefono=telefono or None,
        activo=True,
    )
    usuario.set_password(password)

    db.session.add(usuario)
    db.session.commit()

    session["user_id"] = usuario.id
    flash("Cuenta creada correctamente. Ya puedes comenzar.", "success")
    return redirect(url_for("home"))


@autenticacion_bp.get("/perfil")
@autenticacion_bp.get("/autenticacion/perfil.html")
def perfil():
    usuario = _usuario_requerido(api=False)
    if isinstance(usuario, tuple) or not isinstance(usuario, Usuario):
        return usuario
    return render_template("autenticacion/perfil.html")


@autenticacion_bp.get("/autenticacion/api/perfil")
def perfil_api_get():
    usuario = _usuario_requerido(api=True)
    if isinstance(usuario, tuple):
        return usuario

    return jsonify(
        {
            "ok": True,
            "data": {
                "id": usuario.id,
                "nombre": usuario.nombre,
                "apellido": usuario.apellido,
                "email": usuario.email,
                "telefono": usuario.telefono or "",
                "ciudad": usuario.ciudad or "",
                "direccion": usuario.direccion or "",
                "foto_url": usuario.foto_url or "",
                "created_at": usuario.created_at.isoformat() if usuario.created_at else None,
            },
        }
    )


@autenticacion_bp.post("/autenticacion/api/perfil")
def perfil_api_update():
    usuario = _usuario_requerido(api=True)
    if isinstance(usuario, tuple):
        return usuario

    nombre = (request.form.get("nombre") or "").strip()
    apellido = (request.form.get("apellido") or "").strip()
    email = _email_normalizado(request.form.get("email"))
    telefono = (request.form.get("telefono") or "").strip()
    ciudad = (request.form.get("ciudad") or "").strip()
    direccion = (request.form.get("direccion") or "").strip()

    if not nombre or not apellido or not email:
        return (
            jsonify(
                {
                    "ok": False,
                    "message": "Nombre, apellido y correo son obligatorios.",
                }
            ),
            400,
        )

    if not EMAIL_REGEX.match(email):
        return jsonify({"ok": False, "message": "Correo electronico invalido."}), 400

    existe = Usuario.query.filter(Usuario.email == email, Usuario.id != usuario.id).first()
    if existe:
        return jsonify({"ok": False, "message": "Ese correo ya esta en uso."}), 409

    foto = request.files.get("foto")
    if foto and foto.filename:
        if not _extension_valida(foto.filename):
            return (
                jsonify(
                    {
                        "ok": False,
                        "message": "Formato de imagen no permitido. Usa PNG, JPG, JPEG o WEBP.",
                    }
                ),
                400,
            )
        usuario.foto_url = _guardar_foto_perfil(foto, usuario.foto_url)

    usuario.nombre = nombre
    usuario.apellido = apellido
    usuario.email = email
    usuario.telefono = telefono or None
    usuario.ciudad = ciudad or None
    usuario.direccion = direccion or None

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return (
            jsonify(
                {
                    "ok": False,
                    "message": "No se pudo guardar tu perfil. Intenta nuevamente.",
                }
            ),
            500,
        )

    return jsonify(
        {
            "ok": True,
            "message": "Perfil actualizado correctamente.",
            "data": {
                "nombre": usuario.nombre,
                "apellido": usuario.apellido,
                "email": usuario.email,
                "telefono": usuario.telefono or "",
                "ciudad": usuario.ciudad or "",
                "direccion": usuario.direccion or "",
                "foto_url": usuario.foto_url or "",
            },
        }
    )


@autenticacion_bp.post("/logout")
def logout_post():
    session.pop("user_id", None)
    flash("Sesion cerrada correctamente.", "success")
    return redirect(url_for("autenticacion.login"))


@autenticacion_bp.get("/logout")
def logout_get():
    session.pop("user_id", None)
    flash("Sesion cerrada correctamente.", "success")
    return redirect(url_for("autenticacion.login"))
