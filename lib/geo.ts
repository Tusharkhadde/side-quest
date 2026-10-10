import type { LatLon } from "./types";

const R = 6371000;

/** Great-circle distance in meters. */
export function haversineMeters(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Walking minutes. Straight-line distance is multiplied by a detour factor
 * (streets are not straight) and divided by a relaxed 4.5 km/h pace.
 */
export function walkingMinutes(meters: number, detour = 1.3, kmh = 4.5): number {
  return Math.max(1, Math.round(((meters * detour) / 1000 / kmh) * 60));
}

/**
 * Round coordinates before they leave the device for a third-party lookup.
 * Two decimals is roughly 1 km: enough for weather and a park search,
 * not enough to identify a home.
 */
export function coarsen(p: LatLon, decimals = 2): LatLon {
  const f = 10 ** decimals;
  return { lat: Math.round(p.lat * f) / f, lon: Math.round(p.lon * f) / f };
}

export function mapLink(p: LatLon): string {
  return `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=17/${p.lat}/${p.lon}`;
}

export function directionsLink(from: LatLon, to: LatLon): string {
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${from.lat}%2C${from.lon}%3B${to.lat}%2C${to.lon}`;
}
