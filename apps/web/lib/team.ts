/** About-page team from Ops → Settings ("Name | Role | One line" per line). People without a role stay hidden. */
export function team(raw?: string) {
  return (raw ?? "").split("\n").map((l) => l.split("|").map((x) => x.trim())).filter(([n, r]) => n && r)
    .map(([name, role, line]) => ({ name: name!, role: role!, line: line ?? "", initials: name!.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() }));
}
