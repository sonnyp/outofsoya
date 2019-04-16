import RemoteStorage, { Node } from "./RemoteStorage";
import { Observable } from "zen-observable/lib/Observable";
import { StorageArea } from "kv-storage-polyfill";

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

const storage = new StorageArea("outofsoya");

export function test(rs, path) {
  return new Observable(observer => {
    let stop = false;
    async function drain() {
      const value = await storage.get(path);

      try {
        observer.next(JSON.parse(value));
      } catch (err) {}

      for await (const x of createAsyncIterableFetch(rs, path)) {
        await storage.set(path, JSON.stringify(x));
        observer.next(x);

        if (stop) break;
      }
    }
    drain().then(x => observer.complete(x), err => observer.error(err));
    return _ => {
      stop = true;
    };
  });
}

const metaStorage = new StorageArea("outofsoya-meta");
const dataStorage = new StorageArea("outofsoya-data");

export class Resource {
  rs: RemoteStorage;
  path: string;
  version?: string;
  interval: number = 2000;
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

  async update(value: string, type: string) {
    clearTimeout(this.pollTimeout);

    const blob = new Blob([value], {
      type,
    });

    await metaStorage.set(this.path, JSON.stringify({ type }));
    await dataStorage.set(this.path, value);

    const headers = {};
    if (this.version) {
      headers["If-Match"] = this.version;
    }

    try {
      const [node, res] = await this.rs.put(this.path, blob, {
        headers,
      });

      if (res.status === 412) {
        const resolved = await this.onConflict(value, node);
        if (resolved !== undefined) {
          this.version = undefined;
          return this.update(resolved, type);
        }

        if (this.subscribed) {
          this.poll();
        }
        return;
      }

      await metaStorage.set(this.path, JSON.stringify(node));

      this.version = node.version;
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

  private async poll() {
    if (this.subscribed === false) {
      return;
    }

    try {
      const [node, res] = await this.get();

      if (res.status === 200) {
        const value = await res.text();

        // first get
        // if (!this.version) {
        await metaStorage.set(this.path, JSON.stringify(node));
        await dataStorage.set(this.path, value);
        this.version = node.version;
        console.log("hello");
        await this.onChange(value, node);
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

    try {
      const localData = await dataStorage.get(this.path);
      const localNode = JSON.parse(await metaStorage.get(this.path));
      this.version = localNode.version;
      this.onChange(localData, localNode);
    } catch (err) {
      console.error(err);
    }

    this.poll();
  }

  unsubscribe() {
    clearTimeout(this.pollTimeout);
    this.subscribed = false;
  }
}
