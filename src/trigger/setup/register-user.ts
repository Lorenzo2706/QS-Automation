import { task } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";

/**
 * One-time setup task: creates a Supabase Auth user and fills in the
 * matching public.users row.
 *
 * How it works:
 *   - supabase.auth.admin.createUser() creates the auth.users row.
 *   - The on_auth_user_created trigger (see schema.sql) inserts the matching
 *     public.users row with user_id = auth user's id, name (from
 *     user_metadata.name, falls back to email) and email.
 *   - This task then UPDATEs that row with notification_threshold, since it's
 *     not carried by the auth flow.
 *
 * Trigger from the Trigger.dev dashboard with a payload like:
 * {
 *   "email": "lorenzo@example.com",
 *   "password": "a-secure-password",
 *   "name": "Lorenzo",
 *   "notificationThreshold": 85
 * }
 */
export const registerUserTask = task({
  id: "register-user",
  run: async (payload: {
    email: string;
    password: string;
    name: string;
    /** Minimum relevance score (0–100) to trigger a notification. Default: 85 */
    notificationThreshold?: number;
  }) => {
    const { email, password, name, notificationThreshold = 85 } = payload;

    if (!email?.trim()) throw new Error("email is required");
    if (!password?.trim()) throw new Error("password is required");
    if (!name?.trim()) throw new Error("name is required");
    if (notificationThreshold < 0 || notificationThreshold > 100) {
      throw new Error("notificationThreshold must be between 0 and 100");
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");

    const db = createClient(url, key, { auth: { persistSession: false } });

    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { name: name.trim() },
    });
    if (createErr || !created?.user) {
      throw new Error(`Failed to create auth user: ${createErr?.message ?? "no user returned"}`);
    }

    const userId = created.user.id;

    const { data: updated, error: updateErr } = await db
      .from("users")
      .update({
        notification_threshold: notificationThreshold,
      })
      .eq("user_id", userId)
      .select("user_id, name, email, notification_threshold")
      .single();
    if (updateErr) throw new Error(`Failed to update users row: ${updateErr.message}`);

    console.log(`User registered successfully:`);
    console.log(`  user_id: ${updated.user_id}`);
    console.log(`  name: ${updated.name}`);
    console.log(`  email: ${updated.email}`);
    console.log(`  notification_threshold: ${updated.notification_threshold}`);
    console.log(`Save the user_id — you will need it for the upload-resume task.`);

    return {
      userId: updated.user_id as string,
      name: updated.name as string,
      email: updated.email as string,
      notificationThreshold: updated.notification_threshold as number,
    };
  },
});
