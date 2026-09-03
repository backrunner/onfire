import type { EmailConfigRow } from "@/drizzle/schema";
import { openStoredSecret, sealSecret } from "@/lib/secret-storage";

export const EMAIL_SECRET_FIELDS = [
  "inboundWebhookSecret",
  "inboundApiKey",
  "outboundApiKey",
  "outboundSmtpPass",
] as const;

export type EmailSecretField = (typeof EMAIL_SECRET_FIELDS)[number];

export function emailSecretPurpose(
  productId: string,
  field: EmailSecretField
): string {
  return `email-config:${productId}:${field}`;
}

export async function sealEmailConfigFields(
  productId: string,
  fields: Record<string, unknown>,
  masterSecret: string
): Promise<Record<string, unknown>> {
  const result = { ...fields };
  for (const field of EMAIL_SECRET_FIELDS) {
    const value = fields[field];
    if (typeof value === "string" && value.length > 0) {
      result[field] = await sealSecret(
        value,
        masterSecret,
        emailSecretPurpose(productId, field)
      );
    }
  }
  return result;
}

export async function openEmailSecret(
  productId: string,
  field: EmailSecretField,
  value: string,
  masterSecret: string
): Promise<string> {
  return openStoredSecret(value, masterSecret, emailSecretPurpose(productId, field));
}

export async function openEmailConfigSecrets(
  row: EmailConfigRow,
  masterSecret: string,
  fields: readonly EmailSecretField[] = EMAIL_SECRET_FIELDS
): Promise<EmailConfigRow> {
  const values = await Promise.all(
    fields.map(async (field) => [
      field,
      row[field]
        ? await openEmailSecret(row.productId, field, row[field] as string, masterSecret)
        : row[field],
    ] as const)
  );
  return { ...row, ...Object.fromEntries(values) } as EmailConfigRow;
}
