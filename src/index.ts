import { Request, Response } from "@opennetwork/http-representation";
import { Glob, IOptions } from "glob";
import inflight from "inflight";
import li from "li";
import { graph, parse, Namespace, serialize } from "rdflib";
import { RDF_MIME_TYPES } from "./mime-types";
import { preferredMediaTypes } from "./media-type";

const ldp = Namespace("http://www.w3.org/ns/ldp#");

interface Glob713Like {
  symlinks: { [key: string]: boolean };
  cache: { [key: string]: string | string[] };
  follow: boolean;
  _readdirError: (abs: string, err: Error, cb: Function) => void;
  _readdirEntries: (abs: string, entries: string[], cb: Function) => void;
}

export type GlobLike = typeof Glob & {
  prototype: Glob713Like
};

export type RemoteGlobOptions = {
  glob: GlobLike;
  hasMagic: (value: string, options?: IOptions) => boolean;
  fetch: (request: Request) => Promise<Response>;
};

type LStatLike = { isSymbolicLink: () => boolean, isDirectory: () => boolean };
type ErrorWithCode = Error & { code?: string } | { code: string };

function ownProp(obj: any, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, field);
}

export function createRemoteGlob713(glob: typeof Glob, { fetch, hasMagic }: RemoteGlobOptions): (request: Request) => Promise<Response> {

  const options: IOptions = {
    noext: true,
    nobrace: true,
    nodir: true
  };

  class RemoteGlob713 extends glob {

    private readonly request: Request;

    constructor(request: Request, cb: (error: Error, results?: string[]) => void) {
      super(new URL(request.url).pathname, options, cb);
      this.request = request;
    }

    private async readdirRemote(abs: string): Promise<string[]> {
      const url = new URL(abs, new URL(this.request.url).origin).toString(),
        contentType = "application/ld+json";

      const response = await fetch(
        new Request(
          url,
          {
            method: "GET",
            headers: {
              Accept: contentType
            }
          }
        )
      );

      // Something wrong with our end, either 404, 403, or something else, but not found either way
      if (response.status.toString().startsWith("4")) {
        return [];
      }

      if (!response.ok) {
        throw new Error(`Unable to read directory ${abs}`);
      }

      const body = await response.text();

      const resourceGraph = graph();

      await new Promise(
        (resolve, reject) => parse(
          body,
          resourceGraph,
          url,
          contentType,
          (error) => error ? reject(error) : resolve()
        )
      );

      const dir = resourceGraph.sym(url);

      return resourceGraph.match(dir, ldp("contains"), undefined, undefined)
        .map((value): string => value.object.value);
    }

    private async lstatRemote(abs: string): Promise<{ error?: ErrorWithCode, stat?: LStatLike }> {
      const response = await fetch(
        new Request(
          abs,
          {
            method: "HEAD",
            headers: {
              Accept: "application/ld+json"
            }
          }
        )
      );

      // Something wrong with our end, either 404, 403, or something else, but not found either way
      if (response.status.toString().startsWith("4")) {
        return { error: { code: "ENOENT" } };
      }

      // It is a directory if BasicContainer is found as a link
      const isDirectory = (() => {
        if (!response.headers.has("Link")) {
          return false;
        }
        return response.headers
          .get("Link")
          .split(/\s*,\s*/)
          .map(link => li.parse(link))
          .some(parsed => parsed["type"] && parsed["type"] === "http://www.w3.org/ns/ldp#BasicContainer");
      })();

      return {
        stat: {
          isSymbolicLink: () => false,
          isDirectory: () => isDirectory
        }
      };
    }

    _readdirInGlobStar(abs: string, cb: Function): void {
      if (this.aborted) {
        return;
      }
      const glob713Like = ((this as any) as Glob713Like);
      if (glob713Like.follow) {
        this._readdir(abs, false, cb);
        return;
      }

      if (!this.request) {
        setImmediate(() => {
          if (!this.request) {
            return cb(new Error("Request is required"));
          }
          return this._readdirInGlobStar(abs, cb);
        });
        return;
      }

      const lstatcb_ = (er: ErrorWithCode, lstat?: LStatLike) => {
        if (er && er.code === "ENOENT") {
          return cb();
        }
        if (er) {
          // Something else?
          return cb(er);
        }
        const isSym = lstat && lstat.isSymbolicLink();
        glob713Like.symlinks[abs] = isSym;
        // If it's not a symlink or a dir, then it's definitely a regular file.
        // don't bother doing a readdir in that case.
        if (!isSym && lstat && !lstat.isDirectory()) {
          glob713Like.cache[abs] = "FILE";
          cb();
        } else {
          this._readdir(abs, false, cb);
        }
      };

      const lstatkey = `lstat\0${abs}`;
      const lstatcb = inflight(lstatkey, lstatcb_);

      if (!lstatcb) {
        return;
      }

      this.lstatRemote(abs)
        .then(stat => lstatcb(stat.error, stat.stat))
        .catch((error: ErrorWithCode) => lstatcb(error as ErrorWithCode));
    }

    _readdir(abs: string, inGlobStar: boolean, cb: Function): void {
      if (this.aborted) {
        return;
      }

      if (!this.request) {
        setImmediate(() => {
          if (!this.request) {
            return cb(new Error("Request is required"));
          }
          return this._readdir(abs, inGlobStar, cb);
        });
        return;
      }

      cb = inflight(`readdir\0${abs}\0${inGlobStar}`, cb);
      if (!cb) {
        return;
      }

      if (inGlobStar && !ownProp(this.symlinks, abs)) {
        return this._readdirInGlobStar(abs, cb);
      }

      const glob713Like = ((this as any) as Glob713Like);

      if (ownProp(this.cache, abs)) {
        const c = this.cache[abs];
        if (!c || c === "FILE") {
          return cb();
        }
        if (Array.isArray(c)) {
          return cb(undefined, c);
        }
      }

      this.readdirRemote(abs)
        .then(values => glob713Like._readdirEntries(abs, values, cb))
        .catch(error => glob713Like._readdirError(abs, error, cb));
    }
  }

  async function combine(request: Request, entries: string[], outputType: string): Promise<string> {

    const combinedGraph = graph();

    const baseURL = new URL(request.url);
    if (!baseURL.pathname.endsWith("/")) {
      baseURL.pathname += "/";
    }

    await Promise.all(
      entries.map(
        async entry => {
          const url = new URL(`${baseURL.pathname}${entry}`, baseURL.origin).toString(),
            contentType = "application/ld+json";

          const response = await fetch(
            new Request(
              url,
              {
                method: "GET",
                headers: {
                  Accept: contentType
                }
              }
            )
          );

          // Something wrong with our end, either 404, 403, or something else, but not found either way
          if (response.status.toString().startsWith("4")) {
            return; // Nothing more to do
          }

          const body = await response.text();

          await new Promise(
            (resolve, reject) => parse(
              body,
              combinedGraph,
              url,
              contentType,
              (error) => error ? reject(error) : resolve()
            )
          );
        }
      )
    );

    return new Promise<string>(
      (resolve, reject) => serialize(
        undefined,
        combinedGraph,
        request.url,
        outputType,
        (error, value) => error ? reject(error) : resolve(value)
      )
    );
  }

  return async (request: Request): Promise<Response> =>  {

    if (!hasMagic(new URL(request.url).pathname, options)) {
      // Not for us to handle
      return undefined;
    }

    const possibleRDFType = preferredMediaTypes(request.headers.get("Accept"), RDF_MIME_TYPES)[0];

    if (!possibleRDFType) {
      return new Response(
        undefined,
        {
          status: 405
        }
      );
    }

    return new Promise<Response>(
      (resolve, reject) => {
        new RemoteGlob713(request, (error, values) => {
          if (error) {
            return reject(error);
          }
          combine(request, values, possibleRDFType)
            .then(body => new Response(
              body,
              {
                status: 200,
                headers: {
                  "Content-Type": "text/turtle"
                }
              })
            )
            .then(resolve)
            .catch(reject);
        });
      }
    );
  };
}

export function createRemoteGlob(options: RemoteGlobOptions): any {
  if (options.glob.prototype._readdirEntries && options.glob.prototype._readdirError) {
    return createRemoteGlob713(options.glob, options);
  }
  throw new Error("Expected glob module matching version 7.1.3");
}
