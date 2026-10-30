import "fake-indexeddb/auto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useStore, getActiveWeb, flushSave } from "./store";
import { makePerson, makeWeb } from "./lib/sample";
import type { Connection } from "./types";
import { EMPTY_FILTERS } from "./lib/defaults";
import {
  readData,
  writeData,
  deleteData,
  readRecovery,
} from "./lib/persistence";
const active = () => getActiveWeb(useStore.getState())!;
const link = (source: string, target: string): Connection => ({
  id: crypto.randomUUID(),
  source,
  target,
  type: "friend",
  directed: false,
  weight: 1,
  custom: {},
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});

beforeAll(async () => {
  await useStore.getState().init();
});
beforeEach(() => {
  const web = makeWeb("Test");
  useStore.setState({
    webs: [web],
    activeId: web.id,
    readOnly: false,
    sharedWeb: null,
    selection: null,
    selectedIds: [],
    history: [],
    future: [],
    filters: structuredClone(EMPTY_FILTERS),
    error: null,
  });
});

describe("relationship appearance", () => {
  it("keeps distinct colors and styles for multiple relationships between the same two people through edits and undo", () => {
    const a = useStore.getState().addPerson({ firstName: "Alex" });
    const b = useStore.getState().addPerson({ firstName: "Sam" });
    const friendship = {
      ...link(a, b),
      type: "friend",
      color: "#fb7185",
      style: "dashed" as const,
      weight: 2,
    };
    const family = {
      ...link(a, b),
      type: "family",
      color: "#7db6f7",
      style: "dotted" as const,
    };
    useStore.getState().addConnections([friendship, family]);
    expect(Object.keys(active().links)).toHaveLength(2);
    useStore.getState().mutate("Change line", (w) => {
      w.links[family.id].color = "#fbbf77";
      w.links[family.id].style = "solid";
    });
    expect(active().links[friendship.id]).toMatchObject({
      type: "friend",
      color: "#fb7185",
      style: "dashed",
      weight: 2,
    });
    useStore.getState().undo();
    expect(active().links[family.id]).toMatchObject({
      type: "family",
      color: "#7db6f7",
      style: "dotted",
    });
    useStore.getState().redo();
    expect(active().links[family.id]).toMatchObject({
      type: "family",
      color: "#fbbf77",
      style: "solid",
    });
  });
});

describe("local graph transactions", () => {
  it("atomically undoes a batch and restores removed connections when undoing deletion", () => {
    const a = makePerson("Alex"),
      b = makePerson("Bea"),
      c = makePerson("Cora");
    useStore.getState().mutate("Create people", (w) => {
      [a, b, c].forEach((p) => (w.people[p.id] = p));
    });
    useStore.getState().addConnections([link(a.id, b.id), link(a.id, c.id)]);
    expect(Object.values(active().links)).toHaveLength(2);
    useStore.getState().undo();
    expect(Object.values(active().links)).toHaveLength(0);
    useStore.getState().redo();
    expect(Object.values(active().links)).toHaveLength(2);
    useStore.getState().select({ kind: "person", id: b.id });
    useStore.getState().deletePeople([b.id]);
    expect(Object.values(active().links)).toHaveLength(1);
    expect(useStore.getState().selection).toBeNull();
    expect(useStore.getState().selectedIds).toEqual([]);
    useStore.getState().undo();
    expect(active().people[b.id]).toBeDefined();
    expect(Object.values(active().links)).toHaveLength(2);
  });
  it("allows same names with distinct identities and regenerates identities on web duplication", () => {
    const a = useStore.getState().addPerson({ firstName: "Alex" }),
      b = useStore.getState().addPerson({ firstName: "Alex" });
    useStore.getState().addConnections([link(a, b)]);
    const original = active();
    const copyId = useStore.getState().duplicateWeb(original.id)!;
    const copy = active();
    expect(copy.id).toBe(copyId);
    expect(copy.id).not.toBe(original.id);
    expect(Object.keys(copy.people)).toHaveLength(2);
    expect(Object.keys(copy.people).some((id) => id in original.people)).toBe(
      false,
    );
    const edge = Object.values(copy.links)[0];
    expect(copy.people[edge.source]).toBeDefined();
    expect(copy.people[edge.target]).toBeDefined();
    useStore.getState().deletePeople([edge.source]);
    expect(Object.keys(original.people)).toHaveLength(2);
  });
  it("keeps shared snapshots immutable across every editing action and forks a detached copy", () => {
    const web = makeWeb("Shared");
    const p = makePerson("Alex");
    web.people[p.id] = p;
    useStore.getState().setShared(web);
    const original = JSON.stringify(active());
    useStore.getState().updatePerson(p.id, { firstName: "Changed" });
    useStore.getState().deletePeople([p.id]);
    useStore
      .getState()
      .updatePositions({ [p.id]: { x: 10, y: 10, z: 10 } }, true);
    useStore.getState().setCamera({
      position: { x: 1, y: 1, z: 1 },
      target: { x: 0, y: 0, z: 0 },
    });
    useStore.getState().createWeb("Must not create");
    useStore.getState().undo();
    expect(JSON.stringify(active())).toBe(original);
    useStore.getState().select({ kind: "person", id: p.id });
    expect(useStore.getState().selection?.id).toBe(p.id);
    const fork = useStore.getState().forkShared();
    expect(active().id).toBe(fork);
    expect(useStore.getState().readOnly).toBe(false);
    useStore
      .getState()
      .updatePerson(Object.keys(active().people)[0], { firstName: "My edit" });
    expect(web.people[p.id].firstName).toBe("Alex");
  });
  it("preserves separate metadata when merging and rewires connections", () => {
    const a = makePerson("Alex", {
        tags: ["art"],
        custom: { one: "1" },
        notes: "First",
      }),
      b = makePerson("Alex", {
        tags: ["books"],
        custom: { two: "2" },
        notes: "Second",
      }),
      c = makePerson("Chris");
    useStore.getState().mutate("Create", (w) => {
      [a, b, c].forEach((p) => (w.people[p.id] = p));
    });
    useStore.getState().addConnections([link(b.id, c.id)]);
    useStore.getState().select({ kind: "person", id: b.id });
    useStore.getState().mergePeople(a.id, b.id);
    expect(active().people[b.id]).toBeUndefined();
    expect(active().people[a.id].tags).toEqual(["art", "books"]);
    expect(active().people[a.id].custom).toEqual({ two: "2", one: "1" });
    expect(active().people[a.id].notes).toContain("Second");
    expect(Object.values(active().links)[0].source).toBe(a.id);
    expect(useStore.getState().selection).toBeNull();
    useStore.getState().undo();
    expect(active().people[b.id]).toBeDefined();
    expect(Object.values(active().links)[0].source).toBe(b.id);
  });
  it("keeps physics position updates outside undo history and ignores nonfinite positions", () => {
    const id = useStore.getState().addPerson({ firstName: "Alex" });
    const length = useStore.getState().history.length;
    useStore.getState().updatePositions({ [id]: { x: 1, y: 2, z: 3 } }, true);
    expect(active().people[id].position).toEqual({ x: 1, y: 2, z: 3 });
    expect(active().people[id].pinned).toBe(true);
    expect(useStore.getState().history.length).toBe(length);
    useStore.getState().updatePositions({ [id]: { x: NaN, y: 0, z: 0 } });
    expect(active().people[id].position?.x).toBe(1);
  });
  it("keeps live camera and simulation coordinates through ordinary undo but restores deliberate layout resets", () => {
    const id = useStore.getState().addPerson({ firstName: "Alex" });
    useStore.getState().updatePositions({ [id]: { x: 1, y: 2, z: 3 } });
    useStore.getState().updatePerson(id, { notes: "A note" });
    useStore.getState().updatePositions({ [id]: { x: 40, y: 50, z: 60 } });
    const camera = {
      position: { x: 1, y: 2, z: 300 },
      target: { x: 4, y: 5, z: 6 },
    };
    useStore.getState().setCamera(camera);
    useStore.getState().undo();
    expect(active().people[id].notes).toBeUndefined();
    expect(active().people[id].position?.x).toBe(40);
    expect(active().camera).toEqual(camera);
    useStore.getState().redo();
    expect(active().people[id].notes).toBe("A note");
    expect(active().people[id].position?.x).toBe(40);
    useStore.getState().mutate("Reset layout", (w) => {
      delete w.people[id].position;
    });
    useStore.getState().updatePositions({ [id]: { x: 100, y: 100, z: 100 } });
    useStore.getState().undo();
    expect(active().people[id].position?.x).toBe(40);
  });
  it("flushes a pending autosave before document shutdown", async () => {
    const id = useStore.getState().addPerson({ firstName: "Last edit" });
    await flushSave();
    expect(
      (await readData())?.webs.find((w) => w.id === active().id)?.people[id]
        .firstName,
    ).toBe("Last edit");
    expect(useStore.getState().saveStatus).toBe("saved");
  });
  it("clears stale selection and history when switching webs", () => {
    const first = active().id;
    const id = useStore.getState().addPerson({ firstName: "Alex" });
    useStore.getState().select({ kind: "person", id });
    useStore.getState().createWeb("Second");
    useStore.getState().setActive(first);
    expect(useStore.getState().selection).toBeNull();
    expect(useStore.getState().history).toEqual([]);
    expect(active().people[id]).toBeDefined();
  });
  it("undoes and redoes web creation, renaming, duplication, and deletion", () => {
    const originalId = active().id;
    const originalName = active().name;
    const person = useStore.getState().addPerson({ firstName: "Ari" });
    const created = useStore.getState().createWeb("New web");
    expect(active().id).toBe(created);
    useStore.getState().undo();
    expect(active().id).toBe(originalId);
    expect(active().people[person].firstName).toBe("Ari");
    useStore.getState().redo();
    expect(active().id).toBe(created);
    useStore.getState().renameWeb(created, "Renamed");
    useStore.getState().undo();
    expect(active().name).toBe("New web");
    useStore.getState().redo();
    expect(active().name).toBe("Renamed");
    const duplicate = useStore.getState().duplicateWeb(created)!;
    useStore.getState().undo();
    expect(useStore.getState().webs.some((w) => w.id === duplicate)).toBe(
      false,
    );
    useStore.getState().redo();
    expect(active().id).toBe(duplicate);
    useStore.getState().deleteWeb(duplicate);
    expect(useStore.getState().webs.some((w) => w.id === duplicate)).toBe(
      false,
    );
    useStore.getState().undo();
    expect(active().id).toBe(duplicate);
    useStore.getState().redo();
    expect(useStore.getState().webs.some((w) => w.id === duplicate)).toBe(
      false,
    );
    expect(
      useStore.getState().webs.find((w) => w.id === originalId)?.name,
    ).toBe(originalName);
  });
});

describe("IndexedDB recovery", () => {
  it("writes an atomic previous autosave and reads the latest full graph", async () => {
    await deleteData();
    const web = makeWeb("First");
    await writeData({ webs: [web], activeId: web.id, updatedAt: "1" });
    const next = structuredClone(web);
    next.name = "Second";
    await writeData({ webs: [next], activeId: web.id, updatedAt: "2" });
    expect((await readData())?.webs[0].name).toBe("Second");
    expect((await readRecovery())?.webs[0].name).toBe("First");
    await deleteData();
    expect(await readData()).toBeNull();
  });
});
