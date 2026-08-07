import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { discoverFlowSpecFiles } from "../src/graph";

describe("discoverFlowSpecFiles", () => {
	it("keeps only .flowspec paths", () => {
		const found = discoverFlowSpecFiles([
			"notes/readme.md",
			"flows/a.flowspec",
			"flows/b.FLOWSPEC",
			"flows/c.flowspec.bak",
			"x.flowspec",
		]);
		assert.deepEqual(found, ["flows/a.flowspec", "flows/b.FLOWSPEC", "x.flowspec"]);
	});

	it("returns an empty list when nothing matches", () => {
		assert.deepEqual(discoverFlowSpecFiles(["a.md", "b.txt"]), []);
	});
});
