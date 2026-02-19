import type { NotificationChannel, NotificationMessage, SendResult } from "./index";

export class EmailChannel implements NotificationChannel {
  name = "email";
  private email: string;

  constructor(email: string) {
    this.email = email;
  }

  async send(message: NotificationMessage): Promise<SendResult> {
    // Email notifications are handled separately via the email service
    // This channel is a placeholder for configuration purposes
    console.log(`Email notification to ${this.email}: ${message.title}`);
    return {
      success: false,
      error: "Email notifications should be sent via the email service",
    };
  }
}
