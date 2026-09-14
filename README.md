# AlMarwah Online — Next.js Storefront

A full storefront for AlMarwah (desktop / tablet / mobile), built against the
**same live API** the existing Flutter app (`shop.almarwah.qa`) already uses —
`https://admin.almarwah.qa/api/v1`. No separate backend, no database
credentials in this project; everything is real, live data.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build && npm start   # production build
```

No `.env` file is required to run the storefront itself — the API base URL
is a plain constant in `src/lib/api.ts` since it's a public API with no
secret keys involved. **The one exception is WhatsApp OTP login** (below),
which needs `.env.local` — copy `.env.local.example` and fill it in.

## What's implemented (real, working against the live API)

- Home, category browsing (with sort + pagination), product detail, search
- Cart (guest and logged-in), persisted, synced to the server cart
- Login / Register (email or phone + password), plus **WhatsApp OTP login**
  — one code, works for both new and returning customers (see below)
- Checkout: delivery or self-pickup, saved addresses, COD, coupon codes,
  real order placement
- Account: profile, order history + status, address management, wishlist

## WhatsApp OTP login

`/login` has a second tab, "WhatsApp", next to the usual email/phone +
password form. One phone number, one 6-digit code, sent entirely over
WhatsApp via your own **n8n** workflow — and it correctly handles both
returning and brand-new customers without asking which one you are:

1. Enter a phone number → we send a code via your n8n webhook.
2. Enter the code → verified against a signed token we issue ourselves
   (nothing stored in a database — see `src/lib/otp.ts`).
3. We call the backend's `/auth/otp-login` endpoint, which looks the phone
   up:
   - **Already has an account** → logged straight in, with a real token for
     *their actual existing account* — same order history, addresses,
     wishlist, exactly as if they'd typed their password. No name step, no
     extra click.
   - **New phone** → asked for a name, account created immediately, no
     password to set or remember.

Because the lookup happens first, this can never create a duplicate account
for someone who already has one.

### Requires one small Laravel backend addition

I confirmed thoroughly that no *existing* backend endpoint can both
recognize an existing account by phone and deliver over WhatsApp — the only
one that logs an existing customer in via phone+code (`verify-phone`) is
hardwired to SMS gateways in the backend's own code. Getting this to work
over WhatsApp instead needs one small new endpoint that trusts *our own*
WhatsApp OTP verification (the same trust model `registration-with-otp`
already uses — it trusts its caller verified the phone), extended to look
the user up first instead of always creating a new account.

Add this to `CustomerAuthController.php` (right after `registrationWithOTP()`):

```php
/**
 * Passwordless login/registration trusted from our own WhatsApp OTP system
 * (Next.js storefront + n8n). The phone has already been verified via a
 * WhatsApp OTP code outside this backend — this endpoint is protected by a
 * shared secret instead of re-verifying a code itself, the same trust model
 * registrationWithOTP() already uses. Unlike registrationWithOTP, this looks
 * the user up first — existing customers get a real token for their real
 * account, new ones get created — so it can never produce a duplicate.
 */
public function otpLogin(Request $request): JsonResponse
{
    if ($request->header('X-OTP-Internal-Secret') !== env('OTP_INTERNAL_SECRET')) {
        return response()->json(['errors' => [
            ['code' => 'auth', 'message' => 'Unauthorized.']
        ]], 401);
    }

    $validator = Validator::make($request->all(), [
        'phone' => 'required|string|max:15',
        'name' => 'nullable|string|max:255',
        'email' => 'nullable|email|max:255',
    ]);

    if ($validator->fails()) {
        return response()->json(['errors' => Helpers::error_processor($validator)], 403);
    }

    $user = $this->user->where(['phone' => $request['phone']])->first();

    if (isset($user)) {
        $user->is_phone_verified = 1;
        $user->save();

        $token = $user->createToken('RestaurantCustomerAuth')->accessToken;
        return response()->json(['token' => $token, 'is_new' => false], 200);
    }

    if (!$request->name) {
        return response()->json(['is_new' => true, 'needs_name' => true], 200);
    }

    $nameParts = explode(' ', $request->name, 2);

    $newUser = new User();
    $newUser->f_name = $nameParts[0];
    $newUser->l_name = $nameParts[1] ?? '';
    $newUser->email = $request->email;
    $newUser->phone = $request->phone;
    $newUser->password = bcrypt(rand(11111111, 99999999));
    $newUser->language_code = $request->header('X-localization') ?? 'en';
    $newUser->is_phone_verified = 1;
    $newUser->referral_code = Helpers::generate_referer_code();
    $newUser->login_medium = 'OTP';
    $newUser->save();

    $token = $newUser->createToken('RestaurantCustomerAuth')->accessToken;
    return response()->json(['token' => $token, 'is_new' => true], 200);
}
```

Route (`routes/api/v1/api.php`, next to `check-phone`/`verify-phone`):
```php
Route::post('otp-login', [CustomerAuthController::class, 'otpLogin']);
```

And add `OTP_INTERNAL_SECRET` (same value as in `.env.local` below) to the
Laravel server's own `.env`.

**Until that's deployed**, the app still behaves correctly: WhatsApp
sending and code verification work exactly as before — only the final
"log them in" step shows a clear "OTP login isn't set up on the backend
yet" message instead of silently failing or guessing.

### Setup required (I can't supply or test these — they're your infrastructure)

1. Copy `.env.local.example` to `.env.local`.
2. `OTP_SECRET` — any long random string (command to generate one is in the
   example file). Signs the OTP challenge tokens; nothing is stored in a
   database.
3. `N8N_WHATSAPP_OTP_WEBHOOK_URL` — your n8n webhook that takes
   `{ phone, otp, message }` (POSTed by `src/app/api/otp/send/route.ts`) and
   sends `message` to `phone` on WhatsApp. **Use the production URL**
   (`/webhook/...`), not the `/webhook-test/...` one — the test URL only
   listens once from inside the n8n editor and will stop working the moment
   you navigate away; activate the workflow to get the real, always-on URL.
   Optionally set `N8N_WEBHOOK_SECRET` too and check `X-Webhook-Secret` in
   the workflow, so the webhook URL alone can't be used to send arbitrary
   WhatsApp messages through your account.
4. `OTP_INTERNAL_SECRET` — a second, different long random string. Shared
   between this app and the Laravel backend's new `/auth/otp-login`
   endpoint (add the same value to the Laravel server's `.env`) — it's what
   lets that endpoint trust this app's WhatsApp verification instead of
   doing SMS verification itself.
5. Deploy the `otpLogin()` addition + route to the live Laravel backend.
6. Restart the dev/production server after editing `.env.local`.

Until `N8N_WHATSAPP_OTP_WEBHOOK_URL` is set, sending a code shows a clear
configuration error rather than failing silently. Until step 5 is deployed,
sending and verifying codes both work fully — only the final login/signup
step shows the graceful "not set up yet" message described above.

## Known limitations — need action on your end, not more code

- **Social login (Google/Facebook)** — removed from `/login`. The live
  store's own config has them switched off at the business-settings level
  (`customer_login.login_option.social_media_login: 0`), and they'd also
  need this deployment's domain authorized in the Google Cloud Console /
  Facebook Developer dashboard before they could work. If you turn them on
  in the admin panel later, they're straightforward to re-add.
- **Push notifications** — Firebase is not yet wired in, but the real web
  config exists in the Laravel repo's `firebase-messaging-sw.js`
  (project `almarwah-qatar`). Wiring it up needs a **VAPID key** from
  Firebase Console → Project Settings → Cloud Messaging → Web Push
  certificates, which isn't in either source repo.
- **Sadad (digital/card) payment** — there are actually TWO unrelated
  payment mechanisms in the backend's codebase, and an earlier version of
  this integration assumed the wrong one. The `reference` +
  `PendingDigitalPayment` + `POST /customer/order/confirm-digital` flow
  (`DigitalPaymentController::confirm()`) is for the **native mobile app's**
  in-SDK card charging — it doesn't apply here. A real, live test of the
  actual quote call (`POST /customer/payment-mobile` with
  `payment_method: "sadad"`) confirmed the real response is just
  `{"redirect_link": "https://admin.almarwah.qa/payment/sadad/pay?payment_id=<uuid>"}`
  — no `reference`, no `order_amount`. This is Laravel's older
  multi-gateway `Payment::generate_link()` mechanism: it opens a payment
  page hosted on the **backend's own domain**, which drives the real Sadad
  checkout, and — only once payment genuinely succeeds — creates the real
  order itself server-side, then redirects the browser back to `call_back`
  with `?flag=success` (or `flag=fail`) and a base64 `token` carrying the
  transaction reference. There is no client-side confirm step in this flow
  at all; `src/app/checkout/complete/page.tsx` just reads `flag`/`token`
  and reports the outcome — the order already exists (or doesn't) by the
  time the customer lands there.
  **Caveat**: the controller that actually serves `/payment/sadad/pay` and
  its return redirect lives in a separately-licensed "Gateways" module not
  present in the codebase available for this work, so the exact
  `flag`/`token` param names are inferred with high confidence from every
  sibling gateway sharing the same redirect helper (`Processor::
  payment_response()`), not confirmed from Sadad's own source. I verified
  the quote step for real (a harmless read: it only creates a
  `payment_requests` row, moves no money) and confirmed it now returns a
  usable `redirect_link` without throwing — but per this project's own
  ground rule I never completed a real payment myself to see the return
  redirect happen. **Please run one real (small) order through Sadad
  end-to-end** and check that the URL it lands you back on actually matches
  `?flag=success&token=...` as this code expects — if it doesn't, that
  callback page is the first place to adjust.
- **Brand colors** — match what's *currently live* on `shop.almarwah.qa`
  (gold `#C49A3C` / cream `#F8F4E9` / navy `#1A2942`). A rebrand to a dark
  green (`#1A3020`) exists in a newer Flutter source branch but isn't
  deployed yet — see `src/app/globals.css` for where to swap the palette
  when that ships.

## Security issue found during integration — please escalate

While wiring up orders/addresses, `GET /api/v1/customer/order/list` returned
a **complete real customer order — name, phone, home address, GPS
coordinates — with zero authentication token and zero parameters.**
This needs a fix on the Laravel backend (require the customer token or a
verified `guest_id` on `/customer/order/list`, `/customer/order/details`,
and I'd double-check `/customer/address/list` the same way) — independent of
this frontend project, and worth prioritizing since it's live customer PII.

Same class of issue: the backend's web route `order-invoice/{id}`
(`HomeController::orderInvoice`, `routes/web.php`) has **no auth and no
ownership check on sequential ids** — the route's own code comment
acknowledges it (any customer's name/phone/address/order can be viewed by
incrementing the number in the URL; it's rate-limited to 10/min but not
blocked). This storefront does **not** link to that route — the "View
Invoice" button on an order instead opens this app's own
`/order-invoice/[id]` page, which reuses `/customer/order/details` and is
therefore properly scoped to the logged-in customer's own orders. The
Flutter app still builds and opens the vulnerable URL directly
(`order_success_screen.dart:185`), so this is still live exposure on that
client and worth fixing the same way as the item above.

## Project structure

```
src/
  app/            Routes (App Router) — one folder per page
  components/     Shared UI (Header, Footer, ProductCard, etc.)
  lib/
    api.ts        All API calls — the only place that knows API endpoint shapes
    types.ts      TypeScript types mirroring real API responses
    sanitize.ts   Strips unsafe HTML from product descriptions (see comment —
                  found at least one product with garbled pasted HTML in its
                  description while testing; this is a defensive safeguard,
                  not just for that one row)
    store/        Zustand stores — cart.ts, auth.ts (both persisted to
                  localStorage), config.tsx (server-fetched store config,
                  provided via React context)
```
