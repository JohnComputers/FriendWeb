import { openDB } from "idb";
import type { Web } from "../types";
export interface PersistedData {
  webs: Web[];
  activeId: string;
  updatedAt: string;
}
const database = () =>
  openDB("friendweb-local", 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("state")) db.createObjectStore("state");
      if (!db.objectStoreNames.contains("recovery"))
        db.createObjectStore("recovery");
    },
  });
export async function readData(): Promise<PersistedData | null> {
  const db = await database();
  try {
    return (
      (await db.get("state", "workspace")) ??
      (await db.get("recovery", "workspace")) ??
      null
    );
  } finally {
    db.close();
  }
}
export async function writeData(data: PersistedData): Promise<void> {
  const db = await database();
  try {
    const tx = db.transaction(["state", "recovery"], "readwrite");
    const previous = await tx.objectStore("state").get("workspace");
    if (previous) await tx.objectStore("recovery").put(previous, "workspace");
    await tx.objectStore("state").put(data, "workspace");
    await tx.done;
  } finally {
    db.close();
  }
}
export async function deleteData(): Promise<void> {
  const db = await database();
  try {
    const tx = db.transaction(["state", "recovery"], "readwrite");
    await tx.objectStore("state").clear();
    await tx.objectStore("recovery").clear();
    await tx.done;
  } finally {
    db.close();
  }
}
export async function readRecovery(): Promise<PersistedData | null> {
  const db = await database();
  try {
    return (await db.get("recovery", "workspace")) ?? null;
  } finally {
    db.close();
  }
}
