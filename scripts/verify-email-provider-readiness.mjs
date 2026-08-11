import assert from "node:assert/strict";
import { resolveMx, resolveTxt } from "node:dns/promises";

const apiKey = process.env.RESEND_API_KEY;
const domainName = (process.env.HAT_EMAIL_DOMAIN ?? "caseready.africa")
  .trim()
  .toLowerCase();

async function recordsFor(name, resolver) {
  try {
    const records = await resolver(name);
    return { available: records.length > 0, count: records.length };
  } catch {
    return { available: false, count: 0 };
  }
}

const [domainResponse, dkim, spf, returnPath] = await Promise.all([
  apiKey
    ? fetch("https://api.resend.com/domains", {
        headers: { authorization: `Bearer ${apiKey}` },
      })
    : Promise.resolve(null),
  recordsFor(`resend._domainkey.${domainName}`, resolveTxt),
  recordsFor(`send.${domainName}`, resolveTxt),
  recordsFor(`send.${domainName}`, resolveMx),
]);

let providerDomain = null;
let inspection = apiKey ? "available" : "No Resend key in local environment";
if (domainResponse?.ok) {
  const body = await domainResponse.json();
  providerDomain = (body.data ?? []).find(
    (domain) => domain.name?.toLowerCase() === domainName,
  );
} else if (domainResponse && [401, 403].includes(domainResponse.status)) {
  inspection = "API key is sending-only; dashboard verification still required";
} else if (domainResponse) {
  throw new Error(`Resend domain inspection returned ${domainResponse.status}`);
}

assert(
  providerDomain || dkim.available || spf.available || returnPath.available,
  `${domainName} has no visible Resend domain or sending DNS records`,
);

process.stdout.write(
  `${JSON.stringify(
    {
      domain: domainName,
      dns: {
        dkim: dkim.available,
        returnPathMx: returnPath.available,
        spf: spf.available,
      },
      provider: {
        inspection,
        sending:
          providerDomain?.capabilities?.sending ??
          (providerDomain?.status === "verified" ? "enabled" : "unknown"),
        status: providerDomain?.status ?? "not_visible_with_this_key",
      },
      secretsPrinted: false,
    },
    null,
    2,
  )}\n`,
);
