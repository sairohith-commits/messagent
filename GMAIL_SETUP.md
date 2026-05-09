# Gmail Integration Setup — Messagent

This guide walks you through everything you need to do in Google Cloud Console to connect Gmail.
Follow the steps in order. Each section tells you exactly which menus to click and what to copy into your `.env`.

---

## Prerequisites

- You already have a Google Cloud project named **messagent**
- Your backend is running locally on port **4000** (`npm run dev`)
- Your `.env` file exists at `backend/.env`

---

## Step 1 — Enable the Gmail API

**Google Cloud Console → APIs & Services → Library**

1. In the search box, type `Gmail API`
2. Click the **Gmail API** result (published by Google)
3. Click the blue **Enable** button
4. Wait for the confirmation screen — you should see "API enabled" or the Disable button appear

---

## Step 2 — Enable the Cloud Pub/Sub API

**Google Cloud Console → APIs & Services → Library**

1. In the search box, type `Cloud Pub/Sub API`
2. Click the **Cloud Pub/Sub API** result
3. Click the blue **Enable** button
4. Wait for confirmation

---

## Step 3 — Configure the OAuth Consent Screen

**Google Cloud Console → APIs & Services → OAuth consent screen**

1. **User Type** — select **External**, click **Create**

2. Fill in the **App information** section:
   - **App name**: `Messagent`
   - **User support email**: your Gmail address
   - **App logo**: skip for now

3. **Developer contact information**:
   - Enter your email address

4. Click **Save and Continue**

5. On the **Scopes** page:
   - Click **Add or Remove Scopes**
   - In the filter box, type `gmail`
   - Check these two scopes:
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.send`
   - Click **Update**, then **Save and Continue**

6. On the **Test users** page:
   - Click **+ Add Users**
   - Enter your Gmail address (the one you'll use for testing)
   - Click **Add**, then **Save and Continue**

7. Review the summary and click **Back to Dashboard**

---

## Step 4 — Create OAuth 2.0 Credentials

**Google Cloud Console → APIs & Services → Credentials**

1. Click **+ Create Credentials** → **OAuth client ID**

2. **Application type**: select **Web application**

3. **Name**: type `Messagent Web Client`

4. Under **Authorized redirect URIs**, click **+ Add URI** and add:
   ```
   http://localhost:4000/gmail/callback
   ```
   > This is your local backend. For staging/production, add those URIs here later.

5. Click **Create**

6. A dialog appears showing **Your client credentials**:
   - Copy the **Client ID** — it looks like: `123456789-abc...apps.googleusercontent.com`
   - Copy the **Client secret** — it looks like: `GOCSPX-...`

7. Click **OK** to dismiss the dialog

8. Open `backend/.env` and add:
   ```
   GMAIL_CLIENT_ID=<paste Client ID here>
   GMAIL_CLIENT_SECRET=<paste Client secret here>
   GMAIL_REDIRECT_URI=http://localhost:4000/gmail/callback
   ```

---

## Step 5 — Create a Pub/Sub Topic

**Google Cloud Console → Pub/Sub → Topics**

1. Click **+ Create Topic**

2. **Topic ID**: type `gmail-watch`
   > The full topic name will be: `projects/YOUR_PROJECT_ID/topics/gmail-watch`

3. Leave **Add a default subscription** unchecked

4. Click **Create**

5. Find your **Project ID**:
   - Click the project selector dropdown at the top of the page (next to "Google Cloud")
   - Your project ID is shown under the project name — it looks like `messagent-123456`

6. Open `backend/.env` and add:
   ```
   GMAIL_PUBSUB_TOPIC=projects/<your-project-id>/topics/gmail-watch
   ```
   Example: `GMAIL_PUBSUB_TOPIC=projects/messagent-123456/topics/gmail-watch`

---

## Step 6 — Grant Gmail Permission to Publish to the Topic

Gmail needs permission to push notifications to your Pub/Sub topic.

**Google Cloud Console → Pub/Sub → Topics → gmail-watch**

1. Click on the **gmail-watch** topic name to open it

2. Click the **Permissions** tab (top right area of the topic detail page)

3. Click **+ Grant Access**

4. In the **New principals** box, paste exactly:
   ```
   gmail-api-push@system.gserviceaccount.com
   ```

5. In the **Role** dropdown, select:
   **Pub/Sub → Pub/Sub Publisher**

6. Click **Save**

---

## Step 7 — Create a Push Subscription

**Google Cloud Console → Pub/Sub → Subscriptions**

1. Click **+ Create Subscription**

2. **Subscription ID**: type `gmail-watch-push`

3. **Select a Cloud Pub/Sub topic**: choose `projects/<your-project-id>/topics/gmail-watch`

4. **Delivery type**: select **Push**

5. **Endpoint URL**: this must be a publicly reachable HTTPS URL
   - **For local development with ngrok** (see Step 8):
     ```
     https://<your-ngrok-subdomain>.ngrok-free.app/gmail/webhook
     ```
   - **For staging/production**:
     ```
     https://api.yourdomain.com/gmail/webhook
     ```

6. Check **Enable authentication** — leave it off for local dev (ngrok handles the tunnel)

7. **Acknowledgement deadline**: `60` seconds

8. Click **Create**

---

## Step 8 — Set Up ngrok for Local Webhook Testing

Google's Pub/Sub cannot push to `localhost`. Use ngrok to expose your local backend.

### Install ngrok

Download from [ngrok.com/download](https://ngrok.com/download) or:
```bash
choco install ngrok        # Windows with Chocolatey
# — or —
winget install ngrok.ngrok  # Windows with winget
```

### Start ngrok

```bash
ngrok http 4000
```

You'll see output like:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:4000
```

### Update your Pub/Sub subscription

1. Copy the `https://...ngrok-free.app` URL
2. **Google Cloud Console → Pub/Sub → Subscriptions → gmail-watch-push → Edit**
3. Update the **Endpoint URL** to: `https://abc123.ngrok-free.app/gmail/webhook`
4. Click **Update**

> **Note:** Your ngrok URL changes each time you restart ngrok (on the free plan).
> Update the Pub/Sub subscription endpoint whenever it changes.

### Set the webhook verify token

Open `backend/.env` and add:
```
GMAIL_PUBSUB_VERIFY_TOKEN=local_dev_webhook_secret_change_me
```

This token is sent with every Pub/Sub push message and verified by `POST /gmail/webhook`
via the `x-goog-channel-token` header. Use any random string for local dev; use a long
random secret in production.

---

## Step 9 — Final .env Checklist

Open `backend/.env` and verify all Gmail-related vars are set:

```
# Gmail OAuth
GMAIL_CLIENT_ID=123456789-abc...apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-...
GMAIL_REDIRECT_URI=http://localhost:4000/gmail/callback

# Gmail Pub/Sub
GMAIL_PUBSUB_TOPIC=projects/messagent-123456/topics/gmail-watch
GMAIL_PUBSUB_VERIFY_TOKEN=local_dev_webhook_secret_change_me
```

Then run the connection test to verify the credentials are valid:

```bash
cd backend
node scripts/testConnections.js
```

You should see:
```
✅ PASS  Gmail OAuth  — client initialised  client_id=123456789-abc...
```

---

## Step 10 — Authorize Your Gmail Account

With the backend running (`npm run dev`), test the full OAuth flow:

```bash
cd backend
node scripts/testGmail.js
```

This will:
1. Print a Google OAuth authorization URL
2. Tell you to open it in your browser
3. After you approve, Google redirects to `http://localhost:4000/gmail/callback`
4. The backend exchanges the code for tokens and stores them

The script prints the URL you need to visit. Copy it into your browser.

---

## Troubleshooting

### "redirect_uri_mismatch" error from Google
- The redirect URI in your OAuth request does not match what's registered in Google Cloud Console
- Check `GMAIL_REDIRECT_URI` in `.env` — must be exactly `http://localhost:4000/gmail/callback`
- Check **APIs & Services → Credentials → your OAuth client** — the same URI must be in Authorized redirect URIs

### "Access blocked: This app's request is invalid"
- The OAuth consent screen is not fully configured
- Go to **APIs & Services → OAuth consent screen** and complete all required fields
- Make sure your test email address is in the **Test users** list

### "The caller does not have permission" on Pub/Sub
- The `gmail-api-push@system.gserviceaccount.com` service account is not a publisher on your topic
- Redo Step 6 — make sure you grant the **Pub/Sub Publisher** role, not just Viewer

### Webhook not receiving messages
- ngrok URL has changed — update the Pub/Sub subscription endpoint (Step 8)
- The subscription endpoint must be HTTPS, not HTTP
- Check that `GMAIL_PUBSUB_VERIFY_TOKEN` in `.env` matches what you set in the Pub/Sub subscription

### "Gmail API has not been used in project" error
- You skipped Step 1 — enable the Gmail API first

### OAuth tokens not saving after callback
- Check the `users` table has a `gmail_access_token` column — run `npx supabase db reset` to apply all migrations
- Check the backend logs for errors after the redirect

---

## Production Notes

When you deploy to staging or production:

1. Add your production domain to **Authorized redirect URIs** in the OAuth client:
   ```
   https://api.yourdomain.com/gmail/callback
   ```

2. Update `GMAIL_REDIRECT_URI` in your production `.env` to match

3. Update the Pub/Sub push subscription endpoint to your production webhook URL:
   ```
   https://api.yourdomain.com/gmail/webhook
   ```

4. If you want users outside your test list to connect Gmail, submit your app for **Google OAuth verification**:
   - **APIs & Services → OAuth consent screen → Publish App**
   - You'll need a privacy policy URL and may need domain verification

5. Use a strong random string for `GMAIL_PUBSUB_VERIFY_TOKEN` in production (32+ characters)
