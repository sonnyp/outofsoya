import { Observable } from "zen-observable/lib/Observable";

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
