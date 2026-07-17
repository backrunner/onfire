import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";

/** User-correctable request failures are warnings; operational failures are errors. */
export function showEmailMutationFailure(
  error: unknown,
  fallbackMessage: string
): void {
  const message = error instanceof ApiClientError ? error.message : fallbackMessage;
  const isUserCorrectable =
    error instanceof ApiClientError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 401 &&
    error.status !== 403;

  if (isUserCorrectable) {
    toast.warning(message);
    return;
  }
  toast.error(message);
}
