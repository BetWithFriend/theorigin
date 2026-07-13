(function () {
  const PROP_BUNDLE = '_questionnaire_bundle';
  const PROP_BUNDLE_PUBLIC = 'בונה מארזים';
  const PROP_BUNDLE_QTY = 'כמות במארז';
  const PROP_BUNDLE_QTY_PRIVATE = '_questionnaire_bundle_qty';

  const BUNDLE_KEYS = [PROP_BUNDLE, PROP_BUNDLE_PUBLIC, PROP_BUNDLE_QTY, PROP_BUNDLE_QTY_PRIVATE];

  let syncing = false;

  function vendorQtyMap(items) {
    const map = {};
    (items || []).forEach((item) => {
      const vendor = item.vendor || '';
      map[vendor] = (map[vendor] || 0) + item.quantity;
    });
    return map;
  }

  function targetTierForVendorQty(qty) {
    if (qty >= 7) return 7;
    if (qty >= 5) return 5;
    return 0;
  }

  function bundlePropsForTier(tier) {
    return {
      [PROP_BUNDLE]: 'true',
      [PROP_BUNDLE_PUBLIC]: 'כן',
      [PROP_BUNDLE_QTY]: String(tier),
      [PROP_BUNDLE_QTY_PRIVATE]: String(tier),
    };
  }

  function bundlePropValue(item, key) {
    const value = item.properties?.[key];
    if (value == null) return '';
    return String(value).trim();
  }

  function hasBundleKeysPresent(item) {
    return BUNDLE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(item.properties || {}, key));
  }

  function currentBundleTier(item) {
    if (bundlePropValue(item, PROP_BUNDLE) !== 'true') return 0;
    const qty = parseInt(
      bundlePropValue(item, PROP_BUNDLE_QTY) || bundlePropValue(item, PROP_BUNDLE_QTY_PRIVATE) || '0',
      10
    );
    return qty === 5 || qty === 7 ? qty : 0;
  }

  function hasBundleDiscountAllocation(item) {
    return (item.line_level_discount_allocations || []).some((allocation) => {
      const title = allocation.discount_application?.title || '';
      return /bundle/i.test(title);
    });
  }

  function propertiesMatchTarget(item, targetTier) {
    if (targetTier === 0) {
      if (hasBundleKeysPresent(item)) return false;
      if (hasBundleDiscountAllocation(item)) return false;
      return true;
    }

    if (currentBundleTier(item) !== targetTier) return false;

    const expected = bundlePropsForTier(targetTier);
    return BUNDLE_KEYS.every((key) => bundlePropValue(item, key) === expected[key]);
  }

  function buildCleanProperties(item, targetTier) {
    const props = {};

    Object.entries(item.properties || {}).forEach(([key, value]) => {
      if (BUNDLE_KEYS.includes(key)) return;
      if (value != null && String(value).trim() !== '') {
        props[key] = String(value);
      }
    });

    if (targetTier > 0) {
      Object.assign(props, bundlePropsForTier(targetTier));
    }

    return props;
  }

  function lineChangesNeeded(cart) {
    const qtyMap = vendorQtyMap(cart.items);
    const changes = [];

    (cart.items || []).forEach((item) => {
      const vendorQty = qtyMap[item.vendor] || 0;
      const targetTier = targetTierForVendorQty(vendorQty);
      if (!propertiesMatchTarget(item, targetTier)) {
        changes.push({
          item,
          properties: buildCleanProperties(item, targetTier),
        });
      }
    });

    return changes;
  }

  async function replaceLineItem(item, properties) {
    const removeResponse = await fetch('/cart/change.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        id: item.key,
        quantity: 0,
      }),
    });

    if (!removeResponse.ok) {
      throw new Error(`Failed to remove line item ${item.key}`);
    }

    const addResponse = await fetch('/cart/add.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        id: item.variant_id,
        quantity: item.quantity,
        properties,
      }),
    });

    if (!addResponse.ok) {
      throw new Error(`Failed to re-add variant ${item.variant_id}`);
    }

    return addResponse.json();
  }

  async function fetchCart() {
    const response = await fetch('/cart.js');
    return response.json();
  }

  async function syncVendorBundleDiscountProperties(cartOptional) {
    if (syncing) {
      return { changed: false, cart: cartOptional || null };
    }

    syncing = true;

    try {
      let cart = cartOptional || (await fetchCart());
      let changed = false;

      for (let attempt = 0; attempt < 20; attempt += 1) {
        const changes = lineChangesNeeded(cart);
        if (!changes.length) break;

        changed = true;
        await replaceLineItem(changes[0].item, changes[0].properties);
        cart = await fetchCart();
      }

      return { changed, cart };
    } finally {
      syncing = false;
    }
  }

  async function fetchCartSections(sectionIds) {
    if (!sectionIds.length) return {};

    const cartUrl = window.routes?.cart_url || '/cart';
    const response = await fetch(`${cartUrl}?sections=${sectionIds.join(',')}`);
    return response.json();
  }

  async function syncVendorBundleCart(options = {}) {
    const { cartOptional, sections = [] } = options;
    const syncResult = await syncVendorBundleDiscountProperties(cartOptional);

    if (!syncResult.changed || !sections.length) {
      return { ...syncResult, sections: null };
    }

    const sectionsHtml = await fetchCartSections(sections);
    return { ...syncResult, sections: sectionsHtml };
  }

  window.syncVendorBundleDiscountProperties = syncVendorBundleDiscountProperties;
  window.syncVendorBundleCart = syncVendorBundleCart;
  window.fetchCartSections = fetchCartSections;

  document.addEventListener('DOMContentLoaded', () => {
    syncVendorBundleDiscountProperties()
      .then(({ changed }) => {
        if (!changed) return;

        if (typeof window.updateCartDrawerFromQuickAdd === 'function') {
          window.updateCartDrawerFromQuickAdd();
          return;
        }

        if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
          publish(PUB_SUB_EVENTS.cartUpdate, { source: 'bundle-discount-sync' });
        }
      })
      .catch((error) => {
        console.error('Initial bundle discount sync failed:', error);
      });
  });
})();
