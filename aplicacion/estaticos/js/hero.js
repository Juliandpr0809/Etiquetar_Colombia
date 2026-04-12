/* ============================================
   ETIQUETAR COLOMBIA — Pentair Style JS
   Portal loader + Reveal animations
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  const portalsGrid = document.getElementById('portalsGrid');

  // ── Portal Cards Rendering ──
  const renderPortals = (data) => {
    if (!portalsGrid) return;

    const portalsHtml = data.map(portal => `
      <div class="portal-card portal-card--${portal.slug}">
        <div class="portal-card__bg" style="background-image: url('${portal.imagen_url}');"></div>
        <div class="portal-card__overlay"></div>
        <div class="portal-card__content">
          <img src="${portal.logo_url}" alt="${portal.nombre} Logo" class="portal-card__logo">
          <span class="portal-card__eyebrow">${portal.nombre}</span>
          <h3 class="portal-card__title">${portal.accion}</h3>
          <a href="${portal.enlace}" class="portal-card__link">
            <span>${portal.descripcion || 'Leer más'}</span>
            <span class="portal-card__arrow">→</span>
          </a>
        </div>
      </div>
    `).join('');

    portalsGrid.innerHTML = portalsHtml;
    initRevealAnimations();
  };

  const showErrorState = () => {
    if (!portalsGrid) return;
    portalsGrid.innerHTML = `
      <div class="portals__error">
        <p>No se pudieron cargar los servicios en este momento.</p>
        <button class="portals__error-btn" onclick="location.reload()">Reintentar</button>
      </div>
    `;
  };

  const initRevealAnimations = () => {
    const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -40px 0px' };
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, observerOptions);

    document.querySelectorAll('.portal-card').forEach((el, i) => {
      el.style.transitionDelay = `${i * 0.1}s`;
      revealObserver.observe(el);
    });
  };

  // ── Fallback Data (Pentair-style descriptions) ──
  const fallbackData = [
    {
      slug: 'agua',
      nombre: 'Etiquetar Flow',
      accion: 'Purifica',
      descripcion: 'Suministro y purificación de agua',
      enlace: '/flow',
      imagen_url: '/estaticos/img/portal_agua.png',
      logo_url: '../estaticos/img/Modern_Logo_for_Etiquetar_de_Colombia_S.A.S.-removebg-preview.png'
    },
    {
      slug: 'piscina',
      nombre: 'Etiquetar Pool',
      accion: 'Disfruta',
      descripcion: 'Explora piscina y spa',
      enlace: '/pool',
      imagen_url: '/estaticos/img/portal_piscina.png',
      logo_url: '../estaticos/img/Modern_Logo_for_Etiquetar_de_Colombia_S.A.S.-removebg-preview.png'
    },
    {
      slug: 'industrial',
      nombre: 'Etiquetar Industrial',
      accion: 'Produce',
      descripcion: 'Filtración y sellado industrial',
      enlace: '/industrial',
      imagen_url: '/estaticos/img/portal_industrial.png',
      logo_url: '../estaticos/img/Modern_Logo_for_Etiquetar_de_Colombia_S.A.S.-removebg-preview.png'
    }
  ];

  const initPortals = async () => {
    if (!portalsGrid) return;

    try {
      const response = await fetch('/api/home/portals', { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error();
      const payload = await response.json();
      if (payload.ok && payload.data) {
        renderPortals(payload.data);
      } else {
        throw new Error();
      }
    } catch (e) {
      console.log('Cargando servicios locales (fallback)...');
      renderPortals(fallbackData);
    }
  };

  initPortals();
});
