import { api, ApiError } from "./api";
import type { WorkshopState } from "../packages/workshop-core";
import type { WorkshopAccount } from "../shared/workshop-account";
export type CloudStatus = {
  error: string;
  blocked: boolean;
  savedAt: number;
  saving: boolean;
};
type SaveRequest = {
  writer: string;
  revision: number;
  id: string;
  state: WorkshopState;
  activeSeconds: number;
};
export class WorkshopCloud {
  readonly initial: WorkshopState;
  private latest: WorkshopState | null = null;
  private pending: SaveRequest | null = null;
  private activeSeconds = 0;
  private revision: number;
  private running: Promise<void> | null = null;
  private listeners = new Set<(status: CloudStatus) => void>();
  status: CloudStatus = {
    error: "",
    blocked: false,
    savedAt: Date.now(),
    saving: false,
  };
  constructor(
    readonly account: WorkshopAccount & { writer: string },
    private checkIdentity?: () => Promise<void>,
  ) {
    this.initial = account.state!;
    this.revision = account.revision;
  }
  subscribe = (listener: (status: CloudStatus) => void) => {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private notify(patch: Partial<CloudStatus>) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((fn) => fn(this.status));
  }
  tick(dt: number) {
    this.activeSeconds += dt;
  }
  save(state: WorkshopState) {
    this.latest = structuredClone(state);
    return !this.status.error;
  }
  flush = (keepalive = false): Promise<void> => {
    if (this.running) return this.running;
    if (this.status.blocked || (!this.pending && !this.latest))
      return Promise.resolve();
    if (!this.pending) {
      this.pending = {
        writer: this.account.writer,
        revision: this.revision,
        id: crypto.randomUUID(),
        state: this.latest!,
        activeSeconds: this.activeSeconds,
      };
      this.latest = null;
    }
    const sent = this.pending;
    this.notify({ saving: true });
    this.running = (async () => {
      try {
        if (this.checkIdentity) {
          try {
            await this.checkIdentity();
          } catch {
            throw new ApiError(
              "Your wallet changed or disconnected. Sign in again to continue.",
              401,
            );
          }
        }
        let result: WorkshopAccount;
        if (keepalive) {
          const response = await fetch("/api/workshop/save", {
            method: "POST",
            keepalive: true,
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "X-Pitlane-Account": this.account.address,
            },
            body: JSON.stringify(sent),
          });
          const data = (await response.json()) as WorkshopAccount & {
            error?: string;
          };
          if (!response.ok)
            throw new ApiError(data.error || "Save failed.", response.status);
          result = data;
        } else
          result = await api<WorkshopAccount>(
            "workshop/save",
            sent,
            this.account.address,
          );
        this.revision = result.revision;
        this.activeSeconds = Math.max(
          0,
          this.activeSeconds - sent.activeSeconds,
        );
        this.pending = null;
        this.notify({ error: "", savedAt: Date.now() });
      } catch (error) {
        this.notify({
          error:
            error instanceof Error
              ? error.message
              : "Your connection was interrupted. Retry saving to continue.",
          blocked:
            error instanceof ApiError && [401, 409].includes(error.status),
        });
      } finally {
        this.running = null;
        this.notify({ saving: false });
      }
    })();
    return this.running;
  };
}
