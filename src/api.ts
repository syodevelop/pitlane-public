import type { Garage } from "../packages/game-core";
import type { CommandEnvelope } from "../packages/protocol";
import { validateResponse } from "../packages/protocol";
export type Snapshot = { state: Garage; address: string; now: number };
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  data?: unknown,
  account?: string,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    credentials: "same-origin",
    signal: AbortSignal.timeout(15000),
    headers: {
      ...(account ? { "X-Pitlane-Account": account } : {}),
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(data === undefined
      ? {}
      : {
          method: "POST",
          body: JSON.stringify(data),
        }),
  });
  const result = (await response.json()) as T & { error?: string };
  validateResponse(result, path, response.ok);
  if (!response.ok)
    throw new ApiError(
      result.error || "Request failed. Your saved progress is safe.",
      response.status,
    );
  return result;
}
export type Pending = CommandEnvelope;
export interface WalletProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(name: string, fn: (...args: unknown[]) => void): void;
  removeListener?(name: string, fn: (...args: unknown[]) => void): void;
}
declare global {
  interface Window {
    ethereum?: WalletProvider;
  }
}
