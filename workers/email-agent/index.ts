import { enqueueInboundEmail } from "../../src/lib/email-queue";
import { consumeAgentOutbound } from "../../src/services/email/agent-consumer";

export default {
  async email(message, env) {
    await enqueueInboundEmail(message, env.EMAIL_STORAGE, env.EMAIL_INBOUND_QUEUE, "agent", env.EMAIL_AGENT_ADDRESSES);
  },
  async queue(batch, env) {
    await consumeAgentOutbound(batch, {
      main: env.MAIN_MAIL, storage: env.EMAIL_STORAGE, sender: env.SEND_EMAIL,
      allowedAddresses: env.EMAIL_AGENT_ADDRESSES,
    });
  },
} satisfies ExportedHandler<MailAgentEnv>;
