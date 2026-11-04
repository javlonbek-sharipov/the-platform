/**
 * The route search (spec: Edge routing, step 3): A* over states of (vertex,
 * heading) on the routing grid. A step costs its length, plus a fixed cost
 * when it bends. U-turns aren't allowed, and the heuristic is the Manhattan
 * distance to the goal.
 */

import type { Grid } from "./grid.ts";

/** Which way a route travels along a grid line. */
export type Heading = "east" | "south" | "west" | "north";

/** The headings in the order the search tries them, which settles its last ties. */
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
export type Search = (
	start: SearchEnd,
	goal: SearchEnd,
	costs: SearchCosts,
) => number[] | undefined;

/**
 * A search over one grid. Its working memory lasts from one search to the
 * next, so that routing many Edges allocates it only once.
 *
 * A state is a number: its vertex times four, plus the index of its heading.
 */
export function searchOn(grid: Grid): Search {
	const columns = grid.xs.length;
	const states = 4 * columns * grid.ys.length;
	const xOf = (vertex: number) => grid.xs[vertex % columns] ?? 0;
	const yOf = (vertex: number) => grid.ys[(vertex - (vertex % columns)) / columns] ?? 0;
	/** The cost of the cheapest known path to each state, valid where `reached` holds this search. */
	const best = new Float64Array(states);
	/** The state before each state on that path, or -1 at the start. */
	const parents = new Int32Array(states);
	/** Which search last reached each state, so that no search has to clear the others' memory. */
	const reached = new Uint32Array(states);
	let current = 0;

	return (start, goal, costs) => {
		const startHeading = headings.indexOf(start.heading);
		const goalHeading = headings.indexOf(goal.heading);
		if (start.vertex === goal.vertex && startHeading !== (goalHeading + 2) % 4) {
			return [start.vertex];
		}
		current += 1;
		const goalX = xOf(goal.vertex);
		const goalY = yOf(goal.vertex);
		const queue = new Queue();
		const reach = (state: number, cost: number, parent: number) => {
			if (reached[state] === current && cost >= (best[state] ?? 0)) {
				return;
			}
			reached[state] = current;
			best[state] = cost;
			parents[state] = parent;
			const vertex = (state - (state % 4)) / 4;
			queue.push(state, cost, cost + Math.abs(xOf(vertex) - goalX) + Math.abs(yOf(vertex) - goalY));
		};

		const first = 4 * start.vertex + startHeading;
		reach(first, 0, -1);
		let visits = 0;
		for (let entry = queue.pop(); entry !== undefined; entry = queue.pop()) {
			const { state, cost } = entry;
			if (cost > (best[state] ?? 0)) {
				continue;
			}
			if (visits === costs.budget) {
				return undefined;
			}
			visits += 1;
			const heading = state % 4;
			const vertex = (state - heading) / 4;
			if (vertex === goal.vertex && state !== first) {
				return pathTo(state, parents);
			}
			for (let next = 0; next < 4; next++) {
				if (next === (heading + 2) % 4) {
					continue;
				}
				const neighbor = neighborOf(grid, vertex, next);
				if (neighbor === undefined) {
					continue;
				}
				let nextCost =
					cost +
					Math.abs(xOf(neighbor) - xOf(vertex)) +
					Math.abs(yOf(neighbor) - yOf(vertex)) +
					(next === heading ? 0 : costs.bend);
				if (neighbor === goal.vertex) {
					if (next === (goalHeading + 2) % 4) {
						continue;
					}
					nextCost += next === goalHeading ? 0 : costs.bend;
				}
				reach(4 * neighbor + next, nextCost, state);
			}
		}
		return undefined;
	};
}

function pathTo(end: number, parents: Int32Array): number[] {
	const vertices: number[] = [];
	for (let state = end; state >= 0; state = parents[state] ?? -1) {
		vertices.push((state - (state % 4)) / 4);
	}
	return vertices.reverse();
}

/** The neighbor of a vertex in a heading's index, if the segment to it is open. */
function neighborOf(grid: Grid, vertex: number, heading: number): number | undefined {
	const columns = grid.xs.length;
	switch (heading) {
		case 0:
			return grid.openEast[vertex] === 1 ? vertex + 1 : undefined;
		case 1:
			return grid.openSouth[vertex] === 1 ? vertex + columns : undefined;
		case 2:
			return vertex % columns > 0 && grid.openEast[vertex - 1] === 1 ? vertex - 1 : undefined;
		default:
			return vertex >= columns && grid.openSouth[vertex - columns] === 1
				? vertex - columns
				: undefined;
	}
}

/**
 * A binary heap of queued states, cheapest estimate first. Ties go to the
 * costlier path so far, which is the one that has come further. So, among
 * routes that cost the same, the search keeps going straight from its start
 * for as long as it can, and finds the one whose bends come nearest its goal.
 * Last ties go to the state queued first, so the search is deterministic.
 *
 * Each entry lives at one index of four parallel lists.
 */
class Queue {
	#states: number[] = [];
	#costs: number[] = [];
	#estimates: number[] = [];
	#orders: number[] = [];
	#queued = 0;

	push(state: number, cost: number, estimate: number): void {
		let index = this.#states.length;
		this.#states.push(state);
		this.#costs.push(cost);
		this.#estimates.push(estimate);
		this.#orders.push(this.#queued++);
		while (index > 0) {
			const parent = Math.floor((index - 1) / 2);
			if (!this.#before(index, parent)) {
				break;
			}
			this.#swap(index, parent);
			index = parent;
		}
	}

	pop(): { state: number; cost: number } | undefined {
		const size = this.#states.length;
		if (size === 0) {
			return undefined;
		}
		const top = { state: this.#states[0] ?? 0, cost: this.#costs[0] ?? 0 };
		this.#swap(0, size - 1);
		this.#states.pop();
		this.#costs.pop();
		this.#estimates.pop();
		this.#orders.pop();
		for (let index = 0; ; ) {
			const left = 2 * index + 1;
			const right = left + 1;
			let first = index;
			if (left < size - 1 && this.#before(left, first)) {
				first = left;
			}
			if (right < size - 1 && this.#before(right, first)) {
				first = right;
			}
			if (first === index) {
				return top;
			}
			this.#swap(index, first);
			index = first;
		}
	}

	#before(a: number, b: number): boolean {
		const estimateA = this.#estimates[a] ?? 0;
		const estimateB = this.#estimates[b] ?? 0;
		if (estimateA !== estimateB) {
			return estimateA < estimateB;
		}
		const costA = this.#costs[a] ?? 0;
		const costB = this.#costs[b] ?? 0;
		if (costA !== costB) {
			return costA > costB;
		}
		return (this.#orders[a] ?? 0) < (this.#orders[b] ?? 0);
	}

	#swap(a: number, b: number): void {
		swap(this.#states, a, b);
		swap(this.#costs, a, b);
		swap(this.#estimates, a, b);
		swap(this.#orders, a, b);
	}
}

function swap(list: number[], a: number, b: number): void {
	const value = list[a] ?? 0;
	list[a] = list[b] ?? 0;
	list[b] = value;
}
