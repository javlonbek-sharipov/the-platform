# Diagrams

The diagram engine of the-platform. It draws architecture, domain, data-model, and plan Diagrams from text, so that people can understand how the-platform is designed.

## Language

### Diagrams

**Diagram**:
One drawing, written in one Notation.
_Avoid_: board, canvas, chart

**Notation**:
The rules for one family of Diagrams, such as architecture, domain, data model, or plan: which Kinds exist and how each one looks.
_Avoid_: diagram type, profile, preset

**Node**:
One thing drawn on a Diagram, such as a service, an aggregate, or a task.
_Avoid_: card, box, element, component

**Row**:
A name and a value shown on a Node, such as `replicas: 3`. A data-model Node's fields are its Rows.

**Port**:
A point on a Node where an Edge attaches. A data-model Node has a pair of Ports for each field.

**Edge**:
A connection from one Port to another, with its own identity: two Edges may join the same pair of Ports, and both Ports may belong to one Node. An Edge never ends at a Group.
_Avoid_: link, connector, wire, relation

**Group**:
A labeled box drawn around Nodes and other Groups, such as a zone, a region, or a bounded context. Groups nest, and each Node belongs to at most one Group.
_Avoid_: container, cluster, boundary

**Kind**:
The type of a Node, Group, or Edge within its Notation, such as `service`, `context`, or `message`. It alone decides how the thing looks.
_Avoid_: category, type

**Id**:
The name of one thing across an Atlas: it has one Kind, and each Diagram draws it as either a Node or a Group. Inside a bounded context, ids are local, so `order` in Billing is `billing/order`.

**Atlas**:
The set of Diagrams that share ids, such as every Diagram in one repo.
_Avoid_: workspace, project, model, catalog

**Link**:
A "see also" pointer from a Node to another id, a glossary term, an ADR, or a section of a spec. Unlike an Edge, a Link isn't drawn on the Diagram.
_Avoid_: reference, see-also

### Walkthroughs

**Walkthrough**:
An ordered list of Steps on one Diagram, played one at a time to show how something happens.
_Avoid_: scenario, story, trace, tour, flow

**Step**:
One moment in a Walkthrough: one or more Edges, or one Node, highlighted together, with an optional note. A Step may run an Edge backwards to show a reply.

### Architecture

**Technology**:
The product, language, or protocol a Node or Edge is built with, such as Postgres, Go, or gRPC.
_Avoid_: stack, tech, platform

**External**:
A Node that stands for something we don't own or run, such as a third-party API.
_Avoid_: third-party, vendor

### Domain

**Context map**:
A domain Diagram whose Nodes are bounded contexts and whose Edges show how those contexts relate.

**Aggregate diagram**:
A domain Diagram of one bounded context's aggregates and domain events, each drawn as a Node.
_Avoid_: model diagram, domain model, class diagram
