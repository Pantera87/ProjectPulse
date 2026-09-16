const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 ProjectPulse/1.0";

export interface FetchOpts {
  timeoutMs?: number;
  headers?: Record<string, string>;
  maxBytes?: number;
}

/** Fetch with UA, timeout and size cap. Throws on HTTP error status. */
export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      ...opts.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const cap = opts.maxBytes ?? 5_000_000;
  return buf.subarray(0, cap).toString("utf8");
}
