import { useState } from 'react';

const key = (v: unknown) => JSON.stringify(v);

/** A local draft of a server value (a settings form). It follows the server by *value*, not by object identity
 *  (queries refetch on window focus and return new objects), and only while it is not being edited: a refetch never
 *  discards unsaved changes. After a save, `setDraft(saved)` so the draft equals what the server now has. */
export function useDraft<T>(server: T) {
  const serverKey = key(server);
  const [draft, setDraft] = useState(server);
  const [base, setBase] = useState(serverKey);
  if (serverKey !== base) {
    // Adjusting state while rendering (React docs, "storing information from previous renders").
    if (key(draft) === base) setDraft(server);
    setBase(serverKey);
  }
  return { draft, setDraft, dirty: key(draft) !== serverKey, reset: () => setDraft(server) };
}
