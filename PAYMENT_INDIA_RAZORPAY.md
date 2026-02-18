# India Payment Gateway – Razorpay (Quick Start)

For **INR 149–249**, **UPI + cards + netbanking**, India-first with minimal formalities.

---

## Why Razorpay for your case

- **Small amounts:** Minimum INR 1 (100 paise). INR 149 and INR 249 are fully supported.
- **Methods:** UPI, debit/credit cards, netbanking, wallets.
- **Setup:** Sign up at [razorpay.com](https://razorpay.com) with business details (GST optional for very small; check their current policy). Test mode available with test keys.
- **Pricing:** Per-transaction fee (typically ~2%); no fixed monthly fee. You pay only when a payment succeeds.
- **Integration:** REST API + Checkout (hosted or custom). Works with Supabase Edge Functions (create order on server, confirm payment via webhook).

**Alternative:** **Instamojo** – even simpler for “payment links” (create link, share; user pays). Good if you want zero code for the first version (share link manually). For in-app “Pay to enable AI” flow, Razorpay is a better fit.

---

## Flow (high level)

1. User clicks **“Pay to enable AI”** (or “Unlock for ₹149”) in your app.
2. Frontend calls your **Supabase Edge Function** with `userId` and chosen amount (e.g. 14900 for ₹149).
3. Edge Function calls **Razorpay API** to create an **Order** (amount in paise, currency `INR`, `notes.user_id = userId`), gets `order_id`.
4. Edge Function returns `order_id` and your Razorpay **Key ID** (public) to the frontend.
5. Frontend loads **Razorpay Checkout** (script), opens checkout with `order_id` and `key`. User pays via UPI / card / netbanking.
6. On success, Razorpay redirects user back to your app (e.g. `/dashboard?payment=success`) and sends a **webhook** to your server.
7. A second **Edge Function** (webhook handler) receives the event, verifies signature, and on successful payment updates **Supabase** (e.g. `user_profiles.ai_access_until` or a `payments` table) so this user has AI access.
8. App reads “has access” from Supabase and shows AI features.

---

## What you need

### 1. Razorpay account

- Register at [dashboard.razorpay.com](https://dashboard.razorpay.com).
- **Add your website:** Dashboard → **Account & Settings** (left sidebar) → **Business website detail** (under “Website and app settings”) → **Add website/app details** → **Proceed to update website/app** → choose **Website** → enter your live URL, e.g. `https://health-tracker-app-alpha.vercel.app` (your actual Vercel URL). Submit for review. In **Test mode** you can often proceed without full review; for **Live mode**, Razorpay may require policy pages (Privacy, Terms, Contact, Refunds – add simple pages or links when you go live).
- Get **Key ID** and **Key Secret:** **Account & Settings** → **API Keys** (use **Test mode** first).
- In **Settings** → **Webhooks**, add a webhook URL pointing to your Edge Function (e.g. `https://<project>.supabase.co/functions/v1/razorpay-webhook`). Subscribe to **payment.captured** (and optionally **order.paid**). You’ll do this when you implement the payment flow.

- **Temp login for Razorpay verification:** If Razorpay asks for test credentials to log in to your app, give them **Login: Temp_Access** and **Password: Temp_1234**. The app accepts “Temp_Access” as a login and signs in as a dedicated temp user. You must create that user once in Supabase: **Authentication** → **Users** → **Add user** → Email: `temp_razorpay@razorpay-verification.in`, Password: `Temp_1234`. After verification you can delete this user or change its password.

### 2. Supabase

- **Secrets** (Edge Functions):  
  `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
- **Schema:**  
  - Option A: Add to `user_profiles` – e.g. `ai_access_until timestamptz`, `razorpay_payment_id text`.  
  - Option B: New table `payments` – `user_id`, `razorpay_order_id`, `razorpay_payment_id`, `amount_paise`, `status`, `created_at`.  
  Then grant AI access if user has at least one successful payment (or `ai_access_until > now()`).

### 3. Edge Functions (two)

| Function                 | Purpose |
|--------------------------|--------|
| `create-razorpay-order`  | Authenticated. Receives `amount` (paise) and `userId`. Creates Razorpay Order with `notes.user_id = userId`. Returns `{ order_id, key_id }` (or `{ order_id, key_id, amount, currency }`). |
| `razorpay-webhook`       | Receives Razorpay webhook. Verifies signature using `RAZORPAY_WEBHOOK_SECRET`. On `payment.captured`, reads `order_id` / `payment_id`, fetches order from Razorpay if needed to get `notes.user_id`, updates Supabase (mark paid, set `ai_access_until` or insert into `payments`). Set `verify_jwt = false` for this function. |

### 4. Frontend

- **Pay button:** Calls `create-razorpay-order` (e.g. amount 14900 or 24900), gets `order_id` and `key_id`.
- Load Razorpay script: `https://checkout.razorpay.com/v1/checkout.js`.
- Open Checkout: `new Razorpay({ key: key_id, order_id, amount, currency: 'INR', name: 'Your App', description: 'AI Report Analysis', handler: (res) => { /* redirect to success URL */ } })`.
- Success URL: e.g. `/dashboard?payment=success`. On load, refetch user’s access from Supabase and enable AI in the UI.

---

## Amount in API

- Razorpay uses **paise** for INR.
- **INR 149** → `amount: 14900`
- **INR 249** → `amount: 24900`

Create Order request body (from Edge Function):

```json
{
  "amount": 14900,
  "currency": "INR",
  "receipt": "ai_<userId>_<timestamp>",
  "notes": { "user_id": "<userId>" }
}
```

---

## Security

- Use **Key Secret** only in Edge Functions (Supabase secrets). Never expose it in the frontend.
- Webhook handler **must** verify the `X-Razorpay-Signature` header using `RAZORPAY_WEBHOOK_SECRET` (Razorpay docs: “Verify webhook signature”). Reject requests with invalid signature.
- Ensure only the authenticated user can create an order for their own `userId` (Edge Function checks `req.auth` or body `userId` matches JWT).

---

## Quick checklist

- [ ] Razorpay account (test mode).
- [ ] Supabase: secrets `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
- [ ] Supabase: column or table to store “user has paid” / `ai_access_until`.
- [ ] Edge Function: `create-razorpay-order` (create order, return `order_id` + `key_id`).
- [ ] Edge Function: `razorpay-webhook` (verify signature, on `payment.captured` update Supabase). `verify_jwt = false`.
- [ ] Razorpay Dashboard: Webhook URL → `razorpay-webhook`, event `payment.captured`.
- [ ] Frontend: “Pay ₹149” / “Pay ₹249” → call create-order → Razorpay Checkout → success URL → refetch access and enable AI.

Once this works in test mode, switch to **Live keys** and add your bank account in Razorpay for settlements.
