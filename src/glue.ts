import { lookup } from "./WebFinger";
import RemoteStorage, {
  getRemoteStorageRecord,
  buildAuthURL,
} from "./RemoteStorage";

export async function connect(resource: string, scope: string): Promise<void> {
  const webfinger = await lookup(resource);
  const record = getRemoteStorageRecord(webfinger);
  const url = buildAuthURL(record, { scope, clientId: "outofsoya" });
  window.location.href = url.toString();
}

export async function connected(
  resource,
  token: string,
): Promise<RemoteStorage> {
  const webfinger = await lookup(resource);
  const record = getRemoteStorageRecord(webfinger);
  const rs = new RemoteStorage(record.href, token);

  return rs;
}

export async function main(
  resource: string,
  scope: string,
): Promise<RemoteStorage | void> {
  const url = new URL(window.location.href);
  // Use url searchParams to parse hash
  url.search = url.hash.substr(1);
  const token = url.searchParams.get("access_token");
  const error = url.searchParams.get("error");

  if (error) {
    // Remove hash from current url
    history.replaceState({}, "", url.pathname);
    throw new Error(error);
  }

  if (token) {
    localStorage.setItem("token", token);
    // Remove hash from current url
    history.replaceState({}, "", url.pathname);
    return connected(resource, token);
  } else {
    const token = localStorage.getItem("token");
    if (token) {
      return connected(resource, token);
    } else {
      return connect(
        resource,
        scope,
      );
    }
  }
}
