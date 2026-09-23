import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { Brief, briefs, InsertBrief, InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function createBrief(input: InsertBrief): Promise<Brief> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(briefs).values(input);
  const created = await db.select().from(briefs).where(eq(briefs.briefId, input.briefId)).limit(1);
  if (!created[0]) throw new Error("Brief could not be created");
  return created[0];
}

export async function getBriefForOwner(briefId: string, ownerId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(briefs).where(eq(briefs.briefId, briefId)).limit(1);
  return result[0]?.ownerId === ownerId ? result[0] : undefined;
}

export async function listBriefsForOwner(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(briefs).where(eq(briefs.ownerId, ownerId)).orderBy(desc(briefs.updatedAt));
}

export async function updateBrief(briefId: string, ownerId: number, values: Partial<InsertBrief>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(briefs).set(values).where(eq(briefs.briefId, briefId));
  return getBriefForOwner(briefId, ownerId);
}
