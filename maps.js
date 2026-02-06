/***********************************************************
 * maps.js
 * Azure Maps integration (non-module, global helpers)
 * Completes routing & distance calculation and ties into GIS/pricing.
 ***********************************************************/

window.appState = window.appState || {
  location: {
    lat: null,
    lon: null,
    parcelSqFt: null,
    buildingSqFt: null,
    distanceMiles: null,
    travelMinutes: null
  },
  service: null,
  estimate: null
};

let map;
let marker;
let mapReady = false;
let geocodeDebounceTimer = null;

const DEFAULT_LOCATION = { lat: 29.8150, lon: -95.5150 };
const OFFICE_COORDS = { lat: DEFAULT_LOCATION.lat, lon: DEFAULT_LOCATION.lon };

function getKey() {
  // Accept either window.AZURE_MAPS_KEY or a top-level AZURE_MAPS_KEY const
  // (your HTML currently sets a const; this supports both patterns)
  if (typeof window !== "undefined" && window.AZURE_MAPS_KEY) return window.AZURE_MAPS_KEY;
  if (typeof AZURE_MAPS_KEY !== "undefined") return AZURE_MAPS_KEY;
  return null;
}

function debounce(fn, wait = 350) {
  return function (...args) {
    clearTimeout(geocodeDebounceTimer);
    geocodeDebounceTimer = setTimeout(() => fn.apply(this, args), wait);
  };
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Initialize Azure Map
function initMap() {
  if (typeof atlas === "undefined") {
    console.error("Azure Maps SDK not loaded");
    return;
  }

  const key = getKey();
  if (!key) {
    console.error("AZURE_MAPS_KEY missing");
    return;
  }

  const mapContainer = document.getElementById("map");
  if (!mapContainer) {
    console.error("#map container not found");
    return;
  }

  map = new atlas.Map(mapContainer, {
    center: [DEFAULT_LOCATION.lon, DEFAULT_LOCATION.lat],
    zoom: 14,
    authOptions: {
      authType: "subscriptionKey",
      subscriptionKey: key
    }
  });

  map.events.add("ready", () => {
    mapReady = true;
    window.appState.location.lat = DEFAULT_LOCATION.lat;
    window.appState.location.lon = DEFAULT_LOCATION.lon;

    marker = new atlas.HtmlMarker({
      position: [DEFAULT_LOCATION.lon, DEFAULT_LOCATION.lat]
    });
    map.markers.add(marker);

    triggerDownstreamLogic();
  });

  map.events.add("click", (e) => {
    if (!e.position) return;
    const [lon, lat] = e.position;
    updateLocation(lat, lon);
    reverseGeocodeAndFill(lat, lon).catch(() => {});
  });
}

// Geocode address using Azure Maps Search
async function geocodeAddress(address) {
  if (!address) return null;
  const key = getKey();
  if (!key) return null;

  const url =
    "https://atlas.microsoft.com/search/address/json" +
    "?api-version=1.0" +
    "&countrySet=US" +
    "&limit=1" +
    "&subscription-key=" + encodeURIComponent(key) +
    "&query=" + encodeURIComponent(address);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Geocode response not OK");
    const data = await res.json();
    if (!data.results?.length) return null;
    return data.results[0].position; // { lat, lon }
  } catch (err) {
    console.error("Geocoding failed", err);
    return null;
  }
}

// Reverse geocode to fill address input (best-effort)
async function reverseGeocodeAndFill(lat, lon) {
  const key = getKey();
  if (!key) return;
  const url =
    "https://atlas.microsoft.com/search/address/reverse/json" +
    "?api-version=1.0" +
    "&language=en-US" +
    "&subscription-key=" + encodeURIComponent(key) +
    "&query=" + encodeURIComponent(lat + "," + lon);

  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const addr = data?.addresses?.[0]?.address?.freeformAddress;
    if (addr) {
      const input = document.getElementById("address");
      if (input) input.value = addr;
    }
  } catch (err) {
    // silent
  }
}

// Update app location and UI marker
function updateLocation(lat, lon) {
  window.appState.location.lat = lat;
  window.appState.location.lon = lon;

  if (mapReady && map && marker) {
    map.setCamera({ center: [lon, lat], zoom: 18 });
    marker.setOptions({ position: [lon, lat] });
  }

  triggerDownstreamLogic();
}

// Trigger GIS analysis, routing and estimate update
function triggerDownstreamLogic() {
  if (typeof runGISAnalysis === "function") {
    // runGISAnalysis will update window.appState.location.* values and call updateEstimateUI
    runGISAnalysis().catch((err) => {
      console.warn("runGISAnalysis error", err);
    });
  }

  // Always compute travel info (driving distance/time preferred)
  computeTravelInfo().then(() => {
    if (typeof updateEstimateUI === "function") updateEstimateUI();
  });
}

// Compute driving distance/time using Azure Routes, fallback to haversine
async function computeTravelInfo() {
  const key = getKey();
  const lat = window.appState.location.lat;
  const lon = window.appState.location.lon;
  if (!lat || !lon) return;

  // default fallback values
  let distanceMiles = haversineMiles(OFFICE_COORDS.lat, OFFICE_COORDS.lon, lat, lon);
  let travelMinutes = Math.round((distanceMiles / 30) * 60); // assume 30 mph average

  if (!key) {
    window.appState.location.distanceMiles = distanceMiles;
    window.appState.location.travelMinutes = travelMinutes;
    return;
  }

  // Azure Routes Directions: try to get driving distance/time
  // Query format: query=LAT1,LON1:LAT2,LON2 (lat,lon pairs) - best-effort
  const origin = `${OFFICE_COORDS.lat},${OFFICE_COORDS.lon}`;
  const dest = `${lat},${lon}`;
  const url =
    "https://atlas.microsoft.com/route/directions/json" +
    "?subscription-key=" + encodeURIComponent(key) +
    "&api-version=1.0" +
    "&query=" + encodeURIComponent(origin + ":" + dest) +
    "&routeType=fastest";

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Routing failed " + res.status);
    const data = await res.json();
    // Azure returns routes[0].summary.travelTimeInSeconds and summary.lengthInMeters
    const route = data?.routes?.[0];
    if (route && route.summary) {
      const meters = route.summary.lengthInMeters;
      const seconds = route.summary.travelTimeInSeconds;
      distanceMiles = meters / 1609.344;
      travelMinutes = Math.round(seconds / 60);
      window.appState.location.distanceMiles = Number(distanceMiles.toFixed(2));
      window.appState.location.travelMinutes = travelMinutes;
      return;
    }
  } catch (err) {
    // Fall through to haversine fallback
    console.warn("Azure routing failed, falling back to straight-line:", err);
  }

  // fallback
  window.appState.location.distanceMiles = Number(distanceMiles.toFixed(2));
  window.appState.location.travelMinutes = travelMinutes;
}

// Wire UI events
document.addEventListener("DOMContentLoaded", () => {
  initMap();

  const addressInput = document.getElementById("address");
  if (!addressInput) return;

  const debouncedGeocode = debounce(async () => {
    const address = addressInput.value.trim();
    if (address.length < 6) return;
    const pos = await geocodeAddress(address);
    if (!pos) return;
    updateLocation(pos.lat, pos.lon);
  }, 400);

  addressInput.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    await debouncedGeocode();
  });

  addressInput.addEventListener("change", debouncedGeocode);
});

// Expose for debugging
window.initMap = initMap;
