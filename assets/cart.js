// class CartRemoveButton extends HTMLElement {
//   constructor() {
//     super();

//     this.addEventListener('click', (event) => {
//       event.preventDefault();
//       const cartItems = this.closest('cart-items') || this.closest('cart-drawer-items');
//       cartItems.updateQuantity(this.dataset.index, 0);
//     });
//   }
// }

// customElements.define('cart-remove-button', CartRemoveButton);

class CartItems extends HTMLElement {
  constructor() {
    super();
    this.lineItemStatusElement =
      document.getElementById('shopping-cart-line-item-status') || document.getElementById('CartDrawer-LineItemStatus');

    const debouncedOnChange = debounce((event) => {
      this.onChange(event);
    }, ON_CHANGE_DEBOUNCE_TIMER);

    this.addEventListener('change', debouncedOnChange.bind(this));
  }

  cartUpdateUnsubscriber = undefined;

  connectedCallback() {
    this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
      if (event.source === 'cart-items') {
        return;
      }
      this.onCartUpdate(); // This handles updates coming from outside (e.g., product page add to cart)
    });

    // Re-initialize event listeners for dynamic elements if necessary, though the
    // current `cart-remove-button` custom element should ideally handle its own events.
    // The main issue is the parent replacing child elements.
  }

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
  }

  resetQuantityInput(id) {
    const input = this.querySelector(`#Quantity-${id}`);
    if (input) { // Add null check
      input.value = input.getAttribute('value');
    }
    this.isEnterPressed = false;
  }

  setValidity(event, index, message) {
    event.target.setCustomValidity(message);
    event.target.reportValidity();
    this.resetQuantityInput(index);
    event.target.select();
  }

  validateQuantity(event) {
    const input = event.target; // Get a direct reference to the input element
    const inputValue = parseInt(input.value);
    const index = input.dataset.index;
    const minQuantity = parseInt(input.dataset.min) || 0; // Get min, default to 0 if not set
    const maxQuantity = parseInt(input.max) || Infinity; // Get max, default to Infinity
    const step = parseInt(input.step) || 1; // Get step, default to 1

    let message = '';

    // --- CRUCIAL CHANGE HERE ---
    // If the input value is 0, always remove the item.
    // This bypasses min/max/step validation for the "remove" action.
    if (inputValue === 0) {
      this.updateQuantity(index, 0, document.activeElement.getAttribute('name'), input.dataset.quantityVariantId);
      input.setCustomValidity(''); // Clear any validation message from the browser
      input.reportValidity(); // Clear validation UI
      return; // Stop further validation as the item is being removed
    }

    // Now, apply the standard validation rules for non-zero quantities
    if (inputValue < minQuantity) {
      message = window.quickOrderListStrings.min_error.replace('[min]', minQuantity);
    } else if (inputValue > maxQuantity) {
      message = window.quickOrderListStrings.max_error.replace('[max]', maxQuantity);
    } else if (inputValue % step !== 0) {
      message = window.quickOrderListStrings.step_error.replace('[step]', step);
    }

    if (message) {
      this.setValidity(event, index, message); // This will set custom validity and reset input
    } else {
      input.setCustomValidity('');
      input.reportValidity();
      this.updateQuantity(
        index,
        inputValue,
        document.activeElement.getAttribute('name'),
        input.dataset.quantityVariantId
      );
    }
  }

  onChange(event) {
    this.validateQuantity(event);
  }

  onCartUpdate() {
    // This method is for external cart updates (e.g., from product page).
    // The main-cart-items update should be handled by the updateQuantity method itself.
    // If you explicitly add/remove using cart API outside of this component, then this will re-fetch.
    const sectionId = this.tagName === 'CART-DRAWER-ITEMS' ? 'cart-drawer' : 'main-cart-items';
    const selectorsToUpdate = this.tagName === 'CART-DRAWER-ITEMS'
      ? ['cart-drawer-items', '.cart-drawer__footer', '#CartDrawer-LineItemStatus', '#CartDrawer-LiveRegionText']
      : ['cart-items', '.cart-total-delivery-wrapper', '#shopping-cart-line-item-status', '#cart-live-region-text', '#main-cart-footer', '#cart-icon-bubble'];

    fetch(`${routes.cart_url}?section_id=${sectionId}`)
      .then((response) => response.text())
      .then((responseText) => {
        const html = new DOMParser().parseFromString(responseText, 'text/html');

        selectorsToUpdate.forEach(selector => {
          const targetElement = document.querySelector(selector);
          const sourceElement = html.querySelector(selector);

          if (targetElement && sourceElement) {
            // For custom elements, it's generally safer to replace the whole element if possible,
            // or update its innerHTML carefully. Let's try replacing the element.
            if (selector === 'cart-items' || selector === 'cart-drawer-items') {
              // If replacing a custom element, ensure the new one gets constructed
              const newElement = html.querySelector(selector);
              if (newElement) {
                targetElement.replaceWith(newElement);
              }
            } else {
              targetElement.replaceWith(sourceElement);
            }
          }
        });
      })
      .catch((e) => {
        console.error(e);
      });
  }

  getSectionsToRender() {
    const mainCartFooterElement = document.getElementById('main-cart-footer');

    // Make sure 'main-cart-items' section ID is dynamically sourced from the element's data-id
    const currentCartItemsId = this.dataset.id; // This will be 'main-cart-items'
    const cartIconBubble = document.getElementById('cart-icon-bubble');
    const cartLiveRegionText = document.getElementById('cart-live-region-text');

    const sections = [
      {
        id: 'main-cart-items', // Using the fixed ID
        section: currentCartItemsId, // Using the dynamic data-id from the element itself
        selector: '.js-contents',
        elementToReplace: this.querySelector('.js-contents') // Target the .js-contents INSIDE this custom element
      },
    ];

    if (cartIconBubble) {
      sections.push({
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
        elementToReplace: cartIconBubble
      });
    }

    if (cartLiveRegionText) {
      sections.push({
        id: 'cart-live-region-text',
        section: 'cart-live-region-text',
        selector: '.shopify-section', // Or just '' if the ID itself is the section
        elementToReplace: cartLiveRegionText
      });
    }

    if (mainCartFooterElement) {
      sections.push({
        id: 'main-cart-footer',
        section: mainCartFooterElement.dataset.id,
        selector: '.js-contents',
        elementToReplace: mainCartFooterElement.querySelector('.js-contents') || mainCartFooterElement
      });
    }

    return sections;
  }

  updateQuantity(line, quantity, name, variantId) {
    this.enableLoading(line);

    const sectionsToRequest = this.getSectionsToRender().map((section) => section.section);

    const body = JSON.stringify({
      line,
      quantity,
      sections: sectionsToRequest, // Pass the dynamically determined sections
      sections_url: window.location.pathname,
    });

    fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => {
        return response.text();
      })
      .then((state) => {
        const parsedState = JSON.parse(state);
        const quantityElement =
          document.getElementById(`Quantity-${line}`) || document.getElementById(`Drawer-quantity-${line}`);
        // `items` is potentially stale here, relying on parsedState.item_count is better for overall cart state.
        // const items = document.querySelectorAll('.cart-item');

        if (parsedState.errors) {
          if (quantityElement) { // Null check
            quantityElement.value = quantityElement.getAttribute('value');
          }
          this.updateLiveRegions(line, parsedState.errors);
          return;
        }

        this.classList.toggle('is-empty', parsedState.item_count === 0); // This toggles a class on the cart-items element itself
        const cartDrawerWrapper = document.querySelector('cart-drawer');
        if (cartDrawerWrapper) cartDrawerWrapper.classList.toggle('is-empty', parsedState.item_count === 0);

        // --- CORE FIX: Update cart-items' innerHTML and let delegation handle events ---
        const mainCartItemsSectionData = parsedState.sections[this.dataset.id];
        if (mainCartItemsSectionData) {
          const currentJsContents = this.querySelector('.js-contents');
          if (currentJsContents) {
            currentJsContents.innerHTML = this.getSectionInnerHTML(mainCartItemsSectionData, '.js-contents');
          }
        }

        // 2. Then, update other sections that were requested
        this.getSectionsToRender()
          .filter(section => section.id !== 'main-cart-items') // Exclude main-cart-items as it's already updated
          .forEach((section) => {
            const container = document.getElementById(section.id);
            if (!container) return; // Ensure container exists

            const elementToReplace = section.selector ? container.querySelector(section.selector) : container;

            if (elementToReplace && parsedState.sections[section.section]) {
              elementToReplace.innerHTML = this.getSectionInnerHTML(
                parsedState.sections[section.section],
                section.selector
              );
            }
          });

        const updatedCartFooter = document.getElementById('main-cart-footer');
        if (updatedCartFooter) {
          updatedCartFooter.classList.toggle('is-empty', parsedState.item_count === 0);
        }
        // --- CORE FIX END ---

        const updatedValue = parsedState.items[line - 1] ? parsedState.items[line - 1].quantity : undefined;
        let message = '';
        if (parsedState.item_count !== undefined && updatedValue !== parseInt(quantityElement.value)) {
          if (typeof updatedValue === 'undefined' || updatedValue === 0) {
            message = window.cartStrings.error;
          } else {
            message = window.cartStrings.quantityError.replace('[quantity]', updatedValue);
          }
        }
        this.updateLiveRegions(line, message);

        // Re-query the specific line item if needed for focus, etc.
        const newLineItem = document.getElementById(`CartItem-${line}`);
        if (newLineItem && newLineItem.querySelector(`[name="${name}"]`)) {
          // Check for cart drawer first, then line item
          if (cartDrawerWrapper) {
            trapFocus(cartDrawerWrapper, newLineItem.querySelector(`[name="${name}"]`));
          } else {
            newLineItem.querySelector(`[name="${name}"]`).focus();
          }
        } else if (parsedState.item_count === 0) {
          if (cartDrawerWrapper) {
            trapFocus(cartDrawerWrapper.querySelector('.drawer__inner-empty'), cartDrawerWrapper.querySelector('a'));
          } else {
            const continueShoppingButton = document.querySelector('.cart__warnings .button');
            if (continueShoppingButton) continueShoppingButton.focus();
          }
        } else if (document.querySelector('.cart-item') && cartDrawerWrapper) {
          // This else-if block seems specific to cart drawer and still having items
          trapFocus(cartDrawerWrapper, document.querySelector('.cart-item__name'));
        }

        publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-items', cartData: parsedState, variantId: variantId });
      })
      .catch((e) => {
        console.error("Cart update failed:", e); // More specific error message
        this.querySelectorAll('.loading__spinner').forEach((overlay) => overlay.classList.add('hidden'));
        const errors = document.getElementById('cart-errors') || document.getElementById('CartDrawer-CartErrors');
        if (errors) errors.textContent = window.cartStrings.error;
      })
      .finally(() => {
        this.disableLoading(line);
      });
  }



  updateLiveRegions(line, message) {
    const lineItemError =
      document.getElementById(`Line-item-error-${line}`) || document.getElementById(`CartDrawer-LineItemError-${line}`);
    if (lineItemError) lineItemError.querySelector('.cart-item__error-text').textContent = message;

    this.lineItemStatusElement.setAttribute('aria-hidden', true);

    const cartStatus =
      document.getElementById('cart-live-region-text') || document.getElementById('CartDrawer-LiveRegionText');
    cartStatus.setAttribute('aria-hidden', false);

    setTimeout(() => {
      cartStatus.setAttribute('aria-hidden', true);
    }, 1000);
  }

  getSectionInnerHTML(html, selector) {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  enableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.add('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

    [...cartItemElements, ...cartDrawerItemElements].forEach((overlay) => overlay.classList.remove('hidden'));

    document.activeElement.blur();
    this.lineItemStatusElement.setAttribute('aria-hidden', false);
  }

  disableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.remove('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

    cartItemElements.forEach((overlay) => overlay.classList.add('hidden'));
    cartDrawerItemElements.forEach((overlay) => overlay.classList.add('hidden'));
  }
}

customElements.define('cart-items', CartItems);

if (!customElements.get('cart-note')) {
  customElements.define(
    'cart-note',
    class CartNote extends HTMLElement {
      constructor() {
        super();

        this.addEventListener(
          'input',
          debounce((event) => {
            const body = JSON.stringify({ note: event.target.value });
            fetch(`${routes.cart_update_url}`, { ...fetchConfig(), ...{ body } });
          }, ON_CHANGE_DEBOUNCE_TIMER)
        );
      }
    }
  );
}