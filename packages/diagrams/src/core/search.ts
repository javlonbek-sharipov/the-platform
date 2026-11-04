/**
 * The route search (spec: Edge routing, step 3): A* over states of (vertex,
 * heading) on the routing grid. A step costs its length, plus a fixed cost
 * when it bends. U-turns aren't allowed, and the heuristic is the Manhattan
 * distance to the goal.
 */

import type { Grid } from "./grid.ts";

/** Which way a route travels along a grid line. */
export type Heading = "east" | "south" | "west" | "north";

const headings: readonly Heading[] = ["east", "south", "west", "north"];

export const opposite: Record<Heading, Heading> = {
	east: "west",
	south: "north",
	west: "east",
	north: "south",
};

export interface SearchEnd {
	vertex: number;
	/**
	 * At the start, the heading the route leaves in. At the goal, the heading it
	 * travels on in: arriving any other way costs a bend, and arriving the
	 * opposite way isn't allowed.
	 */
	heading: Heading;
}

export interface SearchCosts {
	bend: number;
	/** The most states the search may visit before it gives up. */
	budget: number;
}

/**
 * The cheapest path from `start` to `goal`, as its vertices in order, or
 * undefined if there's none within the budget.
 */
export function search(
	grid: Grid,
	start: SearchEnd,
	goal: SearchEnd,
	costs: SearchCosts,
): number[] | undefined {
	if (start.vertex === goal.vertex && start.heading !== opposite[goal.heading]) {
		return [start.vertex];
	}
	const columns = grid.xs.length;
	const xOf = (vertex: number) => grid.xs[vertex % columns] ?? 0;
	const yOf = (vertex: number) => grid.ys[(vertex - (vertex % columns)) / columns] ?? 0;
	const goalX = xOf(goal.vertex);
	const goalY = yOf(goal.vertex);
	const estimate = (vertex: number) =>
		Math.abs(xOf(vertex) - goalX) + Math.abs(yOf(vertex) - goalY);

	const best = new Map<string, number>();
	const parents = new Map<string, State>();
	const queue = new Queue();
	const reach = (state: State, cost: number, parent?: State) => {
		const key = keyOf(state);
		if (cost >= (best.get(key) ?? Number.POSITIVE_INFINITY)) {
			return;
		}
		best.set(key, cost);
		if (parent !== undefined) {
			parents.set(key, parent);
		}
		queue.push({ state, cost, estimate: cost + estimate(state.vertex) });
	};

	reach({ vertex: start.vertex, heading: start.heading }, 0);
	let visits = 0;
	for (let entry = queue.pop(); entry !== undefined; entry = queue.pop()) {
		const { state, cost } = entry;
		if (cost > (best.get(keyOf(state)) ?? Number.POSITIVE_INFINITY)) {
			continue;
		}
		if (visits === costs.budget) {
			return undefined;
		}
		visits += 1;
		if (state.vertex === goal.vertex && parents.has(keyOf(state))) {
			return pathTo(state, parents);
		}
		for (const heading of headings) {
			if (heading === opposite[state.heading]) {
				continue;
			}
			const next = neighbor(grid, state.vertex, heading);
			if (next === undefined) {
				continue;
			}
			let nextCost =
				cost +
				Math.abs(xOf(next) - xOf(state.vertex)) +
				Math.abs(yOf(next) - yOf(state.vertex)) +
				(heading === state.heading ? 0 : costs.bend);
			if (next === goal.vertex) {
				if (heading === opposite[goal.heading]) {
					continue;
				}
				nextCost += heading === goal.heading ? 0 : costs.bend;
			}
			reach({ vertex: next, heading }, nextCost, state);
		}
	}
	return undefined;
}

interface State {
	vertex: number;
	heading: Heading;
}

function keyOf({ vertex, heading }: State): string {
	return `${vertex} ${heading}`;
}

function pathTo(end: State, parents: Map<string, State>): number[] {
	const vertices: number[] = [];
	for (let state: State | undefined = end; state !== undefined; state = parents.get(keyOf(state))) {
		vertices.push(state.vertex);
	}
	return vertices.reverse();
}

function neighbor(grid: Grid, vertex: number, heading: Heading): number | undefined {
	const columns = grid.xs.length;
	switch (heading) {
		case "east":
			return grid.openEast[vertex] === 1 ? vertex + 1 : undefined;
		case "west":
			return vertex % columns > 0 && grid.openEast[vertex - 1] === 1 ? vertex - 1 : undefined;
		case "south":
			return grid.openSouth[vertex] === 1 ? vertex + columns : undefined;
		case "north":
			return vertex >= columns && grid.openSouth[vertex - columns] === 1
				? vertex - columns
				: undefined;
	}
}

interface Entry {
	state: State;
	/** The cost of the cheapest known path to the state. */
	cost: number;
	/** That cost, plus the heuristic's estimate of the rest. */
	estimate: number;
	/** When the entry was queued, which settles the last ties. */
	order: number;
}

/**
 * A binary heap of entries, cheapest estimate first. Ties go to the costlier
 * path so far, which is the one that has come further. So, among routes that
 * cost the same, the search keeps going straight from its start for as long
 * as it can, and finds the one whose bends come nearest its goal. Last ties go
 * to the entry queued first, so the search is deterministic.
 */
class Queue {
	#entries: Entry[] = [];
	#queued = 0;

	push(entry: Omit<Entry, "order">): void {
		const entries = this.#entries;
		entries.push({ ...entry, order: this.#queued++ });
		for (let index = entries.length - 1; index > 0; ) {
			const parent = Math.floor((index - 1) / 2);
			if (!this.#before(index, parent)) {
				break;
			}
			this.#swap(index, parent);
			index = parent;
		}
	}

	pop(): Entry | undefined {
		const entries = this.#entries;
		const first = entries[0];
		const last = entries.pop();
		if (first === undefined || last === undefined || entries.length === 0) {
			return first;
		}
		entries[0] = last;
		for (let index = 0; ; ) {
			const left = 2 * index + 1;
			const right = left + 1;
			let smallest = index;
			if (left < entries.length && this.#before(left, smallest)) {
				smallest = left;
			}
			if (right < entries.length && this.#before(right, smallest)) {
				smallest = right;
			}
			if (smallest === index) {
				return first;
			}
			this.#swap(index, smallest);
			index = smallest;
		}
	}

	#before(a: number, b: number): boolean {
		const x = this.#entries[a];
		const y = this.#entries[b];
		if (x === undefined || y === undefined) {
			return false;
		}
		if (x.estimate !== y.estimate) {
			return x.estimate < y.estimate;
		}
		if (x.cost !== y.cost) {
			return x.cost > y.cost;
		}
		return x.order < y.order;
	}

	#swap(a: number, b: number): void {
		const entries = this.#entries;
		const x = entries[a];
		const y = entries[b];
		if (x !== undefined && y !== undefined) {
			entries[a] = y;
			entries[b] = x;
		}
	}
}
