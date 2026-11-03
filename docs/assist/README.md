# Signposting Somerset Assist

**AI-assisted support planning for support workers and volunteers.**

Describe what someone is going through, and get a short support plan of local services, in a sensible order, each with a reason it might help. Every service comes from the checked [Signposting Somerset](https://chris010970.github.io/signposting-somerset/) directory.

👉 **https://chris010970.github.io/signposting-somerset/assist/** (access code required)

> **Demo.** This is an experiment, not a service. Services change, and the worker always makes the final decision. Please confirm with the service before anyone goes.

---

## Why it exists

Finding local support is only half the job. The other half is judgement:
- someone who can barely get out of bed needs a phone call or a small drop-in before a walking group;
- an exhausted dementia carer needs things they can go to *with* their husband;
- someone anxious about groups may need an online session with cameras off first.

Experienced signposters do this in their heads. A directory, however good, just gives you a list.

Assist adds that judgement to the checked directory:

| | Who does it |
|---|---|
| **The facts:** what's on, where, when, who it's for, how to join | The checked directory |
| **The reasoning:** what suits this person, and in what order | AI |
| **The decision** | The support worker |

## What it does

1. **Describe the need, not the person.** For example: *"Low mood for months, lives alone, finds it hard to get out of bed, has stopped seeing friends."* Then choose a town and a distance, and whether to include phone and online support.
2. **Get a support plan, as a ladder of steps:**
   - **First step:** the easiest thing to do this week.
   - **Next step:** once that feels possible.
   - **When ready:** something more involved.

   Each suggestion shows a short reason specific to the person, plus the key facts: when it runs, how far away, how to join and the cost. Tap a suggestion for full details: address, map link, who it's for and when it was last checked. Phone numbers and websites are one tap away.
3. **Refine it.** Type *"he won't do groups"*, or tap *No groups*, *Weekends only*, *Free only*, *Nearer to home*, *Start from home* or *Something for a carer too*. The plan updates.
4. **Hand it over.** The **Support plan** panel shows exactly what the person will receive:
   - **Copy plan** pastes a friendly summary, with links, into an email, letter or text.
   - **Share** opens the phone's share menu.
   - **Print** gives a clean page to hand over.

   Every plan ends with how to get urgent help.

It also says what the directory **doesn't** cover nearby (for example *"no local bereavement group within 8 miles"*) and suggests a couple of questions the worker could ask next.

## How it keeps people safe

- **It can't invent services.** The AI can only choose from records it's given. Anything else it returns is thrown away, and every fact on screen comes from the checked record, not the AI.
- **Crisis comes first.** If the description mentions suicide, self-harm or immediate risk, crisis contacts (999, NHS 111 option 2, Samaritans, Mindline) appear straight away, before any suggestions.
- **A person decides.** Assist suggests and explains. It never refers, books or contacts anyone.
- **Sensitive venues stay private.** Services such as Crisis Safe Spaces show the town only, as on the main site.
- **Crisis bar and Quick exit** are on every screen, as on the main site.

## Privacy

- **Describe the need, not the person.** No names, dates of birth, addresses or anything that could identify someone.
- What's typed is sent to an AI service (Anthropic's Claude) to produce the suggestions. **It isn't stored or logged by this site.**
- Access is limited to invited support workers and volunteers, with an access code.

## How it works

```
Assist page (GitHub Pages)  →  small relay (Cloudflare Worker)  →  Claude
                                 │ checks the access code
                                 │ reads the live Signposting Somerset sheet
                                 │ keeps services within reach (distance, phone and online)
                                 └ returns the chosen records and Claude's reasons
```

- **The page** is a single web page on GitHub Pages, designed to match the main site.
- **The relay** is a small program on Cloudflare's free plan. It holds the AI key, so the key is never visible in the page. It limits how often it can be used, and it only does this one signposting task, so it can't be used as a general chatbot.
- **The records** come from the same live Google Sheet as the main site, so an update appears in both.
- **Running costs:** hosting is free. The AI costs a few pence per search, with a monthly spending cap.

## Limitations

- **It's only as good as the records.** A wrong time in the sheet becomes a confident wrong suggestion, so keeping records checked matters even more here.
- **It only knows what's in the directory,** currently around 360 Somerset services. The "Not covered" note helps show where the gaps are.
- **It isn't clinical advice** and doesn't assess risk. It's a signposting aid for people who already support others.
- **It hasn't yet been tested with real users.** The next step is feedback from support workers and volunteers.
- **Organisations using it** should check it against their own data protection and safeguarding policies.

## Feedback

Tried it? Found a suggestion that didn't make sense, or a service that's missing? Please use the [**Suggest a change**](https://docs.google.com/forms/d/e/1FAIpQLSf8NCl7EpGkgKNACUMDJEFzToJnoQp_xs7Fj0E9z4o2pLiqOQ/viewform) form, or contact the maintainer.

---

*Part of [Signposting Somerset](https://chris010970.github.io/signposting-somerset/), which started from a Padlet of local services created by colleagues at a Somerset mental health charity.*
