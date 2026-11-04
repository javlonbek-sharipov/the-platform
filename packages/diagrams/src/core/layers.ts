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
	/** The step of the grid that every Ports' line and rank line snaps to. */
	grid: number;
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
	const { rank, kept } = rankMembers(members.length, connections);
	const vertices = layered(members, rank, kept);
	const ranks = orderRanks(vertices);
	const across = alignAcross(vertices, ranks, spacing);
	const along = ranksAlong(vertices, ranks, spacing);
	const top = Math.min(...members.map((member, index) => (across[index] ?? 0) - member.before));
	const shift = Math.floor(top / spacing.grid) * spacing.grid;
	return members.map((_, index) => ({ x: along[index] ?? 0, y: (across[index] ?? 0) - shift }));
}

/** The first line of the grid at or after a position. */
function snap(position: number, grid: number): number {
	return Math.ceil(position / grid) * grid;
}

/**
 * Each member's rank is the length of the longest path that reaches it. A
 * depth-first search from the members in declaration order leaves out every
 * connection that leads back into its current path, which closes a cycle.
 * Self-loops never count, and parallel connections count once.
 *
 * Returns each member's rank, and the connections kept, in declaration order.
 */
function rankMembers(count: number, connections: Connection[]) {
	const outgoing: number[][] = Array.from({ length: count }, () => []);
	connections.forEach(({ from, to }, index) => {
		if (from !== to) {
			outgoing[from]?.push(index);
		}
	});

	const unvisited = 0;
	const onPath = 1;
	const finished = 2;
	const state: number[] = new Array(count).fill(unvisited);
	const finishOrder: number[] = [];
	const leadsBack = new Set<number>();
	for (let root = 0; root < count; root += 1) {
		if (state[root] !== unvisited) {
			continue;
		}
		state[root] = onPath;
		const path = [{ member: root, next: 0 }];
		for (let top = path.at(-1); top !== undefined; top = path.at(-1)) {
			const index = outgoing[top.member]?.[top.next];
			top.next += 1;
			const target = index === undefined ? undefined : connections[index]?.to;
			if (index === undefined || target === undefined) {
				state[top.member] = finished;
				finishOrder.push(top.member);
				path.pop();
			} else if (state[target] === onPath) {
				leadsBack.add(index);
			} else if (state[target] === unvisited) {
				state[target] = onPath;
				path.push({ member: target, next: 0 });
			}
		}
	}

	const seen = new Set<string>();
	const kept = connections.filter(({ from, to }, index) => {
		const pair = `${from} ${to}`;
		const keep = from !== to && !leadsBack.has(index) && !seen.has(pair);
		seen.add(pair);
		return keep;
	});

	// Reverse finishing order is a topological order of the connections kept.
	const position = new Map(finishOrder.map((member, index) => [member, -index]));
	const byPosition = [...kept].sort(
		(a, b) => (position.get(a.from) ?? 0) - (position.get(b.from) ?? 0),
	);
	const rank: number[] = new Array(count).fill(0);
	for (const { from, to } of byPosition) {
		rank[to] = Math.max(rank[to] ?? 0, (rank[from] ?? 0) + 1);
	}
	return { rank, kept };
}

/** A member, or a placeholder for a connection that passes through a rank. */
interface Vertex {
	rank: number;
	placeholder: boolean;
	/** Placeholders have no size. */
	depth: number;
	before: number;
	after: number;
	/** Its neighbors in the ranks just before and just after its own. */
	upper: number[];
	lower: number[];
}

/**
 * The members, followed by a placeholder in each rank that a connection
 * passes through, so that every connection joins neighboring ranks.
 */
function layered(members: Member[], rank: number[], kept: Connection[]): Vertex[] {
	const vertices: Vertex[] = members.map((member, index) => ({
		...member,
		rank: rank[index] ?? 0,
		placeholder: false,
		upper: [],
		lower: [],
	}));
	const join = (from: number, to: number) => {
		vertices[from]?.lower.push(to);
		vertices[to]?.upper.push(from);
	};
	for (const { from, to } of kept) {
		let previous = from;
		for (let passed = (rank[from] ?? 0) + 1; passed < (rank[to] ?? 0); passed += 1) {
			vertices.push({
				rank: passed,
				placeholder: true,
				depth: 0,
				before: 0,
				after: 0,
				upper: [],
				lower: [],
			});
			join(previous, vertices.length - 1);
			previous = vertices.length - 1;
		}
		join(previous, to);
	}
	return vertices;
}

/**
 * The vertices of each rank, in order across it. Each rank starts with its
 * members in declaration order, followed by its placeholders in the order of
 * their connections. Then the ranks are swept forward and backward a fixed
 * number of times: each sweep sorts each rank by the average position of its
 * neighbors in the rank placed just before, and keeps the current order on
 * ties. The order with the fewest crossings wins, and on a tie the earlier
 * one does.
 */
function orderRanks(vertices: Vertex[]): number[][] {
	const ranks: number[][] = [];
	vertices.forEach((vertex, index) => {
		while (ranks.length <= vertex.rank) {
			ranks.push([]);
		}
		ranks[vertex.rank]?.push(index);
	});
	const upper = vertices.map((vertex) => vertex.upper);
	const lower = vertices.map((vertex) => vertex.lower);

	let best = ranks.map((rank) => [...rank]);
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
			best = ranks.map((rank) => [...rank]);
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

/** Each vertex's rank line, along the rank axis: the ranks follow each other, a gap apart. */
function ranksAlong(vertices: Vertex[], ranks: number[][], spacing: Spacing): number[] {
	const { rankGap, grid } = spacing;
	const along: number[] = vertices.map(() => 0);
	let line = 0;
	let previousDepth = 0;
	for (const [index, rank] of ranks.entries()) {
		const depth = Math.max(...rank.map((vertex) => vertices[vertex]?.depth ?? 0));
		line = snap(index === 0 ? depth / 2 : line + previousDepth / 2 + rankGap + depth / 2, grid);
		previousDepth = depth;
		for (const vertex of rank) {
			along[vertex] = line;
		}
	}
	return along;
}

/**
 * Each vertex's Ports' line, across the ranks. It follows Brandes and Köpf
 * (2001): vertices are aligned into blocks with their median neighbors, in
 * four ways, and each way packs its blocks as tightly as the order and the
 * clearance allow. Rather than balancing the four, the way that leaves the
 * fewest segments bent wins, then the one whose bends are shortest in total,
 * then the earlier one. So a Node lines up with one of its neighbors, where
 * the paper's balancing would often put it between two.
 */
function alignAcross(vertices: Vertex[], ranks: number[][], spacing: Spacing): number[] {
	let best: number[] = [];
	let fewest: [number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
	for (const fromBelow of [false, true]) {
		for (const fromEnd of [false, true]) {
			const across = alignOneWay(vertices, ranks, spacing, fromBelow, fromEnd);
			const [bent, length] = bends(vertices, across);
			if (bent < fewest[0] || (bent === fewest[0] && length < fewest[1])) {
				best = across;
				fewest = [bent, length];
			}
		}
	}
	return best;
}

/**
 * One of the four ways: align each vertex with a median neighbor in the rank
 * before it (or, `fromBelow`, after it), working from the start of each rank
 * (or, `fromEnd`, from its end), then pack the blocks toward that start.
 */
function alignOneWay(
	vertices: Vertex[],
	ranks: number[][],
	spacing: Spacing,
	fromBelow: boolean,
	fromEnd: boolean,
): number[] {
	const layers = (fromBelow ? [...ranks].reverse() : ranks).map((rank) =>
		fromEnd ? [...rank].reverse() : rank,
	);
	const position: number[] = vertices.map(() => 0);
	const layerOf: number[] = vertices.map(() => 0);
	layers.forEach((layer, index) => {
		layer.forEach((vertex, at) => {
			position[vertex] = at;
			layerOf[vertex] = index;
		});
	});
	const root = vertices.map((_, vertex) => vertex);
	const align = vertices.map((_, vertex) => vertex);

	for (const layer of layers.slice(1)) {
		let taken = -1;
		for (const vertex of layer) {
			const around = [...((fromBelow ? vertices[vertex]?.lower : vertices[vertex]?.upper) ?? [])];
			around.sort((a, b) => (position[a] ?? 0) - (position[b] ?? 0));
			const medians = [...new Set([(around.length - 1) >> 1, around.length >> 1])];
			for (const median of around.length === 0 ? [] : medians) {
				const neighbor = around[median] ?? 0;
				const at = position[neighbor] ?? 0;
				if (align[vertex] === vertex && taken < at) {
					align[neighbor] = vertex;
					root[vertex] = root[neighbor] ?? neighbor;
					align[vertex] = root[vertex] ?? vertex;
					taken = at;
				}
			}
		}
	}

	// How far past its neighbor toward the start of the rank a vertex must be,
	// in whole steps of the grid, so that every block lands on it.
	const separation = (earlier: number, later: number) => {
		const [first, second] = fromEnd ? [later, earlier] : [earlier, later];
		const { clearance, grid } = spacing;
		return snap((vertices[first]?.after ?? 0) + clearance + (vertices[second]?.before ?? 0), grid);
	};
	const blockOf = (start: number) => {
		const block = [start];
		for (let next = align[start] ?? start; next !== start; next = align[next] ?? start) {
			block.push(next);
		}
		return block;
	};
	// Each block goes as near the start as the blocks before its vertices
	// allow. It waits for those blocks one at a time, so each block in `chain`
	// is one that the block before it in `chain` waits for.
	const placed = new Map<number, number>();
	for (const start of new Set(root)) {
		const chain = placed.has(start) ? [] : [start];
		for (let block = chain.at(-1); block !== undefined; block = chain.at(-1)) {
			let at = 0;
			let waiting: number | undefined;
			for (const vertex of blockOf(block)) {
				const before = layers[layerOf[vertex] ?? 0]?.[(position[vertex] ?? 0) - 1];
				if (before !== undefined) {
					const other = root[before] ?? before;
					const where = placed.get(other);
					if (where === undefined) {
						waiting ??= other;
					} else {
						at = Math.max(at, where + separation(before, vertex));
					}
				}
			}
			if (waiting === undefined) {
				placed.set(block, at);
				chain.pop();
			} else if (chain.includes(waiting)) {
				throw new Error("Layout aligned two blocks so that each comes before the other.");
			} else {
				chain.push(waiting);
			}
		}
	}
	return vertices.map((_, vertex) => {
		const at = placed.get(root[vertex] ?? vertex) ?? 0;
		return fromEnd ? -at : at;
	});
}

/** How many segments are bent, and how far they bend in total. */
function bends(vertices: Vertex[], across: number[]): [number, number] {
	let bent = 0;
	let total = 0;
	vertices.forEach((vertex, index) => {
		for (const lower of vertex.lower) {
			const jog = Math.abs((across[index] ?? 0) - (across[lower] ?? 0));
			if (jog > 0) {
				bent += 1;
				total += jog;
			}
		}
	});
	return [bent, total];
}
