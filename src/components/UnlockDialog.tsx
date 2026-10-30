import { useState, type FormEvent } from "react";
import { LockKeyhole, Unlock, LoaderCircle } from "lucide-react";
import { Modal } from "./Modal";
import {
  decryptSnapshot,
  MAX_ENCRYPTED_FILE_LENGTH,
} from "../lib/shareEncryption";
import type { Web } from "../types";

export interface LockedSnapshot {
  payload: string;
  source: "link" | "file";
}
export function UnlockDialog({
  snapshot,
  onClose,
  onUnlock,
}: {
  snapshot: LockedSnapshot;
  onClose: () => void;
  onUnlock: (web: Web) => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function unlock(e: FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const web = await decryptSnapshot(
        snapshot.payload,
        password,
        snapshot.source === "file" ? MAX_ENCRYPTED_FILE_LENGTH : undefined,
      );
      setPassword("");
      onUnlock(web);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not unlock this snapshot. Check the password and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Unlock this shared web"
      subtitle="Enter the password the owner shared with you separately."
      onClose={onClose}
      footer={
        <>
          <button
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="button primary"
            type="submit"
            form="unlock-form"
            disabled={!password || busy}
          >
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Unlock size={15} />
            )}{" "}
            {busy ? "Unlocking…" : "Open shared web"}
          </button>
        </>
      }
    >
      <div className="privacy-note">
        <LockKeyhole size={21} />
        <div>
          <strong>Protected on your device</strong>
          <p>
            The password unlocks this snapshot in your browser. The owner cannot
            recover a forgotten password.
          </p>
        </div>
      </div>
      <form id="unlock-form" onSubmit={unlock}>
        <label className="field">
          Password
          <input
            autoFocus
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            aria-describedby={error ? "unlock-error" : undefined}
          />
        </label>
        {error && (
          <p id="unlock-error" role="alert" className="error-text">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
