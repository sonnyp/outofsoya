import RemoteStorage, { Node } from "./RemoteStorage";
import storage, { StorageNode } from "./storage";

export function feedback(pattern: number | number[] = 30): boolean {
  return navigator.vibrate(pattern);
}

export function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class Resource {
  rs: RemoteStorage;
  path: string;
  interval: number = 2000;
  onChange: Function = () => {};
  onConflict: Function = () => {};
  subscribed: boolean = false;
  private pollTimeout: any;

  constructor(rs, path) {
    this.rs = rs;
    this.path = path;
  }

  private async put(
    value: string,
    type: string,
    version?: string,
  ): Promise<[Node | null, Response]> {
    const blob = new Blob([value], {
      type,
    });

    const [node, res] = await this.rs.put(this.path, blob, version);
    if (node) {
      await storage.setNode(this.path, node);
    } else {
      // FIXME conflict!
    }

    return [node, res];
  }

  public async update(value: string, type: string) {
    const { pollTimeout } = this;
    clearTimeout(pollTimeout);

    const localNode = await storage.getNode(this.path);
    await storage.set(this.path, { ...localNode, type, sync: false }, value);

    try {
      await this.put(value, type);
    } catch (err) {
      console.error(err);
    }

    if (pollTimeout) {
      this.schedulePoll();
    }
  }

  private async schedulePoll() {
    clearTimeout(this.pollTimeout);

    if (!this.subscribed) {
      return;
    }

    this.pollTimeout = setTimeout(() => {
      this.poll();
    }, this.interval);
  }

  private async hasRemoteChanges(
    [remoteNode, res]: [Node, Response],
    localNode: StorageNode,
  ) {
    const getLocalValue = () => {
      return storage.getFile(this.path);
    };

    const [resolvedNode, resolvedValue] = await this.onConflict(
      [localNode, getLocalValue],
      [remoteNode, res],
    );

    await storage.set(
      this.path,
      { ...resolvedNode, sync: false },
      resolvedValue,
    );

    await this.onChange(resolvedValue, resolvedNode);

    try {
      await this.put(resolvedValue, resolvedNode.type);
    } catch (err) {
      console.error(err);
    }
  }

  private async hasNoRemoteChanges(localNode: StorageNode) {
    const localValue = await storage.getFile(this.path);
    await this.put(localValue, localNode.type);
  }

  private async poll(localNode?: StorageNode) {
    if (this.subscribed === false) {
      return;
    }

    localNode = localNode || (await storage.getNode(this.path));

    try {
      const [remoteNode, res] = await this.rs.get(
        this.path,
        (localNode && localNode.version) || null,
      );

      if (!localNode || localNode.sync !== false) {
        if (remoteNode) {
          const remoteValue = await res.text();
          await storage.set(this.path, remoteNode, remoteValue);
          await this.onChange(remoteValue, remoteNode);
        }
      } else {
        if (remoteNode) {
          await this.hasRemoteChanges([remoteNode, res], localNode);
        } else {
          await this.hasNoRemoteChanges(localNode);
        }
      }
    } catch (err) {
      console.error(err);
    }

    this.schedulePoll();
  }

  public async subscribe() {
    this.subscribed = true;

    const [localNode, localFile] = await storage.get(this.path);

    if (localNode && localFile) {
      this.onChange(localFile, localNode);
    }

    this.poll(localNode);
  }

  public unsubscribe() {
    clearTimeout(this.pollTimeout);
    this.subscribed = false;
  }
}

export async function forget() {
  await storage.clear();
  localStorage.clear();
  window.location.reload(true);
}
