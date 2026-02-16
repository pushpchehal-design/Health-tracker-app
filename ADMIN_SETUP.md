# Admin account setup

An **administrative account** can see all users (from Auth) and all their data (profiles, family members, health reports). Only users listed in the `admin_users` table have this access.

**Use a separate email for admin.** Keep your current email as a normal user (your own data only). Create a **different** account (e.g. `admin@yourdomain.com`) and add that account’s UID to `admin_users`. Then:

- Log in with **your normal email** → normal Health Tracker (your data only).
- Log out and log in with **the admin email** → you see the **Admin** button and can view all users and all data.

---

## 1. Run the SQL (one time)

In **Supabase Dashboard** → **SQL Editor**, run the script **`supabase-admin-setup.sql`** in this repo. It will:

- Create the `admin_users` table
- Add an `is_admin()` helper and RLS policies so admins can read all `user_profiles`, `family_members`, `health_reports`, `health_analysis`, and storage for the `health-reports` bucket

---

## 2. Create an admin account (different email) and add it to `admin_users`

Use a **separate email** for the admin role so you can tell “user” vs “admin” by which account you’re logged in with.

1. **Create the admin user (new email)**
   - Either: in your Health Tracker app, **Sign up** with a new email (e.g. `admin@yourdomain.com` or a personal +admin address). Complete sign-up and, if the app asks, complete profile/family setup (you can use minimal data for this account).
   - Or: in **Supabase Dashboard** → **Authentication** → **Users** → **Add user** → create a user with the admin email and a password.

2. **Get that user’s UID**
   - In **Supabase Dashboard** → **Authentication** → **Users**, find the user you just created (the admin email) and copy their **UID** (e.g. `a1b2c3d4-e5f6-7890-abcd-ef1234567890`).

3. **Mark that account as admin**
   - In **SQL Editor**, run (replace with the **admin account’s** UID, not your normal user’s UID):

   ```sql
   INSERT INTO public.admin_users (user_id) VALUES ('admin-account-uid-here');
   ```

4. **Use the app**
   - Log in with your **normal email** → no Admin button; normal experience.
   - Log out and log in with the **admin email** → **Admin** button appears; click it to see all users and their data.

---

## 3. Deploy the Edge Function and fix Unauthorized (401) (for “list all users”)

The admin UI uses an Edge Function to list auth users (email, created_at, last_sign_in_at). Deploy it once:

```bash
npx supabase functions deploy admin-list-users
```

If you use a deploy script that only deploys specific functions, add `admin-list-users` to it.

**If you get "Unauthorized (401)":** The function needs your project's anon key to validate the JWT. In Supabase Dashboard go to **Project Settings** → **Edge Functions** → **Secrets** and add a secret: name `SUPABASE_ANON_KEY`, value = your project's **anon public** key (same as in your app env `VITE_SUPABASE_ANON_KEY`). Then run `npx supabase functions deploy admin-list-users` again. Also ensure you are logged in with the **admin** account (the one in `admin_users`).

The function validates your session using the **apikey** header the app already sends (anon key). If you see "Unauthorized" or "Invalid or expired token", redeploy this function and ensure you are logged in with the **admin** account. If you see "Forbidden: admin access required (403)", that account’s UID is not in `admin_users` — add it with the SQL in step 2.

---

## 4. Add more admins later

To make another user an admin, run in SQL Editor (with their UID from Authentication → Users):

```sql
INSERT INTO public.admin_users (user_id) VALUES ('another-user-uid');
```

To remove admin access:

```sql
DELETE FROM public.admin_users WHERE user_id = 'user-uid-to-remove';
```

---

## Security summary

- **admin_users**: RLS allows each user to only **read their own row** (to know “am I admin?”). No one can list all admins from the client. Only the service role or SQL Editor can INSERT/DELETE.
- **Data access**: Admins get **read** access to all user data via RLS (no special API key in the app). The **admin-list-users** Edge Function checks that the caller is in `admin_users` before returning the auth user list.
