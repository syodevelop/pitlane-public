import { getAddress } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";

export interface AuthContext {
  ENVIRONMENT: string;
  APP_ORIGIN: string;
  CHAIN_ID: string;
}
export const LOGIN_STATEMENT =
  "Sign in to Pitlane. This offchain message grants no token approval and makes no transfer.";
export const CHALLENGE_MS = 300_000;

export function sessionContext(env: AuthContext) {
  return JSON.stringify([env.ENVIRONMENT, env.APP_ORIGIN, env.CHAIN_ID]);
}

// Signature recovery alone does not validate the message's purpose or environment.
export function validLoginContext(
  text: string,
  address: string,
  env: AuthContext,
  now: number,
) {
  try {
    const message = parseSiweMessage(text);
    const issued = message.issuedAt?.getTime();
    const expires = message.expirationTime?.getTime();
    return (
      validateSiweMessage({
        address: getAddress(address),
        domain: new URL(env.APP_ORIGIN).host,
        message,
        time: new Date(now),
      }) &&
      message.uri === env.APP_ORIGIN &&
      message.chainId === Number(env.CHAIN_ID) &&
      Number.isSafeInteger(message.chainId) &&
      message.chainId! > 0 &&
      message.version === "1" &&
      message.requestId === env.ENVIRONMENT &&
      message.statement === LOGIN_STATEMENT &&
      /^[a-f0-9]{32}$/.test(message.nonce || "") &&
      typeof issued === "number" &&
      Number.isFinite(issued) &&
      typeof expires === "number" &&
      Number.isFinite(expires) &&
      issued <= now &&
      expires > now &&
      expires - issued === CHALLENGE_MS
    );
  } catch {
    return false;
  }
}

export function accountBindingMatches(expected: string | null, actual: string) {
  return (
    !!expected &&
    /^0x[0-9a-fA-F]{40}$/.test(expected) &&
    expected.toLowerCase() === actual.toLowerCase()
  );
}
