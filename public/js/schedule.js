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

  // Google's appointment iframe doesn't tell the parent page when someone
  // finishes booking (no postMessage on completion), so this is a timed
  // guess, not a real detection. First nudge at 35s — long enough that
  // someone still browsing times won't be interrupted, short enough to
  // catch most people right after they book. One more nudge at 2 minutes
  // for slower bookings; then it stops so it doesn't nag.
  var CHECKIN_DELAYS_MS = [35000, 125000];
  var checkinTimers = [];

  function clearCheckinTimers() {
    checkinTimers.forEach(function (id) { clearTimeout(id); });
    checkinTimers = [];
  }

  function scheduleCheckins() {
    clearCheckinTimers();
    CHECKIN_DELAYS_MS.forEach(function (delay) {
      checkinTimers.push(setTimeout(showBookingModal, delay));
    });
  }

  function showBookingModal() {
    var modal = document.getElementById('bookingModal');
    var confirmBar = document.getElementById('confirmBar');
    // Don't interrupt if the person already left this step, or the calendar
    // panel isn't the one showing.
    if (!modal || !confirmBar || confirmBar.hidden) return;
    modal.hidden = false;
    var dismissBtn = modal.querySelector('.booking-modal-close');
    if (dismissBtn) dismissBtn.focus();
  }

  function hideBookingModal() {
    var modal = document.getElementById('bookingModal');
    if (modal) modal.hidden = true;
  }

  function initBookingModal() {
    var modal = document.getElementById('bookingModal');
    if (!modal || modal.dataset.wired) return;
    modal.dataset.wired = 'true';
    modal.querySelectorAll('[data-modal-dismiss]').forEach(function (el) {
      el.addEventListener('click', hideBookingModal);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) hideBookingModal();
    });
  }

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
      initBookingModal();
      scheduleCheckins();
    } else {
      if (p.qualified) p.qualified.hidden = true;
      if (p.unqualified) p.unqualified.hidden = false;
      if (confirmBar) confirmBar.hidden = true;
      clearCheckinTimers();
      hideBookingModal();
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
