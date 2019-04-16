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

export function sound(): Promise<void> {
  const audio = new Audio("/assets/button.wav");
  return audio.play();
}

export function feedback(): void {
  vibrate();
  sound();
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

  const [node, res] = await rs.get(path, {
    cache: "no-store",
    headers: {
      "If-None-Match": v,
    },
  });

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
  version?: string;
  interval: number = 2000;
  outOfSync: boolean = false;
  onChange: Function = () => {};
  onConflict: Function = () => {};
  onConflict2: Function = () => {};
  subscribed: boolean = false;
  private pollTimeout: any;

  constructor(rs, path) {
    this.rs = rs;
    this.path = path;
  }

  async get(): Promise<[Node, Response]> {
    const headers = {};
    if (this.version) {
      headers["If-None-Match"] = this.version;
    }

    const [node, res] = await this.rs.get(this.path, {
      cache: "no-store",
      headers,
    });
    return [node, res];
  }

  async put(value: string, type: string): Promise<[Node, Response]> {
    const headers = {};
    if (this.version) {
      headers["If-Match"] = this.version;
    }

    let node;
    let res;

    const blob = new Blob([value], {
      type,
    });

    try {
      [node, res] = await this.rs.put(this.path, blob, {
        headers,
      });
    } catch (err) {
      this.outOfSync = true;
      if (this.subscribed) {
        this.schedulePoll();
      }
      return;
    }

    if (res.status === 200 || res.status === 201) {
      this.version = node.version;
      await storage.setNode(this.path, node);
    } else if (res.status === 412) {
      const resolved = await this.onConflict2([{ type }, value], async () => {
        this.version = undefined;
        const [node, res] = await this.get();
        this.version = node.version;
        return [node, res];
      });

      await this.update(resolved, node.type);

      this.outOfSync = false;

      // FIXME no need to wait for onchange to trigger update
      await this.onChange(resolved, { type: node.type });

      return;
    }

    return [node, res];
  }

  async update(value: string, type: string) {
    clearTimeout(this.pollTimeout);

    await storage.set(this.path, { type }, value);

    await this.put(value, type);

    // try {
    //   const [node, res] = await this.rs.put(this.path, blob, {
    //     headers,
    //   });

    //   if (res.status === 412) {
    //     const resolved = await this.onConflict(value, node);
    //     if (resolved !== undefined) {
    //       this.version = undefined;
    //       return this.update(resolved, type);
    //     }

    //     if (this.subscribed) {
    //       this.poll();
    //     }
    //     return;
    //   }

    //   await metaStorage.set(this.path, JSON.stringify(node));

    //   this.version = node.version;
    // } catch (err) {
    //   console.error(err);
    // }

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

  private async poll() {
    if (this.subscribed === false) {
      return;
    }

    if (this.outOfSync) {
      const [localNode, localValue] = await storage.get(this.path);

      let node;
      let res;
      try {
        [node, res] = await this.put(localValue, localNode.type);
      } catch (err) {
        if (this.subscribed) {
          this.schedulePoll();
        }
        return;
      }
      if (res.status === 200 || res.status === 201) {
        this.outOfSync = false;
      }

      console.log("foo");
      if (this.subscribed) {
        console.log("bar");
        this.schedulePoll();
      }
      return;
    }

    try {
      const [node, res] = await this.get();

      if (res.status === 200) {
        // first get
        if (!this.version) {
          const value = await res.text();
          await storage.set(this.path, node, value);
          this.version = node.version;
          await this.onChange(value, node);
        } else {
          const localNode = await storage.getNode(this.path);
          // no conflict
          if (!localNode || localNode.version) {
            const value = await res.text();

            await storage.set(this.path, node, value);

            this.version = node.version;
            await this.onChange(value, node);
            // conflict
          } else {
            const resolved = await this.onConflict(
              [
                localNode,
                () => {
                  return storage.getFile(this.path);
                },
              ],
              [node, res],
            );

            this.version = node.version;
            await this.update(resolved, node.type);

            // FIXME no need to wait for onchange to trigger update
            await this.onChange(resolved, { type: node.type });

            return;
            // console.log(resolved);
            // if (resolved !== undefined) {
            //   this.version = node.version;
            //   return this.update(resolved, node.type);
            // }
          }
        }
        // } else {
        //   const localNode = JSON.parse(await metaStorage.get(this.path));
        //   const localValue = await dataStorage.get(this.path);
        //   if (!localNode || !localValue) return;

        //   const local = [localValue, localNode];
        //   const remote = [value, node];

        //   const resolved = await this.onConflict2(local, remote);
        //   if (resolved !== undefined) {
        //     this.version = node.version;
        //     return this.update(resolved, node.type);
        //   }

        //   // if (this.subscribed) {
        //   //   this.poll();
        //   // }
        //   // return;
        // }
      }
    } catch (err) {
      console.error(err);
    }

    this.schedulePoll();
  }

  async subscribe() {
    this.subscribed = true;

    const [localNode, localFile] = await storage.get(this.path);

    if (localNode && localFile) {
      this.version = localNode.version;
      this.onChange(localFile, localNode);
    }

    this.poll();
  }

  unsubscribe() {
    clearTimeout(this.pollTimeout);
    this.subscribed = false;
  }
}

export async function forget() {
  await storage.clear();
  localStorage.clear();
  window.location.reload();
}
