import { Fragment, isValidElement, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  BookmarkPlus,
  Check,
  ChevronDown,
  CircleHelp,
  Palette,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { Settings, Web } from "../types";
import { DEFAULT_SETTINGS } from "../lib/defaults";
import "./settings.css";

interface Props {
  onResetLayout?: () => void;
  web: Web;
  onClose: () => void;
  onChange: (patch: Partial<Settings>) => void;
  onPresetSave: (name: string) => void;
  onPresetLoad: (settings: Settings) => void;
  onPresetDelete: (id: string) => void;
}
const PALETTES = [
  {
    name: "Moonlight",
    background: "#0b0d14",
    accent: "#a78bfa",
    theme: "dark" as const,
  },
  {
    name: "Ocean",
    background: "#07171e",
    accent: "#5eead4",
    theme: "custom" as const,
  },
  {
    name: "Rose",
    background: "#190f19",
    accent: "#f9a8d4",
    theme: "custom" as const,
  },
  {
    name: "Daylight",
    background: "#eef0f7",
    accent: "#7c3aed",
    theme: "light" as const,
  },
];
function hasContent(node: ReactNode): boolean {
  if (Array.isArray(node)) return node.some(hasContent);
  if (node === null || node === undefined || typeof node === "boolean")
    return false;
  if (isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment)
    return hasContent(node.props.children);
  return true;
}
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const displayed = /^#[\da-f]{6}$/i.test(draft) ? draft : value;
  return (
    <label className="settings-row settings-color">
      <span>{label}</span>
      <span className="settings-color-control">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={value}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(e.target.value);
          }}
        />
        <input
          className="input"
          aria-label={`${label} hex color`}
          value={draft === value ? value : draft}
          maxLength={7}
          onChange={(e) => {
            setDraft(e.target.value);
            if (/^#[\da-f]{6}$/i.test(e.target.value)) onChange(e.target.value);
          }}
          onBlur={() => {
            setDraft(displayed);
          }}
        />
      </span>
    </label>
  );
}
export function SettingsPanel({
  onResetLayout,
  web,
  onClose,
  onChange,
  onPresetSave,
  onPresetLoad,
  onPresetDelete,
}: Props) {
  const [query, setQuery] = useState("");
  const [presetName, setPresetName] = useState("");
  const [reset, setReset] = useState(false);
  const s = web.settings;
  const groups = useMemo(
    () =>
      [...new Set(Object.values(web.people).flatMap((p) => p.groups))].sort(),
    [web.people],
  );
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ [key]: value });
  const matches = (text: string) =>
    !query || text.toLowerCase().includes(query.toLowerCase());
  const range = (
    label: string,
    key: keyof Settings,
    min: number,
    max: number,
    step: number,
    help?: string,
  ) =>
    matches(`${label} ${help || ""}`) && (
      <label className="settings-range" key={key}>
        <span className="settings-range-label">
          <span>
            {label}
            {help && (
              <span className="setting-help" title={help}>
                <CircleHelp size={12} />
              </span>
            )}
          </span>
          <output>
            {Number(s[key]).toLocaleString(undefined, {
              maximumFractionDigits: 3,
            })}
          </output>
        </span>
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={step}
          value={Number(s[key])}
          onChange={(e) => onChange({ [key]: Number(e.target.value) })}
        />
      </label>
    );
  const toggle = (label: string, key: keyof Settings, help?: string) =>
    matches(`${label} ${help || ""}`) && (
      <label className="settings-row" key={key}>
        <span>
          {label}
          {help && <small>{help}</small>}
        </span>
        <input
          className="settings-switch"
          type="checkbox"
          role="switch"
          aria-label={label}
          checked={Boolean(s[key])}
          onChange={(e) => onChange({ [key]: e.target.checked })}
        />
      </label>
    );
  const select = <K extends keyof Settings>(
    label: string,
    key: K,
    options: { value: string; label: string }[],
  ) =>
    matches(label) && (
      <label className="settings-row" key={key}>
        <span>{label}</span>
        <select
          className="input settings-select"
          aria-label={label}
          value={String(s[key])}
          onChange={(e) => update(key, e.target.value as Settings[K])}
        >
          {options.map((o) => (
            <option value={o.value} key={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  const section = (title: string, _terms: string, children: ReactNode) =>
    hasContent(children) && (
      <details className="settings-section" open key={`${title}-${query}`}>
        <summary>
          <span>{title}</span>
          <ChevronDown size={14} />
        </summary>
        <div className="settings-section-body">{children}</div>
      </details>
    );
  return (
    <aside
      className="settings-panel"
      aria-label="Appearance and layout settings"
    >
      <div className="settings-heading">
        <div className="settings-heading-icon">
          <SlidersHorizontal size={19} />
        </div>
        <div>
          <h2>Make it yours</h2>
          <p>Every detail, in your orbit.</p>
        </div>
        <button
          className="icon-button"
          aria-label="Close settings"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <label className="settings-search">
        <Search size={16} />
        <input
          aria-label="Search settings"
          placeholder="Find a setting…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            className="icon-button"
            aria-label="Clear settings search"
            onClick={() => setQuery("")}
          >
            <X size={13} />
          </button>
        )}
      </label>
      <div className="settings-scroll">
        {matches("theme color palette background accent appearance") && (
          <div className="settings-theme-section">
            <span className="settings-eyebrow">
              <Palette size={13} /> COLOR STORIES
            </span>
            <div className="settings-palettes">
              {PALETTES.map((p) => (
                <button
                  key={p.name}
                  className={`settings-palette ${s.background === p.background ? "selected" : ""}`}
                  aria-label={`${p.name} theme`}
                  aria-pressed={s.background === p.background}
                  onClick={() =>
                    onChange({
                      background: p.background,
                      accent: p.accent,
                      theme: p.theme,
                    })
                  }
                >
                  <span style={{ background: p.background }}>
                    <i style={{ background: p.accent }} />
                    <i style={{ background: p.accent, opacity: 0.35 }} />
                    {s.background === p.background && <Check size={13} />}
                  </span>
                  <small>{p.name}</small>
                </button>
              ))}
            </div>
            <ColorField
              key={`bg-${s.background}`}
              label="Background"
              value={s.background}
              onChange={(background) =>
                onChange({ background, theme: "custom" })
              }
            />
            <ColorField
              key={`accent-${s.accent}`}
              label="Accent"
              value={s.accent}
              onChange={(accent) => onChange({ accent, theme: "custom" })}
            />
          </div>
        )}
        {section(
          "People",
          "node size shape opacity glow border degree",
          <>
            {range(
              "Node size",
              "nodeSize",
              2,
              18,
              0.2,
              "Base size; individual people may override it.",
            )}
            {select("Node shape", "nodeShape", [
              { value: "sphere", label: "Sphere" },
              { value: "cube", label: "Cube" },
              { value: "diamond", label: "Diamond" },
            ])}
            {range("Node opacity", "nodeOpacity", 0.15, 1, 0.05)}
            {toggle(
              "Size by connections",
              "degreeSizing",
              "More connected people appear larger.",
            )}
            {toggle("Soft node glow", "nodeGlow")}
            {toggle("Node borders", "nodeBorder")}
          </>,
        )}
        {section(
          "Labels",
          "names visibility font size labels",
          <>
            {toggle("Show people’s names", "labels")}
            {range("Label size", "labelSize", 1.5, 8, 0.1)}
            {select("Label font", "labelFont", [
              { value: "Inter, Arial, sans-serif", label: "Modern sans" },
              { value: "Georgia, serif", label: "Classic serif" },
              { value: "monospace", label: "Monospace" },
            ])}
            {toggle(
              "Relationship labels",
              "edgeLabels",
              "Display the type alongside each connection.",
            )}
          </>,
        )}
        {section(
          "Connections",
          "edge width thickness opacity line style particles animation",
          <>
            {range("Line thickness", "edgeWidth", 0.2, 6, 0.1)}
            {range("Line opacity", "edgeOpacity", 0.05, 1, 0.05)}
            {select("Default line style", "edgeStyle", [
              { value: "solid", label: "Solid" },
              { value: "dashed", label: "Dashed" },
              { value: "dotted", label: "Dotted" },
            ])}
            {toggle(
              "Flowing particles",
              "particles",
              "Show motion along connections.",
            )}
          </>,
        )}
        {section(
          "Atmosphere",
          "environment stars grid bloom lighting background",
          <>
            {toggle("Star field", "stars")}
            {toggle("Spatial grid", "grid")}
            {toggle("Bloom glow", "bloom")}
            {range("Lighting", "lighting", 0.2, 3, 0.1)}
            {select("Rendering quality", "quality", [
              { value: "auto", label: "Automatic" },
              { value: "high", label: "High quality" },
              { value: "low", label: "Battery saver" },
            ])}
          </>,
        )}
        {section(
          "Layout & physics",
          "force strength distance charge gravity collision seed simulation",
          <>
            {toggle(
              "Live physics",
              "physics",
              "Pause to keep the current arrangement.",
            )}
            {range(
              "Connection distance",
              "linkDistance",
              15,
              220,
              1,
              "Preferred distance between connected people.",
            )}
            {range(
              "Repulsion",
              "charge",
              -700,
              -5,
              5,
              "More negative values spread people farther apart.",
            )}
            {range(
              "Center gravity",
              "gravity",
              0,
              0.15,
              0.005,
              "Pull disconnected groups toward the center.",
            )}
            {range(
              "Collision spacing",
              "collision",
              4,
              40,
              1,
              "Keep nearby nodes from overlapping.",
            )}
            {onResetLayout && matches("layout reset rearrange") && (
              <button
                className="button secondary full-width"
                onClick={onResetLayout}
              >
                <RotateCcw size={13} />
                Rearrange constellation
              </button>
            )}
            {matches("layout deterministic seed") && (
              <label className="settings-row">
                <span>
                  Layout seed<small>Reproducible starting positions.</small>
                </span>
                <input
                  className="input settings-number"
                  aria-label="Layout seed"
                  type="number"
                  min={0}
                  max={2147483647}
                  value={s.seed}
                  onChange={(e) =>
                    update(
                      "seed",
                      Math.max(
                        0,
                        Math.min(2147483647, Number(e.target.value) || 0),
                      ),
                    )
                  }
                />
              </label>
            )}
          </>,
        )}
        {section(
          "Camera & motion",
          "rotate FOV field view speed reduced accessibility animation",
          <>
            {range("Field of view", "fov", 25, 95, 1)}
            {range("Navigation speed", "cameraSpeed", 0.25, 3, 0.05)}
            {toggle("Auto rotate", "autoRotate")}
            {range("Animation intensity", "animation", 0, 2, 0.1)}
            {toggle(
              "Reduced motion",
              "reducedMotion",
              "Shorten camera transitions and pause decorative motion.",
            )}
          </>,
        )}
        {groups.length > 0 &&
          section(
            "Group colors",
            "groups palettes cluster",
            <>
              {groups.map(
                (group) =>
                  matches(`group ${group} colors`) && (
                    <ColorField
                      key={`${group}-${s.groupColors[group]}`}
                      label={group}
                      value={s.groupColors[group] || s.accent}
                      onChange={(color) =>
                        update("groupColors", {
                          ...s.groupColors,
                          [group]: color,
                        })
                      }
                    />
                  ),
              )}
            </>,
          )}
        {matches("presets named saved save load appearance") && (
          <section className="settings-presets">
            <h3>
              <BookmarkPlus size={15} /> Your presets
            </h3>
            <p>Save this look and layout for later.</p>
            <form
              className="settings-preset-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (presetName.trim()) {
                  onPresetSave(presetName.trim());
                  setPresetName("");
                }
              }}
            >
              <input
                className="input"
                aria-label="Preset name"
                placeholder="Give this look a name"
                maxLength={80}
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
              />
              <button
                className="icon-button"
                aria-label="Save appearance preset"
                title="Save preset"
                disabled={!presetName.trim()}
              >
                <BookmarkPlus size={18} />
              </button>
            </form>
            {web.presets.map((p) => (
              <div className="settings-preset" key={p.id}>
                <button
                  onClick={() => onPresetLoad(p.settings)}
                  title={`Apply ${p.name}`}
                >
                  <span style={{ background: p.settings.accent }} />
                  {p.name}
                </button>
                <button
                  className="icon-button"
                  aria-label={`Delete ${p.name} preset`}
                  onClick={() => onPresetDelete(p.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </section>
        )}
      </div>
      <div className="settings-footer">
        {reset ? (
          <>
            <span>Reset all appearance settings?</span>
            <div>
              <button
                className="button secondary"
                onClick={() => setReset(false)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                onClick={() => {
                  onChange(structuredClone(DEFAULT_SETTINGS));
                  setReset(false);
                }}
              >
                Reset
              </button>
            </div>
          </>
        ) : (
          <>
            <span>
              <Sparkles size={13} /> Changes save automatically
            </span>
            <button
              className="icon-button"
              title="Reset appearance to defaults"
              aria-label="Reset appearance to defaults"
              onClick={() => setReset(true)}
            >
              <RotateCcw size={16} />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
export default SettingsPanel;
