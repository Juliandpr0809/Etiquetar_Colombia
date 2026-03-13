/* ============================================
   ETIQUETAR COLOMBIA — Homepage JavaScript
   Simplified & clean
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ── Toast notifications ──
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

  // ── Cart badge ──
  const updateCartBadge = (count) => {
    document.querySelectorAll('.navbar__cart-badge').forEach((badge) => {
      badge.textContent = count;
    });
  };

  const syncCartBadge = async () => {
    try {
      const response = await fetch('/carrito/api');
      const payload = await response.json();
      if (payload.ok) updateCartBadge(payload.data.total_items || 0);
    } catch (e) { /* noop */ }
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
        throw new Error(payload.message || 'No se pudo agregar al carrito.');
      }
      updateCartBadge(payload.data.total_items || 0);
      return payload;
    },
    syncBadge: syncCartBadge,
    showToast,
  };

  syncCartBadge();

  // ── Mobile Menu ──
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

  // ── Product Tabs (pill-style) ──
  const tabs = document.querySelectorAll('.products__tab');
  const productCards = document.querySelectorAll('.product-card');

  const activateTab = (line) => {
    tabs.forEach(t => t.classList.remove('products__tab--active'));
    tabs.forEach(tab => {
      if (tab.dataset.line === line) tab.classList.add('products__tab--active');
    });

    productCards.forEach(card => {
      const cardLine = card.dataset.line;
      if (line === 'todos' || cardLine === line) {
        card.style.display = '';
        card.style.opacity = '0';
        card.style.transform = 'translateY(12px)';
        requestAnimationFrame(() => {
          card.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
        });
      } else {
        card.style.display = 'none';
      }
    });
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.line));
  });

  // ── Navbar scroll effect ──
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });

  // ── Intersection Observer (fade in on scroll) ──
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.cat-card, .product-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(16px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(el);
  });

  // ── Add to Cart ──
  document.querySelectorAll('.product-card__btn').forEach(btn => {
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
          }, 1200);
        })
        .catch((error) => {
          btn.innerHTML = original;
          btn.style.pointerEvents = '';
          showToast(error.message || 'No se pudo agregar');
        });
    });
  });

});

// ── Injected styles for toast & animations ──
const styles = document.createElement('style');
styles.textContent = `
  .app-toast {
    position: fixed;
    right: 24px; bottom: 100px;
    z-index: 10000;
    background: #1A1A2E;
    color: #fff;
    border-left: 3px solid #0077B6;
    border-radius: 10px;
    padding: 12px 18px;
    font-size: 0.88rem;
    font-weight: 500;
    opacity: 0;
    transform: translateY(8px);
    pointer-events: none;
    transition: opacity 0.25s ease, transform 0.25s ease;
    box-shadow: 0 10px 30px rgba(0,0,0,0.15);
    max-width: 320px;
  }
  .app-toast.is-visible {
    opacity: 1;
    transform: translateY(0);
  }
`;
document.head.appendChild(styles);
