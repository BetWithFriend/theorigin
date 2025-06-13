// Add to a separate file: assets/cart-shipping.js
document.addEventListener('DOMContentLoaded', function () {
    const SHIPPING_VARIANT_ID = 7939443490873;

    // Check shipping when cart drawer opens
    const cartIcon = document.querySelector('#cart-icon-bubble');
    if (cartIcon) {
        cartIcon.addEventListener('click', async function () {
            setTimeout(async () => {
                await checkAndAddShipping();
            }, 300); // Wait for drawer to open
        });
    }

    // Check shipping on quantity changes
    document.addEventListener('change', function (e) {
        if (e.target.matches('input[name="updates[]"]') || e.target.matches('.quantity__input')) {
            setTimeout(async () => {
                await checkAndAddShipping();
            }, 500);
        }
    });

    async function checkAndAddShipping() {
        const cart = await fetch('/cart.js').then(r => r.json());
        const hasCanopy = cart.items.some(item => item.vendor === 'canopy' && !item.properties?._shipping_fee);
        const hasShipping = cart.items.some(item => item.properties?._shipping_fee === 'true');

        if (hasCanopy && !hasShipping) {
            await fetch('/cart/add.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: SHIPPING_VARIANT_ID,
                    quantity: 1,
                    properties: { '_shipping_fee': 'true', '_vendor': 'canopy' }
                })
            });

            // Refresh cart drawer
            // location.reload(); // Simple approach
        }
    }
});