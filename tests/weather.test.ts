import { describe, expect, it } from "vitest";
import fixture from "./fixtures/open-meteo.json";
import {
  buildOpenMeteoUrl,
  classifyConditions,
  describeWeatherCode,
  formatSunset,
  minutesBetween,
  parseOpenMeteo,
  type OpenMeteoResponse
} from "@/lib/context/weather";
import type { WeatherNow } from "@/lib/types";

const base = parseOpenMeteo(fixture as OpenMeteoResponse, "2026-10-10T11:00:00Z");

describe("Open-Meteo parsing", () => {
  it("extracts the numbers the agent needs", () => {
    expect(base.temperatureC).toBe(29.4);
    expect(base.description).toBe("partly cloudy");
    expect(base.isDay).toBe(true);
    expect(base.minutesToSunset).toBe(107);
    // max of this hour (15%) and the next (25%)
    expect(base.precipitationProbability).toBe(25);
  });

  it("only sends a coarse point", () => {
    const url = buildOpenMeteoUrl({ lat: 18.629812, lon: 73.799741 });
    expect(url).toContain("latitude=18.63");
    expect(url).toContain("longitude=73.8");
    expect(url).not.toContain("18.6298");
  });

  it("measures local minutes between timestamps", () => {
    expect(minutesBetween("2026-10-10T17:00", "2026-10-10T18:17")).toBe(77);
    expect(minutesBetween("2026-10-10T19:00", "2026-10-10T18:17")).toBe(-43);
  });
});

describe("sunset and weather rules", () => {
  const w = (patch: Partial<WeatherNow>): WeatherNow => ({ ...base, ...patch });

  it("says good on a fair afternoon", () => {
    expect(classifyConditions(base, 20)).toBe("good");
  });

  it("needs the quest plus a 10 minute buffer before sunset", () => {
    expect(classifyConditions(w({ minutesToSunset: 30 }), 20)).toBe("good");
    expect(classifyConditions(w({ minutesToSunset: 29 }), 20)).toBe("dark");
    expect(classifyConditions(w({ isDay: false, minutesToSunset: -60 }), 20)).toBe("dark");
  });

  it("goes indoor-adjacent for rain now or rain likely", () => {
    expect(classifyConditions(w({ weatherCode: 63 }), 20)).toBe("rain");
    expect(classifyConditions(w({ precipitationProbability: 70 }), 20)).toBe("rain");
    expect(classifyConditions(w({ precipitationProbability: 55 }), 20)).toBe("good");
  });

  it("puts storms and dangerous temperatures first", () => {
    expect(classifyConditions(w({ weatherCode: 95, minutesToSunset: 5 }), 20)).toBe("storm");
    expect(classifyConditions(w({ windKph: 60 }), 20)).toBe("storm");
    expect(classifyConditions(w({ apparentC: 42 }), 20)).toBe("too-hot");
    expect(classifyConditions(w({ apparentC: -8 }), 20)).toBe("too-cold");
  });

  it("treats unknown weather as good (the walk is still short)", () => {
    expect(classifyConditions(null, 20)).toBe("good");
  });

  it("formats helper strings", () => {
    expect(describeWeatherCode(0)).toBe("clear sky");
    expect(describeWeatherCode(81)).toBe("rain showers");
    expect(formatSunset(107)).toBe("1h 47m to sunset");
    expect(formatSunset(-3)).toBe("after sunset");
  });
});
