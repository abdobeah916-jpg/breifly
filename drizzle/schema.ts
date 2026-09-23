import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/** Core user table backing Manus OAuth. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const briefs = mysqlTable("briefs", {
  id: int("id").autoincrement().primaryKey(),
  briefId: varchar("briefId", { length: 32 }).notNull().unique(),
  ownerId: int("ownerId").notNull(),
  status: mysqlEnum("status", [
    "draft",
    "submitted",
    "needs-info",
    "accepted",
    "scoped",
    "in-production",
    "ready-for-review",
    "changes-requested",
    "delivered",
    "cancelled",
  ]).default("draft").notNull(),
  idea: text("idea").notNull(),
  projectType: varchar("projectType", { length: 120 }),
  audience: text("audience"),
  scope: text("scope"),
  budget: varchar("budget", { length: 120 }),
  targetDate: varchar("targetDate", { length: 120 }),
  structuredBrief: text("structuredBrief").notNull(),
  aiNotes: text("aiNotes").notNull(),
  openQuestions: text("openQuestions").notNull(),
  termsVersion: varchar("termsVersion", { length: 32 }),
  acceptedAt: timestamp("acceptedAt"),
  acceptedBy: int("acceptedBy"),
  consentScope: text("consentScope"),
  paymentStatus: mysqlEnum("paymentStatus", ["unpaid", "processing", "paid", "failed"]).default("unpaid").notNull(),
  paymentIntentId: varchar("paymentIntentId", { length: 255 }),
  paymentAmount: int("paymentAmount"),
  paymentCurrency: varchar("paymentCurrency", { length: 3 }).default("usd").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Brief = typeof briefs.$inferSelect;
export type InsertBrief = typeof briefs.$inferInsert;
