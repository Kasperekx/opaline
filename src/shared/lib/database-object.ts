import type { DatabaseObject } from "../types/database";

export const databaseObjectKey = (object: DatabaseObject) =>
  JSON.stringify([object.schema, object.name]);

const quoteIdentifier = (identifier: string) =>
  `"${identifier.replace(/"/g, '""')}"`;

export const qualifiedObjectName = (object: DatabaseObject) =>
  `${quoteIdentifier(object.schema)}.${quoteIdentifier(object.name)}`;
