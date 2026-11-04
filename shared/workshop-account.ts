import type { WorkshopState } from "../packages/workshop-core";
export type CrewId = WorkshopState["character"];
export type WorkshopAccount = {
  address: string;
  character: CrewId | null;
  state: WorkshopState | null;
  revision: number;
  playSeconds: number;
};
export type WorkshopPlayerRow = {
  wallet: string;
  character: CrewId | null;
  credits: number;
  rep: number;
  serviced: number;
  engine_jobs: number;
  races: number;
  best_score: number;
  bays: number;
  tools: number;
  mechanic: number;
  play_seconds: number;
  logins: number;
  first_seen: number;
  last_login: number;
  last_seen: number;
};
