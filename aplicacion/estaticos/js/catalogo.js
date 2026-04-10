/* ============================================
   ETIQUETAR COLOMBIA — Catalog Page JS
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    const qs = (selector, root = document) => root.querySelector(selector);
    const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
    const params = new URLSearchParams(window.location.search);
    const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
    const plainNumber = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

    const normalizeText = (value) => String(value || '').trim().toLowerCase();

    const escapeHtml = (value) => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const prettifyLabel = (value) => String(value || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

    const formatPrice = (value) => money.format(Number(value || 0));

    const showToast = (message) => {
        let toast = document.querySelector('.app-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'app-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('is-visible');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.remove('is-visible'), 1800);
    };

    const grid = qs('.catalog-grid');
    const baseLine = normalizeText(document.body.dataset.line || 'piscina');
    const initialLine = normalizeText(params.get('linea') || baseLine || 'piscina');
    const isAdmin = document.body.dataset.isAdmin === 'true';
    const baseTitle = qs('.catalog-header__title');
    const baseCount = qs('.catalog-header__count span');
    const toolbarInfo = qs('.catalog-toolbar__info');
    const sidebar = qs('.catalog-sidebar');
    const sidebarToggle = qs('.catalog-sidebar-toggle');
    const categoryRoot = qs('#catalogCategoryList');
    const typeRoot = qs('#catalogTypeFilter');
    const pageContainer = qs('.catalog-layout')?.parentElement || document.body;

    const state = {
        line: initialLine === 'all' ? 'all' : (initialLine === 'agua' ? 'agua' : 'piscina'),
        allProducts: [],
        categories: [],
        visibleProducts: [],
        selectedCategory: normalizeText(params.get('categoria') || 'all') || 'all',
        selectedBrands: new Set((params.get('marca') || '').split(',').map(normalizeText).filter(Boolean)),
        techFilters: {},
        minPrice: Number(params.get('min_price') || 0),
        maxPrice: Number(params.get('max_price') || Number.MAX_SAFE_INTEGER),
        searchText: normalizeText(params.get('q') || ''),
        sort: normalizeText(params.get('sort') || 'relevance'),
        onlyKits: params.get('kits') === '1',
        visibleLimit: 12,
        loadStep: 12,
        priceBounds: { min: 0, max: 0 },
        facets: { brands: [], price_min: 0, price_max: 0 },
    };

    const buildCategoryColor = (name, line) => {
        const normalized = normalizeText(name);
        if (/bomb|piscin|arena|cartucho/.test(normalized)) return line === 'agua' ? ['E8F4F8', '1B8FA1'] : ['F0F7FF', '0077B6'];
        if (/uv|l[máa]para|desinfecci[oó]n/.test(normalized)) return ['EEF8FF', '155E75'];
        if (/qu[ií]m|cloro/.test(normalized)) return ['FEE2E2', 'B91C1C'];
        if (/abland|resina|sal/.test(normalized)) return ['ECFDF5', '047857'];
        if (/dosific/.test(normalized)) return ['FFF7ED', 'C2410C'];
        return line === 'agua' ? ['E8F4F8', '1B8FA1'] : ['F0F7FF', '0077B6'];
    };

    const getInitials = (name) => {
        const words = normalizeText(name).split(/\s+/).filter(Boolean);
        const letters = words.slice(0, 2).map((word) => word[0] || '').join('');
        return (letters || 'PR').toUpperCase();
    };

    const getFallbackImage = (product) => {
        const [bg, fg] = buildCategoryColor(product.categoria_nombre || product.linea, product.linea);
        return `/placeholder/400x300/${bg}/${fg}?text=${encodeURIComponent(getInitials(product.nombre || product.referencia || 'Producto'))}`;
    };

    const getPrimaryImage = (product) => product.imagen_url || getFallbackImage(product);

    const getProductPrice = (product) => Number(product.precio_final || product.precio || 0);

    const getProductOldPrice = (product) => {
        const current = getProductPrice(product);
        if (product.precio_anterior != null && Number(product.precio_anterior) > current) {
            return Number(product.precio_anterior);
        }
        const descuento = Number(product.descuento || 0);
        if (descuento > 0 && Number(product.precio || 0) > current) {
            return Number(product.precio || 0);
        }
        return null;
    };

    const getDiscountPercent = (product) => {
        const oldPrice = getProductOldPrice(product);
        const current = getProductPrice(product);
        if (oldPrice && oldPrice > current && oldPrice > 0) {
            return Math.round((1 - (current / oldPrice)) * 100);
        }
        return Number(product.descuento || 0) > 0 ? Math.round(Number(product.descuento || 0)) : 0;
    };

    const getLineLabel = (line) => line === 'agua' ? 'Tratamiento de Agua' : (line === 'all' ? 'Catálogo completo' : 'Piscina & Spa');

    const getProductCategory = (product) => product.categoria_slug || 'sin-categoria';

    const getTechValue = (product, fieldSlug) => {
        const item = (product.campos_tecnicos || []).find((campo) => normalizeText(campo.campo_slug) === normalizeText(fieldSlug));
        if (!item) return null;
        if (item.valor_numero != null && item.valor_numero !== '') return Number(item.valor_numero);
        if (item.valor_texto != null && item.valor_texto !== '') return String(item.valor_texto);
        if (item.valor_opcion != null && item.valor_opcion !== '') return String(item.valor_opcion);
        if (item.valor_booleano != null) return item.valor_booleano ? 'si' : 'no';
        return item.valor_mostrar || null;
    };

    const ensureShell = () => {
        if (!baseTitle) return;
        const headerTop = qs('.catalog-header__top');
        if (headerTop && !qs('#catalogLineTabs')) {
            const tabs = document.createElement('div');
            tabs.className = 'catalog-line-tabs';
            tabs.id = 'catalogLineTabs';
            headerTop.insertAdjacentElement('afterend', tabs);
        }

        const header = qs('.catalog-header .container');
        if (header && !qs('#catalogActiveFilters')) {
            const chips = document.createElement('div');
            chips.className = 'catalog-active-filters';
            chips.id = 'catalogActiveFilters';
            header.insertAdjacentElement('afterend', chips);
        }

        const main = qs('main');
        if (main && !qs('#catalogQuickViewModal')) {
            const modal = document.createElement('div');
            modal.className = 'catalog-quickview-modal';
            modal.id = 'catalogQuickViewModal';
            modal.setAttribute('aria-hidden', 'true');
            modal.innerHTML = `
                <div class="catalog-quickview-modal__backdrop" data-close-quickview></div>
                <div class="catalog-quickview-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="catalogQuickViewTitle">
                    <button class="catalog-quickview-modal__close" type="button" data-close-quickview aria-label="Cerrar"><i class="fas fa-times"></i></button>
                    <div class="catalog-quickview-modal__gallery">
                        <button class="catalog-quickview-modal__nav catalog-quickview-modal__nav--prev" type="button" data-quickview-prev aria-label="Imagen anterior"><i class="fas fa-chevron-left"></i></button>
                        <img class="catalog-quickview-modal__image" alt="">
                        <button class="catalog-quickview-modal__nav catalog-quickview-modal__nav--next" type="button" data-quickview-next aria-label="Imagen siguiente"><i class="fas fa-chevron-right"></i></button>
                        <div class="catalog-quickview-modal__dots" data-quickview-dots></div>
                    </div>
                    <div class="catalog-quickview-modal__content">
                        <div class="catalog-quickview-modal__kicker" data-quickview-category></div>
                        <h3 id="catalogQuickViewTitle" class="catalog-quickview-modal__title"></h3>
                        <div class="catalog-quickview-modal__ref" data-quickview-ref></div>
                        <div class="catalog-quickview-modal__price-row">
                            <strong data-quickview-price></strong>
                            <span data-quickview-old-price></span>
                        </div>
                        <div class="catalog-quickview-modal__stock" data-quickview-stock></div>
                        <div class="catalog-quickview-modal__specs" data-quickview-specs></div>
                        <ul class="catalog-quickview-modal__bullets" data-quickview-bullets></ul>
                        <div class="catalog-quickview-modal__actions">
                            <button class="catalog-card__cart-btn catalog-card__cart-btn--piscina" type="button" data-quickview-buy><i class="fas fa-cart-plus"></i> Agregar al carrito</button>
                            <a class="catalog-card__quote-btn catalog-quickview-modal__quote" href="#" target="_self" rel="noopener" data-quickview-detail><i class="fas fa-file-alt"></i></a>
                        </div>
                    </div>
                </div>
            `;
            main.appendChild(modal);
        }

        if (grid && !qs('#catalogLoadMore')) {
            const footer = document.createElement('div');
            footer.className = 'catalog-load-more';
            footer.id = 'catalogLoadMore';
            footer.innerHTML = `
                <button type="button" class="catalog-load-more__btn" data-load-more>Cargar más</button>
                <div class="catalog-load-more__hint" data-load-more-hint></div>
            `;
            grid.insertAdjacentElement('afterend', footer);
        }
    };

    const getCurrentUrlParams = () => {
        const url = new URL(window.location.href);
        const query = new URLSearchParams();
        if (state.line && state.line !== 'piscina') {
            if (state.line === 'agua') url.pathname = '/catalogo/agua';
            if (state.line === 'all') url.pathname = '/catalogo';
        } else {
            url.pathname = '/catalogo/piscina';
        }
        if (state.line === 'all') query.set('linea', 'all');
        if (state.selectedCategory && state.selectedCategory !== 'all') query.set('categoria', state.selectedCategory);
        if (state.selectedBrands.size) query.set('marca', Array.from(state.selectedBrands).join(','));
        if (state.searchText) query.set('q', state.searchText);
        if (state.sort && state.sort !== 'relevance') query.set('sort', state.sort);
        if (Number.isFinite(state.minPrice) && state.minPrice > 0) query.set('min_price', String(state.minPrice));
        if (Number.isFinite(state.maxPrice) && state.maxPrice < Number.MAX_SAFE_INTEGER) query.set('max_price', String(state.maxPrice));
        if (state.onlyKits) query.set('kits', '1');
        Object.entries(state.techFilters).forEach(([key, value]) => {
            if (value == null) return;
            if (typeof value === 'object' && value.min == null && value.max == null) return;
            if (typeof value === 'object') {
                if (value.min != null) query.set(`tech_${key}_min`, String(value.min));
                if (value.max != null) query.set(`tech_${key}_max`, String(value.max));
            } else {
                query.set(`tech_${key}`, String(value));
            }
        });
        url.search = query.toString();
        return url.toString();
    };

    const syncUrl = () => {
        const newUrl = getCurrentUrlParams();
        window.history.replaceState({}, '', newUrl);
    };

    const setHeaderCopy = () => {
        if (baseTitle) baseTitle.textContent = getLineLabel(state.line);
        if (baseCount) baseCount.textContent = plainNumber.format(state.visibleProducts.length);
    };

    const renderLineTabs = () => {
        const root = qs('#catalogLineTabs');
        if (!root) return;
        const tabs = [
            { key: 'all', label: 'Todos' },
            { key: 'piscina', label: 'Piscina y Spa' },
            { key: 'agua', label: 'Tratamiento de Agua' },
        ];
        root.innerHTML = tabs.map((tab) => `
            <button type="button" class="catalog-line-tab ${state.line === tab.key ? 'is-active' : ''}" data-line-tab="${tab.key}">${tab.label}</button>
        `).join('');
        qsa('[data-line-tab]', root).forEach((button) => {
            button.addEventListener('click', () => {
                const nextLine = button.dataset.lineTab;
                const currentUrl = new URL(window.location.href);
                const query = new URLSearchParams(currentUrl.search);
                if (nextLine === 'all') {
                    currentUrl.pathname = '/catalogo';
                    query.set('linea', 'all');
                } else if (nextLine === 'agua') {
                    currentUrl.pathname = '/catalogo/agua';
                    query.delete('linea');
                } else {
                    currentUrl.pathname = '/catalogo/piscina';
                    query.delete('linea');
                }
                query.delete('categoria');
                query.delete('marca');
                query.delete('min_price');
                query.delete('max_price');
                query.delete('kits');
                Array.from(query.keys()).forEach((key) => {
                    if (key.startsWith('tech_')) query.delete(key);
                });
                currentUrl.search = query.toString();
                window.location.href = currentUrl.toString();
            });
        });
    };

    const renderActiveFilters = () => {
        const root = qs('#catalogActiveFilters');
        if (!root) return;
        const chips = [];
        chips.push(`<button type="button" class="catalog-filter-chip ${state.line === 'all' ? 'is-active' : ''}" data-chip-clear-line="all">${getLineLabel(state.line)}</button>`);

        if (state.selectedCategory !== 'all') {
            const category = state.categories.find((item) => normalizeText(item.slug) === state.selectedCategory);
            chips.push(`<button type="button" class="catalog-filter-chip" data-chip-remove="categoria">${escapeHtml(category?.nombre || state.selectedCategory)} <i class="fas fa-times"></i></button>`);
        }
        state.selectedBrands.forEach((brand) => {
            chips.push(`<button type="button" class="catalog-filter-chip" data-chip-remove-brand="${escapeHtml(brand)}">${escapeHtml(brand)} <i class="fas fa-times"></i></button>`);
        });
        if (state.searchText) {
            chips.push(`<button type="button" class="catalog-filter-chip" data-chip-remove="search">${escapeHtml(state.searchText)} <i class="fas fa-times"></i></button>`);
        }
        if (state.onlyKits) {
            chips.push(`<button type="button" class="catalog-filter-chip" data-chip-remove="kits">Kits <i class="fas fa-times"></i></button>`);
        }
        Object.entries(state.techFilters).forEach(([key, value]) => {
            if (value && typeof value === 'object' && (value.min != null || value.max != null)) {
                chips.push(`<button type="button" class="catalog-filter-chip" data-chip-remove-tech="${escapeHtml(key)}">${escapeHtml(key)} <i class="fas fa-times"></i></button>`);
            }
        });
        root.innerHTML = chips.length
            ? `<div class="catalog-active-filters__title">Filtros activos</div><div class="catalog-active-filters__chips">${chips.join('')}</div><button type="button" class="catalog-active-filters__clear" data-clear-all>Limpiar filtros</button>`
            : '';
    };

    const renderCategoryFilter = () => {
        if (!categoryRoot) return;
        const lineProducts = state.allProducts.filter((product) => state.line === 'all' || product.linea === state.line);
        const lineCategories = state.categories.filter((category) => state.line === 'all' || category.linea === state.line);
        const counts = new Map();
        lineProducts.forEach((product) => {
            const slug = getProductCategory(product);
            counts.set(slug, (counts.get(slug) || 0) + 1);
        });
        const entries = [{ slug: 'all', nombre: 'Todas las categorías', total: lineProducts.length }]
            .concat(lineCategories.map((category) => ({ ...category, total: counts.get(category.slug) || 0 })))
            .filter((category) => category.total > 0 || category.slug === 'all');

        categoryRoot.innerHTML = entries.map((category) => {
            const activeClass = state.selectedCategory === normalizeText(category.slug) ? (state.line === 'agua' ? 'active--agua' : 'active--piscina') : '';
            return `
                <a class="sidebar-cat ${activeClass}" href="#" data-category="${escapeHtml(category.slug)}">
                    <span>${escapeHtml(category.nombre)}</span>
                    <span class="sidebar-cat__count">${plainNumber.format(category.total)}</span>
                </a>
            `;
        }).join('');

        qsa('.sidebar-cat', categoryRoot).forEach((item) => {
            item.addEventListener('click', (event) => {
                event.preventDefault();
                state.selectedCategory = normalizeText(item.dataset.category || 'all');
                state.visibleLimit = state.loadStep;
                state.techFilters = {};
                renderTechFilters();
                applyFilters();
            });
        });
    };

    const renderBrandFilter = () => {
        const root = qs('#catalogBrandList');
        if (!root) return;
        const counts = new Map();
        state.allProducts.forEach((product) => {
            if (state.line !== 'all' && product.linea !== state.line) return;
            const brand = normalizeText(product.marca || '');
            if (!brand) return;
            counts.set(brand, (counts.get(brand) || 0) + 1);
        });

        const brands = Array.from(counts.entries())
            .map(([brand, total]) => ({ brand, total }))
            .filter((item) => item.brand && item.total > 0)
            .sort((a, b) => a.brand.localeCompare(b.brand));

        if (!brands.length) {
            root.innerHTML = '<div class="filter-empty-note">No hay marcas para esta línea.</div>';
            return;
        }

        root.innerHTML = brands.map((item) => {
            const brandData = (state.facets.brands || []).find((brand) => normalizeText(brand.nombre) === item.brand) || null;
            const logo = brandData?.logo_url || '';
            const displayName = brandData?.nombre || prettifyLabel(item.brand);
            const checked = state.selectedBrands.has(item.brand) ? 'checked' : '';
            return `
                <label class="filter-brand">
                    <input type="checkbox" value="${escapeHtml(item.brand)}" ${checked}>
                    <span class="filter-brand__logo ${logo ? '' : 'is-fallback'}">${logo ? `<img src="${logo}" alt="">` : escapeHtml(displayName.slice(0, 2).toUpperCase())}</span>
                    <span class="filter-brand__label">${escapeHtml(displayName)}</span>
                    <span class="filter-brand__count">(${plainNumber.format(item.total)})</span>
                </label>
            `;
        }).join('');

        qsa('.filter-brand input', root).forEach((input) => {
            input.addEventListener('change', () => {
                const brand = normalizeText(input.value);
                if (input.checked) state.selectedBrands.add(brand);
                else state.selectedBrands.delete(brand);
                state.visibleLimit = state.loadStep;
                applyFilters();
            });
        });
    };

    const renderPriceFilter = () => {
        const minInput = qs('.price-filter__input:not(.price-filter__input--max)');
        const maxInput = qs('.price-filter__input--max');
        const slider = qs('.price-filter__slider');
        const priceButton = qs('.price-filter__btn');

        if (!minInput || !maxInput || !slider) return;

        minInput.readOnly = false;
        maxInput.readOnly = false;
        minInput.inputMode = 'numeric';
        maxInput.inputMode = 'numeric';

        const minValue = Number.isFinite(state.priceBounds.min) && state.priceBounds.min > 0 ? state.priceBounds.min : 0;
        const maxValue = Number.isFinite(state.priceBounds.max) && state.priceBounds.max > 0 ? state.priceBounds.max : 0;
        if (!state.minPrice) state.minPrice = minValue;
        if (!state.maxPrice || state.maxPrice === Number.MAX_SAFE_INTEGER) state.maxPrice = maxValue || Number.MAX_SAFE_INTEGER;
        slider.min = String(minValue || 0);
        slider.max = String(maxValue || 10000000);
        slider.value = String(Math.min(Number(slider.max), state.maxPrice || Number(slider.max)));
        minInput.value = formatPrice(state.minPrice || 0);
        maxInput.value = formatPrice(state.maxPrice || Number(slider.max));

        const syncTextToValue = (text) => Number(String(text || '').replace(/[^0-9]/g, '')) || 0;
        const updateFromInputs = () => {
            state.minPrice = syncTextToValue(minInput.value);
            state.maxPrice = syncTextToValue(maxInput.value) || Number.MAX_SAFE_INTEGER;
            if (state.maxPrice < state.minPrice) {
                state.maxPrice = state.minPrice;
                maxInput.value = formatPrice(state.maxPrice);
            }
            slider.value = String(Math.min(Number(slider.max), state.maxPrice));
            applyFilters();
        };

        minInput.addEventListener('input', updateFromInputs);
        maxInput.addEventListener('input', updateFromInputs);
        slider.addEventListener('input', () => {
            state.maxPrice = Number(slider.value || slider.max || 0);
            maxInput.value = formatPrice(state.maxPrice);
            applyFilters();
        });
        if (priceButton) {
            priceButton.addEventListener('click', applyFilters);
        }
    };

    const renderTechFilters = () => {
        const root = qs('#catalogTechFilters');
        if (!root) return;
        const selectedCategory = state.selectedCategory === 'all'
            ? null
            : state.categories.find((category) => normalizeText(category.slug) === state.selectedCategory);

        if (!selectedCategory || !selectedCategory.campos_tecnicos || !selectedCategory.campos_tecnicos.length) {
            root.innerHTML = '<div class="filter-empty-note">Selecciona una categoría para ver filtros técnicos.</div>';
            return;
        }

        const productsInCategory = state.allProducts.filter((product) => state.selectedCategory === 'all' || getProductCategory(product) === state.selectedCategory);
        const fields = selectedCategory.campos_tecnicos.filter((field) => field.tipo_dato === 'numero' || field.tipo_dato === 'opcion' || field.tipo_dato === 'booleano' || field.tipo_dato === 'texto');
        const chunks = fields.map((field) => {
            const values = productsInCategory
                .map((product) => getTechValue(product, field.slug))
                .filter((value) => value != null && value !== '' && !Number.isNaN(Number(value)));
            if (field.tipo_dato === 'numero') {
                const min = values.length ? Math.min(...values.map(Number)) : 0;
                const max = values.length ? Math.max(...values.map(Number)) : 0;
                if (!state.techFilters[field.slug]) {
                    state.techFilters[field.slug] = { min, max };
                } else {
                    state.techFilters[field.slug] = {
                        min: state.techFilters[field.slug].min != null ? state.techFilters[field.slug].min : min,
                        max: state.techFilters[field.slug].max != null ? state.techFilters[field.slug].max : max,
                    };
                }
                return `
                    <div class="tech-filter" data-tech-filter="${escapeHtml(field.slug)}">
                        <div class="tech-filter__head">
                            <span>${escapeHtml(field.nombre)}</span>
                            <small>${field.unidad_medida ? escapeHtml(field.unidad_medida) : 'rango'}</small>
                        </div>
                        <div class="tech-filter__range">
                            <input type="number" class="tech-filter__input" data-tech-min="${escapeHtml(field.slug)}" value="${escapeHtml(state.techFilters[field.slug].min)}" min="${escapeHtml(min)}" max="${escapeHtml(max)}">
                            <span>—</span>
                            <input type="number" class="tech-filter__input" data-tech-max="${escapeHtml(field.slug)}" value="${escapeHtml(state.techFilters[field.slug].max)}" min="${escapeHtml(min)}" max="${escapeHtml(max)}">
                        </div>
                        <input type="range" class="tech-filter__slider" data-tech-slider="${escapeHtml(field.slug)}" min="${escapeHtml(min)}" max="${escapeHtml(max)}" value="${escapeHtml(state.techFilters[field.slug].max)}">
                    </div>
                `;
            }
            if (field.tipo_dato === 'opcion') {
                const options = Array.from(new Set(values.map((value) => String(value)))).filter(Boolean);
                if (!state.techFilters[field.slug]) state.techFilters[field.slug] = '';
                return `
                    <label class="tech-select">
                        <span>${escapeHtml(field.nombre)}</span>
                        <select data-tech-select="${escapeHtml(field.slug)}">
                            <option value="">Todos</option>
                            ${options.map((option) => `<option value="${escapeHtml(option)}" ${normalizeText(state.techFilters[field.slug]) === normalizeText(option) ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}
                        </select>
                    </label>
                `;
            }
            if (field.tipo_dato === 'booleano') {
                if (state.techFilters[field.slug] == null) state.techFilters[field.slug] = '';
                return `
                    <label class="tech-check">
                        <input type="checkbox" data-tech-bool="${escapeHtml(field.slug)}" ${state.techFilters[field.slug] === 'si' ? 'checked' : ''}>
                        <span>${escapeHtml(field.nombre)}</span>
                    </label>
                `;
            }
            if (field.tipo_dato === 'texto') {
                if (state.techFilters[field.slug] == null) state.techFilters[field.slug] = '';
                return `
                    <label class="tech-select">
                        <span>${escapeHtml(field.nombre)}</span>
                        <input type="text" data-tech-text="${escapeHtml(field.slug)}" value="${escapeHtml(state.techFilters[field.slug])}" placeholder="Filtrar ${escapeHtml(field.nombre.toLowerCase())}">
                    </label>
                `;
            }
            return '';
        }).filter(Boolean);

        root.innerHTML = chunks.length ? chunks.join('') : '<div class="filter-empty-note">Esta categoría no tiene filtros técnicos configurados.</div>';

        qsa('[data-tech-min]', root).forEach((input) => {
            input.addEventListener('input', () => {
                const key = input.dataset.techMin;
                state.techFilters[key] = state.techFilters[key] || {};
                state.techFilters[key].min = Number(input.value || 0);
                const maxInput = qs(`[data-tech-max="${CSS.escape(key)}"]`, root);
                if (maxInput && Number(maxInput.value || 0) < Number(input.value || 0)) {
                    maxInput.value = input.value;
                    state.techFilters[key].max = Number(maxInput.value || 0);
                }
                state.visibleLimit = state.loadStep;
                applyFilters();
            });
        });

        qsa('[data-tech-max]', root).forEach((input) => {
            input.addEventListener('input', () => {
                const key = input.dataset.techMax;
                state.techFilters[key] = state.techFilters[key] || {};
                state.techFilters[key].max = Number(input.value || 0);
                const minInput = qs(`[data-tech-min="${CSS.escape(key)}"]`, root);
                if (minInput && Number(minInput.value || 0) > Number(input.value || 0)) {
                    minInput.value = input.value;
                    state.techFilters[key].min = Number(minInput.value || 0);
                }
                const slider = qs(`[data-tech-slider="${CSS.escape(key)}"]`, root);
                if (slider) slider.value = input.value;
                state.visibleLimit = state.loadStep;
                applyFilters();
            });
        });

        qsa('[data-tech-slider]', root).forEach((slider) => {
            slider.addEventListener('input', () => {
                const key = slider.dataset.techSlider;
                state.techFilters[key] = state.techFilters[key] || {};
                state.techFilters[key].max = Number(slider.value || 0);
                const maxInput = qs(`[data-tech-max="${CSS.escape(key)}"]`, root);
                if (maxInput) maxInput.value = slider.value;
                state.visibleLimit = state.loadStep;
                applyFilters();
            });
        });

        qsa('[data-tech-select]', root).forEach((select) => {
            select.addEventListener('change', () => {
                state.techFilters[select.dataset.techSelect] = select.value;
                state.visibleLimit = state.loadStep;
                applyFilters();
            });
        });

        qsa('[data-tech-bool]', root).forEach((checkbox) => {
            checkbox.addEventListener('change', () => {
                state.techFilters[checkbox.dataset.techBool] = checkbox.checked ? 'si' : '';
                state.visibleLimit = state.loadStep;
                applyFilters();
            });
        });

        qsa('[data-tech-text]', root).forEach((input) => {
            input.addEventListener('input', () => {
                state.techFilters[input.dataset.techText] = input.value;
                state.visibleLimit = state.loadStep;
                applyFilters();
            });
        });
    };

    const sortProducts = (products) => {
        const ordered = [...products];
        switch (state.sort) {
            case 'best-sellers':
                ordered.sort((a, b) => (Number(b.ventas_count || 0) - Number(a.ventas_count || 0)) || (Number(b.es_nuevo ? 1 : 0) - Number(a.es_nuevo ? 1 : 0)) || (getProductPrice(b) - getProductPrice(a)));
                break;
            case 'newest':
                ordered.sort((a, b) => (new Date(b.created_at || 0) - new Date(a.created_at || 0)) || (Number(b.ventas_count || 0) - Number(a.ventas_count || 0)));
                break;
            case 'price-desc':
                ordered.sort((a, b) => getProductPrice(b) - getProductPrice(a));
                break;
            case 'price-asc':
                ordered.sort((a, b) => getProductPrice(a) - getProductPrice(b));
                break;
            case 'discount-desc':
                ordered.sort((a, b) => getDiscountPercent(b) - getDiscountPercent(a) || getProductPrice(a) - getProductPrice(b));
                break;
            case 'name-asc':
                ordered.sort((a, b) => normalizeText(a.nombre).localeCompare(normalizeText(b.nombre)));
                break;
            case 'name-desc':
                ordered.sort((a, b) => normalizeText(b.nombre).localeCompare(normalizeText(a.nombre)));
                break;
            default:
                ordered.sort((a, b) => (getDiscountPercent(b) - getDiscountPercent(a)) || (Number(b.ventas_count || 0) - Number(a.ventas_count || 0)) || (new Date(b.created_at || 0) - new Date(a.created_at || 0)));
                break;
        }
        return ordered;
    };

    const productMatchesTechFilters = (product) => {
        return Object.entries(state.techFilters).every(([key, value]) => {
            if (value == null || value === '' || (typeof value === 'object' && value.min == null && value.max == null)) return true;
            const field = (product.campos_tecnicos || []).find((item) => normalizeText(item.campo_slug) === normalizeText(key));
            if (!field) return false;
            if (typeof value === 'object') {
                const numeric = Number(field.valor_numero ?? field.valor_mostrar ?? field.valor_texto ?? field.valor_opcion);
                if (Number.isNaN(numeric)) return false;
                if (value.min != null && numeric < Number(value.min)) return false;
                if (value.max != null && numeric > Number(value.max)) return false;
                return true;
            }
            const fieldValue = normalizeText(field.valor_mostrar || field.valor_texto || field.valor_opcion || (field.valor_booleano ? 'si' : 'no'));
            return fieldValue.includes(normalizeText(value));
        });
    };

    const applyFilters = () => {
        let filtered = [...state.allProducts];
        if (state.line !== 'all') {
            filtered = filtered.filter((product) => product.linea === state.line);
        }
        if (state.selectedCategory !== 'all') {
            filtered = filtered.filter((product) => normalizeText(getProductCategory(product)) === state.selectedCategory);
        }
        if (state.selectedBrands.size) {
            filtered = filtered.filter((product) => state.selectedBrands.has(normalizeText(product.marca || 'Sin marca')));
        }
        if (state.searchText) {
            const term = normalizeText(state.searchText);
            filtered = filtered.filter((product) => [product.nombre, product.slug, product.referencia, product.marca, product.categoria_nombre].some((value) => normalizeText(value).includes(term)));
        }
        filtered = filtered.filter((product) => getProductPrice(product) >= state.minPrice && getProductPrice(product) <= state.maxPrice);
        if (state.onlyKits) {
            filtered = filtered.filter((product) => (product.tipo_producto || (product.es_kit ? 'kit' : 'estandar')) !== 'estandar');
        }
        filtered = filtered.filter(productMatchesTechFilters);
        state.visibleProducts = sortProducts(filtered);
        renderCards();
        renderActiveFilters();
        renderCategoryFilter();
        renderBrandFilter();
        renderTechFilters();
        setHeaderCopy();
        syncUrl();
    };

    const ensureEmptyState = () => {
        if (!grid) return null;
        let empty = qs('.catalog-empty');
        if (!empty) {
            empty = document.createElement('section');
            empty.className = 'catalog-empty';
            empty.innerHTML = `
                <div class="catalog-empty__icon"><i class="fas fa-box-open"></i></div>
                <h3 class="catalog-empty__title">No hay productos para este filtro</h3>
                <p class="catalog-empty__text">Prueba ampliar la búsqueda o limpiar los filtros activos.</p>
                <div class="catalog-empty__actions">
                    <button type="button" class="catalog-empty__btn" data-clear-all>Limpiar filtros</button>
                </div>
            `;
            grid.insertAdjacentElement('afterend', empty);
        }
        return empty;
    };

    const updateToolbar = () => {
        const empty = ensureEmptyState();
        const total = state.visibleProducts.length;
        const shown = Math.min(state.visibleLimit, total);
        if (baseCount) baseCount.textContent = plainNumber.format(total);
        if (toolbarInfo) {
            toolbarInfo.innerHTML = total
                ? `Mostrando <span>${plainNumber.format(shown)}</span> de <span>${plainNumber.format(total)}</span> productos`
                : 'No hay resultados con estos filtros';
        }
        if (empty) empty.classList.toggle('is-visible', total === 0);
        const loadMore = qs('#catalogLoadMore');
        const hint = qs('[data-load-more-hint]');
        if (loadMore) {
            loadMore.classList.toggle('is-visible', total > state.visibleLimit);
            if (hint) hint.textContent = total > state.visibleLimit ? `Quedan ${plainNumber.format(total - state.visibleLimit)} productos por cargar.` : '';
        }
    };

    const getRenderedProducts = () => state.visibleProducts.slice(0, state.visibleLimit);

    const renderProductCard = (product) => {
        const price = getProductPrice(product);
        const oldPrice = getProductOldPrice(product);
        const discount = getDiscountPercent(product);
        const stock = Number(product.stock || 0);
        const inStock = stock > 0;
        const categoryLabel = product.categoria_nombre || getLineLabel(product.linea);
        const lineClass = product.linea === 'agua' ? 'agua' : 'piscina';
        const image = getPrimaryImage(product);
        const createdAt = product.created_at ? new Date(product.created_at) : null;
        const isNew = product.es_nuevo || (createdAt ? ((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)) <= 30 : false);
        const bundleType = product.tipo_producto || (product.es_kit ? 'kit' : 'estandar');
        const stockOverlay = !inStock ? '<div class="catalog-card__soldout-overlay">Agotado</div>' : '';
        const promoBadge = discount > 0 ? `<span class="catalog-card__badge catalog-card__badge--sale">-${discount}%</span>` : '';
        const newBadge = isNew ? '<span class="catalog-card__badge catalog-card__badge--new">Nuevo</span>' : '';
        const quickSpecs = (product.campos_tecnicos || []).slice(0, 5).map((item) => `<div class="catalog-quick-spec"><span>${escapeHtml(item.nombre || item.campo_slug || '')}</span><strong>${escapeHtml(item.valor_mostrar || item.valor_texto || item.valor_opcion || item.valor_numero || '')}</strong></div>`).join('');
        return `
            <div class="catalog-card" data-product-id="${product.id}" data-price="${price}" data-name="${escapeHtml(product.nombre)}" data-category="${escapeHtml(product.categoria_slug || '')}" data-brand="${escapeHtml(normalizeText(product.marca || 'Sin marca'))}">
                ${promoBadge}
                ${newBadge}
                <button class="catalog-card__quickview-hover" type="button" data-action="quickview" data-product-id="${product.id}" aria-label="Vista rápida">
                    <i class="far fa-eye"></i>
                    <span>Vista rápida</span>
                </button>
                <div class="catalog-card__actions">
                    <button class="catalog-card__action ${lineClass}-hover" data-action="wishlist" title="Favoritos"><i class="far fa-heart"></i></button>
                    <button class="catalog-card__action ${lineClass}-hover" data-action="quickview" title="Vista rápida" data-product-id="${product.id}"><i class="far fa-eye"></i></button>
                </div>
                <div class="catalog-card__img">
                    ${stockOverlay}
                    <img src="${escapeHtml(image)}" alt="${escapeHtml(product.nombre)}" loading="lazy" data-product-image="${product.id}">
                </div>
                <div class="catalog-card__body">
                    <div class="catalog-card__category catalog-card__category--${lineClass}">${escapeHtml(categoryLabel)}</div>
                    <h3 class="catalog-card__name"><a href="/producto/${escapeHtml(product.slug)}">${escapeHtml(product.nombre)}</a></h3>
                    <div class="catalog-card__sku">REF: ${escapeHtml(product.referencia || product.slug)}</div>
                    <div class="catalog-card__stock catalog-card__stock--${inStock ? 'in' : 'out'}"><i class="fas fa-circle"></i> ${inStock ? `En stock (${plainNumber.format(stock)})` : 'Sobre pedido'}</div>
                    <div class="catalog-card__pricing">
                        <span class="catalog-card__price catalog-card__price--${lineClass}">${formatPrice(price)}</span>
                        ${oldPrice ? `<span class="catalog-card__price-old">${formatPrice(oldPrice)}</span>` : ''}
                    </div>
                    <div class="catalog-card__tax">IVA incluido</div>
                    <div class="catalog-card__footer">
                        <button class="catalog-card__cart-btn catalog-card__cart-btn--${lineClass}" data-product-id="${product.id}"><i class="fas fa-cart-plus"></i> ${inStock ? 'Comprar' : 'Cotizar'}</button>
                        ${product.ficha_url ? `<a class="catalog-card__quote-btn" title="Ficha técnica" href="${escapeHtml(product.ficha_url)}" target="_blank" rel="noopener"><i class="far fa-file-lines"></i></a>` : `<a class="catalog-card__quote-btn" title="Ver producto" href="/producto/${escapeHtml(product.slug)}"><i class="far fa-file-lines"></i></a>`}
                    </div>
                    ${isAdmin ? `
                        <div class="catalog-card__admin">
                            <a class="catalog-card__admin-link" href="/admin/?tab=productos&producto=${product.id}"><i class="fas fa-pen"></i> Prod</a>
                            <a class="catalog-card__admin-link" href="/admin/?tab=promociones&producto_id=${product.id}" style="background:#f59e0b; color:white; border-color:#f59e0b;"><i class="fas fa-tag"></i> Oferta</a>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    };

    const createSkeletonMarkup = () => Array.from({ length: 6 }).map(() => `
        <article class="catalog-skeleton-card">
            <div class="catalog-skeleton-img catalog-skeleton-shimmer"></div>
            <div class="catalog-skeleton-body">
                <div class="catalog-skeleton-line sm catalog-skeleton-shimmer"></div>
                <div class="catalog-skeleton-line lg catalog-skeleton-shimmer"></div>
                <div class="catalog-skeleton-line md catalog-skeleton-shimmer"></div>
                <div class="catalog-skeleton-line sm catalog-skeleton-shimmer"></div>
            </div>
        </article>
    `).join('');

    const bindImageFallbacks = () => {
        qsa('[data-product-image]').forEach((img) => {
            if (img.dataset.boundFallback === 'true') return;
            img.dataset.boundFallback = 'true';
            img.addEventListener('error', () => {
                const product = state.visibleProducts.find((item) => String(item.id) === String(img.dataset.productImage));
                if (!product || img.dataset.fallbackApplied === 'true') return;
                img.dataset.fallbackApplied = 'true';
                img.src = getFallbackImage(product);
                img.alt = product.nombre || 'Producto';
            });
        });
    };

    const bindQuickActions = () => {
        qsa('.catalog-card__cart-btn').forEach((button) => {
            if (button.dataset.bound === 'true') return;
            button.dataset.bound = 'true';
            button.addEventListener('click', async (event) => {
                event.preventDefault();
                const productId = button.dataset.productId;
                if (!productId || !window.etiquetarCart) {
                    showToast('No se pudo conectar con el carrito.');
                    return;
                }
                const original = button.innerHTML;
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Agregando...';
                button.style.pointerEvents = 'none';
                try {
                    await window.etiquetarCart.addItem(productId);
                    button.innerHTML = '<i class="fas fa-check"></i> ¡Agregado!';
                    showToast('Producto agregado al carrito');
                    setTimeout(() => {
                        button.innerHTML = original;
                        button.style.pointerEvents = '';
                    }, 1200);
                } catch (error) {
                    button.innerHTML = original;
                    button.style.pointerEvents = '';
                    showToast(error.message || 'No se pudo agregar el producto');
                }
            });
        });

        qsa('[data-action="wishlist"]').forEach((button) => {
            if (button.dataset.bound === 'true') return;
            button.dataset.bound = 'true';
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                button.classList.toggle('added');
                button.innerHTML = button.classList.contains('added')
                    ? '<i class="fas fa-heart" style="color:#e74c3c;"></i>'
                    : '<i class="far fa-heart"></i>';
            });
        });

        qsa('[data-action="quickview"]').forEach((button) => {
            if (button.dataset.bound === 'true') return;
            button.dataset.bound = 'true';
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                openQuickView(button.dataset.productId || button.closest('.catalog-card')?.dataset.productId);
            });
        });
    };

    const renderCards = () => {
        if (!grid) return;
        const products = getRenderedProducts();
        if (!products.length) {
            grid.innerHTML = '';
            updateToolbar();
            return;
        }
        grid.innerHTML = products.map(renderProductCard).join('');
        Array.from(grid.querySelectorAll('.catalog-card')).forEach((card) => {
            card.style.opacity = '0';
            card.style.animation = 'fadeInUp 0.4s ease forwards';
        });
        bindImageFallbacks();
        bindQuickActions();
        updateToolbar();
    };

    const toggleSidebar = (open) => {
        if (!sidebar || !sidebarToggle) return;
        const nextOpen = typeof open === 'boolean' ? open : !sidebar.classList.contains('active');
        sidebar.classList.toggle('active', nextOpen);
        sidebarToggle.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
        document.body.style.overflow = nextOpen ? 'hidden' : '';
        const icon = qs('i', sidebarToggle);
        const label = qs('span', sidebarToggle);
        if (icon && label) {
            icon.classList.toggle('fa-times', nextOpen);
            icon.classList.toggle('fa-sliders', !nextOpen);
            label.textContent = nextOpen ? 'Cerrar Filtros' : 'Filtros y Categorías';
        }
    };

    const bindUiFilters = () => {
        const searchInput = qs('.catalog-search input');
        const sortSelect = qs('.catalog-toolbar__sort select');
        const onlyKits = qs('#catalogOnlyKits');

        if (searchInput) {
            searchInput.value = state.searchText;
            const runSearch = () => {
                state.searchText = normalizeText(searchInput.value);
                state.visibleLimit = state.loadStep;
                applyFilters();
            };
            searchInput.addEventListener('input', runSearch);
            searchInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    runSearch();
                }
            });
        }

        if (sortSelect) {
            sortSelect.value = state.sort || 'relevance';
            sortSelect.addEventListener('change', () => {
                state.sort = sortSelect.value;
                state.visibleLimit = state.loadStep;
                applyFilters();
            });
        }

        if (onlyKits) {
            onlyKits.checked = state.onlyKits;
            onlyKits.addEventListener('change', () => {
                state.onlyKits = !!onlyKits.checked;
                state.visibleLimit = state.loadStep;
                applyFilters();
            });
        }

        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => toggleSidebar());
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') toggleSidebar(false);
            });
        }

        qsa('.catalog-toolbar__view-btn').forEach((button) => {
            button.addEventListener('click', () => {
                qsa('.catalog-toolbar__view-btn').forEach((item) => item.classList.remove('active'));
                button.classList.add('active');
                if (!grid) return;
                grid.classList.toggle('catalog-grid--list', button.dataset.view === 'list');
            });
        });

        qsa('[data-load-more]').forEach((button) => {
            button.addEventListener('click', () => {
                state.visibleLimit = Math.min(state.visibleProducts.length, state.visibleLimit + state.loadStep);
                renderCards();
            });
        });

        qsa('[data-clear-all]').forEach((button) => {
            button.addEventListener('click', resetFilters);
        });

        qsa('[data-chip-remove="categoria"]').forEach((button) => button.addEventListener('click', () => {
            state.selectedCategory = 'all';
            state.techFilters = {};
            state.visibleLimit = state.loadStep;
            applyFilters();
        }));

        qsa('[data-chip-remove-brand]').forEach((button) => button.addEventListener('click', () => {
            state.selectedBrands.delete(normalizeText(button.dataset.chipRemoveBrand));
            state.visibleLimit = state.loadStep;
            applyFilters();
        }));

        qsa('[data-chip-remove="search"]').forEach((button) => button.addEventListener('click', () => {
            state.searchText = '';
            const search = qs('.catalog-search input');
            if (search) search.value = '';
            state.visibleLimit = state.loadStep;
            applyFilters();
        }));

        qsa('[data-chip-remove="kits"]').forEach((button) => button.addEventListener('click', () => {
            state.onlyKits = false;
            const checkbox = qs('#catalogOnlyKits');
            if (checkbox) checkbox.checked = false;
            state.visibleLimit = state.loadStep;
            applyFilters();
        }));

        qsa('[data-chip-remove-tech]').forEach((button) => button.addEventListener('click', () => {
            delete state.techFilters[button.dataset.chipRemoveTech];
            state.visibleLimit = state.loadStep;
            applyFilters();
        }));
    };

    const resetFilters = () => {
        state.selectedCategory = 'all';
        state.selectedBrands = new Set();
        state.techFilters = {};
        state.minPrice = state.priceBounds.min || 0;
        state.maxPrice = state.priceBounds.max || Number.MAX_SAFE_INTEGER;
        state.searchText = '';
        state.sort = 'relevance';
        state.onlyKits = false;
        state.visibleLimit = state.loadStep;
        const search = qs('.catalog-search input');
        if (search) search.value = '';
        const sortSelect = qs('.catalog-toolbar__sort select');
        if (sortSelect) sortSelect.value = 'relevance';
        const kits = qs('#catalogOnlyKits');
        if (kits) kits.checked = false;
        renderPriceFilter();
        renderTechFilters();
        applyFilters();
    };

    const openQuickView = (productId) => {
        const modal = qs('#catalogQuickViewModal');
        if (!modal || !productId) return;
        const product = state.allProducts.find((item) => String(item.id) === String(productId));
        if (!product) return;
        const images = [product.imagen_url, ...(product.imagenes_adicionales || []).map((img) => img.imagen_url)].filter(Boolean);
        const safeImages = images.length ? images : [getFallbackImage(product)];
        let currentIndex = 0;

        const imageEl = qs('.catalog-quickview-modal__image', modal);
        const dotsEl = qs('[data-quickview-dots]', modal);
        const categoryEl = qs('[data-quickview-category]', modal);
        const refEl = qs('[data-quickview-ref]', modal);
        const priceEl = qs('[data-quickview-price]', modal);
        const oldPriceEl = qs('[data-quickview-old-price]', modal);
        const stockEl = qs('[data-quickview-stock]', modal);
        const specsEl = qs('[data-quickview-specs]', modal);
        const bulletsEl = qs('[data-quickview-bullets]', modal);
        const detailLink = qs('[data-quickview-detail]', modal);
        const buyBtn = qs('[data-quickview-buy]', modal);

        const renderImage = () => {
            if (!imageEl) return;
            imageEl.src = safeImages[currentIndex];
            imageEl.alt = product.nombre || 'Producto';
        };

        const renderDots = () => {
            if (!dotsEl) return;
            dotsEl.innerHTML = safeImages.map((_, index) => `<button type="button" class="catalog-quickview-modal__dot ${index === currentIndex ? 'is-active' : ''}" data-quickview-dot="${index}"></button>`).join('');
            qsa('[data-quickview-dot]', dotsEl).forEach((dot) => {
                dot.addEventListener('click', () => {
                    currentIndex = Number(dot.dataset.quickviewDot || 0);
                    renderImage();
                    renderDots();
                });
            });
        };

        if (categoryEl) categoryEl.textContent = product.categoria_nombre || getLineLabel(product.linea);
        if (refEl) refEl.textContent = `REF: ${product.referencia || product.slug}`;
        if (priceEl) priceEl.textContent = formatPrice(getProductPrice(product));
        if (oldPriceEl) {
            const oldPrice = getProductOldPrice(product);
            oldPriceEl.textContent = oldPrice ? formatPrice(oldPrice) : '';
            oldPriceEl.style.display = oldPrice ? '' : 'none';
        }
        if (stockEl) stockEl.textContent = Number(product.stock || 0) > 0 ? `Stock disponible: ${plainNumber.format(Number(product.stock || 0))}` : 'Agotado o sobre pedido';
        if (specsEl) {
            const specs = (product.campos_tecnicos || []).slice(0, 5).map((item) => `<div class="catalog-quick-spec"><span>${escapeHtml(item.nombre || item.campo_slug || '')}</span><strong>${escapeHtml(item.valor_mostrar || item.valor_texto || item.valor_opcion || item.valor_numero || '')}</strong></div>`);
            specsEl.innerHTML = specs.length ? specs.join('') : '<div class="filter-empty-note">No hay especificaciones disponibles.</div>';
        }
        if (bulletsEl) {
            const bullets = [];
            if (product.aplicacion_recomendada) bullets.push(product.aplicacion_recomendada);
            (product.caracteristicas || []).slice(0, 5).forEach((item) => bullets.push(item));
            bulletsEl.innerHTML = bullets.length ? bullets.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join('') : '';
        }
        if (detailLink) detailLink.href = `/producto/${product.slug}`;
        if (buyBtn) {
            buyBtn.onclick = async () => {
                if (!window.etiquetarCart) {
                    window.location.href = `/producto/${product.slug}`;
                    return;
                }
                try {
                    await window.etiquetarCart.addItem(product.id);
                    showToast('Producto agregado al carrito');
                } catch (_error) {
                    showToast('No se pudo agregar el producto');
                }
            };
        }

        renderImage();
        renderDots();
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');

        const close = () => {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
        };

        qsa('[data-close-quickview]', modal).forEach((button) => {
            button.onclick = close;
        });
        const prevBtn = qs('[data-quickview-prev]', modal);
        const nextBtn = qs('[data-quickview-next]', modal);
        if (prevBtn) prevBtn.onclick = () => {
            currentIndex = (currentIndex - 1 + safeImages.length) % safeImages.length;
            renderImage();
            renderDots();
        };
        if (nextBtn) nextBtn.onclick = () => {
            currentIndex = (currentIndex + 1) % safeImages.length;
            renderImage();
            renderDots();
        };

        modal._closeHandler = (event) => {
            if (event.key === 'Escape') close();
        };
        document.addEventListener('keydown', modal._closeHandler);
    };

    const loadCatalogData = async () => {
        if (!grid) return;
        const productsParams = new URLSearchParams();
        const categoriesParams = new URLSearchParams();
        if (state.line !== 'all') {
            productsParams.set('linea', state.line);
            categoriesParams.set('linea', state.line);
        }
        try {
            const [productsRes, categoriesRes] = await Promise.all([
                fetch(`/catalogo/api/productos${productsParams.toString() ? `?${productsParams.toString()}` : ''}`),
                fetch(`/catalogo/api/categorias${categoriesParams.toString() ? `?${categoriesParams.toString()}` : ''}`),
            ]);
            const productsPayload = await productsRes.json();
            const categoriesPayload = await categoriesRes.json();
            state.allProducts = Array.isArray(productsPayload.items) ? productsPayload.items : [];
            state.categories = Array.isArray(categoriesPayload) ? categoriesPayload : [];
            state.facets = productsPayload.facets || state.facets;
            state.priceBounds.min = Number(state.facets.price_min || 0);
            state.priceBounds.max = Number(state.facets.price_max || 0);
            if (!params.get('min_price')) state.minPrice = state.priceBounds.min || 0;
            if (!params.get('max_price')) state.maxPrice = state.priceBounds.max || Number.MAX_SAFE_INTEGER;
            if (!state.selectedBrands.size) {
                const existing = params.get('marca');
                if (existing) {
                    state.selectedBrands = new Set(existing.split(',').map(normalizeText).filter(Boolean));
                }
            }
            renderLineTabs();
            renderCategoryFilter();
            renderBrandFilter();
            renderTechFilters();
            renderPriceFilter();
            applyFilters();
        } catch (_error) {
            grid.innerHTML = '<div class="catalog-empty is-visible"><div class="catalog-empty__icon"><i class="fas fa-triangle-exclamation"></i></div><h3 class="catalog-empty__title">No se pudieron cargar los productos</h3><p class="catalog-empty__text">Intenta recargar la pagina.</p></div>';
        }
    };

    ensureShell();
    if (grid) {
        grid.classList.add('is-loading');
        grid.innerHTML = createSkeletonMarkup();
        setTimeout(async () => {
            await loadCatalogData();
            grid.classList.remove('is-loading');
        }, 320);
    }

    const staticCardHeaders = qsa('.sidebar-card__header');
    staticCardHeaders.forEach((header) => {
        header.addEventListener('click', () => {
            header.classList.toggle('collapsed');
            const body = header.nextElementSibling;
            if (body) body.style.display = header.classList.contains('collapsed') ? 'none' : 'block';
        });
    });

    bindUiFilters();
    ensureEmptyState();
    renderActiveFilters();
    setHeaderCopy();

    document.addEventListener('click', (event) => {
        const clearLine = event.target.closest('[data-chip-clear-line]');
        if (clearLine) {
            event.preventDefault();
            state.line = clearLine.dataset.chipClearLine;
            state.visibleLimit = state.loadStep;
            applyFilters();
        }
    });
});

const toastStyles = document.createElement('style');
toastStyles.textContent = `
    .app-toast {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 1100;
        background: #1A1A2E;
        color: #fff;
        border-left: 4px solid #00B4D8;
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 0.88rem;
        opacity: 0;
        transform: translateY(10px);
        pointer-events: none;
        transition: opacity 0.2s ease, transform 0.2s ease;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    }
    .app-toast.is-visible {
        opacity: 1;
        transform: translateY(0);
    }
`;
document.head.appendChild(toastStyles);
