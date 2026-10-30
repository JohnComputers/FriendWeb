import { describe, expect, it } from "vitest";
import type { Connection, Person, Web } from "../../types";
import { DEFAULT_SETTINGS, DEFAULT_TYPES, EMPTY_FILTERS } from "../defaults";
import {
  adjacency,
  analytics,
  components,
  degrees,
  filterPeople,
  findDuplicates,
  mutualFriends,
  neighbors,
  searchPeople,
  shortestPath,
} from "../graph";

const timestamp = "2026-01-01T00:00:00.000Z";
function person(
  id: string,
  firstName: string,
  extra: Partial<Person> = {},
): Person {
  return {
    id,
    firstName,
    tags: [],
    groups: [],
    custom: {},
    dates: {},
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    ...extra,
  };
}
function connection(
  id: string,
  source: string,
  target: string,
  extra: Partial<Connection> = {},
): Connection {
  return {
    id,
    source,
    target,
    type: "friend",
    weight: 1,
    directed: false,
    custom: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    ...extra,
  };
}
function fixture(): Web {
  return {
    id: "web",
    name: "Graph unit fixture",
    description: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    people: {
      a: person("a", "Alex", {
        lastName: "Chen",
        groups: ["Family"],
        tags: ["hiking"],
        custom: { city: "Lisbon" },
      }),
      b: person("b", "Bailey", {
        nickname: "Bee",
        groups: ["Work"],
        favorite: true,
      }),
      c: person("c", "Cameron", { gender: "nonbinary", hidden: true }),
      d: person("d", "Drew"),
      e: person("e", "Alex", { lastName: "Chen" }),
    },
    links: {
      ab: connection("ab", "a", "b", {
        directed: true,
        notes: "Met at the astronomy festival",
      }),
      bc: connection("bc", "b", "c"),
      ac: connection("ac", "a", "c", { type: "family" }),
      cd: connection("cd", "c", "d", { directed: true }),
    },
    types: structuredClone(DEFAULT_TYPES),
    settings: structuredClone(DEFAULT_SETTINGS),
    bookmarks: [],
    views: [],
    presets: [],
  };
}

describe("relationship navigation", () => {
  it("finds a shortest path and respects directed edges when requested", () => {
    const web = fixture();
    expect(shortestPath(web, "a", "d")).toEqual(["a", "c", "d"]);
    expect(shortestPath(web, "d", "a", true)).toEqual([]);
    expect(shortestPath(web, "b", "a", true)).toEqual(["b", "c", "a"]);
    expect(shortestPath(web, "a", "a")).toEqual(["a"]);
    expect(shortestPath(web, "a", "e")).toEqual([]);
    expect(shortestPath(web, "missing", "a")).toEqual([]);
  });
  it("keeps undirected links traversable both ways in directed mode", () => {
    const graph = adjacency(fixture(), true);
    expect(graph.get("b")?.has("c")).toBe(true);
    expect(graph.get("c")?.has("b")).toBe(true);
    expect(graph.get("b")?.has("a")).toBe(false);
  });
  it("includes isolated people in components and limits neighborhood hops", () => {
    const web = fixture();
    expect(components(web)).toEqual([["a", "b", "c", "d"], ["e"]]);
    expect(neighbors(web, "a", 0)).toEqual(new Set(["a"]));
    expect(neighbors(web, "a", 1)).toEqual(new Set(["a", "b", "c"]));
    expect(neighbors(web, "a", 2)).toEqual(new Set(["a", "b", "c", "d"]));
    expect(neighbors(web, "missing")).toEqual(new Set());
    expect(mutualFriends(web, "a", "b")).toEqual(["c"]);
  });
  it("counts distinct stored relationships while ignoring dangling links", () => {
    const web = fixture();
    web.links.second = connection("second", "a", "b", { type: "coworker" });
    web.links.dangling = connection("dangling", "a", "missing");
    expect(degrees(web)).toEqual({ a: 3, b: 3, c: 3, d: 1, e: 0 });
  });
});

describe("search, filtering and duplicate warnings", () => {
  it("searches nickname, relationship notes, and custom values", () => {
    const web = fixture();
    expect(searchPeople(web, "Bee")[0]?.id).toBe("b");
    expect(searchPeople(web, "Lisbon").map((p) => p.id)).toContain("a");
    expect(
      searchPeople(web, "astronomy festival")
        .map((p) => p.id)
        .sort(),
    ).toEqual(["a", "b"]);
    expect(searchPeople(web, "Aelx Chen").map((p) => p.id)).toContain("a");
  });
  it("combines filters and hides hidden people by default", () => {
    const web = fixture();
    expect(filterPeople(web, EMPTY_FILTERS).map((p) => p.id)).not.toContain(
      "c",
    );
    expect(
      filterPeople(web, {
        ...EMPTY_FILTERS,
        showHidden: true,
        gender: "NONBINARY",
      }).map((p) => p.id),
    ).toEqual(["c"]);
    expect(
      filterPeople(web, {
        ...EMPTY_FILTERS,
        group: "Family",
        tag: "hiking",
        minDegree: 2,
        customKey: "city",
        customValue: "lis",
      }).map((p) => p.id),
    ).toEqual(["a"]);
    expect(
      filterPeople(web, { ...EMPTY_FILTERS, favorites: true }).map((p) => p.id),
    ).toEqual(["b"]);
    expect(
      filterPeople(web, { ...EMPTY_FILTERS, type: "family" }).map((p) => p.id),
    ).toEqual(["a"]);
  });
  it("warns about normalized full-name duplicates without treating them as identity", () => {
    const web = fixture();
    expect(
      findDuplicates(web, {
        id: "a",
        firstName: "  alex ",
        lastName: "CHEN",
      }).map((p) => p.id),
    ).toEqual(["e"]);
    expect(
      findDuplicates(web, { firstName: "Alex", lastName: "Other" }),
    ).toEqual([]);
    expect(Object.keys(web.people)).toHaveLength(5);
  });
  it("reports factual graph totals and handles empty webs", () => {
    const web = fixture();
    const stats = analytics(web);
    expect(stats.people).toBe(5);
    expect(stats.links).toBe(4);
    expect(stats.groups).toBe(2);
    expect(stats.averageDegree).toBe(1.6);
    web.people = {};
    web.links = {};
    expect(components(web)).toEqual([]);
    expect(analytics(web).averageDegree).toBe(0);
  });
});
