document.addEventListener('DOMContentLoaded', () => {
  const qs = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));

  const successBox = qs('#adminSuccess');
  const errorBox = qs('#adminError');
  const formProducto = qs('#formProducto');
  const formCategoria = qs('#formCategoria');
  const inputPrecioProducto = qs('#prod-precio');
  const analyticsDays = qs('#analyticsDays');
  const analyticsGranularity = qs('#analyticsGranularity');
  const cotizacionesEstado = qs('#cotizacionesEstado');
  const cotizacionesBusqueda = qs('#cotizacionesBusqueda');
  const cotizacionesBuscarBtn = qs('#cotizacionesBuscarBtn');
  const productSubmitBtn = formProducto ? formProducto.querySelector('.admin-btn') : null;
  const state = {
    editingCategoryId: null,
    editingProductId: null,
    editingPromocionId: null,
    editingBannerId: null,
    products: [],
    categories: [],
    categoryFieldDrafts: [],
    productFormStep: 1,
    productCaracteristicas: [],
    productKit: [],
    productRecomendados: [],
    productCamposTecnicos: {},
    productCategoriaPendiente: null,
    productEspecificacionesTecnicas: [], // Nuevas especificaciones dinámicas
    productImagenesAdicionalesEliminar: [],
  };

  const fmtCop = (valor) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(valor || 0));
  const parseCop = (texto) => String(texto || '').replace(/COP|\$/gi, '').replace(/\s+/g, '').replace(/[^0-9]/g, '');
  const slugify = (text) => (text || '').trim().toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const escapeHtml = (value) => String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
  const fmtDateTime = (valor) => valor ? new Date(valor).toLocaleString('es-CO') : 'Sin fecha';

  const timeAgo = (dateString) => {
    if (!dateString) return 'Sin fecha';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return `Hace ${Math.floor(interval)} años`;
    interval = seconds / 2592000;
    if (interval > 1) return `Hace ${Math.floor(interval)} meses`;
    interval = seconds / 86400;
    if (interval > 1) return `Hace ${Math.floor(interval)} días`;
    interval = seconds / 3600;
    if (interval > 1) return `Hace ${Math.floor(interval)} horas`;
    interval = seconds / 60;
    if (interval > 1) return `Hace ${Math.floor(interval)} minutos`;
    return `Hace ${Math.floor(seconds)} segundos`;
  };

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
    const cancelEditBtn = qs('#btnCancelEditProducto');
    if (cancelEditBtn) cancelEditBtn.hidden = !editing;
  };

  const resetProductForm = () => {
    if (!formProducto) return;
    formProducto.reset();
    state.editingProductId = null;
    state.productCaracteristicas = [];
    state.productKit = [];
    state.productRecomendados = [];
    state.productCamposTecnicos = {};
    state.productCategoriaPendiente = null;
    state.productEspecificacionesTecnicas = [];
    state.productImagenesAdicionalesEliminar = [];
    setProductFormMode(false);
    if (typeof window._goProductFormStep === 'function') window._goProductFormStep(1);
    if (typeof window._syncProductFormLinea === 'function') window._syncProductFormLinea('piscina');
    if (typeof window._renderProductCategorias === 'function') window._renderProductCategorias();
    if (typeof window._renderProductCamposTecnicos === 'function') window._renderProductCamposTecnicos();
    if (typeof window._renderProductCaracteristicas === 'function') window._renderProductCaracteristicas();
    if (typeof window._renderProductKit === 'function') window._renderProductKit();
    if (typeof window._renderProductRecomendados === 'function') window._renderProductRecomendados();
    if (typeof window._renderProductEspecificacionesTecnicas === 'function') window._renderProductEspecificacionesTecnicas();
    if (typeof window._renderProductImagenesActuales === 'function') window._renderProductImagenesActuales([]);
    if (typeof window._updateProductFormPreview === 'function') window._updateProductFormPreview();
  };

  const fillProductForm = (product) => {
    if (!formProducto) return;
    activateTab('productos');
    formProducto.nombre.value = product.nombre || '';
    formProducto.slug.value = product.slug || '';
    const lineaProducto = product.linea || 'piscina';
    formProducto.linea.value = lineaProducto;
    formProducto.marca.value = product.marca || '';
    formProducto.referencia.value = product.referencia || '';
    formProducto.garantia_meses.value = product.garantia_meses || '';
    formProducto.precio.value = fmtCop(product.precio || 0);
    const precioAnteriorEl = formProducto.querySelector('input[name="precio_anterior"]');
    if (precioAnteriorEl) precioAnteriorEl.value = product.precio_anterior != null ? fmtCop(product.precio_anterior) : '';
    formProducto.stock.value = product.stock ?? 0;
    formProducto.descripcion.value = product.descripcion || '';
    state.productCaracteristicas = Array.isArray(product.caracteristicas) ? [...product.caracteristicas] : [];
    state.productKit = Array.isArray(product.contenido_kit) ? [...product.contenido_kit] : [];
    state.productRecomendados = Array.isArray(product.recomendados_ids) ? [...product.recomendados_ids] : [];
    state.productEspecificacionesTecnicas = Array.isArray(product.especificaciones_tecnicas) ? [...product.especificaciones_tecnicas] : [];
    state.productCamposTecnicos = {};
    state.productCategoriaPendiente = product.categoria_id || null;
    (product.campos_tecnicos || []).forEach((item) => {
      state.productCamposTecnicos[item.campo_id] = item.valor;
    });
    state.productImagenesAdicionalesEliminar = [];
    state.editingProductId = product.id;
    setProductFormMode(true);
    if (typeof window._goProductFormStep === 'function') window._goProductFormStep(1);
    if (typeof window._syncProductFormLinea === 'function') window._syncProductFormLinea(lineaProducto);
    if (typeof window._renderProductCategorias === 'function') window._renderProductCategorias(product.categoria_id || '');
    const categoriaSelect = qs('#prod-categoria');
    if (categoriaSelect && product.categoria_id) categoriaSelect.value = String(product.categoria_id);
    if (typeof window._renderProductCamposTecnicos === 'function') window._renderProductCamposTecnicos();
    if (typeof window._renderProductCaracteristicas === 'function') window._renderProductCaracteristicas();
    if (typeof window._renderProductKit === 'function') window._renderProductKit();
    if (typeof window._renderProductRecomendados === 'function') window._renderProductRecomendados();
    if (typeof window._renderProductEspecificacionesTecnicas === 'function') window._renderProductEspecificacionesTecnicas();
    if (typeof window._renderProductImagenesActuales === 'function') window._renderProductImagenesActuales(product.imagenes_adicionales || []);
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

  const renderCategoryFieldDrafts = () => {
    const root = qs('#categoriaCamposList');
    if (!root) return;
    if (!state.categoryFieldDrafts.length) {
      root.innerHTML = '<p class="admin-form-hint">Sin campos técnicos aún. Agrega los que necesites para esta categoría.</p>';
      return;
    }
    root.innerHTML = state.categoryFieldDrafts.map((field, idx) => `
      <div class="category-field-item" data-index="${idx}">
        <input class="cf-name" placeholder="Nombre" value="${escapeHtml(field.nombre || '')}">
        <select class="cf-type">
          <option value="texto" ${field.tipo_dato === 'texto' ? 'selected' : ''}>Texto</option>
          <option value="numero" ${field.tipo_dato === 'numero' ? 'selected' : ''}>Número</option>
          <option value="booleano" ${field.tipo_dato === 'booleano' ? 'selected' : ''}>Sí/No</option>
          <option value="opcion" ${field.tipo_dato === 'opcion' ? 'selected' : ''}>Opción</option>
        </select>
        <input class="cf-unit" placeholder="Unidad" value="${escapeHtml(field.unidad_medida || '')}">
        <input class="cf-options" placeholder="Opciones separadas por coma" value="${escapeHtml((field.opciones || []).join(', '))}">
        <label class="admin-check"><input type="checkbox" class="cf-required" ${field.obligatorio ? 'checked' : ''}> Obligatorio</label>
        <button type="button" class="admin-mini-btn admin-mini-btn--danger cf-remove"><i class="fas fa-trash"></i></button>
      </div>
    `).join('');

    root.querySelectorAll('.category-field-item').forEach((row) => {
      const index = Number(row.dataset.index);
      const model = state.categoryFieldDrafts[index];
      const nameInput = row.querySelector('.cf-name');
      const typeInput = row.querySelector('.cf-type');
      const unitInput = row.querySelector('.cf-unit');
      const optionsInput = row.querySelector('.cf-options');
      const requiredInput = row.querySelector('.cf-required');
      const removeBtn = row.querySelector('.cf-remove');

      nameInput.addEventListener('input', () => {
        model.nombre = nameInput.value;
        if (!model.slug) model.slug = slugify(nameInput.value);
      });
      typeInput.addEventListener('change', () => { model.tipo_dato = typeInput.value; });
      unitInput.addEventListener('input', () => { model.unidad_medida = unitInput.value; });
      optionsInput.addEventListener('input', () => {
        model.opciones = optionsInput.value.split(',').map((x) => x.trim()).filter(Boolean);
      });
      requiredInput.addEventListener('change', () => { model.obligatorio = !!requiredInput.checked; });
      removeBtn.addEventListener('click', () => {
        state.categoryFieldDrafts.splice(index, 1);
        renderCategoryFieldDrafts();
      });
    });
  };

  const resetCategoryForm = () => {
    if (!formCategoria) return;
    formCategoria.reset();
    state.editingCategoryId = null;
    state.categoryFieldDrafts = [];
    renderCategoryFieldDrafts();
    const submit = formCategoria.querySelector('.admin-btn');
    if (submit) submit.innerHTML = '<i class="fas fa-save"></i> Guardar categoría';
  };

  const fillCategoryForm = (category) => {
    if (!formCategoria) return;
    activateTab('categorias');
    formCategoria.nombre.value = category.nombre || '';
    formCategoria.slug.value = category.slug || '';
    formCategoria.linea.value = category.linea || 'piscina';
    formCategoria.descripcion.value = category.descripcion || '';
    formCategoria.activo.checked = !!category.activo;
    state.editingCategoryId = category.id;
    state.categoryFieldDrafts = (category.campos_tecnicos || []).map((f, idx) => ({
      nombre: f.nombre,
      slug: f.slug,
      tipo_dato: f.tipo_dato || 'texto',
      unidad_medida: f.unidad_medida || '',
      obligatorio: !!f.obligatorio,
      opciones: Array.isArray(f.opciones) ? f.opciones : [],
      orden: f.orden ?? idx,
    }));
    renderCategoryFieldDrafts();
    const submit = formCategoria.querySelector('.admin-btn');
    if (submit) submit.innerHTML = '<i class="fas fa-save"></i> Guardar cambios de categoría';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderCategoriasList = (categories) => {
    renderList('#categoriasList', categories, (c) => `
      <div class="admin-item__row">
        <strong>${escapeHtml(c.nombre)}</strong>
        <span class="admin-badge admin-badge--${c.activo ? 'activo' : 'inactivo'}">${c.activo ? 'Activa' : 'Inactiva'}</span>
      </div>
      <div class="admin-meta-text">${c.linea === 'agua' ? 'Tratamiento de Agua' : 'Piscina & Spa'} · ${c.slug}</div>
      <div class="admin-meta-text">${(c.campos_tecnicos || []).length} campo(s) técnico(s)</div>
      <div class="admin-inline-actions" style="margin-top:8px">
        <button class="admin-mini-btn" data-edit-categoria="${c.id}"><i class="fas fa-pen"></i> Editar</button>
      </div>
    `);

    qsa('[data-edit-categoria]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.editCategoria);
        const item = state.categories.find((x) => x.id === id);
        if (item) fillCategoryForm(item);
      });
    });
  };

  const renderProductCategorias = (preselectedCategoryId = null) => {
    const select = qs('#prod-categoria');
    if (!select) return;
    const linea = (formProducto && formProducto.linea && formProducto.linea.value) ? formProducto.linea.value : 'piscina';
    const activeCategories = state.categories.filter((c) => c.activo && c.linea === linea);
    const pending = state.productCategoriaPendiente != null ? String(state.productCategoriaPendiente) : '';
    const current = preselectedCategoryId != null ? String(preselectedCategoryId) : (select.value || pending);
    select.innerHTML = '<option value="">Selecciona una categoría</option>' + activeCategories
      .map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`)
      .join('');
    if (current) {
      select.value = current;
      if (select.value === current) state.productCategoriaPendiente = null;
    }
  };
  window._renderProductCategorias = renderProductCategorias;

  const getSelectedCategory = () => {
    const select = qs('#prod-categoria');
    if (!select || !select.value) return null;
    const id = Number(select.value);
    return state.categories.find((c) => c.id === id) || null;
  };

  const renderProductCamposTecnicos = () => {
    const root = qs('#prodCamposTecnicosContainer');
    if (!root) return;
    const category = getSelectedCategory();
    if (!category) {
      root.innerHTML = '<p class="admin-form-hint">Selecciona una categoría para cargar campos técnicos.</p>';
      return;
    }
    const fields = category.campos_tecnicos || [];
    if (!fields.length) {
      root.innerHTML = '<p class="admin-form-hint">Esta categoría no tiene campos técnicos configurados.</p>';
      return;
    }
    root.innerHTML = fields.map((field) => {
      const value = state.productCamposTecnicos[field.id] ?? '';
      const req = field.obligatorio ? 'required' : '';
      if (field.tipo_dato === 'booleano') {
        return `
          <label class="admin-check"><input type="checkbox" class="prod-campo-tecnico" data-campo-id="${field.id}" ${value === true || value === 'true' ? 'checked' : ''}> ${escapeHtml(field.nombre)}</label>
        `;
      }
      if (field.tipo_dato === 'opcion') {
        const options = (field.opciones || []).map((opt) => `<option value="${escapeHtml(opt)}" ${String(value) === String(opt) ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('');
        return `
          <div class="admin-form-group">
            <label>${escapeHtml(field.nombre)}${field.unidad_medida ? ` (${escapeHtml(field.unidad_medida)})` : ''}</label>
            <select class="product-form-input prod-campo-tecnico" data-campo-id="${field.id}" ${req}>
              <option value="">Selecciona</option>
              ${options}
            </select>
          </div>
        `;
      }
      return `
        <div class="admin-form-group">
          <label>${escapeHtml(field.nombre)}${field.unidad_medida ? ` (${escapeHtml(field.unidad_medida)})` : ''}</label>
          <input class="product-form-input prod-campo-tecnico" data-campo-id="${field.id}" ${field.tipo_dato === 'numero' ? 'type="number" step="any"' : 'type="text"'} value="${escapeHtml(value)}" ${req}>
        </div>
      `;
    }).join('');

    root.querySelectorAll('.prod-campo-tecnico').forEach((input) => {
      const campoId = Number(input.dataset.campoId);
      const sync = () => {
        if (input.type === 'checkbox') {
          state.productCamposTecnicos[campoId] = !!input.checked;
        } else {
          state.productCamposTecnicos[campoId] = input.value;
        }
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
    });
  };
  window._renderProductCamposTecnicos = renderProductCamposTecnicos;

  // --- ESPECIFICACIONES TÉCNICAS DINÁMICAS ---
  const UNIDADES_POR_CATEGORIA = {
    'volumen': ['litros', 'galones', 'pies cúbicos', 'm³'],
    'flujo': ['GPM', 'L/min', 'L/h', 'm³/h'],
    'potencia': ['HP', 'Watts', 'kW'],
    'presion': ['PSI', 'bar', 'metros columna agua'],
    'electrico': ['voltios', 'Hz', 'amperios'],
    'tamaño': ['pulgadas', 'mm', 'cm', 'm'],
    'peso': ['kg', 'lb'],
    'micras': ['µm'],
    'porcentaje': ['%']
  };

  const SPEC_SECCIONES = [
    'Funciones',
    'Caracteristicas fisicas',
    'Informacion tecnica',
  ];

  const fetchCampoTecnicoSugerencias = async (query, tipo = '') => {
    const q = String(query || '').trim();
    if (!q || q.length < 2) return [];
    const params = new URLSearchParams({ q, limit: '12' });
    if (tipo) params.set('tipo', tipo);
    try {
      const data = await api(`/admin/api/campos-tecnicos/sugerencias?${params.toString()}`);
      return Array.isArray(data.data) ? data.data : [];
    } catch (_err) {
      return [];
    }
  };

  const renderProductEspecificacionesTecnicas = () => {
    const root = qs('#prodEspecificacionesTecnicasContainer');
    if (!root) return;

    const html = state.productEspecificacionesTecnicas.map((spec, idx) => {
      const tipoLabel = spec.tipo === 'cuantitativa' ? 'Cuantitativa' : 'Cualitativa';
      const seccionLabel = spec.seccion || 'Informacion tecnica';
      const valor = spec.tipo === 'cuantitativa' 
        ? `${spec.valor_numero || ''} ${spec.unidad || ''}`.trim()
        : spec.valor_texto || '';
      
      return `
        <div class="spec-row" data-spec-idx="${idx}" draggable="true">
          <div class="spec-row__drag-handle"><i class="fas fa-grip-vertical"></i></div>
          <div class="spec-row__content">
            <div class="spec-row__name">${escapeHtml(spec.nombre)}</div>
            <div class="spec-row__type">${tipoLabel} · ${escapeHtml(seccionLabel)}</div>
            <div class="spec-row__value">${escapeHtml(valor)}</div>
          </div>
          <button type="button" class="spec-row__edit" data-spec-edit="${idx}"><i class="fas fa-edit"></i></button>
          <button type="button" class="spec-row__delete" data-spec-del="${idx}"><i class="fas fa-trash"></i></button>
        </div>
      `;
    }).join('');

    root.innerHTML = html || '<p class="admin-form-hint">No hay especificaciones. Agrega la primera haciendo clic en "Agregar especificación".</p>';

    // Eventos de edición y eliminación
    qsa('[data-spec-edit]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const idx = Number(btn.dataset.specEdit);
        openSpecificationModal(idx);
      });
    });

    qsa('[data-spec-del]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const idx = Number(btn.dataset.specDel);
        state.productEspecificacionesTecnicas.splice(idx, 1);
        renderProductEspecificacionesTecnicas();
      });
    });

    // Drag and drop para reordenar
    const specRows = qsa('[data-spec-idx]');
    specRows.forEach(row => {
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', row.innerHTML);
        row.classList.add('dragging');
      });

      row.addEventListener('dragend', (e) => {
        row.classList.remove('dragging');
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const dragging = qs('[data-spec-idx].dragging');
        if (dragging && dragging !== row) {
          const allRows = qsa('[data-spec-idx]');
          const draggingIdx = Number(dragging.dataset.specIdx);
          const overIdx = Number(row.dataset.specIdx);
          if (draggingIdx < overIdx) {
            row.parentNode.insertBefore(dragging, row.nextSibling);
          } else {
            row.parentNode.insertBefore(dragging, row);
          }
        }
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const dragging = qs('[data-spec-idx].dragging');
        if (dragging) {
          const fromIdx = Number(dragging.dataset.specIdx);
          const toIdx = Number(row.dataset.specIdx);
          if (fromIdx !== toIdx) {
            const [spec] = state.productEspecificacionesTecnicas.splice(fromIdx, 1);
            state.productEspecificacionesTecnicas.splice(toIdx, 0, spec);
            renderProductEspecificacionesTecnicas();
          }
        }
      });
    });
  };
  window._renderProductEspecificacionesTecnicas = renderProductEspecificacionesTecnicas;

  const openSpecificationModal = (editIdx = null) => {
    const spec = editIdx !== null ? state.productEspecificacionesTecnicas[editIdx] : null;
    const isEdit = editIdx !== null;

    const modalHtml = `
      <div class="modal-overlay" id="specModal">
        <div class="modal-content">
          <div class="modal-header">
            <h3>${isEdit ? 'Editar especificación' : 'Nueva especificación técnica'}</h3>
            <button type="button" class="modal-close"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-body">
            <div class="admin-form-group">
              <label for="specName">Nombre del campo *</label>
              <input id="specName" type="text" list="specNameSuggestions" class="product-form-input" placeholder="Ej: Capacidad, Caudal, Voltaje" value="${escapeHtml(spec?.nombre || '')}">
              <datalist id="specNameSuggestions"></datalist>
              <span class="product-form-hint" id="specSuggestionHint"></span>
            </div>
            <div class="admin-form-group">
              <label for="specType">Tipo *</label>
              <select id="specType" class="product-form-input">
                <option value="cualitativa" ${spec?.tipo === 'cualitativa' ? 'selected' : ''}>Cualitativa (texto)</option>
                <option value="cuantitativa" ${spec?.tipo === 'cuantitativa' ? 'selected' : ''}>Cuantitativa (número + unidad)</option>
              </select>
            </div>
            <div class="admin-form-group">
              <label for="specSeccion">Seccion *</label>
              <select id="specSeccion" class="product-form-input">
                ${SPEC_SECCIONES.map((sec) => `<option value="${sec}" ${(spec?.seccion || 'Informacion tecnica') === sec ? 'selected' : ''}>${sec}</option>`).join('')}
              </select>
            </div>
            <div id="specContentQualitativa" ${spec?.tipo !== 'cualitativa' ? 'hidden' : ''}>
              <div class="admin-form-group">
                <label for="specValorTexto">Valor (texto) *</label>
                <input id="specValorTexto" type="text" class="product-form-input" placeholder="Ej: Acero inoxidable 304, 1/2 NPT macho" value="${escapeHtml(spec?.valor_texto || '')}">
              </div>
            </div>
            <div id="specContentCuantitativa" ${spec?.tipo !== 'cuantitativa' ? 'hidden' : ''}>
              <div class="admin-form-2col">
                <div class="admin-form-group">
                  <label for="specValorNumero">Valor (número) *</label>
                  <input id="specValorNumero" type="number" step="any" class="product-form-input" placeholder="Ej: 61" value="${spec?.valor_numero || ''}">
                </div>
                <div class="admin-form-group">
                  <label for="specUnidad">Unidad *</label>
                  <select id="specUnidad" class="product-form-input">
                    <option value="">Selecciona categoría</option>
                    ${Object.keys(UNIDADES_POR_CATEGORIA).map(cat => `<optgroup label="📊 ${cat.charAt(0).toUpperCase() + cat.slice(1)}">${UNIDADES_POR_CATEGORIA[cat].map(u => `<option value="${u}" ${spec?.unidad === u ? 'selected' : ''}>${u}</option>`).join('')}</optgroup>`).join('')}
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="admin-btn admin-btn--secondary modal-cancel">Cancelar</button>
            <button type="button" class="admin-btn modal-save">${isEdit ? 'Guardar cambios' : 'Agregar especificación'}</button>
          </div>
        </div>
      </div>
    `;

    const container = document.body;
    const existingModal = qs('#specModal');
    if (existingModal) existingModal.remove();
    
    container.insertAdjacentHTML('beforeend', modalHtml);
    const modal = qs('#specModal');
    const typeSelect = qs('#specType');
    const contentQual = qs('#specContentQualitativa');
    const contentCuant = qs('#specContentCuantitativa');
    const nameInput = qs('#specName');
    const suggestionList = qs('#specNameSuggestions');
    const suggestionHint = qs('#specSuggestionHint');
    let currentSuggestions = [];

    const refreshSuggestions = async () => {
      const tipo = qs('#specType')?.value || '';
      currentSuggestions = await fetchCampoTecnicoSugerencias(nameInput.value, tipo);
      if (!suggestionList) return;
      suggestionList.innerHTML = currentSuggestions.map((s) => `<option value="${escapeHtml(s.nombre)}"></option>`).join('');
    };

    const applyMatchedSuggestion = () => {
      const match = currentSuggestions.find((s) => String(s.nombre || '').toLowerCase() === String(nameInput.value || '').trim().toLowerCase());
      if (!match) {
        if (suggestionHint) suggestionHint.textContent = '';
        return null;
      }
      if (typeSelect) typeSelect.value = match.tipo || typeSelect.value;
      if (match.unidad_defecto && qs('#specUnidad') && !qs('#specUnidad').value) {
        qs('#specUnidad').value = match.unidad_defecto;
      }
      if (match.categoria_sugerida && qs('#specSeccion')) {
        qs('#specSeccion').value = match.categoria_sugerida;
      }
      if (suggestionHint) suggestionHint.textContent = `Reutilizando: ${match.nombre} (${match.veces_usado || 0} usos)`;
      return match;
    };

    typeSelect.addEventListener('change', () => {
      const isCuant = typeSelect.value === 'cuantitativa';
      contentQual.hidden = isCuant;
      contentCuant.hidden = !isCuant;
      refreshSuggestions();
    });

    nameInput.addEventListener('input', refreshSuggestions);
    nameInput.addEventListener('change', applyMatchedSuggestion);
    refreshSuggestions();
    applyMatchedSuggestion();

    qs('.modal-close').addEventListener('click', () => modal.remove());
    qs('.modal-cancel').addEventListener('click', () => modal.remove());

    qs('.modal-save').addEventListener('click', () => {
      const nombre = qs('#specName').value.trim();
      const tipo = qs('#specType').value;
      const seccion = qs('#specSeccion').value || 'Informacion tecnica';
      const matched = applyMatchedSuggestion();
      
      if (!nombre) {
        alert('El nombre es obligatorio');
        return;
      }

      if (tipo === 'cualitativa') {
        const valor_texto = qs('#specValorTexto').value.trim();
        if (!valor_texto) {
          alert('El valor es obligatorio');
          return;
        }
        const newSpec = {
          nombre,
          tipo,
          seccion,
          campo_tecnico_id: matched ? matched.id : null,
          categoria_sugerida: seccion,
          valor_texto,
        };
        if (isEdit) {
          state.productEspecificacionesTecnicas[editIdx] = newSpec;
        } else {
          state.productEspecificacionesTecnicas.push(newSpec);
        }
      } else {
        const valor_numero = qs('#specValorNumero').value.trim();
        const unidad = qs('#specUnidad').value.trim();
        if (!valor_numero || !unidad) {
          alert('El valor y la unidad son obligatorios');
          return;
        }
        const newSpec = {
          nombre,
          tipo,
          seccion,
          campo_tecnico_id: matched ? matched.id : null,
          categoria_sugerida: seccion,
          valor_numero: parseFloat(valor_numero),
          unidad,
        };
        if (isEdit) {
          state.productEspecificacionesTecnicas[editIdx] = newSpec;
        } else {
          state.productEspecificacionesTecnicas.push(newSpec);
        }
      }

      modal.remove();
      renderProductEspecificacionesTecnicas();
    });
  };

  const showAddSpecificationButton = () => {
    const container = qs('#prodEspecificacionesTecnicasContainer');
    if (!container) return;
    const existingBtn = container?.querySelector('.spec-add-btn-anchor');
    if (!existingBtn) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.add('admin-mini-btn', 'spec-add-btn-anchor');
      btn.innerHTML = '<i class="fas fa-plus"></i> Agregar especificación';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openSpecificationModal();
      });
      container.insertAdjacentElement('afterend', btn);
    }
  };

  // ---/ESPECIFICACIONES TÉCNICAS DINÁMICAS ---

  const renderChipList = (rootSelector, items, onDelete) => {
    const root = qs(rootSelector);
    if (!root) return;
    root.innerHTML = items.map((value, idx) => `
      <span class="product-chip">${escapeHtml(value)} <button type="button" data-chip-del="${idx}"><i class="fas fa-times"></i></button></span>
    `).join('');
    root.querySelectorAll('[data-chip-del]').forEach((btn) => {
      btn.addEventListener('click', () => onDelete(Number(btn.dataset.chipDel)));
    });
  };

  const renderProductCaracteristicas = () => {
    renderChipList('#prodCaracteristicasList', state.productCaracteristicas, (idx) => {
      state.productCaracteristicas.splice(idx, 1);
      renderProductCaracteristicas();
    });
  };
  window._renderProductCaracteristicas = renderProductCaracteristicas;

  const renderProductKit = () => {
    renderChipList('#prodKitList', state.productKit, (idx) => {
      state.productKit.splice(idx, 1);
      renderProductKit();
    });
  };
  window._renderProductKit = renderProductKit;

  const renderProductRecomendados = () => {
    const selected = state.products
      .filter((p) => state.productRecomendados.includes(p.id))
      .map((p) => `${p.nombre} (${p.slug})`);
    renderChipList('#prodRecomendadoSeleccionados', selected, (idx) => {
      const selectedProduct = state.products.filter((p) => state.productRecomendados.includes(p.id))[idx];
      if (!selectedProduct) return;
      state.productRecomendados = state.productRecomendados.filter((id) => id !== selectedProduct.id);
      renderProductRecomendados();
      renderProductRecomendadoResultados();
    });
  };
  window._renderProductRecomendados = renderProductRecomendados;

  const renderProductRecomendadoResultados = () => {
    const root = qs('#prodRecomendadoResultados');
    const search = (qs('#prodRecomendadoSearch')?.value || '').toLowerCase().trim();
    if (!root) return;
    const currentId = state.editingProductId;
    const items = state.products
      .filter((p) => !currentId || p.id !== currentId)
      .filter((p) => !search || p.nombre.toLowerCase().includes(search) || (p.slug || '').toLowerCase().includes(search))
      .slice(0, 25);
    root.innerHTML = items.map((p) => `
      <button type="button" class="product-reco-item ${state.productRecomendados.includes(p.id) ? 'selected' : ''}" data-reco-id="${p.id}">
        <span>${escapeHtml(p.nombre)}</span>
        <small>${escapeHtml(p.slug || '')}</small>
      </button>
    `).join('');
    root.querySelectorAll('[data-reco-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.recoId);
        if (state.productRecomendados.includes(id)) {
          state.productRecomendados = state.productRecomendados.filter((x) => x !== id);
        } else {
          state.productRecomendados.push(id);
        }
        renderProductRecomendados();
        renderProductRecomendadoResultados();
      });
    });
  };

  const renderProductImagenesActuales = (imagenes) => {
    const root = qs('#prodImagenesAdicionalesActuales');
    if (!root) return;
    root.innerHTML = (imagenes || []).map((img) => `
      <span class="product-chip ${state.productImagenesAdicionalesEliminar.includes(img.id) ? 'remove' : ''}">
        Img #${img.id}
        <button type="button" data-remove-img="${img.id}"><i class="fas fa-trash"></i></button>
      </span>
    `).join('');
    root.querySelectorAll('[data-remove-img]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.removeImg);
        if (state.productImagenesAdicionalesEliminar.includes(id)) {
          state.productImagenesAdicionalesEliminar = state.productImagenesAdicionalesEliminar.filter((x) => x !== id);
        } else {
          state.productImagenesAdicionalesEliminar.push(id);
        }
        renderProductImagenesActuales(imagenes);
      });
    });
  };
  window._renderProductImagenesActuales = renderProductImagenesActuales;

  const loadCategorias = async () => {
    const data = await api('/admin/api/categorias');
    state.categories = data.data || [];
    renderCategoriasList(state.categories);
    renderProductCategorias();
    renderProductCamposTecnicos();
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

    const clearMissingMarks = () => {
      formProducto.querySelectorAll('.product-field-missing').forEach((el) => {
        el.classList.remove('product-field-missing');
      });
    };

    const isEmptyRequired = (field) => {
      if (!field || field.disabled) return false;
      if (field.type === 'checkbox' || field.type === 'radio') return !field.checked;
      return !(String(field.value || '').trim());
    };

    const markMissingField = (field) => {
      const target = field.closest('.product-form-stock-wrap') || field;
      target.classList.add('product-field-missing');
    };

    const validateProductPanelRequired = (panel) => {
      if (!panel) return { valid: true, missing: [] };
      const requiredFields = Array.from(panel.querySelectorAll('[required]'));
      const missing = requiredFields.filter((field) => isEmptyRequired(field));
      return { valid: missing.length === 0, missing };
    };

    const validateCurrentProductStep = () => {
      const panel = formProducto.querySelector(`.product-form-panel[data-step-panel="${state.productFormStep}"]`);
      clearMissingMarks();
      const result = validateProductPanelRequired(panel);
      if (!result.valid) {
        result.missing.forEach(markMissingField);
        const first = result.missing[0];
        if (first && typeof first.focus === 'function') first.focus();
        showMsg('error', 'Faltan datos obligatorios del producto por completar. Revisa los campos marcados en rojo.');
      }
      return result.valid;
    };

    const validateAllProductSteps = () => {
      clearMissingMarks();
      const panelsByStep = [1, 2, 3].map((step) => ({
        step,
        panel: formProducto.querySelector(`.product-form-panel[data-step-panel="${step}"]`),
      }));
      const firstInvalid = panelsByStep
        .map(({ step, panel }) => ({ step, ...validateProductPanelRequired(panel) }))
        .find((result) => !result.valid);

      if (!firstInvalid) return true;

      firstInvalid.missing.forEach(markMissingField);
      window._goProductFormStep(firstInvalid.step);
      const first = firstInvalid.missing[0];
      if (first && typeof first.focus === 'function') first.focus();
      showMsg('error', 'No se puede guardar: faltan datos obligatorios del producto. Revisa los campos marcados en rojo.');
      return false;
    };

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
      renderProductCategorias();
      renderProductCamposTecnicos();
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
        if (state.productFormStep < 3 && validateCurrentProductStep()) {
          window._goProductFormStep(state.productFormStep + 1);
        }
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

    formProducto.addEventListener('input', (event) => {
      const target = event.target;
      if (!target || !target.matches || !target.matches('[required]')) return;
      const missingMarkTarget = target.closest('.product-form-stock-wrap') || target;
      if (!isEmptyRequired(target)) missingMarkTarget.classList.remove('product-field-missing');
    });

    formProducto.addEventListener('change', (event) => {
      const target = event.target;
      if (!target || !target.matches || !target.matches('[required]')) return;
      const missingMarkTarget = target.closest('.product-form-stock-wrap') || target;
      if (!isEmptyRequired(target)) missingMarkTarget.classList.remove('product-field-missing');
    });

    window._validateAllProductSteps = validateAllProductSteps;
  })();

  if (formCategoria) {
    const catNombre = qs('#cat-nombre');
    const catSlug = qs('#cat-slug');
    const btnAddCampo = qs('#btnAddCampoTecnico');
    if (catNombre && catSlug) {
      catNombre.addEventListener('input', () => {
        if (!(catSlug.value || '').trim()) catSlug.value = slugify(catNombre.value);
      });
    }
    if (btnAddCampo) {
      btnAddCampo.addEventListener('click', () => {
        state.categoryFieldDrafts.push({
          nombre: '',
          slug: '',
          tipo_dato: 'texto',
          unidad_medida: '',
          obligatorio: false,
          opciones: [],
          orden: state.categoryFieldDrafts.length,
        });
        renderCategoryFieldDrafts();
      });
    }
    renderCategoryFieldDrafts();
  }

  const prodCategoria = qs('#prod-categoria');
  if (prodCategoria) {
    prodCategoria.addEventListener('change', () => {
      state.productCategoriaPendiente = null;
      state.productCamposTecnicos = {};
      renderProductCamposTecnicos();
    });
  }

  const btnNuevaCategoriaRapida = qs('#btnNuevaCategoriaRapida');
  if (btnNuevaCategoriaRapida) {
    btnNuevaCategoriaRapida.addEventListener('click', () => {
      activateTab('categorias');
      const catLinea = qs('#cat-linea');
      if (catLinea && formProducto && formProducto.linea) catLinea.value = formProducto.linea.value || 'piscina';
      showMsg('success', 'Crea la categoría y luego vuelve a la pestaña Productos para seleccionarla.');
    });
  }

  const btnCancelEditProducto = qs('#btnCancelEditProducto');
  if (btnCancelEditProducto) {
    btnCancelEditProducto.addEventListener('click', () => {
      resetProductForm();
      showMsg('success', 'Formulario reiniciado para crear un nuevo producto.');
    });
  }

  const bindAddChipInput = (inputSelector, buttonSelector, targetStateKey, renderFn) => {
    const input = qs(inputSelector);
    const button = qs(buttonSelector);
    if (!input || !button) return;
    const add = () => {
      const text = (input.value || '').trim();
      if (!text) return;
      state[targetStateKey].push(text);
      input.value = '';
      renderFn();
    };
    button.addEventListener('click', add);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        add();
      }
    });
  };

  bindAddChipInput('#prodCaracteristicaInput', '#btnAddCaracteristica', 'productCaracteristicas', renderProductCaracteristicas);
  bindAddChipInput('#prodKitInput', '#btnAddKit', 'productKit', renderProductKit);

  // Event listener para agregar especificaciones técnicas
  const btnAddEspecificacion = qs('#btnAddEspecificacion');
  if (btnAddEspecificacion) {
    btnAddEspecificacion.addEventListener('click', (e) => {
      e.preventDefault();
      openSpecificationModal();
    });
  }

  renderProductCaracteristicas();
  renderProductKit();
  renderProductRecomendados();
  renderProductEspecificacionesTecnicas();

  const recoSearch = qs('#prodRecomendadoSearch');
  if (recoSearch) recoSearch.addEventListener('input', () => renderProductRecomendadoResultados());

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
    
    const initQuoteBuilder = (id, c) => {
      const qb = qs(`#response-area-${id}`);
      if (!qb) return;

      const linesBody = qs(`#qb-body-${id}`);
      const btnAdd = qs(`.qb-btn-add[data-id="${id}"]`);
      const subtotalEl = qs(`#qb-subtotal-${id}`);
      const ivaTypeEl = qs(`#qb-iva-type-${id}`);
      const ivaValEl = qs(`#qb-iva-val-${id}`);
      const totalEl = qs(`#qb-total-${id}`);
      const previewSheet = qs(`#qb-preview-sheet-${id}`);
      
      let state = {
        lineas: [],
        subtotal: 0,
        iva_porcentaje: 0,
        iva_valor: 0,
        total: 0
      };

      const calculate = () => {
        state.subtotal = state.lineas.reduce((acc, l) => acc + l.subtotal, 0);
        state.iva_porcentaje = parseFloat(ivaTypeEl.value);
        state.iva_valor = state.subtotal * state.iva_porcentaje;
        state.total = state.subtotal + state.iva_valor;

        subtotalEl.textContent = fmtCop(state.subtotal);
        ivaValEl.textContent = fmtCop(state.iva_valor);
        totalEl.textContent = fmtCop(state.total);

        updatePreview();
      };

      const updatePreview = (() => {
        let timeout;
        return () => {
          clearTimeout(timeout);
          timeout = setTimeout(() => {
            const validez = qs(`#qb-validez-${id}`).value;
            const pago = qs(`#qb-pago-${id}`).value;
            const moneda = qs(`#qb-moneda-${id}`).value;
            const notas = qs(`#qb-notas-${id}`).value;
            const fecha = new Date().toLocaleDateString('es-CO');
            const year = new Date().getFullYear();
            const cotNum = `COT-${year}-${String(id).padStart(4, '0')}`;
            
            const html = `
              <div style="font-family: 'Barlow', Arial, sans-serif; max-width: 800px; padding: 40px; background: #fff; color: #1e3344; line-height: 1.5;">
                <!-- Header -->
                <div style="display:flex; justify-content:space-between; border-bottom: 3px solid #0F5A5F; padding-bottom: 16px; margin-bottom: 24px;">
                  <div>
                    <div style="font-size:20px; font-weight:700; color:#0F5A5F;">Etiquetar Colombia S.A.S.</div>
                    <div style="font-size:12px; color:#647d8e;">NIT: 900.XXX.XXX-X · Barranquilla, Colombia</div>
                    <div style="font-size:12px; color:#647d8e;">comercial@etiquetar.com</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-size:11px; color:#647d8e; text-transform:uppercase; letter-spacing:1px;">Cotización</div>
                    <div style="font-size:18px; font-weight:700; color: #1e3344;">#${cotNum}</div>
                    <div style="font-size:12px; color:#647d8e;">${fecha}</div>
                    <div style="font-size:12px; color:#647d8e;">Válida por ${validez} días</div>
                  </div>
                </div>

                <!-- Info Cliente y Detalles -->
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px;">
                  <div>
                    <h4 style="margin: 0 0 8px; font-size: 11px; text-transform: uppercase; color: #0F5A5F; letter-spacing: 0.5px;">Cliente</h4>
                    <div style="font-weight: 700; font-size: 14px;">${c.nombre}</div>
                    ${c.empresa ? `<div style="font-size: 13px; color: #4a5568;">${c.empresa}</div>` : ''}
                    <div style="font-size: 13px; color: #4a5568;">${c.email}</div>
                    <div style="font-size: 13px; color: #4a5568;">${c.telefono || ''}</div>
                    <div style="font-size: 13px; color: #4a5568;">${c.ciudad || ''}</div>
                  </div>
                  <div style="text-align: right;">
                    <h4 style="margin: 0 0 8px; font-size: 11px; text-transform: uppercase; color: #0F5A5F; letter-spacing: 0.5px;">Detalles</h4>
                    <div style="font-size: 13px; color: #4a5568;"><strong>Línea:</strong> ${finalData.linea === 'piscina' ? 'Piscina & Spa' : 'Tratamiento de Agua'}</div>
                    <div style="font-size: 13px; color: #4a5568;"><strong>Solicitud:</strong> ${tipoSolicitudFormatted || 'Cotización de productos'}</div>
                    <div style="font-size: 13px; color: #4a5568;"><strong>Forma de pago:</strong> ${pago}</div>
                    <div style="font-size: 13px; color: #4a5568;"><strong>Moneda:</strong> ${moneda}</div>
                    <div style="font-size: 13px; color: #4a5568;"><strong>Asesor:</strong> Administrador</div>
                  </div>
                </div>

                <!-- Tabla Productos -->
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 13px;">
                  <thead>
                    <tr style="background: #E6F1FB; color: #0C447C;">
                      <th style="padding: 10px; text-align: left; border-bottom: 2px solid #0F5A5F; width: 40px;">#</th>
                      <th style="padding: 10px; text-align: left; border-bottom: 2px solid #0F5A5F;">Descripción</th>
                      <th style="padding: 10px; text-align: center; border-bottom: 2px solid #0F5A5F; width: 60px;">Cant.</th>
                      <th style="padding: 10px; text-align: right; border-bottom: 2px solid #0F5A5F; width: 100px;">Unitario</th>
                      <th style="padding: 10px; text-align: right; border-bottom: 2px solid #0F5A5F; width: 110px;">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${state.lineas.map((l, idx) => `
                      <tr style="background: ${idx % 2 === 0 ? '#fff' : '#F8FBFE'};">
                        <td style="padding: 10px; border-bottom: 1px solid #edf2f7;">${idx + 1}</td>
                        <td style="padding: 10px; border-bottom: 1px solid #edf2f7;">${l.descripcion || '—'}</td>
                        <td style="padding: 10px; border-bottom: 1px solid #edf2f7; text-align: center;">${l.cantidad}</td>
                        <td style="padding: 10px; border-bottom: 1px solid #edf2f7; text-align: right;">${fmtCop(l.precio_unitario)}</td>
                        <td style="padding: 10px; border-bottom: 1px solid #edf2f7; text-align: right; font-weight: 600;">${fmtCop(l.subtotal)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>

                <!-- Totales -->
                <div style="display: flex; justify-content: flex-end; margin-bottom: 30px;">
                  <div style="width: 220px; font-size: 14px;">
                    <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #647d8e;">
                      <span>Subtotal:</span>
                      <span>${fmtCop(state.subtotal)}</span>
                    </div>
                    ${state.iva_valor > 0 ? `
                      <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #647d8e;">
                        <span>IVA (${state.iva_porcentaje * 100}%):</span>
                        <span>${fmtCop(state.iva_valor)}</span>
                      </div>
                    ` : ''}
                    <div style="display: flex; justify-content: space-between; padding: 10px 0; border-top: 2px solid #1e3344; margin-top: 6px; font-weight: 800; font-size: 18px; color: #0F5A5F;">
                      <span>TOTAL:</span>
                      <span>${fmtCop(state.total)}</span>
                    </div>
                  </div>
                </div>

                <!-- Notas -->
                ${notas ? `
                  <div style="margin-bottom: 30px; padding: 15px; background: #F8FBFE; border-left: 4px solid #0F5A5F; border-radius: 4px;">
                    <h4 style="margin: 0 0 8px; font-size: 11px; text-transform: uppercase; color: #0F5A5F; letter-spacing: 0.5px;">Notas y Condiciones</h4>
                    <div style="font-size: 12px; color: #4a5568; white-space: pre-wrap;">${notas}</div>
                  </div>
                ` : ''}

                <!-- Footer -->
                <div style="border-top: 1px solid #edf2f7; padding-top: 20px; text-align: center; font-size: 11px; color: #94a3b8;">
                  <p style="margin: 0 0 5px;">Esta cotización es válida por ${validez} días. Para aceptar, responda este correo o contáctenos al +57XXXXXXXXXX.</p>
                  <p style="margin: 0; font-weight: 600; color: #647d8e;">Etiquetar Colombia S.A.S. — Soluciones Integrales en Agua y Piscinas</p>
                </div>
              </div>
            `;
            previewSheet.innerHTML = html;
          }, 400);
        };
      })();

      const addLine = (descripcion = '', cantidad = 1, precio = 0) => {
        const lineId = Date.now() + Math.random();
        const tr = document.createElement('tr');
        tr.dataset.lineId = lineId;
        tr.innerHTML = `
          <td><input type="text" class="qb-input qb-desc" value="${descripcion}" placeholder="Nombre del producto..."></td>
          <td><input type="number" class="qb-input qb-cant" value="${cantidad}" min="1"></td>
          <td><input type="text" class="qb-input qb-price" value="${precio ? fmtCop(precio) : ''}" placeholder="$ 0"></td>
          <td class="qb-subtotal-row">$ 0</td>
          <td style="text-align:center;"><button class="qb-btn-remove"><i class="fas fa-trash"></i></button></td>
        `;

        const lineObj = { id: lineId, descripcion, cantidad, precio_unitario: precio, subtotal: cantidad * precio };
        state.lineas.push(lineObj);

        const inputDesc = tr.querySelector('.qb-desc');
        const inputCant = tr.querySelector('.qb-cant');
        const inputPrice = tr.querySelector('.qb-price');
        const subtotalCell = tr.querySelector('.qb-subtotal-row');
        const btnRemove = tr.querySelector('.qb-btn-remove');

        const updateRow = () => {
          lineObj.descripcion = inputDesc.value;
          lineObj.cantidad = parseInt(inputCant.value) || 0;
          lineObj.precio_unitario = parseFloat(parseCop(inputPrice.value)) || 0;
          lineObj.subtotal = lineObj.cantidad * lineObj.precio_unitario;
          subtotalCell.textContent = fmtCop(lineObj.subtotal);
          calculate();
        };

        inputDesc.addEventListener('input', updateRow);
        inputCant.addEventListener('input', updateRow);
        inputPrice.addEventListener('input', updateRow);
        inputPrice.addEventListener('blur', () => {
          const val = parseCop(inputPrice.value);
          inputPrice.value = val ? fmtCop(val) : '';
          updateRow();
        });

        btnRemove.addEventListener('click', () => {
          tr.remove();
          state.lineas = state.lineas.filter(l => l.id !== lineId);
          calculate();
        });

        linesBody.appendChild(tr);
        updateRow();
      };

      btnAdd.addEventListener('click', () => addLine());
      ivaTypeEl.addEventListener('change', calculate);
      
      // Selects listeners for preview
      ['validez', 'pago', 'moneda', 'notas'].forEach(field => {
        qs(`#qb-${field}-${id}`).addEventListener('input', updatePreview);
      });

      // Tabs
      qb.querySelectorAll('.qb-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          qb.querySelectorAll('.qb-tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const panelId = btn.dataset.qbTab === 'build' ? `qb-panel-build-${id}` : `qb-panel-preview-${id}`;
          qb.querySelectorAll('.qb-panel').forEach(p => p.classList.remove('active'));
          qs(`#${panelId}`).classList.add('active');
          if (btn.dataset.qbTab === 'preview') updatePreview();
        });
      });

      // Submit Actions
      const getPayload = () => ({
        lineas: state.lineas.map(({descripcion, cantidad, precio_unitario, subtotal}) => ({descripcion, cantidad, precio_unitario, subtotal})),
        subtotal: state.subtotal,
        iva_porcentaje: state.iva_porcentaje,
        iva_valor: state.iva_valor,
        total: state.total,
        validez_dias: parseInt(qs(`#qb-validez-${id}`).value),
        forma_pago: qs(`#qb-pago-${id}`).value,
        moneda: qs(`#qb-moneda-${id}`).value,
        notas: qs(`#qb-notas-${id}`).value
      });

      qs(`[data-qb-send="${id}"]`).addEventListener('click', async () => {
        if (!state.lineas.length) return alert('Agrega al menos una línea');
        try {
          const payload = { ...getPayload(), enviar_correo: true, enviar_whatsapp: false };
          await api(`/admin/api/cotizaciones/${id}/cotizar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          showMsg('success', 'Cotización generada y enviada con éxito');
          loadCotizaciones();
        } catch (err) { showMsg('error', err.message); }
      });

      qs(`[data-qb-wa="${id}"]`).addEventListener('click', () => {
        if (!c.telefono) return alert('El cliente no tiene teléfono registrado. Ingrésalo manualmente.');
        if (!state.lineas.length) return alert('Agrega al menos una línea');
        
        const payload = getPayload();
        const year = new Date().getFullYear();
        const msg = `Hola ${c.nombre}, le enviamos la cotización #COT-${year}-${id} de Etiquetar Colombia.\n\n` +
                    `Resumen:\n` +
                    state.lineas.map(l => `• ${l.descripcion} x${l.cantidad}: ${fmtCop(l.subtotal)}`).join('\n') +
                    `\n\nTotal: ${fmtCop(state.total)}\n` +
                    `Válida por ${payload.validez_dias} días.\n\n` +
                    `Para más información: comercial@etiquetar.com`;
        
        window.open(`https://wa.me/57${c.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
      });

      qs(`[data-qb-draft="${id}"]`).addEventListener('click', async () => {
        try {
          const payload = { ...getPayload(), enviar_correo: false, enviar_whatsapp: false, borrador: true };
          await api(`/admin/api/cotizaciones/${id}/cotizar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          showMsg('success', 'Borrador guardado');
        } catch (err) { showMsg('error', err.message); }
      });

      // Default line if empty
      if (!state.lineas.length) addLine();
    };

    const parseOldMessage = (msg) => {
      const keywords = ['LÍNEA:', 'TIPO:', 'TIPO DE SOLICITUD:', 'REQUERIMIENTO:', 'INFO:', 'INFORMACIÓN ADICIONAL:'];
      const hasKeywords = keywords.some(k => msg.toUpperCase().includes(k));
      if (!hasKeywords) return null;

      const result = {};
      const lineRegex = /Línea:\s*(piscina|agua)/i;
      const typeRegex = /(?:Tipo de solicitud|Tipo):\s*([\w\s]+?)(?=\s+REQUERIMIENTO:|$)/i;
      const reqRegex = /Requerimiento:\s*(.*)/i;
      const infoRegex = /(?:Información adicional|Info):\s*(.*)/i;

      let remainingMsg = msg;

      const lineMatch = remainingMsg.match(lineRegex);
      if (lineMatch) {
        result.linea = lineMatch[1].toLowerCase();
        remainingMsg = remainingMsg.replace(lineRegex, '');
      }

      const typeMatch = remainingMsg.match(typeRegex);
      if (typeMatch) {
        result.tipo_solicitud = typeMatch[1].trim();
        remainingMsg = remainingMsg.replace(typeRegex, '');
      }

      const infoMatch = remainingMsg.match(infoRegex);
      if (infoMatch) {
        result.info_adicional = infoMatch[1].trim();
        remainingMsg = remainingMsg.replace(infoRegex, '');
      }

      const reqMatch = remainingMsg.match(reqRegex);
      if (reqMatch) {
        result.mensaje = reqMatch[1].trim();
      } else {
        result.mensaje = remainingMsg.trim();
      }

      return result;
    };

    renderList('#cotizacionesList', data.data, (c) => {
      let parsedData = parseOldMessage(c.mensaje || '');
      let finalData = { ...c };
      if (parsedData) {
        finalData = { ...c, ...parsedData };
      }

      const showPrice = !['consulta_tecnica', 'mantenimiento'].includes(finalData.tipo_solicitud);
      const tipoSolicitudFormatted = (finalData.tipo_solicitud || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      return `
        <div class="admin-item">
          <div class="admin-item__row">
            <strong>${finalData.nombre}</strong>
            <span class="admin-badge admin-badge--${finalData.estado === 'respondida' ? 'activo' : (finalData.estado === 'descartada' ? 'inactivo' : 'piscina')}">${finalData.estado.toUpperCase()}</span>
          </div>
          
          <div class="admin-meta-text" style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 12px;">
            <span><i class="fas fa-envelope"></i> ${finalData.email}</span>
            ${finalData.telefono ? `<span><i class="fas fa-phone"></i> ${finalData.telefono}</span>` : ''}
            ${finalData.ciudad ? `<span><i class="fas fa-map-marker-alt"></i> ${finalData.ciudad}</span>` : ''}
            ${finalData.empresa ? `<span><i class="fas fa-building"></i> ${finalData.empresa}</span>` : ''}
          </div>

          <div style="margin-top: 4px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
            ${finalData.linea ? `<span class="admin-badge admin-badge--${finalData.linea}">${finalData.linea === 'piscina' ? 'Piscina & Spa' : 'Tratamiento de Agua'}</span>` : ''}
            ${tipoSolicitudFormatted ? `<span class="admin-badge admin-badge--inactivo" style="background:#e5e7eb; color:#4b5563;">${tipoSolicitudFormatted}</span>` : ''}
          </div>

          <div class="admin-meta-text" style="margin-top: 8px;" title="${fmtDateTime(finalData.created_at)}">
            <i class="fas fa-calendar-alt"></i> Recibida: ${timeAgo(finalData.created_at)}
            ${finalData.responded_at ? ` | <i class="fas fa-check-double"></i> Respondida: <span title="${fmtDateTime(finalData.responded_at)}">${timeAgo(finalData.responded_at)}</span>` : ''}
          </div>
          
          <div style="margin: 12px 0; padding: 10px; background: #fff; border-left: 4px solid #0077B6; border-radius: 4px; font-size: 0.9rem; color: #333;">
            <strong style="display:block; margin-bottom:4px; font-size:0.8rem; color: #666;">MENSAJE DEL CLIENTE:</strong>
            ${finalData.mensaje || 'Sin mensaje'}
            ${(finalData.info_adicional || finalData.informacion_adicional) ? `<div style="margin-top:10px; padding-top:10px; border-top: 1px dashed #ccc;"><strong style="font-size:0.8rem; color: #666;">INFORMACIÓN ADICIONAL:</strong><br>${finalData.info_adicional || finalData.informacion_adicional}</div>` : ''}
          </div>

          <div class="admin-inline-actions" style="justify-content: flex-end;">
              <button class="admin-mini-btn" data-toggle-response="${finalData.id}">Responder ▼</button>
          </div>

          <div id="response-area-${finalData.id}" class="quote-builder" style="display: none;">
            <div class="qb-tabs">
              <button class="qb-tab-btn active" data-qb-tab="build" data-id="${finalData.id}">Armar cotización</button>
              <button class="qb-tab-btn" data-qb-tab="preview" data-id="${finalData.id}">Vista previa</button>
            </div>

            <div class="qb-content">
              <!-- Panel Armar -->
              <div id="qb-panel-build-${finalData.id}" class="qb-panel active">
                <div class="qb-table-wrap">
                  <table class="qb-table" id="qb-table-${finalData.id}">
                    <thead>
                      <tr>
                        <th style="width:40%">Descripción</th>
                        <th style="width:10%">Cant.</th>
                        <th style="width:20%">P. Unitario</th>
                        <th style="width:20%">Subtotal</th>
                        <th style="width:10%"></th>
                      </tr>
                    </thead>
                    <tbody id="qb-body-${finalData.id}">
                      <!-- Líneas dinámicas -->
                    </tbody>
                  </table>
                </div>
                
                <button class="qb-btn-add" data-id="${finalData.id}">＋ Agregar línea</button>

                <div class="qb-footer">
                  <div class="qb-totals">
                    <div class="qb-total-item">
                      <span>Subtotal:</span>
                      <span id="qb-subtotal-${finalData.id}">$ 0</span>
                    </div>
                    <div class="qb-total-item">
                      <select id="qb-iva-type-${finalData.id}" class="qb-input" style="width:auto; height:32px; padding:2px 8px !important;">
                        <option value="0">Sin IVA</option>
                        <option value="0.19">IVA 19%</option>
                        <option value="0.05">IVA 5%</option>
                      </select>
                      <span id="qb-iva-val-${finalData.id}">$ 0</span>
                    </div>
                    <div class="qb-total-item final">
                      <span>TOTAL:</span>
                      <span id="qb-total-${finalData.id}">$ 0</span>
                    </div>
                  </div>

                  <div class="qb-options-row">
                    <div class="admin-form-group">
                      <label>Validez</label>
                      <select id="qb-validez-${finalData.id}" class="qb-input">
                        <option value="15">15 días</option>
                        <option value="30" selected>30 días</option>
                        <option value="60">60 días</option>
                        <option value="90">90 días</option>
                      </select>
                    </div>
                    <div class="admin-form-group">
                      <label>Pago</label>
                      <select id="qb-pago-${finalData.id}" class="qb-input">
                        <option value="Contado" selected>Contado</option>
                        <option value="50% anticipo">50% anticipo</option>
                        <option value="Crédito 30 días">Crédito 30 días</option>
                        <option value="Crédito 60 días">Crédito 60 días</option>
                      </select>
                    </div>
                    <div class="admin-form-group">
                      <label>Moneda</label>
                      <select id="qb-moneda-${finalData.id}" class="qb-input">
                        <option value="COP" selected>COP</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                  </div>

                  <div class="admin-form-group">
                    <label>Notas y condiciones</label>
                    <textarea id="qb-notas-${finalData.id}" class="qb-input" rows="3" placeholder="Ej: Precios incluyen transporte. Garantía de 12 meses..."></textarea>
                  </div>

                  <div class="qb-actions">
                    <button class="qb-btn qb-btn--primary" data-qb-send="${finalData.id}">
                      <i class="fas fa-file-pdf"></i> Generar y enviar PDF
                    </button>
                    <button class="qb-btn qb-btn--whatsapp" data-qb-wa="${finalData.id}">
                      <i class="fab fa-whatsapp"></i> WhatsApp
                    </button>
                    <button class="qb-btn qb-btn--secondary" data-qb-draft="${finalData.id}">
                      Guardar borrador
                    </button>
                    <button class="qb-btn qb-btn--danger-outline" data-cotizacion-estado="${finalData.id}" data-estado="descartada">
                      Descartar cotización
                    </button>
                  </div>
                </div>
              </div>

              <!-- Panel Vista Previa -->
              <div id="qb-panel-preview-${finalData.id}" class="qb-panel">
                <div class="qb-preview-container">
                  <div class="qb-preview-sheet" id="qb-preview-sheet-${finalData.id}">
                    <!-- Render real-time HTML -->
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    });

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

    qsa('[data-toggle-response]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.toggleResponse;
        const area = qs(`#response-area-${id}`);
        const responderBtn = qs(`button[data-toggle-response="${id}"]:not([style*="margin-right"])`);
        
        if (area) {
          const isVisible = area.style.display !== 'none';
          area.style.display = isVisible ? 'none' : 'block';
          if(responderBtn) responderBtn.style.display = isVisible ? 'block' : 'none';
          
          // Inicializar constructor si se abre y no ha sido inicializado
          if (!isVisible && !area.dataset.initialized) {
            const cotizacion = data.data.find(item => item.id == id);
            initQuoteBuilder(id, cotizacion);
            area.dataset.initialized = 'true';
          }
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
        form.fecha_inicio.value = item.fecha_inicio ? item.fecha_inicio.substring(0, 16) : '';
        form.fecha_fin.value = item.fecha_fin ? item.fecha_fin.substring(0, 16) : '';
        
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
    renderProductRecomendadoResultados();
    renderProductRecomendados();

    // Poblar select de productos para promociones
    const selectPromo = qs('#selectProductoPromo');
    if (selectPromo) {
      selectPromo.innerHTML =
        '<option value="">-- Seleccionar producto --</option>' +
        state.products
          .map(p => `<option value="${p.id}">${p.nombre} (${fmtCop(p.precio)})</option>`)
          .join('');
    }

    const root = qs('#productosList');
    if (!root) return;

    if (!data.data.length) {
      root.innerHTML = '<div class="admin-item">Sin productos registrados</div>';
      return;
    }

    // ── Toolbar ──────────────────────────────────────────────
    const toolbarHTML = `
      <div class="ptable-toolbar">
        <div class="ptable-search">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3 3" stroke-linecap="round"/>
          </svg>
          <input type="text" id="ptableSearch" placeholder="Buscar producto...">
        </div>
        <div class="ptable-filters">
          <select id="ptableLinea">
            <option value="">Todas las líneas</option>
            <option value="piscina">Piscina & Spa</option>
            <option value="agua">Tratamiento de Agua</option>
          </select>
          <select id="ptableCategoria">
            <option value="">Todas las categorías</option>
            ${Array.from(new Set(data.data.map((p) => p.categoria_nombre).filter(Boolean))).sort().map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('')}
          </select>
          <select id="ptableEstado">
            <option value="">Todos los estados</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </select>
        </div>
        <span class="ptable-count" id="ptableCount">${data.data.length} productos</span>
      </div>
    `;

    // ── Tabla ─────────────────────────────────────────────────
    const tableHTML = `
      <div class="ptable-wrap">
        <table class="ptable" id="ptable">
          <thead>
            <tr>
              <th style="width:48px"></th>
              <th style="width:52px">Foto</th>
              <th>Producto</th>
              <th style="width:140px">Precio</th>
              <th style="width:100px">Línea</th>
              <th style="width:150px">Categoría</th>
              <th style="width:70px">Stock</th>
              <th style="width:90px">Estado</th>
              <th style="width:110px">Acciones</th>
            </tr>
          </thead>
          <tbody id="ptableBody"></tbody>
        </table>
      </div>
    `;

    root.innerHTML = toolbarHTML + tableHTML;

    // ── Render filas ──────────────────────────────────────────
    const renderRows = (products) => {
      const tbody = qs('#ptableBody');
      if (!products.length) {
        tbody.innerHTML = `
          <tr>
            <td colspan="9" class="ptable-empty">
              <div class="ptable-empty-inner">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                </svg>
                <span>Sin productos que coincidan</span>
              </div>
            </td>
          </tr>`;
        return;
      }

      tbody.innerHTML = products.map(p => `
        <tr class="ptable-row" data-id="${p.id}">
          <td>
            <input type="checkbox" class="ptable-cb" data-id="${p.id}">
          </td>
          <td>
            ${p.imagen_url
              ? `<img src="${p.imagen_url}" class="ptable-thumb" alt="${p.nombre}">`
              : `<div class="ptable-thumb-ph">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <path d="M21 15l-5-5L5 21"/>
                  </svg>
                </div>`
            }
          </td>
          <td>
            <div class="ptable-name">${p.nombre}</div>
            <div class="ptable-slug">${p.slug || '—'}</div>
            ${p.ficha_url
              ? `<a href="${p.ficha_url}" target="_blank" rel="noopener" class="ptable-ficha">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
                  </svg>
                  Ver ficha PDF
                </a>`
              : '<span class="ptable-no-ficha">Sin ficha técnica</span>'
            }
          </td>
          <td>
            <div class="ptable-price">${fmtCop(p.precio)}</div>
            ${p.precio_anterior != null
              ? `<div class="ptable-price-old">${fmtCop(p.precio_anterior)}</div>`
              : ''}
          </td>
          <td>
            <span class="ptable-badge ptable-badge--${p.linea}">
              ${p.linea === 'piscina' ? 'Piscina' : 'Agua'}
            </span>
          </td>
          <td>
            <span class="ptable-no-ficha">${escapeHtml(p.categoria_nombre || 'Sin categoría')}</span>
          </td>
          <td>
            <span class="ptable-stock ${p.stock <= 2 ? 'ptable-stock--low' : ''}">
              ${p.stock}
            </span>
          </td>
          <td>
            <span class="ptable-status ptable-status--${p.activo ? 'activo' : 'inactivo'}">
              <span class="ptable-dot"></span>
              ${p.activo ? 'Activo' : 'Inactivo'}
            </span>
          </td>
          <td>
            <div class="ptable-actions">
              <button class="ptable-btn" data-edit-product="${p.id}" title="Editar">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M11 2l3 3-9 9H2v-3L11 2z"/>
                </svg>
                Editar
              </button>
              <button class="ptable-btn ptable-btn--toggle ${p.activo ? 'ptable-btn--danger' : ''}"
                data-toggle-product="${p.id}" data-active="${p.activo ? '1' : '0'}"
                title="${p.activo ? 'Inactivar' : 'Activar'}">
                ${p.activo ? 'Inactivar' : 'Activar'}
              </button>
            </div>
          </td>
        </tr>
      `).join('');

      // Eventos editar
      qs('#ptableBody').querySelectorAll('[data-edit-product]').forEach(btn => {
        btn.addEventListener('click', () => {
          const product = state.products.find(item => item.id === Number(btn.dataset.editProduct));
          if (product) fillProductForm(product);
        });
      });

      // Eventos toggle estado
      qs('#ptableBody').querySelectorAll('[data-toggle-product]').forEach(btn => {
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

    // Render inicial
    renderRows(data.data);
    qs('#ptableCount').textContent = `${data.data.length} producto${data.data.length !== 1 ? 's' : ''}`;

    // ── Filtrado en tiempo real ───────────────────────────────
    const applyFilters = () => {
      const q = (qs('#ptableSearch').value || '').toLowerCase().trim();
      const linea = qs('#ptableLinea').value;
      const categoria = qs('#ptableCategoria').value;
      const estado = qs('#ptableEstado').value;

      const filtered = data.data.filter(p => {
        const matchQ = !q || p.nombre.toLowerCase().includes(q) || (p.slug || '').includes(q);
        const matchLinea = !linea || p.linea === linea;
        const matchCategoria = !categoria || (p.categoria_nombre || '') === categoria;
        const matchEstado = !estado || (estado === 'activo' ? p.activo : !p.activo);
        return matchQ && matchLinea && matchCategoria && matchEstado;
      });

      renderRows(filtered);
      qs('#ptableCount').textContent = `${filtered.length} de ${data.data.length} producto${data.data.length !== 1 ? 's' : ''}`;
    };

    qs('#ptableSearch').addEventListener('input', applyFilters);
    qs('#ptableLinea').addEventListener('change', applyFilters);
    qs('#ptableCategoria').addEventListener('change', applyFilters);
    qs('#ptableEstado').addEventListener('change', applyFilters);
  };

  if (formCategoria) {
    formCategoria.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const body = new FormData(formCategoria);
        body.set('slug', slugify(body.get('slug') || body.get('nombre') || ''));
        body.set('campos_tecnicos_json', JSON.stringify(state.categoryFieldDrafts.map((f, idx) => ({
          nombre: (f.nombre || '').trim(),
          slug: slugify(f.slug || f.nombre || ''),
          tipo_dato: f.tipo_dato || 'texto',
          unidad_medida: (f.unidad_medida || '').trim(),
          obligatorio: !!f.obligatorio,
          opciones: Array.isArray(f.opciones) ? f.opciones : [],
          orden: idx,
        })).filter((f) => f.nombre && f.slug)));

        if (state.editingCategoryId) {
          await api(`/admin/api/categorias/${state.editingCategoryId}`, { method: 'PATCH', body });
          showMsg('success', 'Categoría actualizada correctamente');
        } else {
          await api('/admin/api/categorias', { method: 'POST', body });
          showMsg('success', 'Categoría creada correctamente');
        }

        resetCategoryForm();
        await loadCategorias();
      } catch (err) {
        showMsg('error', err.message);
      }
    });
  }

  qs('#formProducto').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (typeof window._validateAllProductSteps === 'function' && !window._validateAllProductSteps()) {
      return;
    }
    try {
      const body = new FormData(e.target);
      body.set('precio', parseCop(body.get('precio')) || '0');
      const stockRaw = String(body.get('stock') || '').replace(/[^0-9-]/g, '');
      const stockSafe = Number.isFinite(Number.parseInt(stockRaw, 10)) ? Math.max(Number.parseInt(stockRaw, 10), 0) : 0;
      body.set('stock', String(stockSafe));
      const pa = body.get('precio_anterior');
      body.set('precio_anterior', (pa && parseCop(pa)) ? parseCop(pa) : '');
      body.set('slug', slugify(body.get('slug') || body.get('nombre') || ''));
      body.set('caracteristicas_json', JSON.stringify(state.productCaracteristicas));
      body.set('contenido_kit_json', JSON.stringify(state.productKit));
      body.set('recomendados_json', JSON.stringify(state.productRecomendados));
      body.set('especificaciones_tecnicas_json', JSON.stringify(state.productEspecificacionesTecnicas));
      body.set('eliminar_imagenes_adicionales_json', JSON.stringify(state.productImagenesAdicionalesEliminar));

      const category = getSelectedCategory();
      const fields = category && Array.isArray(category.campos_tecnicos) ? category.campos_tecnicos : [];
      const camposPayload = fields.map((field) => ({
        campo_id: field.id,
        valor: state.productCamposTecnicos[field.id],
      }));
      body.set('campos_tecnicos_json', JSON.stringify(camposPayload));

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
    loadCategorias(),
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
