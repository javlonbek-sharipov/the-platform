import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const fontsFolder = new URL("../fonts/", import.meta.url);

function sha256(name: string): string {
	return createHash("sha256")
		.update(readFileSync(new URL(name, fontsFolder)))
		.digest("hex");
}

describe("the bundled font", () => {
	test("is Inter 4.1's static regular and semibold TrueType files", () => {
		// The SHA-256s of `extras/ttf/` in Inter-4.1.zip, from https://github.com/rsms/inter/releases/tag/v4.1.
		expect(sha256("Inter-Regular.ttf")).toBe(
			"40d692fce188e4471e2b3cba937be967878f631ad3ebbbdcd587687c7ebe0c82",
		);
		expect(sha256("Inter-SemiBold.ttf")).toBe(
			"78a843fade9d4612a5567302fb595b56976eb5fcebf4fea5a5912d638bafcde3",
		);
	});

	test("ships with the SIL Open Font License beside it", () => {
		const license = readFileSync(new URL("OFL.txt", fontsFolder), "utf8");
		expect(license).toMatch(/^Copyright \(c\) 2016 The Inter Project Authors/);
		expect(license).toContain("SIL OPEN FONT LICENSE Version 1.1");
	});
});
