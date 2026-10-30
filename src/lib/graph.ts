import Fuse from "fuse.js";
import type { Filters, Person, Web } from "../types";
import { displayName } from "../types";

export function degrees(web: Web): Record<string, number> {
  const result: Record<string, number> = Object.fromEntries(
    Object.keys(web.people).map((id) => [id, 0]),
  );
  Object.values(web.links).forEach((l) => {
    if (web.people[l.source] && web.people[l.target]) {
      result[l.source]++;
      if (l.source !== l.target) result[l.target]++;
    }
  });
  return result;
}
export function adjacency(
  web: Web,
  directed = false,
): Map<string, Set<string>> {
  const result = new Map(
    Object.keys(web.people).map((id) => [id, new Set<string>()]),
  );
  Object.values(web.links).forEach((l) => {
    if (result.has(l.source) && result.has(l.target)) {
      result.get(l.source)!.add(l.target);
      if (!directed || !l.directed) result.get(l.target)!.add(l.source);
    }
  });
  return result;
}
export function neighbors(web: Web, id: string, hops = 1): Set<string> {
  const graph = adjacency(web);
  const found = new Set<string>();
  if (!graph.has(id)) return found;
  found.add(id);
  let frontier = [id];
  for (let depth = 0; depth < Math.max(0, hops); depth++) {
    const next: string[] = [];
    for (const item of frontier)
      for (const n of graph.get(item) ?? [])
        if (!found.has(n)) {
          found.add(n);
          next.push(n);
        }
    frontier = next;
    if (!frontier.length) break;
  }
  return found;
}
export function components(web: Web): string[][] {
  const graph = adjacency(web);
  const seen = new Set<string>();
  const result: string[][] = [];
  for (const id of graph.keys()) {
    if (seen.has(id)) continue;
    const part: string[] = [];
    const queue = [id];
    seen.add(id);
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      part.push(current);
      for (const n of graph.get(current)!)
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
    }
    result.push(part);
  }
  return result.sort((a, b) => b.length - a.length);
}
export function shortestPath(
  web: Web,
  source: string,
  target: string,
  directed = false,
): string[] {
  const graph = adjacency(web, directed);
  if (!graph.has(source) || !graph.has(target)) return [];
  const previous = new Map<string, string | null>([[source, null]]);
  const queue = [source];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (current === target) {
      const result: string[] = [];
      let step: string | null = current;
      while (step !== null) {
        result.unshift(step);
        step = previous.get(step) ?? null;
      }
      return result;
    }
    for (const n of graph.get(current)!)
      if (!previous.has(n)) {
        previous.set(n, current);
        queue.push(n);
      }
  }
  return [];
}
export function mutualFriends(web: Web, a: string, b: string): string[] {
  const graph = adjacency(web);
  const set = graph.get(b) ?? new Set();
  return [...(graph.get(a) ?? [])].filter(
    (id) => id !== a && id !== b && set.has(id),
  );
}
export function searchPeople(web: Web, query: string): Person[] {
  const people = Object.values(web.people);
  if (!query.trim()) return people;
  const metadata = new Map<string, string[]>();
  Object.values(web.links).forEach((l) => {
    const text = [
      web.types.find((t) => t.id === l.type)?.name,
      l.notes,
      ...Object.entries(l.custom).flat(),
    ]
      .filter(Boolean)
      .join(" ");
    for (const id of [l.source, l.target])
      metadata.set(id, [...(metadata.get(id) ?? []), text]);
  });
  const haystack = people.map((p) => ({
    ...p,
    searchable: [
      displayName(p),
      p.nickname,
      p.notes,
      p.description,
      p.gender,
      p.pronouns,
      ...p.tags,
      ...p.groups,
      ...Object.entries(p.custom).flat(),
      ...(metadata.get(p.id) ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  }));
  return new Fuse(haystack, {
    keys: ["searchable"],
    threshold: 0.35,
    ignoreLocation: true,
    shouldSort: true,
  })
    .search(query.trim())
    .map((r) => web.people[r.item.id]);
}
export function filterPeople(web: Web, f: Filters): Person[] {
  const degree = degrees(web);
  const typeIds = f.type
    ? new Set(
        Object.values(web.links)
          .filter((l) => l.type === f.type && (f.showHidden || !l.hidden))
          .flatMap((l) => [l.source, l.target]),
      )
    : null;
  return searchPeople(web, f.query).filter(
    (p) =>
      (f.showHidden || !p.hidden) &&
      (!f.group || p.groups.includes(f.group)) &&
      (!f.tag || p.tags.includes(f.tag)) &&
      (!f.gender ||
        (p.gender ?? "").toLowerCase() === f.gender.toLowerCase()) &&
      (!f.favorites || p.favorite) &&
      (!typeIds || typeIds.has(p.id)) &&
      degree[p.id] >= f.minDegree &&
      degree[p.id] <= f.maxDegree &&
      (!f.customKey ||
        (f.customValue
          ? (p.custom[f.customKey] ?? "")
              .toLowerCase()
              .includes(f.customValue.toLowerCase())
          : f.customKey in p.custom)) &&
      (!f.since || (p.dates.met || p.createdAt) >= f.since) &&
      (!f.until || (p.dates.met || p.createdAt).slice(0, 10) <= f.until),
  );
}
export function findDuplicates(
  web: Web,
  person: Pick<Person, "firstName" | "lastName"> & { id?: string },
): Person[] {
  const key = `${person.firstName} ${person.lastName ?? ""}`
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
  return Object.values(web.people).filter(
    (p) =>
      p.id !== person.id &&
      displayName(p).toLocaleLowerCase().replace(/\s+/g, " ") === key,
  );
}
export function analytics(web: Web) {
  const degree = degrees(web);
  const groups = [
    ...new Set(Object.values(web.people).flatMap((p) => p.groups)),
  ];
  const breakdown = web.types
    .map((type) => ({
      ...type,
      count: Object.values(web.links).filter((l) => l.type === type.id).length,
    }))
    .filter((t) => t.count > 0);
  return {
    people: Object.keys(web.people).length,
    links: Object.keys(web.links).length,
    types: breakdown.length,
    groups: groups.length,
    components: components(web),
    degrees: degree,
    breakdown,
    averageDegree: Object.keys(degree).length
      ? Object.values(degree).reduce((a, b) => a + b, 0) /
        Object.keys(degree).length
      : 0,
  };
}
