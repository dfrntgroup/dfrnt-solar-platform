// State machines as data (9 Nov 2026). Every lifecycle in the platform is declared once with this: its states, the edges
// between them, a label per state, the effect each edge needs, and who may take it. Pure: nothing here touches a database.
//
// Edge keys are "from->to". "*->to" matches any from-state and "from->*" any to-state; an exact key wins over a wildcard.

export type Tier = "R" | "A" | "P" | "H";

export interface MachineSpec<S extends string> {
  name: string;
  states: readonly S[];
  transitions: Record<S, readonly S[]>;
  labels: Record<S, string>;
  /** Named side effect an edge requires. Plain edges have none; "route" effects can only be taken through their own action. */
  effects?: Record<string, string | readonly string[]>;
  /** Who may take the edge: A act (internal, reversible), P propose (a person approves), H human or customer only. R is never an edge. */
  tiers?: Record<string, Tier>;
  /** Default tier for edges not listed. */
  defaultTier?: Tier;
}

export interface Edge<S extends string> { from: S; to: S; effects: readonly string[]; tier: Tier }

export interface Machine<S extends string> {
  name: string;
  states: readonly S[];
  transitions: Record<S, readonly S[]>;
  labels: Record<S, string>;
  edges: readonly Edge<S>[];
  is(x: unknown): x is S;
  can(from: S, to: S): boolean;
  assert(from: S, to: S): void;
  next(from: S): readonly S[];
  edge(from: S, to: S): Edge<S> | null;
  /** Effects an edge needs; [] for a plain edge. */
  effectsOf(from: S, to: S): readonly string[];
  tierOf(from: S, to: S): Tier;
  label(s: S): string;
  terminal: readonly S[];
  /** States that can reach `to` in one move. */
  from(to: S): readonly S[];
  /** States that satisfy a predicate, as a frozen list (for SQL `in (...)` and UI gates). */
  where(pred: (s: S) => boolean): readonly S[];
}

export function defineMachine<S extends string>(spec: MachineSpec<S>): Machine<S> {
  const { states, transitions, labels } = spec;
  const set = new Set<string>(states);
  for (const s of states) {
    if (!(s in transitions)) throw new Error(`${spec.name}: no transitions entry for ${s}`);
    for (const t of transitions[s]) if (!set.has(t)) throw new Error(`${spec.name}: ${s} -> ${t} targets an unknown state`);
    if (!labels[s]) throw new Error(`${spec.name}: no label for ${s}`);
  }
  const lookup = <T,>(table: Record<string, T> | undefined, from: S, to: S): T | undefined =>
    table?.[`${from}->${to}`] ?? table?.[`*->${to}`] ?? table?.[`${from}->*`];
  const effectsOf = (from: S, to: S): readonly string[] => {
    const e = lookup(spec.effects, from, to);
    return e == null ? [] : typeof e === "string" ? [e] : e;
  };
  const tierOf = (from: S, to: S): Tier => lookup(spec.tiers, from, to) ?? spec.defaultTier ?? "H";
  for (const k of Object.keys(spec.effects ?? {}).concat(Object.keys(spec.tiers ?? {}))) {
    const [a, b] = k.split("->");
    if (!a || !b) throw new Error(`${spec.name}: bad edge key ${k}`);
    if (a !== "*" && !set.has(a)) throw new Error(`${spec.name}: edge key ${k} names unknown state ${a}`);
    if (b !== "*" && !set.has(b)) throw new Error(`${spec.name}: edge key ${k} names unknown state ${b}`);
    if (a !== "*" && b !== "*" && !transitions[a as S].includes(b as S)) throw new Error(`${spec.name}: edge key ${k} is not a transition`);
  }
  const edges: Edge<S>[] = [];
  for (const from of states) for (const to of transitions[from]) edges.push({ from, to, effects: effectsOf(from, to), tier: tierOf(from, to) });
  const can = (from: S, to: S) => transitions[from]?.includes(to) ?? false;
  return {
    name: spec.name, states, transitions, labels, edges,
    is: (x): x is S => typeof x === "string" && set.has(x),
    can,
    assert(from, to) { if (!can(from, to)) throw new Error(`Not allowed: ${from} → ${to}`); },
    next: (from) => transitions[from] ?? [],
    edge: (from, to) => edges.find((e) => e.from === from && e.to === to) ?? null,
    effectsOf, tierOf,
    label: (s) => labels[s] ?? s,
    terminal: states.filter((s) => transitions[s].length === 0),
    from: (to) => states.filter((s) => transitions[s].includes(to)),
    where: (pred) => Object.freeze(states.filter(pred)),
  };
}
