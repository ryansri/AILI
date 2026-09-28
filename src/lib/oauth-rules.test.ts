import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { clientDisplayName, pkceMatches, validRedirectUri } from "./oauth-rules";

describe("connector rules", () => {
  it("accepts https and local return addresses only", () => {
    expect(validRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(validRedirectUri("https://chatgpt.com/connector_platform_oauth_redirect")).toBe(true);
    expect(validRedirectUri("http://localhost:6274/oauth/callback")).toBe(true);
    expect(validRedirectUri("http://127.0.0.1:33418/callback")).toBe(true);
    expect(validRedirectUri("http://evil.example.com/cb")).toBe(false);
    expect(validRedirectUri("javascript:alert(1)")).toBe(false);
    expect(validRedirectUri("https://x.example.com/cb#frag")).toBe(false);
    expect(validRedirectUri("not a url")).toBe(false);
  });

  it("checks the PKCE verifier against the challenge", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    expect(pkceMatches(verifier, challenge)).toBe(true);
    expect(pkceMatches(verifier + "x", challenge)).toBe(false);
    expect(pkceMatches("short", challenge)).toBe(false);
  });

  it("names the app the way people know it", () => {
    expect(clientDisplayName("Claude")).toBe("Claude");
    expect(clientDisplayName("claude.ai")).toBe("Claude");
    expect(clientDisplayName("ChatGPT")).toBe("ChatGPT");
    expect(clientDisplayName("OpenAI Connector")).toBe("ChatGPT");
    expect(clientDisplayName("MCP Inspector")).toBe("MCP Inspector");
    expect(clientDisplayName("  ")).toBe("AI app");
  });
});
