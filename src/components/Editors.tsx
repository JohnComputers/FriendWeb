import { useId, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  ImagePlus,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type {
  Connection,
  LineStyle,
  Person,
  RelationshipType,
  Web,
} from "../types";
import { displayName } from "../types";
import { Modal } from "./Modal";
import "./editors.css";
import "./person-inputs.css";

const now = () => new Date().toISOString();
const commaList = (value: string) => [
  ...new Set(
    value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  ),
];
const hex = (value: string | undefined, fallback = "#a78bfa") =>
  /^#[0-9a-f]{6}$/i.test(value || "") ? value! : fallback;
export const newPerson = (firstName = ""): Person => ({
  id: crypto.randomUUID(),
  firstName,
  tags: [],
  groups: [],
  custom: {},
  dates: {},
  metadata: {},
  createdAt: now(),
  updatedAt: now(),
});

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}
function Section({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="editor-section" open={open || undefined}>
      <summary>
        {title}
        <ChevronDown size={15} />
      </summary>
      <div className="editor-section-content">{children}</div>
    </details>
  );
}
function PersonMultiChoice({
  label,
  singular,
  values,
  suggestions,
  custom,
  onCustomChange,
  onChange,
}: {
  label: string;
  singular: string;
  values: string[];
  suggestions: string[];
  custom: string;
  onCustomChange: (value: string) => void;
  onChange: (values: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const options = [...new Set(suggestions)]
    .filter((value) => !values.includes(value))
    .sort((a, b) => a.localeCompare(b));
  const addCustom = () => {
    const value = custom.trim();
    if (!value) return;
    onChange([...new Set([...values, value])]);
    onCustomChange("");
    setAdding(false);
  };
  return (
    <div className="person-multi-choice">
      <label className="field">
        <span>{label}</span>
        <select
          aria-label={`Choose ${singular}`}
          className="input"
          value=""
          onChange={(event) => {
            const value = event.target.value;
            if (value === "__friendweb_custom__") setAdding(true);
            else if (value) onChange([...values, value]);
          }}
        >
          <option value="">Choose {singular.toLowerCase()}…</option>
          {options.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
          <option value="__friendweb_custom__">
            + Add a custom {singular.toLowerCase()}…
          </option>
        </select>
      </label>
      {values.length > 0 && (
        <div
          className="person-choice-chips"
          aria-label={`Selected ${label.toLowerCase()}`}
        >
          {values.map((value) => (
            <span className="person-choice-chip" key={value}>
              {value}
              <button
                type="button"
                aria-label={`Remove ${value} from ${label.toLowerCase()}`}
                onClick={() =>
                  onChange(values.filter((item) => item !== value))
                }
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      {adding && (
        <div className="person-choice-add">
          <input
            className="input"
            aria-label={`New ${singular.toLowerCase()}`}
            maxLength={120}
            value={custom}
            placeholder={`Type a custom ${singular.toLowerCase()}`}
            onChange={(event) => onCustomChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustom();
              }
            }}
          />
          <button
            type="button"
            className="button secondary"
            disabled={!custom.trim()}
            onClick={addCustom}
          >
            Add
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Cancel adding ${singular.toLowerCase()}`}
            onClick={() => {
              onCustomChange("");
              setAdding(false);
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function KeyValues({
  value,
  onChange,
  label = "Custom fields",
  date = false,
}: {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  label?: string;
  date?: boolean;
}) {
  const [rows, setRows] = useState<string[][]>(() => Object.entries(value));
  const update = (next: string[][]) => {
    setRows(next);
    onChange(
      Object.fromEntries(
        next
          .filter(([key]) => key.trim())
          .map(([key, val]) => [key.trim(), val]),
      ),
    );
  };
  return (
    <div className="key-values">
      {rows.map(([key, val], i) => (
        <div className="key-value-row" key={i}>
          <input
            aria-label={`${label} name ${i + 1}`}
            className="input"
            value={key}
            placeholder={date ? "e.g. Met on" : "Field name"}
            maxLength={100}
            required={!!val}
            pattern={
              key.trim() &&
              rows.some(([other], n) => n !== i && other.trim() === key.trim())
                ? "(?!)"
                : undefined
            }
            title="Field names must be unique"
            onChange={(e) =>
              update(rows.map((r, n) => (n === i ? [e.target.value, r[1]] : r)))
            }
          />
          <input
            aria-label={`${label} value ${i + 1}`}
            className="input"
            value={val}
            type={date ? "date" : "text"}
            maxLength={5000}
            placeholder="Value"
            onChange={(e) =>
              update(rows.map((r, n) => (n === i ? [r[0], e.target.value] : r)))
            }
          />
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove ${key || "field"}`}
            onClick={() => update(rows.filter((_, n) => n !== i))}
          >
            <X size={15} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button secondary small"
        onClick={() => update([...rows, ["", ""]])}
      >
        <Plus size={14} />
        Add {date ? "date" : "field"}
      </button>
    </div>
  );
}

async function readPhoto(file: File): Promise<string> {
  if (
    ![
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "image/avif",
    ].includes(file.type)
  )
    throw new Error("Choose a PNG, JPEG, WebP, GIF, or AVIF image.");
  if (file.size > 15 * 1024 * 1024)
    throw new Error("Choose an image smaller than 15 MB.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error("This image could not be read. Try another file."));
      img.src = objectUrl;
    });
    const size = Math.min(384, image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Image processing is unavailable in this browser.");
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
    return canvas.toDataURL("image/webp", 0.85);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function PersonEditor({
  web,
  person,
  onClose,
  onSave,
}: {
  web: Web;
  person?: Person;
  onClose: () => void;
  onSave: (person: Person) => void;
}) {
  const [draft, setDraft] = useState<Person>(() =>
    person ? structuredClone(person) : newPerson(),
  );
  const [tags, setTags] = useState<string[]>(draft.tags);
  const [groups, setGroups] = useState<string[]>(draft.groups);
  const [newTag, setNewTag] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [error, setError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const formId = useId();
  const pronounsListId = useId();
  const genderListId = useId();
  const patch = (value: Partial<Person>) =>
    setDraft((d) => ({ ...d, ...value }));
  const duplicates = Object.values(web.people).filter(
    (p) =>
      p.id !== draft.id &&
      displayName(p).trim().toLocaleLowerCase() ===
        displayName(draft).trim().toLocaleLowerCase(),
  );
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.firstName.trim()) {
      setError("Add a first name to continue.");
      return;
    }
    if (duplicates.length && !duplicateConfirmed) {
      setError(
        "Someone with this name already exists. Confirm below to keep both people.",
      );
      return;
    }
    onSave({
      ...draft,
      firstName: draft.firstName.trim(),
      lastName: draft.lastName?.trim(),
      tags: [...new Set([...tags, newTag.trim()].filter(Boolean))],
      groups: [...new Set([...groups, newGroup.trim()].filter(Boolean))],
      updatedAt: now(),
    });
    onClose();
  };
  return (
    <Modal
      title={person ? "Edit person" : "A new connection starts here"}
      subtitle={
        person
          ? "Their details, your perspective."
          : "Add someone to your world. A first name is all you need."
      }
      onClose={onClose}
      wide
      footer={
        <>
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            type="submit"
            form={formId}
            disabled={photoBusy}
          >
            <Check size={16} />
            {person ? "Save changes" : "Add person"}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={save} className="editor-form">
        <div className="person-editor-intro">
          <button
            type="button"
            className="photo-uploader"
            aria-label={draft.photo ? "Change photo" : "Upload a photo"}
            onClick={() => photoInput.current?.click()}
          >
            {draft.photo ? (
              <img src={draft.photo} alt="Person preview" />
            ) : (
              <Camera size={26} />
            )}
            <span>
              <ImagePlus size={12} />
            </span>
          </button>
          <div>
            <strong>{displayName(draft) || "Make it personal"}</strong>
            <p className="muted">
              {photoBusy ? "Preparing photo…" : "Photos stay on this device."}
            </p>
            {draft.photo && (
              <button
                type="button"
                className="text-button"
                onClick={() => patch({ photo: undefined })}
              >
                Remove photo
              </button>
            )}
          </div>
          <input
            ref={photoInput}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setPhotoBusy(true);
              setError("");
              try {
                patch({ photo: await readPhoto(file) });
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Could not read photo.",
                );
              } finally {
                setPhotoBusy(false);
                e.target.value = "";
              }
            }}
          />
        </div>
        <div className="field-grid">
          <Field label="First name *">
            <input
              className="input"
              autoFocus
              required
              maxLength={120}
              autoComplete="given-name"
              value={draft.firstName}
              onChange={(e) => {
                patch({ firstName: e.target.value });
                setDuplicateConfirmed(false);
              }}
            />
          </Field>
          <Field label="Last name">
            <input
              className="input"
              maxLength={120}
              autoComplete="family-name"
              value={draft.lastName || ""}
              onChange={(e) => {
                patch({ lastName: e.target.value });
                setDuplicateConfirmed(false);
              }}
            />
          </Field>
        </div>
        {duplicates.length > 0 && (
          <div className="editor-notice">
            <AlertCircle size={17} />
            <div>
              <strong>A familiar name</strong>
              <p>
                {duplicates.length}{" "}
                {duplicates.length === 1 ? "person has" : "people have"} this
                name. Same names are welcome; add a nickname or group to tell
                them apart.
              </p>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={duplicateConfirmed}
                  onChange={(e) => setDuplicateConfirmed(e.target.checked)}
                />
                Keep as a separate person
              </label>
            </div>
          </div>
        )}
        <Field label="A little about them">
          <textarea
            className="input"
            rows={2}
            maxLength={10000}
            value={draft.description || ""}
            placeholder="How do you know each other?"
            onChange={(e) => patch({ description: e.target.value })}
          />
        </Field>
        <div className="field-grid">
          <PersonMultiChoice
            label="Groups"
            singular="Group"
            values={groups}
            onChange={setGroups}
            custom={newGroup}
            onCustomChange={setNewGroup}
            suggestions={[
              "Friends",
              "Family",
              "Work",
              "School",
              "Community",
              ...Object.values(web.people).flatMap((p) => p.groups),
            ]}
          />
          <PersonMultiChoice
            label="Tags"
            singular="Tag"
            values={tags}
            onChange={setTags}
            custom={newTag}
            onCustomChange={setNewTag}
            suggestions={[
              "Coffee",
              "Creative",
              "Hiking",
              "Music",
              "Travel",
              ...Object.values(web.people).flatMap((p) => p.tags),
            ]}
          />
        </div>
        <Section title="Personal details">
          <div className="field-grid">
            <Field label="Nickname">
              <input
                className="input"
                maxLength={120}
                value={draft.nickname || ""}
                onChange={(e) => patch({ nickname: e.target.value })}
              />
            </Field>
            <Field label="Pronouns">
              <input
                className="input"
                maxLength={120}
                value={draft.pronouns || ""}
                list={pronounsListId}
                placeholder="Choose or type their pronouns"
                onChange={(e) => patch({ pronouns: e.target.value })}
              />
              <datalist id={pronounsListId}>
                {[
                  ...new Set([
                    "she/her",
                    "he/him",
                    "they/them",
                    "she/they",
                    "he/they",
                    "any pronouns",
                    ...Object.values(web.people)
                      .map((p) => p.pronouns)
                      .filter((value): value is string => !!value),
                  ]),
                ].map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </Field>
            <Field label="Gender" hint="Optional, in their own words">
              <input
                className="input"
                maxLength={120}
                value={draft.gender || ""}
                list={genderListId}
                placeholder="Choose or type their gender"
                onChange={(e) => patch({ gender: e.target.value })}
              />
              <datalist id={genderListId}>
                {[
                  ...new Set([
                    "Woman",
                    "Man",
                    "Nonbinary",
                    "Agender",
                    "Genderfluid",
                    "Prefer not to say",
                    ...Object.values(web.people)
                      .map((p) => p.gender)
                      .filter((value): value is string => !!value),
                  ]),
                ].map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </Field>
            <Field label="Birthday">
              <input
                className="input"
                type="date"
                value={draft.birthday || ""}
                onChange={(e) => patch({ birthday: e.target.value })}
              />
            </Field>
            <Field label="Age" hint="Recorded manually; never inferred">
              <input
                className="input"
                type="number"
                min={0}
                max={150}
                value={draft.age ?? ""}
                onChange={(e) =>
                  patch({
                    age: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </Field>
          </div>
        </Section>
        <Section title="Notes & important dates">
          <Field label="Private notes" hint="Excluded from sharing by default">
            <textarea
              className="input"
              rows={4}
              maxLength={100000}
              value={draft.notes || ""}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </Field>
          <p className="field-label">Important dates</p>
          <KeyValues
            date
            value={draft.dates}
            onChange={(dates) => patch({ dates })}
          />
        </Section>
        <Section title="Node appearance">
          <div className="field-grid">
            <Field label="Color">
              <div className="editor-color-field">
                <input
                  type="color"
                  value={hex(draft.color)}
                  onChange={(e) => patch({ color: e.target.value })}
                />
                <input
                  className="input"
                  aria-label="Node hex color"
                  value={draft.color || ""}
                  pattern="#[0-9a-fA-F]{6}"
                  placeholder="Use relationship palette"
                  onChange={(e) =>
                    patch({ color: e.target.value || undefined })
                  }
                />
              </div>
            </Field>
            <Field label="Shape">
              <select
                className="input"
                value={draft.shape || ""}
                onChange={(e) =>
                  patch({
                    shape: (e.target.value || undefined) as Person["shape"],
                  })
                }
              >
                <option value="">Use web default</option>
                <option value="sphere">Sphere</option>
                <option value="cube">Cube</option>
                <option value="diamond">Diamond</option>
              </select>
            </Field>
            <Field label="Size" hint="Leave empty to use the web default">
              <input
                className="input"
                type="number"
                min={1}
                max={30}
                step={0.5}
                value={draft.size ?? ""}
                onChange={(e) =>
                  patch({
                    size: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </Field>
            <Field label="Opacity">
              <input
                className="input"
                type="number"
                min={0.1}
                max={1}
                step={0.05}
                value={draft.opacity ?? ""}
                placeholder="Use web default"
                onChange={(e) =>
                  patch({
                    opacity: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
              />
            </Field>
            <Field label="Border color">
              <div className="editor-color-field">
                <input
                  type="color"
                  value={hex(draft.border, "#ffffff")}
                  onChange={(e) => patch({ border: e.target.value })}
                />
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => patch({ border: undefined })}
                >
                  Use default
                </button>
              </div>
            </Field>
          </div>
          <div className="editor-checks">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={!!draft.favorite}
                onChange={(e) => patch({ favorite: e.target.checked })}
              />
              Favorite
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={!!draft.hidden}
                onChange={(e) => patch({ hidden: e.target.checked })}
              />
              Hide from graph
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={!!draft.pinned}
                onChange={(e) => patch({ pinned: e.target.checked })}
              />
              Pin position
            </label>
          </div>
        </Section>
        <Section title="Custom fields & metadata">
          <p className="field-label">Custom fields</p>
          <KeyValues
            value={draft.custom}
            onChange={(custom) => patch({ custom })}
          />
          <p className="field-label">Metadata</p>
          <KeyValues
            label="Metadata"
            value={draft.metadata}
            onChange={(metadata) => patch({ metadata })}
          />
        </Section>
        {error && (
          <p className="editor-error" role="alert">
            <AlertCircle size={16} />
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

interface ConnectionEditorProps {
  web: Web;
  sourceId?: string;
  targetId?: string;
  connection?: Connection;
  onClose: () => void;
  onSave: (links: Connection[]) => void;
  onCreatePerson: (p: Person) => void;
}
export function ConnectionEditor({
  web,
  sourceId,
  targetId,
  connection,
  onClose,
  onSave,
  onCreatePerson,
}: ConnectionEditorProps) {
  const [source, setSource] = useState(connection?.source || sourceId || "");
  const [targets, setTargets] = useState<string[]>(
    connection ? [connection.target] : targetId ? [targetId] : [],
  );
  const [query, setQuery] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [extraPeople, setExtraPeople] = useState<Person[]>([]);
  const [type, setType] = useState(
    connection?.type || web.types[0]?.id || "other",
  );
  const [notes, setNotes] = useState(connection?.notes || "");
  const [directed, setDirected] = useState(connection?.directed || false);
  const [color, setColor] = useState(connection?.color || "");
  const [weight, setWeight] = useState(connection?.weight || 1);
  const [style, setStyle] = useState<LineStyle | "">(connection?.style || "");
  const [opacity, setOpacity] = useState(connection?.opacity);
  const [particles, setParticles] = useState(connection?.particles || false);
  const [hidden, setHidden] = useState(connection?.hidden || false);
  const [startDate, setStartDate] = useState(connection?.startDate || "");
  const [endDate, setEndDate] = useState(connection?.endDate || "");
  const [custom, setCustom] = useState(connection?.custom || {});
  const [overrides, setOverrides] = useState<
    Record<
      string,
      {
        type?: string;
        notes?: string;
        color?: string;
        weight?: number;
        style?: LineStyle;
      }
    >
  >({});
  const [duplicatesConfirmed, setDuplicatesConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [creatingName, setCreatingName] = useState("");
  const [creatingDuplicateConfirmed, setCreatingDuplicateConfirmed] =
    useState(false);
  const formId = useId();
  const people = useMemo(
    () =>
      [
        ...Object.values(web.people),
        ...extraPeople.filter((p) => !web.people[p.id]),
      ].sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [web.people, extraPeople],
  );
  const creatingDuplicate = people.some(
    (p) =>
      displayName(p).trim().toLocaleLowerCase() ===
      creatingName.trim().toLocaleLowerCase(),
  );
  const available = people.filter(
    (p) =>
      p.id !== source &&
      `${displayName(p)} ${p.nickname || ""} ${p.groups.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const sourcePeople = people.filter((p) =>
    `${displayName(p)} ${p.nickname || ""} ${p.groups.join(" ")}`
      .toLowerCase()
      .includes(sourceQuery.toLowerCase()),
  );
  const relationship = web.types.find((t) => t.id === type);
  const previewColor = hex(color, relationship?.color);
  const previewStyle = style || relationship?.style || "solid";
  const sourceName = people.find((p) => p.id === source)?.firstName || "Person";
  const targetName =
    targets.length > 1
      ? `${targets.length} people`
      : people.find((p) => p.id === targets[0])?.firstName || "Person";
  const candidates = targets
    .filter((id) => id !== source)
    .map((target) => ({
      id: connection?.id || crypto.randomUUID(),
      source,
      target,
      type: overrides[target]?.type || type,
      notes: overrides[target]?.notes ?? notes,
      directed,
      color:
        overrides[target]?.color ||
        (overrides[target]?.type ? undefined : color) ||
        undefined,
      weight: overrides[target]?.weight ?? weight,
      style:
        overrides[target]?.style ||
        (overrides[target]?.type ? undefined : style) ||
        undefined,
      opacity,
      particles,
      hidden,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      custom,
      createdAt: connection?.createdAt || now(),
      updatedAt: now(),
    }));
  const duplicates = candidates.filter((next) =>
    Object.values(web.links).some(
      (link) =>
        link.id !== connection?.id &&
        link.type === next.type &&
        link.directed === next.directed &&
        (link.notes || "") === next.notes &&
        ((link.source === next.source && link.target === next.target) ||
          (!next.directed &&
            link.source === next.target &&
            link.target === next.source)),
    ),
  );
  const toggleTarget = (id: string) => {
    setTargets((ids) =>
      ids.includes(id) ? ids.filter((t) => t !== id) : [...ids, id],
    );
    setDuplicatesConfirmed(false);
  };
  const createMissing = () => {
    if (!creatingName.trim()) return;
    if (creatingDuplicate && !creatingDuplicateConfirmed) {
      setError(
        "Confirm that the new person is different from the existing person with this name.",
      );
      return;
    }
    const parts = creatingName.trim().split(/\s+/);
    const person = {
      ...newPerson(parts.shift()!),
      lastName: parts.join(" ") || undefined,
    };
    setExtraPeople((prev) => [...prev, person]);
    onCreatePerson(person);
    setTargets((prev) => (batchMode ? [...prev, person.id] : [person.id]));
    setCreatingName("");
    setCreatingDuplicateConfirmed(false);
    setQuery("");
    setError("");
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!source || !people.some((p) => p.id === source)) {
      setError("Choose the person this connection starts with.");
      return;
    }
    if (!candidates.length) {
      setError("Choose at least one other person.");
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError("The end date must be on or after the start date.");
      return;
    }
    if (duplicates.length && !duplicatesConfirmed) {
      setError("Confirm the duplicate connections below to continue.");
      return;
    }
    onSave(candidates);
    onClose();
  };
  return (
    <Modal
      title={connection ? "Edit connection" : "Bring your people together"}
      subtitle={
        connection
          ? "Every relationship has its own story."
          : "One person, many connections. Add them all in one step."
      }
      wide
      onClose={onClose}
      footer={
        <>
          <span className="muted editor-footer-count">
            {targets.length}{" "}
            {targets.length === 1 ? "connection" : "connections"}
          </span>
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" form={formId} type="submit">
            <Check size={16} />
            {connection
              ? "Save connection"
              : `Create ${targets.length || ""} connection${targets.length === 1 ? "" : "s"}`}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={save} className="editor-form">
        <div className="connection-source">
          <span className="editor-step">1</span>
          <div>
            <strong>Start with someone</strong>
            <p className="muted">The source person for these relationships</p>
          </div>
        </div>
        <div className="source-picker">
          <div className="search-input">
            <Search size={15} />
            <input
              className="input"
              aria-label="Search source people"
              placeholder="Find a person…"
              value={sourceQuery}
              onChange={(e) => setSourceQuery(e.target.value)}
            />
          </div>
          <select
            className="input"
            aria-label="Source person"
            required
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setTargets((ids) => ids.filter((id) => id !== e.target.value));
              setDuplicatesConfirmed(false);
            }}
          >
            <option value="">Choose a person</option>
            {(source && !sourcePeople.some((p) => p.id === source)
              ? [people.find((p) => p.id === source)!, ...sourcePeople].filter(
                  Boolean,
                )
              : sourcePeople
            ).map((p) => (
              <option key={p.id} value={p.id}>
                {displayName(p)}
                {p.nickname ? ` (${p.nickname})` : ""}
                {p.groups.length ? ` · ${p.groups.join(", ")}` : ""} ·{" "}
                {p.id.slice(0, 4)}
              </option>
            ))}
          </select>
        </div>
        <div className="connection-source">
          <span className="editor-step">2</span>
          <div>
            <strong>
              {connection ? "Choose the other person" : "Choose your people"}
            </strong>
            <p className="muted">
              {connection
                ? "Select a target person"
                : batchMode
                  ? "Select everyone to connect"
                  : "Select one person, or switch to select several"}
            </p>
          </div>
        </div>
        <div className="target-picker">
          <div className="target-picker-header">
            <div className="search-input">
              <Search size={15} />
              <input
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search target people"
                placeholder="Search names, nicknames, groups…"
              />
            </div>
            {!connection && batchMode && (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  const allSelected = available.every((p) =>
                    targets.includes(p.id),
                  );
                  setTargets((ids) =>
                    allSelected
                      ? ids.filter((id) => !available.some((p) => p.id === id))
                      : [...new Set([...ids, ...available.map((p) => p.id)])],
                  );
                  setDuplicatesConfirmed(false);
                }}
              >
                {available.length > 0 &&
                available.every((p) => targets.includes(p.id))
                  ? "Deselect filtered"
                  : "Select all filtered"}
              </button>
            )}
          </div>
          {!connection && (
            <button
              type="button"
              className="button secondary small batch-mode-toggle"
              onClick={() => {
                if (batchMode && targets.length > 1) {
                  setError(
                    "Remove extra selections before returning to a single person.",
                  );
                  return;
                }
                setBatchMode(!batchMode);
                setError("");
              }}
            >
              <Users size={14} />
              {batchMode ? "Choose one person" : "Select several people"}
            </button>
          )}
          {!batchMode ? (
            <label className="field">
              <span>Other person</span>
              <select
                className="input"
                aria-label="Target person"
                value={targets[0] || ""}
                onChange={(e) => {
                  setTargets(e.target.value ? [e.target.value] : []);
                  setDuplicatesConfirmed(false);
                }}
              >
                <option value="">Choose a person</option>
                {(targets[0] && !available.some((p) => p.id === targets[0])
                  ? [
                      people.find((p) => p.id === targets[0]),
                      ...available,
                    ].filter((p): p is Person => Boolean(p) && p!.id !== source)
                  : available
                ).map((p) => (
                  <option key={p.id} value={p.id}>
                    {displayName(p)}
                    {p.nickname ? ` (${p.nickname})` : ""}
                    {p.groups.length ? ` · ${p.groups.join(", ")}` : ""} ·{" "}
                    {p.id.slice(0, 4)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div
              className="target-people"
              role="group"
              aria-label="Target people"
            >
              {available.map((p) => (
                <label
                  key={p.id}
                  className={`target-person ${targets.includes(p.id) ? "is-checked" : ""}`}
                >
                  <input
                    type={connection ? "radio" : "checkbox"}
                    name="connection-target"
                    checked={targets.includes(p.id)}
                    onChange={() =>
                      connection ? setTargets([p.id]) : toggleTarget(p.id)
                    }
                  />
                  <span
                    className="mini-person"
                    style={{
                      background: `${hex(p.color)}25`,
                      color: hex(p.color),
                    }}
                  >
                    {p.photo ? (
                      <img src={p.photo} alt="" />
                    ) : (
                      p.firstName.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span>
                    <strong>{displayName(p)}</strong>
                    <small className="muted">
                      {[p.nickname, p.groups.join(" · ")]
                        .filter(Boolean)
                        .join(" · ") || `ID ${p.id.slice(0, 8)}`}
                    </small>
                  </span>
                  <span className="target-person-check">
                    {targets.includes(p.id) && <Check size={15} />}
                  </span>
                </label>
              ))}
              {!available.length && (
                <p className="target-empty muted">
                  No people match. Create someone below.
                </p>
              )}
            </div>
          )}
          {!connection && (
            <div className="create-missing">
              <UserPlus size={16} />
              <input
                className="input"
                aria-label="New person's name"
                placeholder="Someone missing? Enter their name"
                value={creatingName}
                onChange={(e) => {
                  setCreatingName(e.target.value);
                  setCreatingDuplicateConfirmed(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    createMissing();
                  }
                }}
              />
              <button
                type="button"
                className="button secondary small"
                disabled={!creatingName.trim()}
                onClick={createMissing}
              >
                Add person
              </button>
            </div>
          )}
          {creatingDuplicate && (
            <div className="editor-notice">
              <AlertCircle size={17} />
              <div>
                <strong>Someone with this name already exists.</strong>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={creatingDuplicateConfirmed}
                    onChange={(e) =>
                      setCreatingDuplicateConfirmed(e.target.checked)
                    }
                  />
                  Add a different person with the same name
                </label>
              </div>
            </div>
          )}
        </div>
        {targets.length > 0 && (
          <div className="selected-chips">
            {targets.map((id) => {
              const p = people.find((p) => p.id === id);
              return (
                p && (
                  <button
                    type="button"
                    className="chip"
                    key={id}
                    onClick={() => toggleTarget(id)}
                  >
                    {displayName(p)}
                    <X size={12} />
                  </button>
                )
              );
            })}
          </div>
        )}
        <div className="connection-source">
          <span className="editor-step">3</span>
          <div>
            <strong>Define the connection</strong>
            <p className="muted">Applied to every selected person</p>
          </div>
        </div>
        <div className="field-grid">
          <Field label="Relationship type">
            <select
              className="input"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setColor("");
                setStyle("");
                setDuplicatesConfirmed(false);
              }}
            >
              {web.types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.icon} {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Direction">
            <select
              className="input"
              value={directed ? "directed" : "undirected"}
              onChange={(e) => {
                setDirected(e.target.value === "directed");
                setDuplicatesConfirmed(false);
              }}
            >
              <option value="undirected">Undirected · both connected</option>
              <option value="directed">Directed · source → target</option>
            </select>
          </Field>
        </div>
        <div className="relationship-style-panel">
          <div className="relationship-style-heading">
            <div>
              <strong>Make the relationship visible</strong>
              <p className="muted">
                Each type has a color. Choose a different color or line whenever
                you like.
              </p>
            </div>
          </div>
          <div
            className="relationship-preview"
            aria-label={`Preview: ${sourceName} connected to ${targetName}, ${relationship?.name || "relationship"}, ${previewStyle} line`}
          >
            <span>{sourceName}</span>
            <span
              className="relationship-preview-line"
              style={{
                borderTopColor: previewColor,
                borderTopStyle: previewStyle,
              }}
            >
              {directed && <i style={{ borderLeftColor: previewColor }} />}
            </span>
            <span>{targetName}</span>
          </div>
          <div className="field-grid">
            <Field label="Line color">
              <div className="relationship-color-row">
                <select
                  className="input"
                  aria-label="Line color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                >
                  <option value="">
                    {relationship?.name || "Relationship"} color (default)
                  </option>
                  {[
                    ["#a78bfa", "Purple"],
                    ["#f9a8d4", "Pink"],
                    ["#fb7185", "Rose"],
                    ["#fbbf77", "Orange"],
                    ["#fcd34d", "Yellow"],
                    ["#64cbb3", "Teal"],
                    ["#7db6f7", "Blue"],
                    ["#94a3b8", "Gray"],
                  ].map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
                  {color &&
                    ![
                      "#a78bfa",
                      "#f9a8d4",
                      "#fb7185",
                      "#fbbf77",
                      "#fcd34d",
                      "#64cbb3",
                      "#7db6f7",
                      "#94a3b8",
                    ].includes(color.toLowerCase()) && (
                      <option value={color}>Custom color</option>
                    )}
                </select>
                <input
                  type="color"
                  aria-label="Choose a custom line color"
                  value={previewColor}
                  onChange={(e) => setColor(e.target.value)}
                />
              </div>
            </Field>
            <Field label="Line appearance">
              <select
                className="input"
                aria-label="Line appearance"
                value={style}
                onChange={(e) => setStyle(e.target.value as LineStyle | "")}
              >
                <option value="">Use relationship default</option>
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </Field>
            <Field label="Line thickness">
              <select
                className="input"
                aria-label="Line thickness"
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
              >
                <option value={0.5}>Fine</option>
                <option value={1}>Regular</option>
                <option value={1.5}>Medium</option>
                <option value={2}>Bold</option>
                <option value={3}>Extra bold</option>
                {![0.5, 1, 1.5, 2, 3].includes(weight) && (
                  <option value={weight}>Custom ({weight})</option>
                )}
              </select>
            </Field>
          </div>
          <small className="muted">
            Changing the relationship type restores its default color and line.
          </small>
        </div>
        <Field
          label="Comment"
          hint="Optional. Excluded from sharing by default."
        >
          <textarea
            className="input"
            rows={2}
            maxLength={100000}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setDuplicatesConfirmed(false);
            }}
            placeholder="The story behind this connection…"
          />
        </Field>
        {targets.length > 1 && (
          <Section title="Customize individual connections">
            {targets.map((id) => {
              const p = people.find((p) => p.id === id);
              if (!p) return null;
              return (
                <div className="connection-override" key={id}>
                  <strong>
                    <ArrowRight size={13} />
                    {displayName(p)}
                  </strong>
                  <div className="field-grid">
                    <Field label="Relationship">
                      <select
                        className="input"
                        value={overrides[id]?.type || ""}
                        onChange={(e) => {
                          setOverrides((prev) => ({
                            ...prev,
                            [id]: { ...prev[id], type: e.target.value },
                          }));
                          setDuplicatesConfirmed(false);
                        }}
                      >
                        <option value="">Use shared type</option>
                        {web.types.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Comment">
                      <input
                        className="input"
                        value={overrides[id]?.notes ?? ""}
                        placeholder="Use shared comment"
                        onChange={(e) => {
                          setOverrides((prev) => ({
                            ...prev,
                            [id]: {
                              ...prev[id],
                              notes: e.target.value || undefined,
                            },
                          }));
                          setDuplicatesConfirmed(false);
                        }}
                      />
                    </Field>
                  </div>
                  <div className="field-grid">
                    <Field label="Line style">
                      <select
                        className="input"
                        value={overrides[id]?.style || ""}
                        onChange={(e) =>
                          setOverrides((prev) => ({
                            ...prev,
                            [id]: {
                              ...prev[id],
                              style: (e.target.value || undefined) as
                                LineStyle | undefined,
                            },
                          }))
                        }
                      >
                        <option value="">Use shared style</option>
                        <option value="solid">Solid</option>
                        <option value="dashed">Dashed</option>
                        <option value="dotted">Dotted</option>
                      </select>
                    </Field>
                    <Field label="Weight / thickness">
                      <input
                        className="input"
                        type="number"
                        min={0.2}
                        max={10}
                        step={0.1}
                        value={overrides[id]?.weight ?? ""}
                        placeholder="Use shared weight"
                        onChange={(e) =>
                          setOverrides((prev) => ({
                            ...prev,
                            [id]: {
                              ...prev[id],
                              weight: e.target.value
                                ? Number(e.target.value)
                                : undefined,
                            },
                          }))
                        }
                      />
                    </Field>
                    <Field label="Line color">
                      <div className="editor-color-field">
                        <input
                          type="color"
                          value={hex(
                            overrides[id]?.color || color,
                            web.types.find(
                              (t) => t.id === (overrides[id]?.type || type),
                            )?.color,
                          )}
                          onChange={(e) =>
                            setOverrides((prev) => ({
                              ...prev,
                              [id]: { ...prev[id], color: e.target.value },
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            setOverrides((prev) => ({
                              ...prev,
                              [id]: { ...prev[id], color: undefined },
                            }))
                          }
                        >
                          Use shared color
                        </button>
                      </div>
                    </Field>
                  </div>
                </div>
              );
            })}
          </Section>
        )}
        <Section title="Dates & custom fields">
          <div className="field-grid">
            <Field label="Start date">
              <input
                className="input"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="End date">
              <input
                className="input"
                type="date"
                min={startDate || undefined}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
          </div>
          <KeyValues value={custom} onChange={setCustom} />
        </Section>
        <Section title="More line options">
          <div className="field-grid">
            <Field label="Opacity">
              <select
                className="input"
                value={opacity ?? ""}
                onChange={(e) =>
                  setOpacity(
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
              >
                <option value="">Use web default</option>
                <option value="0.25">Subtle</option>
                <option value="0.5">Soft</option>
                <option value="0.75">Visible</option>
                <option value="1">Full</option>
                {opacity !== undefined &&
                  ![0.25, 0.5, 0.75, 1].includes(opacity) && (
                    <option value={opacity}>Custom ({opacity})</option>
                  )}
              </select>
            </Field>
          </div>
          <div className="editor-checks">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={particles}
                onChange={(e) => setParticles(e.target.checked)}
              />
              Animated particles
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={hidden}
                onChange={(e) => setHidden(e.target.checked)}
              />
              Hide connection
            </label>
          </div>
        </Section>
        {duplicates.length > 0 && (
          <div className="editor-notice">
            <AlertCircle size={17} />
            <div>
              <strong>
                {duplicates.length} duplicate{" "}
                {duplicates.length === 1 ? "connection" : "connections"}
              </strong>
              <p>
                These people already have this relationship, direction, and
                comment.
              </p>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={duplicatesConfirmed}
                  onChange={(e) => setDuplicatesConfirmed(e.target.checked)}
                />
                Create duplicates intentionally
              </label>
            </div>
          </div>
        )}
        {error && (
          <p className="editor-error" role="alert">
            <AlertCircle size={16} />
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

export function BulkEditor({
  web,
  ids,
  onClose,
  onApply,
}: {
  web: Web;
  ids: string[];
  onClose: () => void;
  onApply: (patch: Partial<Person>, tags: string[], groups: string[]) => void;
}) {
  const [color, setColor] = useState("");
  const [tags, setTags] = useState("");
  const [groups, setGroups] = useState("");
  const [hidden, setHidden] = useState("");
  const [favorite, setFavorite] = useState("");
  const [pinned, setPinned] = useState("");
  const validIds = ids.filter((id) => web.people[id]);
  const formId = useId();
  return (
    <Modal
      title={`Edit ${validIds.length} people`}
      subtitle="Only the fields you change will be applied. Tags and groups are added to existing values."
      onClose={onClose}
      footer={
        <>
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" form={formId} type="submit">
            <Check size={16} />
            Apply changes
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          const patch: Partial<Person> = {};
          if (color) patch.color = color;
          if (hidden) patch.hidden = hidden === "yes";
          if (favorite) patch.favorite = favorite === "yes";
          if (pinned) patch.pinned = pinned === "yes";
          onApply(patch, commaList(tags), commaList(groups));
          onClose();
        }}
      >
        <div className="bulk-summary">
          <Users size={22} />
          <p>
            {validIds
              .slice(0, 4)
              .map((id) => displayName(web.people[id]))
              .join(", ")}
            {validIds.length > 4 ? ` and ${validIds.length - 4} more` : ""}
          </p>
        </div>
        <Field label="Node color">
          <div className="editor-color-field">
            <input
              type="color"
              value={color || "#a78bfa"}
              onChange={(e) => setColor(e.target.value)}
            />
            <button
              className="button secondary small"
              type="button"
              onClick={() => setColor("")}
            >
              {color ? "Keep existing colors" : "Existing colors unchanged"}
            </button>
          </div>
        </Field>
        <Field label="Add tags" hint="Comma-separated">
          <input
            className="input"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </Field>
        <Field label="Add groups" hint="Comma-separated">
          <input
            className="input"
            value={groups}
            onChange={(e) => setGroups(e.target.value)}
          />
        </Field>
        <div className="field-grid">
          {[
            {
              label: "Visibility",
              value: hidden,
              setter: setHidden,
              yes: "Hide people",
              no: "Show people",
            },
            {
              label: "Favorites",
              value: favorite,
              setter: setFavorite,
              yes: "Add to favorites",
              no: "Remove from favorites",
            },
            {
              label: "Layout",
              value: pinned,
              setter: setPinned,
              yes: "Pin positions",
              no: "Unpin positions",
            },
          ].map((f) => (
            <Field label={f.label} key={f.label}>
              <select
                className="input"
                value={f.value}
                onChange={(e) => f.setter(e.target.value)}
              >
                <option value="">Keep existing</option>
                <option value="yes">{f.yes}</option>
                <option value="no">{f.no}</option>
              </select>
            </Field>
          ))}
        </div>
      </form>
    </Modal>
  );
}

export function TypesEditor({
  web,
  onClose,
  onChange,
}: {
  web: Web;
  onClose: () => void;
  onChange: (types: RelationshipType[]) => void;
}) {
  const [types, setTypes] = useState(() => structuredClone(web.types));
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  const formId = useId();
  const patch = (id: string, value: Partial<RelationshipType>) =>
    setTypes((prev) => prev.map((t) => (t.id === id ? { ...t, ...value } : t)));
  const remove = (id: string) => {
    if (types.length === 1) {
      setError("Keep at least one relationship type.");
      return;
    }
    const count = Object.values(web.links).filter((l) => l.type === id).length;
    if (count && confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setTypes((prev) => prev.filter((t) => t.id !== id));
    setConfirmDelete("");
  };
  return (
    <Modal
      title="Relationship palette"
      subtitle="Make room for every kind of connection. Your types, icons, and colors."
      wide
      onClose={onClose}
      footer={
        <>
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="button primary">
            <Check size={16} />
            Save palette
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!types.length || types.some((t) => !t.name.trim())) {
            setError("Give every relationship type a name.");
            return;
          }
          onChange(types.map((t) => ({ ...t, name: t.name.trim() })));
          onClose();
        }}
      >
        <div className="type-editor-head muted">
          <span>Icon</span>
          <span>Color</span>
          <span>Relationship</span>
          <span>Line</span>
          <span />
        </div>
        {types.map((t) => (
          <div key={t.id} className="type-editor-item">
            <div className="type-editor-row">
              <input
                className="input type-icon"
                aria-label={`${t.name} icon`}
                value={t.icon}
                maxLength={8}
                onChange={(e) => patch(t.id, { icon: e.target.value })}
              />
              <input
                className="type-color"
                type="color"
                aria-label={`${t.name} color`}
                value={hex(t.color)}
                onChange={(e) => patch(t.id, { color: e.target.value })}
              />
              <input
                className="input"
                aria-label="Relationship type name"
                required
                maxLength={100}
                value={t.name}
                onChange={(e) => patch(t.id, { name: e.target.value })}
              />
              <select
                className="input"
                aria-label={`${t.name} line style`}
                value={t.style}
                onChange={(e) =>
                  patch(t.id, { style: e.target.value as LineStyle })
                }
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
              <button
                type="button"
                className="icon-button"
                aria-label={`Delete ${t.name} type`}
                onClick={() => remove(t.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
            {confirmDelete === t.id && (
              <div className="type-delete-warning">
                <span>
                  {
                    Object.values(web.links).filter((l) => l.type === t.id)
                      .length
                  }{" "}
                  connections use this type. They will be moved to a remaining
                  type.
                </span>
                <button
                  type="button"
                  className="button danger small"
                  onClick={() => remove(t.id)}
                >
                  Confirm removal
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setConfirmDelete("")}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            const id = crypto.randomUUID();
            setTypes((prev) => [
              ...prev,
              {
                id,
                name: "New relationship",
                icon: "✦",
                color: "#a78bfa",
                style: "solid",
              },
            ]);
          }}
        >
          <Plus size={16} />
          Add relationship type
        </button>
        {error && (
          <p className="editor-error" role="alert">
            <AlertCircle size={16} />
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
