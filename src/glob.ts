import { createRemoteGlob713, RemoteGlobOptions } from "./glob.7.1.3";
import { Fetcher } from "./fetcher";

export function createRemoteGlob(options: RemoteGlobOptions): Fetcher {
  if (options.glob.prototype._readdirEntries && options.glob.prototype._readdirError) {
    return createRemoteGlob713(options.glob, options);
  }
  throw new Error("Expected glob module matching version 7.1.3");
}
