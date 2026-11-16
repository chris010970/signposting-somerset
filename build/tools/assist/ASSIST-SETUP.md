# Signposting Somerset Assist: setup

Three parts:

- **The page**, `assist/index.html` in your GitHub repo. It will live at `https://chris010970.github.io/signposting-somerset/assist/`.
- **The relay**, a Cloudflare Worker. It holds your API key and access code, reads the live sheet and asks Claude.
- **An Anthropic API account**, which pays for the AI part.

Setup takes about 20 minutes.

---

## 1. Anthropic API key (console.anthropic.com)

1. Sign up or sign in at **console.anthropic.com**. This account is separate from your Claude subscription.
2. In **Billing**, add some prepaid credit. £10 is plenty for a demo.
3. **Set a monthly spend limit** in the console's limits settings, for example £10. It's the real safety net: if the code leaks, the worst case is that the demo stops for the month.
4. In **API keys**, choose **Create key** and name it `signposting-assist`. Copy the key now, because it's shown only once.

## 2. Cloudflare Worker (dash.cloudflare.com)

1. Sign up for free at **dash.cloudflare.com**.
2. Go to **Workers & Pages**, then **Create**, then **Create Worker** (start from "Hello World").
3. Name it `signposting-assist` and click **Deploy**.
4. Click **Edit code**. Delete everything in the editor, paste the whole of **cloudflare-worker.js**, then click **Deploy**.
5. Go back to the Worker and open **Settings**, then **Variables and Secrets**. Add these, then deploy or save:

| Name | Type | Value |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Secret** | the key from step 1 |
| `ACCESS_CODE` | **Secret** | a code you choose for testers, e.g. three random words |
| `SHEET_CSV_URL` | Text | your sheet's published CSV link (the one the main site uses) |
| `ALLOWED_ORIGIN` | Text | `https://chris010970.github.io` (exactly this, no slash at the end) |
| `MODEL` | Text (optional) | leave out to use `claude-sonnet-5-5`; use `claude-haiku-5-5` for cheaper and faster |

6. Copy the Worker's address from its overview page. It looks like `https://signposting-assist.<your-name>.workers.dev`.

## 3. The page (GitHub)

1. Send me the Worker address and I'll build `assist/index.html` with it filled in.
   Or do it yourself: open `assist/index.html`, find `const WORKER_URL = "";` and put the address between the quotes.
2. In your repo, choose **Add file**, then **Upload files**. Upload it so that it sits at `assist/index.html`. You can type `assist/` into the file name box to create the folder.
3. After a minute or so, open `https://chris010970.github.io/signposting-somerset/assist/`, enter your access code and try a scenario.

The main site doesn't link to this page, and it asks search engines not to list it.

---

## How it stays safe

- **The API key never reaches the browser.** It stays in Cloudflare.
- **Only your page can use the relay**, and only with the access code. Each visitor gets 30 requests an hour. That limit is best effort, so the spend limit is the real backstop.
- **The relay won't run arbitrary questions.** It builds the prompt itself from the sheet, so it can't be used as a free general chatbot.
- **Nothing that's typed is stored or logged by the relay.** Text goes to Anthropic to produce the answer, and the page tells users not to include identifying details.
- **Every fact on a card comes from the sheet.** The AI only chooses records and explains why, and any ID it returns that isn't on the list is thrown away.

**To change the access code**, edit `ACCESS_CODE` in Cloudflare. Anyone using the old code will be asked for the new one.
**To switch it off**, delete the Worker, or disable the API key in the Anthropic console.

## If something goes wrong

- **"That access code wasn't accepted"**: check `ACCESS_CODE` in Cloudflare. Codes are case-sensitive.
- **"This page isn't allowed to use the relay"**: check `ALLOWED_ORIGIN`. It must exactly match `https://chris010970.github.io`.
- **"The records couldn't be loaded"**: check `SHEET_CSV_URL`. It's the same link as `sheet_url.txt`.
- **"Something went wrong"** every time: in Cloudflare, open the Worker and look at **Logs**. An `ai_error` usually means the API key or `MODEL` is wrong, or there's no credit left.
- **An occasional "exceeded CPU" error**: the free plan allows about 10 ms of processing per request. Normal requests take 2–3 ms, but the first request after a quiet spell reads the whole sheet and takes longer. Trying again works. If it becomes a nuisance, Cloudflare's $5/month plan removes the limit.
