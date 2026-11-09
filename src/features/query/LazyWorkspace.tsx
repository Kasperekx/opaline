import { lazy, Suspense, type ComponentProps } from "react";
import "./workspace-styles";

/* The workspace (SQL editor, grids, structure tools, CodeMirror) is not needed
   to paint the connection library, so it loads in its own chunk. App preloads
   it right after first paint; by the time a connection opens it is ready. */
const loadWorkspace = () => import("./Workspace");

export function preloadWorkspace() {
  void loadWorkspace();
}

const LazyWorkspace = lazy(() =>
  loadWorkspace().then((module) => ({ default: module.Workspace })),
);

export function Workspace(props: ComponentProps<typeof LazyWorkspace>) {
  return (
    <Suspense fallback={null}>
      <LazyWorkspace {...props} />
    </Suspense>
  );
}
