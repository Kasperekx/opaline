import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
export type SqlDocument = { id: string; path: string; content: string };
const filters = [{ name: "SQL document", extensions: ["sql"] }];
export const sqlDocumentApi = {
  async open() {
    const path = await open({ multiple: false, filters });
    return typeof path === "string"
      ? invoke<SqlDocument>("open_sql_file", { path })
      : null;
  },
  async save(
    content: string,
    file?: { id: string; path: string },
    saveAs = false,
  ) {
    const path =
      !file || saveAs
        ? await save({ defaultPath: file?.path ?? "query.sql", filters })
        : null;
    if ((!file || saveAs) && !path) return null;
    return invoke<SqlDocument>("save_sql_file", {
      id: file?.id ?? null,
      path,
      content,
    });
  },
  release: (id: string) => invoke<void>("release_sql_file", { id }),
  async format(original: string) {
    const { format } = await import("sql-formatter");
    const formatted = format(original, {
      language: "postgresql",
      tabWidth: 2,
      keywordCase: "preserve",
    });
    await invoke("validate_sql_format", { original, formatted });
    return formatted;
  },
};
