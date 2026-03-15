/* ===================================================== 
    ETIQUETAR COLOMBIA — Modern Effects JS v1 
    Agrega este archivo AL FINAL del <body>, después de home.js 
    <script src="../estaticos/js/effects.js"></script> 
    ===================================================== */ 
 
 document.addEventListener('DOMContentLoaded', () => { 
 
   /* ══════════════════════════════════════════════ 
      1. SCROLL REVEAL — IntersectionObserver 
         Detecta elementos y los anima al entrar 
      ══════════════════════════════════════════════ */ 
   const setupScrollReveal = () => { 
     // Asignar clases de animación automáticamente a los elementos correctos 
     const autoRevealMap = [ 
       { selector: '.lp-section__head',          anim: 'sr-fade-up' }, 
       { selector: '.lp-prod-card',               anim: 'sr-fade-up' }, 
       { selector: '.lp-cat-chip',                anim: 'sr-scale-up' }, 
       { selector: '.lp-review-card',             anim: 'sr-fade-up' }, 
       { selector: '.lp-article-card',            anim: 'sr-fade-up' }, 
       { selector: '.lp-stats__item',             anim: 'sr-fade-up' }, 
       { selector: '.lp-stats__tile',             anim: 'sr-scale-up' }, 
       { selector: '.lp-step',                    anim: 'sr-fade-up' }, 
       { selector: '.im-split__content',          anim: 'sr-fade-left' }, 
       { selector: '.im-split--reverse .im-split__content', anim: 'sr-fade-right' }, 
       { selector: '.lp-statement__inner',        anim: 'sr-fade-up' }, 
       { selector: '.lp-newsletter__inner',       anim: 'sr-scale-up' }, 
     ]; 
 
     // Aplicar stagger a grids 
     const staggerContainers = [ 
       '.lp-products__grid', 
       '.lp-cats__scroll', 
       '.lp-testimonials__grid', 
       '.lp-articles__grid', 
       '.lp-stats__tiles', 
       '.lp-stats__top', 
     ]; 
 
     autoRevealMap.forEach(({ selector, anim }) => { 
       document.querySelectorAll(selector).forEach(el => { 
         if (!el.classList.contains('sr-fade-up') && 
             !el.classList.contains('sr-fade-left') && 
             !el.classList.contains('sr-fade-right') && 
             !el.classList.contains('sr-scale-up')) { 
           el.classList.add(anim); 
         } 
       }); 
     }); 
 
     staggerContainers.forEach(selector => { 
       document.querySelectorAll(selector).forEach(container => { 
         container.classList.add('sr-stagger'); 
       }); 
     }); 
 
     // El observer que dispara las animaciones 
     const observer = new IntersectionObserver((entries) => { 
       entries.forEach(entry => { 
         if (entry.isIntersecting) { 
           // Manejar ambos tipos de clases: reveal-* y sr-*
           if (entry.target.classList.contains('reveal-hidden')) {
             entry.target.classList.add('reveal-visible');
           } else {
             entry.target.classList.add('sr-visible');
           }
           observer.unobserve(entry.target); 
         } 
       }); 
     }, { 
       threshold: 0.05, // Threshold reducido para secciones grandes
       rootMargin: '0px 0px -60px 0px' 
     }); 
 
     // Observar todos los elementos con clases de animación 
     document.querySelectorAll('.sr-fade-up, .sr-fade-left, .sr-fade-right, .sr-scale-up, .reveal-hidden').forEach(el => { 
       observer.observe(el); 
     }); 
 
     // Para elementos dentro de stagger containers, observar el container 
     document.querySelectorAll('.sr-stagger > *').forEach(child => { 
       if (!child.classList.contains('sr-fade-up') && !child.classList.contains('sr-scale-up')) { 
         child.classList.add('sr-fade-up'); 
         observer.observe(child); 
       } 
     }); 
   }; 
 
   /* ══════════════════════════════════════════════ 
      2. RIPPLE EFFECT — En todos los botones 
      ══════════════════════════════════════════════ */ 
   const setupRipple = () => { 
     const rippleTargets = document.querySelectorAll( 
       '.lp-hero__cta, .lp-statement__cta, .im-btn, .lp-prod-card__btn, .lp-newsletter__btn, .lp-lifestyle__cta, .lp-info-split__btn--white, .lp-info-split__btn--ghost' 
     ); 
 
     rippleTargets.forEach(btn => { 
       btn.addEventListener('click', function(e) { 
         const rect = btn.getBoundingClientRect(); 
         const ripple = document.createElement('span'); 
         ripple.className = 'btn-ripple-effect'; 
 
         const size = Math.max(rect.width, rect.height) * 2; 
         const x = e.clientX - rect.left - size / 2; 
         const y = e.clientY - rect.top - size / 2; 
 
         ripple.style.cssText = ` 
           width: ${size}px; 
           height: ${size}px; 
           left: ${x}px; 
           top: ${y}px; 
         `; 
 
         btn.appendChild(ripple); 
         setTimeout(() => ripple.remove(), 700); 
       }); 
     }); 
   }; 
 
   /* ══════════════════════════════════════════════ 
      3. PARALLAX TILT 3D — Im-card-parallax 
         Ya tienes el JS básico, este lo mejora 
      ══════════════════════════════════════════════ */ 
   const setupTilt = () => { 
     document.querySelectorAll('.im-card-parallax').forEach(card => { 
       let rafId; 
 
       card.addEventListener('mousemove', e => { 
         cancelAnimationFrame(rafId); 
         rafId = requestAnimationFrame(() => { 
           const rect = card.getBoundingClientRect(); 
           const x = e.clientX - rect.left; 
           const y = e.clientY - rect.top; 
           const centerX = rect.width / 2; 
           const centerY = rect.height / 2; 
 
           // Rotación suave — máximo 8 grados 
           const rotateX = ((y - centerY) / centerY) * -8; 
           const rotateY = ((x - centerX) / centerX) * 8; 
 
           // Efecto de luz que sigue el cursor 
           const lightX = (x / rect.width) * 100; 
           const lightY = (y / rect.height) * 100; 
 
           card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.03, 1.03, 1.03)`; 
           card.style.background = ` 
             radial-gradient(circle at ${lightX}% ${lightY}%, 
               rgba(255,255,255,0.15) 0%, 
               rgba(255,255,255,0.05) 40%, 
               rgba(255,255,255,0.02) 100% 
             ), 
             rgba(255, 255, 255, 0.07) 
           `; 
         }); 
       }); 
 
       card.addEventListener('mouseleave', () => { 
         cancelAnimationFrame(rafId); 
         card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)'; 
         card.style.background = ''; 
         card.style.transition = 'transform 0.6s ease, background 0.6s ease'; 
         setTimeout(() => { card.style.transition = ''; }, 600); 
       }); 
     }); 
   }; 
 
   /* ══════════════════════════════════════════════ 
      4. PRODUCT CARDS — Tilt 3D también 
      ══════════════════════════════════════════════ */ 
   const setupProductTilt = () => { 
     document.querySelectorAll('.lp-prod-card').forEach(card => { 
       let rafId; 
 
       card.addEventListener('mousemove', e => { 
         cancelAnimationFrame(rafId); 
         rafId = requestAnimationFrame(() => { 
           const rect = card.getBoundingClientRect(); 
           const x = e.clientX - rect.left; 
           const y = e.clientY - rect.top; 
           const centerX = rect.width / 2; 
           const centerY = rect.height / 2; 
 
           const rotateX = ((y - centerY) / centerY) * -5; 
           const rotateY = ((x - centerX) / centerX) * 5; 
 
           card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-14px) scale(1.02)`; 
           card.style.animationPlayState = 'paused'; 
         }); 
       }); 
 
       card.addEventListener('mouseleave', () => { 
         cancelAnimationFrame(rafId); 
         card.style.transform = ''; 
         card.style.animationPlayState = ''; 
       }); 
     }); 
   }; 
 
   /* ══════════════════════════════════════════════ 
      5. CURSOR PERSONALIZADO 
      ══════════════════════════════════════════════ */ 
   const setupCustomCursor = () => { 
     // Solo en desktop 
     if (window.innerWidth <= 1024) return; 
 
     const cursor = document.createElement('div'); 
     cursor.className = 'custom-cursor'; 
     const ring = document.createElement('div'); 
     ring.className = 'custom-cursor--ring'; 
 
     document.body.appendChild(cursor); 
     document.body.appendChild(ring); 
 
     let mouseX = 0, mouseY = 0; 
     let ringX = 0, ringY = 0; 
     let animId; 
 
     document.addEventListener('mousemove', e => { 
       mouseX = e.clientX; 
       mouseY = e.clientY; 
       cursor.style.left = mouseX + 'px'; 
       cursor.style.top = mouseY + 'px'; 
     }); 
 
     // Ring sigue con leve retraso (lerp) 
     const animateCursor = () => { 
       ringX += (mouseX - ringX) * 0.12; 
       ringY += (mouseY - ringY) * 0.12; 
       ring.style.left = ringX + 'px'; 
       ring.style.top = ringY + 'px'; 
       animId = requestAnimationFrame(animateCursor); 
     }; 
     animateCursor(); 
 
     // Expand ring al hover de interactivos 
     const hoverTargets = 'a, button, .lp-prod-card, .lp-cat-chip, .lp-review-card, .lp-article-card, .im-btn'; 
     document.querySelectorAll(hoverTargets).forEach(el => { 
       el.addEventListener('mouseenter', () => ring.classList.add('is-hovering')); 
       el.addEventListener('mouseleave', () => ring.classList.remove('is-hovering')); 
     }); 
   }; 
 
   /* ══════════════════════════════════════════════ 
      6. BURBUJAS EN EL HERO (decorativas) 
      ══════════════════════════════════════════════ */ 
   const setupHeroBubbles = () => { 
     const hero = document.querySelector('.lp-hero'); 
     if (!hero) return; 
 
     const bubbles = [ 
       { size: 60,  left: '8%',  duration: '9s',  delay: '0s' }, 
       { size: 40,  left: '18%', duration: '12s', delay: '2s' }, 
       { size: 80,  left: '75%', duration: '10s', delay: '1s' }, 
       { size: 30,  left: '85%', duration: '8s',  delay: '3s' }, 
       { size: 50,  left: '60%', duration: '11s', delay: '0.5s' }, 
     ]; 
 
     bubbles.forEach(b => { 
       const el = document.createElement('div'); 
       el.className = 'lp-hero__bubble'; 
       el.style.cssText = ` 
         width: ${b.size}px; 
         height: ${b.size}px; 
         left: ${b.left}; 
         bottom: 20%; 
         --duration: ${b.duration}; 
         --delay: ${b.delay}; 
       `; 
       hero.appendChild(el); 
     }); 
   }; 
 
   /* ══════════════════════════════════════════════ 
      7. COUNTER ANIMATION — Números que suben 
         (Mejora la que ya tienes en home.js) 
      ══════════════════════════════════════════════ */ 
   const setupCounters = () => { 
     const counters = document.querySelectorAll('.lp-stats__num'); 
 
     const animateNum = (el) => { 
       const text = el.textContent.trim(); 
       // Extraer número y sufijo (ej: "99.9%", "85+", "5 Tech") 
       const match = text.match(/^([\d.]+)(.*)$/); 
       if (!match) return; 
 
       const target = parseFloat(match[1]); 
       const suffix = match[2]; 
       const isDecimal = match[1].includes('.'); 
       const decimals = isDecimal ? (match[1].split('.')[1]?.length || 1) : 0; 
 
       const duration = 2000; 
       const start = performance.now(); 
 
       const step = (now) => { 
         const elapsed = now - start; 
         const progress = Math.min(elapsed / duration, 1); 
         const eased = 1 - Math.pow(1 - progress, 4); // ease out quart 
         const current = eased * target; 
 
         el.textContent = current.toFixed(decimals) + suffix; 
         if (progress < 1) requestAnimationFrame(step); 
         else el.textContent = target.toFixed(decimals) + suffix; 
       }; 
 
       el.textContent = '0' + suffix; 
       requestAnimationFrame(step); 
     }; 
 
     const counterObserver = new IntersectionObserver((entries) => { 
       entries.forEach(entry => { 
         if (entry.isIntersecting) { 
           animateNum(entry.target); 
           counterObserver.unobserve(entry.target); 
         } 
       }); 
     }, { threshold: 0.5 }); 
 
     counters.forEach(el => counterObserver.observe(el)); 
   }; 
 
   /* ══════════════════════════════════════════════ 
      8. SMOOTH SCROLL — Para links de ancla 
      ══════════════════════════════════════════════ */ 
   const setupSmoothScroll = () => { 
     document.querySelectorAll('a[href^="#"]').forEach(anchor => { 
       anchor.addEventListener('click', function(e) { 
         const target = document.querySelector(this.getAttribute('href')); 
         if (target) { 
           e.preventDefault(); 
           target.scrollIntoView({ behavior: 'smooth', block: 'start' }); 
         } 
       }); 
     }); 
   }; 
 
   /* ══════════════════════════════════════════════ 
      9. PARALLAX SCROLL — Imagen hero sutil 
      ══════════════════════════════════════════════ */ 
   const setupParallaxHero = () => { 
     const heroMedia = document.querySelector('.lp-hero__media'); 
     if (!heroMedia) return; 
 
     let ticking = false; 
 
     window.addEventListener('scroll', () => { 
       if (!ticking) { 
         requestAnimationFrame(() => { 
           const scrolled = window.scrollY; 
           const speed = 0.3; 
           heroMedia.style.transform = `translateY(${scrolled * speed}px)`; 
           ticking = false; 
         }); 
         ticking = true; 
       } 
     }, { passive: true }); 
   }; 
 
   /* ══════════════════════════════════════════════ 
      10. NAVBAR — Efecto de color al scroll 
          (Reemplaza el básico de home.js) 
      ══════════════════════════════════════════════ */ 
   const setupNavbarEffect = () => { 
     const navbar = document.getElementById('navbar'); 
     if (!navbar) return; 
 
     let lastScroll = 0; 
 
     window.addEventListener('scroll', () => { 
       const currentScroll = window.scrollY; 
 
       if (currentScroll > 60) { 
         navbar.classList.add('scrolled'); 
       } else { 
         navbar.classList.remove('scrolled'); 
       } 
 
       // Ocultar navbar al bajar, mostrar al subir 
       if (currentScroll > lastScroll && currentScroll > 300) { 
         navbar.style.transform = 'translateY(-100%)'; 
       } else { 
         navbar.style.transform = 'translateY(0)'; 
       } 
 
       lastScroll = currentScroll; 
     }, { passive: true }); 
 
     // Transición suave del navbar 
     navbar.style.transition = 'background 0.4s ease, box-shadow 0.4s ease, transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)'; 
   }; 
 
   // ══ INICIALIZAR TODOS LOS EFECTOS ══ 
   setupScrollReveal(); 
   setupRipple(); 
   setupTilt(); 
   setupProductTilt(); 
   setupCustomCursor(); 
   setupHeroBubbles(); 
   setupCounters(); 
   setupSmoothScroll(); 
   setupParallaxHero(); 
   setupNavbarEffect(); 
 
   console.log('✅ Etiquetar Effects v1 — Todos los efectos cargados.'); 
 });