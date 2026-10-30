import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Download,
  Expand,
  Eye,
  EyeOff,
  Filter,
  Focus,
  GitBranch,
  Globe2,
  Grid2X2,
  Heart,
  Link2,
  List,
  LoaderCircle,
  LockKeyhole,
  Maximize,
  Menu,
  Network,
  Palette,
  Pin,
  Plus,
  Redo2,
  Search,
  Settings2,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Undo2,
  Upload,
  UserRound,
  Users,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useStore, getActiveWeb } from "./store";
import {
  displayName,
  type Person,
  type Connection,
  type Selection,
  type Settings,
} from "./types";
import { EMPTY_FILTERS } from "./lib/defaults";
import {
  degrees,
  filterPeople,
  components,
  shortestPath,
  neighbors,
  mutualFriends,
  searchPeople,
} from "./lib/graph";
import {
  PersonEditor,
  ConnectionEditor,
  BulkEditor,
  TypesEditor,
} from "./components/Editors";
import { Modal } from "./components/Modal";
import { SettingsPanel } from "./components/SettingsPanel";
import { ShareDialog } from "./components/ShareDialog";
import { UnlockDialog, type LockedSnapshot } from "./components/UnlockDialog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import type { GraphHandle } from "./components/Graph";
import {
  parseImport,
  parseCSV,
  exportJSON,
  downloadFile,
} from "./lib/importExport";
const Graph = lazy(() => import("./components/Graph"));
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
function Avatar({ person, size = 36 }: { person: Person; size?: number }) {
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: `${person.color || "#a78bfa"}20`,
        color: person.color || "#c4b5fd",
        borderColor: `${person.color || "#a78bfa"}40`,
      }}
    >
      {person.photo ? (
        <img src={person.photo} alt="" />
      ) : (
        <span>
          {person.firstName[0]}
          {person.lastName?.[0]}
        </span>
      )}
    </span>
  );
}
function IconButton({
  label,
  children,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={`icon-button ${active ? "active" : ""}`}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function FriendWeb() {
  const state = useStore();
  const web = getActiveWeb(state);
  const graph = useRef<GraphHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [lockedSnapshot, setLockedSnapshot] = useState<LockedSnapshot | null>(
    () =>
      location.hash.startsWith("#locked=")
        ? { payload: location.hash.slice(8), source: "link" }
        : null,
  );
  useEffect(() => {
    const onHashChange = () => {
      if (location.hash.startsWith("#locked="))
        setLockedSnapshot({ payload: location.hash.slice(8), source: "link" });
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const [demoDismissed, setDemoDismissed] = useState(false);
  const [page, setPage] = useState<"graph" | "people" | "insights">("graph");
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [webMenu, setWebMenu] = useState(false);
  const [dialog, setDialog] = useState<
    | "person"
    | "connection"
    | "share"
    | "types"
    | "bulk"
    | "web"
    | "shortcuts"
    | "import"
    | "path"
    | "views"
    | null
  >(null);
  const [editPerson, setEditPerson] = useState<Person>();
  const [editLink, setEditLink] = useState<Connection>();
  const [source, setSource] = useState<string>();
  const [target, setTarget] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [confirm, setConfirm] = useState<{
    title: string;
    text: string;
    action: () => void;
  } | null>(null);
  const [newName, setNewName] = useState("");
  const [renameMode, setRenameMode] = useState(false);
  const [template, setTemplate] = useState(false);
  const [context, setContext] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [detailTab, setDetailTab] = useState("overview");
  const [hops, setHops] = useState(0);
  const [isolate, setIsolate] = useState(false);
  const [pathStart, setPathStart] = useState("");
  const [pathEnd, setPathEnd] = useState("");
  const [path, setPath] = useState<string[]>([]);
  const [sort, setSort] = useState("name");
  const [multiMode, setMultiMode] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvError, setCsvError] = useState("");
  const [viewName, setViewName] = useState("");
  const [bookmarkName, setBookmarkName] = useState("");
  const say = (message: string) => setToast(message);
  useEffect(() => {
    if (!state.ready) void useStore.getState().init();
  }, [state.ready]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const editing = (e.target as HTMLElement)?.closest(
        "input,textarea,select,[contenteditable]",
      );
      if (
        (e.key === "k" && (e.ctrlKey || e.metaKey)) ||
        (e.key === "/" && !editing)
      ) {
        e.preventDefault();
        setCommandOpen(true);
      }
      if (editing) return;
      if (e.key === "Escape") {
        setContext(null);
        setCommandOpen(false);
        setHops(0);
        setIsolate(false);
        graph.current?.beginConnect("");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) useStore.getState().redo();
        else useStore.getState().undo();
      }
      if (e.key === "f") graph.current?.fit();
      if (e.key === "n" && !e.ctrlKey && !e.metaKey) {
        setEditPerson(undefined);
        setDialog("person");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const allPeople = useMemo(
    () => Object.values(web?.people || {}),
    [web?.people],
  );
  const allLinks = useMemo(() => Object.values(web?.links || {}), [web?.links]);
  const degree = useMemo(() => (web ? degrees(web) : {}), [web]);
  const filtered = useMemo(
    () => (web ? filterPeople(web, state.filters) : []),
    [web, state.filters],
  );
  const selected =
    state.selection?.kind === "person"
      ? web?.people[state.selection.id]
      : undefined;
  const selectedLink =
    state.selection?.kind === "link"
      ? web?.links[state.selection.id]
      : undefined;
  const emphasis = useMemo(
    () =>
      web && selected && hops ? neighbors(web, selected.id, hops) : undefined,
    [web, selected, hops],
  );
  const visiblePeople = useMemo(
    () =>
      isolate && emphasis
        ? filtered.filter((p) => emphasis.has(p.id))
        : filtered,
    [filtered, isolate, emphasis],
  );
  const visibleSet = useMemo(
    () => new Set(visiblePeople.map((p) => p.id)),
    [visiblePeople],
  );
  const visibleLinks = useMemo(
    () =>
      allLinks.filter(
        (l) =>
          (state.filters.showHidden || !l.hidden) &&
          (!state.filters.type || l.type === state.filters.type) &&
          visibleSet.has(l.source) &&
          visibleSet.has(l.target),
      ),
    [allLinks, state.filters.showHidden, state.filters.type, visibleSet],
  );
  const groups = useMemo(
    () => [...new Set(allPeople.flatMap((p) => p.groups))].sort(),
    [allPeople],
  );
  const tags = useMemo(
    () => [...new Set(allPeople.flatMap((p) => p.tags))].sort(),
    [allPeople],
  );
  const commandResults = useMemo(
    () => (web ? searchPeople(web, state.filters.query) : []),
    [web, state.filters.query],
  );
  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) =>
        sort === "connections"
          ? (degree[b.id] || 0) - (degree[a.id] || 0)
          : sort === "recent"
            ? b.updatedAt.localeCompare(a.updatedAt)
            : displayName(a).localeCompare(displayName(b)),
      ),
    [filtered, sort, degree],
  );
  const filterCount = Object.entries(state.filters).filter(
    ([k, v]) => v !== EMPTY_FILTERS[k as keyof typeof EMPTY_FILTERS],
  ).length;
  useEffect(() => {
    setPath([]);
    setHops(0);
    setIsolate(false);
    setSettingsOpen(false);
    setLeftOpen(false);
  }, [state.activeId]);
  function choose(selection: Selection, additive = false) {
    state.select(selection, additive || multiMode);
    setDetailTab("overview");
    if (selection) {
      setRightOpen(true);
      if (selection.kind === "person") {
        graph.current?.focus(selection.id);
        setHops(1);
      }
    }
    setContext(null);
  }
  function newPerson() {
    setEditPerson(undefined);
    setDialog("person");
  }
  function newConnection(sourceId?: string, targetId?: string) {
    setEditLink(undefined);
    setSource(sourceId);
    setTarget(targetId);
    setDialog("connection");
  }
  function savePerson(person: Person) {
    state.mutate("Save person", (w) => {
      w.people[person.id] = {
        ...person,
        position: w.people[person.id]?.position || person.position,
      };
    });
    state.select({ kind: "person", id: person.id });
    say("Person saved to your web");
  }
  function saveLinks(links: Connection[]) {
    state.mutate("Save connections", (w) =>
      links.forEach((l) => {
        w.links[l.id] = l;
      }),
    );
    say(`${links.length} connection${links.length === 1 ? "" : "s"} saved`);
  }
  function updatePerson(patch: Partial<Person>) {
    if (selected)
      state.mutate("Update person", (w) => {
        Object.assign(w.people[selected.id], patch, {
          updatedAt: new Date().toISOString(),
        });
      });
  }
  function removePerson(person: Person) {
    setConfirm({
      title: `Delete ${displayName(person)}?`,
      text: "This also removes their connections. You can undo this change.",
      action: () => {
        state.mutate("Delete person", (w) => {
          delete w.people[person.id];
          Object.values(w.links).forEach((l) => {
            if (l.source === person.id || l.target === person.id)
              delete w.links[l.id];
          });
        });
        say("Person deleted");
      },
    });
  }
  function duplicatePerson(person: Person) {
    const id = crypto.randomUUID();
    state.mutate("Duplicate person", (w) => {
      w.people[id] = {
        ...structuredClone(person),
        id,
        firstName: person.firstName,
        nickname: person.nickname ? `${person.nickname} (copy)` : "Copy",
        position: person.position
          ? {
              x: person.position.x + 15,
              y: person.position.y + 15,
              z: person.position.z,
            }
          : undefined,
        pinned: false,
        createdAt: new Date().toISOString(),
      };
    });
    state.select({ kind: "person", id });
    say("Person duplicated; connections were not copied");
  }
  function changeSettings(patch: Partial<Settings>) {
    state.mutate("Change appearance", (w) => {
      Object.assign(w.settings, patch);
    });
  }
  async function readFile(file: File) {
    try {
      if (file.size > 32 * 1024 * 1024)
        throw new Error("Please choose a file smaller than 32 MB.");
      const text = await file.text();
      if (file.name.toLowerCase().endsWith(".csv")) {
        setCsvText(text);
        setDialog("import");
        setCsvError("");
        return;
      }
      let candidate: unknown;
      try {
        candidate = JSON.parse(text);
      } catch {
        /* parseImport supplies the validation message */
      }
      if (
        candidate &&
        typeof candidate === "object" &&
        "kind" in candidate &&
        candidate.kind === "friendweb-encrypted"
      ) {
        if (
          !("version" in candidate) ||
          candidate.version !== 1 ||
          !("payload" in candidate) ||
          typeof candidate.payload !== "string"
        )
          throw new Error(
            "This encrypted snapshot file is invalid or unsupported.",
          );
        setLockedSnapshot({ payload: candidate.payload, source: "file" });
        return;
      }
      const imported = parseImport(text);
      state.importWeb(imported);
      say("Web imported successfully");
    } catch (error) {
      say(error instanceof Error ? error.message : "Could not import file");
    }
  }
  if (!state.ready || !web)
    return (
      <div className="loading-screen">
        <div className="brand-mark">
          <Network size={28} />
        </div>
        <h1>FriendWeb</h1>
        <p>
          <LoaderCircle className="spin" size={15} /> Opening your world…
        </p>
        {state.error && (
          <>
            <p>{state.error}</p>
            <button className="button" onClick={() => location.reload()}>
              Try again
            </button>
          </>
        )}
      </div>
    );
  const readonly = state.readOnly;
  const typeOf = (link: Connection) =>
    web.types.find((t) => t.id === link.type);
  const exportWeb = () => {
    downloadFile(
      `${web.name}.friendweb.json`,
      exportJSON(web),
      "application/json",
    );
    say("Full backup downloaded");
  };
  return (
    <div
      className={`app theme-${web.settings.theme} ${leftOpen ? "left-open" : ""} ${rightOpen ? "right-open" : ""}`}
      style={{ "--accent": web.settings.accent } as React.CSSProperties}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && !readonly) void readFile(file);
      }}
    >
      <header className="app-header">
        <div className="brand">
          <button
            className="mobile-only icon-button"
            aria-label="Open navigation"
            onClick={() => setLeftOpen(!leftOpen)}
          >
            <Menu size={20} />
          </button>
          <div className="brand-mark">
            <Network size={21} />
          </div>
          <span>
            friendweb<span className="brand-dot">.</span>
          </span>
          <span className="local-badge">PERSONAL SPACE</span>
        </div>
        <div className="header-breadcrumb">
          <span>My webs</span>
          <ChevronRight size={13} />
          <strong>{web.name}</strong>
        </div>
        <div className="header-actions">
          <span
            className={`save-state ${state.saveStatus === "error" ? "error" : ""}`}
            title="Everything stays in your browser on this device"
          >
            {readonly ? (
              <Eye size={13} />
            ) : state.saveStatus === "saving" ? (
              <LoaderCircle size={13} className="spin" />
            ) : (
              <span className="status-dot" />
            )}
            {readonly
              ? "Read-only snapshot"
              : state.saveStatus === "saving"
                ? "Saving…"
                : state.saveStatus === "error"
                  ? "Save failed"
                  : "All changes saved"}
          </span>
          <IconButton
            label="Keyboard shortcuts"
            onClick={() => setDialog("shortcuts")}
          >
            <CircleHelp size={17} />
          </IconButton>
          <button
            className="button share-button"
            onClick={() => setDialog("share")}
          >
            <Share2 size={15} />
            <span>Share web</span>
          </button>
          <button
            className="mobile-only icon-button"
            aria-label="Open inspector"
            onClick={() => setRightOpen(!rightOpen)}
          >
            <Settings2 size={20} />
          </button>
        </div>
      </header>
      {(leftOpen || rightOpen) && (
        <button
          className="drawer-scrim mobile-only"
          aria-label="Close drawers"
          onClick={() => {
            setLeftOpen(false);
            setRightOpen(false);
          }}
        />
      )}
      <aside className="left-sidebar">
        <div className="workspace-switch">
          <button
            onClick={() => setWebMenu(!webMenu)}
            className="workspace-button"
          >
            <span className="workspace-icon">
              <Globe2 size={19} />
            </span>
            <span>
              <strong>{web.name}</strong>
              <small>
                {readonly ? "Shared snapshot" : "Your personal universe"}
              </small>
            </span>
            <ChevronDown size={15} />
          </button>
          {webMenu && (
            <div className="web-menu popover">
              <span className="eyebrow">YOUR WEBS</span>
              {state.webs.map((w) => (
                <button
                  key={w.id}
                  onClick={() => {
                    state.setActive(w.id);
                    setWebMenu(false);
                  }}
                >
                  <Globe2 size={15} />
                  <span>{w.name}</span>
                  {w.id === state.activeId && <Check size={15} />}
                </button>
              ))}
              <button
                onClick={() => {
                  setNewName("");
                  setRenameMode(false);
                  setDialog("web");
                  setWebMenu(false);
                }}
              >
                <Plus size={15} />
                Create a new web
              </button>
              {!readonly && (
                <>
                  <button
                    onClick={() => {
                      state.duplicateWeb(web.id);
                      setWebMenu(false);
                      say("Web duplicated");
                    }}
                  >
                    <Copy size={15} />
                    Duplicate this web
                  </button>
                  <button
                    onClick={() => {
                      setNewName(web.name);
                      setRenameMode(true);
                      setDialog("web");
                      setWebMenu(false);
                    }}
                  >
                    <WandSparkles size={15} />
                    Rename this web
                  </button>
                  <button
                    className="danger-text"
                    onClick={() => {
                      setWebMenu(false);
                      setConfirm({
                        title: "Delete this web?",
                        text: "This removes the web and all its people from this device. Export a backup first if you need one.",
                        action: () => state.deleteWeb(web.id),
                      });
                    }}
                  >
                    <Trash2 size={15} />
                    Delete this web
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            className={page === "graph" ? "selected" : ""}
            onClick={() => {
              setPage("graph");
              setLeftOpen(false);
            }}
          >
            <Network size={18} />
            <span>My constellation</span>
            <span className="nav-count">{allPeople.length}</span>
          </button>
          <button
            className={page === "people" ? "selected" : ""}
            onClick={() => {
              setPage("people");
              setLeftOpen(false);
            }}
          >
            <Users size={18} />
            <span>People directory</span>
          </button>
          <button
            className={page === "insights" ? "selected" : ""}
            onClick={() => {
              setPage("insights");
              setLeftOpen(false);
            }}
          >
            <Activity size={18} />
            <span>Web insights</span>
          </button>
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-label">
          <span>PEOPLE</span>
          <div>
            <IconButton
              label="Filter people"
              active={filtersOpen}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <Filter size={13} />
            </IconButton>
            {!readonly && (
              <IconButton label="Add person" onClick={newPerson}>
                <Plus size={16} />
              </IconButton>
            )}
          </div>
        </div>
        <div className="sidebar-search">
          <Search size={15} />
          <input
            ref={searchInput}
            aria-label="Search people and relationships"
            placeholder="Find someone…"
            value={state.filters.query}
            onChange={(e) => state.setFilters({ query: e.target.value })}
          />
          <button
            className="keycap"
            onClick={() => setCommandOpen(true)}
            aria-label="Open command palette"
          >
            ⌘ K
          </button>
        </div>
        {filtersOpen && (
          <div className="filters-panel">
            <div className="row between">
              <strong>Refine your view</strong>
              <button
                className="text-button"
                onClick={() => state.setFilters(EMPTY_FILTERS)}
              >
                Reset
              </button>
            </div>
            <label className="field">
              Group
              <select
                value={state.filters.group}
                onChange={(e) => state.setFilters({ group: e.target.value })}
              >
                <option value="">All groups</option>
                {groups.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Tag
              <select
                value={state.filters.tag}
                onChange={(e) => state.setFilters({ tag: e.target.value })}
              >
                <option value="">All tags</option>
                {tags.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Relationship
              <select
                value={state.filters.type}
                onChange={(e) => state.setFilters({ type: e.target.value })}
              >
                <option value="">All relationships</option>
                {web.types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Gender
              <input
                value={state.filters.gender}
                onChange={(e) => state.setFilters({ gender: e.target.value })}
                placeholder="Any gender"
              />
            </label>
            <div className="field-grid">
              <label className="field">
                Min. links
                <input
                  type="number"
                  min="0"
                  value={state.filters.minDegree}
                  onChange={(e) =>
                    state.setFilters({ minDegree: +e.target.value })
                  }
                />
              </label>
              <label className="field">
                Max. links
                <input
                  type="number"
                  min="0"
                  value={
                    state.filters.maxDegree === 999999
                      ? ""
                      : state.filters.maxDegree
                  }
                  onChange={(e) =>
                    state.setFilters({
                      maxDegree: e.target.value ? +e.target.value : 999999,
                    })
                  }
                />
              </label>
            </div>
            <label className="field">
              Custom attribute
              <input
                placeholder="Field name"
                value={state.filters.customKey}
                onChange={(e) =>
                  state.setFilters({ customKey: e.target.value })
                }
              />
              <input
                placeholder="Value"
                value={state.filters.customValue}
                onChange={(e) =>
                  state.setFilters({ customValue: e.target.value })
                }
              />
            </label>
            <div className="field-grid">
              <label className="field">
                Added after
                <input
                  type="date"
                  value={state.filters.since}
                  onChange={(e) => state.setFilters({ since: e.target.value })}
                />
              </label>
              <label className="field">
                Before
                <input
                  type="date"
                  value={state.filters.until}
                  onChange={(e) => state.setFilters({ until: e.target.value })}
                />
              </label>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={state.filters.showHidden}
                onChange={(e) =>
                  state.setFilters({ showHidden: e.target.checked })
                }
              />{" "}
              Include hidden
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={state.filters.favorites}
                onChange={(e) =>
                  state.setFilters({ favorites: e.target.checked })
                }
              />{" "}
              Favorites only
            </label>
            <button
              className="button secondary full-width"
              onClick={() => setDialog("views")}
            >
              <Bookmark size={14} />
              Saved views
            </button>
          </div>
        )}
        <div className="people-list">
          {!allPeople.length ? (
            <div className="sidebar-empty">
              <Users size={25} />
              <p>Your people will appear here.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="sidebar-empty">
              <Search size={25} />
              <p>No people match these filters.</p>
              <button
                className="text-button"
                onClick={() => state.setFilters(EMPTY_FILTERS)}
              >
                Clear filters
              </button>
            </div>
          ) : (
            sorted.map((p) => (
              <button
                className={`person-row ${state.selectedIds.includes(p.id) || selected?.id === p.id ? "selected" : ""}`}
                key={p.id}
                onClick={(e) =>
                  choose(
                    { kind: "person", id: p.id },
                    e.ctrlKey || e.metaKey || e.shiftKey,
                  )
                }
              >
                <Avatar person={p} />
                <span className="person-row-text">
                  <strong>{displayName(p)}</strong>
                  <small>
                    {p.nickname ||
                      p.groups[0] ||
                      p.pronouns ||
                      "In your constellation"}
                  </small>
                </span>
                {p.favorite ? (
                  <Star size={12} className="star-icon" />
                ) : (
                  <span className="degree-number">{degree[p.id] || 0}</span>
                )}
              </button>
            ))
          )}
        </div>
        <div className="sidebar-groups">
          <div className="sidebar-label">
            <span>YOUR CIRCLES</span>
            <span className="muted">{groups.length}</span>
          </div>
          <div className="group-chips">
            {groups.slice(0, 8).map((g, i) => (
              <button
                className={`group-chip ${state.filters.group === g ? "active" : ""}`}
                key={g}
                onClick={() =>
                  state.setFilters({
                    group: state.filters.group === g ? "" : g,
                  })
                }
              >
                <span
                  style={{
                    background:
                      web.settings.groupColors[g] ||
                      ["#b9a0f8", "#69c9b3", "#f4bd7a", "#86b3ef"][i % 4],
                  }}
                />
                {g}
                <small>
                  {allPeople.filter((p) => p.groups.includes(g)).length}
                </small>
              </button>
            ))}
            {!groups.length && (
              <p className="muted">Add groups to organize your people.</p>
            )}
          </div>
        </div>
        <div className="sidebar-footer">
          <ShieldCheck size={16} />
          <span>
            Only on this device.
            <br />
            <strong>Always yours. Always free.</strong>
          </span>
          <IconButton
            label="Privacy and data"
            onClick={() => setDialog("import")}
          >
            <ChevronRight size={15} />
          </IconButton>
        </div>
      </aside>
      <main className="main-content">
        {readonly && (
          <div className="snapshot-banner">
            <Eye size={15} />
            <span>
              You’re exploring a shared snapshot. Changes won’t sync with the
              owner.
            </span>
            <button
              className="button primary compact"
              onClick={() => {
                state.forkShared();
                say("Snapshot copied to your local webs");
              }}
            >
              <Copy size={13} />
              Copy to My Webs
            </button>
          </div>
        )}
        <div className="canvas-header">
          <div>
            <div className="eyebrow">
              <span className="little-spark">✦</span> YOUR PEOPLE, IN
              PERSPECTIVE
            </div>
            <h1>
              {page === "graph"
                ? "A little universe of you."
                : page === "people"
                  ? "Every person, a connection."
                  : "The shape of your world."}
            </h1>
            <p>
              {page === "graph"
                ? "Explore the connections that make your world, yours."
                : page === "people"
                  ? "A thoughtful home for the people you know."
                  : "Small insights into the connections you’ve mapped."}
            </p>
          </div>
          <div className="view-options">
            <div className="segmented">
              <button
                title="3D constellation"
                aria-label="3D constellation"
                className={page === "graph" ? "active" : ""}
                onClick={() => setPage("graph")}
              >
                <Network size={16} />
                3D
              </button>
              <button
                title="People directory"
                aria-label="People directory"
                className={page === "people" ? "active" : ""}
                onClick={() => setPage("people")}
              >
                <List size={16} />
              </button>
            </div>
            <IconButton
              label="Appearance and physics"
              active={settingsOpen}
              onClick={() => {
                setSettingsOpen(!settingsOpen);
                setRightOpen(true);
              }}
            >
              <SlidersIcon />
            </IconButton>
          </div>
        </div>
        {page === "graph" && (
          <div className="graph-view">
            <ErrorBoundary
              fallback={
                <div className="graph-fallback">
                  <Network size={35} />
                  <h2>3D view couldn’t start</h2>
                  <p>
                    Try a browser with WebGL enabled. Your people and
                    connections are safe.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => setPage("people")}
                  >
                    Open people directory
                  </button>
                </div>
              }
            >
              <Suspense
                fallback={
                  <div className="graph-fallback">
                    <LoaderCircle className="spin" />
                    <p>Preparing your constellation…</p>
                  </div>
                }
              >
                <Graph
                  ref={graph}
                  web={web}
                  people={visiblePeople}
                  links={visibleLinks}
                  selection={state.selection}
                  selectedIds={state.selectedIds}
                  emphasizedIds={emphasis}
                  pathIds={path.length ? new Set(path) : undefined}
                  onSelect={choose}
                  onContext={(id, x, y) => setContext({ id, x, y })}
                  onLinkCreate={(a, b) => newConnection(a, b)}
                  onPositions={(positions) => state.updatePositions(positions)}
                  onPin={(id, pinned) =>
                    state.mutate("Pin person", (w) => {
                      if (w.people[id]) w.people[id].pinned = pinned;
                    })
                  }
                  onCamera={(camera) => state.setCamera(camera)}
                />
              </Suspense>
            </ErrorBoundary>
            <div className="canvas-stats">
              <span>
                <span className="stat-dot purple" />
                <strong>{visiblePeople.length}</strong> people
              </span>
              <span>
                <Link2 size={12} />
                <strong>{visibleLinks.length}</strong> connections
              </span>
              <span>
                <span className="stat-dot teal" />
                <strong>{groups.length}</strong> circles
              </span>
            </div>
            {allPeople.length === 0 && (
              <div className="empty-graph">
                <span className="empty-orbit">
                  <Users size={36} />
                </span>
                <h2>Your world starts with one person.</h2>
                <p>
                  Add someone you know. Watch your constellation take shape, one
                  connection at a time.
                </p>
                <button className="button primary" onClick={newPerson}>
                  <Plus size={17} />
                  Add your first person
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    state.createWeb("Demo constellation", true);
                    say("Demo web created");
                  }}
                >
                  Explore an example first <ArrowRight size={13} />
                </button>
              </div>
            )}
            {web.description.includes("A fictional web") && !demoDismissed && (
              <div className="demo-notice">
                <Sparkles size={12} />
                <span>
                  An example constellation. Make room for your people.
                </span>
                <button
                  onClick={() => {
                    setNewName("");
                    setRenameMode(false);
                    setTemplate(false);
                    setDialog("web");
                  }}
                >
                  Start your own <ArrowRight size={11} />
                </button>
                <button
                  aria-label="Dismiss example tip"
                  onClick={() => setDemoDismissed(true)}
                >
                  <X size={11} />
                </button>
              </div>
            )}
            {filterCount > 0 && (
              <div className="active-filter-badge">
                <Filter size={12} />
                {filterCount} active filter{filterCount > 1 ? "s" : ""}
                <button
                  onClick={() => state.setFilters(EMPTY_FILTERS)}
                  aria-label="Clear filters"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            <div className="graph-controls">
              <IconButton
                label="Zoom in"
                onClick={() => graph.current?.zoom(0.8)}
              >
                <ZoomIn size={17} />
              </IconButton>
              <IconButton
                label="Zoom out"
                onClick={() => graph.current?.zoom(1.25)}
              >
                <ZoomOut size={17} />
              </IconButton>
              <div className="control-divider" />
              <IconButton
                label="Fit all people (F)"
                onClick={() => graph.current?.fit()}
              >
                <Focus size={17} />
              </IconButton>
              <IconButton
                label="Reset camera"
                onClick={() => graph.current?.reset()}
              >
                <Maximize size={17} />
              </IconButton>
              <IconButton
                label="Fullscreen"
                onClick={() => {
                  if (document.fullscreenElement)
                    void document.exitFullscreen();
                  else void document.documentElement.requestFullscreen?.();
                }}
              >
                <Expand size={17} />
              </IconButton>
            </div>
            <div className="legend">
              <span className="legend-title">CONNECTIONS</span>
              {web.types
                .filter((t) => allLinks.some((l) => l.type === t.id))
                .slice(0, 7)
                .map((t) => (
                  <button
                    key={t.id}
                    className={state.filters.type === t.id ? "active" : ""}
                    onClick={() =>
                      state.setFilters({
                        type: state.filters.type === t.id ? "" : t.id,
                      })
                    }
                  >
                    <span style={{ background: t.color }} />
                    {t.name}
                  </button>
                ))}
              {!readonly && (
                <button
                  onClick={() => setDialog("types")}
                  aria-label="Manage relationship types"
                  title="Manage relationship types"
                >
                  <Plus size={12} />
                </button>
              )}
            </div>
            <div className="interaction-hint">
              <span>Drag to orbit</span>
              <i>·</i>
              <span>Scroll to explore</span>
              <i>·</i>
              <span>Click to discover</span>
            </div>
          </div>
        )}
        {page === "people" && (
          <div className="directory content-scroll">
            <div className="section-toolbar">
              <div className="row">
                <h2>{filtered.length} people</h2>
                <span className="chip">Your directory</span>
              </div>
              <div className="row">
                <select
                  aria-label="Sort directory"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="name">Name A–Z</option>
                  <option value="connections">Most connections</option>
                  <option value="recent">Recently updated</option>
                </select>
                <button
                  className="button secondary"
                  onClick={() => setMultiMode(!multiMode)}
                >
                  <Check size={14} />
                  {multiMode ? "Done selecting" : "Select people"}
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Circles & tags</th>
                    <th>Connections</th>
                    <th>Added</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p) => (
                    <tr
                      key={p.id}
                      className={
                        state.selectedIds.includes(p.id) ? "selected" : ""
                      }
                      onClick={(e) =>
                        choose(
                          { kind: "person", id: p.id },
                          e.ctrlKey || e.metaKey || e.shiftKey,
                        )
                      }
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter")
                          choose({ kind: "person", id: p.id });
                      }}
                    >
                      <td>
                        <div className="row">
                          <Avatar person={p} size={40} />
                          <span>
                            <strong>{displayName(p)}</strong>
                            <small>{p.nickname || p.pronouns || "—"}</small>
                          </span>
                          {p.favorite && (
                            <Star className="star-icon" size={13} />
                          )}
                        </div>
                      </td>
                      <td>
                        {[...p.groups, ...p.tags.map((t) => `#${t}`)]
                          .slice(0, 3)
                          .map((t) => (
                            <span className="chip" key={t}>
                              {t}
                            </span>
                          ))}
                      </td>
                      <td>{degree[p.id] || 0}</td>
                      <td className="muted">{dateLabel(p.createdAt)}</td>
                      <td>
                        <ChevronRight size={15} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length && (
                <div className="directory-empty">
                  <Users size={30} />
                  <h3>No people to show</h3>
                  <button className="button primary" onClick={newPerson}>
                    Add a person
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {page === "insights" && (
          <div className="insights content-scroll">
            <div className="insight-grid">
              {[
                {
                  label: "People in your world",
                  value: allPeople.length,
                  icon: <Users />,
                },
                {
                  label: "Connections mapped",
                  value: allLinks.length,
                  icon: <Link2 />,
                },
                {
                  label: "Relationship types used",
                  value: new Set(allLinks.map((l) => l.type)).size,
                  icon: <GitBranch />,
                },
                {
                  label: "Connected components",
                  value: components(web).length,
                  icon: <Network />,
                },
              ].map((s) => (
                <div className="insight-card" key={s.label}>
                  {s.icon}
                  <strong>{s.value}</strong>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
            <div className="insight-columns">
              <section className="surface-card">
                <span className="eyebrow">THE THREADS BETWEEN PEOPLE</span>
                <h2>Relationship breakdown</h2>
                {web.types
                  .filter((t) => allLinks.some((l) => l.type === t.id))
                  .map((t) => {
                    const n = allLinks.filter((l) => l.type === t.id).length;
                    return (
                      <div className="breakdown-row" key={t.id}>
                        <span>
                          <i style={{ background: t.color }} />
                          {t.name}
                        </span>
                        <div className="bar-track">
                          <div
                            style={{
                              width: `${(n / Math.max(1, allLinks.length)) * 100}%`,
                              background: t.color,
                            }}
                          />
                        </div>
                        <strong>{n}</strong>
                      </div>
                    );
                  })}
              </section>
              <section className="surface-card">
                <span className="eyebrow">PEOPLE AT THE CENTER</span>
                <h2>Most connected</h2>
                {[...allPeople]
                  .sort((a, b) => (degree[b.id] || 0) - (degree[a.id] || 0))
                  .slice(0, 6)
                  .map((p, i) => (
                    <button
                      className="rank-row"
                      key={p.id}
                      onClick={() => {
                        setPage("graph");
                        choose({ kind: "person", id: p.id });
                        setTimeout(() => graph.current?.focus(p.id), 200);
                      }}
                    >
                      <span className="muted">0{i + 1}</span>
                      <Avatar person={p} />
                      <strong>{displayName(p)}</strong>
                      <span className="chip">{degree[p.id] || 0} links</span>
                    </button>
                  ))}
              </section>
              <section className="surface-card">
                <GitBranch className="accent" />
                <h2>Find a path</h2>
                <p className="muted">
                  See the shortest chain of connections between any two people.
                  Directed links can be traversed either way for this
                  exploration.
                </p>
                <button
                  className="button secondary"
                  onClick={() => setDialog("path")}
                >
                  Explore connections <ArrowRight size={14} />
                </button>
              </section>
              <section className="surface-card">
                <Copy className="accent" />
                <h2>Similar names</h2>
                <p className="muted">
                  Same names may be different people. Review before merging.
                </p>
                {allPeople
                  .filter((p, i) =>
                    allPeople.some(
                      (o, j) =>
                        j < i &&
                        displayName(o).toLowerCase() ===
                          displayName(p).toLowerCase(),
                    ),
                  )
                  .map((p) => (
                    <button
                      className="person-row"
                      key={p.id}
                      onClick={() => choose({ kind: "person", id: p.id })}
                    >
                      <Avatar person={p} />
                      <strong>{displayName(p)}</strong>
                      <ChevronRight size={13} />
                    </button>
                  ))}
                {!allPeople.some((p, i) =>
                  allPeople.some(
                    (o, j) =>
                      j < i &&
                      displayName(o).toLowerCase() ===
                        displayName(p).toLowerCase(),
                  ),
                ) && (
                  <span className="chip">
                    <Check size={12} />
                    No exact name matches
                  </span>
                )}
              </section>
            </div>
          </div>
        )}
        <div className="bottom-toolbar">
          <div className="toolbar-group">
            {!readonly && (
              <>
                <button className="button primary" onClick={newPerson}>
                  <Plus size={17} />
                  <span>Person</span>
                </button>
                <button
                  className="button toolbar-connect"
                  onClick={() => newConnection(selected?.id)}
                >
                  <Link2 size={16} />
                  <span>Connection</span>
                </button>
                <span className="toolbar-divider" />
                <IconButton
                  label="Undo (Ctrl+Z)"
                  disabled={!state.history.length}
                  onClick={() => state.undo()}
                >
                  <Undo2 size={17} />
                </IconButton>
                <IconButton
                  label="Redo (Ctrl+Shift+Z)"
                  disabled={!state.future.length}
                  onClick={() => state.redo()}
                >
                  <Redo2 size={17} />
                </IconButton>
                <span className="toolbar-divider" />
              </>
            )}
            <IconButton
              label="Fit constellation"
              onClick={() => {
                setPage("graph");
                graph.current?.fit();
              }}
            >
              <Focus size={18} />
            </IconButton>
            <IconButton
              label="Filters"
              active={filtersOpen}
              onClick={() => {
                setFiltersOpen(!filtersOpen);
                setLeftOpen(true);
              }}
            >
              <Filter size={17} />
            </IconButton>
            <IconButton
              label="Appearance"
              active={settingsOpen}
              onClick={() => {
                setSettingsOpen(!settingsOpen);
                setRightOpen(true);
              }}
            >
              <Palette size={18} />
            </IconButton>
            <IconButton
              label="Saved views and camera bookmarks"
              onClick={() => setDialog("views")}
            >
              <Bookmark size={17} />
            </IconButton>
            <IconButton
              label="Export and import"
              onClick={() => setDialog("import")}
            >
              <ArrowDownToLine size={17} />
            </IconButton>
          </div>
        </div>
        {state.selectedIds.length > 1 && (
          <div className="bulk-bar">
            <Check size={15} />
            <strong>{state.selectedIds.length} selected</strong>
            {!readonly && (
              <>
                <button
                  className="text-button"
                  onClick={() => setDialog("bulk")}
                >
                  Edit together
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setSource(state.selectedIds[0]);
                    setEditLink(undefined);
                    setTarget(undefined);
                    setDialog("connection");
                  }}
                >
                  Connect
                </button>
                <button
                  className="text-button danger-text"
                  onClick={() =>
                    setConfirm({
                      title: `Delete ${state.selectedIds.length} people?`,
                      text: "Their connections will also be removed. This can be undone.",
                      action: () => {
                        const ids = new Set(state.selectedIds);
                        state.mutate("Bulk delete", (w) => {
                          ids.forEach((id) => delete w.people[id]);
                          Object.values(w.links).forEach((l) => {
                            if (ids.has(l.source) || ids.has(l.target))
                              delete w.links[l.id];
                          });
                        });
                      },
                    })
                  }
                >
                  Delete
                </button>
              </>
            )}
            <IconButton
              label="Clear selection"
              onClick={() => state.select(null)}
            >
              <X size={14} />
            </IconButton>
          </div>
        )}
      </main>
      <aside
        className={`right-sidebar ${settingsOpen ? "settings-sidebar" : ""}`}
      >
        {settingsOpen ? (
          <SettingsPanel
            web={web}
            onResetLayout={() =>
              setConfirm({
                title: "Rearrange this constellation?",
                text: "This unpins everyone and creates a fresh layout using your current seed. You can undo the saved position change.",
                action: () => {
                  state.mutate("Reset layout", (w) =>
                    Object.values(w.people).forEach((p) => {
                      p.pinned = false;
                      delete p.position;
                    }),
                  );
                  graph.current?.resetLayout();
                  say("A fresh perspective is taking shape");
                },
              })
            }
            onClose={() => setSettingsOpen(false)}
            onChange={changeSettings}
            onPresetSave={(name) => {
              state.mutate("Save preset", (w) =>
                w.presets.push({
                  id: crypto.randomUUID(),
                  name,
                  settings: structuredClone(w.settings),
                }),
              );
              say("Appearance preset saved");
            }}
            onPresetLoad={(settings) =>
              state.mutate("Apply preset", (w) => {
                w.settings = structuredClone(settings);
              })
            }
            onPresetDelete={(id) =>
              state.mutate("Delete preset", (w) => {
                w.presets = w.presets.filter((p) => p.id !== id);
              })
            }
          />
        ) : selected ? (
          <>
            <div className="inspector-heading">
              <span className="eyebrow">PERSON DETAILS</span>
              <div>
                <IconButton
                  label="Close details"
                  onClick={() => {
                    state.select(null);
                    setRightOpen(false);
                    setHops(0);
                  }}
                >
                  <X size={16} />
                </IconButton>
              </div>
            </div>
            <div className="profile-header">
              <div className="profile-avatar-wrap">
                <Avatar person={selected} size={80} />
                {selected.favorite && (
                  <span className="favorite-mark">
                    <Star size={12} fill="currentColor" />
                  </span>
                )}
              </div>
              <h2>{displayName(selected)}</h2>
              {selected.nickname && (
                <p className="nickname">“{selected.nickname}”</p>
              )}
              <p>
                {[selected.pronouns, selected.groups[0]]
                  .filter(Boolean)
                  .join(" · ") || "Part of your constellation"}
              </p>
              <div className="profile-tags">
                {selected.groups.map((g) => (
                  <span className="chip lavender" key={g}>
                    {g}
                  </span>
                ))}
                {selected.tags.map((t) => (
                  <span className="chip" key={t}>
                    #{t}
                  </span>
                ))}
              </div>
              <div className="profile-actions">
                {!readonly && (
                  <>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setEditPerson(selected);
                        setDialog("person");
                      }}
                    >
                      <UserRound size={14} />
                      Edit person
                    </button>
                    <IconButton
                      label={
                        selected.favorite ? "Remove favorite" : "Add favorite"
                      }
                      active={selected.favorite}
                      onClick={() =>
                        updatePerson({ favorite: !selected.favorite })
                      }
                    >
                      <Star size={15} />
                    </IconButton>
                  </>
                )}
                <IconButton
                  label="Focus on this person"
                  onClick={() => {
                    setPage("graph");
                    graph.current?.focus(selected.id);
                  }}
                >
                  <Focus size={16} />
                </IconButton>
              </div>
            </div>
            <div className="detail-tabs">
              {["overview", "connections", "timeline"].map((tab) => (
                <button
                  className={detailTab === tab ? "active" : ""}
                  key={tab}
                  onClick={() => setDetailTab(tab)}
                >
                  {tab[0].toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div className="inspector-scroll">
              {detailTab === "overview" && (
                <>
                  <section className="detail-section">
                    <div className="row between">
                      <h3>About</h3>
                      <span className="mini-label">
                        {selected.gender || ""}
                      </span>
                    </div>
                    <p className="profile-description">
                      {selected.description ||
                        "Every person has a story. Add a little about them to make this space your own."}
                    </p>
                    {selected.birthday && (
                      <div className="info-row">
                        <span>Birthday</span>
                        <strong>{dateLabel(selected.birthday)}</strong>
                      </div>
                    )}
                    {selected.age !== undefined && (
                      <div className="info-row">
                        <span>Age (provided)</span>
                        <strong>{selected.age}</strong>
                      </div>
                    )}
                    {Object.entries(selected.custom).map(([key, value]) => (
                      <div className="info-row" key={key}>
                        <span>{key}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </section>
                  <section className="detail-section">
                    <div className="row between">
                      <h3>Connection lens</h3>
                      <span className="mini-label">EXPLORE</span>
                    </div>
                    <p className="muted small">
                      Bring their corner of your world into focus.
                    </p>
                    <div className="hop-selector">
                      {[0, 1, 2, 3].map((n) => (
                        <button
                          key={n}
                          className={hops === n ? "active" : ""}
                          onClick={() => setHops(n)}
                        >
                          {n ? n + " hop" + (n > 1 ? "s" : "") : "All"}
                        </button>
                      ))}
                    </div>
                    {hops > 0 && (
                      <label className="checkbox-row small">
                        <input
                          type="checkbox"
                          checked={isolate}
                          onChange={(e) => setIsolate(e.target.checked)}
                        />
                        Hide people outside this network
                      </label>
                    )}
                  </section>
                  <section className="detail-section">
                    <div className="row between">
                      <h3>Personal notes</h3>
                      <LockKeyhole size={12} className="muted" />
                    </div>
                    <textarea
                      aria-label="Personal notes"
                      className="notes-input"
                      value={selected.notes || ""}
                      disabled={readonly}
                      placeholder="Something you’d like to remember…"
                      onChange={(e) => updatePerson({ notes: e.target.value })}
                    />
                    <span className="microcopy">
                      Private by default when you share.
                    </span>
                  </section>
                  <section className="detail-section">
                    <div className="row between">
                      <h3>Quick actions</h3>
                      <span className="muted small">
                        {degree[selected.id] || 0} connections
                      </span>
                    </div>
                    {!readonly && (
                      <>
                        <button
                          className="action-row"
                          onClick={() => newConnection(selected.id)}
                        >
                          <Link2 size={15} />
                          Add connections
                          <Plus size={14} />
                        </button>
                        <button
                          className="action-row"
                          onClick={() => {
                            graph.current?.beginConnect(selected.id);
                            setPage("graph");
                            say("Click another person in the graph to connect");
                          }}
                        >
                          <GitBranch size={15} />
                          Connect in 3D
                          <ArrowRight size={14} />
                        </button>
                        <button
                          className="action-row"
                          onClick={() =>
                            updatePerson({ pinned: !selected.pinned })
                          }
                        >
                          <Pin size={15} />
                          {selected.pinned ? "Unpin position" : "Pin position"}
                          <span className="muted small">
                            {selected.pinned ? "Pinned" : "Free"}
                          </span>
                        </button>
                        <button
                          className="action-row"
                          onClick={() =>
                            updatePerson({ hidden: !selected.hidden })
                          }
                        >
                          <EyeOff size={15} />
                          {selected.hidden
                            ? "Unhide person"
                            : "Hide from graph"}
                        </button>
                        <button
                          className="action-row"
                          onClick={() => duplicatePerson(selected)}
                        >
                          <Copy size={15} />
                          Duplicate person
                        </button>
                        <details className="merge-details">
                          <summary>
                            <GitBranch size={15} />
                            Merge into another person
                          </summary>
                          <p className="muted small">
                            Keep the target’s details and combine connections,
                            notes and tags.
                          </p>
                          <select
                            aria-label="Merge target"
                            defaultValue=""
                            onChange={(e) => {
                              const id = e.target.value;
                              if (!id) return;
                              setConfirm({
                                title: "Merge these people?",
                                text: "The selected person is combined into the target and all connections are rewired. This can be undone.",
                                action: () => {
                                  state.mergePeople(id, selected.id);
                                  say("People merged");
                                },
                              });
                            }}
                          >
                            <option value="">Choose a person…</option>
                            {allPeople
                              .filter((p) => p.id !== selected.id)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {displayName(p)} ·{" "}
                                  {p.groups[0] || p.id.slice(0, 4)}
                                </option>
                              ))}
                          </select>
                        </details>
                        <button
                          className="action-row danger-text"
                          onClick={() => removePerson(selected)}
                        >
                          <Trash2 size={15} />
                          Delete person
                        </button>
                      </>
                    )}
                  </section>
                </>
              )}
              {detailTab === "connections" && (
                <section className="detail-section">
                  <div className="row between">
                    <h3>{degree[selected.id] || 0} connections</h3>
                    {!readonly && (
                      <IconButton
                        label="Add connection"
                        onClick={() => newConnection(selected.id)}
                      >
                        <Plus size={15} />
                      </IconButton>
                    )}
                  </div>
                  {allLinks
                    .filter(
                      (l) =>
                        l.source === selected.id || l.target === selected.id,
                    )
                    .map((l) => {
                      const other =
                        web.people[
                          l.source === selected.id ? l.target : l.source
                        ];
                      const t = typeOf(l);
                      return (
                        other && (
                          <button
                            className="connection-row"
                            key={l.id}
                            onClick={() => choose({ kind: "link", id: l.id })}
                          >
                            <Avatar person={other} />
                            <span>
                              <strong>{displayName(other)}</strong>
                              <small style={{ color: l.color || t?.color }}>
                                {l.directed
                                  ? l.source === selected.id
                                    ? "→ "
                                    : "← "
                                  : ""}
                                {t?.name || "Other"}
                              </small>
                              {l.notes && (
                                <small className="ellipsis">{l.notes}</small>
                              )}
                            </span>
                            <ChevronRight size={13} />
                          </button>
                        )
                      );
                    })}
                  <button
                    className="button secondary full-width"
                    onClick={() => {
                      setPathStart(selected.id);
                      setDialog("path");
                    }}
                  >
                    <GitBranch size={14} />
                    Find a connection path
                  </button>
                </section>
              )}
              {detailTab === "timeline" && (
                <section className="detail-section">
                  <h3>Relationship timeline</h3>
                  <div className="timeline">
                    {[
                      {
                        date: selected.createdAt,
                        title: "Added to your web",
                        note: "",
                      },
                      ...Object.entries(selected.dates).map(
                        ([title, date]) => ({ title, date, note: "" }),
                      ),
                      ...allLinks
                        .filter(
                          (l) =>
                            (l.source === selected.id ||
                              l.target === selected.id) &&
                            l.startDate,
                        )
                        .map((l) => ({
                          date: l.startDate!,
                          title: `${typeOf(l)?.name || "Connection"} with ${displayName(web.people[l.source === selected.id ? l.target : l.source])}`,
                          note: [
                            l.notes,
                            l.endDate ? `Until ${dateLabel(l.endDate)}` : "",
                          ]
                            .filter(Boolean)
                            .join(" · "),
                        })),
                    ]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((event, i) => (
                        <div className="timeline-item" key={i}>
                          <span />
                          <small>{dateLabel(event.date)}</small>
                          <strong>{event.title}</strong>
                          {event.note && <p>{event.note}</p>}
                        </div>
                      ))}
                  </div>
                  <span className="microcopy">
                    Only dates you provide are shown.
                  </span>
                </section>
              )}
            </div>
          </>
        ) : selectedLink ? (
          <>
            <div className="inspector-heading">
              <span className="eyebrow">CONNECTION DETAILS</span>
              <IconButton
                label="Close details"
                onClick={() => state.select(null)}
              >
                <X size={16} />
              </IconButton>
            </div>
            <div className="link-profile">
              <span
                className="link-orb"
                style={{
                  color: selectedLink.color || typeOf(selectedLink)?.color,
                }}
              >
                <Link2 size={28} />
              </span>
              <h2>{typeOf(selectedLink)?.name || "Connection"}</h2>
              <div className="link-endpoints">
                {[selectedLink.source, selectedLink.target].map(
                  (id, i) =>
                    web.people[id] && (
                      <div key={id + i}>
                        {i === 1 &&
                          (selectedLink.directed ? (
                            <ArrowRight size={18} />
                          ) : (
                            <Link2 size={16} />
                          ))}
                        <button onClick={() => choose({ kind: "person", id })}>
                          <Avatar person={web.people[id]} size={43} />
                          <strong>{displayName(web.people[id])}</strong>
                        </button>
                      </div>
                    ),
                )}
              </div>
              <span className="chip">
                {selectedLink.directed
                  ? "Directed connection"
                  : "Undirected connection"}
              </span>
            </div>
            <div className="inspector-scroll">
              <section className="detail-section">
                <h3>Relationship type</h3>
                <select
                  disabled={readonly}
                  aria-label="Relationship type"
                  value={selectedLink.type}
                  onChange={(e) =>
                    state.mutate("Change connection type", (w) => {
                      w.links[selectedLink.id].type = e.target.value;
                    })
                  }
                >
                  {web.types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </section>
              <section className="detail-section">
                <div className="row between">
                  <h3>Comment & notes</h3>
                  <LockKeyhole size={12} />
                </div>
                <textarea
                  aria-label="Connection notes"
                  value={selectedLink.notes || ""}
                  placeholder="What’s the story here?"
                  disabled={readonly}
                  onChange={(e) =>
                    state.mutate("Update connection notes", (w) => {
                      w.links[selectedLink.id].notes = e.target.value;
                    })
                  }
                />
              </section>
              <section className="detail-section">
                {selectedLink.startDate && (
                  <div className="info-row">
                    <span>Since</span>
                    <strong>{dateLabel(selectedLink.startDate)}</strong>
                  </div>
                )}
                {selectedLink.endDate && (
                  <div className="info-row">
                    <span>Until</span>
                    <strong>{dateLabel(selectedLink.endDate)}</strong>
                  </div>
                )}
                <div className="info-row">
                  <span>Weight</span>
                  <strong>{selectedLink.weight}</strong>
                </div>
                {Object.entries(selectedLink.custom).map(([key, value]) => (
                  <div className="info-row" key={key}>
                    <span>{key}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </section>
              {!readonly && (
                <section className="detail-section">
                  <button
                    className="button secondary full-width"
                    onClick={() => {
                      setEditLink(selectedLink);
                      setDialog("connection");
                    }}
                  >
                    <Settings2 size={14} />
                    Edit connection
                  </button>
                  <button
                    className="action-row"
                    onClick={() =>
                      state.mutate("Toggle connection visibility", (w) => {
                        w.links[selectedLink.id].hidden = !selectedLink.hidden;
                      })
                    }
                  >
                    <EyeOff size={15} />
                    {selectedLink.hidden
                      ? "Show connection"
                      : "Hide connection"}
                  </button>
                  <button
                    className="action-row danger-text"
                    onClick={() =>
                      setConfirm({
                        title: "Delete this connection?",
                        text: "Only this relationship is removed. Both people stay in your web. You can undo this.",
                        action: () =>
                          state.mutate("Delete connection", (w) => {
                            delete w.links[selectedLink.id];
                          }),
                      })
                    }
                  >
                    <Trash2 size={15} />
                    Delete connection
                  </button>
                </section>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="inspector-heading">
              <span className="eyebrow">YOUR WEB AT A GLANCE</span>
              <span className="live-badge">
                <span />
                LIVE
              </span>
            </div>
            <div className="welcome-illustration">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="orbit orbit-three" />
              <span className="orbit-core">
                <Heart size={21} />
              </span>
              <i className="planet p1" />
              <i className="planet p2" />
              <i className="planet p3" />
              <i className="planet p4" />
              <Sparkles className="orbit-spark" size={15} />
            </div>
            <div className="overview-intro">
              <h2>
                People make
                <br />
                your world.
              </h2>
              <p>
                A living map of the connections
                <br />
                that matter to you.
              </p>
            </div>
            <div className="overview-totals">
              <div>
                <strong>{allPeople.length}</strong>
                <span>People</span>
              </div>
              <div>
                <strong>{allLinks.length}</strong>
                <span>Connections</span>
              </div>
              <div>
                <strong>{groups.length}</strong>
                <span>Circles</span>
              </div>
            </div>
            <div className="inspector-scroll">
              <section className="detail-section">
                <div className="row between">
                  <h3>Your connection mix</h3>
                  <GitBranch size={14} className="muted" />
                </div>
                <div className="mix-bar">
                  {web.types.map((t) => {
                    const n = allLinks.filter((l) => l.type === t.id).length;
                    return (
                      n > 0 && (
                        <div
                          key={t.id}
                          style={{ background: t.color, flex: n }}
                          title={`${t.name}: ${n}`}
                        />
                      )
                    );
                  })}
                </div>
                {web.types
                  .filter((t) => allLinks.some((l) => l.type === t.id))
                  .slice(0, 5)
                  .map((t) => (
                    <button
                      className="mix-row"
                      key={t.id}
                      onClick={() =>
                        state.setFilters({
                          type: state.filters.type === t.id ? "" : t.id,
                        })
                      }
                    >
                      <span>
                        <i style={{ background: t.color }} />
                        {t.name}
                      </span>
                      <strong>
                        {allLinks.filter((l) => l.type === t.id).length}
                      </strong>
                    </button>
                  ))}
              </section>
              <section className="detail-section">
                <div className="row between">
                  <h3>Recently explored</h3>
                  <span className="mini-label">PEOPLE</span>
                </div>
                {state.recent
                  .map((id) => web.people[id])
                  .filter(Boolean)
                  .slice(0, 3)
                  .map((p) => (
                    <button
                      className="person-row"
                      key={p.id}
                      onClick={() => choose({ kind: "person", id: p.id })}
                    >
                      <Avatar person={p} size={30} />
                      <span className="person-row-text">
                        <strong>{displayName(p)}</strong>
                      </span>
                      <ChevronRight size={13} />
                    </button>
                  ))}
                {!state.recent.length && (
                  <p className="muted small">
                    Click a person to explore their story and connections.
                  </p>
                )}
              </section>
              <div className="tip-card">
                <span className="tip-icon">
                  <Sparkles size={17} />
                </span>
                <strong>A new perspective</strong>
                <p>
                  Click a person to bring their connections into focus. There’s
                  a whole world in every circle.
                </p>
                <button
                  className="text-button"
                  onClick={() => setDialog("shortcuts")}
                >
                  Explore shortcuts <ArrowRight size={12} />
                </button>
              </div>
            </div>
            <div className="right-footer">
              <LockKeyhole size={12} />
              <span>Local-first. Private by nature.</span>
            </div>
          </>
        )}
      </aside>
      <input
        ref={fileInput}
        type="file"
        accept=".json,.csv,application/json,text/csv"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) void readFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {lockedSnapshot && (
        <UnlockDialog
          snapshot={lockedSnapshot}
          onClose={() => {
            if (lockedSnapshot.source === "link")
              window.history.replaceState(
                null,
                "",
                location.pathname + location.search,
              );
            setLockedSnapshot(null);
          }}
          onUnlock={(unlocked) => {
            state.setShared(unlocked);
            setLockedSnapshot(null);
            setDialog(null);
            say("Shared snapshot unlocked");
          }}
        />
      )}
      {dialog === "person" && !readonly && (
        <PersonEditor
          web={web}
          person={editPerson}
          onClose={() => setDialog(null)}
          onSave={savePerson}
        />
      )}
      {dialog === "connection" && !readonly && (
        <ConnectionEditor
          web={web}
          sourceId={source}
          targetId={target}
          connection={editLink}
          onClose={() => setDialog(null)}
          onSave={saveLinks}
          onCreatePerson={savePerson}
        />
      )}
      {dialog === "bulk" && !readonly && (
        <BulkEditor
          web={web}
          ids={state.selectedIds}
          onClose={() => setDialog(null)}
          onApply={(patch, tags, groups) => {
            state.mutate("Bulk edit people", (w) =>
              state.selectedIds.forEach((id) => {
                if (w.people[id]) {
                  Object.assign(w.people[id], patch);
                  w.people[id].tags = [
                    ...new Set([...w.people[id].tags, ...tags]),
                  ];
                  w.people[id].groups = [
                    ...new Set([...w.people[id].groups, ...groups]),
                  ];
                  w.people[id].updatedAt = new Date().toISOString();
                }
              }),
            );
            say("Selected people updated");
          }}
        />
      )}
      {dialog === "types" && !readonly && (
        <TypesEditor
          web={web}
          onClose={() => setDialog(null)}
          onChange={(types) =>
            state.mutate("Update relationship types", (w) => {
              w.types = types;
              Object.values(w.links).forEach((l) => {
                if (!types.some((t) => t.id === l.type))
                  l.type =
                    types.find((t) => t.id === "other")?.id || types[0].id;
              });
            })
          }
        />
      )}
      {dialog === "share" && (
        <ShareDialog web={web} onClose={() => setDialog(null)} />
      )}
      {dialog === "web" && (
        <Modal
          title={renameMode ? "Rename your web" : "A new little universe"}
          subtitle="Keep different parts of your life in independent webs."
          onClose={() => setDialog(null)}
          footer={
            <>
              <button
                className="button secondary"
                onClick={() => setDialog(null)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={!newName.trim() || readonly}
                onClick={() => {
                  if (renameMode) state.renameWeb(web.id, newName.trim());
                  else state.createWeb(newName.trim(), template);
                  setDialog(null);
                  setTemplate(false);
                  say("Web saved");
                }}
              >
                <Check size={15} />
                Save web
              </button>
            </>
          }
        >
          <label className="field">
            Web name
            <input
              autoFocus
              maxLength={100}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. My universe"
            />
          </label>
          <label className="checkbox-row">
            <input
              id="rename-mode"
              type="checkbox"
              checked={renameMode}
              onChange={(e) => setRenameMode(e.target.checked)}
            />
            Rename current web instead
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={template}
              onChange={(e) => setTemplate(e.target.checked)}
            />
            Start with an interactive example
          </label>
        </Modal>
      )}
      {dialog === "shortcuts" && (
        <Modal
          title="A few little shortcuts"
          subtitle="Make yourself at home in FriendWeb."
          onClose={() => setDialog(null)}
        >
          <div className="shortcut-list">
            {[
              ["Search & commands", "⌘ / Ctrl K or /"],
              ["Add a person", "N"],
              ["Fit all people", "F"],
              ["Undo", "⌘ / Ctrl Z"],
              ["Redo", "⌘ / Ctrl Shift Z"],
              ["Select multiple people", "Ctrl / Shift + click"],
              ["Orbit the graph", "Drag empty space"],
              ["Pan the graph", "Right-drag / two fingers"],
              ["Zoom in and out", "Scroll / pinch"],
              ["Close / cancel connection", "Escape"],
            ].map(([label, key]) => (
              <div key={label}>
                <span>{label}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
          <p className="muted small">
            On touchscreens, use “Select people” in the directory for multiple
            selection. Drag a person to pin their position. Right-click a person
            for quick actions.
          </p>
        </Modal>
      )}
      {dialog === "path" && (
        <Modal
          title="Every connection tells a story"
          subtitle="Find the shortest path and see who two people have in common."
          onClose={() => setDialog(null)}
          footer={
            <button
              className="button primary"
              disabled={!pathStart || !pathEnd}
              onClick={() => {
                const result = shortestPath(web, pathStart, pathEnd);
                if (!result.length) {
                  say("These people are in disconnected parts of your web.");
                  return;
                }
                setPath(result);
                setPage("graph");
                setDialog(null);
                setHops(0);
                setIsolate(false);
                state.setFilters({
                  ...EMPTY_FILTERS,
                  showHidden:
                    result.some((id) => web.people[id]?.hidden) ||
                    result.some(
                      (id, i) =>
                        i > 0 &&
                        allLinks.some(
                          (l) =>
                            l.hidden &&
                            ((l.source === result[i - 1] && l.target === id) ||
                              (l.target === result[i - 1] && l.source === id)),
                        ),
                    ),
                });
                graph.current?.fit();
                say(`A path through ${result.length} people highlighted`);
              }}
            >
              <GitBranch size={14} />
              Highlight path
            </button>
          }
        >
          <div className="field-grid">
            {[
              ["From", pathStart, setPathStart],
              ["To", pathEnd, setPathEnd],
            ].map(([label, value, setter]) => (
              <label className="field" key={label as string}>
                {label as string}
                <select
                  value={value as string}
                  onChange={(e) =>
                    (setter as (v: string) => void)(e.target.value)
                  }
                >
                  <option value="">Choose a person</option>
                  {allPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {displayName(p)} {p.groups[0] ? `· ${p.groups[0]}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {pathStart && pathEnd && (
            <div className="surface-card">
              <h3>Mutual connections</h3>
              {mutualFriends(web, pathStart, pathEnd).map((id) => (
                <div className="person-row" key={id}>
                  <Avatar person={web.people[id]} size={30} />
                  {displayName(web.people[id])}
                </div>
              ))}
              {!mutualFriends(web, pathStart, pathEnd).length && (
                <p className="muted">No direct connections in common.</p>
              )}
            </div>
          )}
        </Modal>
      )}
      {dialog === "views" && (
        <Modal
          title="Return to a favorite perspective"
          subtitle="Save filters and camera positions for this web."
          onClose={() => setDialog(null)}
        >
          <h3>Saved views</h3>
          {web.views.map((v) => (
            <div className="saved-row" key={v.id}>
              <Bookmark size={15} />
              <button
                className="text-button"
                onClick={() => {
                  state.setFilters(v.filters);
                  setDialog(null);
                  say("Saved view applied");
                }}
              >
                {v.name}
              </button>
              {!readonly && (
                <IconButton
                  label="Delete view"
                  onClick={() =>
                    state.mutate("Delete view", (w) => {
                      w.views = w.views.filter((x) => x.id !== v.id);
                    })
                  }
                >
                  <Trash2 size={13} />
                </IconButton>
              )}
            </div>
          ))}
          {!readonly && (
            <div className="row">
              <input
                aria-label="Saved view name"
                placeholder="Name this filtered view"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
              />
              <button
                className="button secondary"
                disabled={!viewName.trim()}
                onClick={() => {
                  state.mutate("Save view", (w) =>
                    w.views.push({
                      id: crypto.randomUUID(),
                      name: viewName.trim(),
                      filters: structuredClone(state.filters),
                    }),
                  );
                  setViewName("");
                }}
              >
                Save
              </button>
            </div>
          )}
          <hr />
          <h3>Camera bookmarks</h3>
          {web.bookmarks.map((b) => (
            <div className="saved-row" key={b.id}>
              <Focus size={15} />
              <button
                className="text-button"
                onClick={() => {
                  setPage("graph");
                  graph.current?.restoreCamera(b);
                  setDialog(null);
                }}
              >
                {b.name}
              </button>
              {!readonly && (
                <IconButton
                  label="Delete bookmark"
                  onClick={() =>
                    state.mutate("Delete bookmark", (w) => {
                      w.bookmarks = w.bookmarks.filter((x) => x.id !== b.id);
                    })
                  }
                >
                  <Trash2 size={13} />
                </IconButton>
              )}
            </div>
          ))}
          {!readonly && (
            <div className="row">
              <input
                aria-label="Camera bookmark name"
                placeholder="Name this camera position"
                value={bookmarkName}
                onChange={(e) => setBookmarkName(e.target.value)}
              />
              <button
                className="button secondary"
                disabled={!bookmarkName.trim() || page !== "graph"}
                onClick={() => {
                  const camera = graph.current?.getCamera();
                  if (camera)
                    state.mutate("Save bookmark", (w) =>
                      w.bookmarks.push({
                        id: crypto.randomUUID(),
                        name: bookmarkName.trim(),
                        ...camera,
                      }),
                    );
                  setBookmarkName("");
                }}
              >
                Save
              </button>
            </div>
          )}
        </Modal>
      )}
      {dialog === "import" && (
        <Modal
          title="Your data. Your choice."
          subtitle="FriendWeb works entirely on your device. Keep a backup of what matters."
          wide
          onClose={() => {
            setDialog(null);
            setCsvText("");
            setCsvError("");
          }}
        >
          <div className="data-actions">
            <button onClick={exportWeb}>
              <Download />
              <strong>Export full backup</strong>
              <span>
                All details, photos, styles and positions as portable JSON.
              </span>
            </button>
            <button
              disabled={readonly}
              onClick={() => fileInput.current?.click()}
            >
              <Upload />
              <strong>Import a web or CSV</strong>
              <span>
                Open a FriendWeb JSON file or add people from a spreadsheet.
              </span>
            </button>
            <button
              onClick={() => {
                setPage("graph");
                graph.current?.exportPNG();
                say("Image exported from the current 3D view");
              }}
              disabled={page !== "graph"}
            >
              <Grid2X2 />
              <strong>Save constellation image</strong>
              <span>Download your current view as a PNG image.</span>
            </button>
            <button onClick={() => setDialog("share")}>
              <Share2 />
              <strong>Share a private snapshot</strong>
              <span>
                Choose exactly which details to include in a link or file.
              </span>
            </button>
          </div>
          {!readonly && (
            <details className="csv-import" open={!!csvText}>
              <summary>Paste a CSV spreadsheet</summary>
              <p className="muted small">
                Required heading: firstName. Also accepts lastName, nickname,
                pronouns, gender, birthday, age, description, notes, tags,
                groups, color and custom:Field. Separate tags/groups with a
                semicolon.{" "}
                <a
                  href={`${import.meta.env.BASE_URL}people-template.csv`}
                  download
                >
                  Download template
                </a>
                .
              </p>
              <textarea
                aria-label="CSV people data"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={"firstName,lastName,groups\nAlex,River,Friends"}
              />
              {csvError && <p className="error-text">{csvError}</p>}
              <button
                className="button primary"
                disabled={!csvText.trim()}
                onClick={() => {
                  try {
                    const people = parseCSV(csvText);
                    state.mutate("Import CSV", (w) =>
                      people.forEach((p) => {
                        w.people[p.id] = p;
                      }),
                    );
                    setCsvText("");
                    setDialog(null);
                    say(
                      `${people.length} people imported; same-name people remain separate`,
                    );
                  } catch (error) {
                    setCsvError(
                      error instanceof Error ? error.message : "Invalid CSV",
                    );
                  }
                }}
              >
                <Upload size={15} />
                Import people
              </button>
            </details>
          )}
          <div className="privacy-note">
            <ShieldCheck size={21} />
            <div>
              <strong>No accounts. No servers. No tracking.</strong>
              <p>
                Data lives in this browser’s IndexedDB. Clearing browser data
                removes it. Export backups regularly; private browsing may not
                keep data after closing. Shared snapshots are separate copies
                and do not live-sync.
              </p>
            </div>
          </div>
          {!readonly && (
            <div className="data-recovery row between">
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await state.restoreRecovery();
                    say("Previous save restored");
                    setDialog(null);
                  } catch (error) {
                    say(
                      error instanceof Error
                        ? error.message
                        : "Could not restore the previous save",
                    );
                  }
                }}
              >
                Restore previous save
              </button>
              <button
                className="text-button danger-text"
                onClick={() =>
                  setConfirm({
                    title: "Erase all FriendWeb data?",
                    text: "This deletes every web and backup from this browser. Download a backup first. This cannot be undone.",
                    action: () => {
                      void state
                        .deleteAllData()
                        .then(() => say("All local data erased"))
                        .catch((error) =>
                          say(
                            error instanceof Error
                              ? error.message
                              : "Could not erase local data",
                          ),
                        );
                      setDialog(null);
                    },
                  })
                }
              >
                Delete all local data
              </button>
            </div>
          )}
        </Modal>
      )}
      {commandOpen && (
        <Modal
          title="Find your people"
          subtitle="Search names, notes, tags, custom fields and relationships."
          onClose={() => setCommandOpen(false)}
        >
          <div className="command-search">
            <Search size={20} />
            <input
              autoFocus
              aria-label="Search all people"
              value={state.filters.query}
              onChange={(e) => state.setFilters({ query: e.target.value })}
              placeholder="Who’s on your mind?"
            />
          </div>
          <div className="command-actions">
            {!readonly && (
              <>
                <button
                  onClick={() => {
                    setCommandOpen(false);
                    newPerson();
                  }}
                >
                  <Plus size={15} />
                  Add person <kbd>N</kbd>
                </button>
                <button
                  onClick={() => {
                    setCommandOpen(false);
                    newConnection();
                  }}
                >
                  <Link2 size={15} />
                  Add connection
                </button>
              </>
            )}
            <button
              onClick={() => {
                setCommandOpen(false);
                setSettingsOpen(true);
                setRightOpen(true);
              }}
            >
              <Palette size={15} />
              Customize your constellation
            </button>
          </div>
          <div className="command-results">
            {commandResults.slice(0, 30).map((p) => (
              <button
                className="person-row"
                key={p.id}
                onClick={() => {
                  state.setFilters({
                    ...EMPTY_FILTERS,
                    showHidden: !!p.hidden,
                  });
                  choose({ kind: "person", id: p.id });
                  setPage("graph");
                  setCommandOpen(false);
                  setTimeout(() => graph.current?.focus(p.id), 150);
                }}
              >
                <Avatar person={p} />
                <span className="person-row-text">
                  <strong>{displayName(p)}</strong>
                  <small>
                    {[p.nickname, ...p.groups, p.pronouns]
                      .filter(Boolean)
                      .join(" · ")}{" "}
                    · {p.id.slice(0, 4)}
                  </small>
                </span>
                <ArrowRight size={15} />
              </button>
            ))}
            {!commandResults.length && (
              <p className="muted">
                No people found. Try a different name or a tag.
              </p>
            )}
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={confirm.title}
          subtitle={confirm.text}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button
                className="button secondary"
                onClick={() => setConfirm(null)}
              >
                Keep it
              </button>
              <button
                className="button danger"
                onClick={() => {
                  confirm.action();
                  setConfirm(null);
                }}
              >
                <Check size={14} />
                Confirm
              </button>
            </>
          }
        >
          {null}
        </Modal>
      )}
      {context && web.people[context.id] && (
        <>
          <button
            className="context-dismiss"
            aria-label="Close menu"
            onClick={() => setContext(null)}
          />
          <div
            className="context-menu popover"
            style={{
              left: Math.min(context.x, window.innerWidth - 220),
              top: Math.min(context.y, window.innerHeight - 300),
            }}
          >
            <span className="eyebrow">
              {displayName(web.people[context.id])}
            </span>
            <button onClick={() => choose({ kind: "person", id: context.id })}>
              <UserRound size={15} />
              View person
            </button>
            <button
              onClick={() => {
                graph.current?.focus(context.id);
                setContext(null);
              }}
            >
              <Focus size={15} />
              Focus camera
            </button>
            {!readonly && (
              <>
                <button
                  onClick={() => {
                    newConnection(context.id);
                    setContext(null);
                  }}
                >
                  <Link2 size={15} />
                  Add connection
                </button>
                <button
                  onClick={() => {
                    setEditPerson(web.people[context.id]);
                    setDialog("person");
                    setContext(null);
                  }}
                >
                  <Settings2 size={15} />
                  Edit details
                </button>
                <button
                  onClick={() => {
                    state.select({ kind: "person", id: context.id }, true);
                    setContext(null);
                  }}
                >
                  <Check size={15} />
                  Toggle selection
                </button>
                <button
                  onClick={() => {
                    duplicatePerson(web.people[context.id]);
                    setContext(null);
                  }}
                >
                  <Copy size={15} />
                  Duplicate
                </button>
                <button
                  className="danger-text"
                  onClick={() => {
                    removePerson(web.people[context.id]);
                    setContext(null);
                  }}
                >
                  <Trash2 size={15} />
                  Delete
                </button>
              </>
            )}
          </div>
        </>
      )}
      {state.error && (
        <div className="save-error" role="alert">
          <strong>
            {state.saveStatus === "error"
              ? "Could not save your latest changes."
              : "Something needs your attention."}
          </strong>
          <span>{state.error}</span>
          <button onClick={() => state.retrySave()}>Retry save</button>
          <button onClick={exportWeb}>Download backup</button>
          <button onClick={() => state.clearError()} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={14} />
          </span>
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
function SlidersIcon() {
  return <Settings2 size={17} />;
}
export default function App() {
  return (
    <ErrorBoundary>
      <FriendWeb />
    </ErrorBoundary>
  );
}
