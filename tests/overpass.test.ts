import { describe, expect, it } from "vitest";
import fixture from "./fixtures/overpass.json";
import { buildOverpassQuery, homePlace, kindFromTags, parseOverpass, pickCandidates } from "@/lib/context/places";
import { coarsen, haversineMeters, walkingMinutes } from "@/lib/geo";
import type { OverpassElement } from "@/lib/context/places";

const origin = { lat: 18.6298, lon: 73.7997 };
const data = fixture as unknown as { elements: OverpassElement[] };

describe("Overpass parsing", () => {
  const places = parseOverpass(data, origin);

  it("skips elements without geometry and sorts nearest first", () => {
    expect(places.find((p) => p.name === "No Geometry Park")).toBeUndefined();
    for (let i = 1; i < places.length; i++) {
      expect(places[i].distanceMeters).toBeGreaterThanOrEqual(places[i - 1].distanceMeters);
    }
  });

  it("deduplicates the same named place mapped twice, keeping the nearest", () => {
    const shahu = places.filter((p) => p.name === "Shahu Udyan");
    expect(shahu).toHaveLength(1);
    expect(shahu[0].id).toBe("way/101");
  });

  it("prefers English names and labels unnamed places", () => {
    expect(places.some((p) => p.name === "Rose Garden" && p.kind === "garden")).toBe(true);
    expect(places.some((p) => p.name === "Unnamed park")).toBe(true);
  });

  it("classifies tags into place kinds", () => {
    expect(kindFromTags({ natural: "water" })).toBe("water");
    expect(kindFromTags({ highway: "footway" })).toBe("trail");
    expect(kindFromTags({ tourism: "viewpoint" })).toBe("viewpoint");
    expect(kindFromTags({ leisure: "nature_reserve" })).toBe("nature");
  });

  it("picks up to 3 varied candidates that fit the quest", () => {
    const short = pickCandidates(places, 20);
    expect(short.every((p) => p.walkMinutes <= 7)).toBe(true);
    expect(short.map((p) => p.name)).toContain("Shahu Udyan");
    const long = pickCandidates(places, 45);
    expect(long).toHaveLength(3);
    expect(new Set(long.map((p) => p.kind)).size).toBe(3);
    expect(long.find((p) => p.name === "Far Hills")).toBeUndefined();
  });

  it("returns no candidates when nothing is walkable", () => {
    expect(pickCandidates(places.filter((p) => p.walkMinutes > 20), 20)).toEqual([]);
  });

  it("builds a query around a coarse point", () => {
    const q = buildOverpassQuery(coarsen(origin), 2700);
    expect(q).toContain("around:2700,18.63,73.8");
    expect(q).toContain("[out:json]");
  });
});

describe("geo helpers", () => {
  it("computes distance and walking time", () => {
    const d = haversineMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 0.01 });
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1120);
    expect(walkingMinutes(1000)).toBe(17);
    expect(walkingMinutes(0)).toBe(1);
  });

  it("coarsens to about a kilometre", () => {
    expect(coarsen({ lat: 18.62981, lon: 73.79974 })).toEqual({ lat: 18.63, lon: 73.8 });
  });

  it("home place has zero distance", () => {
    expect(homePlace(origin).walkMinutes).toBe(0);
  });
});
