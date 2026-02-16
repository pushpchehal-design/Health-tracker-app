# Payment Gateway Options for AI Analysis

Your app currently gates AI features with a local toggle (`aiEnabled` in localStorage). To charge for AI analysis, you need a payment provider and a way to record "paid" status in Supabase so the app can enable AI for paying users.

---

## India first, small amounts (INR 149–249): **Razorpay**

If you’re targeting **India** with **small amounts (e.g. INR 149, INR 249)** and want **UPI, cards, and netbanking** with minimal formalities, use **Razorpay**. Stripe is less ideal for very small INR transactions and has heavier onboarding for India.

- **Razorpay:** Minimum INR 1; supports UPI, debit/credit cards, netbanking, wallets. Quick sign-up, test mode, per-transaction pricing.
- **Full setup and flow:** See **[PAYMENT_INDIA_RAZORPAY.md](./PAYMENT_INDIA_RAZORPAY.md)** for Edge Functions (`create-razorpay-order`, `razorpay-webhook`), Supabase schema, and frontend checklist.

You can add Stripe (or another gateway) later when you expand to other regions.

---

## 1. **Stripe**

**Pros:** Widely used, great docs, works well with Supabase (Edge Functions, webhooks). Supports one-time payments and subscriptions.  
**Cons:** You handle tax/compliance (or use Stripe Tax).  
**Best for:** Global users, full control over pricing and flows.

### How it fits your stack
- **Create payment:** User clicks "Enable AI" → frontend calls a Supabase Edge Function → Edge Function creates a [Stripe Checkout Session](https://stripe.com/docs/checkout/quickstart) (or Payment Link) and returns the URL → redirect user to Stripe.
- **After payment:** Stripe sends a [webhook](https://stripe.com/docs/webhooks) (e.g. `checkout.session.completed`) to another Edge Function → verify signature → update Supabase (e.g. `user_profiles` or a `subscriptions` table) so this user has access.
- **In the app:** Replace the simple AI toggle with: "Has paid / has active subscription?" from Supabase. If yes, allow upload/analysis; if no, show a "Pay to enable AI" CTA that starts the payment flow.

### Pricing models you can support
- **One-time:** e.g. "Unlock AI for $X" (single payment, grant access for a fixed period or forever).
- **Pay per report:** e.g. "$0.50 per analysis" – create a Checkout Session per report; webhook grants one "credit" or marks that report as paid.
- **Subscription:** e.g. "$5/month" – Stripe subscription; webhook creates/updates a `subscriptions` row; app checks `status === 'active'`.

### What you’d build
1. **Supabase**
   - Table or columns to store "has AI access" (e.g. `user_profiles.ai_access_until` or `subscriptions(stripe_subscription_id, status, user_id)`).
   - RLS so users only see their own payment/access data.
2. **Edge Functions**
   - `create-checkout-session`: receives `userId`, creates Stripe Checkout Session with `client_reference_id = userId`, returns `url`.
   - `stripe-webhook`: receives Stripe events, verifies signature, on `checkout.session.completed` (or `invoice.paid` for subscriptions) updates Supabase for that user.
3. **Frontend**
   - "Enable AI" / "Upgrade" button that calls `create-checkout-session`, then redirects to `session.url`.
   - Success/cancel return URLs (e.g. `/dashboard?payment=success`); optional "Thank you" page.
   - On load: fetch user’s access from Supabase and set `aiEnabled` (or equivalent) from that, instead of only localStorage.

### Security
- Never use Stripe **secret key** in the frontend. Use it only in Edge Functions (or another backend). Store as Supabase secret, e.g. `STRIPE_SECRET_KEY`.
- Webhook endpoint must verify [Stripe signature](https://stripe.com/docs/webhooks/signatures) and use `verify_jwt = false` for that function so Stripe can call it.

---

## 2. **Lemon Squeezy** or **Paddle**

**Pros:** Act as "merchant of record" (they handle tax, VAT, invoicing). Good if you want minimal compliance work.  
**Cons:** Less flexible than Stripe; fees can be higher; integration with Supabase is more "custom" (no official Supabase example).  
**Best for:** Selling globally without dealing with tax yourself.

- You create products/prices in their dashboard, get checkout links or use their API.
- Webhooks notify your backend (e.g. Edge Function) when a sale completes; you then update Supabase (same idea as Stripe: "user X has access until Y").
- Frontend flow: "Pay to enable AI" → redirect to Lemon Squeezy / Paddle checkout → return URL + webhook complete the flow.

---

## 3. **Razorpay**

**Pros:** Strong in India, local payment methods (UPI, cards, etc.).  
**Cons:** Focused on India; for other countries Stripe/Paddle are more common.  
**Best for:** Primarily Indian users.

- Similar pattern: create order/checkout via API (from Edge Function), redirect user, handle webhook to update Supabase when payment succeeds.

---

## 4. **PayPal**

**Pros:** Familiar to many users.  
**Cons:** UX and API are often considered heavier than Stripe; fewer Supabase-specific examples.  
**Best for:** If you specifically want PayPal as an option (can be added alongside Stripe).

---

## Recommended path

- **India first, small INR amounts (149–249), UPI/cards/netbanking:** use **Razorpay** → see [PAYMENT_INDIA_RAZORPAY.md](./PAYMENT_INDIA_RAZORPAY.md).
- **Global or larger amounts:** **Stripe + Supabase** (below).

1. **Stripe account**  
   Sign up at [stripe.com](https://stripe.com). Use Test mode while building.

2. **Supabase**
   - Add a table or columns for access, e.g.  
     `user_profiles.ai_access_until timestamptz`  
     or  
     `subscriptions(user_id, stripe_customer_id, status, current_period_end)`.
   - Store `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Edge Function secrets.

3. **Edge Functions**
   - `create-checkout-session`: POST body `{ userId }` (from authenticated user), create Checkout Session, return `{ url }`.
   - `stripe-webhook`: POST handler, verify `Stripe-Signature`, on `checkout.session.completed` (and optionally `customer.subscription.updated` / `invoice.paid` for subscriptions) update `user_profiles` or `subscriptions` for the user identified by `client_reference_id` or `metadata.user_id`.

4. **Frontend**
   - Replace "AI Engine" toggle with:
     - If user has access (from Supabase): show "AI On" and allow analysis as today.
     - If not: show "Pay to enable AI" → call Edge Function → redirect to Stripe.
   - Optionally: success/cancel return URLs and a short "Payment successful" message.

5. **Stripe Dashboard**
   - Create a Product (e.g. "AI Report Analysis") and Price (one-time or recurring).
   - In Webhooks, add endpoint pointing to your `stripe-webhook` Edge Function URL and subscribe to `checkout.session.completed` (and subscription events if you use subscriptions).

This gives you a single, well-documented path (Stripe + Supabase) and a clear place to enforce "user must pay before AI analysis" in both the UI and (via Edge Function) on the server.

If you tell me your preference (one-time vs subscription vs pay-per-report), I can outline the exact Stripe API calls and Supabase schema changes next.
