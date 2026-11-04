// Real local SIWE verification; unfunded ephemeral identities stay in memory.
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const base = "http://127.0.0.1:5173/api/",
  origin = "http://127.0.0.1:5173";
const a = privateKeyToAccount(generatePrivateKey()),
  b = privateKeyToAccount(generatePrivateKey());
async function request(
  path,
  { data, cookie, account, origin: source = origin } = {},
) {
  const r = await fetch(base + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Origin: source,
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(account ? { "X-Pitlane-Account": account } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return {
    status: r.status,
    body: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function challenge(account) {
  const c = await request("auth/challenge", {
    data: { address: account.address },
  });
  assert.equal(c.status, 200);
  return {
    address: account.address,
    message: c.body.message,
    signature: await account.signMessage({ message: c.body.message }),
  };
}
assert.equal((await request("state", { account: a.address })).status, 401);
const intent = await challenge(a);
assert.match(intent.message, /Chain ID: 4663\n/);
for (const changed of [
  intent.message.replace("127.0.0.1:5173 wants", "other.invalid wants"),
  intent.message.replace(
    "URI: http://127.0.0.1:5173",
    "URI: https://other.invalid",
  ),
  intent.message.replace("Chain ID: 4663", "Chain ID: 11155111"),
  intent.message.replace("Request ID: local", "Request ID: production"),
]) {
  assert.notEqual(changed, intent.message);
  const result = await request("auth/verify", {
    data: {
      ...intent,
      message: changed,
      signature: await a.signMessage({ message: changed }),
    },
  });
  assert.equal(result.status, 401);
  assert.equal(result.cookie, undefined);
}
assert.equal(
  (
    await request("auth/verify", {
      data: {
        ...intent,
        signature: await b.signMessage({ message: intent.message }),
      },
    })
  ).status,
  401,
);
assert.equal(
  (
    await request("auth/verify", {
      data: intent,
      origin: "https://other.invalid",
    })
  ).status,
  403,
);
const concurrent = await Promise.all([
  request("auth/verify", { data: intent }),
  request("auth/verify", { data: intent }),
]);
assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 401]);
const cookieA = concurrent.find((r) => r.status === 200).cookie;
assert.equal((await request("auth/verify", { data: intent })).status, 401);
const loginB = await request("auth/verify", { data: await challenge(b) });
assert.equal(loginB.status, 200);
const cookieB = loginB.cookie;
const initialB = await request("state", {
  cookie: cookieB,
  account: b.address,
});
assert.equal(initialB.status, 200);
const command = (character) => ({
  schemaVersion: 2,
  ruleset: "garage-v0.2-prototype",
  generation: initialB.body.state.progress.generation,
  id: crypto.randomUUID(),
  version: initialB.body.state.progress.revision,
  command: { type: "select", character },
});
// Simulate A's tab after B replaced the browser's shared cookie. Even a command
// carrying B's exact generation/revision must not execute with A's binding.
for (const account of [undefined, a.address]) {
  assert.equal(
    (
      await request("command", {
        cookie: cookieB,
        account,
        data: command("Gus"),
      })
    ).status,
    401,
  );
  assert.equal(
    (await request("auth/logout", { cookie: cookieB, account, data: {} }))
      .status,
    401,
  );
}
assert.equal(
  (await request("state", { cookie: cookieB, account: a.address })).status,
  401,
);
const choices = await Promise.all(
  ["Gus", "Dash"].map((character) =>
    request("command", {
      cookie: cookieB,
      account: b.address,
      data: command(character),
    }),
  ),
);
assert.deepEqual(choices.map((r) => r.status).sort(), [200, 409]);
const chosen = choices.find((r) => r.status === 200).body.state.profile
  .character;
const restored = await request("state", {
  cookie: cookieB,
  account: b.address,
});
assert.equal(restored.body.state.profile.character, chosen);
assert.equal(
  (await request("state", { cookie: cookieA, account: a.address })).body.state
    .profile.character,
  null,
);
assert.equal(
  (
    await request("auth/logout", {
      cookie: cookieB,
      account: b.address,
      data: {},
    })
  ).status,
  200,
);
assert.equal(
  (await request("state", { cookie: cookieB, account: b.address })).status,
  401,
);
await request("auth/logout", { cookie: cookieA, account: a.address, data: {} });
console.log(
  "Auth API passed: signed wrong context/account rejected; concurrent nonce accepted once; cross-tab account binding; concurrent character selection; logout revokes session. No funded wallet or external-wallet round trip.",
);
