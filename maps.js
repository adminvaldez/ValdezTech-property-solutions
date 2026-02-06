/***********************************************************
 * maps.js
 * ---------------------------------------------------------
 * Azure Maps initialization + address → coordinates
 ***********************************************************/

// Global app state
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
let mapReady = false;

/**
 * Initialize Azure Map
 */
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
    center: [-95.3698, 29.7604], // Houston
    zoom: 13,
    authOptions: {
      authType: "subscriptionKey",
      subscriptionKey: AZURE_MAPS_KEY
    }
  });

  map.events.add("ready", () => {
    mapReady = true;

    marker = new atlas.HtmlMarker({
      position: [-95.3698, 29.7604]
    });

    map.markers.add(marker);
  });
}

/**
 * Geocode address → coordinates
 */
async function geocodeAddress(address) {
  try {
    const url =
      "https://atlas.microsoft.com/search/address/json" +
      "?api-version=1.0" +
      "&countrySet=US" +
      "&limit=1" +
      "&subscription-key=" + encodeURIComponent(AZURE_MAPS_KEY) +
      "&query=" + encodeURIComponent(address);

    const res = await fetch(url);
    if (!res.ok) throw new Error("Bad response");

    const data = await res.json();
    if (!data.results?.length) return null;

    return data.results[0].position;
  } catch (err) {
    console.error("❌ Geocoding failed", err);
    return null;
  }
}

/**
 * Update location + downstream logic
 */
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

  if (typeof runGISAnalysis === "function") {
    runGISAnalysis();
  }

  if (typeof updateEstimateUI === "function") {
    updateEstimateUI();
  }
}

/**
 * Wire events
 */
document.addEventListener("DOMContentLoaded", () => {
  initMap();

  const addressInput = document.getElementById("address");
  if (!addressInput) return;

  // Trigger on Enter OR field change
  addressInput.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;

    const address = addressInput.value.trim();
    if (address.length < 6) return;

    const pos = await geocodeAddress(address);
    if (!pos) return;

    updateLocation(pos.lat, pos.lon);
  });

  addressInput.addEventListener("change", async () => {
    const address = addressInput.value.trim();
    if (address.length < 6) return;

    const pos = await geocodeAddress(address);
    if (!pos) return;

    updateLocation(pos.lat, pos.lon);
  });
});
