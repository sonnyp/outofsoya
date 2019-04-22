import { StorageArea } from "kv-storage-polyfill";
import { Node } from "./RemoteStorage";

const nodes = new StorageArea("nodes");
const files = new StorageArea("files");

// FIXME use indexdb transactions

export interface StorageNode extends Node {
  sync?: boolean;
}

export default {
  async getNode(path: string): Promise<StorageNode | undefined> {
    const node = await nodes.get(path);
    if (!node) {
      return undefined;
    }
    return JSON.parse(node);
  },

  async setNode(path: string, node: StorageNode): Promise<void> {
    return nodes.set(path, JSON.stringify(node));
  },

  async getFile(path: string): Promise<any | undefined> {
    return files.get(path);
  },

  async setFile(path: string, file: any): Promise<void> {
    return files.set(path, file);
  },

  async set(path: string, node: StorageNode, file: any): Promise<void> {
    await Promise.all([this.setNode(path, node), this.setFile(path, file)]);
  },

  async get(path: string): Promise<[StorageNode | undefined, any | undefined]> {
    const node = await this.getNode(path);
    const file = await this.getFile(path);

    return [node, file];
  },

  async clear(): Promise<void> {
    await nodes.clear();
    await files.clear();
    // await Promise.all([nodes.clear(), files.clear()]);
  },
};
