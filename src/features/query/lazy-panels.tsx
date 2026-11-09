import { lazy, Suspense, type ComponentType } from "react";

/* Secondary workspace surfaces load on first use so they stay out of the
   workspace's first paint. Each one carries its own quiet boundary (renders
   nothing while its chunk loads, typically a few milliseconds from disk), so
   callers render them exactly like the eager components and an open panel is
   never hidden while another one loads. Their stylesheets are imported
   eagerly by workspace-styles.ts to keep cascade order unchanged. */
function lazyPanel<Props extends object>(
  load: () => Promise<ComponentType<Props>>,
) {
  const Lazy = lazy(() => load().then((component) => ({ default: component })));
  function Panel(props: Props) {
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    );
  }
  return Panel;
}

export const SchemaEditor = lazyPanel(() =>
  import("../structure/SchemaEditor").then((module) => module.SchemaEditor),
);
export const BackupDialog = lazyPanel(() =>
  import("../backup/BackupDialog").then((module) => module.BackupDialog),
);
export const NamespaceDialog = lazyPanel(() =>
  import("../explorer/NamespaceDialog").then(
    (module) => module.NamespaceDialog,
  ),
);
export const HelpDialog = lazyPanel(() =>
  import("../../shared/components/HelpDialog").then(
    (module) => module.HelpDialog,
  ),
);
export const QueryLibrary = lazyPanel(() =>
  import("./QueryLibrary").then((module) => module.QueryLibrary),
);
export const CommandPalette = lazyPanel(() =>
  import("./CommandPalette").then((module) => module.CommandPalette),
);
export const QueryHistoryPanel = lazyPanel(() =>
  import("./QueryHistoryPanel").then((module) => module.QueryHistoryPanel),
);
export const QueryPreferencesPanel = lazyPanel(() =>
  import("./QueryPreferencesPanel").then(
    (module) => module.QueryPreferencesPanel,
  ),
);
