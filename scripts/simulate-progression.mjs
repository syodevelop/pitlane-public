import { Scenario } from "../packages/game-core/scenario.ts";
import { BALANCE_VERSION } from "../packages/game-core/catalog.ts";
const rows = [];
for (const character of ["Gus", "Dash", "Juno"]) {
  const h = new Scenario(character, "main");
  const start = h.now;
  h.freeQualification();
  rows.push({
    character,
    scenario: "Balanced 18 orders; no helper; tutorial + free qualification",
    minutes: Number(((h.now - start) / 60_000).toFixed(2)),
    credits: h.state.progress.credits,
    rep: h.state.progress.rep,
    completed: h.state.progress.completed,
    qualified: h.state.progress.qualified,
    issued: h.state.progress.partsIssued,
    consumed: h.state.progress.partsConsumed,
  });
}
console.log(
  JSON.stringify(
    {
      label:
        "UNAPPROVED_PROTOTYPE — deterministic scripted scenarios, not human playtests or payout promises",
      balanceVersion: BALANCE_VERSION,
      rows,
    },
    null,
    2,
  ),
);
