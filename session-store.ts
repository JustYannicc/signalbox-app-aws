/** Session keys stay in the host-encrypted account reference, outside app SQL. */
import { Schema } from "effect";
import type { Sql, SqlReader } from "apps/contracts";

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
const bytes = (text: string) =>
  Uint8Array.from(text.match(/../gu) ?? [], (byte) => Number.parseInt(byte, 16));
const Reference = /^sso:([0-9a-f-]{36}):([0-9a-f]{64})$/u;
const Stored = Schema.Struct({
  ciphertext: Schema.String,
  revision: Schema.Number,
  lease: Schema.NullOr(Schema.String),
  lease_until: Schema.Number,
});
export type PrivateTable = "identity_sessions" | "identity_attempts";
export const newReference = () =>
  `sso:${crypto.randomUUID()}:${hex(crypto.getRandomValues(new Uint8Array(32)))}`;
const parts = (reference: string) => {
  const match = Reference.exec(reference);
  if (!match?.[1] || !match[2])
    throw new Error(
      "The saved AWS connection reference is invalid. Re-sign in without deleting the account.",
    );
  return { id: match[1], key: bytes(match[2]) };
};
const cipherKey = (key: Uint8Array<ArrayBuffer>) =>
  crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt", "decrypt"]);
const seal = async (owner: string, reference: string, value: unknown) => {
  const { id, key } = parts(reference),
    nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: new TextEncoder().encode(`${owner}:${id}`) },
    await cipherKey(key),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return `${hex(nonce)}:${hex(new Uint8Array(ciphertext))}`;
};
export const readPrivate = async <A>(
  sql: SqlReader,
  table: PrivateTable,
  owner: string,
  reference: string,
  schema: Schema.Decoder<A>,
) => {
  const { id, key } = parts(reference);
  const row = sql
    .exec(
      `SELECT ciphertext, revision, lease, lease_until FROM ${table} WHERE id = ? AND owner = ?`,
      id,
      owner,
    )
    .toArray()[0];
  if (!row) return undefined;
  const stored = Schema.decodeUnknownSync(Stored)(row),
    [nonce, ciphertext] = stored.ciphertext.split(":");
  if (!nonce || !ciphertext)
    throw new Error(
      "The saved AWS session could not be read. Re-sign in without deleting the account.",
    );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: bytes(nonce),
      additionalData: new TextEncoder().encode(`${owner}:${id}`),
    },
    await cipherKey(key),
    bytes(ciphertext),
  );
  const value = Schema.decodeUnknownSync(Schema.fromJsonString(schema))(
    new TextDecoder().decode(plaintext),
  );
  return {
    value,
    revision: stored.revision,
    busy: stored.lease !== null && stored.lease_until > Date.now(),
  };
};
/** Replace only the revision the caller actually read; never overwrite another refresh or sign-in. */
export const writePrivate = async (
  sql: Sql,
  table: PrivateTable,
  owner: string,
  reference: string,
  value: unknown,
  revision?: number,
) => {
  const { id } = parts(reference),
    ciphertext = await seal(owner, reference, value);
  if (revision === undefined) {
    sql.exec(`INSERT INTO ${table} (id,owner,ciphertext) VALUES (?,?,?)`, id, owner, ciphertext);
    return;
  }
  const saved = sql.exec(
    `UPDATE ${table} SET ciphertext = ?, revision = revision + 1, lease = NULL, lease_until = 0 WHERE id = ? AND owner = ? AND revision = ?`,
    ciphertext,
    id,
    owner,
    revision,
  );
  if (saved.rowsWritten !== 1)
    throw new Error("AWS sign-in changed while this request was running. Retry the request.");
};
export const removePrivate = (sql: Sql, table: PrivateTable, owner: string, reference: string) => {
  sql.exec(`DELETE FROM ${table} WHERE id = ? AND owner = ?`, parts(reference).id, owner);
};
/** A refresh claim ends before the host's invocation deadline; no SQL transaction spans HTTP. */
export const claimPrivate = (
  sql: Sql,
  table: PrivateTable,
  owner: string,
  reference: string,
  revision: number,
) => {
  const lease = crypto.randomUUID(),
    now = Date.now();
  const claimed = sql.exec(
    `UPDATE ${table} SET lease = ?, lease_until = ? WHERE id = ? AND owner = ? AND revision = ? AND (lease IS NULL OR lease_until < ?)`,
    lease,
    now + 15_000,
    parts(reference).id,
    owner,
    revision,
    now,
  );
  if (claimed.rowsWritten !== 1)
    throw new Error("AWS session refresh is already running. Retry the request shortly.");
  return () => {
    sql.exec(
      `UPDATE ${table} SET lease = NULL, lease_until = 0 WHERE id = ? AND owner = ? AND lease = ?`,
      parts(reference).id,
      owner,
      lease,
    );
  };
};
