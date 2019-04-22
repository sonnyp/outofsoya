import RemoteStorage, { Node } from "./RemoteStorage";
import { Observable } from "zen-observable/lib/Observable";
import storage, { StorageNode } from "./storage";
import { timingSafeEqual } from "crypto";

function toObservable(asyncIterable: AsyncIterable<any>): Observable {
  return new Observable(observer => {
    let stop = false;
    async function drain() {
      for await (const x of asyncIterable) {
        if (stop) break;
        observer.next(x);
      }
    }
    drain().then(x => observer.complete(x), err => observer.error(err));
    return _ => {
      stop = true;
    };
  });
}

export function vibrate(pattern: number | number[] = 30): boolean {
  return navigator.vibrate(pattern);
}

export function sound(path: string): Promise<void> {
  const audio = new Audio(path);
  return audio.play();
}

export function feedback(path: string = "/assets/button.wav"): void {
  vibrate();
  sound(path);
}

export function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function* createAsyncIterableFetch(
  rs: RemoteStorage,
  path: string,
  interval: number = 2000,
  version?: string,
): AsyncIterable<[any, Node]> {
  let v = version;

  const [node, res] = await rs.get(path, version);

  if (res.status === 200) {
    v = node.version;
    yield [await res.json(), node];
  }

  await delay(interval);

  yield* createAsyncIterableFetch(rs, path, interval, v);
}

export function observe(rs: RemoteStorage, path: string): Observable {
  return toObservable(createAsyncIterableFetch(rs, path));
}

// export function test(rs, path) {
//   return new Observable(observer => {
//     let stop = false;
//     async function drain() {
//       const value = await storage.get(path);

//       try {
//         observer.next(JSON.parse(value));
//       } catch (err) {}

//       for await (const x of createAsyncIterableFetch(rs, path)) {
//         await storage.set(path, JSON.stringify(x));
//         observer.next(x);

//         if (stop) break;
//       }
//     }
//     drain().then(x => observer.complete(x), err => observer.error(err));
//     return _ => {
//       stop = true;
//     };
//   });
// }

export class Resource {
  rs: RemoteStorage;
  path: string;
  interval: number = 2000;
  onChange: Function = () => {};
  onConflict: Function = () => {};
  onConflict2: Function = () => {};
  onRemoteChanges: Function = () => {};
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
    clearTimeout(this.pollTimeout);

    const localNode = await storage.getNode(this.path);
    await storage.set(this.path, { ...localNode, type, sync: false }, value);

    try {
      await this.put(value, type);
    } catch (err) {
      console.error(err);
    }

    if (this.subscribed) {
      this.schedulePoll();
    }
  }

  private async schedulePoll() {
    clearTimeout(this.pollTimeout);

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
          const value = await res.text();
          await storage.set(this.path, remoteNode, value);
          await this.onChange(value, remoteNode);
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
