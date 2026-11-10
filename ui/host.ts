/** Non-secret page context the host injects. Neither value grants any authority. */
import { array, object, record, string } from "apps";

const Context = object({ accounts: record(array(string())).optional() });

/**
 * The saved AWS connection IDs this page runs with, or undefined when the host context can't be
 * read. Legacy OAuth IDs may be among them; their inventory read fails and the page says so.
 */
export const savedConnections = (): readonly string[] | undefined => {
  const text = document.getElementById("executor-context")?.textContent;
  if (text === undefined || text === null || text === "") return undefined;
  try {
    return [...new Set(Context.parse(JSON.parse(text)).accounts?.identityCenter ?? [])];
  } catch {
    return undefined;
  }
};

/** The host's native Accounts page, which owns sign-in, re-sign-in, renaming and disconnecting. */
export const accountsUrl = (): string | undefined => {
  const content = document
    .querySelector('meta[name="executor-accounts-url"]')
    ?.getAttribute("content");
  if (content === undefined || content === null || content === "") return undefined;
  try {
    const url = new URL(content);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
};
