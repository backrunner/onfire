export const featureFlags = {
  showDebugDetails: (): boolean => {
    if (process.env.NEXT_PUBLIC_DEBUG_MODE === "true") return true;
    if (process.env.NEXT_PUBLIC_DEBUG_MODE === "false") return false;
    return process.env.NODE_ENV === "development";
  },
  portBasedRouting: (): boolean => {
    return (
      process.env.NEXT_PUBLIC_PORT_ROUTING === "true" ||
      process.env.NODE_ENV === "development"
    );
  },
} as const;
