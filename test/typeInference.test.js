import assert from "node:assert/strict";
import test from "node:test";

import { inferType } from "../src/typeInference.js";

test("uses ordered type matches before the instance-name fallback", () => {
  assert.deepEqual(inferType("driver", "custom_monitor"), {
    category: "Monitor",
    color: "#2F9E44"
  });
  assert.deepEqual(inferType("tx_agent", "vendor_component"), {
    category: "Agent",
    color: "#7048E8"
  });
});

test("matches sequencers before the broader sequence rule", () => {
  assert.equal(inferType("seqr", "packet_sequencer").category, "Sequencer");
  assert.equal(inferType("startup", "reset_sequence").category, "Sequence");
});

test("returns the neutral category for unknown component types", () => {
  assert.deepEqual(inferType("coverage", "subscriber"), {
    category: "Unknown",
    color: "#868E96"
  });
});
