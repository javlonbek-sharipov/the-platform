# Example system

A shopper uses the shop's web app, which calls the shop's gateway, which calls the Orders API. The Orders API stores each order in its database and announces it on the order events queue. The Payments API listens to the queue's `order-placed` topic, so its Edge leaves from that Row. The other Rows show how many replicas each service and the database run, and where the database is.

The Payments API charges each order through a payment provider, which we don't run, so the Diagram draws it External, with a dashed outline. The Payments API's status is degraded, shown by the triangle in its header.

Everything from the gateway to the Payments API runs in the EU West region, drawn as a box around them. The Orders API, its database and its queue run in one zone of that region, drawn as a dashed box inside it.

A few Edges carry a label that says what passes over them. Below a label, an Edge can show its Technology, such as the gateway's gRPC call to the Orders API, and its rate, such as the 30 orders a second that the web app places.

Calls are drawn solid and messages dashed, and chevrons along each Edge show which way it runs. Where the Orders API's call and its message part, a dot marks the split. The Payments API also checks each payment with a fraud check service in US East. That call crosses between regions, which costs latency and egress, so it's drawn in the warning color, with a badge in its middle.

![Example system](./example-system.diagram.svg)

The Diagram is written in [`example-system.diagram.ts`](./example-system.diagram.ts). After editing it, run `pnpm exec diagrams render`, and commit the module and its SVG together. `diagrams lint`, which the pre-commit hook runs, fails when the SVG no longer matches its source.
