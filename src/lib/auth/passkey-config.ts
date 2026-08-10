export function getPasskeyRelyingParty(baseURL: string) {
  const authUrl = new URL(baseURL);
  return {
    rpID: authUrl.hostname,
    rpName: "OnFire",
    origin: authUrl.origin,
  };
}
