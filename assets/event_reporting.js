/**
 * Mixpanel Analytics Reporter
 * Centralized class for handling all Mixpanel event reporting
 * 
 * Usage:
 * const analytics = new MixpanelReporter();
 * analytics.trackClick('button_name', { additional: 'data' });
 * analytics.trackScreenView('home_page', { user_type: 'premium' });
 */

class MixpanelReporter {
  constructor() {
    this.isInitialized = false;
    this.checkMixpanelAvailability();
  }

  /**
   * Check if Mixpanel is available and initialized
   */
  checkMixpanelAvailability() {
    if (typeof mixpanel !== 'undefined' && mixpanel.track) {
      this.isInitialized = true;
    } else {
      console.warn('Mixpanel is not initialized. Make sure to initialize Mixpanel before using MixpanelReporter.');
    }
  }

  /**
   * Generic method to track any event
   * @param {string} eventName - Name of the event
   * @param {Object} properties - Additional properties to send with the event
   */
  track(eventName, properties = {}) {
    if (!this.isInitialized) {
      console.warn('Cannot track event: Mixpanel not initialized');
      return;
    }

    try {
      // Add timestamp and common properties
      const eventData = {
        timestamp: new Date().toISOString(),
        url: window.location.href,
        'User Agent': navigator.userAgent,
        ...properties
      };

      mixpanel.track(eventName, eventData);
      // console.log(`Tracked event: ${eventName}`, eventData);
    } catch (error) {
      console.error('Error tracking event:', error);
    }
  }

  /**
   * Track click events
   * @param {string} elementName - Name/identifier of the clicked element
   * @param {Object} additionalProperties - Additional properties specific to the click
   */
  trackClick(elementName, additionalProperties = {}) {
    const properties = {
      'Button Name': elementName,
      'Event Type': 'click',
      ...additionalProperties
    };

    this.track('Button Click', properties);
  }

  /**
   * Track screen/page view events
   * @param {string} screenName - Name of the screen/page being viewed
   * @param {Object} additionalProperties - Additional properties specific to the screen view
   */
  trackScreenView(screenName, additionalProperties = {}) {
    const properties = {
      'Screen Name': screenName,
      'Event Type': 'screen_view',
      'Referrer': document.referrer,
      ...additionalProperties
    };

    this.track('Screen View', properties);
  }

  /**
   * Automatically track clicks on elements with data-track-click attribute
   * Call this method to enable automatic click tracking
   */
  enableAutoClickTracking() {
    document.addEventListener('click', (event) => {
      const element = event.target;
      const trackData = element.getAttribute('data-track-click');
      
      if (trackData) {
        // Parse additional data if provided as JSON
        let additionalData = {};
        const extraData = element.getAttribute('data-track-data');
        if (extraData) {
          try {
            additionalData = JSON.parse(extraData);
          } catch (e) {
            console.warn('Invalid JSON in data-track-data attribute');
          }
        }

        this.trackClick(trackData, {
          element_type: element.tagName.toLowerCase(),
          element_id: element.id || null,
          element_class: element.className || null,
          ...additionalData
        });
      }
    });

    console.log('Auto click tracking enabled');
  }

  /**
   * Track page view automatically when called
   * Useful for single-page applications
   */
  trackCurrentPageView(additionalProperties = {}) {
    const pageName = document.title || window.location.pathname;
    this.trackScreenView(pageName, additionalProperties);
  }

  /**
   * Set user properties (identify user)
   * @param {string} userId - Unique user identifier
   * @param {Object} userProperties - Properties to associate with the user
   */
  identifyUser(userId, userProperties = {}) {
    if (!this.isInitialized) {
      console.warn('Cannot identify user: Mixpanel not initialized');
      return;
    }

    try {
      mixpanel.identify(userId);
      mixpanel.people.set(userProperties);
      // console.log(`User identified: ${userId}`, userProperties);
    } catch (error) {
      console.error('Error identifying user:', error);
    }
  }

  /**
   * Reset user session (useful for logout)
   */
  reset() {
    if (!this.isInitialized) {
      console.warn('Cannot reset: Mixpanel not initialized');
      return;
    }

    try {
      mixpanel.reset();
      console.log('Mixpanel session reset');
    } catch (error) {
      console.error('Error resetting session:', error);
    }
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MixpanelReporter;
} else if (typeof define === 'function' && define.amd) {
  define([], function() {
    return MixpanelReporter;
  });
} else {
  window.MixpanelReporter = MixpanelReporter;
}