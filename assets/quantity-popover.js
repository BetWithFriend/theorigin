if (!customElements.get('quantity-popover')) {
  customElements.define(
    'quantity-popover',
    class QuantityPopover extends HTMLElement {
      constructor() {
        super();
        this.mql = window.matchMedia('(min-width: 990px)');
        this.mqlTablet = window.matchMedia('(min-width: 750px)');
        this.infoButtonDesktop = this.querySelector('.quantity-popover__info-button--icon-only');
        this.infoButtonMobile = this.querySelector('.quantity-popover__info-button--icon-with-label');
        this.popoverInfo = this.querySelector('.quantity-popover__info');
        this.closeButton = this.querySelector('.button-close');
        this.eventMouseEnterHappened = false;

        // NEW: Find the minus and plus buttons within this component
        this.quantityInput = this.querySelector('.quantity__input');
        this.minusButton = this.querySelector('.quantity__button[name="minus"]');

        if (this.closeButton) {
          this.closeButton.addEventListener('click', this.closePopover.bind(this));
        }

        if (this.popoverInfo && this.infoButtonDesktop && this.mqlTablet.matches) {
          this.popoverInfo.addEventListener('mouseleave', this.closePopover.bind(this));
        }

        if (this.infoButtonDesktop) {
          this.infoButtonDesktop.addEventListener('click', this.togglePopover.bind(this));
          this.infoButtonDesktop.addEventListener('focusout', this.closePopover.bind(this));
        }

        if (this.infoButtonMobile) {
          this.infoButtonMobile.addEventListener('click', this.togglePopover.bind(this));
        }

        if (this.infoButtonDesktop && this.mqlTablet.matches) {
          this.infoButtonDesktop.addEventListener('mouseenter', this.togglePopover.bind(this));
          this.infoButtonDesktop.addEventListener('mouseleave', this.closePopover.bind(this));
        }

        // NEW: Add event listener for the minus button
        if (this.minusButton) {
          this.minusButton.addEventListener('click', this.handleMinusClick.bind(this));
        }
      }

      // NEW: Method to handle the minus button click
      handleMinusClick(event) {
        const currentValue = parseInt(this.quantityInput.value, 10);
        if (currentValue === 2) {
          event.preventDefault(); // Stop the default behavior
          this.quantityInput.value = 0; // Set the value to 0
          this.quantityInput.dispatchEvent(new Event('change', { bubbles: true })); // Trigger a change event
        }
      }

      togglePopover(event) {
        event.preventDefault();
        if (event.type === 'mouseenter') {
          this.eventMouseEnterHappened = true;
        }

        if (event.type === 'click' && this.eventMouseEnterHappened) return;

        const button = this.infoButtonDesktop && this.mql.matches ? this.infoButtonDesktop : this.infoButtonMobile;
        const isExpanded = button.getAttribute('aria-expanded') === 'true';

        if ((this.mql.matches && !isExpanded) || event.type === 'click') {
          button.setAttribute('aria-expanded', !isExpanded);

          this.popoverInfo.toggleAttribute('hidden');

          button.classList.toggle('quantity-popover__info-button--open');

          this.infoButtonDesktop.classList.add('quantity-popover__info-button--icon-only--animation');
        }

        const isOpen = button.getAttribute('aria-expanded') === 'true';

        if (isOpen && event.type !== 'mouseenter') {
          button.focus();
          button.addEventListener('keyup', (e) => {
            if (e.key === 'Escape') {
              this.closePopover(e);
            }
          });
        }
      }

      closePopover(event) {
        event.preventDefault();
        const isButtonChild = this.infoButtonDesktop.contains(event.relatedTarget);
        const isPopoverChild = this.popoverInfo.contains(event.relatedTarget);

        const button = this.infoButtonDesktop && this.mql.matches ? this.infoButtonDesktop : this.infoButtonMobile;

        if (!isButtonChild && !isPopoverChild) {
          button.setAttribute('aria-expanded', 'false');
          button.classList.remove('quantity-popover__info-button--open');
          this.popoverInfo.setAttribute('hidden', '');
          this.infoButtonDesktop.classList.remove('quantity-popover__info-button--icon-only--animation');
        }

        this.eventMouseEnterHappened = false;
      }
    }
  );
}