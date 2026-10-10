import type { LatLon, Place, PlaceKind } from "../types";
import { coarsen, haversineMeters, walkingMinutes } from "../geo";
import { readLocal, writeLocal } from "./cache";

export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

/**
 * Overpass QL for green and blue space around a (coarsened) point.
 * The caller over-fetches by the coarsening error so precise distances
 * can be computed on-device afterwards.
 */
export function buildOverpassQuery(center: LatLon, radiusMeters: number): string {
  const a = `(around:${Math.round(radiusMeters)},${center.lat},${center.lon})`;
  return `[out:json][timeout:20];
(
  nwr["leisure"~"^(park|garden|nature_reserve)$"]${a};
  nwr["landuse"~"^(forest|recreation_ground|village_green|meadow)$"]["name"]${a};
  nwr["natural"~"^(water|wood|beach|scrub)$"]["name"]${a};
  way["highway"~"^(path|footway|track)$"]["name"]${a};
  nwr["tourism"="viewpoint"]${a};
);
out center tags 80;`;
}

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function kindFromTags(tags: Record<string, string>): PlaceKind {
  if (tags.tourism === "viewpoint") return "viewpoint";
  if (tags.leisure === "garden") return "garden";
  if (tags.leisure === "park" || tags.landuse === "recreation_ground" || tags.landuse === "village_green") return "park";
  if (tags.highway) return "trail";
  if (tags.natural === "water" || tags.natural === "beach" || tags.waterway) return "water";
  return "nature";
}

export const UNNAMED_LABEL: Record<PlaceKind, string> = {
  park: "Unnamed park",
  garden: "Unnamed garden",
  trail: "Footpath",
  water: "Waterside",
  nature: "Green patch",
  viewpoint: "Viewpoint",
  home: "Near home"
};

/** Parse Overpass JSON into places with precise on-device distances, nearest first. */
export function parseOverpass(json: { elements?: OverpassElement[] }, origin: LatLon): Place[] {
  const byName = new Map<string, Place>();
  const out: Place[] = [];
  for (const el of json.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    const tags = el.tags ?? {};
    const kind = kindFromTags(tags);
    const named = (tags["name:en"] ?? tags.name ?? "").trim();
    const name = named || UNNAMED_LABEL[kind];
    const distanceMeters = Math.round(haversineMeters(origin, { lat, lon }));
    const place: Place = {
      id: `${el.type}/${el.id}`,
      name,
      kind,
      lat,
      lon,
      distanceMeters,
      walkMinutes: walkingMinutes(distanceMeters)
    };
    if (named) {
      // A park mapped as a node and a way, or a path split into segments: keep the nearest.
      const key = `${named.toLowerCase()}|${kind}`;
      const prev = byName.get(key);
      if (prev && prev.distanceMeters <= distanceMeters) continue;
      if (prev) out.splice(out.indexOf(prev), 1);
      byName.set(key, place);
    }
    out.push(place);
  }
  return out.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

const KIND_PENALTY: Record<PlaceKind, number> = {
  park: 0,
  garden: 0,
  water: 0,
  nature: 1,
  viewpoint: 1,
  trail: 2,
  home: 5
};

/**
 * Pick up to `n` candidates that fit inside the quest: the walk there may use
 * at most 35% of the quest, so a round trip still leaves about a third of the
 * time for the quest itself. Named places, parks and water win ties, and varied kinds are
 * preferred so Gemma has a real choice to make.
 */
export function pickCandidates(places: Place[], questMinutes: number, n = 3): Place[] {
  const maxWalk = Math.max(3, Math.floor(questMinutes * 0.35));
  const score = (p: Place) =>
    p.walkMinutes + KIND_PENALTY[p.kind] * 2 + (p.name === UNNAMED_LABEL[p.kind] ? 4 : 0);
  const ranked = places.filter((p) => p.walkMinutes <= maxWalk).sort((a, b) => score(a) - score(b));
  const picked: Place[] = [];
  const kinds = new Set<PlaceKind>();
  for (const p of ranked) {
    if (picked.length >= n) break;
    if (!kinds.has(p.kind)) {
      picked.push(p);
      kinds.add(p.kind);
    }
  }
  for (const p of ranked) {
    if (picked.length >= n) break;
    if (!picked.includes(p)) picked.push(p);
  }
  return picked;
}

/** The "place" for indoor-adjacent quests, and for when the map is empty. */
export function homePlace(origin: LatLon, label = "Your balcony, terrace or nearest window"): Place {
  return { id: "home", name: label, kind: "home", lat: origin.lat, lon: origin.lon, distanceMeters: 0, walkMinutes: 0 };
}

function recompute(places: Place[], origin: LatLon): Place[] {
  return places
    .map((p) => {
      const d = Math.round(haversineMeters(origin, p));
      return { ...p, distanceMeters: d, walkMinutes: walkingMinutes(d) };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/**
 * Query OpenStreetMap for nearby green space. Only a ~1 km coarsened point is
 * sent; precise distances are computed here, on the device.
 */
export async function fetchPlaces(
  origin: LatLon,
  radiusMeters = 1500,
  fetchImpl: typeof fetch = fetch
): Promise<Place[]> {
  const center = coarsen(origin);
  const key = `sq.places.${center.lat},${center.lon},${radiusMeters}`;
  const cached = readLocal<Place[]>(key, 24 * 60 * 60 * 1000);
  if (cached) return recompute(cached, origin).filter((p) => p.distanceMeters <= radiusMeters);
  const query = buildOverpassQuery(center, radiusMeters + 1200);
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`
      });
      if (!res.ok) continue;
      const all = parseOverpass(await res.json(), origin);
      writeLocal(key, all);
      return all.filter((p) => p.distanceMeters <= radiusMeters);
    } catch {
      // try the next mirror
    }
  }
  return [];
}
