import { describe, expect, it } from "vitest";
import {
  openEmailSecret,
  sealEmailConfigFields,
} from "./config-secrets";

describe("email configuration secrets", () => {
  it("seals credential fields without changing ordinary settings", async () => {
    const fields = await sealEmailConfigFields(
      "product-1",
      {
        outboundApiKey: "provider-key",
        outboundSmtpHost: "smtp.example.com",
      },
      "master"
    );

    expect(fields.outboundApiKey).toMatch(/^v1\./);
    expect(fields.outboundSmtpHost).toBe("smtp.example.com");
    await expect(
      openEmailSecret(
        "product-1",
        "outboundApiKey",
        String(fields.outboundApiKey),
        "master"
      )
    ).resolves.toBe("provider-key");
  });
});
