class CartDrawer extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('keyup', (evt) => evt.code === 'Escape' && this.close());
    this.querySelector('#CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
    this.setHeaderCartIconAccessibility();
  }

  setHeaderCartIconAccessibility() {
    const cartLink = document.querySelector('#cart-icon-bubble');
    if (!cartLink) return;

    cartLink.setAttribute('role', 'button');
    cartLink.setAttribute('aria-haspopup', 'dialog');
    cartLink.addEventListener('click', (event) => {
      event.preventDefault();
      this.open(cartLink);
    });
    cartLink.addEventListener('keydown', (event) => {
      if (event.code.toUpperCase() === 'SPACE') {
        event.preventDefault();
        this.open(cartLink);
      }
    });
  }

  open(triggeredBy) {
    if (triggeredBy) this.setActiveElement(triggeredBy);
    const cartDrawerNote = this.querySelector('[id^="Details-"] summary');
    if (cartDrawerNote && !cartDrawerNote.hasAttribute('role')) this.setSummaryAccessibility(cartDrawerNote);
    // here the animation doesn't seem to always get triggered. A timeout seem to help
    setTimeout(() => {
      this.classList.add('animate', 'active');
    });

    this.addEventListener(
      'transitionend',
      () => {
        const containerToTrapFocusOn = this.classList.contains('is-empty')
          ? this.querySelector('.drawer__inner-empty')
          : document.getElementById('CartDrawer');
        const focusElement = this.querySelector('.drawer__inner') || this.querySelector('.drawer__close');
        trapFocus(containerToTrapFocusOn, focusElement);
      },
      { once: true }
    );

    document.body.classList.add('overflow-hidden');

    analytics.track('Cart', {
      'Action': 'Open',
    });

    // Hide the chat widget when the cart drawer is opened
    const chatWidget = document.querySelector('.origin-bot-origin-chat-widget');
    if (chatWidget) {
      chatWidget.style.display = 'none';
    }
  }

  close() {
    this.classList.remove('active');
    removeTrapFocus(this.activeElement);
    document.body.classList.remove('overflow-hidden');
    // const quantityToast = document.querySelector('.minumum-items-wrapper');
    // if (quantityToast) {
    //   quantityToast.classList.remove('show');
    // }

    analytics.track('Cart', {
      'Action': 'Close',
    });


    const chatWidget = document.querySelector('.origin-bot-origin-chat-widget');
    if (chatWidget) {
      chatWidget.style.display = 'flex';
    }
  }

  setSummaryAccessibility(cartDrawerNote) {
    cartDrawerNote.setAttribute('role', 'button');
    cartDrawerNote.setAttribute('aria-expanded', 'false');

    if (cartDrawerNote.nextElementSibling.getAttribute('id')) {
      cartDrawerNote.setAttribute('aria-controls', cartDrawerNote.nextElementSibling.id);
    }

    cartDrawerNote.addEventListener('click', (event) => {
      event.currentTarget.setAttribute('aria-expanded', !event.currentTarget.closest('details').hasAttribute('open'));
    });

    cartDrawerNote.parentElement.addEventListener('keyup', onKeyUpEscape);
  }

  renderContents(parsedState) {
    this.querySelector('.drawer__inner').classList.contains('is-empty') &&
      this.querySelector('.drawer__inner').classList.remove('is-empty');
    this.productId = parsedState.id;
    this.getSectionsToRender().forEach((section) => {
      const sectionElement = section.selector
        ? document.querySelector(section.selector)
        : document.getElementById(section.id);

      if (!sectionElement) return;
      sectionElement.innerHTML = this.getSectionInnerHTML(parsedState.sections[section.id], section.selector);
    });

    setTimeout(() => {
      this.querySelector('#CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
      this.open();
    });
  }

  getSectionInnerHTML(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  getSectionsToRender() {
    return [
      {
        id: 'cart-drawer',
        selector: '#CartDrawer',
      },
      {
        id: 'cart-icon-bubble',
      },
    ];
  }

  getSectionDOM(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
  }

  setActiveElement(element) {
    this.activeElement = element;
  }
}

customElements.define('cart-drawer', CartDrawer);

class CartDrawerItems extends CartItems {
  getSectionsToRender() {
    return [
      {
        id: 'cart-drawer-items',
        section: 'cart-drawer',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
    ];
  }

  syncDrawerEmptyState(sectionData, isEmpty) {
    const drawerInner = document.querySelector('#CartDrawer .drawer__inner');
    if (!drawerInner || !sectionData) return;

    const doc = new DOMParser().parseFromString(sectionData, 'text/html');
    const existingEmpty = drawerInner.querySelector('.drawer__inner-empty');
    const existingEmptyBtn = drawerInner.querySelector('button.empty-cart-btn');

    if (isEmpty) {
      const newEmpty = doc.querySelector('.drawer__inner-empty');
      const newEmptyBtn = doc.querySelector('button.empty-cart-btn');

      if (newEmpty) {
        const clone = newEmpty.cloneNode(true);
        if (existingEmpty) {
          existingEmpty.replaceWith(clone);
        } else {
          drawerInner.insertBefore(clone, drawerInner.firstChild);
        }
      }

      if (newEmptyBtn) {
        const clone = newEmptyBtn.cloneNode(true);
        if (existingEmptyBtn) {
          existingEmptyBtn.replaceWith(clone);
        } else {
          const emptyInner = drawerInner.querySelector('.drawer__inner-empty');
          if (emptyInner) {
            emptyInner.after(clone);
          } else {
            drawerInner.insertBefore(clone, drawerInner.firstChild);
          }
        }
      }
    } else {
      existingEmpty?.remove();
      existingEmptyBtn?.remove();
    }
  }

  updateOtherSections(parsedState) {
    const sectionData = parsedState.sections['cart-drawer'];
    if (sectionData) {
      try {
        this.syncDrawerEmptyState(sectionData, parsedState.item_count === 0);

        const doc = new DOMParser().parseFromString(sectionData, 'text/html');

        const currentContents = this.querySelector('.js-contents');
        const newContents = doc.querySelector('.js-contents');
        if (currentContents && newContents) {
          currentContents.innerHTML = newContents.innerHTML;
        }

        const currentFooter = document.querySelector('#CartDrawer .cart-drawer__footer');
        const newFooter = doc.querySelector('.cart-drawer__footer');
        if (currentFooter && newFooter) {
          currentFooter.innerHTML = newFooter.innerHTML;
        }
      } catch (error) {
        console.error('Error updating cart drawer:', error);
      }
    }

    const bubbleSectionData = parsedState.sections['cart-icon-bubble'];
    if (!bubbleSectionData) return;

    try {
      const container = document.getElementById('cart-icon-bubble');
      if (!container) return;

      const doc = new DOMParser().parseFromString(bubbleSectionData, 'text/html');
      const newContent = doc.querySelector('.shopify-section') || doc.body.firstElementChild;
      const elementToReplace = container.querySelector('.shopify-section') || container;

      if (newContent && elementToReplace) {
        elementToReplace.innerHTML = newContent.innerHTML;
      }
    } catch (error) {
      console.error('Error updating cart icon bubble:', error);
    }
  }
}

customElements.define('cart-drawer-items', CartDrawerItems);

function blockCartPageNavigation() {
  if (window.__cartDrawerNavigationBlocked) return;
  window.__cartDrawerNavigationBlocked = true;

  document.addEventListener(
    'click',
    (event) => {
      const link = event.target.closest('a[href]');
      if (!link) return;

      let pathname;
      try {
        pathname = new URL(link.href, window.location.origin).pathname;
      } catch (_error) {
        return;
      }

      if (pathname !== '/cart') return;

      const cartDrawer = document.querySelector('cart-drawer');
      if (!cartDrawer) return;

      event.preventDefault();
      cartDrawer.open(link);
    },
    true
  );

  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      const action = form.getAttribute('action') || '';
      const isAddToCartForm =
        form.classList.contains('js-quick-add-form') ||
        form.dataset.type === 'add-to-cart-form' ||
        action.includes('/cart/add');

      if (!isAddToCartForm) return;
      if (form.classList.contains('js-quick-add-form')) return;
      if (form.closest('product-form')) return;
      if (form.id === 'CartDrawer-Form') return;
      if (form.classList.contains('product-form--questionnaire')) return;

      event.preventDefault();
      event.stopPropagation();
    },
    true
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', blockCartPageNavigation);
} else {
  blockCartPageNavigation();
}
