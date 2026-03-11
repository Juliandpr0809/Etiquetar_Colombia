/* ============================================
   ETIQUETAR COLOMBIA — Catalog Page JS
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

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

    const formatPrice = (value) => {
        const amount = Number(value || 0);
        return '$' + amount.toLocaleString('es-CO');
    };

    const isAdmin = document.body.dataset.isAdmin === 'true';

    const renderProductCard = (product) => {
        const price = Number(product.precio_final || product.precio || 0);
        const oldPrice = Number(product.descuento || 0) > 0 ? Number(product.precio || 0) : null;
        const image = product.imagen_url || `/placeholder/400x300/${line === 'piscina' ? 'F0F7FF/0077B6' : 'E8F4F8/1B8FA1'}?text=${encodeURIComponent(product.nombre)}`;
        const lineClass = line === 'piscina' ? 'piscina' : 'agua';
        const lineLabel = line === 'piscina' ? 'Piscina & Spa' : 'Tratamiento de Agua';
        const stockLabel = Number(product.stock || 0) > 0 ? 'En stock' : 'Sobre pedido';
        const stockClass = Number(product.stock || 0) > 0 ? 'in' : 'out';

        return `
            <div class="catalog-card" data-price="${price}" data-name="${product.nombre}" data-product-id="${product.id}">
                ${Number(product.descuento || 0) > 0 ? `<span class="catalog-card__badge catalog-card__badge--sale">-${Math.round(product.descuento)}%</span>` : ''}
                <div class="catalog-card__actions">
                    <button class="catalog-card__action ${lineClass}-hover" data-action="wishlist" title="Favoritos"><i class="far fa-heart"></i></button>
                    <button class="catalog-card__action ${lineClass}-hover" data-action="quickview" title="Vista rápida"><i class="far fa-eye"></i></button>
                </div>
                <div class="catalog-card__img">
                    <img src="${image}" alt="${product.nombre}">
                </div>
                <div class="catalog-card__body">
                    <div class="catalog-card__category catalog-card__category--${lineClass}">${lineLabel}</div>
                    <h3 class="catalog-card__name"><a href="#">${product.nombre}</a></h3>
                    <div class="catalog-card__sku">REF: ${product.slug}</div>
                    <div class="catalog-card__stock catalog-card__stock--${stockClass}"><i class="fas fa-circle"></i> ${stockLabel}</div>
                    <div class="catalog-card__pricing">
                        <span class="catalog-card__price catalog-card__price--${lineClass}">${formatPrice(price)}</span>
                        ${oldPrice ? `<span class="catalog-card__price-old">${formatPrice(oldPrice)}</span>` : ''}
                    </div>
                    <div class="catalog-card__tax">IVA incluido</div>
                    <div class="catalog-card__footer">
                        <button class="catalog-card__cart-btn catalog-card__cart-btn--${lineClass}" data-product-id="${product.id}"><i class="fas fa-cart-plus"></i> Comprar</button>
                        <button class="catalog-card__quote-btn" title="Cotizar"><i class="fas fa-file-alt"></i></button>
                    </div>
                    ${isAdmin ? `<div class="catalog-card__admin"><a class="catalog-card__admin-link" href="/admin/?tab=productos&producto=${product.id}"><i class="fas fa-pen"></i> Editar</a></div>` : ''}
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

    const updateEmptyState = () => {
        if (!grid) return;
        const empty = ensureEmptyState();
        const visibleCards = Array.from(grid.querySelectorAll('.catalog-card')).filter(card => card.style.display !== 'none');
        if (empty) empty.classList.toggle('is-visible', visibleCards.length === 0);
    };

    const updateCounts = (count) => {
        const countNodes = document.querySelectorAll('.catalog-header__count span');
        if (countNodes[0]) countNodes[0].textContent = count;

        const toolbarInfo = document.querySelector('.catalog-toolbar__info');
        if (toolbarInfo) {
            toolbarInfo.innerHTML = `Mostrando <span>${count ? '1–' + count : '0'}</span> de <span>${count}</span> productos`;
        }
    };

    const loadProductsFromApi = async () => {
        if (!grid) return;

        try {
            const response = await fetch('/catalogo/api/productos');
            const products = await response.json();
            const filtered = products.filter((product) => product.linea === line);
            grid.innerHTML = filtered.map(renderProductCard).join('');
            updateCounts(filtered.length);
            bindCardActions();
            document.querySelectorAll('.catalog-card').forEach(card => {
                card.style.opacity = '0';
                observer.observe(card);
            });
            updateEmptyState();
        } catch (error) {
            grid.innerHTML = '<div class="catalog-empty is-visible"><div class="catalog-empty__icon"><i class="fas fa-triangle-exclamation"></i></div><h3 class="catalog-empty__title">No se pudieron cargar los productos</h3><p class="catalog-empty__text">Intenta recargar la pagina.</p></div>';
        }
    };

    if (grid) {
        grid.classList.add('is-loading');
        grid.innerHTML = createSkeletonMarkup();
        setTimeout(async () => {
            await loadProductsFromApi();
            grid.classList.remove('is-loading');
        }, 550);
    }

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

    // ── Sidebar Category Click ──
    document.querySelectorAll('.sidebar-cat').forEach(cat => {
        cat.addEventListener('click', (e) => {
            e.preventDefault();
            const line = document.body.dataset.line || 'piscina';
            document.querySelectorAll('.sidebar-cat').forEach(c =>
                c.classList.remove('active--piscina', 'active--agua')
            );
            cat.classList.add(`active--${line}`);
            updateEmptyState();
        });
    });

    // ── Sidebar Card Collapse ──
    document.querySelectorAll('.sidebar-card__header').forEach(header => {
        header.addEventListener('click', () => {
            header.classList.toggle('collapsed');
            const body = header.nextElementSibling;
            body.style.display = header.classList.contains('collapsed') ? 'none' : 'block';
        });
    });

    // ── Mobile Sidebar Toggle ──
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

    // ── View Toggle (Grid / List) ──
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

    // ── Sort Select ──
    const sortSelect = document.querySelector('.catalog-toolbar__sort select');
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            const cards = Array.from(grid.querySelectorAll('.catalog-card'));
            const val = sortSelect.value;

            cards.sort((a, b) => {
                const priceA = parseInt(a.dataset.price) || 0;
                const priceB = parseInt(b.dataset.price) || 0;
                const nameA = a.dataset.name || '';
                const nameB = b.dataset.name || '';

                switch (val) {
                    case 'price-asc': return priceA - priceB;
                    case 'price-desc': return priceB - priceA;
                    case 'name-asc': return nameA.localeCompare(nameB);
                    case 'name-desc': return nameB.localeCompare(nameA);
                    default: return 0;
                }
            });

            cards.forEach(card => {
                card.style.animation = 'none';
                card.offsetHeight;
                card.style.animation = 'fadeInUp 0.3s ease forwards';
                grid.appendChild(card);
            });
        });
    }

    // ── Price Range Slider ──
    const slider = document.querySelector('.price-filter__slider');
    const maxInput = document.querySelector('.price-filter__input--max');
    if (slider && maxInput) {
        slider.addEventListener('input', () => {
            const val = parseInt(slider.value);
            maxInput.value = '$' + val.toLocaleString('es-CO');
        });
    }

    // ── Add to Cart ──
    bindCardActions();

    // ── Quick view / Wishlist buttons ──
    bindCardActions();

    // ── Pagination ──
    document.querySelectorAll('.catalog-pagination__btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            const line = document.body.dataset.line || 'piscina';
            document.querySelectorAll('.catalog-pagination__btn').forEach(b =>
                b.classList.remove('active--piscina', 'active--agua')
            );
            if (!btn.dataset.nav) btn.classList.add(`active--${line}`);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            updateEmptyState();
        });
    });

    // ── Scroll animations ──
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animation = 'fadeInUp 0.4s ease forwards';
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.05 });

    updateEmptyState();
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
