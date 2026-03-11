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

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const line = tab.dataset.line;

      // Update active tab
      tabs.forEach(t => {
        t.classList.remove('active--piscina', 'active--agua');
      });
      if (line === 'piscina') tab.classList.add('active--piscina');
      else if (line === 'agua') tab.classList.add('active--agua');
      else {
        // "Todos" tab — use piscina style for active
        tab.classList.add('active--piscina');
      }

      // Filter products with animation
      productCards.forEach(card => {
        const cardLine = card.dataset.line;
        if (line === 'todos' || cardLine === line) {
          card.style.display = '';
          card.style.animation = 'fadeInUp 0.4s ease forwards';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

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
