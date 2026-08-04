import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parseTopology } from "../src/topologyParser.js";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

async function fixture(name) {
  return readFile(path.join(testDirectory, "fixtures", name), "utf8");
}

test("parses a clean topology table into a categorized hierarchy", async () => {
  const result = parseTopology(await fixture("sample_topology.log"));

  assert.ok("root" in result);
  assert.equal(result.root.name, "uvm_test_top");
  assert.equal(result.root.type, "my_test");
  assert.equal(result.root.category, "Test");
  assert.equal(result.root.children.length, 1);

  const env = result.root.children[0];
  assert.equal(env.path, "uvm_test_top.env");
  assert.equal(env.category, "Environment");
  assert.equal(env.children.length, 4);

  const driver = env.children[0].children[0];
  assert.deepEqual(
    {
      name: driver.name,
      type: driver.type,
      size: driver.size,
      path: driver.path,
      category: driver.category,
      color: driver.color
    },
    {
      name: "driver",
      type: "my_driver",
      size: "-",
      path: "uvm_test_top.env.agent0.driver",
      category: "Driver",
      color: "#E8590C"
    }
  );
});

test("ignores surrounding noise, transcript prefixes, and an extra Value column", async () => {
  const result = parseTopology(await fixture("noisy_topology.log"));

  assert.ok("root" in result);
  assert.equal(result.root.children[0].name, "fabric_env");
  assert.equal(result.root.children[0].children[0].children[0].name, "drv");
  assert.equal(result.root.children[0].children[1].size, "4");
  assert.equal(result.root.children[0].children[1].category, "Scoreboard");
});

test("returns a clear error when no topology block exists", async () => {
  const result = parseTopology(await fixture("no_topology.log"));

  assert.deepEqual(result, { error: "No UVM topology block found in this file." });
});

test("supports irregular but consistently nested indentation", () => {
  const result = parseTopology(`
-----------------------------
Name       Type       Size
-----------------------------
top        base_test  -
   env     chip_env   -
       a   bus_agent  -
         d packet_drv -
       b   bus_agent  -
-----------------------------
`);

  assert.ok("root" in result);
  assert.equal(result.root.children[0].children.length, 2);
  assert.equal(result.root.children[0].children[0].children[0].path, "top.env.a.d");
});

test("returns an error instead of crashing on a multiple-root table", () => {
  const result = parseTopology(`
-----------------------------
Name       Type       Size
-----------------------------
top_a      base_test  -
top_b      base_test  -
-----------------------------
`);

  assert.deepEqual(result, {
    error: "A UVM topology table was found, but its hierarchy is malformed."
  });
});
