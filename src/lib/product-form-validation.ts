import { safeIdentityEndpoint } from "@/lib/auth/remote-identity";
import { safeHttpUrl } from "@/lib/external-url";

export const PRODUCT_SLA_FIELDS = [
  "slaHighAccept",
  "slaHighReply",
  "slaMediumAccept",
  "slaMediumReply",
  "slaLowAccept",
  "slaLowReply",
] as const;

export type ProductSlaField = (typeof PRODUCT_SLA_FIELDS)[number];

export interface ProductFormValues {
  name: string;
  tenantId: string;
  homepageUrl: string;
  portalReturnUrl: string;
  identityEnabled: boolean;
  identityEndpointUrl: string;
  identityAuthSecret: string;
  identitySecretConfigured: boolean;
  slaHighAccept: string;
  slaHighReply: string;
  slaMediumAccept: string;
  slaMediumReply: string;
  slaLowAccept: string;
  slaLowReply: string;
  autoCloseMinutes: string;
  defaultLanguage: string;
  supportedLanguages: string[];
}

interface ProductValidationMessages {
  nameRequired: string;
  urlInvalid: string;
  identityUrlInvalid: string;
  identitySecretRequired: string;
  invalidNumber: string;
  defaultLanguageNotSupported: string;
}

interface ValidateProductFormOptions {
  editing: boolean;
  includeTenant: boolean;
  messages: ProductValidationMessages;
}

export interface ProductFormValidationResult {
  errors: Partial<Record<keyof ProductFormValues, string>>;
  payload: Record<string, unknown> | null;
}

function parsePositiveInteger(value: string): number | null | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function validateProductForm(
  form: ProductFormValues,
  options: ValidateProductFormOptions
): ProductFormValidationResult {
  const { messages } = options;
  const errors: ProductFormValidationResult["errors"] = {};
  const name = form.name.trim();
  const homepageUrl = form.homepageUrl.trim();
  const portalReturnUrl = form.portalReturnUrl.trim();
  const identityEndpointUrl = form.identityEndpointUrl.trim();
  const identityAuthSecret = form.identityAuthSecret.trim();

  if (!name) errors.name = messages.nameRequired;
  if (homepageUrl && safeHttpUrl(homepageUrl) === null) {
    errors.homepageUrl = messages.urlInvalid;
  }
  if (portalReturnUrl && safeHttpUrl(portalReturnUrl) === null) {
    errors.portalReturnUrl = messages.urlInvalid;
  }
  if (form.identityEnabled && safeIdentityEndpoint(identityEndpointUrl) === null) {
    errors.identityEndpointUrl = messages.identityUrlInvalid;
  }
  if (
    form.identityEnabled &&
    !form.identitySecretConfigured &&
    identityAuthSecret.length < 16
  ) {
    errors.identityAuthSecret = messages.identitySecretRequired;
  } else if (identityAuthSecret && identityAuthSecret.length < 16) {
    errors.identityAuthSecret = messages.identitySecretRequired;
  }

  const parsedMinutes: Partial<Record<ProductSlaField | "autoCloseMinutes", number>> = {};
  for (const field of [...PRODUCT_SLA_FIELDS, "autoCloseMinutes"] as const) {
    const parsed = parsePositiveInteger(form[field]);
    if (parsed === null) errors[field] = messages.invalidNumber;
    else if (parsed !== undefined) parsedMinutes[field] = parsed;
  }

  const supportedLanguages = [...new Set(form.supportedLanguages)];
  if (!supportedLanguages.includes(form.defaultLanguage)) {
    errors.supportedLanguages = messages.defaultLanguageNotSupported;
  }

  if (Object.keys(errors).length > 0) return { errors, payload: null };

  const payload: Record<string, unknown> = {
    name,
    identityEnabled: form.identityEnabled,
    defaultLanguage: form.defaultLanguage,
    supportedLanguages,
  };
  if (options.includeTenant && form.tenantId) payload.tenantId = form.tenantId;
  if (options.editing) {
    payload.homepageUrl = homepageUrl || null;
    payload.portalReturnUrl = portalReturnUrl || null;
    payload.identityEndpointUrl = identityEndpointUrl || null;
    for (const field of PRODUCT_SLA_FIELDS) {
      payload[field] = parsedMinutes[field] ?? null;
    }
    payload.autoCloseMinutes = parsedMinutes.autoCloseMinutes ?? null;
  } else {
    if (homepageUrl) payload.homepageUrl = homepageUrl;
    if (portalReturnUrl) payload.portalReturnUrl = portalReturnUrl;
    if (identityEndpointUrl) payload.identityEndpointUrl = identityEndpointUrl;
    for (const field of PRODUCT_SLA_FIELDS) {
      if (parsedMinutes[field] !== undefined) payload[field] = parsedMinutes[field];
    }
    if (parsedMinutes.autoCloseMinutes !== undefined) {
      payload.autoCloseMinutes = parsedMinutes.autoCloseMinutes;
    }
  }
  if (identityAuthSecret) payload.identityAuthSecret = identityAuthSecret;

  return { errors, payload };
}
