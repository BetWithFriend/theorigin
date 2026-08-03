(function () {
  function vendorQtyMap(items) {
    const map = {};
    (items || []).forEach((item) => {
      const vendor = item.vendor || '';
      map[vendor] = (map[vendor] || 0) + item.quantity;
    });
    return map;
  }

  function cartHasCartLevelDiscount(cart) {
    return (cart?.cart_level_discount_applications || []).some(
      (discount) => (discount.total_allocated_amount || 0) > 0
    );
  }

  function cartQualifiesForBundleDiscount(cart) {
    const qtyMap = vendorQtyMap(cart?.items || []);
    return Object.values(qtyMap).some((qty) => qty >= 5);
  }

  function cartHasAppliedBundleDiscount(cart) {
    return (cart?.items || []).some((item) => {
      if (item.original_line_price == null || item.final_line_price == null) return false;
      if (item.original_line_price === item.final_line_price) return false;
      return (item.line_level_discount_allocations || []).some((allocation) => {
        const title = allocation.discount_application?.title || '';
        return /bundle/i.test(title);
      });
    });
  }

  async function fetchCart() {
    const response = await fetch('/cart.js', {
      headers: { Accept: 'application/json' },
    });
    return response.json();
  }

  async function clearCartLevelDiscount() {
    const response = await fetch('/cart/update.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ discount: '' }),
    });

    if (!response.ok) {
      throw new Error('Failed to clear cart-level discount');
    }

    return response.json();
  }

  async function enforceSingleCartDiscount(cartOptional) {
    const cart = cartOptional || (await fetchCart());
    const hasCode = cartHasCartLevelDiscount(cart);
    const bundleQualifies = cartQualifiesForBundleDiscount(cart);

    if (!hasCode || !bundleQualifies) {
      return {
        cart,
        changed: false,
        activeDiscount: hasCode ? 'code' : bundleQualifies ? 'bundle' : 'none',
      };
    }

    await clearCartLevelDiscount();
    const updatedCart = await fetchCart();

    return {
      cart: updatedCart,
      changed: true,
      activeDiscount: 'bundle',
    };
  }

  window.cartSingleDiscount = {
    vendorQtyMap,
    cartHasCartLevelDiscount,
    cartQualifiesForBundleDiscount,
    cartHasAppliedBundleDiscount,
    clearCartLevelDiscount,
    enforceSingleCartDiscount,
    fetchCart,
  };
})();
