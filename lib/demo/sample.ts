import type { LatLon, Place, WeatherNow } from "../types";
import { parseOverpass, type OverpassElement } from "../context/places";
import snapshot from "./pune-osm.json";

/**
 * "Try a demo quest": a sample point in central Pune with a bundled snapshot of
 * real OpenStreetMap parks and a sample afternoon forecast, so anyone can click
 * through the whole flow without granting location. The model call is still real.
 */
export const DEMO_CITY = "Pune";
/** The gate of Sarasbaug, a public garden next to the Peshwe Udyan lake. Not anyone's home. */
export const DEMO_ORIGIN: LatLon = { lat: 18.5012, lon: 73.853 };
export const DEMO_LOCAL_TIME = "16:30";
export const DEMO_SCREEN_MINUTES = 110;
export const DEMO_ATTRIBUTION = snapshot.attribution;

export function demoWeather(now = new Date()): WeatherNow {
  const day = now.toISOString().slice(0, 10);
  return {
    temperatureC: 28,
    apparentC: 29,
    weatherCode: 1,
    description: "partly cloudy",
    precipitationProbability: 10,
    windKph: 9,
    isDay: true,
    sunrise: `${day}T06:26`,
    sunset: `${day}T18:16`,
    minutesToSunset: 106,
    fetchedAt: now.toISOString()
  };
}

export function demoPlaces(): Place[] {
  return parseOverpass({ elements: snapshot.elements as unknown as OverpassElement[] }, DEMO_ORIGIN);
}
