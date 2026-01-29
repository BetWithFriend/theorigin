// assets/recently-viewed.js

class RecentlyViewedProducts {
  constructor(limit = 7) {
    this.limit = limit;
    this.localStorageKey = 'shopify_recently_viewed_handles'; // Changed key to reflect handles
  }

  getProducts() {
    try {
      const products = JSON.parse(localStorage.getItem(this.localStorageKey)) || [];
      return products.handles ? products.handles : [];
    } catch (e) {
      console.error('Error parsing recently viewed product handles from localStorage:', e);
      return [];
    }
  }

  addProduct(productHandle) {
    if (!productHandle) return;

    let products = this.getProducts();

    // Remove the product if it's already in the list to move it to the front
    products = products.filter(handle => handle !== productHandle);

    // Add the new product to the beginning of the list
    products.unshift(productHandle);

    // Limit the number of products
    products = products.slice(0, this.limit);

    try {
      const expiry = Date.now() + 14 * 24 * 60 * 60 * 1000; // 2 weeks in ms
      localStorage.setItem(this.localStorageKey, JSON.stringify({
        handles: products,
        expiresAt: expiry
      }));
    } catch (e) {
      console.error('Error saving recently viewed product handles to localStorage:', e);
    }
  }
}

class RecentlyViewedProductsComponent extends HTMLElement {
  constructor() {
    super();
    this.sectionId = this.dataset.sectionId;
    this.productsToShow = parseInt(this.dataset.productsToShow, 10);
    this.recentlyViewed = window.recentlyViewedProducts || new RecentlyViewedProducts();
    this.productGrid = this.querySelector('#recently-viewed-products-grid');

    // Style settings from data attributes
    this.sectionColorScheme = this.dataset.colorScheme || 'scheme-1';
    this.cardStyle = this.dataset.cardStyle || 'standard';
    this.cardColorScheme = this.dataset.cardColorScheme || 'scheme-1';

    this.init();
  }

  async init() {
    const productHandles = this.recentlyViewed.getProducts();
    if (productHandles.length === 0) {
      return;
    }

    // Filter out the current product if on a product page
    const currentProductElement = document.querySelector('product-info');
    const currentProductHandle = currentProductElement ? currentProductElement.dataset.productHandle : null;
    const filteredProductHandles = currentProductHandle ? productHandles.filter(handle => handle !== currentProductHandle) : productHandles;

    if (filteredProductHandles.length === 0) {
      return;
    }

    const handlesToFetch = filteredProductHandles.slice(0, this.productsToShow);

    try {
      const products = await this.fetchProducts(handlesToFetch);
      window.recentlyViewedProducts = products;
      if (products.length > 0) {
        this.renderProducts(products);
        this.style.display = 'block';
      }
    } catch (error) {
      console.error('Error fetching or rendering recently viewed products:', error);
    }
  }

  async fetchProducts(handles) {
    const productData = await Promise.all(
      handles.map(async (handle) => {
        const response = await fetch(`${window.shopUrl}/products/${handle}.js?view=metafields-json`);
        if (!response.ok) {
          console.warn(`Could not fetch product with handle ${handle}. Status: ${response.status}`);
          return null;
        }
        return await response.json();
      })
    );
    return productData.filter(Boolean);
  }

  renderProducts(products) {
    if (!this.productGrid) return;

    products.forEach(product => {
      const li = document.createElement('li');
      li.classList.add('grid__item', 'slider__slide', 'scroll-trigger', 'animate--slide-in', 'recently-viewed');

      // Replicating a simplified card-product structure using the fetched JSON data
      const featuredImage = product.featured_image ? product.featured_image : '';
      const featuredImageWidth = product.media[0] ? product.media[0].width : '';
      const featuredImageHeight = product.media[0] ? product.media[0].height : '';
      const price = product.price;
      // const productTastes = product.product_tastes;

      // Logic for tags - API returns tags as array of strings
      let tagsHtml = '';
      if (product.tags && Array.isArray(product.tags)) {
        // Tag matching (case-insensitive just in case)
        const tags = product.tags.map(t => t.toLowerCase());
        if (tags.includes('new')) tagsHtml += '<span class="cart-info-new-tag new-product">חדש</span>';
        if (tags.includes('deal')) tagsHtml += '<span class="cart-info-new-tag deal">מבצע</span>';
        if (tags.includes('recommended')) tagsHtml += '<span class="cart-info-new-tag recommended">מומלץ</span>';
        if (tags.includes('decaf')) tagsHtml += '<span class="cart-info-new-tag decaf">נטול</span>';
      }

      // Determine classes for card inner to handle background
      // User requested removing white bg -> ensure no conflicting color schemes
      // If card style is standard, it usually has no border/bg unless defined.
      // We use the passed cardColorScheme.
      const cardColorClass = this.cardStyle === 'card' ? `color-${this.cardColorScheme} gradient` : `color-${this.cardColorScheme}`;

      // Formatting price: 100 cents -> 1.00. Using ₪ symbol.
      const priceFormatted = formatMoney(price);

      li.innerHTML = `
        <div class="card-wrapper product-card-wrapper underline-links-hover">
          <div class="cart-info-title-wrapper">
            ${tagsHtml}
          </div>
          <div class="card card--product card--media card--${this.cardStyle}">
            <div class="card__inner ${cardColorClass} gradient ratio" style="--ratio-percent: 100%;">
              <div class="card__media media media--transparent media--hover-effect">
                <img
                  src="${featuredImage}"
                  alt="${product.title}"
                  loading="lazy"
                  width="${featuredImageWidth}"
                  height="${featuredImageHeight}"
                  class="motion-reduce"
                >
                ${product.images && product.images[1] ? `
                <img
                  src="${product.images[1]}"
                  alt=""
                  class="motion-reduce"
                  loading="lazy"
                  width="${featuredImageWidth}"
                  height="${featuredImageHeight}"
                >` : ''}
              </div>
            </div>
            
            <div class="card__content">
              <div class="card__information">
                <div class="card__information-top">
                    <div class="full-unstyled-link">${product.title}</div>
                    <div class="cart-info-sub-title-wrapper">
                      ${product.vendor}
                    </div>
                </div>
                
                <h3 class="card__heading h5">
                  <a href="${product.url}" class="full-unstyled-link">
                    <!-- Title usually here but structured differently in custom card -->
                  </a>
                </h3>
                <div class="product-taste-icons">
                <div class="selection-wrapper plp-taste-text-wrapper">
                  
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <hr class="card-product-divider" />
        <div class="price-product-wrapper">
          <div class="price">
            <div class="price-item">
              <span class="price-item price-item--regular">
                ${priceFormatted}
              </span>
            </div>
          </div>
        </div>
      `;

      const link = li.querySelector('a');
      if (link) {
        link.addEventListener('click', () => {
          analytics.trackClick('Recently Viewed Product',
            {
              product_handle: product.handle,
              product_title: product.title,
              product_vendor: product.vendor,
              product_price: product.price,
            }
          )
        });
      }

      this.productGrid.appendChild(li);
    });

    // Helper for formatting money
    function formatMoney(cents) {
      if (!cents && cents !== 0) return '';
      // Assuming ILS - usually integers or 2 decimals
      // Intl formatter is safer but simple divide is ok for now. 
      // User complained about format.
      return '₪' + (cents / 100).toFixed(0);
    }

    // Initialize slider if it's a slider
    if (typeof theme !== 'undefined' && typeof theme.initSliders === 'function') {
      theme.initSliders();
    }
  }
}

// Initialize and track product on product pages
document.addEventListener('DOMContentLoaded', () => {
  customElements.define('recently-viewed-products', RecentlyViewedProductsComponent);
  const productInfo = document.querySelector('product-info');

  // Access the product handle (assuming product-info has data-product-handle now)
  const productHandle = productInfo ? productInfo.dataset.productHandle : null;
  if (productHandle) {
    const recentlyViewed = new RecentlyViewedProducts();
    recentlyViewed.addProduct(productHandle);
  }
});

// Expose for other scripts if needed
window.recentlyViewedProducts = new RecentlyViewedProducts();