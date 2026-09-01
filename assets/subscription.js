/**
 * Origin subscription flow.
 * Completely separate from the main-questionnaire inline script — same general
 * interaction patterns (step machine, auto-advance, sessionStorage persistence)
 * re-implemented here as a standalone module.
 *
 * NOTE: The vendor/roastery blurb (see SubscriptionScoring below) is still a
 * simulation. Cart + price always use the dedicated subscription product
 * (quantity + frequency as variants, remaining answers as line-item properties).
 */
(function () {
  var SUBSCRIPTION_RESULTS_STATE_KEY = 'subscriptionResultsState';
  var SUBSCRIPTION_TOTAL_STEPS = 5;
  var SUBSCRIPTION_AUTO_ADVANCE_MS = 300;
  var SUBSCRIPTION_FIELD_TO_SHEET_ID = {
    quantity: 'subscriptionEditQuantity',
    frequency: 'subscriptionEditFrequency',
    deliveryDay: 'subscriptionEditDeliveryDay',
    profile: 'subscriptionEditProfile',
    grind: 'subscriptionEditGrind',
  };

  var SUBSCRIPTION_FREQUENCY_LABELS = {
    3: '3 חודשים',
    6: '6 חודשים',
    12: '12 חודשים',
  };
  var SUBSCRIPTION_DELIVERY_DAY_LABELS = {
    10: '10 בחודש',
    20: '20 בחודש',
  };
  var SUBSCRIPTION_PROFILE_LABELS = {
    italian: 'סגנון איטלקי ועשיר',
    classic: 'סגנון קלאסי "בית קפה"',
    modern: 'סגנון מודרני',
  };
  var SUBSCRIPTION_PROFILE_SHORT_DESC = {
    italian: 'עשיר ושוקולדי',
    classic: 'עדין ומתוק',
    modern: 'פירותי וקליל',
  };
  var SUBSCRIPTION_GRIND_LABELS = {
    whole: 'פולים שלמים',
    espresso: 'טחינה לאספרסו - דקה',
    moka: 'טחינה למקינטה / קפה שחור - דקה-בינונית',
    v60: 'טחינה לפילטר / V60 - בינונית',
    frenchpress: "טחינה לפרנץ' פרס / Cold Brew - גסה",
  };
  var SUBSCRIPTION_GRIND_SHORT_LABELS = {
    whole: 'פולים שלמים',
    espresso: 'אספרסו - טחינה',
    moka: 'מקינטה - טחינה',
    v60: 'פילטר / V60 - טחינה',
    frenchpress: "פרנץ' פרס - טחינה",
  };
  var SUBSCRIPTION_PROFILE_TILE_LABELS = {
    italian: 'האיטלקי: עשיר',
    classic: 'הקלאסי: מאוזן',
    modern: 'המודרני: פירותי',
  };

  /* PLACEHOLDER: content-based mapping from this flow's answers to the existing
     coffee_tastes / coffee_prep_methods metafield tags, used only to simulate a
     vendor recommendation. Replace when the real subscription logic exists. */
  var SUBSCRIPTION_PROFILE_TASTE_TAG = {
    italian: 'Rich & Chocolaty',
    classic: 'Sweet & Caramelly',
    modern: 'Fruity & Floral',
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
    quantity: null,
    frequency: null,
    deliveryDay: null,
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

  /* ── Subscription product (quantity + frequency variants) ─────────────── */
  var SUBSCRIPTION_QUANTITY_TO_KG = { 4: 1, 8: 2, 16: 4 };

  function loadSubscriptionProduct() {
    if (window.subscriptionProduct && window.subscriptionProduct.variants) {
      return window.subscriptionProduct;
    }
    var el = document.getElementById('subscription-product-data');
    if (!el) {
      window.subscriptionProduct = { variants: [] };
      return window.subscriptionProduct;
    }
    try {
      window.subscriptionProduct = JSON.parse(el.textContent || '{}') || { variants: [] };
    } catch (e) {
      window.subscriptionProduct = { variants: [] };
    }
    if (!window.subscriptionProduct.variants) window.subscriptionProduct.variants = [];
    return window.subscriptionProduct;
  }

  function subscriptionOptionNumber(value) {
    var match = String(value || '').match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  function findSubscriptionVariant(quantity, frequency) {
    var kg = SUBSCRIPTION_QUANTITY_TO_KG[quantity];
    var months = parseInt(frequency, 10);
    if (!kg || !months) return null;
    var variants = loadSubscriptionProduct().variants || [];
    for (var i = 0; i < variants.length; i++) {
      var variant = variants[i];
      if (
        subscriptionOptionNumber(variant.option1) === kg &&
        subscriptionOptionNumber(variant.option2) === months
      ) {
        return variant;
      }
    }
    return null;
  }

  function formatSubscriptionShekels(amount) {
    return Math.round(amount) + ' ₪';
  }

  function computeSubscriptionPrice(answers) {
    var variant = findSubscriptionVariant(answers.quantity, answers.frequency);
    if (!variant || typeof variant.price !== 'number') return null;
    var months = parseInt(answers.frequency, 10) || 1;
    var total = variant.price / 100;
    var monthly = Math.round(total / months);
    // Baseline: monthly rate for the shortest commitment (3 months) at the same quantity.
    var baselineVariant = findSubscriptionVariant(answers.quantity, 3);
    var baselineMonthly =
      baselineVariant && typeof baselineVariant.price === 'number'
        ? baselineVariant.price / 100 / 3
        : monthly;
    var savings = Math.max(0, Math.round((baselineMonthly - monthly) * months));
    return {
      variant: variant,
      total: total,
      monthly: monthly,
      annual: monthly * 12,
      shipments: months,
      perShipment: monthly,
      savings: savings,
    };
  }

  /* ── Step machine ──────────────────────────────────────────────────────── */
  function activateSubscriptionStep(stepIndex) {
    document.querySelectorAll('.subscription-step').forEach(function (el) {
      el.classList.remove('active');
    });
    var target = document.querySelector('.subscription-step[data-step-index="' + stepIndex + '"]');
    if (target) target.classList.add('active');
    var wrapper = document.getElementById('subscriptionWrapper');
    if (wrapper) {
      wrapper.classList.toggle('subscription-results-visible', stepIndex === 'results');
    }
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

    var kg = answers.quantity ? answers.quantity / 4 : null;
    var profileValue =
      SUBSCRIPTION_PROFILE_TILE_LABELS[answers.profile] || SUBSCRIPTION_PROFILE_LABELS[answers.profile] || '';

    var tileValues = {
      subscriptionTileProfile: profileValue,
      subscriptionTileGrind:
        SUBSCRIPTION_GRIND_SHORT_LABELS[answers.grind] || SUBSCRIPTION_GRIND_LABELS[answers.grind] || '',
      subscriptionTileDeliveryDay: SUBSCRIPTION_DELIVERY_DAY_LABELS[answers.deliveryDay] || '',
      subscriptionTileQuantity: answers.quantity ? answers.quantity + ' שקיות (' + kg + ' ק"ג)' : '',
    };
    Object.keys(tileValues).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = tileValues[id];
    });

    var price = computeSubscriptionPrice(answers);
    var perShipmentEl = document.getElementById('subscriptionPricePerShipment');
    var totalNoteEl = document.getElementById('subscriptionPriceTotalNote');
    var savingsBanner = document.getElementById('subscriptionSavingsBanner');
    var savingsPill = document.getElementById('subscriptionSavingsPill');
    if (price) {
      if (perShipmentEl) {
        perShipmentEl.innerHTML =
          '<span class="subscription-price-per-shipment-amount">' +
          formatSubscriptionShekels(price.perShipment) +
          '</span>' +
          '<span class="subscription-price-per-shipment-label">' +
          'למשלוח ' +
          price.shipments +
          'x משלוחים' +
          '</span>';
      }
      if (totalNoteEl) {
        totalNoteEl.textContent =
          'סה״כ ' + formatSubscriptionShekels(price.total) + ' (ניתן לחלק עד 12 תשלומים)';
      }
      if (savingsPill) {
        savingsPill.textContent =
          price.savings > 0
            ? 'חסכת ' + formatSubscriptionShekels(price.savings) + ' ומשלוח חינם'
            : 'משלוח חינם';
      }
      if (savingsBanner) savingsBanner.hidden = false;
    } else {
      if (perShipmentEl) perShipmentEl.textContent = '';
      if (totalNoteEl) totalNoteEl.textContent = '';
      if (savingsBanner) savingsBanner.hidden = true;
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
    window.subscriptionAnswers = { quantity: null, frequency: null, deliveryDay: null, profile: null, grind: null };
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
    if (!answers.quantity || !answers.frequency || !answers.deliveryDay || !answers.profile || !answers.grind) return;

    var btn = document.getElementById('subscriptionCtaBtn');
    var label = document.getElementById('subscriptionCtaLabel');
    var originalLabel = label ? label.textContent : '';
    var picked =
      window.__subscriptionPickedVendor ||
      (window.SubscriptionScoring ? window.SubscriptionScoring.pickVendor(answers.profile, answers.grind) : null);
    var variant = findSubscriptionVariant(answers.quantity, answers.frequency);
    var variantId = variant && variant.id;

    if (!variantId) {
      console.error('Subscription add to cart: no matching quantity/frequency variant on the subscription product.');
      if (label) label.textContent = 'שגיאה, נסו שוב';
      return;
    }

    if (btn) btn.disabled = true;
    if (label) label.textContent = 'מוסיף...';

    var profileLabel = SUBSCRIPTION_PROFILE_LABELS[answers.profile] || answers.profile;
    if (profileLabel && SUBSCRIPTION_PROFILE_SHORT_DESC[answers.profile]) {
      profileLabel += ': ' + SUBSCRIPTION_PROFILE_SHORT_DESC[answers.profile];
    }

    var properties = {
      הפרופיל: profileLabel,
      הטחינה: SUBSCRIPTION_GRIND_LABELS[answers.grind] || answers.grind,
      'מועד המשלוח': SUBSCRIPTION_DELIVERY_DAY_LABELS[answers.deliveryDay] || answers.deliveryDay,
    };
    var vendorName = picked && (picked.vendorName || picked.vendorShortName);
    if (vendorName) properties['בית הקלייה'] = vendorName;

    fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          {
            id: variantId,
            quantity: 1,
            properties: properties,
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
          { quantity: null, frequency: null, deliveryDay: null, profile: null, grind: null },
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
