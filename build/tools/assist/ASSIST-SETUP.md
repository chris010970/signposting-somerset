# Assist: setup and updates

Assist is the **Assist** tab on the tools page (`/tools/`). It has three parts:

- **The page**, built with the rest of the site (`build/tools/`). It knows the relay's address from `worker_url.txt` in this folder.
- **The relay**, a Cloudflare Worker named `signposting-assist`. It holds the API key and the access code, reads the live sheet and asks Claude.
  It's one standalone file, `src/cloudflare-worker.js` in the repo, built from `worker-template.js` (here) with the site's shared code (`build/core/`) and
  `scrub.js` put in. Nothing is loaded from the site while it runs.
- **An Anthropic API account**, which pays for the AI part.

## Updating the relay (the usual job)

After any change to `worker-template.js`, `scrub.js` or `build/core/` (the schedule rules, the sheet reading, the support types...):

1. Rebuild it: `python build/tools/assist/build_worker.py` (the tests fail until you do, so a stale relay can't slip through).
2. Commit it with the change. In Cloudflare, open **Workers & Pages → signposting-assist**, choose **Edit code**, replace
   everything with the new `src/cloudflare-worker.js`, and choose **Deploy**.
3. Open the tools page's **About** tab: the version line ends with the relay's build time (`Assist relay 2026-11-16 20:34`).

To go back, paste the previous `src/cloudflare-worker.js` (from the repo's history) and deploy. Nothing else in Cloudflare changes.

---

## Setting it up from scratch (about 20 minutes)

### 1. Anthropic API key (console.anthropic.com)

1. Sign up or sign in at **console.anthropic.com**. This account is separate from a Claude subscription.
2. In **Billing**, add some prepaid credit.
3. **Set a monthly spend limit** in the console's limits settings. It's the real safety net: if the code leaks, the worst case is
   that Assist stops for the rest of the month.
4. In **API keys**, choose **Create key**, name it `signposting-assist` and copy it (it's shown only once).

### 2. The Cloudflare Worker (dash.cloudflare.com)

1. Sign up for free at **dash.cloudflare.com**.
2. Go to **Workers & Pages → Create → Create Worker**, name it `signposting-assist` and **Deploy**.
3. Choose **Edit code**, replace everything with `src/cloudflare-worker.js` (build it first, as above), and **Deploy**.
4. In the Worker's **Settings → Variables and Secrets**, add:

| Name | Type | Value |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Secret** | the key from step 1 |
| `ACCESS_CODE` | **Secret** | a code you choose for invited workers, e.g. three random words |
| `SHEET_CSV_URL` | Text | the sheet's published CSV link (the same as `build/directory/sheet_url.txt`) |
| `ALLOWED_ORIGIN` | Text | the site's address, without a slash at the end; several separated by commas, e.g. `https://signpostingsomerset.org.uk,https://chris010970.github.io` |
| `MODEL` | Text (optional) | leave out to use `claude-sonnet-5-5`; `claude-haiku-5-5` is cheaper and faster |
| `MODEL_TAGS` | Text (optional) | the landing page's tags task (`.../tags`): set to `claude-haiku-5-5`. Try it with `python src\run_tags.py`. The tags task is open to all (no access code), with at most `daily_cap` answers a day (`tags.json`) |
| `EFFORT` | Text (optional) | `low`, `medium` or `high`: trades thinking time for speed. Leave out for the model's default |

5. Copy the Worker's address from its overview page (`https://signposting-assist.<your-name>.workers.dev`).

### 3. Connect the page

1. Put the Worker's address in `build/tools/assist/worker_url.txt`.
2. Rebuild the site (`python build/build_all.py`) and publish as usual.
3. Open the tools page, choose **Assist**, enter the access code and try a scenario.

When the site moves to its own domain, make sure `ALLOWED_ORIGIN` includes `https://signpostingsomerset.org.uk`.

---

## How it stays safe

- **The API key never reaches the browser.** It stays in Cloudflare.
- **Only the site can use the relay**, and only with the access code. Wrong codes and requests are limited per visitor
  (best effort: the counts reset when Cloudflare restarts the Worker), so the spend limit is the real backstop.
- **It isn't a general chatbot.** The relay builds the prompt itself from the sheet, and anything that isn't a description of
  someone's situation is turned away.
- **Personal details are removed before anything is sent** (`scrub.js`, on the page and again in the relay before an online search).
  Nothing typed is stored or logged by the relay; text goes to Anthropic only to produce the answer.
- **Every fact on a card comes from the sheet.** The AI only chooses records and says why; an ID that wasn't offered is dropped.
- **Online finds are checked in code**: each must come from a page the search returned, mobiles and personal email addresses are
  removed, safe-space addresses are never shown, and they are marked *Found online, not checked*.

The tests (`build/tests/worker.test.mjs`) run the built relay as Cloudflare would, with stand-ins for the sheet and the AI service.

**To change the access code**, edit `ACCESS_CODE` in Cloudflare; anyone using the old one is asked for the new one.
**To switch Assist off**, delete the Worker, or disable the API key in the Anthropic console.

## If something goes wrong

- **"That access code wasn't accepted"**: check `ACCESS_CODE` in Cloudflare (codes are case-sensitive).
- **"This page isn't allowed to use the relay"**: check `ALLOWED_ORIGIN` exactly matches the site's address.
- **"The records couldn't be loaded"**: check `SHEET_CSV_URL`.
- **"The AI service returned an error"** every time: in Cloudflare, open the Worker's **Logs**. Usually the API key or `MODEL`
  is wrong, or there's no credit left.
- **An occasional "exceeded CPU" error**: the free plan allows about 10 ms of processing per request; the first request after a
  quiet spell reads the whole sheet and takes longer. Trying again works; Cloudflare's paid plan removes the limit.
