import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";
import { OAuthAuthorizeForm } from "@/components/admin/oauth/oauth-authorize-form";

type SearchParams = Record<string, string | string[] | undefined>;

function serializeSearchParams(values: SearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  return params.toString();
}

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const oauthQuery = serializeSearchParams(await searchParams);
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect(`/admin/login${oauthQuery ? `?${oauthQuery}` : ""}`);
  }
  return <OAuthAuthorizeForm oauthQuery={oauthQuery} />;
}
