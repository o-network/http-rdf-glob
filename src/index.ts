import { RemoteGlobOptions } from "./glob.7.1.3";
import { createRemoteGlob } from "./glob";
import { SimpleGlobOptions, createSimpleGlob } from "./simple-glob";
import { Fetcher } from "./fetcher";

export type GlobOptions = RemoteGlobOptions | SimpleGlobOptions;

export function createGlob(options: GlobOptions): Fetcher {
  if ((options as RemoteGlobOptions).glob) {
    return createRemoteGlob(options as RemoteGlobOptions);
  }
  if ((options as SimpleGlobOptions).fetch) {
    return createSimpleGlob(options as SimpleGlobOptions);
  }
  throw new Error("Can't figure out what glob you want!");
}
