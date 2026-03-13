document.addEventListener('DOMContentLoaded', () => {
  const qs = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));

  const successBox = qs('#adminSuccess');
  const errorBox = qs('#adminError');
  const formProducto = qs('#formProducto');
  const inputPrecioProducto = qs('#prod-precio');
  const analyticsDays = qs('#analyticsDays');
  const analyticsGranularity = qs('#analyticsGranularity');
  const cotizacionesEstado = qs('#cotizacionesEstado');
  const cotizacionesBusqueda = qs('#cotizacionesBusqueda');
  const cotizacionesBuscarBtn = qs('#cotizacionesBuscarBtn');
  const productSubmitBtn = formProducto ? formProducto.querySelector('.admin-btn') : null;
  const state = { editingProductId: null, products: [] };

  const fmtCop = (valor) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(valor || 0));
  const parseCop = (texto) => String(texto || '').replace(/COP|\$/gi, '').replace(/\s+/g, '').replace(/[^0-9]/g, '');
  const fmtDateTime = (valor) => valor ? new Date(valor).toLocaleString('es-CO') : 'Sin fecha';

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
    productSubmitBtn.innerHTML = editing
      ? '<i class="fas fa-save"></i> Guardar cambios'
      : '<i class="fas fa-save"></i> Guardar producto';
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
    formProducto.precio.value = fmtCop(product.precio || 0);
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

  if (inputPrecioProducto) {
    inputPrecioProducto.addEventListener('blur', () => {
      const limpio = parseCop(inputPrecioProducto.value);
      inputPrecioProducto.value = limpio ? fmtCop(limpio) : '';
    });
  }

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
    const days = analyticsDays ? analyticsDays.value : '30';
    const granularity = analyticsGranularity ? analyticsGranularity.value : 'auto';

    const [resumen, accesos, stats] = await Promise.all([
      api('/admin/api/resumen'),
      api('/admin/api/accesos'),
      api(`/admin/api/estadisticas?days=${encodeURIComponent(days)}&granularity=${encodeURIComponent(granularity)}`)
    ]);

    const k = resumen.data;
    const s = stats.data;
    const st = s.totals || {};
    const kpiItems = [
      { label: `Ventas (${s.days} días)`, value: fmtCop(st.ventas || 0),                                   icon: 'fa-dollar-sign',   color: 'green'  },
      { label: 'Crecimiento ventas',      value: `${Number(st.growth_ventas || 0).toFixed(1)}%`,          icon: 'fa-chart-line',    color: Number(st.growth_ventas || 0) >= 0 ? 'green' : 'orange' },
      { label: `Visitas (${s.days} días)`, value: Number(st.visitas || 0).toLocaleString('es-CO'),         icon: 'fa-eye',           color: 'blue'   },
      { label: 'Crecimiento visitas',     value: `${Number(st.growth_visitas || 0).toFixed(1)}%`,         icon: 'fa-arrow-trend-up',color: Number(st.growth_visitas || 0) >= 0 ? 'blue' : 'orange' },
      { label: 'Pedidos cerrados',        value: Number(st.pedidos || 0).toLocaleString('es-CO'),         icon: 'fa-bag-shopping',  color: 'teal'   },
      { label: 'Ticket promedio',         value: fmtCop(st.ticket_promedio || 0),                         icon: 'fa-receipt',       color: 'teal'   },
      { label: 'Conv. visita → pedido',   value: `${Number(st.conv_visita_pedido || 0).toFixed(2)}%`,     icon: 'fa-funnel-dollar', color: 'purple' },
      { label: 'Conv. visita → consulta', value: `${Number(st.conv_visita_cotizacion || 0).toFixed(2)}%`, icon: 'fa-comments',      color: 'purple' },
      { label: 'Clientes registrados',   value: k.clientes,                                            icon: 'fa-user-check',    color: 'purple' },
      { label: 'Productos activos',      value: k.productos,                                           icon: 'fa-box-open',      color: 'gray'   },
      { label: 'Consultas pendientes',   value: k.cotizaciones_pendientes,                             icon: 'fa-envelope-open-text', color: k.cotizaciones_pendientes > 0 ? 'orange' : 'gray' },
    ];
    qs('#kpiGrid').innerHTML = kpiItems.map((item) => `
      <div class="admin-kpi admin-kpi--${item.color}">
        <div class="admin-kpi__icon"><i class="fas ${item.icon}"></i></div>
        <div>
          <div class="admin-kpi__value">${item.value}</div>
          <div class="admin-kpi__label">${item.label}</div>
        </div>
      </div>
    `).join('');

    const paginasReales = (accesos.data.rutas || []).filter((a) => !a.ruta.includes('/api/') && !a.ruta.endsWith('/logout'));
    renderList('#accesosList', paginasReales, (a) => `<div class="admin-item__row"><strong>${nombreRuta(a.ruta)}</strong><span>${a.visitas} visitas</span></div>`);
    renderList('#origenesList', accesos.data.origenes || [], (o) => `<div class="admin-item__row"><strong>${o.origen}</strong><span>${o.visitas} visitas</span></div>`);
    renderList('#usuariosAccesosList', accesos.data.usuarios || [], (u) => `<div class="admin-item__row"><strong>${u.usuario}</strong><span>${u.visitas} visitas</span></div>`);

    const labels = (s.series && s.series.labels) || [];

    if (!window.__charts) window.__charts = {};
    if (window.__charts.negocio) {
      window.__charts.negocio.destroy();
    }
    const negocioCtx = qs('#negocioChart');
    window.__charts.negocio = new Chart(negocioCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Ventas (COP)',
          data: (s.series && s.series.ventas) || [],
          borderColor: '#0077B6',
          backgroundColor: 'rgba(0,119,182,0.18)',
          fill: true,
          tension: 0.3
        }, {
          label: 'Visitas',
          data: (s.series && s.series.visitas) || [],
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79,70,229,0.12)',
          fill: false,
          tension: 0.25,
          yAxisID: 'y1'
        }, {
          label: 'Pedidos',
          data: (s.series && s.series.pedidos) || [],
          borderColor: '#059669',
          backgroundColor: 'rgba(5,150,105,0.12)',
          fill: false,
          tension: 0.25,
          yAxisID: 'y1'
        }]
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => fmtCop(v) }
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            grid: { drawOnChartArea: false }
          }
        }
      }
    });

    if (window.__charts.funnel) {
      window.__charts.funnel.destroy();
    }
    const funnelCtx = qs('#funnelChart');
    window.__charts.funnel = new Chart(funnelCtx, {
      type: 'bar',
      data: {
        labels: ['Visitas', 'Consultas', 'Pedidos'],
        datasets: [{
          label: 'Embudo',
          data: [Number(st.visitas || 0), Number(st.cotizaciones || 0), Number(st.pedidos || 0)],
          backgroundColor: ['#4f46e5', '#f59e0b', '#059669'],
          borderRadius: 8
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });

    if (window.__charts.mix) {
      window.__charts.mix.destroy();
    }
    const mixCtx = qs('#mixChart');
    window.__charts.mix = new Chart(mixCtx, {
      type: 'doughnut',
      data: {
        labels: ['Visitas', 'Consultas', 'Pedidos'],
        datasets: [{
          data: [Number(st.visitas || 0), Number(st.cotizaciones || 0), Number(st.pedidos || 0)],
          backgroundColor: ['#6366f1', '#f59e0b', '#10b981']
        }]
      },
      options: {
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  };

  const loadCotizaciones = async () => {
    const params = new URLSearchParams();
    if (cotizacionesEstado && cotizacionesEstado.value) params.set('estado', cotizacionesEstado.value);
    if (cotizacionesBusqueda && cotizacionesBusqueda.value.trim()) params.set('q', cotizacionesBusqueda.value.trim());

    const data = await api(`/admin/api/cotizaciones?${params.toString()}`);
    renderList('#cotizacionesList', data.data, (c) => `
      <div class="admin-item__row">
        <strong>${c.nombre}</strong>
        <span class="admin-badge admin-badge--${c.estado === 'respondida' ? 'activo' : (c.estado === 'descartada' ? 'inactivo' : 'piscina')}">${c.estado}</span>
      </div>
      <div class="admin-meta-text">${c.email} ${c.telefono ? ' | ' + c.telefono : ''} ${c.ciudad ? ' | ' + c.ciudad : ''}</div>
      <div class="admin-meta-text">Recibida: ${fmtDateTime(c.created_at)}${c.responded_at ? ' | Respondida: ' + fmtDateTime(c.responded_at) : ''}</div>
      <div style="margin-top:6px">${c.mensaje || 'Sin mensaje'}</div>
      <div class="admin-form-2col" style="margin-top:8px">
        <input id="precio-${c.id}" type="number" step="0.01" placeholder="Precio ofertado" value="${c.precio_ofertado ?? ''}" />
        <input id="resp-${c.id}" placeholder="Respuesta" value="${c.respuesta || ''}" />
      </div>
      <div class="admin-inline-actions" style="margin-top:8px">
        <button class="admin-mini-btn" data-cotizacion="${c.id}">Guardar respuesta</button>
        <button class="admin-mini-btn" data-cotizacion-estado="${c.id}" data-estado="pendiente">Pendiente</button>
        <button class="admin-mini-btn" data-cotizacion-estado="${c.id}" data-estado="respondida">Respondida</button>
        <button class="admin-mini-btn admin-mini-btn--danger" data-cotizacion-estado="${c.id}" data-estado="descartada">Descartar</button>
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
          showMsg('success', 'Cotizacion actualizada');
          loadCotizaciones();
        } catch (err) {
          showMsg('error', err.message);
        }
      });
    });

    qsa('[data-cotizacion-estado]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/admin/api/cotizaciones/${btn.dataset.cotizacionEstado}/estado`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: btn.dataset.estado })
          });
          showMsg('success', 'Estado de cotizacion actualizado');
          loadCotizaciones();
        } catch (err) {
          showMsg('error', err.message);
        }
      });
    });
  };

  const loadPromociones = async () => {
    const data = await api('/admin/api/promociones');
    renderList('#promocionesList', data.data, (p) => `
      <div class="admin-item__row">
        <strong>${p.producto}</strong>
        <span class="admin-badge admin-badge--${p.activa ? 'activo' : 'inactivo'}">${p.activa ? 'Activa' : 'Inactiva'}</span>
      </div>
      <div class="admin-meta-text">${p.porcentaje_descuento}% | ${new Date(p.fecha_inicio).toLocaleString('es-CO')} - ${new Date(p.fecha_fin).toLocaleString('es-CO')}</div>
      <div class="admin-inline-actions" style="margin-top:8px">
        <button class="admin-mini-btn" data-edit-promocion="${p.id}">Editar</button>
        <button class="admin-mini-btn" data-toggle-promocion="${p.id}" data-active="${p.activa ? '1' : '0'}">${p.activa ? 'Inactivar' : 'Activar'}</button>
        <button class="admin-mini-btn admin-mini-btn--danger" data-delete-promocion="${p.id}">Eliminar</button>
      </div>
    `);

    qsa('[data-edit-promocion]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.editPromocion);
        const item = data.data.find((x) => x.id === id);
        if (!item) return;
        const porcentaje = prompt('Nuevo porcentaje de descuento (1-90):', item.porcentaje_descuento);
        if (porcentaje === null) return;
        try {
          await api(`/admin/api/promociones/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ porcentaje_descuento: porcentaje })
          });
          showMsg('success', 'Promocion actualizada');
          loadPromociones();
        } catch (err) {
          showMsg('error', err.message);
        }
      });
    });

    qsa('[data-toggle-promocion]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/admin/api/promociones/${btn.dataset.togglePromocion}/estado`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activa: btn.dataset.active !== '1' })
          });
          showMsg('success', 'Estado de promocion actualizado');
          loadPromociones();
        } catch (err) {
          showMsg('error', err.message);
        }
      });
    });

    qsa('[data-delete-promocion]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Esta accion eliminara la promocion. ¿Continuar?')) return;
        try {
          await api(`/admin/api/promociones/${btn.dataset.deletePromocion}`, { method: 'DELETE' });
          showMsg('success', 'Promocion eliminada');
          loadPromociones();
        } catch (err) {
          showMsg('error', err.message);
        }
      });
    });
  };

  const loadBanners = async () => {
    const data = await api('/admin/api/banners');
    renderList('#bannersList', data.data, (b) => `
      <div class="admin-item__row">
        <strong>${b.titulo}</strong>
        <span>Orden ${b.orden}</span>
      </div>
      <img src="${b.imagen_url}" alt="${b.titulo}" class="admin-banner-thumb">
      <div class="admin-meta-text">${b.enlace_url || 'Sin enlace de destino'}</div>
      <div class="admin-inline-actions" style="margin-top:8px">
        <button class="admin-mini-btn" data-edit-banner="${b.id}">Editar</button>
        <button class="admin-mini-btn" data-toggle-banner="${b.id}" data-active="${b.activo ? '1' : '0'}">${b.activo ? 'Inactivar' : 'Activar'}</button>
        <button class="admin-mini-btn admin-mini-btn--danger" data-delete-banner="${b.id}">Eliminar</button>
      </div>
    `);

    qsa('[data-edit-banner]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.editBanner);
        const item = data.data.find((x) => x.id === id);
        if (!item) return;
        const titulo = prompt('Nuevo titulo del anuncio:', item.titulo);
        if (titulo === null) return;
        const enlace = prompt('Nuevo enlace (opcional):', item.enlace_url || '') || '';
        const orden = prompt('Orden del anuncio:', item.orden);
        try {
          await api(`/admin/api/banners/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ titulo, enlace_url: enlace, orden })
          });
          showMsg('success', 'Banner actualizado');
          loadBanners();
        } catch (err) {
          showMsg('error', err.message);
        }
      });
    });

    qsa('[data-toggle-banner]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/admin/api/banners/${btn.dataset.toggleBanner}/estado`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activo: btn.dataset.active !== '1' })
          });
          showMsg('success', 'Estado de banner actualizado');
          loadBanners();
        } catch (err) {
          showMsg('error', err.message);
        }
      });
    });

    qsa('[data-delete-banner]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Esta accion eliminara el banner. ¿Continuar?')) return;
        try {
          await api(`/admin/api/banners/${btn.dataset.deleteBanner}`, { method: 'DELETE' });
          showMsg('success', 'Banner eliminado');
          loadBanners();
        } catch (err) {
          showMsg('error', err.message);
        }
      });
    });
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
    renderList('#enviosList', data.data, (e) => `
      <div class="admin-item__row"><strong>${e.ciudad}</strong><span>${fmtCop(e.costo)} | Contra entrega: ${e.contra_entrega_habilitado ? 'si' : 'no'}</span></div>
      <div class="admin-inline-actions" style="margin-top:8px">
        <button class="admin-mini-btn" data-edit-envio="${e.id}">Editar</button>
        <button class="admin-mini-btn admin-mini-btn--danger" data-delete-envio="${e.id}">Eliminar</button>
      </div>
    `);

    qsa('[data-edit-envio]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.editEnvio);
        const item = data.data.find((x) => x.id === id);
        if (!item) return;
        const costo = prompt('Nuevo costo de envio (COP):', item.costo);
        if (costo === null) return;
        try {
          await api(`/admin/api/envios/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ costo })
          });
          showMsg('success', 'Envio actualizado');
          loadEnvios();
        } catch (err) {
          showMsg('error', err.message);
        }
      });
    });

    qsa('[data-delete-envio]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Esta accion eliminara esta configuracion de envio. ¿Continuar?')) return;
        try {
          await api(`/admin/api/envios/${btn.dataset.deleteEnvio}`, { method: 'DELETE' });
          showMsg('success', 'Envio eliminado');
          loadEnvios();
        } catch (err) {
          showMsg('error', err.message);
        }
      });
    });
  };

  const loadProductos = async () => {
    const data = await api('/admin/api/productos');
    state.products = data.data;
    renderList('#productosList', data.data, (p) => `
      <div style="display:flex;align-items:center;gap:14px">
        ${p.imagen_url
          ? `<img src="${p.imagen_url}" class="admin-product-thumb" alt="${p.nombre}">`
          : `<div class="admin-product-thumb-placeholder"><i class="fas fa-image"></i></div>`
        }
        <div class="admin-product-body">
          <div class="admin-product-name">${p.nombre}</div>
          <div class="admin-product-meta">
            <span class="admin-badge admin-badge--${p.linea}">${p.linea}</span>
            <span class="admin-badge admin-badge--${p.activo ? 'activo' : 'inactivo'}">${p.activo ? '● Activo' : '● Inactivo'}</span>
            <span style="font-size:0.8rem;color:#6a8fa5">Stock: ${p.stock}</span>
          </div>
          <div class="admin-meta-text">${p.ficha_url ? '<a href="' + p.ficha_url + '" target="_blank" rel="noopener">Ver ficha técnica (PDF)</a>' : 'Sin ficha técnica'}</div>
          <div class="admin-product-price">${fmtCop(p.precio)}</div>
        </div>
        <div class="admin-product-actions">
          <button class="admin-mini-btn" data-edit-product="${p.id}"><i class="fas fa-pen"></i> Editar</button>
          <button class="admin-mini-btn ${p.activo ? 'admin-mini-btn--danger' : ''}" data-toggle-product="${p.id}" data-active="${p.activo ? '1' : '0'}">${p.activo ? 'Inactivar' : 'Activar'}</button>
        </div>
      </div>
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
      body.set('precio', parseCop(body.get('precio')) || '0');
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
      const form = new FormData(e.target);
      await api('/admin/api/banners', {
        method: 'POST',
        body: form
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
      loadNotificaciones();
    } catch (err) {
      showMsg('error', err.message);
    }
  });

  const loadNotificaciones = async () => {
    const data = await api('/admin/api/notificaciones');
    renderList('#notificacionesList', data.data, (n) => `
      <div class="admin-item__row"><strong>${n.titulo}</strong><span class="admin-badge admin-badge--${n.tipo === 'promocion' ? 'piscina' : 'agua'}">${n.tipo}</span></div>
      <div class="admin-meta-text">${new Date(n.created_at).toLocaleString('es-CO')}</div>
      <div>${n.mensaje}</div>
      <div class="admin-inline-actions" style="margin-top:8px">
        <button class="admin-mini-btn" data-edit-notificacion="${n.id}">Editar</button>
        <button class="admin-mini-btn admin-mini-btn--danger" data-delete-notificacion="${n.id}">Eliminar</button>
      </div>
    `);

    qsa('[data-edit-notificacion]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.editNotificacion);
        const item = data.data.find((x) => x.id === id);
        if (!item) return;
        const titulo = prompt('Editar titulo:', item.titulo);
        if (titulo === null) return;
        const mensaje = prompt('Editar mensaje:', item.mensaje);
        if (mensaje === null) return;
        try {
          await api(`/admin/api/notificaciones/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ titulo, mensaje, tipo: item.tipo })
          });
          showMsg('success', 'Notificacion actualizada');
          loadNotificaciones();
        } catch (err) {
          showMsg('error', err.message);
        }
      });
    });

    qsa('[data-delete-notificacion]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Esta accion eliminara la notificacion. ¿Continuar?')) return;
        try {
          await api(`/admin/api/notificaciones/${btn.dataset.deleteNotificacion}`, { method: 'DELETE' });
          showMsg('success', 'Notificacion eliminada');
          loadNotificaciones();
        } catch (err) {
          showMsg('error', err.message);
        }
      });
    });
  };

  Promise.all([
    loadResumen(),
    loadProductos(),
    loadCotizaciones(),
    loadPromociones(),
    loadBanners(),
    loadPedidos(),
    loadClientes(),
    loadEnvios(),
    loadNotificaciones()
  ]).catch((err) => showMsg('error', err.message));

  if (analyticsDays) analyticsDays.addEventListener('change', () => loadResumen().catch((err) => showMsg('error', err.message)));
  if (analyticsGranularity) analyticsGranularity.addEventListener('change', () => loadResumen().catch((err) => showMsg('error', err.message)));
  if (cotizacionesEstado) cotizacionesEstado.addEventListener('change', () => loadCotizaciones().catch((err) => showMsg('error', err.message)));
  if (cotizacionesBuscarBtn) cotizacionesBuscarBtn.addEventListener('click', () => loadCotizaciones().catch((err) => showMsg('error', err.message)));
  if (cotizacionesBusqueda) {
    cotizacionesBusqueda.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        loadCotizaciones().catch((err) => showMsg('error', err.message));
      }
    });
  }

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
