/**
 * Multistep diagnostic + contact form. Owns all client-side state, validation,
 * keyboard navigation, sessionStorage persistence, and the /api/leads submit
 * flow. The Cloudflare Pages Function re-validates and re-scores everything
 * server-side — nothing computed here is trusted for qualification.
 */
(function () {
  var STORAGE_STATE_KEY = 'cursiaDiagnosticState';
  var STORAGE_LAST_LEAD_KEY = 'cursiaLastLeadId';
  var TOTAL_STEPS = document.querySelectorAll('#p1 .q-step').length;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var REQUIRED_CONTACT_FIELDS = ['c-name', 'c-inst', 'c-role', 'c-country', 'c-email', 'c-whats'];

  var currentStep = 1;
  var isSubmitting = false;
  var startedTracked = false;

  var state = {
    answers: {},
    idempotencyKey: null
  };

  function genId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'idk-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function persist() {
    try {
      sessionStorage.setItem(STORAGE_STATE_KEY, JSON.stringify({
        answers: state.answers,
        idempotencyKey: state.idempotencyKey,
        currentStep: currentStep
      }));
    } catch (e) {}
  }

  function trackEvent(name, extra) {
    if (window.CursiaAnalytics) window.CursiaAnalytics.track(name, extra);
  }

  function trackStarted() {
    if (startedTracked) return;
    startedTracked = true;
    trackEvent(window.CursiaAnalytics ? window.CursiaAnalytics.EVENTS.DIAGNOSTIC_STARTED : 'diagnostic_started');
  }

  // ---- step rendering ----------------------------------------------------

  function clearStepError(step) {
    var grid = step.querySelector('.opt-grid');
    var err = step.querySelector('.q-error');
    if (grid) grid.classList.remove('has-error');
    if (err) err.hidden = true;
  }

  function showStepError(step) {
    var grid = step.querySelector('.opt-grid');
    var err = step.querySelector('.q-error');
    if (grid) grid.classList.add('has-error');
    if (err) err.hidden = false;
  }

  function isStepValid(step) {
    var field = step.getAttribute('data-field');
    if (field === 'openGoal') return true; // optional
    var val = state.answers[field];
    return Array.isArray(val) ? val.length > 0 : !!val;
  }

  function renderStep() {
    document.querySelectorAll('#p1 .q-step').forEach(function (el) {
      el.classList.toggle('is-active', Number(el.getAttribute('data-step')) === currentStep);
    });
    var of = document.getElementById('qOf');
    var fill = document.getElementById('qProgressFill');
    if (of) of.textContent = 'Pregunta ' + currentStep + ' de ' + TOTAL_STEPS;
    if (fill) {
      fill.style.width = (currentStep / TOTAL_STEPS * 100) + '%';
      var track = fill.parentElement;
      if (track) {
        track.setAttribute('aria-valuenow', String(currentStep));
        track.setAttribute('aria-valuemax', String(TOTAL_STEPS));
      }
    }
    var back = document.getElementById('qBack');
    if (back) back.disabled = currentStep === 1;
    persist();
  }

  function readStepField(step) {
    var field = step.getAttribute('data-field');
    if (field === 'openGoal') return;
    var grid = step.querySelector('.opt-grid');
    var selected = Array.prototype.slice.call(grid.querySelectorAll('.opt-card.selected'))
      .map(function (c) { return c.getAttribute('data-value'); });
    state.answers[field] = grid.hasAttribute('data-multi') ? selected : (selected[0] || '');
    persist();
  }

  window.cursiaSelect = function (el) {
    trackStarted();
    var grid = el.closest('.opt-grid');
    var step = el.closest('.q-step');
    if (grid.hasAttribute('data-multi')) {
      var nowSelected = !el.classList.contains('selected');
      el.classList.toggle('selected', nowSelected);
      el.setAttribute('aria-pressed', nowSelected ? 'true' : 'false');
    } else {
      grid.querySelectorAll('.opt-card').forEach(function (o) {
        o.classList.remove('selected');
        o.setAttribute('aria-pressed', 'false');
      });
      el.classList.add('selected');
      el.setAttribute('aria-pressed', 'true');
    }
    clearStepError(step);
    readStepField(step);
  };

  window.cursiaTab = function (id, btn) {
    document.querySelectorAll('.diag-tab').forEach(function (t) { t.classList.remove('active'); });
    document.querySelectorAll('.diag-panel').forEach(function (p) { p.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById(id).classList.add('active');
  };

  window.cursiaQStep = function (delta) {
    if (delta > 0) {
      var activeStep = document.querySelector('#p1 .q-step[data-step="' + currentStep + '"]');
      if (activeStep && !isStepValid(activeStep)) {
        showStepError(activeStep);
        var firstCard = activeStep.querySelector('.opt-card');
        if (firstCard) firstCard.focus();
        return;
      }
      trackEvent(window.CursiaAnalytics ? window.CursiaAnalytics.EVENTS.DIAGNOSTIC_STEP_COMPLETED : 'diagnostic_step_completed', { step: currentStep });
    }
    var next = currentStep + delta;
    if (next < 1) return;
    if (next > TOTAL_STEPS) {
      window.cursiaTab('p2', document.querySelectorAll('.diag-tab')[1]);
      return;
    }
    currentStep = next;
    renderStep();
  };

  // Roving keyboard focus (Left/Right/Up/Down) between option cards in the active grid.
  document.querySelectorAll('#p1 .opt-grid').forEach(function (grid) {
    grid.addEventListener('keydown', function (e) {
      if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].indexOf(e.key) === -1) return;
      var cards = Array.prototype.slice.call(grid.querySelectorAll('.opt-card'));
      var idx = cards.indexOf(document.activeElement);
      if (idx === -1) return;
      e.preventDefault();
      var delta = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
      cards[(idx + delta + cards.length) % cards.length].focus();
    });
  });

  // Q10 open text
  var openGoalEl = document.getElementById('qOpenGoal');
  var openGoalCount = document.getElementById('qOpenGoalCount');
  function updateOpenGoalCount() {
    if (!openGoalEl || !openGoalCount) return;
    openGoalCount.textContent = openGoalEl.value.length + ' / 500';
  }
  if (openGoalEl) {
    openGoalEl.addEventListener('input', function () {
      trackStarted();
      state.answers.openGoal = openGoalEl.value;
      updateOpenGoalCount();
      persist();
    });
  }

  // ---- contact form validation --------------------------------------------

  function fieldError(id, message) {
    var input = document.getElementById(id);
    var err = document.getElementById('err-' + id);
    var field = input ? input.closest('.field') : null;
    if (field) field.classList.add('has-error');
    if (input) input.setAttribute('aria-invalid', 'true');
    if (err) { err.textContent = message; err.hidden = false; }
  }

  function fieldOk(id) {
    var input = document.getElementById(id);
    var err = document.getElementById('err-' + id);
    var field = input ? input.closest('.field') : null;
    if (field) field.classList.remove('has-error');
    if (input) input.removeAttribute('aria-invalid');
    if (err) { err.hidden = true; err.textContent = ''; }
  }

  function validateContact() {
    var ok = true;
    REQUIRED_CONTACT_FIELDS.forEach(function (id) {
      var el = document.getElementById(id);
      var val = el ? el.value.trim() : '';
      if (!val) { fieldError(id, 'Este campo es obligatorio.'); ok = false; }
      else fieldOk(id);
    });
    var email = document.getElementById('c-email');
    if (email && email.value.trim() && !EMAIL_RE.test(email.value.trim())) {
      fieldError('c-email', 'Ingresa un correo electrónico válido.');
      ok = false;
    }
    var whats = document.getElementById('c-whats');
    if (whats && whats.value.trim()) {
      var digits = whats.value.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) {
        fieldError('c-whats', 'Ingresa un número de WhatsApp válido.');
        ok = false;
      }
    }
    var web = document.getElementById('c-web');
    fieldOk('c-web'); // optional — never blocks submission
    void web;

    var priv = document.getElementById('c-priv');
    var privErr = document.getElementById('err-c-priv');
    if (priv && !priv.checked) {
      if (privErr) { privErr.textContent = 'Debes autorizar el tratamiento de datos para continuar.'; privErr.hidden = false; }
      ok = false;
    } else if (privErr) {
      privErr.hidden = true;
    }
    return ok;
  }

  function collectPayload() {
    return {
      idempotencyKey: state.idempotencyKey,
      answers: state.answers,
      contact: {
        name: document.getElementById('c-name').value.trim(),
        institution: document.getElementById('c-inst').value.trim(),
        role: document.getElementById('c-role').value.trim(),
        country: document.getElementById('c-country').value.trim(),
        email: document.getElementById('c-email').value.trim(),
        whatsapp: document.getElementById('c-whats').value.trim(),
        website: document.getElementById('c-web').value.trim(),
        dataAuthorized: !!document.getElementById('c-priv').checked
      },
      utm: window.CursiaAnalytics ? window.CursiaAnalytics.getUtm() : {},
      pageUrl: window.location.href
    };
  }

  window.cursiaSubmitLead = function () {
    if (isSubmitting) return;
    var submitErr = document.getElementById('err-c-submit');
    if (submitErr) { submitErr.hidden = true; submitErr.textContent = ''; }
    if (!validateContact()) return;

    isSubmitting = true;
    var btn = document.getElementById('qSubmit');
    var originalLabel = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }

    if (!state.idempotencyKey) state.idempotencyKey = genId();
    persist();

    trackEvent(window.CursiaAnalytics ? window.CursiaAnalytics.EVENTS.LEAD_FORM_SUBMITTED : 'lead_form_submitted');

    window.cursiaTab('p3', document.querySelectorAll('.diag-tab')[2]);
    if (window.CursiaCalendly) window.CursiaCalendly.showLoading();

    fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectPayload())
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        isSubmitting = false;
        if (btn) { btn.disabled = false; btn.innerHTML = originalLabel; }
        if (!result.ok || !result.data || result.data.success !== true) {
          var msg = (result.data && result.data.message) || 'No pudimos guardar la información en este momento. Por favor, inténtalo nuevamente.';
          if (window.CursiaCalendly) window.CursiaCalendly.showError(msg);
          return;
        }
        var leadId = result.data.leadId;
        var qualified = !!result.data.qualified;
        try {
          sessionStorage.setItem(STORAGE_LAST_LEAD_KEY, leadId);
          sessionStorage.removeItem(STORAGE_STATE_KEY);
        } catch (e) {}
        trackEvent(window.CursiaAnalytics ? window.CursiaAnalytics.EVENTS.LEAD_SAVED : 'lead_saved', { lead_id: leadId });
        trackEvent(qualified
          ? (window.CursiaAnalytics ? window.CursiaAnalytics.EVENTS.QUALIFIED_LEAD : 'qualified_lead')
          : (window.CursiaAnalytics ? window.CursiaAnalytics.EVENTS.UNQUALIFIED_LEAD : 'unqualified_lead'),
          { lead_id: leadId });
        if (window.CursiaCalendly) window.CursiaCalendly.reveal(qualified, leadId);
      })
      .catch(function () {
        isSubmitting = false;
        if (btn) { btn.disabled = false; btn.innerHTML = originalLabel; }
        if (window.CursiaCalendly) window.CursiaCalendly.showError('No pudimos guardar la información en este momento. Por favor, inténtalo nuevamente.');
      });
  };

  // ---- restore in-progress state (reload mid-flow) ------------------------

  function restore() {
    try {
      var raw = sessionStorage.getItem(STORAGE_STATE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      state.answers = saved.answers || {};
      state.idempotencyKey = saved.idempotencyKey || null;

      Object.keys(state.answers).forEach(function (field) {
        if (field === 'openGoal') {
          if (openGoalEl) openGoalEl.value = state.answers.openGoal || '';
          return;
        }
        var step = document.querySelector('#p1 .q-step[data-field="' + field + '"]');
        if (!step) return;
        var val = state.answers[field];
        var values = Array.isArray(val) ? val : [val];
        step.querySelectorAll('.opt-card').forEach(function (card) {
          var match = values.indexOf(card.getAttribute('data-value')) !== -1;
          card.classList.toggle('selected', match);
          card.setAttribute('aria-pressed', match ? 'true' : 'false');
        });
      });

      if (saved.currentStep) currentStep = Math.min(Math.max(1, saved.currentStep), TOTAL_STEPS);
    } catch (e) {}
  }

  restore();
  renderStep();
  updateOpenGoalCount();
})();
