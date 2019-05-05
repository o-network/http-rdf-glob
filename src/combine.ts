import { Request, Response } from "@opennetwork/http-representation";
import { graph, parse, serialize } from "./types/rdflib";
import { Fetcher } from "./fetcher";
import { preferredMediaTypes } from "./media-type";
import { RDF_MIME_TYPES } from "./mime-types";

export function getType(request: Request) {
  return preferredMediaTypes(request.headers.get("Accept"), RDF_MIME_TYPES)[0]
}

export function notAccepted() {
  return new Response(
    undefined,
    {
      status: 405
    }
  );
}

export async function combineForResponse(request: Request, entries: string[], fetch: Fetcher): Promise<Response> {
  const possibleRDFType = getType(request);
  if (!possibleRDFType) {
    return notAccepted();
  }
  const body = await combine(request, entries, possibleRDFType, fetch);
  return new Response(
    body,
    {
      status: 200,
      headers: {
        "Content-Type": "text/turtle"
      }
    }
  );
}

export async function combine(request: Request, entries: string[], outputType: string, fetch: Fetcher): Promise<string> {
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

