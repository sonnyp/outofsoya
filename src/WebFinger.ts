export class HTTPError extends Error {
  response: Response;
  status: number;
  constructor(response: Response) {
    super(response.statusText);
    Object.setPrototypeOf(this, new.target.prototype);

    this.response = response;
    this.status = response.status;
  }
}

export function getDomain(resource: URL | string): string {
  let domain;

  const url = typeof resource === "string" ? new URL(resource) : resource;

  if (url.protocol === "acct:") {
    const idx = resource.toString().lastIndexOf("@");
    domain = resource.toString().substring(idx + 1);
  } else {
    domain = url.hostname;
  }

  return domain;
}

export async function lookup(
  resource: URL | string,
  options: RequestInit = {},
): Promise<any> {
  const domain = getDomain(resource);

  const url = new URL(`https://${domain}/.well-known/webfinger`);
  url.searchParams.append("resource", resource.toString());

  const response = await fetch(url.toString(), {
    ...options,
    headers: {
      Accept: "application/jrd+json",
      ...options.headers,
    },
  });

  if (response.status !== 200) {
    throw new HTTPError(response);
  }

  return response.json();
}
