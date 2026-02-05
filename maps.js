/***********************************************************
 * maps.js
 * ---------------------------------------------------------
 * Azure Maps initialization + address → coordinates
 * Updates window.appState.location.lat / lon
 ***********************************************************/

// EXPECTED GLOBALS:
// - Azure Maps SDK loaded in HTML
// - AZURE_MAPS_KEY defined in HTML BEFORE this file
// - window.appState created (or will be created here)

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

let map;
let marker;

/**
 * Initialize Azure Map
 */
function initMap() {
  map = new atlas.Map("map", {
    center: [-95.3698, 29.7604], // Houston default
    zoom: 13,
    authOptions: {
      authType: "subscriptionKey",
      subscriptionKey: AZURE_MAPS_KEY
    }
  });

  map.events.add("ready", () => {
    marker = new atlas.HtmlMarker({
      position: [-95.3698, 29.7604]
    });
    map.markers.add(marker);
  });
}

/**
 * Geocode an address using Azure Maps REST API
 */
async function geocodeAddress(address) {
  const url =
    "https://atlas.microsoft.com/search/address/json" +
    "?api-version=1.0" +
    "&countrySet=US" +
    "&limit=1" +
    "&subscription-key=" + encodeURIComponent(AZURE_MAPS_KEY) +
    "&query=" + encodeURIComponent(address);

  const response = await fetch(url);
  if (!response.ok) return null;

  const data = await response.json();
  if (!data.results || !data.results.length) return null;

  return data.results[0].position;
}

/**
 * Move map + marker and store coordinates
 */
function updateLocation(lat, lon) {
  window.appState.location.lat = lat;
  window.appState.location.lon = lon;

  if (map && marker) {
    map.setCamera({
      center: [lon, lat],
      zoom: 18
    });

    marker.setOptions({
      position: [lon, lat]
    });
  }

  // Let pricing know something changed
  if (typeof updateEstimateUI === "function") {
    updateEstimateUI();
  }
  if (typeof runGISAnalysis === "function") {
  runGISAnalysis();
}
}

/**
 * Wire address input
 */
document.addEventListener("DOMContentLoaded", () => {
  initMap();

  const addressInput = document.getElementById("address");

  addressInput.addEventListener("blur", async () => {
    const address = addressInput.value;
    if (!address || address.length < 6) return;

    const position = await geocodeAddress(address);
    if (!position) return;

    updateLocation(position.lat, position.lon);
  });
});
