import { Request, Response } from "@opennetwork/http-representation";

export type Fetcher = (request: Request) => Promise<Response>;
