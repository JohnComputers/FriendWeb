import { z } from "zod";
import LZString from "lz-string";
import { DEFAULT_SETTINGS, DEFAULT_TYPES, EMPTY_FILTERS } from "./defaults";
import type { Person, ShareOptions, Web } from "../types";

export const MAX_IMPORT_BYTES = 32 * 1024 * 1024;
export const MAX_SHARE_LENGTH = 12_000;
export const PRIVATE_SHARE_DEFAULTS: ShareOptions = {
  notes: false,
  photos: false,
  custom: false,
  birthdays: false,
  comments: false,
};
const safeKey = (key: string) =>
  !["__proto__", "prototype", "constructor"].includes(key);
const id = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(safeKey, "Invalid reserved identifier");
const text = z.string().max(100_000);
const shortText = z.string().max(1000);
const color = z
  .string()
  .regex(
    /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
    "Use a hexadecimal color",
  );
const finite = z.number().finite();
const strings = z.array(shortText).max(1000).default([]);
const record = z
  .record(shortText, text)
  .refine(
    (value) => Object.keys(value).every(safeKey),
    "Reserved custom field name",
  )
  .default({});
const position = z.object({
  x: finite.min(-1e7).max(1e7),
  y: finite.min(-1e7).max(1e7),
  z: finite.min(-1e7).max(1e7),
});
const timestamp = z.string().max(100);
const style = z.enum(["solid", "dashed", "dotted"]);
const shape = z.enum(["sphere", "cube", "diamond"]);
const date = z.string().max(100);
const photo = z
  .string()
  .max(6_000_000)
  .regex(
    /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i,
    "Photos must be local PNG, JPEG, WebP, GIF, or AVIF images",
  );
const personSchema = z.object({
  id,
  firstName: z
    .string()
    .trim()
    .min(1, "Every person needs a first name")
    .max(1000),
  lastName: shortText.optional(),
  nickname: shortText.optional(),
  pronouns: shortText.optional(),
  gender: shortText.optional(),
  birthday: date.optional(),
  age: finite.min(0).max(150).optional(),
  description: text.optional(),
  notes: text.optional(),
  tags: strings,
  groups: strings,
  color: color.optional(),
  photo: photo.optional(),
  custom: record,
  dates: record,
  metadata: record,
  createdAt: timestamp.default(() => new Date().toISOString()),
  updatedAt: timestamp.default(() => new Date().toISOString()),
  favorite: z.boolean().optional(),
  hidden: z.boolean().optional(),
  size: finite.min(0.1).max(100).optional(),
  shape: shape.optional(),
  opacity: finite.min(0).max(1).optional(),
  border: color.optional(),
  position: position.optional(),
  pinned: z.boolean().optional(),
});
const connectionSchema = z.object({
  id,
  source: id,
  target: id,
  type: id,
  notes: text.optional(),
  color: color.optional(),
  weight: finite.min(0.01).max(100).default(1),
  directed: z.boolean().default(false),
  startDate: date.optional(),
  endDate: date.optional(),
  hidden: z.boolean().optional(),
  custom: record,
  style: style.optional(),
  opacity: finite.min(0).max(1).optional(),
  particles: z.boolean().optional(),
  createdAt: timestamp.default(() => new Date().toISOString()),
  updatedAt: timestamp.default(() => new Date().toISOString()),
});
const typeSchema = z.object({
  id,
  name: z.string().trim().min(1).max(1000),
  color,
  icon: z.string().max(100).default("✦"),
  style: style.default("solid"),
});
const settingsSchema = z.object({
  theme: z.enum(["dark", "light", "custom"]),
  background: color,
  accent: color,
  nodeSize: finite.min(0.1).max(100),
  nodeOpacity: finite.min(0).max(1),
  nodeShape: shape,
  nodeGlow: z.boolean(),
  nodeBorder: z.boolean(),
  labels: z.boolean(),
  labelSize: finite.min(0.1).max(100),
  labelFont: z.string().max(200),
  edgeWidth: finite.min(0).max(100),
  edgeOpacity: finite.min(0).max(1),
  edgeStyle: style,
  edgeLabels: z.boolean(),
  particles: z.boolean(),
  stars: z.boolean(),
  grid: z.boolean(),
  bloom: z.boolean(),
  lighting: finite.min(0).max(20),
  charge: finite.min(-10000).max(1000),
  linkDistance: finite.min(1).max(5000),
  gravity: finite.min(0).max(5),
  collision: finite.min(0).max(500),
  physics: z.boolean(),
  autoRotate: z.boolean(),
  reducedMotion: z.boolean(),
  animation: finite.min(0).max(10),
  fov: finite.min(10).max(150),
  cameraSpeed: finite.min(0.1).max(10),
  degreeSizing: z.boolean(),
  quality: z.enum(["auto", "high", "low"]),
  seed: finite.int(),
  groupColors: z
    .record(color)
    .refine(
      (value) => Object.keys(value).every(safeKey),
      "Reserved group name",
    ),
});
const withSettings = z.preprocess(
  (value) => ({
    ...DEFAULT_SETTINGS,
    ...(typeof value === "object" && value !== null ? value : {}),
  }),
  settingsSchema,
);
const filtersSchema = z.object({
  query: shortText,
  group: shortText,
  tag: shortText,
  gender: shortText,
  type: shortText,
  minDegree: finite.min(0),
  maxDegree: finite.min(0),
  showHidden: z.boolean(),
  favorites: z.boolean(),
  customKey: shortText,
  customValue: shortText,
  since: shortText,
  until: shortText,
});
const webSchema = z.object({
  id,
  name: z.string().trim().min(1).max(1000),
  description: text.default(""),
  people: z.record(personSchema),
  links: z.record(connectionSchema),
  types: z.array(typeSchema).max(5000).default(DEFAULT_TYPES),
  settings: withSettings,
  createdAt: timestamp.default(() => new Date().toISOString()),
  updatedAt: timestamp.default(() => new Date().toISOString()),
  camera: z.object({ position, target: position }).optional(),
  bookmarks: z
    .array(z.object({ id, name: shortText, position, target: position }))
    .max(1000)
    .default([]),
  views: z
    .array(
      z.object({
        id,
        name: shortText,
        filters: z.preprocess(
          (value) => ({
            ...EMPTY_FILTERS,
            ...(typeof value === "object" && value !== null ? value : {}),
          }),
          filtersSchema,
        ),
      }),
    )
    .max(1000)
    .default([]),
  presets: z
    .array(z.object({ id, name: shortText, settings: withSettings }))
    .max(1000)
    .default([]),
});

/** Parse and migrate version-one portable snapshots or legacy raw web objects. Unknown fields are removed. */
export function validateWeb(input: unknown): Web {
  if (typeof input !== "object" || input === null)
    throw new Error("This file does not contain a FriendWeb graph.");
  const checkKeys = (value: unknown, depth = 0): void => {
    if (depth > 40)
      throw new Error("The import contains too many nested objects.");
    if (value === null || typeof value !== "object") return;
    for (const key of Object.keys(value)) {
      if (!safeKey(key))
        throw new Error("Reserved custom field name or identifier.");
      checkKeys((value as Record<string, unknown>)[key], depth + 1);
    }
  };
  checkKeys(input);
  const envelope = input as Record<string, unknown>;
  if ("version" in envelope && envelope.version !== 1)
    throw new Error(
      `Unsupported backup version: ${String(envelope.version)}. Please update FriendWeb.`,
    );
  const result = webSchema.safeParse("web" in envelope ? envelope.web : input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      `Invalid graph at ${issue.path.join(".") || "web"}: ${issue.message}`,
    );
  }
  const web = result.data;
  if (
    Object.keys(web.people).length > 20_000 ||
    Object.keys(web.links).length > 100_000
  )
    throw new Error(
      "This graph exceeds the import limit of 20,000 people or 100,000 connections.",
    );
  const types = new Set(web.types.map((type) => type.id));
  if (types.size !== web.types.length)
    throw new Error("Relationship type IDs must be unique.");
  for (const [key, person] of Object.entries(web.people)) {
    if (!safeKey(key) || key !== person.id)
      throw new Error("Person IDs must match their record keys.");
  }
  for (const [key, link] of Object.entries(web.links)) {
    if (!safeKey(key) || key !== link.id)
      throw new Error("Connection IDs must match their record keys.");
    if (
      !Object.hasOwn(web.people, link.source) ||
      !Object.hasOwn(web.people, link.target)
    )
      throw new Error(`Connection ${link.id} references a missing person.`);
    if (!types.has(link.type))
      throw new Error(
        `Connection ${link.id} references a missing relationship type.`,
      );
  }
  return web;
}

export function parseImport(contents: string): Web {
  if (new Blob([contents]).size > MAX_IMPORT_BYTES)
    throw new Error("Please choose a backup smaller than 32 MB.");
  let data: unknown;
  try {
    data = JSON.parse(contents);
  } catch {
    throw new Error(
      "This file is not valid JSON. Choose a FriendWeb .json backup.",
    );
  }
  return validateWeb(data);
}
export function exportJSON(web: Web): string {
  return JSON.stringify({ version: 1, web }, null, 2);
}

/** Sharing defaults deliberately remove private material from a new, detached copy. */
export function sanitizeSnapshot(
  web: Web,
  options: ShareOptions = PRIVATE_SHARE_DEFAULTS,
): Web {
  const copy = structuredClone(web);
  if (!options.notes) copy.description = "";
  for (const person of Object.values(copy.people)) {
    if (!options.notes) {
      delete person.notes;
      delete person.description;
    }
    if (!options.photos) delete person.photo;
    if (!options.custom) {
      person.custom = {};
      person.metadata = {};
      person.dates = {};
      delete person.gender;
      delete person.pronouns;
    }
    delete person.favorite;
    if (!options.birthdays) {
      delete person.birthday;
      delete person.age;
    }
  }
  for (const [id, person] of Object.entries(copy.people))
    if (person.hidden) delete copy.people[id];
  for (const [id, link] of Object.entries(copy.links)) {
    if (link.hidden || !copy.people[link.source] || !copy.people[link.target]) {
      delete copy.links[id];
      continue;
    }
    if (!options.comments) delete link.notes;
    if (!options.custom) link.custom = {};
  }
  // Search terms, bookmarked positions and private preset/view names are local workspace state.
  copy.views = [];
  copy.bookmarks = [];
  copy.presets = [];
  return copy;
}
export function encodeShare(
  web: Web,
  options: ShareOptions = PRIVATE_SHARE_DEFAULTS,
): string {
  return LZString.compressToEncodedURIComponent(
    JSON.stringify({ version: 1, web: sanitizeSnapshot(web, options) }),
  );
}
export function decodeShare(encoded: string): Web {
  const payload = encoded.replace(/^#?(?:share=)?/, "");
  if (payload.length > MAX_SHARE_LENGTH)
    throw new Error(
      "This share link is too large. Ask the sender for a portable JSON file.",
    );
  const decoded = LZString.decompressFromEncodedURIComponent(payload);
  if (!decoded || decoded.length > MAX_IMPORT_BYTES)
    throw new Error(
      "This share link is damaged or exceeds the supported size.",
    );
  return parseImport(decoded);
}
export function downloadFile(
  filename: string,
  content: string | Blob,
  type = "application/json",
): void {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function makePerson(
  firstName: string,
  partial: Partial<Person> = {},
): Person {
  const now = new Date().toISOString();
  return personSchema.parse({
    id: crypto.randomUUID(),
    tags: [],
    groups: [],
    custom: {},
    dates: {},
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...partial,
    firstName,
  });
}

function csvRows(contents: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = contents.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index++;
      } else if (quoted) quoted = false;
      else if (!field.trim()) quoted = true;
      else throw new Error(`Unexpected quote in CSV row ${rows.length + 1}.`);
    } else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index++;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("A quoted CSV field was never closed.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

/** CSV never infers attributes or relationships. Unrecognised columns become custom fields. */
export function parseCSV(contents: string): Person[] {
  if (new Blob([contents]).size > MAX_IMPORT_BYTES)
    throw new Error("Please choose a CSV smaller than 32 MB.");
  const rows = csvRows(contents);
  if (rows.length < 2)
    throw new Error("CSV needs a header row and at least one person.");
  if (rows.length > 20_001)
    throw new Error("Import at most 20,000 people at a time.");
  const headers = rows[0];
  const normalize = (header: string) =>
    header.toLowerCase().replace(/[\s_-]/g, "");
  if (
    !headers.some((header) => ["firstname", "name"].includes(normalize(header)))
  )
    throw new Error("CSV needs a firstName or name column.");
  return rows.slice(1).map((values, index) => {
    if (values.length > headers.length)
      throw new Error(
        `CSV row ${index + 2} has more values than column headings.`,
      );
    const fields: Record<string, unknown> = { custom: {} };
    headers.forEach((header, column) => {
      const value = values[column] ?? "";
      const normalized = normalize(header);
      if (!value) return;
      const scalar: Record<string, string> = {
        name: "firstName",
        firstname: "firstName",
        lastname: "lastName",
        nickname: "nickname",
        pronouns: "pronouns",
        gender: "gender",
        birthday: "birthday",
        description: "description",
        notes: "notes",
        color: "color",
      };
      if (Object.hasOwn(scalar, normalized)) fields[scalar[normalized]] = value;
      else if (normalized === "age") fields.age = Number(value);
      else if (normalized === "tags" || normalized === "groups")
        fields[normalized] = value
          .split(/[|;]/)
          .map((item) => item.trim())
          .filter(Boolean);
      else if (
        safeKey(header.replace(/^custom:/i, "")) &&
        header.replace(/^custom:/i, "").trim()
      )
        (fields.custom as Record<string, string>)[
          header.replace(/^custom:/i, "")
        ] = value;
      else throw new Error(`Reserved CSV heading: ${header}.`);
    });
    if (typeof fields.firstName !== "string" || !fields.firstName.trim())
      throw new Error(`CSV row ${index + 2} needs a first name.`);
    try {
      return makePerson(fields.firstName, fields as Partial<Person>);
    } catch (error) {
      throw new Error(
        `Invalid data in CSV row ${index + 2}: ${error instanceof Error ? error.message : "Check the values."}`,
      );
    }
  });
}
