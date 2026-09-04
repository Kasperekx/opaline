import { ConnectionModal } from "./features/connections/ConnectionModal";
import { Welcome } from "./features/connections/Welcome";
import { useConnection } from "./features/connections/useConnection";
import { Workspace } from "./features/query/Workspace";
import "./App.css";

function App() {
  const session = useConnection();

  return (
    <>
      {session.connection ? (
        <Workspace
          connection={session.connection}
          onDisconnect={() => void session.disconnect()}
        />
      ) : (
        <Welcome onConnect={session.openModal} />
      )}
      <ConnectionModal
        open={session.modalOpen}
        busy={session.connecting}
        error={session.error}
        onClose={session.closeModal}
        onSubmit={(value) => void session.connect(value)}
      />
    </>
  );
}

export default App;
