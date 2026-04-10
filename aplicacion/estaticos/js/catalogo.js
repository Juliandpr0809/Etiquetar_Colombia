/* ============================================
   ETIQUETAR COLOMBIA — Catalog Page JS
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    const qs = (s) => document.querySelector(s);
    const qsa = (s) => Array.from(document.querySelectorAll(s));

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

    const grid = document.querySelector('.catalog-grid');
    const line = document.body.dataset.line || 'piscina';
    const isAdmin = document.body.dataset.isAdmin === 'true';

    const state = {
        allProducts: [],
        visibleProducts: [],
        categories: [],
        selectedCategory: 'all',
        selectedOnlyKits: false,
        maxPrice: Number.MAX_SAFE_INTEGER,
        stockIn: true,
        stockOut: true,
        searchText: '',
        sort: 'relevance',
    };

    const formatPrice = (value) => {
        const amount = Number(value || 0);
        return '$' + amount.toLocaleString('es-CO');
    };

    const renderProductCard = (product) => {
        const price = Number(product.precio_final || product.precio || 0);
        const precioAnterior = product.precio_anterior != null ? Number(product.precio_anterior) : null;
        const descuentoPromo = Number(product.descuento || 0);
        const oldPrice = (precioAnterior != null && precioAnterior > price)
            ? precioAnterior
            : (descuentoPromo > 0 ? Number(product.precio || 0) : null);
        const descuentoPercent = descuentoPromo > 0
            ? Math.round(descuentoPromo)
            : (oldPrice != null && oldPrice > 0 ? Math.round((1 - price / oldPrice) * 100) : 0);
        const showBadge = descuentoPercent > 0;
        const image = product.imagen_url || `/placeholder/400x300/${line === 'piscina' ? 'F0F7FF/0077B6' : 'E8F4F8/1B8FA1'}?text=${encodeURIComponent(product.nombre)}`;
        const lineClass = line === 'piscina' ? 'piscina' : 'agua';
        const stockLabel = Number(product.stock || 0) > 0 ? 'En stock' : 'Sobre pedido';
        const stockClass = Number(product.stock || 0) > 0 ? 'in' : 'out';
        const categoryLabel = product.categoria_nombre || (line === 'piscina' ? 'Piscina & Spa' : 'Tratamiento de Agua');
        const bundleType = product.tipo_producto || (product.es_kit ? 'kit' : 'estandar');
        const kitBadge = bundleType !== 'estandar'
            ? `<span class="catalog-card__badge catalog-card__badge--kit">${bundleType === 'combo' ? 'Combo' : 'Kit'}</span>`
            : '';

        return `
            <div class="catalog-card" data-price="${price}" data-name="${product.nombre}" data-product-id="${product.id}">
                ${showBadge ? `<span class="catalog-card__badge catalog-card__badge--sale">-${descuentoPercent}%</span>` : ''}
            ${kitBadge}
                <div class="catalog-card__actions">
                    <button class="catalog-card__action ${lineClass}-hover" data-action="wishlist" title="Favoritos"><i class="far fa-heart"></i></button>
                    <button class="catalog-card__action ${lineClass}-hover" data-action="quickview" title="Vista rápida"><i class="far fa-eye"></i></button>
                </div>
                <div class="catalog-card__img">
                    <img src="${image}" alt="${product.nombre}">
                </div>
                <div class="catalog-card__body">
                    <div class="catalog-card__category catalog-card__category--${lineClass}">${categoryLabel}</div>
                    <h3 class="catalog-card__name"><a href="/producto/${product.slug}">${product.nombre}</a></h3>
                    <div class="catalog-card__sku">REF: ${product.referencia || product.slug}</div>
                    <div class="catalog-card__stock catalog-card__stock--${stockClass}"><i class="fas fa-circle"></i> ${stockLabel}</div>
                    <div class="catalog-card__pricing">
                        <span class="catalog-card__price catalog-card__price--${lineClass}">${formatPrice(price)}</span>
                        ${oldPrice ? `<span class="catalog-card__price-old">${formatPrice(oldPrice)}</span>` : ''}
                    </div>
                    <div class="catalog-card__tax">IVA incluido</div>
                    <div class="catalog-card__footer">
                        <button class="catalog-card__cart-btn catalog-card__cart-btn--${lineClass}" data-product-id="${product.id}"><i class="fas fa-cart-plus"></i> Comprar</button>
                        ${product.ficha_url
                            ? `<a class="catalog-card__quote-btn" title="Ficha técnica" href="${product.ficha_url}" target="_blank" rel="noopener"><i class="fas fa-file-pdf"></i></a>`
                            : `<a class="catalog-card__quote-btn" title="Ver producto" href="/producto/${product.slug}"><i class="fas fa-file-alt"></i></a>`
                        }
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

    const createSkeletonMarkup = () => {
        return Array.from({ length: 6 }).map(() => `
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
    };

    const ensureEmptyState = () => {
        if (!grid) return null;
        let empty = document.querySelector('.catalog-empty');
        if (!empty) {
            empty = document.createElement('section');
            empty.className = 'catalog-empty';
            empty.innerHTML = `
                <div class="catalog-empty__icon"><i class="fas fa-box-open"></i></div>
                <h3 class="catalog-empty__title">No hay productos para este filtro</h3>
                <p class="catalog-empty__text">Prueba cambiar categoría, precio o disponibilidad.</p>
            `;
            grid.insertAdjacentElement('afterend', empty);
        }
        return empty;
    };

    const updateCounts = (count) => {
        const countNodes = document.querySelectorAll('.catalog-header__count span');
        if (countNodes[0]) countNodes[0].textContent = count;

        const toolbarInfo = document.querySelector('.catalog-toolbar__info');
        if (toolbarInfo) {
            toolbarInfo.innerHTML = `Mostrando <span>${count ? '1–' + count : '0'}</span> de <span>${count}</span> productos`;
        }
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animation = 'fadeInUp 0.4s ease forwards';
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.05 });

    const renderCards = (products) => {
        if (!grid) return;
        grid.innerHTML = products.map(renderProductCard).join('');
        updateCounts(products.length);
        bindCardActions();
        Array.from(grid.querySelectorAll('.catalog-card')).forEach(card => {
            card.style.opacity = '0';
            observer.observe(card);
        });
        const empty = ensureEmptyState();
        if (empty) empty.classList.toggle('is-visible', products.length === 0);
    };

    const sortProducts = (products) => {
        const ordered = [...products];
        switch (state.sort) {
            case 'price-asc':
                ordered.sort((a, b) => Number(a.precio_final || a.precio || 0) - Number(b.precio_final || b.precio || 0));
                break;
            case 'price-desc':
                ordered.sort((a, b) => Number(b.precio_final || b.precio || 0) - Number(a.precio_final || a.precio || 0));
                break;
            case 'name-asc':
                ordered.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
                break;
            case 'name-desc':
                ordered.sort((a, b) => (b.nombre || '').localeCompare(a.nombre || ''));
                break;
            default:
                break;
        }
        return ordered;
    };

    const applyFilters = () => {
        let filtered = state.allProducts.filter((p) => p.linea === line);
        if (state.selectedCategory !== 'all') {
            filtered = filtered.filter((p) => String(p.categoria_slug || '') === String(state.selectedCategory));
        }
        filtered = filtered.filter((p) => Number(p.precio_final || p.precio || 0) <= state.maxPrice);
        filtered = filtered.filter((p) => {
            const inStock = Number(p.stock || 0) > 0;
            return (inStock && state.stockIn) || (!inStock && state.stockOut);
        });
        if (state.searchText) {
            const term = state.searchText.toLowerCase();
            filtered = filtered.filter((p) =>
                (p.nombre || '').toLowerCase().includes(term)
                || (p.slug || '').toLowerCase().includes(term)
                || (p.referencia || '').toLowerCase().includes(term)
                || (p.marca || '').toLowerCase().includes(term)
            );
        }
        if (state.selectedOnlyKits) {
            filtered = filtered.filter((p) => (p.tipo_producto || (p.es_kit ? 'kit' : 'estandar')) !== 'estandar');
        }
        state.visibleProducts = sortProducts(filtered);
        renderCards(state.visibleProducts);
    };

    const renderTypeFilter = () => {
        const root = qs('#catalogTypeFilter');
        if (!root) return;
        const kitsCount = state.allProducts.filter((p) => {
            const tipo = p.tipo_producto || (p.es_kit ? 'kit' : 'estandar');
            return p.linea === line && tipo !== 'estandar';
        }).length;
        root.innerHTML = `
            <div class="filter-checks">
                <label class="filter-check">
                    <input type="checkbox" id="catalogOnlyKits">
                    <span class="filter-check__label">Solo combos / kits</span>
                    <span class="filter-check__num">(${kitsCount})</span>
                </label>
            </div>
        `;
        const onlyKits = qs('#catalogOnlyKits');
        if (onlyKits) {
            onlyKits.addEventListener('change', () => {
                state.selectedOnlyKits = !!onlyKits.checked;
                applyFilters();
            });
        }
    };

    const renderCategoryFilter = () => {
        const root = qs('#catalogCategoryList');
        if (!root) return;
        const lineCategories = state.categories.filter((c) => c.linea === line);
        const lineProducts = state.allProducts.filter((p) => p.linea === line);
        const totalLine = lineProducts.length;
        const lineClass = line === 'piscina' ? 'active--piscina' : 'active--agua';

        const bySlug = {};
        lineProducts.forEach((p) => {
            const slug = p.categoria_slug || 'sin-categoria';
            bySlug[slug] = (bySlug[slug] || 0) + 1;
        });

        const rendered = [
            `<a class="sidebar-cat ${state.selectedCategory === 'all' ? lineClass : ''}" href="#" data-category="all">
                Todas las categorías <span class="sidebar-cat__count">${totalLine}</span>
            </a>`
        ];

        lineCategories.forEach((category) => {
            const total = bySlug[category.slug] || 0;
            if (!total) return;
            rendered.push(`
                <a class="sidebar-cat ${state.selectedCategory === category.slug ? lineClass : ''}" href="#" data-category="${category.slug}">
                    ${category.nombre} <span class="sidebar-cat__count">${total}</span>
                </a>
            `);
        });

        root.innerHTML = rendered.join('');
        root.querySelectorAll('.sidebar-cat').forEach((cat) => {
            cat.addEventListener('click', (e) => {
                e.preventDefault();
                state.selectedCategory = cat.dataset.category || 'all';
                renderCategoryFilter();
                applyFilters();
            });
        });
    };

    const bindCardActions = () => {
        document.querySelectorAll('.catalog-card__cart-btn').forEach(btn => {
            if (btn.dataset.bound === 'true') return;
            btn.dataset.bound = 'true';
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const productoId = btn.dataset.productId;
                if (!productoId || !window.etiquetarCart) {
                    showToast('No se pudo conectar con el carrito.');
                    return;
                }
                const original = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Agregando...';
                btn.style.pointerEvents = 'none';

                try {
                    await window.etiquetarCart.addItem(productoId);
                    btn.innerHTML = '<i class="fas fa-check"></i> ¡Agregado!';
                    showToast('Producto agregado al carrito');
                    setTimeout(() => {
                        btn.innerHTML = original;
                        btn.style.pointerEvents = '';
                    }, 1200);
                } catch (error) {
                    btn.innerHTML = original;
                    btn.style.pointerEvents = '';
                    showToast(error.message || 'No se pudo agregar el producto');
                }
            });
        });

        document.querySelectorAll('.catalog-card__action').forEach(btn => {
            if (btn.dataset.bound === 'true') return;
            btn.dataset.bound = 'true';
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'wishlist') {
                    btn.classList.toggle('added');
                    if (btn.classList.contains('added')) {
                        btn.innerHTML = '<i class="fas fa-heart" style="color:#e74c3c;"></i>';
                    } else {
                        btn.innerHTML = '<i class="far fa-heart"></i>';
                    }
                }
            });
        });
    };

    const bindUiFilters = () => {
        const slider = document.querySelector('.price-filter__slider');
        const maxInput = document.querySelector('.price-filter__input--max');
        if (slider && maxInput) {
            state.maxPrice = Number(slider.value || Number.MAX_SAFE_INTEGER);
            slider.addEventListener('input', () => {
                const val = parseInt(slider.value, 10) || Number.MAX_SAFE_INTEGER;
                state.maxPrice = val;
                maxInput.value = '$' + val.toLocaleString('es-CO');
                applyFilters();
            });
        }

        const availability = qsa('.filter-check input[type="checkbox"]');
        if (availability.length >= 2) {
            const [stockIn, stockOut] = availability;
            stockIn.addEventListener('change', () => {
                state.stockIn = !!stockIn.checked;
                applyFilters();
            });
            stockOut.addEventListener('change', () => {
                state.stockOut = !!stockOut.checked;
                applyFilters();
            });
        }

        const searchInput = document.querySelector('.catalog-search input');
        if (searchInput) {
            const runSearch = () => {
                state.searchText = (searchInput.value || '').trim();
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

        const sortSelect = document.querySelector('.catalog-toolbar__sort select');
        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                state.sort = sortSelect.value;
                applyFilters();
            });
        }
    };

    const bindStaticUi = () => {
        document.querySelectorAll('.sidebar-card__header').forEach(header => {
            header.addEventListener('click', () => {
                header.classList.toggle('collapsed');
                const body = header.nextElementSibling;
                body.style.display = header.classList.contains('collapsed') ? 'none' : 'block';
            });
        });

        const sidebarToggle = document.querySelector('.catalog-sidebar-toggle');
        const sidebar = document.querySelector('.catalog-sidebar');
        if (sidebarToggle && sidebar) {
            sidebarToggle.setAttribute('aria-expanded', 'false');

            const closeSidebar = () => {
                sidebar.classList.remove('active');
                document.body.style.overflow = '';
                const icon = sidebarToggle.querySelector('i');
                icon.classList.replace('fa-times', 'fa-sliders');
                sidebarToggle.querySelector('span').textContent = 'Filtros y Categorías';
                sidebarToggle.setAttribute('aria-expanded', 'false');
            };

            sidebarToggle.addEventListener('click', () => {
                sidebar.classList.toggle('active');
                const icon = sidebarToggle.querySelector('i');
                if (sidebar.classList.contains('active')) {
                    icon.classList.replace('fa-sliders', 'fa-times');
                    sidebarToggle.querySelector('span').textContent = 'Cerrar Filtros';
                    sidebarToggle.setAttribute('aria-expanded', 'true');
                    document.body.style.overflow = 'hidden';
                } else {
                    closeSidebar();
                }
            });

            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && sidebar.classList.contains('active')) {
                    closeSidebar();
                }
            });
        }

        const viewBtns = document.querySelectorAll('.catalog-toolbar__view-btn');
        viewBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                viewBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (!grid) return;
                if (btn.dataset.view === 'list') {
                    grid.classList.add('catalog-grid--list');
                } else {
                    grid.classList.remove('catalog-grid--list');
                }
            });
        });

        document.querySelectorAll('.catalog-pagination__btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });
    };

    const loadProductsAndCategories = async () => {
        if (!grid) return;
        try {
            const [productsRes, categoriesRes] = await Promise.all([
                fetch('/catalogo/api/productos'),
                fetch('/catalogo/api/categorias'),
            ]);
            const products = await productsRes.json();
            const categories = await categoriesRes.json();
            state.allProducts = Array.isArray(products) ? products : [];
            state.categories = Array.isArray(categories) ? categories : [];
            renderCategoryFilter();
            renderTypeFilter();
            applyFilters();
        } catch (_error) {
            grid.innerHTML = '<div class="catalog-empty is-visible"><div class="catalog-empty__icon"><i class="fas fa-triangle-exclamation"></i></div><h3 class="catalog-empty__title">No se pudieron cargar los productos</h3><p class="catalog-empty__text">Intenta recargar la pagina.</p></div>';
        }
    };

    if (grid) {
        grid.classList.add('is-loading');
        grid.innerHTML = createSkeletonMarkup();
        setTimeout(async () => {
            await loadProductsAndCategories();
            grid.classList.remove('is-loading');
        }, 450);
    }

    bindUiFilters();
    bindStaticUi();
    ensureEmptyState();
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
