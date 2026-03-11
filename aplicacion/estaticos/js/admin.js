document.addEventListener('DOMContentLoaded', () => {
  const qs = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));

  const successBox = qs('#adminSuccess');
  const errorBox = qs('#adminError');
  const formProducto = qs('#formProducto');
  const productSubmitBtn = formProducto ? formProducto.querySelector('.admin-btn') : null;
  const state = { editingProductId: null, products: [] };

  const showMsg = (type, text) => {
    successBox.classList.remove('visible');
    errorBox.classList.remove('visible');
    const target = type === 'success' ? successBox : errorBox;
    target.textContent = text;
    target.classList.add('visible');
  };

  const api = async (url, options = {}) => {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.message || 'Error en solicitud');
    }
    return data;
  };

  const activateTab = (tab) => {
    qsa('.admin-tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    qsa('.admin-tab').forEach((section) => section.classList.toggle('active', section.id === `tab-${tab}`));
  };

  const setProductFormMode = (editing) => {
    if (!productSubmitBtn) return;
    productSubmitBtn.textContent = editing ? 'Guardar cambios' : 'Guardar producto';
  };

  const resetProductForm = () => {
    if (!formProducto) return;
    formProducto.reset();
    state.editingProductId = null;
    setProductFormMode(false);
  };

  const fillProductForm = (product) => {
    if (!formProducto) return;
    activateTab('productos');
    formProducto.nombre.value = product.nombre || '';
    formProducto.slug.value = product.slug || '';
    formProducto.linea.value = product.linea || 'piscina';
    formProducto.precio.value = product.precio || 0;
    formProducto.stock.value = product.stock || 0;
    formProducto.descripcion.value = product.descripcion || '';
    state.editingProductId = product.id;
    setProductFormMode(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  qsa('.admin-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activateTab(btn.dataset.tab);
    });
  });

  const renderList = (selector, items, renderItem) => {
    const root = qs(selector);
    root.innerHTML = '';
    if (!items.length) {
      root.innerHTML = '<div class="admin-item">Sin registros</div>';
      return;
    }
    items.forEach((item) => {
      const node = document.createElement('div');
      node.className = 'admin-item';
      node.innerHTML = renderItem(item);
      root.appendChild(node);
    });
  };

  const nombreRuta = (ruta) => {
    const mapa = {
      '/': 'Inicio',
      '/home.html': 'Inicio',
      '/admin/': 'Panel de administración',
      '/admin': 'Panel de administración',
      '/admin/api/resumen': 'Panel › Resumen general',
      '/admin/api/accesos': 'Panel › Analítica de visitas',
      '/admin/api/banners': 'Panel › Banners',
      '/admin/api/clientes': 'Panel › Clientes',
      '/admin/api/cotizaciones': 'Panel › Cotizaciones',
      '/admin/api/envios': 'Panel › Envíos',
      '/admin/api/pedidos': 'Panel › Pedidos',
      '/admin/api/promociones': 'Panel › Promociones',
      '/admin/api/ventas-grafica': 'Panel › Gráfica de ventas',
      '/admin/api/productos': 'Panel › Productos',
      '/carrito/api': 'Carrito (consulta)',
      '/carrito/carrito.html': 'Carrito',
      '/carrito/checkout.html': 'Checkout / Pago',
      '/autenticacion/login.html': 'Inicio de sesión',
      '/autenticacion/registro.html': 'Registro de usuario',
      '/autenticacion/api/perfil': 'Perfil (consulta)',
      '/autenticacion/perfil.html': 'Mi perfil',
      '/catalogo/api/productos': 'Catálogo (consulta productos)',
      '/catalogo/piscina.html': 'Catálogo › Piscinas',
      '/catalogo/agua.html': 'Catálogo › Tratamiento de agua',
      '/logout': 'Cierre de sesión',
      '/pages/contacto.html': 'Contacto',
      '/pages/cotizar.html': 'Solicitar cotización',
    };
    if (mapa[ruta]) return mapa[ruta];
    if (/^\/admin\/api\/productos\/\d+\/estado$/.test(ruta)) return 'Panel › Cambiar estado producto';
    if (/^\/admin\/api\/productos\/\d+$/.test(ruta)) return 'Panel › Editar producto';
    if (/^\/carrito\/api\/items/.test(ruta)) return 'Carrito › Modificar productos';
    return ruta;
  };

  const loadResumen = async () => {
    const [resumen, accesos, ventas] = await Promise.all([
      api('/admin/api/resumen'),
      api('/admin/api/accesos'),
      api('/admin/api/ventas-grafica')
    ]);

    const k = resumen.data;
    qs('#kpiGrid').innerHTML = `
      <div class="admin-kpi"><div class="admin-kpi__label">Vendido este mes</div><div class="admin-kpi__value">$${k.ventas_mes.toLocaleString('es-CO')}</div></div>
      <div class="admin-kpi"><div class="admin-kpi__label">Vendido mes anterior</div><div class="admin-kpi__value">$${k.ventas_mes_anterior.toLocaleString('es-CO')}</div></div>
      <div class="admin-kpi"><div class="admin-kpi__label">Entradas hoy</div><div class="admin-kpi__value">${k.visitas_hoy}</div></div>
      <div class="admin-kpi"><div class="admin-kpi__label">Entradas (7 dias)</div><div class="admin-kpi__value">${k.accesos_7d}</div></div>
      <div class="admin-kpi"><div class="admin-kpi__label">Personas diferentes (7 dias)</div><div class="admin-kpi__value">${k.visitantes_unicos_7d}</div></div>
      <div class="admin-kpi"><div class="admin-kpi__label">Clientes registrados</div><div class="admin-kpi__value">${k.clientes}</div></div>
      <div class="admin-kpi"><div class="admin-kpi__label">Productos activos</div><div class="admin-kpi__value">${k.productos}</div></div>
      <div class="admin-kpi"><div class="admin-kpi__label">Consultas por responder</div><div class="admin-kpi__value">${k.cotizaciones_pendientes}</div></div>
    `;

    const paginasReales = (accesos.data.rutas || []).filter((a) => !a.ruta.includes('/api/') && !a.ruta.endsWith('/logout'));
    renderList('#accesosList', paginasReales, (a) => `<div class="admin-item__row"><strong>${nombreRuta(a.ruta)}</strong><span>${a.visitas} visitas</span></div>`);
    renderList('#origenesList', accesos.data.origenes || [], (o) => `<div class="admin-item__row"><strong>${o.origen}</strong><span>${o.visitas} entradas</span></div>`);

    const ctx = qs('#ventasChart');
    if (window.__ventasChart) {
      window.__ventasChart.destroy();
    }
    window.__ventasChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ventas.data.map((p) => p.mes),
        datasets: [{
          label: 'Ventas',
          data: ventas.data.map((p) => p.total),
          borderColor: '#0077B6',
          backgroundColor: 'rgba(0,119,182,0.18)',
          fill: true,
          tension: 0.3
        }]
      }
    });
  };

  const loadCotizaciones = async () => {
    const data = await api('/admin/api/cotizaciones');
    renderList('#cotizacionesList', data.data, (c) => `
      <div class="admin-item__row"><strong>${c.nombre}</strong><span>${c.estado}</span></div>
      <div>${c.email} ${c.telefono || ''}</div>
      <div>${c.mensaje}</div>
      <div class="admin-item__row">
        <input id="precio-${c.id}" type="number" step="0.01" placeholder="Precio ofertado" />
        <input id="resp-${c.id}" placeholder="Respuesta" />
        <button class="admin-mini-btn" data-cotizacion="${c.id}">Responder</button>
      </div>
    `);

    qsa('[data-cotizacion]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/admin/api/cotizaciones/${btn.dataset.cotizacion}/responder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              precio_ofertado: qs(`#precio-${btn.dataset.cotizacion}`).value,
              respuesta: qs(`#resp-${btn.dataset.cotizacion}`).value
            })
          });
          showMsg('success', 'Cotizacion respondida');
          loadCotizaciones();
        } catch (err) {
          showMsg('error', err.message);
        }
      });
    });
  };

  const loadPromociones = async () => {
    const data = await api('/admin/api/promociones');
    renderList('#promocionesList', data.data, (p) => `<div class="admin-item__row"><strong>${p.producto}</strong><span>${p.porcentaje_descuento}% (${p.vigente ? 'vigente' : 'programada'})</span></div>`);
  };

  const loadBanners = async () => {
    const data = await api('/admin/api/banners');
    renderList('#bannersList', data.data, (b) => `<div class="admin-item__row"><strong>${b.titulo}</strong><span>Orden ${b.orden} | ${b.activo ? 'activo' : 'inactivo'}</span></div>`);
  };

  const loadPedidos = async () => {
    const data = await api('/admin/api/pedidos');
    renderList('#pedidosList', data.data, (p) => `
      <div class="admin-item__row"><strong>Pedido #${p.id}</strong><span>${p.estado}</span></div>
      <div>${p.cliente || 'Cliente'} - ${p.email || ''}</div>
      <div class="admin-item__row"><span>$${p.total.toLocaleString('es-CO')}</span>
      <div>
        <button class="admin-mini-btn" data-pedido="${p.id}" data-estado="enviado">Marcar Enviado</button>
        <button class="admin-mini-btn" data-pedido="${p.id}" data-estado="entregado">Marcar Entregado</button>
      </div></div>
    `);

    qsa('[data-pedido]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/admin/api/pedidos/${btn.dataset.pedido}/estado`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: btn.dataset.estado })
          });
          showMsg('success', 'Estado de pedido actualizado');
          loadPedidos();
        } catch (err) {
          showMsg('error', err.message);
        }
      });
    });
  };

  const loadClientes = async () => {
    const data = await api('/admin/api/clientes');
    renderList('#clientesList', data.data, (c) => `
      <div class="admin-item__row"><strong>${c.nombre}</strong><span>${c.email}</span></div>
      <div class="admin-item__row"><span>Telefono: ${c.telefono || 'No registra'}</span><span>Ciudad: ${c.ciudad || 'No registra'}</span></div>
      <div><small>Registro: ${new Date(c.created_at).toLocaleDateString('es-CO')}</small></div>
    `);
  };

  const loadEnvios = async () => {
    const data = await api('/admin/api/envios');
    renderList('#enviosList', data.data, (e) => `<div class="admin-item__row"><strong>${e.ciudad}</strong><span>$${e.costo.toLocaleString('es-CO')} | Contra entrega: ${e.contra_entrega_habilitado ? 'si' : 'no'}</span></div>`);
  };

  const loadProductos = async () => {
    const data = await api('/admin/api/productos');
    state.products = data.data;
    renderList('#productosList', data.data, (p) => `
      <div class="admin-item__row"><strong>${p.nombre}</strong><span>${p.linea} | Stock: ${p.stock}</span></div>
      <div class="admin-item__row"><span>Slug: ${p.slug}</span><span>$${p.precio.toLocaleString('es-CO')}</span></div>
      <div class="admin-item__row"><span>${p.activo ? 'Activo' : 'Inactivo'}</span><span>${p.imagen_url ? '<a href="' + p.imagen_url + '" target="_blank" rel="noopener">Ver foto</a>' : 'Sin foto'}</span></div>
      <div class="admin-item__row"><button class="admin-mini-btn" data-edit-product="${p.id}">Editar</button><button class="admin-mini-btn" data-toggle-product="${p.id}" data-active="${p.activo ? '1' : '0'}">${p.activo ? 'Inactivar' : 'Activar'}</button></div>
    `);

    qsa('[data-edit-product]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const product = state.products.find((item) => item.id === Number(btn.dataset.editProduct));
        if (product) fillProductForm(product);
      });
    });

    qsa('[data-toggle-product]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/admin/api/productos/${btn.dataset.toggleProduct}/estado`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activo: btn.dataset.active !== '1' })
          });
          showMsg('success', 'Estado del producto actualizado');
          loadProductos();
        } catch (err) {
          showMsg('error', err.message);
        }
      });
    });
  };

  qs('#formProducto').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const body = new FormData(e.target);
      if (state.editingProductId) {
        await api(`/admin/api/productos/${state.editingProductId}`, { method: 'PATCH', body });
        showMsg('success', 'Producto actualizado correctamente');
      } else {
        await api('/admin/api/productos', { method: 'POST', body });
        showMsg('success', 'Producto creado correctamente');
      }
      resetProductForm();
      loadProductos();
    } catch (err) {
      showMsg('error', err.message);
    }
  });

  qs('#formPromocion').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const form = new FormData(e.target);
      await api('/admin/api/promociones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(form.entries()))
      });
      e.target.reset();
      showMsg('success', 'Promocion programada');
      loadPromociones();
    } catch (err) {
      showMsg('error', err.message);
    }
  });

  qs('#formBanner').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const form = Object.fromEntries(new FormData(e.target).entries());
      await api('/admin/api/banners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      e.target.reset();
      showMsg('success', 'Banner guardado');
      loadBanners();
    } catch (err) {
      showMsg('error', err.message);
    }
  });

  qs('#formEnvio').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const form = new FormData(e.target);
      await api('/admin/api/envios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ciudad: form.get('ciudad'),
          costo: form.get('costo'),
          gratis_desde: form.get('gratis_desde'),
          contra_entrega_habilitado: !!form.get('contra_entrega_habilitado')
        })
      });
      e.target.reset();
      showMsg('success', 'Configuracion de envio guardada');
      loadEnvios();
    } catch (err) {
      showMsg('error', err.message);
    }
  });

  qs('#formNotificacion').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const form = Object.fromEntries(new FormData(e.target).entries());
      await api('/admin/api/notificaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      e.target.reset();
      showMsg('success', 'Notificacion enviada a clientes');
    } catch (err) {
      showMsg('error', err.message);
    }
  });

  Promise.all([
    loadResumen(),
    loadProductos(),
    loadCotizaciones(),
    loadPromociones(),
    loadBanners(),
    loadPedidos(),
    loadClientes(),
    loadEnvios()
  ]).catch((err) => showMsg('error', err.message));

  const params = new URLSearchParams(window.location.search);
  const requestedTab = params.get('tab');
  const requestedProductId = Number(params.get('producto') || 0);
  if (requestedTab) activateTab(requestedTab);
  if (requestedProductId) {
    setTimeout(() => {
      const product = state.products.find((item) => item.id === requestedProductId);
      if (product) fillProductForm(product);
    }, 700);
  }
});
