import { create } from "zustand";
import type {
  Connection,
  Filters,
  Person,
  Selection,
  Vec3,
  Web,
} from "./types";
import { EMPTY_FILTERS } from "./lib/defaults";
import { makePerson, makeWeb } from "./lib/sample";
import { decodeShare, validateWeb } from "./lib/importExport";
import {
  deleteData,
  readData,
  readRecovery,
  writeData,
} from "./lib/persistence";

interface HistoryEntry {
  web: Web;
  label: string;
  positionIds: string[];
  cameraChanged: boolean;
  workspace?: { webs: Web[]; activeId: string };
}

function workspaceHistory(state: AppState, label: string): HistoryEntry {
  return {
    web: getActiveWeb(state)!,
    label,
    positionIds: [],
    cameraChanged: false,
    workspace: { webs: state.webs, activeId: state.activeId },
  };
}
export interface AppState {
  webs: Web[];
  activeId: string;
  ready: boolean;
  saveStatus: "loading" | "saved" | "saving" | "error";
  error: string | null;
  readOnly: boolean;
  sharedWeb: Web | null;
  selection: Selection;
  selectedIds: string[];
  recent: string[];
  filters: Filters;
  history: HistoryEntry[];
  future: HistoryEntry[];
  init: () => Promise<void>;
  mutate: (label: string, fn: (web: Web) => void) => void;
  select: (selection: Selection, additive?: boolean) => void;
  setFilters: (filters: Partial<Filters>) => void;
  setActive: (id: string) => void;
  createWeb: (name: string, template?: boolean) => string;
  duplicateWeb: (id: string) => string | undefined;
  deleteWeb: (id: string) => void;
  renameWeb: (id: string, name: string) => void;
  undo: () => void;
  redo: () => void;
  importWeb: (web: Web) => string;
  forkShared: () => string | undefined;
  setShared: (web: Web) => void;
  updatePositions: (positions: Record<string, Vec3>, pinned?: boolean) => void;
  setCamera: (camera: NonNullable<Web["camera"]>) => void;
  addPerson: (
    person: Person | (Partial<Person> & { firstName: string }),
  ) => string;
  updatePerson: (id: string, patch: Partial<Person>) => void;
  deletePeople: (ids: string[]) => void;
  duplicatePerson: (id: string) => string | undefined;
  mergePeople: (keepId: string, removeId: string) => void;
  addConnections: (connections: Connection[]) => void;
  deleteConnections: (ids: string[]) => void;
  clearError: () => void;
  retrySave: () => void;
  deleteAllData: () => Promise<void>;
  restoreRecovery: () => Promise<void>;
}

export const getActiveWeb = (
  state: Pick<AppState, "webs" | "activeId" | "readOnly" | "sharedWeb">,
): Web | undefined =>
  state.readOnly && state.sharedWeb
    ? state.sharedWeb
    : state.webs.find((w) => w.id === state.activeId);
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let initPromise: Promise<void> | undefined;
let writeQueue = Promise.resolve();
let revision = 0;
let persistenceBlocked = false;

function persistNow(expected: number) {
  const state = useStore.getState();
  const data = {
    webs: structuredClone(state.webs),
    activeId: state.activeId,
    updatedAt: new Date().toISOString(),
  };
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        await writeData(data);
        if (expected === revision) useStore.setState({ saveStatus: "saved" });
      } catch (error) {
        useStore.setState({
          saveStatus: "error",
          error: `Your latest changes are still in memory. Local storage could not save them: ${error instanceof Error ? error.message : String(error)}. Export a JSON backup before closing.`,
        });
      }
    });
  return writeQueue;
}
/** Start the pending IndexedDB transaction before the document becomes inactive. */
export function flushSave(): Promise<void> {
  if (persistenceBlocked || !saveTimer) return writeQueue;
  clearTimeout(saveTimer);
  saveTimer = undefined;
  return persistNow(revision);
}
let lifecycleRegistered = false;
function registerSaveLifecycle() {
  if (lifecycleRegistered || typeof window === "undefined") return;
  lifecycleRegistered = true;
  window.addEventListener("pagehide", () => {
    void flushSave();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushSave();
  });
}
function scheduleSave() {
  if (persistenceBlocked) return;
  if (saveTimer) clearTimeout(saveTimer);
  const expected = ++revision;
  useStore.setState({ saveStatus: "saving" });
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    void persistNow(expected);
  }, 160);
}
function cleanSelection(web: Web, selection: Selection, selectedIds: string[]) {
  return {
    selection:
      selection &&
      (selection.kind === "person"
        ? web.people[selection.id]
        : web.links[selection.id])
        ? selection
        : null,
    selectedIds: selectedIds.filter((id) => Boolean(web.people[id])),
  };
}
function restoreHistoryLayout(
  snapshot: Web,
  current: Web,
  entry: HistoryEntry,
): Web {
  const web = structuredClone(snapshot);
  const positionIds = new Set(entry.positionIds);
  for (const person of Object.values(web.people)) {
    const live = current.people[person.id];
    if (live && !positionIds.has(person.id))
      person.position = live.position ? { ...live.position } : undefined;
  }
  if (!entry.cameraChanged)
    web.camera = current.camera ? structuredClone(current.camera) : undefined;
  return web;
}
function restoreWorkspace(
  workspace: NonNullable<HistoryEntry["workspace"]>,
  current: AppState,
  entry: HistoryEntry,
) {
  return {
    ...workspace,
    webs: workspace.webs.map((web) => {
      const live = current.webs.find((candidate) => candidate.id === web.id);
      return live ? restoreHistoryLayout(web, live, entry) : web;
    }),
  };
}
function copyWeb(source: Web, name: string): Web {
  const web = structuredClone(source);
  const ids = new Map(
    Object.keys(web.people).map((id) => [id, crypto.randomUUID()]),
  );
  web.id = crypto.randomUUID();
  web.name = name;
  web.createdAt = web.updatedAt = new Date().toISOString();
  web.people = Object.fromEntries(
    Object.values(web.people).map((p) => {
      p.id = ids.get(p.id)!;
      return [p.id, p];
    }),
  );
  web.links = Object.fromEntries(
    Object.values(web.links).map((l) => {
      l.id = crypto.randomUUID();
      l.source = ids.get(l.source)!;
      l.target = ids.get(l.target)!;
      return [l.id, l];
    }),
  );
  return web;
}
function validateWorkspace(
  data: unknown,
): { webs: Web[]; activeId: string } | null {
  if (
    !data ||
    typeof data !== "object" ||
    !("webs" in data) ||
    !Array.isArray(data.webs)
  )
    return null;
  if (!data.webs.length) return null;
  const webs = data.webs.map(validateWeb);
  const activeId =
    "activeId" in data &&
    typeof data.activeId === "string" &&
    webs.some((w) => w.id === data.activeId)
      ? data.activeId
      : webs[0].id;
  return { webs, activeId };
}

export const useStore = create<AppState>((set, get) => ({
  webs: [],
  activeId: "",
  ready: false,
  saveStatus: "loading",
  error: null,
  readOnly: false,
  sharedWeb: null,
  selection: null,
  selectedIds: [],
  recent: [],
  filters: structuredClone(EMPTY_FILTERS),
  history: [],
  future: [],
  init: async () => {
    registerSaveLifecycle();
    if (get().ready) return;
    if (initPromise) return initPromise;
    initPromise = (async () => {
      let saved = false;
      try {
        const data = await readData();
        if (data) {
          let workspace: ReturnType<typeof validateWorkspace> = null;
          try {
            workspace = validateWorkspace(data);
          } catch {
            /* Attempt the previous atomic recovery snapshot. */
          }
          if (!workspace) {
            const recovery = await readRecovery();
            try {
              workspace = validateWorkspace(recovery);
            } catch {
              /* Keep corrupt records untouched. */
            }
            if (workspace)
              set({
                error:
                  "Recovered your previous autosave. Export a backup to keep a second copy.",
              });
          }
          if (!workspace)
            throw new Error(
              "Saved data could not be validated. It has been preserved in IndexedDB; automatic saves are paused. Import a backup, or use Retry save to replace it with this workspace.",
            );
          set({ ...workspace, saveStatus: "saved" });
          saved = true;
        } else {
          const web = makeWeb("My universe", true);
          set({ webs: [web], activeId: web.id, saveStatus: "saved" });
        }
      } catch (error) {
        persistenceBlocked = true;
        const web = makeWeb("Recovered workspace");
        set({
          webs: [web],
          activeId: web.id,
          saveStatus: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if (
        typeof window !== "undefined" &&
        window.location.hash.startsWith("#share=")
      ) {
        try {
          const sharedWeb = decodeShare(window.location.hash);
          set({ sharedWeb, readOnly: true });
        } catch (error) {
          set({
            error: `This shared snapshot could not be opened: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
      set({ ready: true });
      if (!saved && !persistenceBlocked) scheduleSave();
    })();
    try {
      await initPromise;
    } finally {
      initPromise = undefined;
    }
  },
  mutate: (label, fn) => {
    const state = get();
    if (state.readOnly) return;
    const before = getActiveWeb(state);
    if (!before) return;
    const web = structuredClone(before);
    fn(web);
    Object.values(web.people).forEach((p) => {
      p.firstName = p.firstName.trim();
      if (!p.firstName) throw new Error("A person needs a first name.");
    });
    for (const [id, l] of Object.entries(web.links))
      if (!web.people[l.source] || !web.people[l.target]) delete web.links[id];
    if (JSON.stringify(web) === JSON.stringify(before)) return;
    web.updatedAt = new Date().toISOString();
    set({
      webs: state.webs.map((w) => (w.id === web.id ? web : w)),
      history: [
        ...state.history,
        {
          web: before,
          label,
          positionIds: Object.keys(web.people).filter(
            (id) =>
              before.people[id] &&
              JSON.stringify(before.people[id].position) !==
                JSON.stringify(web.people[id].position),
          ),
          cameraChanged:
            JSON.stringify(before.camera) !== JSON.stringify(web.camera),
        },
      ].slice(-60),
      future: [],
      ...cleanSelection(web, state.selection, state.selectedIds),
    });
    scheduleSave();
  },
  select: (selection, additive = false) => {
    const state = get();
    const web = getActiveWeb(state);
    if (!web) return;
    if (!selection) {
      set({ selection: null, selectedIds: [] });
      return;
    }
    if (
      !(selection.kind === "person"
        ? web.people[selection.id]
        : web.links[selection.id])
    )
      return;
    const selectedIds =
      selection.kind === "person"
        ? additive
          ? state.selectedIds.includes(selection.id)
            ? state.selectedIds.filter((id) => id !== selection.id)
            : [...state.selectedIds, selection.id]
          : [selection.id]
        : [];
    set({
      selection:
        selection.kind === "person" &&
        additive &&
        !selectedIds.includes(selection.id)
          ? selectedIds.length
            ? { kind: "person", id: selectedIds[selectedIds.length - 1] }
            : null
          : selection,
      selectedIds,
      ...(selection.kind === "person"
        ? {
            recent: [
              selection.id,
              ...state.recent.filter((id) => id !== selection.id),
            ].slice(0, 12),
          }
        : {}),
    });
  },
  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),
  setActive: (id) => {
    if (!get().webs.some((w) => w.id === id)) return;
    set({
      activeId: id,
      readOnly: false,
      sharedWeb: null,
      selection: null,
      selectedIds: [],
      recent: [],
      filters: structuredClone(EMPTY_FILTERS),
      history: [],
      future: [],
    });
    if (
      typeof window !== "undefined" &&
      (window.location.hash.startsWith("#share=") ||
        window.location.hash.startsWith("#locked="))
    )
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    scheduleSave();
  },
  createWeb: (name, template = false) => {
    if (get().readOnly) return "";
    const web = makeWeb(name, template);
    set((state) => ({
      webs: [...state.webs, web],
      activeId: web.id,
      history: [...state.history, workspaceHistory(state, "Create web")].slice(
        -60,
      ),
      future: [],
      selection: null,
      selectedIds: [],
      filters: structuredClone(EMPTY_FILTERS),
    }));
    scheduleSave();
    return web.id;
  },
  duplicateWeb: (id) => {
    if (get().readOnly) return;
    const old = get().webs.find((w) => w.id === id);
    if (!old) return;
    const web = copyWeb(old, `${old.name} (copy)`);
    set((state) => ({
      webs: [...state.webs, web],
      activeId: web.id,
      history: [
        ...state.history,
        workspaceHistory(state, "Duplicate web"),
      ].slice(-60),
      future: [],
      selection: null,
      selectedIds: [],
      filters: structuredClone(EMPTY_FILTERS),
    }));
    scheduleSave();
    return web.id;
  },
  deleteWeb: (id) => {
    const state = get();
    if (state.readOnly || !state.webs.some((w) => w.id === id)) return;
    let webs = state.webs.filter((w) => w.id !== id);
    if (!webs.length) webs = [makeWeb("My web")];
    set({
      webs,
      activeId: state.activeId === id ? webs[0].id : state.activeId,
      history: [...state.history, workspaceHistory(state, "Delete web")].slice(
        -60,
      ),
      future: [],
      selection: null,
      selectedIds: [],
      filters: structuredClone(EMPTY_FILTERS),
    });
    scheduleSave();
  },
  renameWeb: (id, name) => {
    if (
      get().readOnly ||
      !name.trim() ||
      !get().webs.some((w) => w.id === id && w.name !== name.trim())
    )
      return;
    set((state) => ({
      webs: state.webs.map((w) =>
        w.id === id
          ? { ...w, name: name.trim(), updatedAt: new Date().toISOString() }
          : w,
      ),
      history: [...state.history, workspaceHistory(state, "Rename web")].slice(
        -60,
      ),
      future: [],
    }));
    scheduleSave();
  },
  undo: () => {
    const state = get();
    if (state.readOnly || !state.history.length) return;
    const entry = state.history[state.history.length - 1];
    if (entry.workspace) {
      const inverse = workspaceHistory(state, entry.label);
      set({
        ...restoreWorkspace(entry.workspace, state, entry),
        history: state.history.slice(0, -1),
        future: [...state.future, inverse],
        selection: null,
        selectedIds: [],
        recent: [],
        filters: structuredClone(EMPTY_FILTERS),
      });
      scheduleSave();
      return;
    }
    const current = getActiveWeb(state)!;
    const restored = restoreHistoryLayout(entry.web, current, entry);
    set({
      webs: state.webs.map((w) => (w.id === current.id ? restored : w)),
      history: state.history.slice(0, -1),
      future: [...state.future, { ...entry, web: current }],
      ...cleanSelection(restored, state.selection, state.selectedIds),
    });
    scheduleSave();
  },
  redo: () => {
    const state = get();
    if (state.readOnly || !state.future.length) return;
    const entry = state.future[state.future.length - 1];
    if (entry.workspace) {
      const inverse = workspaceHistory(state, entry.label);
      set({
        ...restoreWorkspace(entry.workspace, state, entry),
        future: state.future.slice(0, -1),
        history: [...state.history, inverse].slice(-60),
        selection: null,
        selectedIds: [],
        recent: [],
        filters: structuredClone(EMPTY_FILTERS),
      });
      scheduleSave();
      return;
    }
    const current = getActiveWeb(state)!;
    const restored = restoreHistoryLayout(entry.web, current, entry);
    set({
      webs: state.webs.map((w) => (w.id === current.id ? restored : w)),
      future: state.future.slice(0, -1),
      history: [...state.history, { ...entry, web: current }],
      ...cleanSelection(restored, state.selection, state.selectedIds),
    });
    scheduleSave();
  },
  importWeb: (input) => {
    if (get().readOnly) return "";
    const valid = validateWeb(input);
    const web = copyWeb(valid, valid.name);
    set((state) => ({
      webs: [...state.webs, web],
      activeId: web.id,
      history: [],
      future: [],
      selection: null,
      selectedIds: [],
      filters: structuredClone(EMPTY_FILTERS),
    }));
    persistenceBlocked = false;
    scheduleSave();
    return web.id;
  },
  forkShared: () => {
    const shared = get().sharedWeb;
    if (!shared) return;
    const web = copyWeb(shared, `${shared.name} (my copy)`);
    set((state) => ({
      webs: [...state.webs, web],
      activeId: web.id,
      readOnly: false,
      sharedWeb: null,
      history: [],
      future: [],
      selection: null,
      selectedIds: [],
      filters: structuredClone(EMPTY_FILTERS),
    }));
    if (typeof window !== "undefined")
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    scheduleSave();
    return web.id;
  },
  setShared: (web) =>
    set({
      sharedWeb: validateWeb(web),
      readOnly: true,
      selection: null,
      selectedIds: [],
      filters: structuredClone(EMPTY_FILTERS),
      history: [],
      future: [],
    }),
  updatePositions: (positions, pinned) => {
    const state = get();
    if (state.readOnly) return;
    const current = getActiveWeb(state);
    if (!current) return;
    let changed = false;
    const people = { ...current.people };
    for (const [id, position] of Object.entries(positions)) {
      const p = people[id];
      if (!p || ![position.x, position.y, position.z].every(Number.isFinite))
        continue;
      if (
        !p.position ||
        Math.abs(p.position.x - position.x) +
          Math.abs(p.position.y - position.y) +
          Math.abs(p.position.z - position.z) >
          0.05 ||
        (pinned !== undefined && p.pinned !== pinned)
      ) {
        people[id] = {
          ...p,
          position: { ...position },
          ...(pinned !== undefined ? { pinned } : {}),
        };
        changed = true;
      }
    }
    if (changed) {
      set({
        webs: state.webs.map((w) =>
          w.id === current.id ? { ...w, people } : w,
        ),
      });
      scheduleSave();
    }
  },
  setCamera: (camera) => {
    const state = get();
    if (
      state.readOnly ||
      ![
        camera.position.x,
        camera.position.y,
        camera.position.z,
        camera.target.x,
        camera.target.y,
        camera.target.z,
      ].every(Number.isFinite)
    )
      return;
    const web = getActiveWeb(state);
    if (!web) return;
    if (JSON.stringify(web.camera) === JSON.stringify(camera)) return;
    set({
      webs: state.webs.map((w) =>
        w.id === web.id ? { ...w, camera: structuredClone(camera) } : w,
      ),
    });
    scheduleSave();
  },
  addPerson: (person) => {
    if (get().readOnly) return "";
    const p = makePerson(person.firstName, person);
    get().mutate("Add person", (web) => {
      web.people[p.id] = p;
    });
    return p.id;
  },
  updatePerson: (id, patch) =>
    get().mutate("Edit person", (web) => {
      if (web.people[id])
        web.people[id] = {
          ...web.people[id],
          ...patch,
          id,
          updatedAt: new Date().toISOString(),
        };
    }),
  deletePeople: (ids) =>
    get().mutate("Delete people", (web) => {
      ids.forEach((id) => delete web.people[id]);
    }),
  duplicatePerson: (id) => {
    const old = getActiveWeb(get())?.people[id];
    if (!old || get().readOnly) return;
    const p = structuredClone(old);
    p.id = crypto.randomUUID();
    p.firstName = `${p.firstName} (copy)`;
    p.createdAt = p.updatedAt = new Date().toISOString();
    if (p.position)
      p.position = {
        x: p.position.x + 15,
        y: p.position.y + 15,
        z: p.position.z,
      };
    get().mutate("Duplicate person", (web) => {
      web.people[p.id] = p;
    });
    return p.id;
  },
  mergePeople: (keepId, removeId) =>
    get().mutate("Merge people", (web) => {
      const keep = web.people[keepId],
        remove = web.people[removeId];
      if (!keep || !remove || keepId === removeId) return;
      web.people[keepId] = {
        ...remove,
        ...Object.fromEntries(
          Object.entries(keep).filter(([, v]) => v !== undefined && v !== ""),
        ),
        id: keepId,
        tags: [...new Set([...keep.tags, ...remove.tags])],
        groups: [...new Set([...keep.groups, ...remove.groups])],
        custom: { ...remove.custom, ...keep.custom },
        dates: { ...remove.dates, ...keep.dates },
        metadata: { ...remove.metadata, ...keep.metadata },
        notes: [keep.notes, remove.notes].filter(Boolean).join("\n\n"),
        updatedAt: new Date().toISOString(),
      };
      Object.values(web.links).forEach((l) => {
        if (l.source === removeId) l.source = keepId;
        if (l.target === removeId) l.target = keepId;
        if (l.source === l.target) delete web.links[l.id];
      });
      delete web.people[removeId];
    }),
  addConnections: (connections) =>
    get().mutate("Add connections", (web) => {
      connections.forEach((l) => {
        if (
          web.people[l.source] &&
          web.people[l.target] &&
          web.types.some((t) => t.id === l.type)
        )
          web.links[l.id] = structuredClone(l);
      });
    }),
  deleteConnections: (ids) =>
    get().mutate("Delete connections", (web) => {
      ids.forEach((id) => delete web.links[id]);
    }),
  clearError: () => set({ error: null }),
  retrySave: () => {
    persistenceBlocked = false;
    set({ error: null });
    scheduleSave();
  },
  deleteAllData: async () => {
    if (get().readOnly) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = undefined;
    ++revision;
    await writeQueue.catch(() => undefined);
    await deleteData();
    const web = makeWeb("My web");
    set({
      webs: [web],
      activeId: web.id,
      selection: null,
      selectedIds: [],
      recent: [],
      history: [],
      future: [],
      filters: structuredClone(EMPTY_FILTERS),
      saveStatus: "saved",
      error: null,
    });
    persistenceBlocked = false;
    scheduleSave();
  },
  restoreRecovery: async () => {
    if (get().readOnly) return;
    const recovery = validateWorkspace(await readRecovery());
    if (!recovery) throw new Error("No recovery snapshot is available.");
    set({
      ...recovery,
      history: [],
      future: [],
      selection: null,
      selectedIds: [],
      filters: structuredClone(EMPTY_FILTERS),
    });
    persistenceBlocked = false;
    scheduleSave();
  },
}));
