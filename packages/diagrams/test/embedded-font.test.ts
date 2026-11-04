import { describe, expect, test } from "vitest";
import { architecture, type FontRequest, render } from "../src/index.ts";
import { bundledFont, characterMap } from "./support/truetype.ts";

const shop = architecture({ title: "Shop" }, (d) => {
	const web = d.node({ id: "web-app", kind: "client", title: "Web app" });
	const api = d.node({ id: "shop-api", kind: "service", title: "Shop API" });
	const db = d.node({ id: "shop-db", kind: "database", title: "Shop database" });
	const events = d.node({ id: "shop-events", kind: "queue", title: "Shop events" });
	d.edge(web, api, { kind: "call" });
	d.edge(api, db, { kind: "call" });
	d.edge(api, events, { kind: "message" });
});

const interSemiBold = characterMap(bundledFont("Inter-SemiBold.ttf"));

/** Renders a Diagram, and records what the core asks its font data function for. */
function renderRecording(diagram: unknown): { svg: string; requests: FontRequest[] } {
	const requests: FontRequest[] = [];
	const { svg } = render(diagram, {
		fontData: (request) => {
			requests.push(request);
			return new Uint8Array([1, 2, 3, 250]);
		},
	});
	return { svg: svg ?? "", requests };
}

describe("the font data an SVG embeds", () => {
	test("comes from the caller's function, which the core asks for the characters each weight draws", () => {
		const { svg, requests } = renderRecording(shop);

		// Every character of "Web app", "Shop API", "Shop database" and "Shop events", once, in order.
		expect(requests).toEqual([{ weight: "semibold", characters: " AIPSWabdehnopstv" }]);
		expect(svg).toContain("data:font/ttf;base64,AQID+g==");
	});

	test("holds only the characters that are drawn, and that the font has", () => {
		const offices = architecture({ title: "Offices" }, (d) => {
			d.node({ id: "tokyo", kind: "service", title: "Tokyo 東京" });
			d.node({ id: "translations", kind: "service", title: "Internationalization service" });
		});
		const { requests } = renderRecording(offices);
		const { scene } = render(offices);

		const drawn = new Set((scene?.nodes ?? []).flatMap((node) => [...node.title.text]));
		expect(drawn).toContain("…");
		const expected = [...drawn]
			.filter((character) => interSemiBold.has(character.codePointAt(0) ?? 0))
			.sort((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0))
			.join("");
		expect(expected).not.toMatch(/[東京v]/);
		expect(requests).toEqual([{ weight: "semibold", characters: expected }]);
	});

	test("isn't asked for when nothing is drawn, or when the caller passes no function", () => {
		const { svg, requests } = renderRecording(architecture({ title: "Empty" }, () => {}));
		expect(requests).toEqual([]);
		expect(svg).not.toContain("@font-face");
		expect(render(shop).svg).not.toContain("@font-face");
	});
});
