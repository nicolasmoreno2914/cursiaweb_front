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
