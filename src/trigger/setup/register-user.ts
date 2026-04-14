import { task } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";

/**
 * One-time setup task: registers a new user in the database.
 *
 * Trigger from the Trigger.dev dashboard with a payload like:
 * {
 *   "name": "Lorenzo",
 *   "email": "lorenzo@example.com",
 *   "telegramChatId": "123456789",
 *   "notificationThreshold": 85
 * }
 *
 * To find your Telegram chat ID:
 *   1. Send any message to your bot
 *   2. Open https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
 *   3. Look for "chat": {"id": <number>} — that number is your chat ID
 */
export const registerUserTask = task({
  id: "register-user",
  run: async (payload: {
    name: string;
    email?: string;
    telegramChatId?: string;
    /** Minimum relevance score (0–100) to trigger a notification. Default: 85 */
    notificationThreshold?: number;
  }) => {
    const { name, email, telegramChatId, notificationThreshold = 85 } = payload;

    if (!name?.trim()) throw new Error("name is required");
    if (
      notificationThreshold !== undefined &&
      (notificationThreshold < 0 || notificationThreshold > 100)
    ) {
      throw new Error("notificationThreshold must be between 0 and 100");
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY is not set");

    const db = createClient(url, key);

    const { data, error } = await db
      .from("users")
      .insert({
        name: name.trim(),
        email: email?.trim() ?? null,
        telegram_chat_id: telegramChatId?.trim() ?? null,
        notification_threshold: notificationThreshold,
      })
      .select("user_id, name, notification_threshold")
      .single();

    if (error) throw new Error(`Failed to register user: ${error.message}`);

    console.log(`User registered successfully:`);
    console.log(`  user_id: ${data.user_id}`);
    console.log(`  name: ${data.name}`);
    console.log(`  notification_threshold: ${data.notification_threshold}`);
    console.log(`Save the user_id — you will need it for the upload-resume task.`);

    return {
      userId: data.user_id as string,
      name: data.name as string,
      notificationThreshold: data.notification_threshold as number,
    };
  },
});
