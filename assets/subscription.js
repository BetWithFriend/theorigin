/**
 * Origin subscription flow.
 * Completely separate from the main-questionnaire inline script — same general
 * interaction patterns (step machine, auto-advance, sessionStorage persistence)
 * re-implemented here as a standalone module.
 *
 * NOTE: The vendor/bundle recommendation (see SubscriptionScoring below) and the
 * pricing table are explicit SIMULATIONS standing in for business logic that is
 * still being finalized. Replace both once the real subscription bundle service
 * is ready — everything else (step UI, cart submission) should keep working.
 */
(function () {
  var SUBSCRIPTION_RESULTS_STATE_KEY = 'subscriptionResultsState';
  var SUBSCRIPTION_TOTAL_STEPS = 4;
  var SUBSCRIPTION_AUTO_ADVANCE_MS = 300;
  var SUBSCRIPTION_FIELD_TO_SHEET_ID = {
    tier: 'subscriptionEditTier',
    quantity: 'subscriptionEditQuantity',
    profile: 'subscriptionEditProfile',
    grind: 'subscriptionEditGrind',
  };

  var SUBSCRIPTION_TIER_LABELS = {
    specialty: 'Origin Specialty',
    premium: 'Origin Premium',
  };
  var SUBSCRIPTION_PROFILE_LABELS = {
    classic: 'הקלאסי',
    balanced: 'המאוזן',
    adventurous: 'הרפתקני',
  };
  var SUBSCRIPTION_PROFILE_SHORT_DESC = {
    classic: 'עשיר ושוקולדי',
    balanced: 'מתוק עם נגיעות פרי',
    adventurous: 'פירותי ופרחוני',
  };
  var SUBSCRIPTION_GRIND_LABELS = {
    whole: 'פולים שלמים',
    espresso: 'אספרסו - טחינה דקה',
    moka: 'מקינטה / קפה שחור - טחינה דקה-בינונית',
    v60: 'V60 / פילטר - טחינה בינונית',
    frenchpress: "Cold Brew / פרנץ' פרס - טחינה גסה",
  };

  /* PLACEHOLDER: content-based mapping from this flow's answers to the existing
     coffee_tastes / coffee_prep_methods metafield tags, used only to simulate a
     vendor recommendation. Replace when the real subscription logic exists. */
  var SUBSCRIPTION_PROFILE_TASTE_TAG = {
    classic: 'Rich & Chocolaty',
    balanced: 'Sweet & Caramelly',
    adventurous: 'Fruity & Floral',
  };
  var SUBSCRIPTION_GRIND_PREP_TAG = {
    whole: null,
    espresso: 'Espresso',
    moka: 'MokaPot',
    v60: 'Filter',
    frenchpress: null,
  };
  var SUBSCRIPTION_FALLBACK_VENDORS = ['אור זך', 'קנופי', 'קפה איכות', 'הקליה המקומית'];

  window.subscriptionAnswers = window.subscriptionAnswers || {
    tier: null,
    quantity: null,
    profile: null,
    grind: null,
  };

  /* ── Simulated recommendation engine ──────────────────────────────────── */
  window.SubscriptionScoring = (function () {
    var cachedProducts = null;

    function loadProducts() {
      if (cachedProducts) return cachedProducts;
      var el = document.getElementById('subscription-products-data');
      if (!el) {
        cachedProducts = [];
        return cachedProducts;
      }
      try {
        cachedProducts = JSON.parse(el.textContent || '[]') || [];
      } catch (e) {
        cachedProducts = [];
      }
      return cachedProducts;
    }

    function simpleHash(str) {
      var hash = 0;
      for (var i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) | 0;
      }
      return Math.abs(hash);
    }

    function fallbackVendor(profile, grind) {
      var idx = simpleHash(String(profile) + '|' + String(grind)) % SUBSCRIPTION_FALLBACK_VENDORS.length;
      return { vendorShortName: SUBSCRIPTION_FALLBACK_VENDORS[idx], vendorName: SUBSCRIPTION_FALLBACK_VENDORS[idx], product: null };
    }

    function pickVendor(profile, grind) {
      var products = loadProducts();
      var tasteTag = SUBSCRIPTION_PROFILE_TASTE_TAG[profile];
      var prepTag = SUBSCRIPTION_GRIND_PREP_TAG[grind];

      var scored = products
        .map(function (product) {
          var tastes = (product.metafields && product.metafields.coffee_tastes) || [];
          var preps = (product.metafields && product.metafields.coffee_prep_methods) || [];
          var score = 0;
          if (tasteTag && tastes.indexOf(tasteTag) !== -1) score += 2;
          if (prepTag && preps.indexOf(prepTag) !== -1) score += 1;
          return { product: product, score: score };
        })
        .filter(function (entry) {
          return entry.score > 0 && entry.product.available;
        });

      if (!scored.length) {
        return fallbackVendor(profile, grind);
      }

      var byVendor = {};
      scored.forEach(function (entry) {
        var key = entry.product.vendor_short_name || entry.product.vendor || 'unknown';
        if (!byVendor[key]) byVendor[key] = { total: 0, best: entry };
        byVendor[key].total += entry.score;
        if (entry.score > byVendor[key].best.score) byVendor[key].best = entry;
      });

      var bestVendorKey = Object.keys(byVendor).sort(function (a, b) {
        return byVendor[b].total - byVendor[a].total;
      })[0];

      var winner = byVendor[bestVendorKey];
      return {
        vendorShortName: bestVendorKey,
        vendorName: winner.best.product.vendor || bestVendorKey,
        product: winner.best.product,
      };
    }

    return { pickVendor: pickVendor };
  })();

  /* ── Pricing (simulation) ──────────────────────────────────────────────── */
  function computeSubscriptionPrice(answers) {
    var settings = window.subscriptionSettings;
    if (!settings || !settings.pricing || !answers.tier || !answers.quantity) return null;
    var tierTable = settings.pricing[answers.tier];
    var base = tierTable && tierTable[answers.quantity];
    if (typeof base !== 'number') return null;
    var discountPct = (settings.promoDiscountPercent || 0) / 100;
    var discounted = Math.round(base * (1 - discountPct));
    return { original: base, discounted: discounted };
  }

  /* ── Step machine ──────────────────────────────────────────────────────── */
  function activateSubscriptionStep(stepIndex) {
    document.querySelectorAll('.subscription-step').forEach(function (el) {
      el.classList.remove('active');
    });
    var target = document.querySelector('.subscription-step[data-step-index="' + stepIndex + '"]');
    if (target) target.classList.add('active');
  }

  function currentSubscriptionStepIndex() {
    var active = document.querySelector('.subscription-step.active[data-step-index]');
    return active ? active.getAttribute('data-step-index') : null;
  }

  function goToPreviousSubscriptionStep() {
    var current = currentSubscriptionStepIndex();
    if (!current || current === '1' || current === 'results') return;
    activateSubscriptionStep(String(parseInt(current, 10) - 1));
  }
  window.goToPreviousSubscriptionStep = goToPreviousSubscriptionStep;

  function goToNextSubscriptionStep() {
    var current = currentSubscriptionStepIndex();
    if (!current || current === 'results') return;
    var next = parseInt(current, 10) + 1;
    if (next > SUBSCRIPTION_TOTAL_STEPS) {
      showSubscriptionResults();
    } else {
      activateSubscriptionStep(String(next));
    }
  }

  function syncSubscriptionOptionSelectedStates() {
    var answers = window.subscriptionAnswers;
    document.querySelectorAll('.subscription-options[data-field]').forEach(function (group) {
      var field = group.getAttribute('data-field');
      var current = answers[field] == null ? null : String(answers[field]);
      group.querySelectorAll('.subscription-option').forEach(function (btn) {
        btn.classList.toggle('selected', current !== null && btn.getAttribute('data-value') === current);
      });
    });
  }

  function persistSubscriptionState() {
    try {
      sessionStorage.setItem(
        SUBSCRIPTION_RESULTS_STATE_KEY,
        JSON.stringify({
          answers: window.subscriptionAnswers,
          showResults: currentSubscriptionStepIndex() === 'results',
        })
      );
    } catch (e) {
      /* sessionStorage unavailable (e.g. private mode) — flow still works, just without persistence */
    }
  }

  function attachSubscriptionOptionListeners() {
    document.querySelectorAll('.subscription-options[data-field]').forEach(function (group) {
      var field = group.getAttribute('data-field');
      group.querySelectorAll('.subscription-option').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var value = btn.getAttribute('data-value');
          window.subscriptionAnswers[field] = field === 'quantity' ? parseInt(value, 10) : value;
          group.querySelectorAll('.subscription-option.selected').forEach(function (el) {
            el.classList.remove('selected');
          });
          btn.classList.add('selected');
          persistSubscriptionState();
          setTimeout(goToNextSubscriptionStep, SUBSCRIPTION_AUTO_ADVANCE_MS);
        });
      });
    });
  }

  /* ── Results rendering ─────────────────────────────────────────────────── */
  function renderSubscriptionResults() {
    var answers = window.subscriptionAnswers;

    var rowsEl = document.getElementById('subscriptionSummaryRows');
    if (rowsEl) {
      rowsEl.innerHTML = '';
      var kg = answers.quantity ? answers.quantity / 4 : null;
      var profileValue = SUBSCRIPTION_PROFILE_LABELS[answers.profile] || '';
      if (profileValue && SUBSCRIPTION_PROFILE_SHORT_DESC[answers.profile]) {
        profileValue += ': ' + SUBSCRIPTION_PROFILE_SHORT_DESC[answers.profile];
      }
      var entries = [
        ['רמת המנוי', SUBSCRIPTION_TIER_LABELS[answers.tier] || ''],
        ['כמות שקיות', answers.quantity ? answers.quantity + ' שקיות (' + kg + ' ק"ג)' : ''],
        ['הפרופיל', profileValue],
        ['הטחינה', SUBSCRIPTION_GRIND_LABELS[answers.grind] || ''],
      ];
      entries.forEach(function (entry) {
        var row = document.createElement('div');
        row.className = 'subscription-summary-row';

        var label = document.createElement('span');
        label.className = 'subscription-summary-row-label';
        label.textContent = entry[0] + ': ';

        var value = document.createElement('span');
        value.className = 'subscription-summary-row-value';
        value.textContent = entry[1];

        row.appendChild(label);
        row.appendChild(value);
        rowsEl.appendChild(row);
      });
    }

    var vendorBlurbEl = document.getElementById('subscriptionVendorBlurb');
    var picked = window.SubscriptionScoring ? window.SubscriptionScoring.pickVendor(answers.profile, answers.grind) : null;
    window.__subscriptionPickedVendor = picked;
    if (vendorBlurbEl) {
      vendorBlurbEl.textContent =
        picked && picked.vendorName ? 'החודש מתחילים עם בית הקלייה ' + picked.vendorName : '';
    }

    var price = computeSubscriptionPrice(answers);
    var originalEl = document.getElementById('subscriptionPriceOriginal');
    var discountedEl = document.getElementById('subscriptionPriceDiscounted');
    if (price) {
      originalEl.textContent = price.discounted < price.original ? price.original + ' ₪' : '';
      discountedEl.textContent = price.discounted + ' ₪';
    } else if (originalEl && discountedEl) {
      originalEl.textContent = '';
      discountedEl.textContent = '';
    }

    persistSubscriptionState();
  }

  function showSubscriptionResults() {
    activateSubscriptionStep('results');
    renderSubscriptionResults();
  }

  /* ── Close / restart ───────────────────────────────────────────────────── */
  function closeSubscriptionForm() {
    var redirect = (window.subscriptionSettings && window.subscriptionSettings.closeRedirect) || '/';
    window.location.assign(redirect);
  }
  window.closeSubscriptionForm = closeSubscriptionForm;

  function clearSubscriptionResultsState() {
    try {
      sessionStorage.removeItem(SUBSCRIPTION_RESULTS_STATE_KEY);
    } catch (e) {
      /* no-op */
    }
  }
  window.clearSubscriptionResultsState = clearSubscriptionResultsState;

  function restartSubscriptionFlow() {
    clearSubscriptionResultsState();
    window.subscriptionAnswers = { tier: null, quantity: null, profile: null, grind: null };
    document.querySelectorAll('.subscription-option.selected').forEach(function (el) {
      el.classList.remove('selected');
    });
    activateSubscriptionStep('1');
  }
  window.restartSubscriptionFlow = restartSubscriptionFlow;

  /* ── Edit preferences bottom sheet ─────────────────────────────────────── */
  function populateSubscriptionEditSheet() {
    var answers = window.subscriptionAnswers;
    Object.keys(SUBSCRIPTION_FIELD_TO_SHEET_ID).forEach(function (field) {
      var el = document.getElementById(SUBSCRIPTION_FIELD_TO_SHEET_ID[field]);
      if (el && answers[field] != null) {
        el.value = String(answers[field]);
      }
    });
  }

  function openSubscriptionEditSheet() {
    populateSubscriptionEditSheet();
    var overlay = document.getElementById('subscriptionEditSheetOverlay');
    if (overlay) overlay.classList.add('open');
  }
  window.openSubscriptionEditSheet = openSubscriptionEditSheet;

  function closeSubscriptionEditSheet() {
    var overlay = document.getElementById('subscriptionEditSheetOverlay');
    if (overlay) overlay.classList.remove('open');
  }
  window.closeSubscriptionEditSheet = closeSubscriptionEditSheet;

  function applySubscriptionEditSheet() {
    Object.keys(SUBSCRIPTION_FIELD_TO_SHEET_ID).forEach(function (field) {
      var el = document.getElementById(SUBSCRIPTION_FIELD_TO_SHEET_ID[field]);
      if (!el) return;
      window.subscriptionAnswers[field] = field === 'quantity' ? parseInt(el.value, 10) : el.value;
    });
    syncSubscriptionOptionSelectedStates();
    renderSubscriptionResults();
    closeSubscriptionEditSheet();
  }
  window.applySubscriptionEditSheet = applySubscriptionEditSheet;

  /* ── Add to cart ───────────────────────────────────────────────────────── */
  function submitSubscriptionToCart() {
    var answers = window.subscriptionAnswers;
    if (!answers.tier || !answers.quantity || !answers.profile || !answers.grind) return;

    var btn = document.getElementById('subscriptionCtaBtn');
    var label = document.getElementById('subscriptionCtaLabel');
    var picked =
      window.__subscriptionPickedVendor ||
      (window.SubscriptionScoring ? window.SubscriptionScoring.pickVendor(answers.profile, answers.grind) : null);
    var variantId = picked && picked.product && picked.product.variantId;

    if (!variantId) {
      console.error('Subscription add to cart: simulated recommendation engine found no matching product/variant.');
      if (label) label.textContent = 'שגיאה, נסו שוב';
      return;
    }

    if (btn) btn.disabled = true;
    if (label) label.textContent = 'מוסיף...';

    var price = computeSubscriptionPrice(answers);
    var originalLabel = label ? label.textContent : '';

    fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          {
            id: variantId,
            quantity: 1,
            properties: {
              _subscription_tier: answers.tier,
              _subscription_quantity: String(answers.quantity),
              _subscription_profile: answers.profile,
              _subscription_grind: answers.grind,
              _subscription_vendor: (picked && (picked.vendorShortName || picked.vendorName)) || '',
              _subscription_price: price ? String(price.discounted) : '',
            },
          },
        ],
      }),
    })
      .then(function (response) {
        if (!response.ok) {
          return response.json().then(function (err) {
            throw err;
          });
        }
        return response.json();
      })
      .then(function () {
        clearSubscriptionResultsState();
        window.location.assign('/checkout');
      })
      .catch(function (err) {
        console.error('Subscription add to cart failed:', err);
        if (btn) btn.disabled = false;
        if (label) label.textContent = originalLabel || 'שגיאה, נסו שוב';
      });
  }
  window.submitSubscriptionToCart = submitSubscriptionToCart;

  /* ── Init ──────────────────────────────────────────────────────────────── */
  function restoreSubscriptionState() {
    try {
      var raw = sessionStorage.getItem(SUBSCRIPTION_RESULTS_STATE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.answers) {
        window.subscriptionAnswers = Object.assign(
          { tier: null, quantity: null, profile: null, grind: null },
          parsed.answers
        );
        syncSubscriptionOptionSelectedStates();
        if (parsed.showResults) {
          showSubscriptionResults();
        }
      }
    } catch (e) {
      /* ignore malformed/unavailable storage */
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    attachSubscriptionOptionListeners();
    restoreSubscriptionState();
  });
})();
