import { useEffect, useState } from "react";
import { errorMessage, isDesktopRuntime } from "../../shared/lib/database-api";
import { ConnectionDetails } from "./ConnectionDetails";
import { ConnectionDialog } from "./ConnectionDialog";
import { ProfileEditor } from "./ProfileEditor";
import { WorkspaceEditor } from "./WorkspaceEditor";
import { ProductSidebar } from "./ProductSidebar";
import { ConnectionList } from "./ConnectionList";
import { ProfileOrganization } from "./ProfileOrganization";
import { ProfileTransferDialog } from "./ProfileTransferDialog";
import { readLocalJson, writeLocalJson } from "../../shared/lib/local-storage";
import "../query/p1.css";
import { useWorkRisk } from "../../shared/safety/WorkSafety";
import { connectionApi } from "./connection-api";
import {
  newProfile,
  profileInput,
  type ConnectionCatalog,
  type ConnectionProfile,
  type ProductWorkspace,
  type ProfileInput,
  type SessionInfo,
} from "./connection-types";

export function ConnectionManager({
  catalog,
  sessions,
  loading,
  busy,
  onCatalog,
  onConnect,
  request,
}: {
  catalog: ConnectionCatalog;
  sessions: SessionInfo[];
  loading: boolean;
  busy: boolean;
  onCatalog: (catalog: ConnectionCatalog) => void;
  onConnect: (profile: ConnectionProfile) => void;
  request?: { workspaceId: string; create: boolean; nonce: number } | null;
}) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(() =>
    readLocalJson("opaline.last-workspace.v1", null),
  );
  const [organizing, setOrganizing] = useState<{
    profile?: ConnectionProfile;
  } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  useEffect(() => {
    if (workspaceId) writeLocalJson("opaline.last-workspace.v1", workspaceId);
  }, [workspaceId]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [environment, setEnvironment] = useState("all");
  const [editor, setEditor] = useState<ProfileInput | null>(null);
  const [workspaceEditor, setWorkspaceEditor] = useState<{
    workspace: ProductWorkspace | null;
  } | null>(null);
  const [deleting, setDeleting] = useState<ConnectionProfile | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  useWorkRisk({ label: "Deleting connection profile", busy: deleteBusy });
  const [deleteError, setDeleteError] = useState<string | null>(null);
  useEffect(() => {
    if (!request) return;
    setWorkspaceId(request.workspaceId);
    setSelectedId(null);
    setSearch("");
    setEnvironment("all");
    if (request.create) setEditor(newProfile(request.workspaceId));
  }, [request]);
  const workspace =
    catalog.workspaces.find((w) => w.id === workspaceId) ??
    catalog.workspaces[0];
  const profiles = catalog.profiles.filter(
    (p) => p.workspaceId === workspace?.id,
  );
  const visible = profiles.filter(
    (p) =>
      (environment === "all" || p.environment === environment) &&
      [p.name, p.host, p.database].some((s) =>
        s.toLowerCase().includes(search.toLowerCase()),
      ),
  );
  const selected = profiles.find((p) => p.id === selectedId);
  const available = isDesktopRuntime() && !loading && !busy;
  const selectWorkspace = (id: string) => {
    setWorkspaceId(id);
    setSelectedId(null);
    setSearch("");
    setEnvironment("all");
  };
  const createConnection = () => {
    if (workspace) setEditor(newProfile(workspace.id));
    else setWorkspaceEditor({ workspace: null });
  };
  return (
    <main className="connection-manager">
      <ProductSidebar
        workspaces={catalog.workspaces}
        profiles={catalog.profiles}
        workspace={workspace}
        available={available}
        onSelect={selectWorkspace}
        onCreate={() => setWorkspaceEditor({ workspace: null })}
      />
      <ConnectionList
        workspace={workspace}
        visible={visible}
        profileCount={profiles.length}
        sessions={sessions}
        loading={loading}
        available={available}
        search={search}
        environment={environment}
        onSearch={setSearch}
        onEnvironment={setEnvironment}
        onSelect={setSelectedId}
        onConnect={onConnect}
        onEdit={(profile) => setEditor(profileInput(profile))}
        onRename={() => setWorkspaceEditor({ workspace })}
        onCreate={createConnection}
        onTransfer={() => setTransferOpen(true)}
        onRemoveWorkspace={() => setOrganizing({})}
      />
      {selected && (
        <ConnectionDialog
          title={selected.name}
          subtitle={`${workspace?.name ?? ""} / PostgreSQL`}
          onClose={() => setSelectedId(null)}
        >
          <ConnectionDetails
            profile={selected}
            active={sessions.some((s) => s.profileId === selected.id)}
            busy={busy}
            onConnect={() => {
              setSelectedId(null);
              onConnect(selected);
            }}
            onEdit={() => {
              setSelectedId(null);
              setEditor(profileInput(selected));
            }}
            onDuplicate={() => {
              setSelectedId(null);
              setEditor(profileInput(selected, true));
            }}
            onMove={() => {
              setOrganizing({ profile: selected });
              setSelectedId(null);
            }}
            onDelete={() => {
              setSelectedId(null);
              setDeleteError(null);
              setDeleting(selected);
            }}
          />
        </ConnectionDialog>
      )}
      {workspaceEditor && (
        <WorkspaceEditor
          workspace={workspaceEditor.workspace}
          onClose={() => setWorkspaceEditor(null)}
          onSaved={(next) => {
            onCatalog(next);
            setWorkspaceId(
              workspaceEditor.workspace?.id ??
                next.workspaces[next.workspaces.length - 1]!.id,
            );
            setWorkspaceEditor(null);
          }}
        />
      )}
      {workspace && organizing && (
        <ProfileOrganization
          catalog={catalog}
          workspace={workspace}
          profile={organizing.profile}
          sessions={sessions}
          onSaved={onCatalog}
          onClose={() => setOrganizing(null)}
        />
      )}
      {workspace && transferOpen && (
        <ProfileTransferDialog
          workspace={workspace}
          onSaved={onCatalog}
          onClose={() => setTransferOpen(false)}
        />
      )}
      {editor && (
        <ProfileEditor
          initial={editor}
          workspaces={catalog.workspaces}
          onClose={() => setEditor(null)}
          onSaved={(next, input) => {
            onCatalog(next);
            setWorkspaceId(input.workspaceId);
            setSelectedId(null);
            setSearch("");
            setEnvironment("all");
            setEditor(null);
          }}
        />
      )}
      {deleting && (
        <ConnectionDialog
          title="Delete connection profile?"
          subtitle={deleting.name}
          busy={deleteBusy}
          onClose={() => setDeleting(null)}
        >
          <div className="profile-fields">
            <p>
              This removes the saved profile and its system-vault password. It
              does not change the database.
            </p>
            {deleteError && (
              <p role="alert" className="form-error">
                {deleteError}
              </p>
            )}
          </div>
          <footer className="connection-dialog-footer">
            <button
              className="button ghost"
              disabled={deleteBusy}
              onClick={() => setDeleting(null)}
            >
              Keep profile
            </button>
            <button
              className="button production-button"
              disabled={deleteBusy}
              onClick={() => {
                setDeleteBusy(true);
                void connectionApi
                  .delete(deleting.id)
                  .then((next) => {
                    onCatalog(next);
                    setDeleting(null);
                  })
                  .catch((e) => setDeleteError(errorMessage(e)))
                  .finally(() => setDeleteBusy(false));
              }}
            >
              Delete profile
            </button>
          </footer>
        </ConnectionDialog>
      )}
    </main>
  );
}
