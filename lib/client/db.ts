"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { JournalEntry } from "../types";

/** Everything lives in this browser's IndexedDB. Nothing is synced anywhere. */
interface SideQuestDB extends DBSchema {
  journal: { key: string; value: JournalEntry; indexes: { offeredAt: string } };
  photos: { key: string; value: { id: string; blob: Blob; createdAt: string } };
}

let dbPromise: Promise<IDBPDatabase<SideQuestDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<SideQuestDB>("side-quest", 1, {
      upgrade(d) {
        const j = d.createObjectStore("journal", { keyPath: "id" });
        j.createIndex("offeredAt", "offeredAt");
        d.createObjectStore("photos", { keyPath: "id" });
      }
    });
  }
  return dbPromise;
}

export async function saveEntry(e: JournalEntry): Promise<void> {
  await (await db()).put("journal", e);
}

export async function getEntry(id: string): Promise<JournalEntry | undefined> {
  return (await db()).get("journal", id);
}

export async function listEntries(): Promise<JournalEntry[]> {
  const all = await (await db()).getAllFromIndex("journal", "offeredAt");
  return all.reverse();
}

export async function updateEntry(id: string, patch: Partial<JournalEntry>): Promise<JournalEntry | undefined> {
  const d = await db();
  const cur = await d.get("journal", id);
  if (!cur) return undefined;
  const next = { ...cur, ...patch };
  await d.put("journal", next);
  return next;
}

export async function savePhoto(blob: Blob): Promise<string> {
  const id = `p_${Date.now().toString(36)}`;
  await (await db()).put("photos", { id, blob, createdAt: new Date().toISOString() });
  return id;
}

export async function getPhoto(id: string): Promise<Blob | undefined> {
  return (await (await db()).get("photos", id))?.blob;
}

export async function clearEverything(): Promise<void> {
  const d = await db();
  await d.clear("journal");
  await d.clear("photos");
}
