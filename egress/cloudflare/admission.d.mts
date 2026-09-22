export declare function admit(
  request: Request,
  token: string | undefined,
  forward: (request: Request) => Promise<Response>,
): Promise<Response>;
