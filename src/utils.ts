import RemoteStorage, { Node } from "./RemoteStorage";
import { Observable } from "zen-observable/lib/Observable";
import storage from "./storage";

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

    await storage.set(this.path, { type }, value);

    try {
      await this.put(value, type);
    } catch (err) {
      console.error(err);
    }

    if (this.subscribed) {
      this.schedulePoll();
    }
  }

  private async hasLocalChanges(localNode: Node) {
    const localValue = await storage.getFile(this.path);

    // todo version
    const [node, res] = await this.put(localValue, localNode.type);

    if (!node) {
      console.log("oops!!");
    }

    // await this._onConflict();
  }

  private async schedulePoll() {
    clearTimeout(this.pollTimeout);

    this.pollTimeout = setTimeout(() => {
      this.poll();
    }, this.interval);
  }

  private async hasRemoteChanges(
    [remoteNode, res]: [Node, Response],
    localNode: Node,
  ) {
    // Local file is unchanged
    // if (localNode.version) {
    const value = await res.text();
    await storage.set(this.path, remoteNode, value);
    await this.onChange(value, remoteNode);
    //   return;
    // }

    // const [newNode, newValue] = await this.onRemoteChanges(
    //   [remoteNode, res],
    //   localNode,
    // );

    // await storage.set(this.path, newNode, newValue);
    // await this.onChange(newValue, newNode);
    // await this.put(newValue, newNode.type);

    // console.log("remote changes");
    // console.log("remote", remoteNode);
    // console.log("local", localNode);

    //     const resolved = await this.onConflict2([{ type }, value], async () => {
    //   const [node, res] = await this.rs.get(this.path);
    //   return [node, res];
    // });

    // // FIXME no need to wait for onchange to trigger update
    // await this.onChange(resolved, { type: node.type });

    // await storage.setNode(this.path, node);

    // return [node, res];

    // const value = await res.text();
    // await storage.set(this.path, remoteNode, value);
    // await this.onChange(value, remoteNode);
  }

  private async hasNoLocalChanges(localNode?: Node) {
    const [remoteNode, res] = await this.rs.get(
      this.path,
      (localNode && localNode.version) || null,
    );

    // File was not modified
    if (!remoteNode) {
      return;
    }

    // There is no local file
    if (!localNode) {
      const value = await res.text();
      await storage.set(this.path, remoteNode, value);
      await this.onChange(value, remoteNode);
      return;
    }

    return this.hasRemoteChanges([remoteNode, res], localNode);
  }

  // private async _onConflict() {
  //   const resolved = await this.onConflict2([{ type }, value], async () => {
  //     const [node, res] = await this.rs.get(this.path);
  //     return [node, res];
  //   });

  //   // equivalent to this.update without scheduler
  //   await storage.set(this.path, { type }, resolved);
  //   await this.put(resolved, type);

  //   // FIXME no need to wait for onchange to trigger update
  //   await this.onChange(resolved, { type: node.type });

  //   await storage.setNode(this.path, node);

  //   return [node, res];
  // }

  private async poll(node?: Node) {
    if (this.subscribed === false) {
      return;
    }

    node = node || (await storage.getNode(this.path));

    try {
      // first or subsequent sync ←
      if (!node || node.version) {
        await this.hasNoLocalChanges(node);
        // sync →
      } else {
        await this.hasLocalChanges(node);
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
