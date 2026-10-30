import { describe, expect, it } from "vitest";
import { makeWeb, makePerson } from "./sample";
import { PRIVATE_SHARE_DEFAULTS } from "./importExport";
import {
  decryptSnapshot,
  encryptSnapshot,
  MAX_ENCRYPTED_FILE_LENGTH,
  MAX_ENCRYPTED_SHARE_LENGTH,
} from "./shareEncryption";

function fixture() {
  const web = makeWeb("A shared web");
  const person = makePerson("Ari", {
    notes: "private thought",
    birthday: "2000-06-01",
    position: { x: 1, y: 2, z: 3 },
  });
  web.people[person.id] = person;
  return web;
}

describe("password-protected snapshots", () => {
  it("encrypts and decrypts the graph while excluding private fields by default", async () => {
    const original = fixture();
    const encoded = await encryptSnapshot(
      original,
      PRIVATE_SHARE_DEFAULTS,
      "correct horse battery staple",
    );
    expect(encoded.startsWith("v1.")).toBe(true);
    expect(encoded).not.toContain("Ari");
    expect(encoded).not.toContain("correct horse battery staple");
    expect(encoded).not.toContain("private thought");
    const restored = await decryptSnapshot(
      encoded,
      "correct horse battery staple",
    );
    const person = Object.values(restored.people)[0];
    expect(person.firstName).toBe("Ari");
    expect(person.notes).toBeUndefined();
    expect(person.birthday).toBeUndefined();
    expect(person.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(Object.values(original.people)[0].notes).toBe("private thought");
  });

  it("honors explicit inclusion and uses a fresh salt and IV each time", async () => {
    const web = fixture();
    const options = { ...PRIVATE_SHARE_DEFAULTS, notes: true, birthdays: true };
    const first = await encryptSnapshot(web, options, "same password");
    const second = await encryptSnapshot(web, options, "same password");
    expect(first).not.toBe(second);
    const person = Object.values(
      (await decryptSnapshot(first, "same password")).people,
    )[0];
    expect(person.notes).toBe("private thought");
    expect(person.birthday).toBe("2000-06-01");
  });

  it("rejects wrong passwords, modified ciphertext, malformed inputs, and oversized link fragments", async () => {
    const encoded = await encryptSnapshot(
      fixture(),
      PRIVATE_SHARE_DEFAULTS,
      "correct password",
    );
    await expect(decryptSnapshot(encoded, "wrong password")).rejects.toThrow(
      "Incorrect password or damaged snapshot",
    );
    const at = Math.floor(encoded.length / 2);
    const modified =
      encoded.slice(0, at) +
      (encoded[at] === "A" ? "B" : "A") +
      encoded.slice(at + 1);
    await expect(decryptSnapshot(modified, "correct password")).rejects.toThrow(
      "Incorrect password or damaged snapshot",
    );
    for (const input of [
      "v2.ABC",
      "v1.x",
      "v1.<script>",
      "v1." + "a".repeat(MAX_ENCRYPTED_SHARE_LENGTH),
    ]) {
      await expect(decryptSnapshot(input, "password")).rejects.toThrow(
        "Incorrect password or damaged snapshot",
      );
    }
  });

  it("supports larger encrypted files with an explicit limit, but not as a link", async () => {
    const web = fixture();
    const random = crypto.getRandomValues(new Uint8Array(24000));
    Object.values(web.people)[0].notes = btoa(String.fromCharCode(...random));
    const payload = await encryptSnapshot(
      web,
      { ...PRIVATE_SHARE_DEFAULTS, notes: true },
      "file password",
    );
    expect(payload.length).toBeGreaterThan(MAX_ENCRYPTED_SHARE_LENGTH);
    await expect(decryptSnapshot(payload, "file password")).rejects.toThrow();
    const restored = await decryptSnapshot(
      payload,
      "file password",
      MAX_ENCRYPTED_FILE_LENGTH,
    );
    expect(Object.values(restored.people)[0].notes).toBe(
      Object.values(web.people)[0].notes,
    );
  });

  it("requires a bounded, nonempty password", async () => {
    await expect(
      encryptSnapshot(fixture(), PRIVATE_SHARE_DEFAULTS, ""),
    ).rejects.toThrow("Enter a password");
    await expect(
      encryptSnapshot(fixture(), PRIVATE_SHARE_DEFAULTS, "x".repeat(1025)),
    ).rejects.toThrow("Enter a password");
  });
});
