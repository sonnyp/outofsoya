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

export class Resource {
  rs: RemoteStorage;
  path: string;
  version?: string;
  interval: number = 5000;
  onChange: Function = () => {};
  onConflict: Function = () => {};
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

    const [node, res] = await this.rs.put(this.path, blob, {
      headers: {
        "If-Match": this.version,
      },
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

    this.version = node.version;

    await storage.set(this.path, `[${value},${JSON.stringify(node)}]`);

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
        await storage.set(this.path, `[${value},${JSON.stringify(node)}]`);
        this.version = node.version;
        await this.onChange(value, node);
      }
    } catch (err) {
      console.error(err);
    }

    this.schedulePoll();
  }

  subscribe() {
    this.subscribed = true;

    storage.get(this.path).then(v => {
      try {
        const [value, node] = JSON.parse(v);
        this.version = node.version;
        this.onChange(JSON.stringify(value), node);
      } catch (err) {}

      this.poll();
    });
  }

  unsubscribe() {
    clearTimeout(this.pollTimeout);
    this.subscribed = false;
  }
}
