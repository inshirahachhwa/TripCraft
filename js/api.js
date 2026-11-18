/* api.js – all external API calls (no API keys required) */
const API = (() => {
  const getJSON = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  };

  // 1. Geocoding – Open-Meteo
  async function searchPlaces(q) {
    const d = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
    return (d.results || []).map(p => ({
      name: p.name, country: p.country, countryCode: p.country_code,
      admin: p.admin1 || "", lat: p.latitude, lon: p.longitude, tz: p.timezone
    }));
  }

  // 2. Weather – Open-Meteo forecast (16 days) with archive fallback for far dates
  async function weather(lat, lon, start, end) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&start_date=${start}&end_date=${end}`;
    try {
      const d = await getJSON(url);
      const out = {};
      d.daily.time.forEach((t, i) => out[t] = {
        code: d.daily.weathercode[i], max: d.daily.temperature_2m_max[i],
        min: d.daily.temperature_2m_min[i], rain: d.daily.precipitation_probability_max[i]
      });
      return out;
    } catch { return {}; } // dates beyond forecast window
  }

  // 3. Wikipedia summary + image
  async function wikiSummary(title) {
    try {
      const d = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
      return { extract: d.extract, image: d.thumbnail?.source || d.originalimage?.source || null, url: d.content_urls?.desktop?.page };
    } catch { return null; }
  }

  // 4. Attractions near a point – Wikipedia GeoSearch
  async function attractions(lat, lon) {
    try {
      const d = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lon}&gsradius=10000&gslimit=30&format=json&origin=*`);
      return (d.query?.geosearch || []).map(p => ({ title: p.title, dist: p.dist, lat: p.lat, lon: p.lon }));
    } catch { return []; }
  }

  // 5. Country info – REST Countries
  async function country(code) {
    try {
      const d = await getJSON(`https://restcountries.com/v3.1/alpha/${code}?fields=name,capital,languages,currencies,flags,region,timezones`);
      return d;
    } catch { return null; }
  }

  // 6. Exchange rates – Frankfurter
  async function rate(from, to) {
    if (from === to) return 1;
    try {
      const d = await getJSON(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`);
      return d.rates?.[to] ?? null;
    } catch { return null; }
  }

  return { searchPlaces, weather, wikiSummary, attractions, country, rate };
})();

// WMO weather code -> label/icon
const WMO = (code) => {
  if (code === 0) return ["Clear", "bi-brightness-high"];
  if (code <= 3) return ["Partly cloudy", "bi-cloud-sun"];
  if (code <= 48) return ["Fog", "bi-cloud-fog"];
  if (code <= 57) return ["Drizzle", "bi-cloud-drizzle"];
  if (code <= 67) return ["Rain", "bi-cloud-rain"];
  if (code <= 77) return ["Snow", "bi-snow"];
  if (code <= 82) return ["Showers", "bi-cloud-rain-heavy"];
  if (code <= 86) return ["Snow showers", "bi-cloud-snow"];
  return ["Thunderstorm", "bi-cloud-lightning-rain"];
};
