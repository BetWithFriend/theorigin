class CartRemoveButton extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('click', (event) => {
      event.preventDefault();
      const cartItems = this.closest('cart-items') || this.closest('cart-drawer-items');
      // CONVERT 0-BASED data-index TO 1-BASED LINE NUMBER
      const lineIndex = parseInt(this.dataset.index, 10) + 1;
      cartItems.updateQuantity(lineIndex, 0); // Pass the 1-based index and quantity 0 to remove
    });
  }
}

customElements.define('cart-remove-button', CartRemoveButton);

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
      this.onCartUpdate();
    });
  }

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
  }

  resetQuantityInput(id) {
    const input = this.querySelector(`#Quantity-${id}`);
    if (input) {
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
    const input = event.target;
    const inputValue = parseInt(input.value);
    // When validating from an input, the data-index might be 0-based,
    // so we need to convert it to 1-based for updateQuantity.
    const index = parseInt(input.dataset.index, 10) + 1;
    const minQuantity = parseInt(input.dataset.min) || 0;
    const maxQuantity = parseInt(input.max) || Infinity;
    const step = parseInt(input.step) || 1;

    let message = '';

    // If the input value is 0, remove the item
    if (inputValue === 0) {
      this.updateQuantity(index, 0, document.activeElement.getAttribute('name'), input.dataset.quantityVariantId);
      input.setCustomValidity('');
      // input.reportValidity();
      return;
    }

    // Apply validation rules for non-zero quantities
    if (inputValue < minQuantity) {
      message = window.quickOrderListStrings.min_error.replace('[min]', minQuantity);
    } else if (inputValue > maxQuantity) {
      message = window.quickOrderListStrings.max_error.replace('[max]', maxQuantity);
    } else if (inputValue % step !== 0) {
      message = window.quickOrderListStrings.step_error.replace('[step]', step);
    }

    if (message) {
      this.setValidity(event, index, message);
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
            if (selector === 'cart-items' || selector === 'cart-drawer-items') {
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
    const currentCartItemsId = this.dataset.id;
    const cartIconBubble = document.getElementById('cart-icon-bubble');
    const cartLiveRegionText = document.getElementById('cart-live-region-text');
    const cartTotalDeliveryWrapper = document.querySelector('.cart-total-delivery-wrapper');

    const sections = [
      {
        id: 'main-cart-items',
        section: currentCartItemsId,
        selector: '.js-contents',
        elementToReplace: this.querySelector('.js-contents')
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
        selector: '.shopify-section',
        elementToReplace: cartLiveRegionText
      });
    }

    if (cartTotalDeliveryWrapper) {
      sections.push({
        id: 'cart-total-delivery-wrapper',
        section: 'cart-total-delivery-wrapper',
        selector: '.cart-total-delivery-wrapper',
        elementToReplace: cartTotalDeliveryWrapper
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
    // Ensure line is a valid number
    const lineNumber = parseInt(line, 10);
    const quantityNumber = parseInt(quantity, 10);

    if (isNaN(lineNumber) || isNaN(quantityNumber)) {
      console.error('Invalid line or quantity:', { line, quantity });
      return;
    }

    this.enableLoading(lineNumber);

    const sectionsToRequest = this.getSectionsToRender().map((section) => section.section);

    // Convert 1-based line number to 0-based for the server
    const serverLineNumber = lineNumber - 1;

    const body = JSON.stringify({
      line: serverLineNumber, // Send 0-based index to server
      quantity: quantityNumber,
      sections: sectionsToRequest,
      sections_url: window.location.pathname,
    });

    // console.log('Sending cart update:', body);

    fetch(`${routes.cart_change_url}`, {
      ...fetchConfig(),
      ...{ body },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...fetchConfig().headers
      }
    })
      .then((response) => {
        console.log('Cart update response status:', response.status);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text();
      })
      .then((state) => {
        // console.log('Cart update response:', state);

        let parsedState;

        try {
          parsedState = JSON.parse(state);
        } catch (parseError) {
          console.error('Failed to parse cart response:', parseError);
          console.error('Raw response:', state);
          throw new Error('Invalid JSON response from cart update');
        }

        // console.log('Parsed cart state:', parsedState);

        const quantityElement =
          document.getElementById(`Quantity-${lineNumber}`) || document.getElementById(`Drawer-quantity-${lineNumber}`);

        // Handle errors first
        if (parsedState.errors) {
          console.error('Cart update errors:', parsedState.errors);

          if (quantityElement) {
            quantityElement.value = quantityElement.getAttribute('value');
          }

          // Handle different error formats
          let errorMessage = '';
          if (typeof parsedState.errors === 'string') {
            errorMessage = parsedState.errors;
          } else if (typeof parsedState.errors === 'object') {
            errorMessage = Object.values(parsedState.errors).join(', ');
          }

          this.updateLiveRegions(lineNumber, errorMessage);
          return;
        }

        // Validate response structure
        if (typeof parsedState.item_count === 'undefined' || !parsedState.sections) {
          console.error('Unexpected cart response structure:', parsedState);
          throw new Error('Invalid cart response structure');
        }

        // Update cart empty state
        this.classList.toggle('is-empty', parsedState.item_count === 0);
        const cartDrawerWrapper = document.querySelector('cart-drawer');
        if (cartDrawerWrapper) {
          cartDrawerWrapper.classList.toggle('is-empty', parsedState.item_count === 0);
        }

        // Update main cart items section
        const mainCartItemsSectionData = parsedState.sections[this.dataset.id];
        if (mainCartItemsSectionData) {
          this.updateMainCartSection(mainCartItemsSectionData);
        }

        // Update other sections
        this.updateOtherSections(parsedState);

        // Update cart footer
        const updatedCartFooter = document.getElementById('main-cart-footer');
        if (updatedCartFooter) {
          updatedCartFooter.classList.toggle('is-empty', parsedState.item_count === 0);
        }

        // Handle messaging and focus
        this.handlePostUpdateActions(parsedState, lineNumber, quantityNumber, name, variantId, quantityElement);

        // Publish cart update event
        publish(PUB_SUB_EVENTS.cartUpdate, {
          source: 'cart-items',
          cartData: parsedState,
          variantId: variantId
        });
      })
      .catch((error) => {
        console.error("Cart update failed:", error);

        // Hide loading spinners
        this.querySelectorAll('.loading__spinner').forEach((overlay) =>
          overlay.classList.add('hidden')
        );

        // Reset quantity input to previous value
        const quantityElement =
          document.getElementById(`Quantity-${lineNumber}`) || document.getElementById(`Drawer-quantity-${lineNumber}`);
        if (quantityElement) {
          const originalValue = quantityElement.getAttribute('value');
          if (originalValue) {
            quantityElement.value = originalValue;
          }
        }

        // Show error message
        const errors = document.getElementById('cart-errors') || document.getElementById('CartDrawer-CartErrors');
        if (errors) {
          errors.textContent = window.cartStrings?.error || 'שגיאה בעדכון העגלה';
        }

        // Update live regions with error
        this.updateLiveRegions(lineNumber, window.cartStrings?.error || 'שגיאה בעדכון העגלה');
      })
      .finally(() => {
        this.disableLoading(lineNumber);
      });
  }

  // Helper method for focus management
  handleFocusManagement(parsedState, line, name, cartDrawerWrapper) {
    if (parsedState.item_count === 0) {
      // Cart is empty - focus on continue shopping button
      if (cartDrawerWrapper) {
        const drawerInnerEmpty = cartDrawerWrapper.querySelector('.drawer__inner-empty');
        const emptyButton = cartDrawerWrapper.querySelector('button');
        if (drawerInnerEmpty && emptyButton && typeof trapFocus === 'function') {
          trapFocus(drawerInnerEmpty, emptyButton);
        }
      } else {
        const continueShoppingButton = document.querySelector('.cart__warnings .button');
        if (continueShoppingButton) {
          continueShoppingButton.focus();
        }
      }
    } else {
      // Cart still has items
      const newLineItem = document.getElementById(`CartItem-${line}`);
      const targetElement = newLineItem?.querySelector(`[name="${name}"]`);

      if (targetElement) {
        if (cartDrawerWrapper && typeof trapFocus === 'function') {
          trapFocus(cartDrawerWrapper, targetElement);
        } else {
          targetElement.focus();
        }
      } else if (cartDrawerWrapper && typeof trapFocus === 'function') {
        const firstCartItem = document.querySelector('.cart-item__name');
        if (firstCartItem) {
          trapFocus(cartDrawerWrapper, firstCartItem);
        }
      }
    }
  }

  // Helper method to update main cart section
  updateMainCartSection(sectionData) {
    const currentJsContents = this.querySelector('.js-contents');
    if (!currentJsContents) return;

    try {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = sectionData;
      const newJsContents = tempDiv.querySelector('.js-contents');

      if (newJsContents) {
        currentJsContents.innerHTML = newJsContents.innerHTML;
      }
    } catch (htmlError) {
      console.error('Error updating cart contents:', htmlError);
    }
  }

  // Helper method to update other sections
  updateOtherSections(parsedState) {
    this.getSectionsToRender()
      .filter(section => section.id !== 'main-cart-items')
      .forEach((section) => {
        try {
          const sectionData = parsedState.sections[section.section];
          if (!sectionData) return;

          if (section.id === 'cart-total-delivery-wrapper') {
            const deliveryWrapper = document.querySelector('.cart-total-delivery-wrapper');
            if (deliveryWrapper) {
              deliveryWrapper.style.display = parsedState.item_count > 0 ? '' : 'none';
            }
          } else {
            const container = document.getElementById(section.id);
            if (!container) return;

            const elementToReplace = section.selector ? container.querySelector(section.selector) : container;
            if (elementToReplace) {
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = sectionData;
              const newContent = section.selector ? tempDiv.querySelector(section.selector) : tempDiv.firstElementChild;

              if (newContent) {
                elementToReplace.innerHTML = newContent.innerHTML;
              }
            }
          }
        } catch (sectionError) {
          console.error(`Error updating section ${section.id}:`, sectionError);
        }
      });
  }
  // Helper method for post-update actions
  handlePostUpdateActions(parsedState, line, quantity, name, variantId, quantityElement) {
    let message = '';

    // Only check for quantity mismatch if we're not removing the item
    if (quantity > 0 && parsedState.items && variantId) {
      const updatedItem = parsedState.items.find(item =>
        item.variant_id && item.variant_id.toString() === variantId.toString()
      );

      if (updatedItem && quantityElement) {
        const updatedValue = updatedItem.quantity;
        const requestedQuantity = parseInt(quantity);

        // Check if the quantity was adjusted due to inventory limits
        if (updatedValue !== requestedQuantity) {
          if (typeof updatedValue === 'undefined' || updatedValue === 0) {
            message = window.cartStrings?.error || 'שגיאה בעדכון הכמות';
          } else {
            message = (window.cartStrings?.quantityError || 'הכמות עודכנה ל-[quantity]')
              .replace('[quantity]', updatedValue);

            // Update the input to reflect the actual quantity
            quantityElement.value = updatedValue;
            quantityElement.setAttribute('value', updatedValue);
          }
        }
      }
    }

    this.updateLiveRegions(line, message);

    // Handle focus management
    this.handleFocusAfterUpdate(parsedState, line, name);
  }

  handleFocusAfterUpdate(parsedState, line, name) {
    const cartDrawerWrapper = document.querySelector('cart-drawer');

    if (parsedState.item_count === 0) {
      // Cart is empty
      if (cartDrawerWrapper) {
        const drawerInnerEmpty = cartDrawerWrapper.querySelector('.drawer__inner-empty');
        const emptyButton = cartDrawerWrapper.querySelector('button');
        if (drawerInnerEmpty && emptyButton && typeof trapFocus === 'function') {
          trapFocus(drawerInnerEmpty, emptyButton);
        }
      } else {
        const continueShoppingButton = document.querySelector('.cart__warnings .button');
        if (continueShoppingButton) {
          continueShoppingButton.focus();
        }
      }
    } else {
      // Cart still has items - focus on the updated item or first available item
      const newLineItem = document.getElementById(`CartItem-${line}`) || document.getElementById(`CartDrawer-Item-${line}`);
      const targetElement = newLineItem?.querySelector(`[name="${name}"]`);

      if (targetElement) {
        if (cartDrawerWrapper && typeof trapFocus === 'function') {
          trapFocus(cartDrawerWrapper, targetElement);
        } else {
          targetElement.focus();
        }
      } else {
        // Fallback: focus on first cart item
        const firstCartItem = document.querySelector('.cart-item__name');
        if (firstCartItem) {
          if (cartDrawerWrapper && typeof trapFocus === 'function') {
            trapFocus(cartDrawerWrapper, firstCartItem);
          } else {
            firstCartItem.focus();
          }
        }
      }
    }
  }
  updateLiveRegions(line, message) {
    // Note: The line here is a 1-based index, but the IDs in the HTML might be 0-based.
    // If your HTML IDs are 0-based, you might need to adjust them here or ensure consistency.
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

    // Make sure the selector for loading spinners also considers potential 0-based IDs
    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

    [...cartItemElements, ...cartDrawerItemElements].forEach((overlay) => overlay.classList.remove('hidden'));

    document.activeElement.blur();
    this.lineItemStatusElement.setAttribute('aria-hidden', false);
  }

  disableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.remove('cart__items--disabled');

    // Make sure the selector for loading spinners also considers potential 0-based IDs
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