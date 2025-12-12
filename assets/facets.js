class FacetFiltersForm extends HTMLElement {
  constructor() {
    super();
    this.onActiveFilterClick = this.onActiveFilterClick.bind(this);

    this.debouncedOnSubmit = debounce((event) => {
      this.onSubmitHandler(event);
    }, 800);

    const facetForm = this.querySelector('form');
    facetForm.addEventListener('input', this.debouncedOnSubmit.bind(this));

    const facetWrapper = this.querySelector('#FacetsWrapperDesktop');
    // const questionnaireWrapper = this.querySelector('#questionnaireWrapperDesktop');
    if (facetWrapper) facetWrapper.addEventListener('keyup', onKeyUpEscape);
    // if (questionnaireWrapper) questionnaireWrapper.addEventListener('keyup', onKeyUpEscape);
  }

  static setListeners() {
    const onHistoryChange = (event) => {
      const searchParams = event.state ? event.state.searchParams : FacetFiltersForm.searchParamsInitial;
      if (searchParams === FacetFiltersForm.searchParamsPrev) return;
      FacetFiltersForm.renderPage(searchParams, null, false);
    };
    window.addEventListener('popstate', onHistoryChange);
  }

  static toggleActiveFacets(disable = true) {
    document.querySelectorAll('.js-facet-remove').forEach((element) => {
      element.classList.toggle('disabled', disable);
    });
  }

  static renderPage(searchParams, event, updateURLHash = true) {
    FacetFiltersForm.searchParamsPrev = searchParams;
    const sections = FacetFiltersForm.getSections();
    const countContainer = document.getElementById('ProductCount');
    const countContainerDesktop = document.getElementById('ProductCountDesktop');
    const loadingSpinners = document.querySelectorAll(
      '.facets-container .loading__spinner, facet-filters-form .loading__spinner'
    );
    loadingSpinners.forEach((spinner) => spinner.classList.remove('hidden'));
    document.getElementById('ProductGridContainer').querySelector('.collection').classList.add('loading');
    if (countContainer) {
      countContainer.classList.add('loading');
    }
    if (countContainerDesktop) {
      countContainerDesktop.classList.add('loading');
    }

    sections.forEach((section) => {
      const url = `${window.location.pathname}?section_id=${section.section}&${searchParams}`;
      const filterDataUrl = (element) => element.url === url;

      FacetFiltersForm.filterData.some(filterDataUrl)
        ? FacetFiltersForm.renderSectionFromCache(filterDataUrl, event)
        : FacetFiltersForm.renderSectionFromFetch(url, event);
    });

    if (updateURLHash) FacetFiltersForm.updateURLHash(searchParams);
  }

  static renderSectionFromFetch(url, event) {
    fetch(url)
      .then((response) => response.text())
      .then((responseText) => {
        const html = responseText;
        FacetFiltersForm.filterData = [...FacetFiltersForm.filterData, { html, url }];
        FacetFiltersForm.renderFilters(html, event);
        FacetFiltersForm.renderProductGridContainer(html);
        FacetFiltersForm.renderProductCount(html);
        if (typeof initializeScrollAnimationTrigger === 'function') initializeScrollAnimationTrigger(html.innerHTML);
      });
  }

  static renderSectionFromCache(filterDataUrl, event) {
    const html = FacetFiltersForm.filterData.find(filterDataUrl).html;
    FacetFiltersForm.renderFilters(html, event);
    FacetFiltersForm.renderProductGridContainer(html);
    FacetFiltersForm.renderProductCount(html);
    if (typeof initializeScrollAnimationTrigger === 'function') initializeScrollAnimationTrigger(html.innerHTML);
  }

  static renderProductGridContainer(html) {
    document.getElementById('ProductGridContainer').innerHTML = new DOMParser()
      .parseFromString(html, 'text/html')
      .getElementById('ProductGridContainer').innerHTML;

    document
      .getElementById('ProductGridContainer')
      .querySelectorAll('.scroll-trigger')
      .forEach((element) => {
        element.classList.add('scroll-trigger--cancel');
      });
  }

  static renderProductCount(html) {
    const count = new DOMParser().parseFromString(html, 'text/html').getElementById('ProductCount').innerHTML;
    const container = document.getElementById('ProductCount');

    const containerDesktop = document.getElementById('ProductCountDesktop');
    container.innerHTML = count;
    container.classList.remove('loading');
    if (containerDesktop) {
      containerDesktop.innerHTML = count;
      containerDesktop.classList.remove('loading');
    }
    const loadingSpinners = document.querySelectorAll(
      '.facets-container .loading__spinner, facet-filters-form .loading__spinner'
    );
    loadingSpinners.forEach((spinner) => spinner.classList.add('hidden'));
  }

  static renderFilters(html, event) {
    const parsedHTML = new DOMParser().parseFromString(html, 'text/html');
    const facetDetailsElementsFromFetch = parsedHTML.querySelectorAll(
      '#FacetFiltersForm .js-filter, #FacetFiltersFormMobile .js-filter, #FacetFiltersPillsForm .js-filter'
    );
    const facetDetailsElementsFromDom = document.querySelectorAll(
      '#FacetFiltersForm .js-filter, #FacetFiltersFormMobile .js-filter, #FacetFiltersPillsForm .js-filter'
    );

    // Remove facets that are no longer returned from the server
    Array.from(facetDetailsElementsFromDom).forEach((currentElement) => {
      if (!Array.from(facetDetailsElementsFromFetch).some(({ id }) => currentElement.id === id)) {
        currentElement.remove();
      }
    });

    const matchesId = (element) => {
      const jsFilter = event ? event.target.closest('.js-filter') : undefined;
      return jsFilter ? element.id === jsFilter.id : false;
    };

    const facetsToRender = Array.from(facetDetailsElementsFromFetch).filter((element) => !matchesId(element));
    const countsToRender = Array.from(facetDetailsElementsFromFetch).find(matchesId);

    facetsToRender.forEach((elementToRender, index) => {
      const currentElement = document.getElementById(elementToRender.id);
      // Element already rendered in the DOM so just update the innerHTML
      if (currentElement) {
        document.getElementById(elementToRender.id).innerHTML = elementToRender.innerHTML;
      } else {
        if (index > 0) {
          const { className: previousElementClassName, id: previousElementId } = facetsToRender[index - 1];
          // Same facet type (eg horizontal/vertical or drawer/mobile)
          if (elementToRender.className === previousElementClassName) {
            document.getElementById(previousElementId).after(elementToRender);
            return;
          }
        }

        if (elementToRender.parentElement) {
          document.querySelector(`#${elementToRender.parentElement.id} .js-filter`).before(elementToRender);
        }
      }
    });

    FacetFiltersForm.renderActiveFacets(parsedHTML);
    FacetFiltersForm.renderAdditionalElements(parsedHTML);

    if (countsToRender) {
      const closestJSFilterID = event.target.closest('.js-filter').id;

      if (closestJSFilterID) {
        FacetFiltersForm.renderCounts(countsToRender, event.target.closest('.js-filter'));
        FacetFiltersForm.renderMobileCounts(countsToRender, document.getElementById(closestJSFilterID));

        const newFacetDetailsElement = document.getElementById(closestJSFilterID);
        const newElementSelector = newFacetDetailsElement.classList.contains('mobile-facets__details')
          ? `.mobile-facets__close-button`
          : `.facets__summary`;
        const newElementToActivate = newFacetDetailsElement.querySelector(newElementSelector);

        const isTextInput = event.target.getAttribute('type') === 'text';

        if (newElementToActivate && !isTextInput) newElementToActivate.focus();
      }
    }
    // Ensure selected icons are always updated after render
    FacetFiltersForm.prototype.updateDropdownButtonText.call(this, 'taste');
    FacetFiltersForm.prototype.updateDropdownButtonText.call(this, 'prep');
  }

  static renderActiveFacets(html) {
    const activeFacetElementSelectors = ['.active-facets-mobile', '.active-facets-desktop'];

    activeFacetElementSelectors.forEach((selector) => {
      const activeFacetsElement = html.querySelector(selector);
      if (!activeFacetsElement) return;
      document.querySelector(selector).innerHTML = activeFacetsElement.innerHTML;
    });

    FacetFiltersForm.toggleActiveFacets(false);
  }

  static renderAdditionalElements(html) {
    const mobileElementSelectors = ['.mobile-facets__open', '.mobile-facets__count', '.sorting'];

    mobileElementSelectors.forEach((selector) => {
      if (!html.querySelector(selector)) return;
      document.querySelector(selector).innerHTML = html.querySelector(selector).innerHTML;
    });

    document.getElementById('FacetFiltersFormMobile').closest('menu-drawer').bindEvents();
  }

  static renderCounts(source, target) {
    const targetSummary = target.querySelector('.facets__summary');
    const sourceSummary = source.querySelector('.facets__summary');

    if (sourceSummary && targetSummary) {
      targetSummary.outerHTML = sourceSummary.outerHTML;
    }

    const targetHeaderElement = target.querySelector('.facets__header');
    const sourceHeaderElement = source.querySelector('.facets__header');

    if (sourceHeaderElement && targetHeaderElement) {
      targetHeaderElement.outerHTML = sourceHeaderElement.outerHTML;
    }

    const targetWrapElement = target.querySelector('.facets-wrap');
    const sourceWrapElement = source.querySelector('.facets-wrap');

    if (sourceWrapElement && targetWrapElement) {
      const isShowingMore = Boolean(target.querySelector('show-more-button .label-show-more.hidden'));
      if (isShowingMore) {
        sourceWrapElement
          .querySelectorAll('.facets__item.hidden')
          .forEach((hiddenItem) => hiddenItem.classList.replace('hidden', 'show-more-item'));
      }

      targetWrapElement.outerHTML = sourceWrapElement.outerHTML;
    }
  }

  static renderMobileCounts(source, target) {
    const targetFacetsList = target.querySelector('.mobile-facets__list');
    const sourceFacetsList = source.querySelector('.mobile-facets__list');

    if (sourceFacetsList && targetFacetsList) {
      targetFacetsList.outerHTML = sourceFacetsList.outerHTML;
    }
  }

  static updateURLHash(searchParams) {
    history.pushState({ searchParams }, '', `${window.location.pathname}${searchParams && '?'.concat(searchParams)}`);
  }

  static getSections() {
    return [
      {
        section: document.getElementById('product-grid').dataset.id,
      },
    ];
  }

  createSearchParams(form) {
    const formData = new FormData(form);
    // Remove sort_by if empty
    if (!formData.get('sort_by')) {
      formData.delete('sort_by');
    }
    return new URLSearchParams(formData).toString();
  }

  onSubmitForm(searchParams, event) {
    FacetFiltersForm.renderPage(searchParams, event);
  }

  onSubmitHandler(event) {
    event.preventDefault();
    const sortFilterForms = document.querySelectorAll('facet-filters-form form');
    const targetForm = event && event.target && event.target.closest && event.target.closest('form') ? event.target.closest('form') : null;
    if (event && event.srcElement && event.srcElement.className == 'mobile-facets__checkbox' && targetForm) {
      const searchParams = this.createSearchParams(targetForm);
      this.onSubmitForm(searchParams, event);
    } else if (targetForm) {
      const forms = [];
      const isMobile = targetForm.id === 'FacetFiltersFormMobile';
      sortFilterForms.forEach((form) => {
        if (!isMobile) {
          if (form.id === 'FacetSortForm' || form.id === 'FacetFiltersForm' || form.id === 'FacetSortDrawerForm') {
            forms.push(this.createSearchParams(form));
          }
        } else if (form.id === 'FacetFiltersFormMobile') {
          forms.push(this.createSearchParams(form));
        }
      });
      // Remove duplicate keys and empty values
      const params = new URLSearchParams(forms.join('&'));
      // Remove empty values
      for (const [key, value] of params.entries()) {
        if (value === '') params.delete(key);
      }
      this.onSubmitForm(params.toString(), event);
    }
    // Always update the dropdown button state regardless if form submit is skipped
    // this.updateDropdownButtonText('taste');
    // this.updateDropdownButtonText('prep');
  }

  updateDropdownButtonText(type) {
    // Map facet type to param name
    let paramName = '';
    if (type === 'taste') {
      paramName = 'filter.p.m.custom.coffee_taste';
    } else if (type === 'prep') {
      paramName = 'filter.p.m.custom.coffee_prep_methods';
    }
    // Select checked checkboxes by param name in all facet forms
    const selectedCheckboxes = document.querySelectorAll(
      `input[type="checkbox"][name="${paramName}"]:checked, input[type="checkbox"][data-param-name="${paramName}"]:checked`
    );
    const button = document.querySelector(`.dropdown-menu-btn[data-type="${type}"]`);
    if (button) {
      if (selectedCheckboxes.length > 0) {
        button.textContent = 'בחר';
      } else {
        button.textContent = `הצג הכל`;
      }
    }
    const selectedIconsContainer = document.getElementById(`selected-icons-facets-${type}`);
    if (selectedIconsContainer) {
      selectedIconsContainer.innerHTML = '';
      selectedCheckboxes.forEach((checkbox, index) => {
        if (index >= 3) return;
        const label = checkbox.closest('label');
        if (type === 'taste') {
          const colorCircle = label ? label.querySelector('.color-circle') : null;
          if (colorCircle) {
            const clone = colorCircle.cloneNode(true);
            selectedIconsContainer.appendChild(clone);
          }
        } else if (type === 'prep') {
          const iconImg = label ? label.querySelector('.dropdown-icon-facets-img') : null;
          if (iconImg) {
            const clone = iconImg.cloneNode(true);
            selectedIconsContainer.appendChild(clone);
          }
        }
      });
    }
  }

  onActiveFilterClick(event) {
    event.preventDefault();
    FacetFiltersForm.toggleActiveFacets();
    const url =
      event.currentTarget.href.indexOf('?') == -1
        ? ''
        : event.currentTarget.href.slice(event.currentTarget.href.indexOf('?') + 1);
    FacetFiltersForm.renderPage(url);
  }
}

FacetFiltersForm.filterData = [];
FacetFiltersForm.searchParamsInitial = window.location.search.slice(1);
FacetFiltersForm.searchParamsPrev = window.location.search.slice(1);
customElements.define('facet-filters-form', FacetFiltersForm);
FacetFiltersForm.setListeners();

// Helper for instant update from taste/prep checkboxes
window.handleFacetFilterChange = function (type) {
  // Map type to param name
  const paramMap = {
    'taste': 'filter.p.m.custom.coffee_taste',
    'prep': 'filter.p.m.custom.coffee_prep_methods',
    'roast-level': 'filter.p.m.custom.coffee_roast_level',
    'roast-origin': 'filter.p.m.vendor_info.coffee_vendor',
    'coffee-process': 'filter.p.m.custom.coffee_process'
  };
  const paramName = paramMap[type];
  if (!paramName) return;

  // Collect checked, visible boxes in relevant dropdown
  const values = Array.from(
    document.querySelectorAll('#dropdownMenu-' + type + ' .dropdown-icons-input:checked')
  ).filter(cb => cb.offsetParent !== null)
    .map(cb => cb.value);
  const params = new URLSearchParams(window.location.search);
  // Remove all existing entries for this facet key, to prevent duplicates
  while (params.has(paramName)) {
    params.delete(paramName);
  }
  values.forEach(val => params.append(paramName, val));
  params.delete('page');

  // Call renderPage with updated params
  FacetFiltersForm.renderPage(params.toString(), null, true, params.toString());
}

FacetFiltersForm.reApplyCheckedFilters = function (paramsString) {
  const params = new URLSearchParams(paramsString || window.location.search);
  // First, uncheck all checkboxes
  document.querySelectorAll('.dropdown-icons-input').forEach(cb => cb.checked = false);
  // Map of dropdown types to param names
  const typeParamMap = {
    'taste': 'filter.p.m.custom.coffee_taste',
    'prep': 'filter.p.m.custom.coffee_prep_methods',
    'roast-level': 'filter.p.m.custom.coffee_roast_level',
    'roast-origin': 'filter.p.m.vendor_info.coffee_vendor',
    'coffee-process': 'filter.p.m.custom.coffee_process'
  };
  Object.entries(typeParamMap).forEach(([type, paramName]) => {
    const values = params.getAll(paramName);
    if (values.length) {
      values.forEach(function (value) {
        var checkbox = document.querySelector(`#dropdownMenu-${type} .dropdown-icons-input[value="${value}"]`);
        if (checkbox) checkbox.checked = true;
      });
    }
  });
};
// Call after filter render, ideally at end of FacetFiltersForm.renderFilters
(function (origRenderFilters) {
  FacetFiltersForm.renderFilters = function (html, event, paramsString) {
    origRenderFilters.call(this, html, event);
    setTimeout(() => FacetFiltersForm.reApplyCheckedFilters(paramsString), 0);
  };
})(FacetFiltersForm.renderFilters);

class PriceRange extends HTMLElement {
  constructor() {
    super();
    this.querySelectorAll('input').forEach((element) => {
      element.addEventListener('change', this.onRangeChange.bind(this));
      element.addEventListener('keydown', this.onKeyDown.bind(this));
    });
    this.setMinAndMaxValues();
  }

  onRangeChange(event) {
    this.adjustToValidValues(event.currentTarget);
    this.setMinAndMaxValues();
  }

  onKeyDown(event) {
    if (event.metaKey) return;

    const pattern = /[0-9]|\.|,|'| |Tab|Backspace|Enter|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Delete|Escape/;
    if (!event.key.match(pattern)) event.preventDefault();
  }

  setMinAndMaxValues() {
    const inputs = this.querySelectorAll('input');
    const minInput = inputs[0];
    const maxInput = inputs[1];
    if (maxInput.value) minInput.setAttribute('data-max', maxInput.value);
    if (minInput.value) maxInput.setAttribute('data-min', minInput.value);
    if (minInput.value === '') maxInput.setAttribute('data-min', 0);
    if (maxInput.value === '') minInput.setAttribute('data-max', maxInput.getAttribute('data-max'));
  }

  adjustToValidValues(input) {
    const value = Number(input.value);
    const min = Number(input.getAttribute('data-min'));
    const max = Number(input.getAttribute('data-max'));

    if (value < min) input.value = min;
    if (value > max) input.value = max;
  }
}

customElements.define('price-range', PriceRange);

class FacetRemove extends HTMLElement {
  constructor() {
    super();
    const facetLink = this.querySelector('a');
    facetLink.setAttribute('role', 'button');
    facetLink.addEventListener('click', this.closeFilter.bind(this));
    facetLink.addEventListener('keyup', (event) => {
      event.preventDefault();
      if (event.code.toUpperCase() === 'SPACE') this.closeFilter(event);
    });
  }

  closeFilter(event) {
    event.preventDefault();
    const form = this.closest('facet-filters-form') || document.querySelector('facet-filters-form');
    form.onActiveFilterClick(event);
  }
}

customElements.define('facet-remove', FacetRemove);

class SortDropdown extends HTMLElement {
  constructor() {
    super();
    this.init();
  }

  init() {
    const button = this.querySelector('.sort-dropdown-button');
    const menu = this.querySelector('.sort-dropdown-menu');
    const options = this.querySelectorAll('.sort-option-value');
    const hiddenInput = this.querySelector('#SortBy');

    if (!button || !menu || !hiddenInput) return;

    // Toggle dropdown on button click
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    // Handle option selection
    options.forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectOption(option);
      });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.contains(e.target)) {
        this.closeDropdown();
      }
    });

    // Close dropdown on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeDropdown();
      }
    });
  }

  toggleDropdown() {
    const button = this.querySelector('.sort-dropdown-button');
    const menu = this.querySelector('.sort-dropdown-menu');

    const isOpen = button.getAttribute('aria-expanded') === 'true';

    // console.log('Toggle dropdown - isOpen:', isOpen, 'menu:', menu);
    analytics.trackClick('Sort Dropdown', {
      'Source': 'Catalogue',
      'Dropdown Action': isOpen ? 'Close' : 'Open'
    });

    if (isOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  openDropdown() {
    const button = this.querySelector('.sort-dropdown-button');
    const menu = this.querySelector('.sort-dropdown-menu');


    // Calculate position for fixed positioning
    const buttonRect = button.getBoundingClientRect();
    // menu.style.top = (buttonRect.bottom + window.scrollY) + 'px';
    // menu.style.right = '12px';
    // menu.style.width = buttonRect.width + 'px';

    button.setAttribute('aria-expanded', 'true');
    menu.classList.add('show');
  }

  closeDropdown() {
    const button = this.querySelector('.sort-dropdown-button');
    const menu = this.querySelector('.sort-dropdown-menu');

    button.setAttribute('aria-expanded', 'false');
    menu.classList.remove('show');
  }

  selectOption(option) {
    const value = option.getAttribute('data-value');
    const hiddenInput = this.querySelector('#SortBy');
    const options = this.querySelectorAll('.sort-option-value');

    // Update hidden input value
    hiddenInput.value = value;

    analytics.trackClick('Sort Option', {
      'Source': 'Catalogue',
      'Sort Option': value
    });

    // Update visual selection
    options.forEach(opt => opt.classList.remove('selected'));
    option.classList.add('selected');

    // Close dropdown
    this.closeDropdown();

    // Trigger form submission to update results
    this.submitForm();
  }


  submitForm() {
    const facetForm = this.closest('facet-filters-form') || document.querySelector('facet-filters-form');
    if (facetForm) {
      // Create a synthetic event to trigger the form submission
      const event = new Event('input', { bubbles: true });
      const hiddenInput = this.querySelector('#SortBy');
      hiddenInput.dispatchEvent(event);
    }
  }
}

customElements.define('sort-dropdown', SortDropdown);
