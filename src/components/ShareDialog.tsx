import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileJson,
  Globe2,
  Link2,
  LockKeyhole,
  Share2,
  ShieldCheck,
} from "lucide-react";
import type { ShareOptions, Web } from "../types";
import {
  downloadFile,
  encodeShare,
  exportJSON,
  sanitizeSnapshot,
  MAX_SHARE_LENGTH,
} from "../lib/importExport";
import {
  encryptSnapshot,
  MAX_ENCRYPTED_SHARE_LENGTH,
  MAX_ENCRYPTED_FILE_LENGTH,
} from "../lib/shareEncryption";
import { Modal } from "./Modal";
import "./settings.css";
interface Props {
  web: Web;
  onClose: () => void;
}
const DEFAULT_PRIVACY: ShareOptions = {
  notes: false,
  photos: false,
  custom: false,
  birthdays: false,
  comments: false,
};
export function ShareDialog({ web, onClose }: Props) {
  const [options, setOptions] = useState<ShareOptions>(DEFAULT_PRIVACY);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [protect, setProtect] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [encryptedPayload, setEncryptedPayload] = useState("");
  const [encrypting, setEncrypting] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);
  // Every snapshot and password change invalidates an older prepared link, even
  // if a previous encryption job has not completed yet.
  useEffect(() => {
    generation.current += 1;
    setEncryptedPayload("");
    setCopied(false);
    setNotice("");
  }, [web, options, protect, password, confirmation]);
  const snapshot = useMemo(
    () => sanitizeSnapshot(web, options),
    [web, options],
  );
  const json = useMemo(() => exportJSON(snapshot), [snapshot]);
  const payload = useMemo(
    () => (protect ? "" : encodeShare(web, options)),
    [web, options, protect],
  );
  const currentPayload = protect ? encryptedPayload : payload;
  const url = currentPayload
    ? `${location.origin}${location.pathname}#${protect ? "locked" : "share"}=${currentPayload}`
    : "";
  const tooLarge =
    currentPayload.length >
    (protect ? MAX_ENCRYPTED_SHARE_LENGTH : MAX_SHARE_LENGTH);
  const passwordReady = password.length >= 8 && password === confirmation;
  async function prepareProtectedLink() {
    if (!passwordReady || encrypting) return;
    const currentGeneration = ++generation.current;
    setNotice("");
    setEncrypting(true);
    setEncryptedPayload("");
    try {
      const result = await encryptSnapshot(web, options, password);
      if (generation.current !== currentGeneration) return;
      const envelopeLength =
        result.length +
        JSON.stringify({ version: 1, kind: "friendweb-encrypted", payload: "" })
          .length;
      if (envelopeLength > MAX_ENCRYPTED_FILE_LENGTH) {
        setNotice(
          "This snapshot is too large even for an encrypted file. Exclude photos or other details and try again.",
        );
        return;
      }
      setEncryptedPayload(result);
      setNotice(
        result.length > MAX_ENCRYPTED_SHARE_LENGTH
          ? "This snapshot is too large for a link. Download the encrypted file and send its password separately."
          : "Protected link ready. Send the password separately.",
      );
    } catch (error) {
      if (generation.current !== currentGeneration) return;
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to encrypt this snapshot in your browser.",
      );
    } finally {
      if (mounted.current) setEncrypting(false);
    }
  }
  const fileName = `${
    web.name
      .replace(/[^\p{L}\p{N} -]/gu, "")
      .trim()
      .replace(/\s+/g, "-") || "friendweb"
  }-${protect ? "encrypted" : "snapshot"}.json`;
  const sharedJson = protect
    ? JSON.stringify({
        version: 1,
        kind: "friendweb-encrypted",
        payload: encryptedPayload,
      })
    : json;
  const included = Object.values(options).filter(Boolean).length;
  async function copyLink() {
    setNotice("");
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setNotice(
        "Your browser could not copy automatically. Select the link below and copy it.",
      );
    }
  }
  async function nativeShare() {
    if (!navigator.share) return;
    setBusy(true);
    setNotice("");
    try {
      if (url && !tooLarge)
        await navigator.share({
          title: `${web.name} · FriendWeb`,
          text: protect
            ? "Explore this password-protected read-only web. Ask me separately for the password."
            : "Explore this read-only relationship web. This snapshot does not live-sync.",
          url,
        });
      else if (!protect || encryptedPayload) {
        const file = new File([sharedJson], fileName, {
          type: "application/json",
        });
        if (navigator.canShare?.({ files: [file] }))
          await navigator.share({
            files: [file],
            title: `${web.name} · FriendWeb`,
          });
        else {
          downloadFile(fileName, sharedJson, "application/json");
          setNotice(
            "Snapshot downloaded. Attach the JSON file in your preferred sharing app.",
          );
        }
      } else {
        setNotice("Generate the encrypted snapshot first.");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setNotice(
          "Sharing is unavailable here. You can copy the link or download the snapshot instead.",
        );
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (protect && !encryptedPayload) return;
    downloadFile(fileName, sharedJson, "application/json");
    setNotice(
      protect
        ? "Encrypted snapshot downloaded. Send the password separately. Recipients can import the file into FriendWeb."
        : "Portable snapshot downloaded. Recipients can import it into FriendWeb.",
    );
  }
  const rows: {
    key: keyof ShareOptions;
    title: string;
    description: string;
  }[] = [
    {
      key: "notes",
      title: "Private notes & descriptions",
      description: "Include person notes and personal descriptions.",
    },
    {
      key: "photos",
      title: "Profile photos",
      description: "Include locally uploaded images.",
    },
    {
      key: "custom",
      title: "Personal attributes & custom fields",
      description:
        "Include gender, pronouns, custom fields, metadata, and custom dates.",
    },
    {
      key: "birthdays",
      title: "Birthdays & ages",
      description: "Include birthdays and manually entered ages.",
    },
    {
      key: "comments",
      title: "Relationship comments",
      description: "Include notes attached to connections.",
    },
  ];
  return (
    <Modal
      title="Share your web"
      subtitle="A little window into your world."
      onClose={onClose}
      className="share-modal"
      footer={
        <>
          <span className="share-footer-note">
            <ShieldCheck size={14} /> Made here. Shared by you.
          </span>
          <button className="button secondary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="share-preview">
        <div className="share-preview-orbit">
          <i />
          <i />
          <i />
          <i />
          <Globe2 size={26} />
        </div>
        <div>
          <span className="settings-eyebrow">READ-ONLY SNAPSHOT</span>
          <h3>{web.name}</h3>
          <p>
            {Object.keys(snapshot.people).length} people <span>·</span>{" "}
            {Object.keys(snapshot.links).length} connections
          </p>
        </div>
        <LockKeyhole size={18} />
      </div>
      <div className="share-description">
        <p>
          Share an interactive 3D copy. Anyone who can open the snapshot can
          view the included data and save their own copy.
        </p>
        <p>
          Snapshots do not live-sync. The recipient sees this version until you
          share a new one.
        </p>
      </div>
      <section className="share-privacy">
        <div className="share-section-title">
          <h3>Choose what travels with it</h3>
          <span>
            {included === 0
              ? "Private details excluded"
              : `${included} optional ${included === 1 ? "detail" : "details"} included`}
          </span>
        </div>
        <p>
          Names, nicknames, visible connections, relationship dates, tags,
          groups, colors, and positions are included. Hidden people and
          connections stay private. Optional details are off by default.
        </p>
        {rows.map((row) => (
          <label className="share-checkbox-row" key={row.key}>
            <span>
              <strong>{row.title}</strong>
              <small>{row.description}</small>
            </span>
            <input
              type="checkbox"
              className="settings-switch"
              role="switch"
              checked={options[row.key]}
              onChange={(e) => {
                setOptions({ ...options, [row.key]: e.target.checked });
                setCopied(false);
                setNotice("");
              }}
            />
          </label>
        ))}
      </section>
      <div className={`share-privacy-status ${included ? "with-details" : ""}`}>
        <ShieldCheck size={17} />
        <p>
          {included
            ? "Review the included details before sharing. Anyone who receives the snapshot can keep or forward them."
            : "Your private details stay on this device. Only the visible graph and its public-facing labels are included."}
        </p>
      </div>
      <section className="share-password-section">
        <label className="share-checkbox-row">
          <span>
            <strong>Protect this link with a password</strong>
            <small>Encrypt the snapshot on this device before sharing.</small>
          </span>
          <input
            type="checkbox"
            className="settings-switch"
            role="switch"
            checked={protect}
            onChange={(e) => {
              setProtect(e.target.checked);
              if (!e.target.checked) {
                setPassword("");
                setConfirmation("");
              }
              setNotice("");
            }}
          />
        </label>
        {protect && (
          <div className="share-password-fields">
            <label className="field">
              Password
              <input
                type="password"
                autoComplete="new-password"
                aria-label="Share password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                maxLength={1024}
              />
            </label>
            <label className="field">
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                aria-label="Confirm share password"
                maxLength={1024}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            {confirmation && password !== confirmation && (
              <p className="error-text" role="status">
                Passwords do not match.
              </p>
            )}
            <p>
              Use a long, unique password and send it separately from the link
              or file. Anyone with both can open and copy the snapshot; it
              cannot be revoked after sharing.
            </p>
            <button
              className="button secondary full-width"
              disabled={!passwordReady || encrypting}
              onClick={prepareProtectedLink}
            >
              <LockKeyhole size={15} />
              {encrypting
                ? "Encrypting snapshot…"
                : encryptedPayload
                  ? "Generate a new protected link"
                  : "Generate protected link"}
            </button>
          </div>
        )}
      </section>
      <div className="share-actions">
        {protect && !url ? (
          <p className="share-size">
            Generate a protected link after choosing your password.
          </p>
        ) : !tooLarge ? (
          <>
            <label className="share-link-field">
              <Link2 size={17} />
              <input
                aria-label="Read-only snapshot link"
                value={url}
                readOnly
                onFocus={(e) => e.target.select()}
              />
              <button
                className="icon-button"
                title="Copy snapshot link"
                aria-label="Copy snapshot link"
                onClick={copyLink}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </label>
            <button className="button primary share-primary" onClick={copyLink}>
              {copied ? <Check size={17} /> : <Link2 size={17} />}{" "}
              {copied ? "Link copied" : "Copy read-only link"}
            </button>
            <span className="share-size">
              {protect
                ? "The encrypted graph is stored in the link. The password is not included."
                : "The graph is stored in the link fragment. No upload or account."}
            </span>
          </>
        ) : (
          <div className="share-too-large">
            <FileJson size={23} />
            <div>
              <strong>This web is best shared as a file.</strong>
              <p>
                The link would be {(url.length / 1000).toFixed(1)}k characters.
                {protect
                  ? " Download the encrypted snapshot and send the password separately."
                  : " Download a portable JSON snapshot to keep sharing reliable."}
              </p>
            </div>
          </div>
        )}
        <div className="share-secondary-actions">
          <button
            className={`button ${tooLarge ? "primary" : "secondary"}`}
            onClick={download}
            disabled={protect && !encryptedPayload}
          >
            <Download size={16} />{" "}
            {protect ? "Download encrypted snapshot" : "Download snapshot"}{" "}
            <span className="share-file-size">
              {new Blob([sharedJson]).size < 1024
                ? "1"
                : Math.ceil(new Blob([sharedJson]).size / 1024)}{" "}
              KB
            </span>
          </button>
          {typeof navigator.share === "function" && (
            <button
              className="button secondary"
              disabled={busy || (protect && !encryptedPayload)}
              onClick={nativeShare}
            >
              <Share2 size={16} />
              {busy ? "Opening…" : "Share…"}
            </button>
          )}
        </div>
        {notice && (
          <p className="share-notice" role="status">
            {notice}
          </p>
        )}
      </div>
    </Modal>
  );
}
export default ShareDialog;
