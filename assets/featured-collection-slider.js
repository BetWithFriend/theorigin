// Use a WeakMap to store scroll positions per slider instance to avoid global state issues.
// This is crucial if you have multiple sliders on the same page, each needing its own scroll state.
const sliderScrollPositions = new WeakMap();

/**
 * The desired scroll increment for each slide movement.
 * Based on the user's requirement, each slide should be 200px.
 */
const slideWidth = 200; // Each slide moves 200px

/**
 * recoSlide function to handle the sliding mechanism of the product grid.
 * It moves the slider horizontally by a fixed amount (slideWidth) based on the direction.
 *
 * @param {HTMLElement} clickedElement - The arrow element that was clicked (this).
 * @param {string} direction - The direction to slide: 'left' or 'right'.
 * 'right' moves the slider to reveal more items from the left (scrolls right).
 * 'left' moves the slider to reveal more items from the right (scrolls left).
 */
function recoSlide(clickedElement, direction) {
    // Find the closest parent 'slider-component' to the clicked arrow.
    const sliderComponent = clickedElement.closest('slider-component');
    if (!sliderComponent) {
        console.error('Could not find parent "slider-component" for the clicked arrow.');
        return;
    }

    // Get the actual product grid (ul) within this specific slider component.
    const slider = sliderComponent.querySelector('.product-grid');

    // If the slider element is not found, log an error and exit.
    if (!slider) {
        console.error('Product grid element not found within the slider component.');
        return;
    }

    // Get the current scroll position for this specific slider instance from the WeakMap,
    // or initialize it to 0 if it's the first time.
    let currentScrollPosition = sliderScrollPositions.get(slider) || 0;

    // Calculate the maximum scrollable width.
    // This is the total width of all content minus the visible width of the container.
    const maxScrollLeft = slider.scrollWidth - slider.clientWidth;

    // Determine the new scroll position based on the direction.
    if (direction === 'right') {
        // Move right: increase the scroll position to show more content from the left.
        // Ensure we don't scroll past the end.
        currentScrollPosition = Math.min(currentScrollPosition + slideWidth, maxScrollLeft);
    } else if (direction === 'left') {
        // Move left: decrease the scroll position to show more content from the right.
        // Ensure we don't scroll past the beginning (0).
        currentScrollPosition = Math.max(currentScrollPosition - slideWidth, 0);
    } else {
        // Handle invalid direction input.
        console.warn('Invalid direction provided to recoSlide. Use "left" or "right".');
        return;
    }

    // Apply the new scroll position to the slider.
    // The 'smooth' scroll-behavior CSS property handles the animation.
    slider.scrollLeft = currentScrollPosition;

    // Update the scroll position in the WeakMap for this slider instance.
    sliderScrollPositions.set(slider, currentScrollPosition);

    // Optional: Log the current scroll position for debugging.
    // console.log(`Sliding ${direction}. New scroll position: ${currentScrollPosition}px for slider ID: ${slider.id}`);
}

// Add a safety check and initial adjustment on window load.
window.onload = function () {
    // This loop ensures that if there are multiple slider components on the page,
    // each one gets its initial scroll position set correctly.
    document.querySelectorAll('.product-grid').forEach(slider => {
        let currentScrollPosition = sliderScrollPositions.get(slider) || 0;
        const maxScrollLeft = slider.scrollWidth - slider.clientWidth;
        currentScrollPosition = Math.max(0, Math.min(currentScrollPosition, maxScrollLeft));
        slider.scrollLeft = currentScrollPosition;
        sliderScrollPositions.set(slider, currentScrollPosition);
    });
};

// This is important for responsiveness: recalculate maxScrollLeft on window resize
// and adjust currentScrollPosition if it goes out of bounds for all sliders.
window.addEventListener('resize', () => {
    document.querySelectorAll('.product-grid').forEach(slider => {
        let currentScrollPosition = sliderScrollPositions.get(slider) || 0;
        const maxScrollLeft = slider.scrollWidth - slider.clientWidth;
        currentScrollPosition = Math.max(0, Math.min(currentScrollPosition, maxScrollLeft));
        slider.scrollLeft = currentScrollPosition;
        sliderScrollPositions.set(slider, currentScrollPosition);
    });
});