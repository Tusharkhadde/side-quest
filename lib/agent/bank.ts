import type { Conditions, PlaceKind, QuestDraft } from "../types";

export type QuestTemplate = Omit<QuestDraft, "placeId" | "durationMinutes" | "indoorAdjacent">;

/**
 * Hand-written quests used by the mock model (demo mode, tests) and as a
 * last-resort fallback when the real model cannot be reached.
 */
export const OUTDOOR_BANK: Record<PlaceKind, QuestTemplate[]> = {
  park: [
    {
      title: "Three Shades of Leaf",
      intro: "Walk to the park and look for colour the screen cannot give you.",
      steps: [
        { kind: "move", text: "Walk slowly to the biggest tree you can see and stand under it." },
        { kind: "collect", text: "Find three fallen leaves in three different colours." },
        { kind: "notice", text: "Close your eyes and count four different sounds around you." }
      ],
      safety: "Stay on paths and keep one ear free for cycles and traffic.",
      proof: "Your three fallen leaves side by side in your palm."
    },
    {
      title: "Bench Detective",
      intro: "Every park bench has a story. Go and find one.",
      steps: [
        { kind: "observe", text: "Find a bench and sit for one full minute without your phone." },
        { kind: "notice", text: "Spot three birds and notice how differently each one moves." },
        { kind: "collect", text: "Find something round on the ground that is not litter." }
      ],
      safety: "Watch your step near roots and uneven ground.",
      proof: "The round thing you found, held up against the sky."
    }
  ],
  garden: [
    {
      title: "Smallest Flower Hunt",
      intro: "Gardens hide their best work at ground level.",
      steps: [
        { kind: "observe", text: "Find the smallest flower you can, and crouch down to its height." },
        { kind: "notice", text: "Smell three different plants without picking anything." },
        { kind: "collect", text: "Count how many petal colours you can find in two minutes." }
      ],
      safety: "Look, smell and photograph only. Leave every plant where it grows.",
      proof: "A close-up of the smallest flower you found."
    }
  ],
  trail: [
    {
      title: "Path of Textures",
      intro: "A short walk where your feet and hands do the noticing.",
      steps: [
        { kind: "move", text: "Walk the path for eight minutes, then turn around." },
        { kind: "notice", text: "Touch three different textures: bark, stone and something soft." },
        { kind: "observe", text: "Find one thing on the path that water or wind has shaped." }
      ],
      safety: "Turn back at the halfway time so you finish in good light.",
      proof: "The water- or wind-shaped thing you found, in your hand or on the ground."
    }
  ],
  water: [
    {
      title: "Ripple Counting",
      intro: "Water is never still if you watch it long enough.",
      steps: [
        { kind: "observe", text: "Find a safe spot by the water and watch the surface for one minute." },
        { kind: "listen", text: "Listen for the quietest sound the water makes." },
        { kind: "collect", text: "Count every living thing you can see on or above the water." }
      ],
      safety: "Stay well back from the edge and off wet rocks.",
      proof: "The water with the sky reflected in it."
    }
  ],
  nature: [
    {
      title: "Wild Patch Census",
      intro: "Even a small green patch is a busy city.",
      steps: [
        { kind: "observe", text: "Pick one square metre of ground and look at it for one minute." },
        { kind: "collect", text: "Count every insect, ant or crawling thing you can spot." },
        { kind: "notice", text: "Find the oldest-looking plant and guess how old it is." }
      ],
      safety: "Wear closed shoes and watch for thorns and ant trails.",
      proof: "Your square metre of ground, photographed from above."
    }
  ],
  viewpoint: [
    {
      title: "Horizon Line",
      intro: "Give your eyes something far away to focus on.",
      steps: [
        { kind: "observe", text: "Find the farthest thing you can see and name it out loud." },
        { kind: "notice", text: "Spot three things moving in the distance." },
        { kind: "listen", text: "Work out which direction the wind is coming from." }
      ],
      safety: "Stay behind railings and away from edges.",
      proof: "The farthest thing you could see."
    }
  ],
  home: []
};

export const INDOOR_ADJACENT_BANK: QuestTemplate[] = [
  {
    title: "Window Weather Report",
    intro: "It is not the right time to head out, so this is an indoor-adjacent quest: the outside comes to your window.",
    steps: [
      { kind: "observe", text: "Go to a balcony, terrace or open window and watch the sky for one minute." },
      { kind: "notice", text: "Name three sounds coming from outside, one near and two far." },
      { kind: "collect", text: "Count how many different trees or plants you can see from where you stand." }
    ],
    safety: "Stay behind the railing or inside the window frame, and keep away from glass in lightning.",
    proof: "The sky or the street from your balcony or window."
  },
  {
    title: "Stairwell Light Hunt",
    intro: "Conditions say stay close to home, so this is an indoor-adjacent quest that follows the light from outside.",
    steps: [
      { kind: "move", text: "Walk the stairs of your building slowly, one floor up and back down." },
      { kind: "observe", text: "At each window, notice what colour the outside light is." },
      { kind: "notice", text: "Find the spot where you can feel outside air the most." }
    ],
    safety: "Hold the handrail and keep the stairwell lights on.",
    proof: "The view from the best window you found."
  }
];

export function pickFromBank(kind: PlaceKind, conditions: Conditions, seed: number): QuestTemplate {
  const outdoor = OUTDOOR_BANK[kind];
  const pool = conditions === "good" && outdoor.length ? outdoor : INDOOR_ADJACENT_BANK;
  return pool[Math.abs(seed) % pool.length];
}

/** FNV-1a: small, stable, good enough to make demo quests deterministic. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
