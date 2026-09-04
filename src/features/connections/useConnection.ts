import { useCallback, useEffect, useState } from "react";
import {
  databaseApi,
  errorMessage,
  isDesktopRuntime,
} from "../../shared/lib/database-api";
import type { ConnectionConfig, ConnectionInfo } from "../../shared/types/database";

export function useConnection() {
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    databaseApi.connectionInfo().then(setConnection).catch(() => undefined);
  }, []);

  const openModal = useCallback(() => {
    setError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    if (!connecting) setModalOpen(false);
  }, [connecting]);

  const connect = useCallback(async (input: ConnectionConfig) => {
    if (!isDesktopRuntime()) {
      setError("Database connections are available in the desktop app. Run `npm run tauri dev`.");
      return;
    }

    setConnecting(true);
    setError(null);
    try {
      setConnection(await databaseApi.connect(input));
      setModalOpen(false);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await databaseApi.disconnect();
    } finally {
      setConnection(null);
    }
  }, []);

  return {
    connection,
    modalOpen,
    connecting,
    error,
    openModal,
    closeModal,
    connect,
    disconnect,
  };
}
