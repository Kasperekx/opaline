import { useCallback, useRef } from "react";

// React state alone cannot guard two clicks delivered before the next render.
export function useOperationLock() {
  const locked = useRef(false);
  return useCallback(
    async <T>(action: () => Promise<T>): Promise<T | false> => {
      if (locked.current) return false;
      locked.current = true;
      try {
        return await action();
      } finally {
        locked.current = false;
      }
    },
    [],
  );
}
