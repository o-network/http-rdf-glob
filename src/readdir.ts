import { Request } from "@opennetwork/http-representation";
import { graph, Namespace, parse } from "./types/rdflib";
import { Fetcher } from "./fetcher";

const ldp = Namespace("http://www.w3.org/ns/ldp#");

export async function readdir(request: Request, abs: string, fetch: Fetcher): Promise<string[]> {
  const origin = new URL(request.url).origin;
  const url = new URL(abs, origin).toString(),
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
    .map((value): string => value.object.value)
    .map(value => {
      const url = new URL(value, origin);
      return url.pathname.substr(url.pathname.lastIndexOf("/") + 1);
    });
}
