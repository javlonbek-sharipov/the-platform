/**
 * The route search (spec: Edge routing, step 3): A* over states of (vertex,
 * heading) on the routing grid. A step costs its length, plus a fixed cost
 * when it bends, and a small cost for each Group border it crosses. Where
 * routes negotiate for room (step 5), it also costs each segment's lasting
 * history, and a penalty for a segment that's already full. U-turns aren't
 * allowed, and the heuristic is the Manhattan distance to the goal.
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

/** A state the search may start from, and what starting there costs. */
export interface SearchStart extends SearchEnd {
	cost: number;
}

export interface SearchCosts {
	bend: number;
	/** The cost of crossing one Group border. */
	crossing: number;
	/** The most states the search may visit before it gives up. */
	budget: number;
	congestion?: Congestion;
}

/**
 * How crowded the grid is: each segment's history, by segment, the one east
 * of vertex `v` at `2 * v` and the one south of it at `2 * v + 1`, and the
 * lanes in each corridor, which its parallel segments share.
 */
export interface Congestion {
	/** A lasting cost on each segment, raised each time it ends a pass over capacity. */
	history: Float64Array;
	/** The corridor of each segment. */
	corridorOf: Uint32Array;
	/** How many lanes use each corridor so far. */
	usage: Uint16Array;
	/** How many lanes fit through each corridor. */
	capacity: Uint16Array;
	/** The corridors that the route's own lane group uses already, marked with `stamp`: it adds no lane there. */
	own: Uint32Array;
	stamp: number;
	/** What stepping onto a segment that's already full costs. */
	full: number;
}

/**
 * The cheapest path from any of the `starts` to `goal`, as its vertices in
 * order, or undefined if there's none within the budget.
 */
export type Search = (
	starts: SearchStart[],
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
	const vertices = columns * grid.ys.length;
	const states = 4 * vertices;
	/** Each vertex's coordinates, worked out once, since the search reads them at every step. */
	const vertexX = new Float64Array(vertices);
	const vertexY = new Float64Array(vertices);
	for (let vertex = 0; vertex < vertices; vertex += 1) {
		vertexX[vertex] = grid.xs[vertex % columns] ?? 0;
		vertexY[vertex] = grid.ys[(vertex - (vertex % columns)) / columns] ?? 0;
	}
	const xOf = (vertex: number) => vertexX[vertex] ?? 0;
	const yOf = (vertex: number) => vertexY[vertex] ?? 0;
	/** The cost of the cheapest known path to each state, valid where `reached` holds this search. */
	const best = new Float64Array(states);
	/** The state before each state on that path, or -1 at the start. */
	const parents = new Int32Array(states);
	/** Which search last reached each state, so that no search has to clear the others' memory. */
	const reached = new Uint32Array(states);
	let current = 0;

	return (starts, goal, costs) => {
		const goalHeading = headings.indexOf(goal.heading);
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

		// A start at the goal is a route already, unless it leaves the opposite
		// way, and then the search goes on from it.
		for (const start of starts) {
			const heading = headings.indexOf(start.heading);
			const arrival =
				start.vertex === goal.vertex && heading !== goalHeading && heading !== (goalHeading + 2) % 4
					? costs.bend
					: 0;
			reach(4 * start.vertex + heading, start.cost + arrival, -1);
		}
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
			if (vertex === goal.vertex && (parents[state] !== -1 || heading !== (goalHeading + 2) % 4)) {
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
					(next === heading ? 0 : costs.bend) +
					costs.crossing * crossingsOf(grid, vertex, next) +
					(costs.congestion === undefined ? 0 : crowding(costs.congestion, vertex, neighbor));
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

/** The index of the segment between two neighboring vertices. */
export function segmentBetween(a: number, b: number): number {
	const low = Math.min(a, b);
	return 2 * low + (Math.abs(a - b) === 1 ? 0 : 1);
}

/** What a step from one vertex to its neighbor costs for crowding. */
function crowding(congestion: Congestion, from: number, to: number): number {
	const segment = segmentBetween(from, to);
	const corridor = congestion.corridorOf[segment] ?? 0;
	const others =
		(congestion.usage[corridor] ?? 0) - (congestion.own[corridor] === congestion.stamp ? 1 : 0);
	return (
		(congestion.history[segment] ?? 0) +
		(others >= (congestion.capacity[corridor] ?? 0) ? congestion.full : 0)
	);
}

function pathTo(end: number, parents: Int32Array): number[] {
	const vertices: number[] = [];
	for (let state = end; state >= 0; state = parents[state] ?? -1) {
		vertices.push((state - (state % 4)) / 4);
	}
	return vertices.reverse();
}

/** How many Group borders the segment from a vertex in a heading's index crosses. */
function crossingsOf(grid: Grid, vertex: number, heading: number): number {
	const columns = grid.xs.length;
	switch (heading) {
		case 0:
			return grid.crossEast[vertex] ?? 0;
		case 1:
			return grid.crossSouth[vertex] ?? 0;
		case 2:
			return grid.crossEast[vertex - 1] ?? 0;
		default:
			return grid.crossSouth[vertex - columns] ?? 0;
	}
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
 * Each entry lives at one index of four parallel typed arrays, which grow as
 * the queue does.
 */
class Queue {
	#states = new Int32Array(1024);
	#costs = new Float64Array(1024);
	#estimates = new Float64Array(1024);
	#orders = new Float64Array(1024);
	#size = 0;
	#queued = 0;

	push(state: number, cost: number, estimate: number): void {
		if (this.#size === this.#states.length) {
			this.#grow();
		}
		let index = this.#size;
		this.#size += 1;
		this.#states[index] = state;
		this.#costs[index] = cost;
		this.#estimates[index] = estimate;
		this.#orders[index] = this.#queued++;
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
		const size = this.#size;
		if (size === 0) {
			return undefined;
		}
		const top = { state: this.#states[0] ?? 0, cost: this.#costs[0] ?? 0 };
		this.#swap(0, size - 1);
		this.#size -= 1;
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

	/** Doubles the room for queued states, keeping those queued. */
	#grow(): void {
		const room = 2 * this.#states.length;
		const states = new Int32Array(room);
		const costs = new Float64Array(room);
		const estimates = new Float64Array(room);
		const orders = new Float64Array(room);
		states.set(this.#states);
		costs.set(this.#costs);
		estimates.set(this.#estimates);
		orders.set(this.#orders);
		this.#states = states;
		this.#costs = costs;
		this.#estimates = estimates;
		this.#orders = orders;
	}
}

function swap(list: Int32Array | Float64Array, a: number, b: number): void {
	const value = list[a] ?? 0;
	list[a] = list[b] ?? 0;
	list[b] = value;
}
