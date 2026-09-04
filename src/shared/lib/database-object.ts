import type { DatabaseObject } from "../types/database";

export const databaseObjectKey = (object: DatabaseObject) =>
  JSON.stringify([object.schema, object.name]);

export const quoteIdentifier = (identifier: string) =>
  `"${identifier.replace(/"/g, '""')}"`;

export const qualifiedRelationName = (schema: string, name: string) =>
  `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`;

export const qualifiedObjectName = (object: DatabaseObject) =>
  qualifiedRelationName(object.schema, object.name);
