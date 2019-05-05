import { Request, Response } from "@opennetwork/http-representation";
import { getType, notAccepted } from "./combine";
import { Fetcher } from "./fetcher";
import { readdir } from "./readdir";
import { combineForResponse } from "./combine";

export type SimpleGlobOptions = {
  fetch: Fetcher
};

export async function simpleGlob(request: Request, options: SimpleGlobOptions): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.endsWith("*")) {
    return undefined;
  }
  const possibleRDFType = getType(request);
  if (!possibleRDFType) {
    return notAccepted();
  }
  const directory = url.pathname.substr(0, url.pathname.lastIndexOf("/") + 1);
  const allEntries = await readdir(request, directory, options.fetch);
  const base = url.pathname.substr(0, directory.length).replace(/\*$/, "").toLowerCase();
  const matchedEntries = base ? (
    allEntries
      .filter(entry => entry.toLowerCase().startsWith(base))
  ) : allEntries; // If no base, then we must be just asking for "*", aka, everything, so bypass the filter
  return combineForResponse(request, matchedEntries, options.fetch);
}

export function createSimpleGlob(options: SimpleGlobOptions): Fetcher {
  return (request: Request) => simpleGlob(request, options);
}
