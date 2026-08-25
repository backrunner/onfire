import { describe, expect, it } from "vitest";
import {
  type ProductFormValues,
  validateProductForm,
} from "./product-form-validation";

const messages = {
  nameRequired: "name",
  urlInvalid: "url",
  identityUrlInvalid: "identity-url",
  identitySecretRequired: "secret",
  invalidNumber: "number",
  defaultLanguageNotSupported: "lang",
};

const validForm = (): ProductFormValues => ({
  name: "Product",
  tenantId: "",
  homepageUrl: "",
  portalReturnUrl: "",
  identityEnabled: false,
  identityEndpointUrl: "",
  identityAuthSecret: "",
  identitySecretConfigured: false,
  slaHighAccept: "",
  slaHighReply: "",
  slaMediumAccept: "",
  slaMediumReply: "",
  slaLowAccept: "",
  slaLowReply: "",
  autoCloseMinutes: "",
  defaultLanguage: "en",
  supportedLanguages: ["en"],
});

describe("validateProductForm", () => {
  it("omits an empty tenant so the API assigns the default tenant", () => {
    const result = validateProductForm(validForm(), {
      editing: false,
      includeTenant: true,
      messages,
    });

    expect(result.errors).toEqual({});
    expect(result.payload).toEqual({
      name: "Product",
      identityEnabled: false,
      defaultLanguage: "en",
      supportedLanguages: ["en"],
    });
  });

  it("normalizes every persisted product form field", () => {
    const form = validForm();
    Object.assign(form, {
      name: " Product ",
      tenantId: "tenant-2",
      homepageUrl: " https://example.com/home ",
      portalReturnUrl: "https://example.com/support",
      slaHighAccept: "15",
      autoCloseMinutes: "60",
    });
    const result = validateProductForm(form, {
      editing: false,
      includeTenant: true,
      messages,
    });

    expect(result.payload).toMatchObject({
      name: "Product",
      tenantId: "tenant-2",
      homepageUrl: "https://example.com/home",
      portalReturnUrl: "https://example.com/support",
      slaHighAccept: 15,
      autoCloseMinutes: 60,
    });
  });

  it("reports invalid URLs, identity configuration, and minute fields", () => {
    const form = validForm();
    Object.assign(form, {
      homepageUrl: "javascript:alert(1)",
      identityEnabled: true,
      identityEndpointUrl: "http://localhost/identity",
      identityAuthSecret: "short",
      slaLowReply: "1.5",
      autoCloseMinutes: "0",
    });
    const result = validateProductForm(form, {
      editing: false,
      includeTenant: true,
      messages,
    });

    expect(result.payload).toBeNull();
    expect(result.errors).toMatchObject({
      homepageUrl: "url",
      identityEndpointUrl: "identity-url",
      identityAuthSecret: "secret",
      slaLowReply: "number",
      autoCloseMinutes: "number",
    });
  });

  it("requires the supported set to contain the product default language", () => {
    const form = validForm();
    form.supportedLanguages = ["zh"];

    const result = validateProductForm(form, {
      editing: false,
      includeTenant: false,
      messages,
    });

    expect(result.payload).toBeNull();
    expect(result.errors.supportedLanguages).toBe("lang");
  });

  it("deduplicates supported languages in the submitted payload", () => {
    const form = validForm();
    form.supportedLanguages = ["en", "zh", "zh"];

    const result = validateProductForm(form, {
      editing: false,
      includeTenant: false,
      messages,
    });

    expect(result.payload?.supportedLanguages).toEqual(["en", "zh"]);
  });
});
