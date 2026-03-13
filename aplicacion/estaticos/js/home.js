/* ============================================
   ETIQUETAR COLOMBIA — Homepage JavaScript
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
    } catch (error) {
      // noop
    }
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

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });

    document.addEventListener('click', (event) => {
      if (!menu.classList.contains('active')) return;
      if (menu.contains(event.target) || toggle.contains(event.target)) return;
      closeMenu();
    });
  }

  // ── Product Tabs ──
  const tabs = document.querySelectorAll('.products__tab');
  const productCards = document.querySelectorAll('.product-card');

  const activateProductTab = (line) => {
    tabs.forEach(t => {
      t.classList.remove('active--piscina', 'active--agua');
    });

    tabs.forEach(tab => {
      if (tab.dataset.line === line) {
        if (line === 'agua') tab.classList.add('active--agua');
        else tab.classList.add('active--piscina');
      }
    });

    productCards.forEach(card => {
      const cardLine = card.dataset.line;
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
      const line = tab.dataset.line;
      activateProductTab(line);
    });
  });

  document.querySelectorAll('[data-line-focus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const line = btn.dataset.lineFocus;
      if (!line) return;
      activateProductTab(line);
      document.querySelector('#productos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  const initialTab = document.querySelector('.products__tab.active--piscina, .products__tab.active--agua');
  if (initialTab?.dataset?.line) {
    activateProductTab(initialTab.dataset.line);
  }

  // ── Scroll animations (Intersection Observer) ──
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.category-card, .product-card, .section-title').forEach(el => {
    el.classList.add('animate-target');
    observer.observe(el);
  });

  // ── Add to Cart Animation ──
  document.querySelectorAll('.product-card__btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const productoId = btn.dataset.productId;
      if (!productoId) {
        showToast('Este producto aun no esta conectado al carrito.');
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
          }, 1200);
        })
        .catch((error) => {
          btn.innerHTML = original;
          btn.style.pointerEvents = '';
          showToast(error.message || 'No se pudo agregar el producto');
        });
    });
  });

  // ── Navbar scroll shadow ──
  const navbar = document.querySelector('.navbar');
  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const current = window.scrollY;
    if (current > 20) {
      navbar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)';
    } else {
      navbar.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
    }
    lastScroll = current;
  });

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
});

// ── CSS Animations (injected) ──
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
  .animate-target {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.5s ease, transform 0.5s ease;
  }
  .animate-target.animate-in {
    opacity: 1;
    transform: translateY(0);
  }
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
document.head.appendChild(animStyles);

// ── Global Theme + Language Controls ──
document.addEventListener('DOMContentLoaded', () => {
  const storageThemeKey = 'etiquetar_theme';
  const storageLangKey = 'etiquetar_lang';
  const themeToggleEnabled = false;

  const dict = {
    es: {
      'Inicio': 'Inicio',
      'Nosotros': 'Nosotros',
      'Contacto': 'Contacto',
      'Cotizar': 'Cotizar',
      'Blog': 'Blog',
      'Piscina & Spa': 'Piscina & Spa',
      'Tratamiento de Agua': 'Tratamiento de Agua',
      'Carrito': 'Carrito',
      'Mi perfil': 'Mi perfil',
      'Iniciar sesión': 'Iniciar sesión',
      'Envíanos un Mensaje': 'Envíanos un Mensaje',
      'Solicitar Cotización': 'Solicitar Cotización',
      'Nosotros': 'Nosotros',
      'Ver Catálogo': 'Ver Catálogo',
      'Comprar': 'Comprar'
    },
    en: {
      'Inicio': 'Home',
      'Nosotros': 'About Us',
      'Contacto': 'Contact',
      'Cotizar': 'Quote',
      'Blog': 'Blog',
      'Piscina & Spa': 'Pool & Spa',
      'Tratamiento de Agua': 'Water Treatment',
      'Carrito': 'Cart',
      'Mi perfil': 'My Profile',
      'Iniciar sesión': 'Sign In',
      'Envíanos un Mensaje': 'Send Us a Message',
      'Solicitar Cotización': 'Request a Quote',
      'Ver Catálogo': 'View Catalog',
      'Comprar': 'Buy'
    }
  };

  const applyTheme = (theme) => {
    const resolvedTheme = themeToggleEnabled && theme === 'dark' ? 'dark' : 'light';
    document.body.classList.toggle('theme-dark', resolvedTheme === 'dark');
    localStorage.setItem(storageThemeKey, resolvedTheme);
    const btn = document.querySelector('[data-site-theme]');
    if (btn) {
      btn.innerHTML = resolvedTheme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
      btn.disabled = !themeToggleEnabled;
      btn.setAttribute('aria-disabled', String(!themeToggleEnabled));
      btn.style.display = themeToggleEnabled ? '' : 'none';
    }
  };

  const translatePage = (lang) => {
    const target = dict[lang] || dict.es;
    document.documentElement.lang = lang;

    document.querySelectorAll('a, button, h1, h2, h3, h4, p, span, label, summary').forEach((el) => {
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
      ${themeToggleEnabled ? '<button class="site-control-btn" data-site-theme title="Cambiar tema"><i class="fas fa-moon"></i></button>' : ''}
      <button class="site-control-btn" data-site-lang title="Cambiar idioma">ES</button>
    `;
    document.body.appendChild(dock);

    const themeBtn = dock.querySelector('[data-site-theme]');
    const langBtn = dock.querySelector('[data-site-lang]');

    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const isDark = document.body.classList.contains('theme-dark');
        applyTheme(isDark ? 'light' : 'dark');
      });
    }

    langBtn.addEventListener('click', () => {
      const current = localStorage.getItem(storageLangKey) || 'es';
      translatePage(current === 'es' ? 'en' : 'es');
    });
  };

  renderControls();
  applyTheme('light');
  translatePage(localStorage.getItem(storageLangKey) || 'es');
});
