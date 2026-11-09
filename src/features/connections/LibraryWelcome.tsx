import { ArrowDownUp, LockKeyhole, Plus } from "lucide-react";
import { version } from "../../../package.json";
import { BrandMark } from "../../shared/components/BrandMark";
import { handleWindowDrag } from "../../shared/lib/window-drag";

/** The home screen's welcome column: identity and the first actions. */
export function LibraryWelcome({
  available,
  canTransfer,
  onCreate,
  onTransfer,
}: {
  available: boolean;
  canTransfer: boolean;
  onCreate: () => void;
  onTransfer: () => void;
}) {
  return (
    <div
      className="library-welcome"
      data-tauri-drag-region
      onMouseDown={handleWindowDrag}
    >
      <div className="library-welcome-identity">
        <BrandMark className="brand-mark-hero" label="Opaline app icon" />
        <div>
          <p className="library-welcome-title">Opaline</p>
          <span className="library-welcome-version">Version {version}</span>
        </div>
      </div>
      <div className="library-quick-actions">
        <button disabled={!available} onClick={onCreate}>
          <span aria-hidden="true">
            <Plus size={14} />
          </span>
          New connection…
        </button>
        <button disabled={!available || !canTransfer} onClick={onTransfer}>
          <span aria-hidden="true">
            <ArrowDownUp size={14} />
          </span>
          Import or export profiles…
        </button>
      </div>
      <p className="library-welcome-note">
        <LockKeyhole size={11} aria-hidden="true" />
        No account. Passwords stay in your Keychain.
      </p>
    </div>
  );
}
