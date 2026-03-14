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
  const state = { editingProductId: null, editingPromocionId: null, editingBannerId: null, products: [], productFormStep: 1 };

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
    if (typeof window._goProductFormStep === 'function') window._goProductFormStep(1);
    if (typeof window._syncProductFormLinea === 'function') window._syncProductFormLinea('piscina');
    if (typeof window._updateProductFormPreview === 'function') window._updateProductFormPreview();
  };

  const fillProductForm = (product) => {
    if (!formProducto) return;
    activateTab('productos');
    formProducto.nombre.value = product.nombre || '';
    formProducto.slug.value = product.slug || '';
    formProducto.linea.value = product.linea || 'piscina';
    formProducto.precio.value = fmtCop(product.precio || 0);
    const precioAnteriorEl = formProducto.querySelector('input[name="precio_anterior"]');
    if (precioAnteriorEl) precioAnteriorEl.value = product.precio_anterior != null ? fmtCop(product.precio_anterior) : '';
    formProducto.stock.value = product.stock ?? 0;
    formProducto.descripcion.value = product.descripcion || '';
    state.editingProductId = product.id;
    setProductFormMode(true);
    if (typeof window._goProductFormStep === 'function') window._goProductFormStep(1);
    if (typeof window._syncProductFormLinea === 'function') window._syncProductFormLinea(product.linea || 'piscina');
    if (typeof window._updateProductFormPreview === 'function') window._updateProductFormPreview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetPromocionForm = () => {
    state.editingPromocionId = null;
    const form = qs('#formPromocion');
    if (!form) return;
    form.reset();
    form.querySelector('.admin-btn').innerHTML = '<i class="fas fa-tag"></i> Programar oferta';
    const cancelBtn = qs('#btnCancelPromo');
    if (cancelBtn) cancelBtn.remove();
  };

  const fillPromocionForm = (p) => {
    state.editingPromocionId = p.id;
    const form = qs('#formPromocion');
    if (!form) return;
    form.producto_id.value = p.producto_id;
    form.porcentaje_descuento.value = p.porcentaje_descuento;
    // datetime-local input needs YYYY-MM-DDTHH:MM
    form.fecha_inicio.value = p.fecha_inicio.substring(0, 16);
    form.fecha_fin.value = p.fecha_fin.substring(0, 16);
    if (form.activa) form.activa.checked = !!p.activa;
    form.querySelector('.admin-btn').innerHTML = '<i class="fas fa-save"></i> Guardar cambios';

    if (!qs('#btnCancelPromo')) {
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.id = 'btnCancelPromo';
      cancelBtn.className = 'admin-btn';
      cancelBtn.style.background = '#6c757d';
      cancelBtn.style.marginTop = '8px';
      cancelBtn.innerHTML = '<i class="fas fa-times"></i> Cancelar edición';
      cancelBtn.onclick = resetPromocionForm;
      form.appendChild(cancelBtn);
    }
    activateTab('promociones');
    window.scrollTo({ top: form.offsetTop - 100, behavior: 'smooth' });
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
  const inputPrecioAnterior = qs('#prod-precio-anterior');
  if (inputPrecioAnterior) {
    inputPrecioAnterior.addEventListener('blur', () => {
      const limpio = parseCop(inputPrecioAnterior.value);
      inputPrecioAnterior.value = limpio ? fmtCop(limpio) : '';
    });
  }

  (function initProductFormModule() {
    if (!formProducto) return;
    const steps = [1, 2, 3];
    const stepButtons = qsa('.product-form-step');
    const panels = qsa('.product-form-panel');
    const lineaBtns = qsa('.product-form-linea-btn');
    const hiddenLinea = formProducto.querySelector('#prod-linea');
    const inputNombre = formProducto.querySelector('#prod-nombre');
    const inputSlug = formProducto.querySelector('#prod-slug');
    const inputStock = formProducto.querySelector('#prod-stock');
    const previewPriceEl = qs('#productFormPreviewPrice');

    const slugFromNombre = (text) => (text || '').trim().toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    window._goProductFormStep = (step) => {
      state.productFormStep = Math.max(1, Math.min(3, step));
      stepButtons.forEach((btn) => {
        const active = Number(btn.dataset.step) === state.productFormStep;
        btn.classList.toggle('product-form-step--active', active);
        btn.setAttribute('aria-current', active ? 'step' : null);
      });
      panels.forEach((panel) => {
        const panelStep = Number(panel.dataset.stepPanel);
        panel.hidden = panelStep !== state.productFormStep;
      });
    };

    window._syncProductFormLinea = (value) => {
      if (hiddenLinea) hiddenLinea.value = value === 'agua' ? 'agua' : 'piscina';
      lineaBtns.forEach((btn) => {
        const isActive = (btn.dataset.linea || '') === (hiddenLinea ? hiddenLinea.value : 'piscina');
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    };

    window._updateProductFormPreview = () => {
      if (!previewPriceEl) return;
      const raw = inputPrecioProducto ? parseCop(inputPrecioProducto.value) : '';
      const num = raw ? Number(raw) : 0;
      previewPriceEl.textContent = fmtCop(num);
    };

    stepButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        window._goProductFormStep(Number(btn.dataset.step));
      });
    });

    formProducto.querySelectorAll('.product-form-btn--next').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (state.productFormStep < 3) window._goProductFormStep(state.productFormStep + 1);
      });
    });
    formProducto.querySelectorAll('.product-form-btn--prev').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (state.productFormStep > 1) window._goProductFormStep(state.productFormStep - 1);
      });
    });

    lineaBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const value = (btn.dataset.linea || 'piscina') === 'agua' ? 'agua' : 'piscina';
        window._syncProductFormLinea(value);
      });
    });

    if (inputNombre && inputSlug) {
      inputNombre.addEventListener('input', () => {
        const slug = slugFromNombre(inputNombre.value);
        if (slug && !(inputSlug.value || '').trim()) inputSlug.value = slug;
      });
    }

    if (inputPrecioProducto) {
      inputPrecioProducto.addEventListener('input', () => window._updateProductFormPreview());
      inputPrecioProducto.addEventListener('change', () => window._updateProductFormPreview());
    }
    if (previewPriceEl) window._updateProductFormPreview();

    formProducto.querySelectorAll('.product-form-stock-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!inputStock) return;
        const action = btn.dataset.action;
        let n = parseInt(inputStock.value, 10) || 0;
        if (action === 'plus') n += 1;
        else if (action === 'minus') n = Math.max(0, n - 1);
        inputStock.value = n;
      });
    });
  })();

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
    // 1. Eliminar tecnicismos comunes
    let r = ruta.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    
    const mapa = {
      '/': 'Inicio (Home)',
      '/admin': 'Panel de Control',
      '/carrito': 'Carrito de Compras',
      '/carrito/checkout': 'Proceso de Pago',
      '/autenticacion/login': 'Acceso Clientes',
      '/autenticacion/registro': 'Registro Clientes',
      '/autenticacion/perfil': 'Mi Perfil',
      '/catalogo/piscina': 'Catálogo Piscinas',
      '/catalogo/agua': 'Catálogo Tratamiento Agua',
      '/blog': 'Blog de Consejos',
      '/pages/contacto': 'Página de Contacto',
      '/pages/cotizar': 'Formulario Cotización',
      '/nosotros': 'Sobre la Empresa',
    };
    
    if (mapa[r]) return mapa[r];
    
    // Rutas dinámicas
    if (r.startsWith('/blog/')) {
      return 'Blog › ' + r.split('/').pop().replace(/-/g, ' ');
    }
    
    return r;
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
      { label: 'Conv. visita → cotización', value: `${Number(st.conv_visita_cotizacion || 0).toFixed(2)}%`, icon: 'fa-file-invoice-dollar', color: 'purple' },
      { label: 'Clientes registrados',   value: k.clientes,                                            icon: 'fa-user-check',    color: 'purple' },
      { label: 'Productos activos',      value: k.productos,                                           icon: 'fa-box-open',      color: 'gray'   },
      { label: 'Cotizaciones pendientes',   value: k.cotizaciones_pendientes,                             icon: 'fa-envelope-open-text', color: k.cotizaciones_pendientes > 0 ? 'orange' : 'gray' },
    ];
    qs('#kpiGrid').innerHTML = kpiItems.map((item) => `
      <div class="admin-kpi admin-kpi--${item.color}">
        <div class="admin-kpi__icon"><i class="fas ${item.icon}"></i></div>
        <div class="admin-kpi__content">
          <div class="admin-kpi__value">${item.value}</div>
          <div class="admin-kpi__label">${item.label}</div>
        </div>
      </div>
    `).join('');

    // Insight cards (Alertas inteligentes)
    const insights = [];
    if (k.cotizaciones_pendientes > 0) {
      insights.push({ 
        title: '¡Oportunidad de Venta!', 
        text: `Tienes ${k.cotizaciones_pendientes} cotizaciones esperando respuesta.`, 
        icon: 'fa-bolt', 
        color: 'orange',
        action: () => activateTab('cotizaciones')
      });
    }
    if (Number(st.growth_visitas) > 20) {
      insights.push({ 
        title: 'Tráfico en aumento', 
        text: `Tus visitas han subido un ${st.growth_visitas}% este mes. ¡Buen trabajo!`, 
        icon: 'fa-rocket', 
        color: 'blue' 
      });
    }

    const insightContainer = qs('#insightContainer');
    if (insightContainer) {
      insightContainer.innerHTML = insights.length ? insights.map(ins => `
        <div class="admin-insight admin-insight--${ins.color}">
          <div class="admin-insight__icon"><i class="fas ${ins.icon}"></i></div>
          <div class="admin-insight__body">
            <strong>${ins.title}</strong>
            <p>${ins.text}</p>
          </div>
        </div>
      `).join('') : '';
    }

    const paginasReales = (accesos.data.rutas || [])
      .filter((a) => 
        !a.ruta.includes('/api/') && 
        !a.ruta.includes('/static/') && 
        !a.ruta.endsWith('/logout') &&
        a.ruta !== '/admin' &&
        a.ruta !== '/admin/'
      )
      .slice(0, 10); // Mostrar solo las top 10 para no saturar
    const maxVisitas = Math.max(...paginasReales.map(p => p.visitas), 1);
    renderList('#accesosList', paginasReales, (a) => `
      <div class="admin-page-stat">
        <div class="admin-page-stat__info">
          <strong>${nombreRuta(a.ruta)}</strong>
          <span>${a.visitas} visitas</span>
        </div>
        <div class="admin-page-stat__bar-bg">
          <div class="admin-page-stat__bar" style="width: ${(a.visitas / maxVisitas * 100).toFixed(0)}%"></div>
        </div>
      </div>
    `);
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
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          borderWidth: 3,
          pointRadius: 4,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#3b82f6',
          pointBorderWidth: 2,
          tension: 0.4,
          fill: true
        }, {
          label: 'Visitas',
          data: (s.series && s.series.visitas) || [],
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.05)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              usePointStyle: true,
              padding: 20,
              font: { family: 'Barlow', size: 12, weight: '500' }
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            padding: 12,
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleFont: { size: 13, weight: '700' },
            bodyFont: { size: 12 },
            cornerRadius: 8
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: '#f1f5f9', drawBorder: false },
            ticks: {
              font: { size: 11 },
              callback: (v) => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v
            }
          },
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 }, maxRotation: 0 }
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
        labels: ['Visitas', 'Cotizaciones', 'Pedidos'],
        datasets: [{
          label: 'Embudo',
          data: [Number(st.visitas || 0), Number(st.cotizaciones || 0), Number(st.pedidos || 0)],
          backgroundColor: ['#6366f1', '#f59e0b', '#10b981'],
          borderRadius: 8,
          barThickness: 40
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { 
          y: { 
            beginAtZero: true,
            grid: { color: '#f1f5f9', drawBorder: false }
          },
          x: { grid: { display: false } }
        }
      }
    });

    if (window.__charts.mix) {
      window.__charts.mix.destroy();
    }
    const mixCtx = qs('#mixChart');
    window.__charts.mix = new Chart(mixCtx, {
      type: 'doughnut',
      data: {
        labels: ['Visitas', 'Cotizaciones', 'Pedidos'],
        datasets: [{
          data: [Number(st.visitas || 0), Number(st.cotizaciones || 0), Number(st.pedidos || 0)],
          backgroundColor: ['#6366f1', '#f59e0b', '#10b981'],
          borderWidth: 0,
          hoverOffset: 10
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: { 
            position: 'bottom',
            labels: { usePointStyle: true, padding: 20 }
          }
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
      <div class="admin-item">
        <div class="admin-item__row">
          <strong>${c.nombre}</strong>
          <span class="admin-badge admin-badge--${c.estado === 'respondida' ? 'activo' : (c.estado === 'descartada' ? 'inactivo' : 'piscina')}">${c.estado.toUpperCase()}</span>
        </div>
        <div class="admin-meta-text">
          <i class="fas fa-envelope"></i> ${c.email} 
          ${c.telefono ? ' | <i class="fas fa-phone"></i> ' + c.telefono : ''} 
          ${c.ciudad ? ' | <i class="fas fa-map-marker-alt"></i> ' + c.ciudad : ''}
        </div>
        <div class="admin-meta-text">
          <i class="fas fa-calendar-alt"></i> Recibida: ${fmtDateTime(c.created_at)}
          ${c.responded_at ? ' | <i class="fas fa-check-double"></i> Respondida: ' + fmtDateTime(c.responded_at) : ''}
        </div>
        
        <div style="margin: 12px 0; padding: 10px; background: #fff; border-left: 4px solid #0077B6; border-radius: 4px; font-size: 0.9rem; color: #333;">
          <strong style="display:block; margin-bottom:4px; font-size:0.8rem; color: #666;">MENSAJE DEL CLIENTE:</strong>
          ${c.mensaje || 'Sin mensaje'}
        </div>

        <div class="admin-form-grid" style="background: #f0f7ff; padding: 12px; border-radius: 8px; margin-top: 10px;">
          <div class="admin-form-2col">
            <div class="admin-form-group">
              <label style="font-size:0.75rem;">Precio ofertado (COP)</label>
              <input id="precio-${c.id}" type="number" step="0.01" placeholder="Ej: 1500000" value="${c.precio_ofertado ?? ''}" style="width:100%" />
            </div>
            <div class="admin-form-group">
              <label style="font-size:0.75rem;">Respuesta al cliente</label>
              <input id="resp-${c.id}" placeholder="Escribe tu respuesta aquí..." value="${c.respuesta || ''}" style="width:100%" />
            </div>
          </div>
          <div class="admin-inline-actions" style="margin-top:10px; justify-content: flex-end;">
            <button class="admin-mini-btn" data-cotizacion="${c.id}" style="background: #0077B6; color: white;"><i class="fas fa-paper-plane"></i> Guardar y Marcar Respondida</button>
            <div style="border-left: 1px solid #ccc; margin: 0 8px;"></div>
            <button class="admin-mini-btn" data-cotizacion-estado="${c.id}" data-estado="pendiente">Pendiente</button>
            <button class="admin-mini-btn admin-mini-btn--danger" data-cotizacion-estado="${c.id}" data-estado="descartada"><i class="fas fa-times"></i> Descartar</button>
          </div>
        </div>
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
        <div style="display:flex;gap:6px">
          <span class="admin-badge admin-badge--${p.activa ? 'activo' : 'inactivo'}">${p.activa ? 'Activa' : 'Inactiva'}</span>
          ${p.vigente ? '<span class="admin-badge admin-badge--piscina">Vigente</span>' : '<span class="admin-badge admin-badge--inactivo">Fuera de fecha</span>'}
        </div>
      </div>
      <div class="admin-meta-text">${p.porcentaje_descuento}% de descuento</div>
      <div class="admin-meta-text"><i class="far fa-calendar-alt"></i> ${new Date(p.fecha_inicio).toLocaleString('es-CO')} - ${new Date(p.fecha_fin).toLocaleString('es-CO')}</div>
      <div class="admin-inline-actions" style="margin-top:8px">
        <button class="admin-mini-btn" data-edit-promocion="${p.id}"><i class="fas fa-edit"></i> Editar %</button>
        <button class="admin-mini-btn" data-toggle-promocion="${p.id}" data-active="${p.activa ? '1' : '0'}">${p.activa ? 'Inactivar' : 'Activar'}</button>
        <button class="admin-mini-btn admin-mini-btn--danger" data-delete-promocion="${p.id}"><i class="fas fa-trash"></i></button>
      </div>
    `);

    qsa('[data-edit-promocion]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.editPromocion);
        const item = data.data.find((x) => x.id === id);
        if (item) fillPromocionForm(item);
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
      <div class="admin-item" style="border-left: 5px solid ${b.color_fondo}">
        <div class="admin-item__row">
          <strong>${b.titulo} <span class="admin-badge admin-badge--piscina" style="font-size:0.65rem; margin-left:5px;">${b.tipo.toUpperCase()}</span></strong>
          <div style="display:flex; gap:8px;">
            <span class="admin-badge" style="background:${b.color_fondo}; color:#333; border:1px solid #ccc;">${b.color_fondo}</span>
            <span class="admin-badge admin-badge--${b.activo ? 'activo' : 'inactivo'}">${b.activo ? 'Activo' : 'Inactivo'}</span>
          </div>
        </div>
        <div class="admin-meta-text"><em>${b.subtitulo || 'Sin kicker'}</em> | Orden: ${b.orden}</div>
        <div style="display:flex; gap:15px; margin-top:10px; align-items: center;">
          <img src="${b.imagen_url}" alt="${b.titulo}" class="admin-banner-thumb" style="width:100px; height:60px; object-fit:contain; background:#eee; border-radius:8px;">
          <div style="font-size:0.85rem; color:#666;">
            <p>${b.descripcion || 'Sin descripción'}</p>
            <p style="margin-top:4px;"><i class="fas fa-link"></i> ${b.enlace_url || 'Sin enlace'}</p>
          </div>
        </div>
        <div class="admin-inline-actions" style="margin-top:12px; justify-content: flex-end;">
          <button class="admin-mini-btn" data-edit-banner="${b.id}"><i class="fas fa-edit"></i> Editar Todo</button>
          <button class="admin-mini-btn" data-toggle-banner="${b.id}" data-active="${b.activo ? '1' : '0'}">${b.activo ? 'Inactivar' : 'Activar'}</button>
          <button class="admin-mini-btn admin-mini-btn--danger" data-delete-banner="${b.id}"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `);

    qsa('[data-edit-banner]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.editBanner);
        const item = data.data.find((x) => x.id === id);
        if (!item) return;
        
        state.editingBannerId = id;
        const form = qs('#formBanner');
        form.tipo.value = item.tipo || 'hero';
        form.titulo.value = item.titulo;
        form.subtitulo.value = item.subtitulo || '';
        form.descripcion.value = item.descripcion || '';
        form.texto_boton.value = item.texto_boton || 'Comprar Ahora';
        form.color_fondo.value = item.color_fondo || '#f8fbf8';
        form.imagen_url.value = item.imagen_url || '';
        form.enlace_url.value = item.enlace_url || '';
        form.orden.value = item.orden || 0;
        
        form.querySelector('.admin-btn').innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
        
        if (!qs('#btnCancelBanner')) {
          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.id = 'btnCancelBanner';
          cancelBtn.className = 'admin-btn';
          cancelBtn.style.background = '#6c757d';
          cancelBtn.style.marginTop = '8px';
          cancelBtn.innerHTML = '<i class="fas fa-times"></i> Cancelar Edición';
          cancelBtn.onclick = () => {
            state.editingBannerId = null;
            form.reset();
            form.querySelector('.admin-btn').innerHTML = '<i class="fas fa-bullhorn"></i> Guardar anuncio';
            cancelBtn.remove();
          };
          form.appendChild(cancelBtn);
        }
        window.scrollTo({ top: form.offsetTop - 100, behavior: 'smooth' });
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

    // Poblar select de productos para promociones
    const selectPromo = qs('#selectProductoPromo');
    if (selectPromo) {
      selectPromo.innerHTML = '<option value="">-- Seleccionar producto --</option>' +
        state.products.map(p => `<option value="${p.id}">${p.nombre} (${fmtCop(p.precio)})</option>`).join('');
    }

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
          <div class="admin-product-price">${fmtCop(p.precio)}${p.precio_anterior != null ? ` <span style="text-decoration:line-through;color:#8fa8b5;font-size:0.9em">${fmtCop(p.precio_anterior)}</span>` : ''}</div>
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
      const pa = body.get('precio_anterior');
      body.set('precio_anterior', (pa && parseCop(pa)) ? parseCop(pa) : '');
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
      const body = Object.fromEntries(form.entries());
      body.activa = !!form.get('activa');
      if (state.editingPromocionId) {
        await api(`/admin/api/promociones/${state.editingPromocionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        showMsg('success', 'Promocion actualizada');
      } else {
        await api('/admin/api/promociones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        showMsg('success', 'Promocion programada');
      }
      resetPromocionForm();
      loadPromociones();
    } catch (err) {
      showMsg('error', err.message);
    }
  });

  qs('#formBanner').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const form = new FormData(e.target);
      const url = state.editingBannerId ? `/admin/api/banners/${state.editingBannerId}` : '/admin/api/banners';
      const method = state.editingBannerId ? 'PATCH' : 'POST';
      
      await api(url, {
        method: method,
        body: form
      });
      
      showMsg('success', state.editingBannerId ? 'Anuncio actualizado' : 'Anuncio creado');
      
      // Reset
      state.editingBannerId = null;
      e.target.reset();
      e.target.querySelector('.admin-btn').innerHTML = '<i class="fas fa-bullhorn"></i> Guardar anuncio';
      const cancelBtn = qs('#btnCancelBanner');
      if (cancelBtn) cancelBtn.remove();
      
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
  const requestedPromoProdId = Number(params.get('producto_id') || 0);

  if (requestedTab) activateTab(requestedTab);

  if (requestedProductId) {
    setTimeout(() => {
      const product = state.products.find((item) => item.id === requestedProductId);
      if (product) fillProductForm(product);
    }, 700);
  }

  if (requestedPromoProdId) {
    setTimeout(async () => {
      try {
        const res = await api('/admin/api/promociones');
        const existing = res.data.find(p => p.producto_id === requestedPromoProdId);
        if (existing) {
          fillPromocionForm(existing);
        } else {
          const form = qs('#formPromocion');
          if (form) {
            form.producto_id.value = requestedPromoProdId;
            activateTab('promociones');
            window.scrollTo({ top: form.offsetTop - 100, behavior: 'smooth' });
          }
        }
      } catch (err) { console.error(err); }
    }, 800);
  }
});
