import os


class Config:
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MAX_CONTENT_LENGTH = 4 * 1024 * 1024

    @staticmethod
    def init_app(app):
        app.config["SECRET_KEY"] = os.getenv(
            "SECRET_KEY",
            "cambiar-esta-clave-en-produccion",
        )
        app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
            "DATABASE_URL",
            "mysql+pymysql://root:root@127.0.0.1:3306/etiquetar_colombia",
        )
        app.config["CLOUDINARY_CLOUD_NAME"] = os.getenv("CLOUDINARY_CLOUD_NAME", "")
        app.config["CLOUDINARY_API_KEY"] = os.getenv("CLOUDINARY_API_KEY", "")
        app.config["CLOUDINARY_API_SECRET"] = os.getenv("CLOUDINARY_API_SECRET", "")
        app.config["CLOUDINARY_PRODUCTS_FOLDER"] = os.getenv(
            "CLOUDINARY_PRODUCTS_FOLDER",
            "productos",
        )
        app.config["CLOUDINARY_BANNERS_FOLDER"] = os.getenv(
            "CLOUDINARY_BANNERS_FOLDER",
            "banners",
        )


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


config_by_name = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
}
