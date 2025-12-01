if (!customElements.get('quick-add-modal')) {
  customElements.define(
    'quick-add-modal',
    class QuickAddModal extends ModalDialog {
      constructor() {
        super();
        this.modalContent = this.querySelector('[id^="QuickAddInfo-"]');

        this.addEventListener('product-info:loaded', ({ target }) => {
          target.addPreProcessCallback(this.preprocessHTML.bind(this));
        });
      }

      hide(preventFocus = false) {
        const cartNotification = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        if (cartNotification) cartNotification.setActiveElement(this.openedBy);
        this.modalContent.innerHTML = '';

        if (preventFocus) this.openedBy = null;
        super.hide();
      }

      show(opener) {
        opener.setAttribute('aria-disabled', true);
        opener.classList.add('loading');
        opener.querySelector('.loading__spinner').classList.remove('hidden');

        fetch(opener.getAttribute('data-product-url'))
          .then((response) => response.text())
          .then((responseText) => {
            const responseHTML = new DOMParser().parseFromString(responseText, 'text/html');
            const productElement = responseHTML.querySelector('product-info');

            this.preprocessHTML(productElement);
            HTMLUpdateUtility.setInnerHTML(this.modalContent, productElement.outerHTML);

            if (window.Shopify && Shopify.PaymentButton) {
              Shopify.PaymentButton.init();
            }
            if (window.ProductModel) window.ProductModel.loadShopifyXR();

            super.show(opener);
          })
          .finally(() => {
            opener.removeAttribute('aria-disabled');
            opener.classList.remove('loading');
            opener.querySelector('.loading__spinner').classList.add('hidden');
          });
      }

      preprocessHTML(productElement) {
        productElement.classList.forEach((classApplied) => {
          if (classApplied.startsWith('color-') || classApplied === 'gradient')
            this.modalContent.classList.add(classApplied);
        });
        this.preventDuplicatedIDs(productElement);
        this.removeDOMElements(productElement);
        this.removeGalleryListSemantic(productElement);
        this.updateImageSizes(productElement);
        this.preventVariantURLSwitching(productElement);
      }

      preventVariantURLSwitching(productElement) {
        productElement.setAttribute('data-update-url', 'false');
      }

      removeDOMElements(productElement) {
        const pickupAvailability = productElement.querySelector('pickup-availability');
        if (pickupAvailability) pickupAvailability.remove();

        const productModal = productElement.querySelector('product-modal');
        if (productModal) productModal.remove();

        const modalDialog = productElement.querySelectorAll('modal-dialog');
        if (modalDialog) modalDialog.forEach((modal) => modal.remove());
      }

      preventDuplicatedIDs(productElement) {
        const sectionId = productElement.dataset.section;

        const oldId = sectionId;
        const newId = `quickadd-${sectionId}`;
        productElement.innerHTML = productElement.innerHTML.replaceAll(oldId, newId);
        Array.from(productElement.attributes).forEach((attribute) => {
          if (attribute.value.includes(oldId)) {
            productElement.setAttribute(attribute.name, attribute.value.replace(oldId, newId));
          }
        });

        productElement.dataset.originalSection = sectionId;
      }

      removeGalleryListSemantic(productElement) {
        const galleryList = productElement.querySelector('[id^="Slider-Gallery"]');
        if (!galleryList) return;

        galleryList.setAttribute('role', 'presentation');
        galleryList.querySelectorAll('[id^="Slide-"]').forEach((li) => li.setAttribute('role', 'presentation'));
      }

      updateImageSizes(productElement) {
        const product = productElement.querySelector('.product');
        const desktopColumns = product?.classList.contains('product--columns');
        if (!desktopColumns) return;

        const mediaImages = product.querySelectorAll('.product__media img');
        if (!mediaImages.length) return;

        let mediaImageSizes =
          '(min-width: 1000px) 715px, (min-width: 750px) calc((100vw - 11.5rem) / 2), calc(100vw - 4rem)';

        if (product.classList.contains('product--medium')) {
          mediaImageSizes = mediaImageSizes.replace('715px', '605px');
        } else if (product.classList.contains('product--small')) {
          mediaImageSizes = mediaImageSizes.replace('715px', '495px');
        }

        mediaImages.forEach((img) => img.setAttribute('sizes', mediaImageSizes));
      }
    }
  );
}

document.addEventListener('DOMContentLoaded', function () {
  // Handle quick add forms on collection page
  if (!window.__quickAddSubmitListenerAdded) {
    window.__quickAddSubmitListenerAdded = true;
    document.addEventListener('submit', function (event) {
      if (event.target.classList && event.target.classList.contains('js-quick-add-form')) {
        event.preventDefault();
        handleQuickAddToCart(event.target);
      }
    });
  }
});

function handleQuickAddToCart(form) {
  const submitButton = form.querySelector('button[type="submit"]');
  const variantId = form.querySelector('.product-variant-id').value;
  const img = submitButton.querySelector('.add-to-cart-catalog-img');

  // Disable button to prevent double submissions
  submitButton.disabled = true;
  let originalText = submitButton.innerHTML;
  const originalSrc = img ? img.src : null;

  submitButton.innerHTML = 'מוסיף מוצר...';

  // Use Shopify's Cart API to add item
  fetch('/cart/add.js', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: variantId,
      quantity: 1
    })
  })
    .then(response => response.json())
    .then(data => {
      // Successfully added to cart
      originalText = originalText.replace('add-to-cart-catalog.png', 'add-to-cart-catalog-added.png')

      // Update cart drawer and icon
      updateCartDrawer();

      // Re-enable button and keep original text, just change the image
      submitButton.disabled = false;
      submitButton.innerHTML = originalText;
    })
    .catch(error => {
      console.error('Error adding to cart:', error);
      submitButton.innerHTML = 'Error - Try Again';
      submitButton.disabled = false;

      // Reset after 2 seconds on error
      setTimeout(() => {
        submitButton.innerHTML = originalText;
        if (img && originalSrc) {
          img.src = originalSrc;
        }
      }, 2000);
    });
}

function updateCartDrawer() {
  // Fetch both the cart data and updated sections
  Promise.all([
    fetch('/cart.js').then(r => r.json()),
    fetch(`${window.location.origin}?sections=cart-drawer,cart-icon-bubble`).then(r => r.json())
  ])
    .then(([cart, sections]) => {
      // Update cart drawer content
      const cartDrawerInner = document.querySelector('#CartDrawer .drawer__inner');
      if (cartDrawerInner && sections['cart-drawer']) {
        const parser = new DOMParser();
        const newContent = parser.parseFromString(sections['cart-drawer'], 'text/html');
        const newDrawerInner = newContent.querySelector('.drawer__inner');

        if (newDrawerInner) {
          cartDrawerInner.innerHTML = newDrawerInner.innerHTML;
        }
      }

      // Remove is-empty class if cart has items
      if (cart.item_count > 0) {
        const cartDrawerElement = document.querySelector('cart-drawer');
        if (cartDrawerElement) {
          cartDrawerElement.classList.remove('is-empty');
        }
        if (cartDrawerInner) {
          cartDrawerInner.classList.remove('is-empty');
        }
      }

      // Update cart icon bubble
      const cartIconBubble = document.getElementById('cart-icon-bubble');
      if (cartIconBubble && sections['cart-icon-bubble']) {
        const parser = new DOMParser();
        const newContent = parser.parseFromString(sections['cart-icon-bubble'], 'text/html');

        // Get the shopify-section wrapper
        const sectionWrapper = newContent.querySelector('#shopify-section-cart-icon-bubble');
        if (sectionWrapper) {
          // The actual cart icon content is the innerHTML of the section
          cartIconBubble.outerHTML = sectionWrapper.innerHTML;

          // Re-attach event listeners
          const cartDrawerElement = document.querySelector('cart-drawer');
          if (cartDrawerElement) {
            cartDrawerElement.setHeaderCartIconAccessibility();
          }
        }
      }
    })
    .catch(error => {
      console.error('Error updating cart:', error);
    });
}

