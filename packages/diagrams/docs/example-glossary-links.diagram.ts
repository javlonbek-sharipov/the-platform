import { domain } from "@the-platform/diagrams";

/** The Diagrams context leads readers to the language its glossary defines. */
export default domain({ title: "Diagrams language" }, (d) => {
	d.node({
		id: "diagrams",
		kind: "context",
		title: "Diagrams",
		links: [{ term: "Diagram" }, { term: "Atlas" }, { term: "Link" }],
	});
});
