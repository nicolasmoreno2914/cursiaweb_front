/**
 * The scheduling iframe is never present in the initial page markup — it's
 * only created here, and only after diagnostic.js has confirmed a
 * successful, qualified lead save. That absence (not a CSS display:none) is
 * what guarantees the calendar can't show before a lead is saved.
 *
 * Uses the same Google Calendar Appointment Schedule already wired into
 * every other CTA on this site (see index.html) — no separate booking tool.
 */
(function () {
  var SCHEDULE_URL = 'https://calendar.google.com/calendar/appointments/schedules/AcZssZ3wRjWpN4h-ZxfyJuhri7_fBSOQdIlvFidsRpFzUYIIQITKlC-6etptDmRXIxukW95PAICI5rBv?gv=true';

  function renderQualified() {
    var container = document.getElementById('calContainer');
    if (!container) return;
    container.innerHTML = '';
    var iframe = document.createElement('iframe');
    iframe.src = SCHEDULE_URL;
    iframe.style.border = '0';
    iframe.style.width = '100%';
    iframe.style.minWidth = '320px';
    iframe.style.height = '700px';
    iframe.title = 'Agendar diagnóstico con Cursia';
    container.appendChild(iframe);
  }

  function panels() {
    return {
      loading: document.getElementById('p3-loading'),
      error: document.getElementById('p3-error'),
      qualified: document.getElementById('p3-qualified'),
      unqualified: document.getElementById('p3-unqualified')
    };
  }

  function showLoading() {
    var p = panels();
    if (p.loading) p.loading.hidden = false;
    if (p.error) p.error.hidden = true;
    if (p.qualified) p.qualified.hidden = true;
    if (p.unqualified) p.unqualified.hidden = true;
  }

  function showError(message) {
    var p = panels();
    if (p.loading) p.loading.hidden = true;
    if (p.qualified) p.qualified.hidden = true;
    if (p.unqualified) p.unqualified.hidden = true;
    if (p.error) p.error.hidden = false;
    var msgEl = document.getElementById('p3-error-message');
    if (msgEl && message) msgEl.textContent = message;
  }

  function reveal(qualified) {
    var p = panels();
    if (p.loading) p.loading.hidden = true;
    if (p.error) p.error.hidden = true;
    var confirmBar = document.getElementById('confirmBar');

    if (qualified) {
      if (p.unqualified) p.unqualified.hidden = true;
      if (p.qualified) p.qualified.hidden = false;
      renderQualified();
      if (confirmBar) confirmBar.hidden = false;
    } else {
      if (p.qualified) p.qualified.hidden = true;
      if (p.unqualified) p.unqualified.hidden = false;
      if (confirmBar) confirmBar.hidden = true;
    }

    var section = document.getElementById('diagnostico');
    if (section) {
      requestAnimationFrame(function () {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  window.CursiaCalendly = {
    reveal: reveal,
    showLoading: showLoading,
    showError: showError
  };
})();
