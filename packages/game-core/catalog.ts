// All balance numbers in this module are local calibration fixtures, not launch rules.
export const BALANCE_VERSION = "garage-v0.2-prototype";
export const APPROVAL = "UNAPPROVED_PROTOTYPE";
export const CHARACTERS = {
  Gus: { role: "Mechanic", service: 1100, delivery: 900, preparation: 1000 },
  Dash: { role: "Runner", service: 1000, delivery: 1100, preparation: 900 },
  Juno: { role: "Tuner", service: 900, delivery: 1000, preparation: 1100 },
} as const;
export type Character = keyof typeof CHARACTERS;
export type Rate = "service" | "delivery" | "preparation";
export const CARS = {
  1: {
    name: "Rustback",
    pace: 40,
    reliability: 40,
    preparation: 50,
    weight: 1000,
    mainPrice: null,
  },
  2: {
    name: "Club Coupe",
    pace: 52,
    reliability: 48,
    preparation: 55,
    weight: 1200,
    mainPrice: "1000000000000000000000",
  },
  3: {
    name: "Track GT",
    pace: 64,
    reliability: 55,
    preparation: 62,
    weight: 1400,
    mainPrice: "2500000000000000000000",
  },
  4: {
    name: "Enduro",
    pace: 61,
    reliability: 76,
    preparation: 68,
    weight: 1600,
    mainPrice: "5000000000000000000000",
  },
  5: {
    name: "Prototype",
    pace: 78,
    reliability: 72,
    preparation: 75,
    weight: 1800,
    mainPrice: "10000000000000000000000",
  },
} as const;
export type Tier = keyof typeof CARS;
export const FIXTURES = {
  demoCoupeCredits: 3000,
  regularRaceMs: 600_000,
  tutorialRaceMs: 45_000,
  stockMs: 8_000,
  restorationMs: 90_000,
  preparationMs: 60_000,
  playerSpeed: 110,
  helperSpeed: 90,
  interactionRadius: 48,
  playerCarry: 2,
  slots: { demo: 2, main: 3 },
  hire: { Runner: 500, Mechanic: 500, "Team Manager": 900 },
} as const;
export type StaffRole = keyof typeof FIXTURES.hire;
export const GARAGE_UPGRADES = {
  quickTools: {
    label: "Quick service tools",
    cost: 400,
    detail: "Faster Tires and Quick Service work.",
  },
  engineTools: {
    label: "Engine workshop",
    cost: 500,
    detail: "Faster Engine Work.",
  },
  capacity: {
    label: "Customer capacity",
    cost: 700,
    detail:
      "More accepted customers, station storage and a second work position.",
  },
  team: {
    label: "Race team",
    cost: 600,
    detail: "Faster own-car preparation and improved preparation stats.",
  },
} as const;
export const SERVICES = {
  tires: {
    label: "Tires",
    credits: 80,
    rep: 10,
    steps: [{ station: "tires", parts: 1, duration: 60_000 }],
  },
  quick: {
    label: "Quick Service",
    credits: 120,
    rep: 15,
    steps: [
      { station: "quick", parts: 1, duration: 70_000 },
      { station: "quick", parts: 0, duration: 20_000 },
    ],
  },
  engine: {
    label: "Engine Work",
    credits: 180,
    rep: 24,
    steps: [
      { station: "engine", parts: 1, duration: 120_000 },
      { station: "quick", parts: 1, duration: 30_000 },
    ],
  },
} as const;
export type ServiceKind = keyof typeof SERVICES;
export type Preparation = "sprint" | "endurance";
export type Mode = "demo" | "main";
export function durationAtRate(baseMs: number, rate: number): number {
  if (
    !Number.isSafeInteger(baseMs) ||
    baseMs <= 0 ||
    !Number.isSafeInteger(rate) ||
    rate <= 0
  )
    throw new Error("Invalid work rate.");
  // Fixed-point rate 1100 means +10% speed, not -10% duration.
  return Math.ceil((baseMs * 1000) / rate);
}
export function assertApprovedCatalog(
  environment: "local" | "staging" | "production",
) {
  if (environment === "production")
    throw new Error(
      `${APPROVAL}: the catalog cannot activate production money.`,
    );
}
