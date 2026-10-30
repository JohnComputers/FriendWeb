import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TYPES } from "./defaults";
import {
  decodeShare,
  encodeShare,
  exportJSON,
  makePerson,
  parseCSV,
  parseImport,
  sanitizeSnapshot,
  validateWeb,
} from "./importExport";
import type { Web } from "../types";

function fixture(): Web {
  const a = makePerson("Alex", {
    notes: "Private journal",
    gender: "Private identity",
    pronouns: "Private pronouns",
    description: "Private description",
    photo: "data:image/png;base64,YQ==",
    birthday: "1994-01-02",
    age: 32,
    custom: { phone: "123" },
    metadata: { private: "yes" },
    dates: { meeting: "yesterday" },
    position: { x: 12, y: 3, z: -4 },
  });
  const b = makePerson("Alex", { lastName: "Brown" });
  const link = {
    id: crypto.randomUUID(),
    source: a.id,
    target: b.id,
    type: "friend",
    notes: "Private comment",
    weight: 1,
    directed: true,
    custom: { reason: "Private" },
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
  return {
    id: crypto.randomUUID(),
    name: "Test web",
    description: "A little graph",
    people: { [a.id]: a, [b.id]: b },
    links: { [link.id]: link },
    types: structuredClone(DEFAULT_TYPES),
    settings: structuredClone(DEFAULT_SETTINGS),
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    bookmarks: [],
    views: [],
    presets: [],
  };
}

describe("portable JSON", () => {
  it("round-trips positions, same-name people, relationship direction, and private data", () => {
    const original = fixture();
    expect(parseImport(exportJSON(original))).toEqual(original);
  });
  it("migrates missing optional version-one fields and defaults", () => {
    const web = fixture();
    const legacy = JSON.parse(JSON.stringify(web));
    delete legacy.bookmarks;
    delete legacy.views;
    delete legacy.presets;
    delete legacy.settings.nodeGlow;
    expect(validateWeb(legacy).settings.nodeGlow).toBe(
      DEFAULT_SETTINGS.nodeGlow,
    );
    expect(validateWeb(legacy).bookmarks).toEqual([]);
  });
  it("rejects unknown versions, dangling links, bad color, unsafe remote photos, and non-finite numbers", () => {
    expect(() => validateWeb({ version: 999, web: fixture() })).toThrow(
      "Unsupported backup version",
    );
    const web = fixture();
    const link = Object.values(web.links)[0];
    link.target = "missing";
    expect(() => validateWeb(web)).toThrow("missing person");
    link.target = Object.keys(web.people)[1];
    const person = Object.values(web.people)[0];
    person.color = "url(https://tracker.test)";
    expect(() => validateWeb(web)).toThrow("hexadecimal");
    delete person.color;
    person.photo = "https://tracker.test/pixel.png";
    expect(() => validateWeb(web)).toThrow("Photos");
    delete person.photo;
    web.settings.charge = Infinity;
    expect(() => validateWeb(web)).toThrow();
  });
  it("rejects prototype names instead of polluting objects", () => {
    const web = fixture();
    const person = Object.values(web.people)[0];
    person.custom = JSON.parse('{"__proto__":"malicious"}');
    expect(() => validateWeb(web)).toThrow("Reserved custom field name");
    expect(({} as Record<string, unknown>).malicious).toBeUndefined();
  });
});

describe("private sharing", () => {
  it("excludes sensitive fields by default without modifying the original", () => {
    const original = fixture();
    const shared = decodeShare(encodeShare(original));
    const person = Object.values(shared.people)[0];
    const link = Object.values(shared.links)[0];
    expect(person.notes).toBeUndefined();
    expect(person.gender).toBeUndefined();
    expect(person.pronouns).toBeUndefined();
    expect(shared.description).toBe("");
    expect(person.description).toBeUndefined();
    expect(person.photo).toBeUndefined();
    expect(person.birthday).toBeUndefined();
    expect(person.age).toBeUndefined();
    expect(person.custom).toEqual({});
    expect(person.metadata).toEqual({});
    expect(link.notes).toBeUndefined();
    expect(link.custom).toEqual({});
    expect(person.position).toEqual({ x: 12, y: 3, z: -4 });
    expect(Object.values(original.people)[0].notes).toBe("Private journal");
  });
  it("removes hidden people, hidden links, and links to hidden people", () => {
    const original = fixture();
    const ids = Object.keys(original.people);
    original.people[ids[0]].hidden = true;
    const shared = sanitizeSnapshot(original);
    expect(Object.keys(shared.people)).toEqual([ids[1]]);
    expect(Object.keys(shared.links)).toEqual([]);
    delete original.people[ids[0]].hidden;
    Object.values(original.links)[0].hidden = true;
    expect(Object.keys(sanitizeSnapshot(original).links)).toEqual([]);
    expect(Object.keys(original.links)).toHaveLength(1);
  });
  it("keeps custom metadata consent separate from private descriptions", () => {
    const web = fixture();
    const id = Object.keys(web.people)[0];
    const shared = sanitizeSnapshot(web, {
      notes: true,
      custom: false,
      photos: false,
      birthdays: false,
      comments: false,
    });
    expect(shared.people[id].notes).toBe("Private journal");
    expect(shared.people[id].metadata).toEqual({});
    expect(shared.people[id].dates).toEqual({});
  });
  it("retains explicitly included sensitive data", () => {
    const original = fixture();
    const included = sanitizeSnapshot(original, {
      notes: true,
      photos: true,
      custom: true,
      birthdays: true,
      comments: true,
    });
    expect(included.people).toEqual(original.people);
    expect(included.links).toEqual(original.links);
  });
  it("rejects damaged or oversized share payloads", () => {
    expect(() => decodeShare("invalid payload!")).toThrow();
    expect(() => decodeShare("x".repeat(100_001))).toThrow("too large");
  });
});

describe("CSV import", () => {
  it("supports BOM, quoted commas, escaped quotes, line breaks, groups and custom fields", () => {
    const people = parseCSV(
      '\uFEFFfirst_name,lastName,notes,tags,groups,Favorite drink\r\n"Alex, Jr.",Brown,"Said ""hello""\nmet at work",music|art,Friends|Work,Tea\r\nAlex,Green,,,,Coffee',
    );
    expect(people).toHaveLength(2);
    expect(people[0].firstName).toBe("Alex, Jr.");
    expect(people[0].notes).toBe('Said "hello"\nmet at work');
    expect(people[0].tags).toEqual(["music", "art"]);
    expect(people[0].groups).toEqual(["Friends", "Work"]);
    expect(people[0].custom).toEqual({ "Favorite drink": "Tea" });
    expect(people[0].id).not.toBe(people[1].id);
  });
  it("supports the documented semicolon delimiter and custom: headings", () => {
    const people = parseCSV(
      "firstName,tags,groups,custom:City\nAlex,books;art,Work;Friends,Paris",
    );
    expect(people[0].tags).toEqual(["books", "art"]);
    expect(people[0].groups).toEqual(["Work", "Friends"]);
    expect(people[0].custom).toEqual({ City: "Paris" });
    expect(() => parseCSV("firstName,custom:__proto__\nAlex,bad")).toThrow(
      "Reserved",
    );
  });
  it("gives row-specific errors and rejects malformed quotes", () => {
    expect(() => parseCSV("firstName,age\nAlex,not-a-number")).toThrow("row 2");
    expect(() => parseCSV("firstName,lastName\n,Smith")).toThrow("row 2");
    expect(() => parseCSV('firstName\n"never closed')).toThrow("never closed");
    expect(() => parseCSV("lastName\nSmith")).toThrow("firstName");
  });
});
