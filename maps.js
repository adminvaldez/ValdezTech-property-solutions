/***********************************************************
 * maps.js
 * ---------------------------------------------------------
 * Azure Maps
 * Default: Spring Branch, Houston TX
 * Address → coordinates
 ***********************************************************/

// ------------------
// Global App State
// ------------------
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

// ------------------
// Map Globals
// ------------------
let map;
let marker;
let mapReady = false;

// Spring Branch, Houston TX (default home location)
const DEFAULT_LOCATION = {
  lat: 29.8150,
  lon: -95.5150
};

// ------------------
// Initialize Map
// ------------------
function initMap() {
  if (typeof atlas === "undefined") {
    console.error("❌ Azure Maps SDK not loaded");
    return;
  }

  if (!window.AZURE_MAPS_KEY) {
    console.error("❌ AZURE_MAPS_KEY missing");
    return;
  }

  const mapContainer = document.getElementById("map");
  if (!mapContainer) {
    console.error("❌ #map container not found");
    return;
  }

  map = new atlas.Map(mapContainer, {
    center: [DEFAULT_LOCATION.lon, DEFAULT_LOCATION.lat],
    zoom: 14,
    authOptions: {
      authType: "subscriptionKey",
      subscriptionKey: AZURE_MAPS_KEY
    }
  });

  map.events.add("ready", () => {
    mapReady = true;

    // Set default app state
    window.appState.location.lat = DEFAULT_LOCATION.lat;
    window.appState.location.lon = DEFAULT_LOCATION.lon;

    // Default marker
    marker = new atlas.HtmlMarker({
      position: [DEFAULT_LOCATION.lon, DEFAULT_LOCATION.lat]
    });

    map.markers.add(marker);

    // Auto-run analysis on load
    triggerDownstreamLogic();
  });
}

// ------------------
// Geocode Address
// ------------------
async function geocodeAddress(address) {
  try {
    const url =
      "https://atlas.microsoft.com/search/address/json" +
      "?api-version=1.0" +
      "&countrySet=US" +
      "&limit=1" +
      "&subscription-key=" + encodeURIComponent(AZURE_MAPS_KEY) +
      "&query=" + encodeURIComponent(address);

    const response = await fetch(url);
    if (!response.ok) throw new Error("Bad response");

    const data = await response.json();
    if (!data.results?.length) return null;

    return data.results[0].position;
  } catch (err) {
    console.error("❌ Geocoding failed", err);
    return null;
  }
}

// ------------------
// Update Location
// ------------------
function updateLocation(lat, lon) {
  window.appState.location.lat = lat;
  window.appState.location.lon = lon;

  if (mapReady && map && marker) {
    map.setCamera({
      center: [lon, lat],
      zoom: 18
    });

    marker.setOptions({
      position: [lon, lat]
    });
  }

  triggerDownstreamLogic();
}

// ------------------
// Downstream Logic
// ------------------
function triggerDownstreamLogic() {
  if (typeof runGISAnalysis === "function") {
    runGISAnalysis();
  }

  if (typeof updateEstimateUI === "function") {
    updateEstimateUI();
  }
}

// ------------------
// Wire UI Events
// ------------------
document.addEventListener("DOMContentLoaded", () => {
  initMap();

  const addressInput = document.getElementById("address");
  if (!addressInput) return;

  // Enter key
  addressInput.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;

    const address = addressInput.value.trim();
    if (address.length < 6) return;

    const pos = await geocodeAddress(address);
    if (!pos) return;

    updateLocation(pos.lat, pos.lon);
  });

  // Change event (click away / autocomplete)
  addressInput.addEventListener("change", async () => {
    const address = addressInput.value.trim();
    if (address.length < 6) return;

    const pos = await geocodeAddress(address);
    if (!pos) return;

    updateLocation(pos.lat, pos.lon);
  });
});
