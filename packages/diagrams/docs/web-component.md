# Embedding an interactive Diagram

Import `@the-platform/diagrams/web-component` to define `<platform-diagram>`. Give it an engine-made SVG as an inline child, or use its `src` attribute. The inline drawing also shows before JavaScript loads. A later inline SVG replaces the drawing, which lets a host update it without a framework.

The SVG's metadata supplies the Node and Group details. Clicking a Node or Group label, or activating its accessible list button, opens a nonmodal details dialog. Enter opens the selected Node. Close restores focus to the invoking list button or the drawing. Escape also clears ordinary selection when no explicit highlight is active. During explicit emphasis, including Walkthrough playback, it preserves both selection and the highlight.

The host can supply these JavaScript properties before or after showing the SVG:

| Property     | Type                       | Behavior                                                                                                                                                      |
| ------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `atlasIndex` | `AtlasIndex \| undefined`  | Adds other Diagrams, drill-down destinations and glossary definitions. Reassign to refresh an updated index, including open details and a hovered definition. |
| `resolveUrl` | `UrlResolver \| undefined` | Converts a navigation target to a URL on activation. Returning `undefined` leaves the URL out of the event.                                                   |
| `motion`     | `"auto" \| "off"`          | Reflects the `motion` attribute. `auto` respects reduced motion.                                                                                              |

`AtlasIndex`, `GlossaryTerm`, `Link` and the pure `termOf` helper are browser-safe exports from `@the-platform/diagrams`. Building the index belongs to Node: `openAtlas` and `indexAtlas` are exported from `@the-platform/diagrams/atlas`. Pass their serialized index to the browser; never import that Node entry point into a page.

## Navigation events

`NavigationTarget`, `NavigationSource`, `NavigationDetail`, `DiagramNavigationEvent` and `UrlResolver` are exported from `@the-platform/diagrams/web-component`:

```ts
// NavigationTarget is a model Link or a Diagram id string.
type UrlResolver = (target: NavigationTarget) => string | undefined;

interface NavigationDetail {
	readonly target: NavigationTarget;
	readonly source: {
		readonly diagram?: string;
		readonly kind: "node" | "group";
		readonly id: string;
	};
	readonly url?: string;
}
```

Each Link, other-Diagram or drill-down button raises `diagram-navigate` on the component, with this detail. It bubbles and is composed, so a host may listen on a parent element. The event reports an intent, has no default navigation and is not cancelable. The host decides whether to follow a URL, update history, select a destination, or show another drawing.

| Action                      | `target`                                   |
| --------------------------- | ------------------------------------------ |
| Link to an Atlas id         | `{ id, label? }`                           |
| Link to a document section  | `{ doc, section?, label? }`                |
| Link to a glossary term     | `{ term, context?, label? }`               |
| Other Diagram or drill-down | Diagram id string, such as `"docs/orders"` |

A Link retains its authored fields. For an implicit term Link, the component fills in `context` from the owning id's Atlas metadata, or from the SVG model's namespace. Thus a borrowed `ordering/order-placed` event reports Ordering's context even on Billing's Diagram. Explicit contexts win. If no context can be determined, the Link stays as authored.

`source.diagram` is the current SVG model's Atlas id when present; `source.id` names the Node or Group whose details offered the action. `url` is included only when the current resolver returns one. The component invents no URL or document anchor. A host can resolve a term with `termOf(index.terms, link)` and use its `glossary` and `anchor` to build a destination.

Other Diagrams are listed in index order, excluding the current Diagram. Node drill-down offers Diagrams that draw its id as a Group. A borrowed event also offers the Diagrams that both draw the event and draw its owning context as a Group. Missing index metadata leaves the SVG's facts and authored Links available.

Descriptions and glossary definitions display as text, preserving Markdown and line breaks. Resolved definitions appear on Node hover and in details for keyboard readers. They are never interpreted as HTML.

## Selection and updates

`selection`, `selectedNode`, `selectNode(id | undefined)` and `setHighlight(targets | undefined)` retain their existing selection and highlight behavior. `selectNode` selects without opening details or moving keyboard focus. `diagram-select` bubbles and is composed, with `{ kind: "node" | "edge", id }` as detail, or `null` when cleared. Selecting the same target again emits no duplicate event.

A replacement SVG of the same Diagram id refreshes an open dialog while its Node or Group still exists. Removal, a different Diagram, or disconnect closes the dialog. Redraw restores dialog focus only if it previously owned focus. List activation returns focus to the rebuilt invoking button by id. A dialog, its listeners and its index subscriptions leave with the SVG that supplied them. Updating the Atlas index keeps a focused destination by target within its list; if it disappears, focus returns to the dialog.

Wheel scrolling and text selection inside details work normally. Drawing keyboard shortcuts leave the dialog's controls to handle their own keys. Key handlers cooperate through `defaultPrevented`. Escape closes details first while preserving playback and its selection; arrows then retain Walkthrough stepping, and its own Escape closes playback and restores the prior host highlight. Neither also moves spatial selection.
