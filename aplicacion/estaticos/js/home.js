/* ============================================
   ETIQUETAR COLOMBIA — Homepage JavaScript v2
   "Dos mundos. Una marca. Cero confusión."
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ── Toast Notification ──
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
    toast._timer = setTimeout(() => toast.classList.remove('is-visible'), 2000);
  };

  // ── Cart Badge ──
  const updateCartBadge = (count) => {
    document.querySelectorAll('.navbar__cart-badge').forEach((badge) => {
      badge.textContent = count;
      badge.style.animation = 'none';
      badge.offsetHeight;
      badge.style.animation = 'cartPop 0.4s ease';
    });
  };

  const syncCartBadge = async () => {
    try {
      const response = await fetch('/carrito/api');
      const payload = await response.json();
      if (payload.ok) updateCartBadge(payload.data.total_items || 0);
    } catch (error) { /* noop */ }
  };

  const currencyFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

  const formatCurrencyNodes = () => {
    document.querySelectorAll([
      '[data-price-value]',
      '.lp-prod-card__price',
      '.lp-prod-card__price-old',
      '.product-card__price',
      '.product-card__price-old',
      '.cart-item__price',
      '.cart-item__price-old',
      '.cart-summary__line span:last-child',
      '.cart-summary__total span:last-child',
      '.track-response__price strong'
    ].join(',')).forEach((node) => {
      const raw = node.dataset.priceValue || node.textContent || '0';
      const normalized = Number(String(raw).replace(/[^0-9.-]/g, ''));
      if (Number.isNaN(normalized)) return;
      node.textContent = currencyFormatter.format(normalized);
    });
  };

  window.etiquetarCart = {
    addItem: async (productoId, cantidad = 1) => {
      const response = await fetch('/carrito/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ producto_id: productoId, cantidad })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.message || 'No se pudo agregar el producto al carrito.');
      }
      updateCartBadge(payload.data.total_items || 0);
      return payload;
    },
    syncBadge: syncCartBadge,
    showToast,
  };

  syncCartBadge();

  // ── Navbar Active Link Logic ──
  const currentPath = window.location.pathname;
  document.querySelectorAll('.navbar__link').forEach(link => {
    const linkPath = link.getAttribute('href');
    if (linkPath === currentPath || (currentPath.startsWith(linkPath) && linkPath !== '/')) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
    // Especial para el home
    if (currentPath === '/' && linkPath === '/') {
      link.classList.add('active');
    }
  });

  // ── Navbar World Routing + Catalog Switcher ──
  const nav = document.querySelector('.navbar');
  if (nav) {
    // Ensure world links always go to each landing page (not catalog).
    document.querySelectorAll('.navbar__link--piscina').forEach((link) => {
      link.setAttribute('href', '/piscina');
    });
    document.querySelectorAll('.navbar__link--agua').forEach((link) => {
      link.setAttribute('href', '/agua');
    });

    const navMenu = nav.querySelector('.navbar__menu');
    const catalogTrigger = navMenu
      ? Array.from(navMenu.querySelectorAll('.navbar__link')).find((link) => {
          return link.textContent.trim().toLowerCase().includes('cat');
        })
      : null;

    if (catalogTrigger) {
      catalogTrigger.classList.add('navbar__catalog-trigger');
      catalogTrigger.setAttribute('href', '#');
      catalogTrigger.setAttribute('aria-expanded', 'false');
      catalogTrigger.setAttribute('aria-controls', 'catalogBar');

      let catalogBar = document.getElementById('catalogBar');
      if (!catalogBar) {
        catalogBar = document.createElement('div');
        catalogBar.className = 'navbar__catalog-bar';
        catalogBar.id = 'catalogBar';
        catalogBar.innerHTML = `
          <div class="navbar__catalog-bar-inner">
            <span class="navbar__catalog-label">Elige el catálogo:</span>
            <a class="navbar__catalog-option navbar__catalog-option--piscina" href="/catalogo/piscina">
              <i class="fas fa-swimming-pool"></i> Piscina y Spa
            </a>
            <a class="navbar__catalog-option navbar__catalog-option--agua" href="/catalogo/agua">
              <i class="fas fa-tint"></i> Tratamiento de Agua
            </a>
          </div>
        `;
        nav.appendChild(catalogBar);
      }

      const setCatalogOpen = (isOpen) => {
        catalogBar.classList.toggle('is-open', isOpen);
        catalogTrigger.classList.toggle('is-open', isOpen);
        catalogTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      };

      catalogTrigger.addEventListener('click', (e) => {
        e.preventDefault();
        setCatalogOpen(!catalogBar.classList.contains('is-open'));
      });

      catalogBar.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => setCatalogOpen(false));
      });

      document.addEventListener('click', (e) => {
        if (!catalogBar.classList.contains('is-open')) return;
        if (catalogBar.contains(e.target) || catalogTrigger.contains(e.target)) return;
        setCatalogOpen(false);
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setCatalogOpen(false);
      });
    }
  }

  // ── Mobile Menu Toggle ──
  const toggle = document.querySelector('.navbar__toggle');
  const menu = document.querySelector('.navbar__menu');
  if (toggle && menu) {
    const closeMenu = () => {
      menu.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
      const icon = toggle.querySelector('i');
      icon.classList.add('fa-bars');
      icon.classList.remove('fa-times');
    };

    toggle.addEventListener('click', () => {
      menu.classList.toggle('active');
      const isOpen = menu.classList.contains('active');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      const icon = toggle.querySelector('i');
      icon.classList.toggle('fa-bars');
      icon.classList.toggle('fa-times');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });

    document.addEventListener('click', (e) => {
      if (!menu.classList.contains('active')) return;
      if (menu.contains(e.target) || toggle.contains(e.target)) return;
      closeMenu();
    });
  }

  // ── Product Tabs (landing pages) ──
  const tabs = document.querySelectorAll('.products__tab, .lp-products__tab');
  const productCards = document.querySelectorAll('.product-card, .lp-prod-card');

  const activateProductTab = (line, tabGroup) => {
    tabGroup.forEach(t => {
      t.classList.remove('active--piscina', 'active--agua', 'is-active');
    });

    tabGroup.forEach(tab => {
      const tabLine = tab.dataset.line || tab.dataset.lpCat;
      if (tabLine === line) {
        if (line === 'agua') tab.classList.add('active--agua');
        else tab.classList.add('active--piscina', 'is-active');
      }
    });

    productCards.forEach(card => {
      const cardLine = card.dataset.line || card.dataset.lpCat;
      if (line === 'todos' || cardLine === line) {
        card.style.display = '';
        card.style.animation = 'fadeInUp 0.4s ease forwards';
      } else {
        card.style.display = 'none';
      }
    });
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const line = tab.dataset.line || tab.dataset.lpCat;
      activateProductTab(line, tabs);
    });
  });

  // ── Add to Cart ──
  document.querySelectorAll('.product-card__btn, .lp-prod-card__btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const productoId = btn.dataset.productId;
      if (!productoId) {
        showToast('Este producto aún no está conectado al carrito.');
        return;
      }

      const original = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Agregando...';
      btn.style.pointerEvents = 'none';

      window.etiquetarCart.addItem(productoId)
        .then(() => {
          btn.innerHTML = '<i class="fas fa-check"></i> ¡Agregado!';
          showToast('Producto agregado al carrito');
          setTimeout(() => {
            btn.innerHTML = original;
            btn.style.pointerEvents = '';
          }, 1400);
        })
        .catch((error) => {
          btn.innerHTML = original;
          btn.style.pointerEvents = '';
          showToast(error.message || 'No se pudo agregar el producto');
        });
    });
  });

  formatCurrencyNodes();

  // ── Search toggle ──
  const searchBtn = document.querySelector('.navbar__action-btn--search');
  const searchBar = document.querySelector('.navbar__search-bar');
  if (searchBtn && searchBar) {
    searchBtn.addEventListener('click', () => {
      searchBar.classList.toggle('active');
      if (searchBar.classList.contains('active')) {
        searchBar.querySelector('input').focus();
      }
    });
  }

  // ── Language/Theme Controls ──
  const storageLangKey = 'etiquetar_lang';

  const dict = {
    es: {
      'Inicio': 'Inicio', 'Nosotros': 'Nosotros', 'Contacto': 'Contacto',
      'Cotizar': 'Cotizar', 'Blog': 'Blog', 'Purificación': 'Purificación',
      'Piscinas & Spa': 'Piscinas & Spa', 'Carrito': 'Carrito',
    },
    en: {
      'Inicio': 'Home', 'Nosotros': 'About Us', 'Contacto': 'Contact',
      'Cotizar': 'Quote', 'Blog': 'Blog', 'Purificación': 'Water Treatment',
      'Piscinas & Spa': 'Pool & Spa', 'Carrito': 'Cart',
    }
  };

  const translatePage = (lang) => {
    const target = dict[lang] || dict.es;
    document.documentElement.lang = lang;

    document.querySelectorAll('a, button, h1, h2, h3, h4, p, span, label').forEach((el) => {
      if (el.children.length > 0) return;
      const txt = (el.textContent || '').trim();
      if (!txt) return;
      if (!el.dataset.i18nOrig) el.dataset.i18nOrig = txt;
      const orig = el.dataset.i18nOrig;
      if (target[orig]) el.textContent = target[orig];
      else if (lang === 'es') el.textContent = orig;
    });

    localStorage.setItem(storageLangKey, lang);
    const btn = document.querySelector('[data-site-lang]');
    if (btn) btn.textContent = lang.toUpperCase();
  };

  const renderControls = () => {
    if (document.querySelector('.site-controls')) return;
    const dock = document.createElement('div');
    dock.className = 'site-controls';
    dock.innerHTML = `
      <button class="site-control-btn" data-site-lang title="Cambiar idioma">ES</button>
    `;
    document.body.appendChild(dock);

    const langBtn = dock.querySelector('[data-site-lang]');
    langBtn.addEventListener('click', () => {
      const current = localStorage.getItem(storageLangKey) || 'es';
      translatePage(current === 'es' ? 'en' : 'es');
    });
  };

  renderControls();
  translatePage(localStorage.getItem(storageLangKey) || 'es');

  /* Comentado por conflicto con effects.js
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('reveal-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal-hidden, .reveal, .reveal-stagger').forEach(el => {
    revealObserver.observe(el);
  });
  */
});

// ── CSS Animation Keyframes (injected) ──
const animStyles = document.createElement('style');
animStyles.textContent = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes cartPop {
    0% { transform: scale(1); }
    50% { transform: scale(1.4); }
    100% { transform: scale(1); }
  }
  .app-toast {
    position: fixed;
    right: 20px;
    bottom: 90px;
    z-index: 1100;
    background: #0B1F3A;
    color: #fff;
    border-left: 4px solid #4FC3C8;
    border-radius: 12px;
    padding: 12px 18px;
    font-size: 0.88rem;
    font-family: 'DM Sans', sans-serif;
    opacity: 0;
    transform: translateY(10px);
    pointer-events: none;
    transition: opacity 0.25s ease, transform 0.25s ease;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    max-width: 320px;
  }
  .app-toast.is-visible {
    opacity: 1;
    transform: translateY(0);
  }
`;
document.head.appendChild(animStyles);

// ── Gateway Panel Click ──
if (document.body.classList.contains('page-gateway')) {
  document.querySelectorAll('.split-hero__panel[data-href]').forEach(panel => {
    panel.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      window.location.href = panel.dataset.href;
    });
  });
}
