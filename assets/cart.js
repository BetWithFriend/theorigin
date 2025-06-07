class CartRemoveButton extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('click', (event) => {
      event.preventDefault();
      const cartItems = this.closest('cart-items') || this.closest('cart-drawer-items');
      cartItems.updateQuantity(this.dataset.index, 0);
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
    const index = input.dataset.index;
    const minQuantity = parseInt(input.dataset.min) || 0;
    const maxQuantity = parseInt(input.max) || Infinity;
    const step = parseInt(input.step) || 1;

    let message = '';

    // If the input value is 0, remove the item
    if (inputValue === 0) {
      this.updateQuantity(index, 0, document.activeElement.getAttribute('name'), input.dataset.quantityVariantId);
      input.setCustomValidity('');
      input.reportValidity();
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
    this.enableLoading(line);

    const sectionsToRequest = this.getSectionsToRender().map((section) => section.section);

    const body = JSON.stringify({
      line,
      quantity,
      sections: sectionsToRequest,
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

        if (parsedState.errors) {
          if (quantityElement) {
            quantityElement.value = quantityElement.getAttribute('value');
          }
          this.updateLiveRegions(line, parsedState.errors);
          return;
        }

        // Update cart-items element class
        this.classList.toggle('is-empty', parsedState.item_count === 0);
        const cartDrawerWrapper = document.querySelector('cart-drawer');
        if (cartDrawerWrapper) cartDrawerWrapper.classList.toggle('is-empty', parsedState.item_count === 0);

        const mainCartItemsSectionData = parsedState.sections[this.dataset.id];
        if (mainCartItemsSectionData) {
          const currentJsContents = this.querySelector('.js-contents');
          if (currentJsContents) {
            // Create temporary container to parse HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = mainCartItemsSectionData;
            const newJsContents = tempDiv.querySelector('.js-contents');

            if (newJsContents) {
              currentJsContents.innerHTML = newJsContents.innerHTML;
            }
          }
        }

        // Update other sections
        this.getSectionsToRender()
          .filter(section => section.id !== 'main-cart-items')
          .forEach((section) => {
            const sectionData = parsedState.sections[section.section];
            if (!sectionData) return;

            if (section.id === 'cart-total-delivery-wrapper') {
              // Handle cart delivery wrapper specifically
              const deliveryWrapper = document.querySelector('.cart-total-delivery-wrapper');
              if (deliveryWrapper && parsedState.item_count > 0) {
                // Only show delivery if there are items
                deliveryWrapper.style.display = '';
              } else if (deliveryWrapper && parsedState.item_count === 0) {
                // Hide delivery wrapper when cart is empty
                deliveryWrapper.style.display = 'none';
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
          });

        // Update cart footer
        const updatedCartFooter = document.getElementById('main-cart-footer');
        if (updatedCartFooter) {
          updatedCartFooter.classList.toggle('is-empty', parsedState.item_count === 0);
        }

        // Handle focus and messaging
        const updatedValue = parsedState.items[line - 1] ? parsedState.items[line - 1].quantity : undefined;
        let message = '';

        if (parsedState.item_count !== undefined && quantityElement && updatedValue !== parseInt(quantityElement.value)) {
          if (typeof updatedValue === 'undefined' || updatedValue === 0) {
            message = window.cartStrings.error;
          } else {
            message = window.cartStrings.quantityError.replace('[quantity]', updatedValue);
          }
        }

        this.updateLiveRegions(line, message);

        // Handle focus management
        if (parsedState.item_count === 0) {
          // Cart is empty - focus on continue shopping button
          if (cartDrawerWrapper) {
            trapFocus(cartDrawerWrapper.querySelector('.drawer__inner-empty'), cartDrawerWrapper.querySelector('a'));
          } else {
            const continueShoppingButton = document.querySelector('.cart__warnings .button');
            if (continueShoppingButton) continueShoppingButton.focus();
          }
        } else {
          // Cart still has items
          const newLineItem = document.getElementById(`CartItem-${line}`);
          if (newLineItem && newLineItem.querySelector(`[name="${name}"]`)) {
            if (cartDrawerWrapper) {
              trapFocus(cartDrawerWrapper, newLineItem.querySelector(`[name="${name}"]`));
            } else {
              newLineItem.querySelector(`[name="${name}"]`).focus();
            }
          } else if (document.querySelector('.cart-item') && cartDrawerWrapper) {
            trapFocus(cartDrawerWrapper, document.querySelector('.cart-item__name'));
          }
        }

        publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-items', cartData: parsedState, variantId: variantId });
      })
      .catch((e) => {
        console.error("Cart update failed:", e);
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