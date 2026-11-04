/**
 * The layered layout of one level: the Diagram itself, or, once Groups come,
 * one Group. It puts the level's members in ranks along the direction, orders
 * each rank across it to reduce crossings, and gives every member its
 * coordinates.
 *
 * It works in one frame for both directions: the rank axis is x and the
 * order axis is y, as for `right`. The caller turns the result for `down`.
 */

/** A member of the level, such as a Node, measured in the layout's frame. */
export interface Member {
	/** Its size along the rank axis. */
	depth: number;
	/** Across the rank: from its leading side to its Ports' line, and from that line to its trailing side. */
	before: number;
	after: number;
}

/** A connection from one member to another, by their indices in declaration order. */
export interface Connection {
	from: number;
	to: number;
}

export interface Spacing {
	/** How far apart two members of one rank stay, at least. */
	clearance: number;
	/** How far apart two ranks are. */
	rankGap: number;
}

/** Where a member goes, in the layout's frame. */
export interface Placement {
	/** Its rank's line, which the member is centered on. */
	x: number;
	/** Its Ports' line, across the rank. */
	y: number;
}

/** A fixed number of sweeps, so that the result never depends on timing. */
const sweeps = 8;

export function arrange(
	members: Member[],
	connections: Connection[],
	spacing: Spacing,
): Placement[] {
	const { rank, next } = rankMembers(members.length, connections);
	const ranks = orderRanks(rank, next);
	return place(members, ranks, spacing);
}

/**
 * Each member's rank is the length of the longest path that reaches it. A
 * depth-first search from the members in declaration order leaves out every
 * connection that leads back into its current path, which closes a cycle.
 * Self-loops never count, and parallel connections count once.
 *
 * Returns each member's rank, and the members that each one's kept
 * connections lead to.
 */
function rankMembers(count: number, connections: Connection[]) {
	const targets: number[][] = Array.from({ length: count }, () => []);
	for (const { from, to } of connections) {
		if (from !== to) {
			targets[from]?.push(to);
		}
	}

	const unvisited = 0;
	const onPath = 1;
	const finished = 2;
	const state: number[] = new Array(count).fill(unvisited);
	const finishOrder: number[] = [];
	const next: Set<number>[] = Array.from({ length: count }, () => new Set());
	for (let root = 0; root < count; root += 1) {
		if (state[root] !== unvisited) {
			continue;
		}
		state[root] = onPath;
		const path = [{ member: root, edge: 0 }];
		for (let top = path.at(-1); top !== undefined; top = path.at(-1)) {
			const target = targets[top.member]?.[top.edge];
			top.edge += 1;
			if (target === undefined) {
				state[top.member] = finished;
				finishOrder.push(top.member);
				path.pop();
			} else if (state[target] !== onPath) {
				next[top.member]?.add(target);
				if (state[target] === unvisited) {
					state[target] = onPath;
					path.push({ member: target, edge: 0 });
				}
			}
		}
	}

	// Reverse finishing order is a topological order of the connections kept.
	const rank: number[] = new Array(count).fill(0);
	for (const member of finishOrder.reverse()) {
		for (const target of next[member] ?? []) {
			rank[target] = Math.max(rank[target] ?? 0, (rank[member] ?? 0) + 1);
		}
	}
	return { rank, next: next.map((targets) => [...targets]) };
}

/**
 * The members of each rank, in order across it. Each rank starts in
 * declaration order. Then the ranks are swept forward and backward a fixed
 * number of times: each sweep sorts each rank by the average position of its
 * neighbors in the rank placed just before, and keeps the current order on
 * ties. The order with the fewest crossings wins, and on a tie the earlier
 * one does.
 */
function orderRanks(rank: number[], next: number[][]): number[][] {
	const ranks: number[][] = Array.from({ length: Math.max(-1, ...rank) + 1 }, () => []);
	rank.forEach((index, member) => {
		ranks[index]?.push(member);
	});
	const upper: number[][] = rank.map(() => []);
	const lower: number[][] = rank.map(() => []);
	next.forEach((targets, member) => {
		for (const target of targets) {
			if (rank[target] === (rank[member] ?? 0) + 1) {
				lower[member]?.push(target);
				upper[target]?.push(member);
			}
		}
	});

	let best = ranks.map((members) => [...members]);
	let fewest = crossings(ranks, lower);
	for (let sweep = 0; sweep < sweeps && fewest > 0; sweep += 1) {
		const forward = sweep % 2 === 0;
		for (let step = 1; step < ranks.length; step += 1) {
			const index = forward ? step : ranks.length - 1 - step;
			const before = ranks[forward ? index - 1 : index + 1] ?? [];
			ranks[index] = sortByNeighbors(ranks[index] ?? [], forward ? upper : lower, before);
		}
		const count = crossings(ranks, lower);
		if (count < fewest) {
			best = ranks.map((members) => [...members]);
			fewest = count;
		}
	}
	return best;
}

/**
 * Sorts a rank by the average position of each member's neighbors in the
 * rank before it. Ties keep the current order, and a member with no
 * neighbors there keeps its place.
 */
function sortByNeighbors(members: number[], neighbors: number[][], before: number[]): number[] {
	const position = new Map(before.map((member, index) => [member, index]));
	const averages = new Map<number, number>();
	for (const member of members) {
		const around = neighbors[member] ?? [];
		if (around.length > 0) {
			const sum = around.reduce((total, neighbor) => total + (position.get(neighbor) ?? 0), 0);
			averages.set(member, sum / around.length);
		}
	}
	const sorted = members
		.filter((member) => averages.has(member))
		.sort((a, b) => (averages.get(a) ?? 0) - (averages.get(b) ?? 0));
	let taken = 0;
	return members.map((member) => {
		if (!averages.has(member)) {
			return member;
		}
		taken += 1;
		return sorted[taken - 1] ?? member;
	});
}

/** How many pairs of connections between neighboring ranks cross. */
function crossings(ranks: number[][], lower: number[][]): number {
	let count = 0;
	for (let index = 0; index + 1 < ranks.length; index += 1) {
		const position = new Map((ranks[index + 1] ?? []).map((member, at) => [member, at]));
		const segments = (ranks[index] ?? []).flatMap((member, at) =>
			(lower[member] ?? []).map((target) => [at, position.get(target) ?? 0] as const),
		);
		for (const [first, [a, b]] of segments.entries()) {
			for (const [c, d] of segments.slice(first + 1)) {
				if ((a - c) * (b - d) < 0) {
					count += 1;
				}
			}
		}
	}
	return count;
}

/**
 * Coordinates: each rank becomes a line along the rank axis, and its members
 * are stacked across it in order, the clearance apart.
 */
function place(members: Member[], ranks: number[][], spacing: Spacing): Placement[] {
	const placements: Placement[] = members.map(() => ({ x: 0, y: 0 }));
	let line = 0;
	let previousDepth = 0;
	for (const [index, rank] of ranks.entries()) {
		const depth = Math.max(...rank.map((member) => members[member]?.depth ?? 0));
		line = index === 0 ? depth / 2 : line + previousDepth / 2 + spacing.rankGap + depth / 2;
		previousDepth = depth;
		let edge = 0;
		for (const member of rank) {
			const { before = 0, after = 0 } = members[member] ?? {};
			placements[member] = { x: line, y: edge + before };
			edge += before + after + spacing.clearance;
		}
	}
	return placements;
}
