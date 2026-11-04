import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  request: vi.fn(),
  enable: vi.fn(),
  disconnect: vi.fn(),
  close: vi.fn(),
  create: vi.fn(),
  ready: vi.fn(),
  open: vi.fn(),
  unsubscribe: vi.fn(),
  abort: vi.fn(),
  listener: undefined as ((state: { open: boolean }) => void) | undefined,
  session: {} as object | undefined,
  on: vi.fn(),
  off: vi.fn(),
}));
vi.mock("@walletconnect/ethereum-provider", () => ({
  EthereumProvider: { init: mocks.init },
}));
vi.mock("@reown/appkit/core", () => ({ createAppKit: mocks.create }));
const config = {
  projectId: "1".repeat(32),
  appOrigin: "https://staging.pitlane.invalid",
  chainId: 11155111,
  chainName: "Sepolia",
  rpcUrl: "https://rpc.invalid/",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
};
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.session = {};
  mocks.listener = undefined;
  mocks.enable.mockResolvedValue([]);
  vi.stubGlobal("location", { origin: config.appOrigin });
  mocks.init.mockResolvedValue({
    get session() {
      return mocks.session;
    },
    request: mocks.request,
    enable: mocks.enable,
    disconnect: mocks.disconnect,
    events: { on: mocks.on, removeListener: mocks.off },
    signer: { abortPairingAttempt: mocks.abort },
  });
  mocks.create.mockReturnValue({
    close: mocks.close,
    ready: mocks.ready,
    open: mocks.open,
    subscribeState: (listener: (state: { open: boolean }) => void) => {
      mocks.listener = listener;
      return mocks.unsubscribe;
    },
  });
});
describe("external wallet adapter configuration", () => {
  it("initializes once with only login methods, scoped storage, chain metadata and optional money features disabled", async () => {
    const { externalWallet } = await import("../src/external-wallet");
    const [one, two] = await Promise.all([
      externalWallet(config),
      externalWallet(config),
    ]);
    expect(one).toBe(two);
    expect(mocks.init).toHaveBeenCalledTimes(1);
    const options = mocks.init.mock.calls[0][0];
    expect(options.optionalChains).toEqual([11155111]);
    expect(options.optionalMethods).toEqual([
      "personal_sign",
      "eth_accounts",
      "eth_requestAccounts",
    ]);
    expect(options.rpcMap).toEqual({ 11155111: config.rpcUrl });
    expect(options.metadata.url).toBe(config.appOrigin);
    expect(options.logger).toBe("silent");
    expect(options.telemetryEnabled).toBe(false);
    expect(options.customStoragePrefix).toContain(config.appOrigin);
    expect(mocks.create.mock.calls[0][0].networks[0].nativeCurrency).toEqual(
      config.nativeCurrency,
    );
    expect(mocks.create.mock.calls[0][0].features).toMatchObject({
      swaps: false,
      onramp: false,
      send: false,
      email: false,
      socials: false,
      reownAuthentication: false,
      analytics: false,
    });
    expect(options.showQrModal).toBe(false);
    expect(mocks.ready).toHaveBeenCalledTimes(1);
    await one.enable();
    expect(mocks.enable).toHaveBeenCalledTimes(1);
    await one.disconnect();
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
    expect(() => externalWallet({ ...config, chainId: 1 })).toThrow("Reload");
  });
  it("shares one connection attempt, cancels and unsubscribes, then permits retry", async () => {
    mocks.session = undefined;
    mocks.enable.mockImplementationOnce(() => new Promise(() => {}));
    const { externalWallet } = await import("../src/external-wallet");
    const wallet = await externalWallet(config);
    const first = wallet.enable(),
      second = wallet.enable();
    expect(first).toBe(second);
    const rejected = expect(first).rejects.toThrow("cancelled");
    await vi.waitFor(() => expect(mocks.listener).toBeDefined());
    mocks.listener!({ open: false });
    await rejected;
    expect(mocks.abort).toHaveBeenCalledTimes(1);
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    await wallet.enable();
    expect(mocks.enable).toHaveBeenCalledTimes(2);
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(2);
  });
  it("rejects mismatched origin and allows retry after initialization failure", async () => {
    const { externalWallet } = await import("../src/external-wallet");
    await expect(
      externalWallet({ ...config, appOrigin: "https://other.invalid" }),
    ).rejects.toThrow("configured Pitlane address");
    expect(mocks.init).not.toHaveBeenCalled();
    mocks.init.mockRejectedValueOnce(new Error("Relay unavailable"));
    await expect(externalWallet(config)).rejects.toThrow("Relay unavailable");
    await expect(externalWallet(config)).resolves.toBeDefined();
  });
});
