import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from "drizzle-orm/sqlite-core";
export const accounts = sqliteTable("chef_accounts", {
  userId: text("user_id").primaryKey(),
  version: integer("version").notNull().default(0),
  state: text("state").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const jobs = sqliteTable("chef_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(),
  phase: text("phase").notNull(),
  data: text("data").notNull(),
  error: text("error"),
  lease: text("lease"),
  leaseUntil: integer("lease_until").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const nutrientCache = sqliteTable("chef_nutrient_cache", {
  name: text("name").primaryKey(),
  data: text("data").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const receipts = sqliteTable(
  "chef_receipts",
  {
    userId: text("user_id").notNull(),
    id: text("id").notNull(),
    at: text("at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.id] })],
);
