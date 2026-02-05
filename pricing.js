/***********************************************************
 * pricing.js
 * ---------------------------------------------------------
 * Handles all pricing logic and estimate calculations.
 * Does NOT handle maps, addresses, or GIS lookups directly.
 ***********************************************************/

// Global application state (shared across files)
window.appState = window.appState || {
  location: {
    lat: null,
    lon: null,
    parcelSqFt: null,
    buildingSqFt: null
  },
  service: null,
  estimate: null
};

/**
 * Pricing rules by service type
 * source:
 *  - parcel   → lot size based
 *  - building → building footprint based
 */
const PRICING_RULES = {
  exterior: {
    label: "Exterior Surface Cleaning",
    source: "parcel",
    rate: 0.12,   // $ per sq ft
    minimum: 129
  },
  driveway: {
    label: "Driveway Cleaning",
    source: "parcel",
    rate: 0.18,
    minimum: 99
  },
  siding: {
    label: "House Siding Wash",
    source: "building",
    rate: 0.20,
    minimum: 149
  },
  sidewalk: {
    label: "Sidewalk Cleaning",
    source: "parcel",
    rate: 0.04,   // placeholder (frontage logic later)
    minimum: 79
  }
};

/**
 * Temporary fallback sizes
 * Used ONLY until real GIS data is available
 */
const FALLBACK_SIZES = {
  parcelSqFt: 6500,
  buildingSqFt: 1800
};

/**
 * Main estimate calculation
 */
function calculateEstimate(serviceKey) {
  const rule = PRICING_RULES[serviceKey];
  if (!rule) return null;

  let area = null;

  if (rule.source === "parcel") {
    area =
      window.appState.location.parcelSqFt ??
      FALLBACK_SIZES.parcelSqFt;
  }

  if (rule.source === "building") {
    area =
      window.appState.location.buildingSqFt ??
      FALLBACK_SIZES.buildingSqFt;
  }

  if (!area || area <= 0) return null;

  let total = area * rule.rate;

  if (total < rule.minimum) {
    total = rule.minimum;
  }

  return Math.round(total);
}

/**
 * Update estimate display + CTA state
 */
function updateEstimateUI() {
  const priceEl = document.getElementById("estimatePrice");
  const buttonEl = document.getElementById("continueBtn");

  const service = window.appState.service;

  if (!service) {
    priceEl.textContent = "$—";
    buttonEl.disabled = true;
    return;
  }

  const estimate = calculateEstimate(service);

  if (!estimate) {
    priceEl.textContent = "$—";
    buttonEl.disabled = true;
    return;
  }

  window.appState.estimate = estimate;

  priceEl.textContent = `$${estimate.toLocaleString()}.00`;
  buttonEl.disabled = false;
}

/**
 * Event listeners (UI only)
 */
document.addEventListener("DOMContentLoaded", () => {
  const serviceSelect = document.getElementById("serviceType");
const continueBtn = document.getElementById("continueBtn");

continueBtn.addEventListener("click", () => {
  goToScheduling();
});

  serviceSelect.addEventListener("change", (e) => {
    window.appState.service = e.target.value;
    updateEstimateUI();
  });
});
/**
 * Redirect to scheduling with estimate + GIS metadata
 */
function goToScheduling() {
  const state = window.appState;

  if (!state.estimate || !state.service) return;

  const params = new URLSearchParams({
    service: state.service,
    estimate: state.estimate,
    address: document.getElementById("address").value,
    lat: state.location.lat,
    lon: state.location.lon,
    parcelSqFt: state.location.parcelSqFt,
    buildingSqFt: state.location.buildingSqFt,
    timestamp: new Date().toISOString()
  });

  window.location.href = `schedule.html?${params.toString()}`;
}

