import type { ConnectionConfig } from "../../shared/types/database";

export const initialConnection: ConnectionConfig = {
  name: "Local PostgreSQL",
  host: "localhost",
  port: 5432,
  database: "postgres",
  username: "postgres",
  password: "",
  sslMode: "prefer",
};
