import cloudinary
import cloudinary.uploader
from flask import current_app


def config_cloudinary(app):
    cloud_name = app.config.get("CLOUDINARY_CLOUD_NAME")
    api_key = app.config.get("CLOUDINARY_API_KEY")
    api_secret = app.config.get("CLOUDINARY_API_SECRET")

    if not all([cloud_name, api_key, api_secret]):
        return

    cloudinary.config(
        cloud_name=cloud_name,
        api_key=api_key,
        api_secret=api_secret,
        secure=True,
    )


def cloudinary_habilitado() -> bool:
    return all(
        [
            current_app.config.get("CLOUDINARY_CLOUD_NAME"),
            current_app.config.get("CLOUDINARY_API_KEY"),
            current_app.config.get("CLOUDINARY_API_SECRET"),
        ]
    )


def subir_imagen_producto(archivo, slug: str | None = None) -> dict:
    folder = current_app.config.get("CLOUDINARY_PRODUCTS_FOLDER", "productos")
    opciones = {
        "folder": folder,
        "resource_type": "image",
        "overwrite": True,
        "invalidate": True,
    }
    if slug:
        opciones["public_id"] = slug
        opciones["use_filename"] = False
    else:
        opciones["use_filename"] = True
        opciones["unique_filename"] = True

    resultado = cloudinary.uploader.upload(archivo, **opciones)
    return {
        "public_id": resultado.get("public_id"),
        "secure_url": resultado.get("secure_url"),
    }
