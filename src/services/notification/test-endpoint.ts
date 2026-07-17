import type { Database } from "@/lib/db";
import { getEnv } from "@/lib/db";
import type { NotificationEndpointRow } from "@/drizzle/schema";
import {
  openEndpointConfig,
  validateChannelConfig,
} from "@/lib/notifications/channel-schema";
import {
  createChannel,
  type ChannelConfig,
  type SendResult,
} from "./channels";

export async function sendEndpointTest(
  db: Database,
  endpoint: NotificationEndpointRow,
  productId?: string
): Promise<SendResult> {
  try {
    if (endpoint.channelType === "email" && !productId) {
      throw new Error("A product is required to test an email endpoint");
    }

    const parsed = JSON.parse(endpoint.config || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid notification endpoint configuration");
    }

    const channelConfig: ChannelConfig = {
      type: endpoint.channelType,
      config: await openEndpointConfig(
        endpoint.id,
        parsed as Record<string, unknown>,
        getEnv().AUTH_SECRET
      ),
    };
    const issues = validateChannelConfig(channelConfig.type, channelConfig.config);
    if (issues.length > 0) {
      throw new Error(`Invalid notification endpoint configuration: ${issues.join("; ")}`);
    }

    const provider = await createChannel(channelConfig, {
      db,
      productId: productId ?? "",
    });
    return provider.send({
      title: "OnFire test notification",
      body: "Your receiving method is configured correctly.",
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Test notification failed",
    };
  }
}
