import type { Translations } from "@/locales/zh";

type ReasonLabels = Translations["management"]["filteredInputs"]["reasons"];

export function spamFilterProbabilities(reason: string | null) {
  const match = /^Spam probability (\d+\.\d+); genuine support probability (\d+\.\d+)$/.exec(reason ?? "");
  if (!match) return null;
  const spam = Number(match[1]), support = Number(match[2]);
  return spam <= 1 && support <= 1 ? { spam, support } : null;
}

export function summarizeSpamFilterReason(reason: string | null, t: Translations): string {
  const probabilities = spamFilterProbabilities(reason);
  const labels = t.management.filteredInputs;
  if (probabilities) {
    if (probabilities.spam >= 0.5) return labels.likelySpam;
    if (probabilities.support <= 0.5) return labels.supportUnconfirmed;
    return labels.modelFlagged;
  }
  return formatSpamFilterReason(reason, labels.reasons);
}

const knownReasons: Record<string, keyof ReasonLabels> = {
  "Content was filtered": "filtered",
  "Content verification is temporarily unavailable": "unavailable",
  "Content verification is unavailable; manual review is required": "reviewRequired",
  "Message is not verified as genuine support": "notVerified",
  "AI classified the message as spam or non-support": "notSupport",
  "Email body is empty": "emptyBody",
  "Email marked as spam by provider": "providerSpam",
  "DKIM check failed": "dkimFailed",
  "Automated or mailing-list message": "automated",
  "Bounce message": "bounce",
  "Sender rate limit exceeded": "rateLimit",
  "Closed tickets do not accept replies": "closedTicket",
  "Akismet marked the submission as blatant spam": "akismetBlatant",
  "Akismet classified the submission as spam": "akismetSpam",
  "OOPSpam marked the content as spam": "oopspamSpam",
};

/** Localize built-in explanations without changing stored or provider-authored text. */
export function formatSpamFilterReason(reason: string | null, labels: ReasonLabels): string {
  if (!reason) return "—";
  const key = Object.hasOwn(knownReasons, reason) ? knownReasons[reason] : undefined;
  if (key) return labels[key];

  const probabilities = /^Spam probability (\d+\.\d+); genuine support probability (\d+\.\d+)$/.exec(reason);
  if (probabilities) return labels.probabilities.replace("{{spam}}", probabilities[1]).replace("{{support}}", probabilities[2]);
  const score = /^(SpamAssassin|OOPSpam) score (-?\d+(?:\.\d+)?)$/.exec(reason);
  if (score) return labels.vendorScore.replace("{{provider}}", score[1]).replace("{{score}}", score[2]);
  const confidence = /^Stop Forum Spam confidence (\d+(?:\.\d+)?)$/.exec(reason);
  if (confidence) return labels.confidence.replace("{{confidence}}", confidence[1]);
  const spf = /^SPF check failed: (pass|fail|softfail|neutral|none|temperror|permerror)$/.exec(reason);
  if (spf) return labels.spfFailed.replace("{{result}}", spf[1]);
  return reason;
}

export function formatSpamFilterProvider(provider: string | null, t: Translations): string {
  const labels = t.management.spamFilter.providers;
  if (!provider || provider === "local") return t.management.filteredInputs.localChecks;
  if (Object.hasOwn(labels, provider)) return labels[provider as keyof typeof labels].name;
  if (provider === "prescreening") return t.aiConfig.tasks.prescreening;
  const aiLabels = t.aiConfig.providers;
  if (Object.hasOwn(aiLabels, provider)) return aiLabels[provider as keyof typeof aiLabels];
  return provider;
}
