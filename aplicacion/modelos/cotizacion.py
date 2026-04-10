from datetime import datetime
import secrets
from aplicacion.extensiones import db

class Cotizacion(db.Model):
    __tablename__ = "cotizaciones"

    id = db.Column(db.Integer, primary_key=True)
    numero = db.Column(db.String(20), unique=True)  # Ej: COT-2026-0001 
    nombre = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), nullable=False, index=True)
    telefono = db.Column(db.String(20), nullable=True)
    empresa = db.Column(db.String(100), nullable=True)
    ciudad = db.Column(db.String(80), nullable=True)
    linea = db.Column(db.String(20))  # 'piscina' o 'agua' 
    tipo_solicitud = db.Column(db.String(50)) 
    productos = db.Column(db.Text) 
    mensaje = db.Column(db.Text, nullable=True) # Antiguo campo mensaje, lo mantenemos por compatibilidad si es necesario
    info_adicional = db.Column(db.Text) 
    
    estado = db.Column(db.String(20), nullable=False, default="pendiente", index=True)
    # 'pendiente', 'en_revision', 'respondida', 'descartada' 
    tipo_origen = db.Column(db.String(20), nullable=False, default="cliente", index=True)
    generado_por_admin_id = db.Column(db.Integer, db.ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True, index=True)
    validez_dias = db.Column(db.Integer, nullable=False, default=30)
    fecha_vencimiento = db.Column(db.DateTime, nullable=True, index=True)
    precio_ofertado = db.Column(db.String(50), nullable=True) 
    respuesta = db.Column(db.Text, nullable=True)  # Mapea a columna "respuesta" en BD
    
    fecha_creacion = db.Column(db.DateTime, default=datetime.utcnow, nullable=False) 
    responded_at = db.Column(db.DateTime, nullable=True)  # Mapea a columna "responded_at" en BD
    token_consulta = db.Column(db.String(64), unique=True) 
    # Token único para que el cliente consulte sin login 

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    def generar_numero_y_token(self):
        if not self.numero:
            # Nota: Esto asume que el ID ya está disponible. Si no, se puede llamar después de db.session.flush()
            year = datetime.now().year
            id_str = str(self.id if self.id else 0).zfill(4)
            self.numero = f"COT-{year}-{id_str}"
        if not self.token_consulta:
            self.token_consulta = secrets.token_urlsafe(32)
