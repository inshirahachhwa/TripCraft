# TripCraft – Smart Travel Itinerary Planner

A micro-project built with **HTML, CSS, JavaScript, Bootstrap 5 and public APIs** only. No backend, no build step, no API keys.

## Run it
Just open `index.html` in a browser (Chrome/Edge/Firefox). An internet connection is needed for the Bootstrap CDN and the APIs.
Optional: serve locally with `python -m http.server 8000` and open http://localhost:8000.

## Features
- Destination autocomplete (Open-Meteo Geocoding API)
- Day-by-day itinerary auto-generated from nearby attractions (Wikipedia GeoSearch API) and your interests
- Daily weather forecast (Open-Meteo Forecast API)
- Destination summary + photo (Wikipedia REST API)
- Country quick facts + flag (REST Countries API)
- Live currency conversion hint (Frankfurter API)
- Map preview (OpenStreetMap embed)
- Add / edit / delete / reorder activities
- Budget tracker with expenses, breakdown and progress bar
- Smart packing checklist based on weather, trip length and interests
- Multiple saved trips in `localStorage`; print / save as PDF; copy itinerary as text

## Project structure
```
tripcraft/
├── index.html
├── css/style.css
├── js/
│   ├── storage.js   (localStorage wrapper)
│   ├── api.js       (all API calls)
│   └── app.js       (UI + logic)
└── README.md
```

## APIs used (all free, key-less)
| API | Purpose |
|---|---|
| geocoding-api.open-meteo.com | Place search |
| api.open-meteo.com | Weather forecast |
| en.wikipedia.org (REST + Action API) | Summary, image, attractions |
| restcountries.com | Country data |
| api.frankfurter.dev | Exchange rates |
| openstreetmap.org | Embedded map |

## Notes / limitations
- Weather forecasts only cover ~16 days ahead; later dates show "Forecast not yet available".
- Activity cost estimates are rough defaults in your chosen currency; edit them freely.

## Ideas for extension
Drag-and-drop ordering, dark mode, shareable links, hotel/flight API integration, Leaflet map with all stops.
