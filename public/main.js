// ============================================================
// Cursia — site interactivity
// ============================================================
(function () {
  'use strict';

  // ----------------------------------------------------------
  // Sticky header: add/remove .scrolled class on scroll
  // ----------------------------------------------------------
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () {
      if (window.scrollY > 8) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // run once on load
  }

  // ----------------------------------------------------------
  // Mobile menu toggle
  // ----------------------------------------------------------
  var toggle = document.querySelector('.nav-toggle');
  var menu   = document.querySelector('.mobile-menu');
  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      var isOpen = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Close menu when any link inside is clicked
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });

    // Close menu on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('open')) {
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  // ----------------------------------------------------------
  // FAQ accordion — one item open at a time
  // ----------------------------------------------------------
  document.querySelectorAll('.faq-item').forEach(function (item) {
    var btn = item.querySelector('.faq-q');
    if (!btn) return;

    btn.addEventListener('click', function () {
      var isOpen = item.classList.contains('open');

      // Close all
      document.querySelectorAll('.faq-item.open').forEach(function (i) {
        i.classList.remove('open');
        var b = i.querySelector('.faq-q');
        if (b) b.setAttribute('aria-expanded', 'false');
      });

      // Open clicked if it was closed
      if (!isOpen) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // ----------------------------------------------------------
  // Course showcase carousel
  // ----------------------------------------------------------
  (function () {
    var showcase = document.querySelector('.showcase');
    if (!showcase) return;

    var slides    = Array.prototype.slice.call(showcase.querySelectorAll('.showcase-slide'));
    var dots      = Array.prototype.slice.call(showcase.querySelectorAll('.showcase-dot'));
    var prevBtn   = showcase.querySelector('.showcase-prev');
    var nextBtn   = showcase.querySelector('.showcase-next');
    var counter   = showcase.querySelector('.showcase-counter');
    var capTitle  = showcase.querySelector('.showcase-caption-title');
    var capDesc   = showcase.querySelector('.showcase-caption-desc');
    var total     = slides.length;
    var current   = 0;
    var autoTimer = null;
    var isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var DATA = [
      {
        num: '01',
        title: 'Vista general del curso',
        desc: 'Presentación del curso con unidades, capítulos, duración, objetivos y estructura general.'
      },
      {
        num: '02',
        title: 'Versión en audio del curso',
        desc: 'El contenido también puede escucharse para reforzar el aprendizaje de forma práctica.'
      },
      {
        num: '03',
        title: 'Videos educativos por capítulo',
        desc: 'Cursia puede generar videos explicativos para acompañar los temas principales del curso y reforzar la comprensión del estudiante.'
      },
      {
        num: '04',
        title: 'Lecciones en video adaptadas al tema',
        desc: 'Cada capítulo puede tener su propio video educativo con explicación visual, ejemplos y narrativa adaptada al contenido.'
      },
      {
        num: '05',
        title: 'Actividades interactivas',
        desc: 'Juegos, retos y preguntas para practicar y validar lo aprendido.'
      }
    ];

    function goTo(n) {
      if (n < 0) n = total - 1;
      if (n >= total) n = 0;

      // Update slides
      slides[current].classList.remove('active');
      slides[n].classList.add('active');

      // Update dots
      dots[current].classList.remove('active');
      dots[current].setAttribute('aria-selected', 'false');
      dots[n].classList.add('active');
      dots[n].setAttribute('aria-selected', 'true');

      // Update caption
      var d = DATA[n];
      if (counter)  counter.textContent  = d.num + ' / 0' + total;
      if (capTitle) capTitle.textContent = d.title;
      if (capDesc)  capDesc.textContent  = d.desc;

      current = n;
    }

    // Arrow buttons
    if (prevBtn) prevBtn.addEventListener('click', function () {
      goTo(current - 1);
      resetAuto();
    });
    if (nextBtn) nextBtn.addEventListener('click', function () {
      goTo(current + 1);
      resetAuto();
    });

    // Dot clicks
    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        goTo(i);
        resetAuto();
      });
    });

    // Keyboard navigation (left/right) when showcase is focused/hovered
    showcase.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft')  { goTo(current - 1); resetAuto(); }
      if (e.key === 'ArrowRight') { goTo(current + 1); resetAuto(); }
    });

    // Touch / swipe support
    var touchStartX = 0;
    var touchEndX   = 0;
    showcase.addEventListener('touchstart', function (e) {
      touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });
    showcase.addEventListener('touchend', function (e) {
      touchEndX = e.changedTouches[0].clientX;
      var diff = touchStartX - touchEndX;
      if (Math.abs(diff) > 40) {
        goTo(diff > 0 ? current + 1 : current - 1);
        resetAuto();
      }
    }, { passive: true });

    // Autoplay (5s, skip if reduced-motion)
    function startAuto() {
      if (isReducedMotion) return;
      autoTimer = setInterval(function () { goTo(current + 1); }, 5000);
    }
    function resetAuto() {
      clearInterval(autoTimer);
      startAuto();
    }

    // Pause on hover / focus
    showcase.addEventListener('mouseenter', function () { clearInterval(autoTimer); });
    showcase.addEventListener('mouseleave', function () { startAuto(); });
    showcase.addEventListener('focusin',    function () { clearInterval(autoTimer); });
    showcase.addEventListener('focusout',   function () { startAuto(); });

    startAuto();
  })();

  // ----------------------------------------------------------
  // Reveal on scroll
  //
  // Strategy:
  //  1) Immediately reveal anything already in or near the viewport.
  //  2) Use IntersectionObserver to reveal the rest as the user scrolls.
  //  3) Safety net: after 1.4s reveal everything in case IO is blocked.
  // ----------------------------------------------------------
  var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  if (reveals.length === 0) return;

  var vh = window.innerHeight || document.documentElement.clientHeight;

  // Step 1 – reveal elements already visible on load
  reveals.forEach(function (el) {
    var rect = el.getBoundingClientRect();
    if (rect.top < vh * 0.95) {
      el.classList.add('in');
    }
  });

  // Step 2 – IntersectionObserver for the rest
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.05, rootMargin: '0px 0px -40px 0px' }
    );

    reveals.forEach(function (el) {
      if (!el.classList.contains('in')) {
        io.observe(el);
      }
    });
  } else {
    // Fallback for old browsers: reveal all immediately
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  // Step 3 – safety net
  setTimeout(function () {
    document.querySelectorAll('.reveal:not(.in)').forEach(function (el) {
      el.classList.add('in');
    });
  }, 1400);

})();
