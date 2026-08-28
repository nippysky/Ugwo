# NIPPYSKY Launch Week — LinkedIn Content Calendar

**Goal:** Tell the real build story of Ụgwọ and Akù across one week, split between your personal profile (linkedin.com/in/nippysky) and the NIPPYSKY company page — timed to also work as a technical portfolio piece for remote roles/gigs.

**Why spread it over a week, not post everything today:** LinkedIn's algorithm gives each post its own ~24–48hr engagement window. Five posts today cannibalize each other and read as a dump; one a day (ish) means your network sees you five separate times this week, which compounds reach and signals sustained, serious work — much stronger for recruiters scanning your activity than a single day's dump.

**Best posting times (general LinkedIn benchmark):** Tue–Thu, 8–10am or 12–1pm your local time, get the strongest reach. Avoid Fri afternoon / weekend for the text-heavy technical posts — save Saturday for the lighter visual one.

Post to your personal profile first each day, then re-share/cross-post to the NIPPYSKY page an hour or two later where noted — gives two touchpoints instead of one.

---

## Day 1 (Monday) — PERSONAL: The reveal

**Post copy:**

For the past several months I've been quietly building something outside my day-to-day work: two companion fintech apps, built solo, from architecture to app store submission.

𝗨̣𝗴𝘄𝗼̣ (Igbo for "debt/obligation") — a private debt and IOU tracker. Log who owes you, what you owe, get reminders, settle up — without the awkwardness of a spreadsheet or a WhatsApp thread you'll lose track of.

𝗔𝗸𝘂̀ (Igbo for "wealth") — a personal finance tracker for everyday expenses, bills, income, and savings goals.

Both are end-to-end encrypted — the server never sees your actual financial data, only ciphertext. Both sync in real time across every device you own. And they talk to each other: log a debt in Ụgwọ, optionally mirror it into Akù as an expense or income entry, so your full financial picture stays in one place without double entry.

Both are under my company, NIPPYSKY, and both are now in closed testing — Ụgwọ on TestFlight and Google Play, Akù already a step ahead in the same pipeline.

This week I'm going to share the real build — the architecture decisions, the bugs that taught me something, the 2am App Store Connect debugging sessions — not just the shiny result. If you're into fintech, mobile engineering, or just like watching something get built in public, follow along.

NIPPYSKY page: [link] — follow for the product side of this.

#buildinpublic #fintech #reactnative #mobiledev #NIPPYSKY

---

**Company page copy (post ~2hrs later, shorter):**

Introducing NIPPYSKY's first two products: Ụgwọ and Akù.

Ụgwọ helps you track debts and IOUs — who owes you, what you owe, reminders included.
Akù helps you track everyday spending, bills, income, and savings goals.

Both end-to-end encrypted. Both sync in real time across devices. Both able to work together, so debt activity can optionally flow into your Akù financial picture automatically.

Currently in closed testing on iOS and Android. Follow this page for updates as we head toward public launch.

#NIPPYSKY #fintech #privacybydesign

---

## Day 2 (Wednesday) — PERSONAL: Technical deep dive — encryption

**Post copy:**

A design decision I didn't compromise on for Ụgwọ and Akù: the server should never be able to read your financial data. Not "we promise not to look" — architecturally incapable of it.

Here's how that actually works:

Every user gets a Data Encryption Key (DEK) generated on-device. All ledger data — debts, repayments, expenses, income, goals — gets encrypted client-side with AES-256-GCM before it ever leaves the phone. What hits the server is base64(iv + ciphertext + tag). That's it. That's all the server ever stores.

The DEK itself needs to survive a reinstall or a new device, so it's escrowed server-side too — but encrypted again, this time with a server master key, and only ever decrypted back to plaintext for the authenticated owner, over TLS, on request. The server can technically decrypt the DEK, but it has no use for it without also having your data — and your data is never there in readable form.

This made a few things harder than they'd otherwise be:
→ Building demo accounts for App Store/Play Store reviewers meant I couldn't just seed rows into Postgres — I had to seed data through the actual client app logic, so it got encrypted exactly the way real user data does.
→ Search and conflict resolution across devices has to happen without the server ever inspecting the payload — last-write-wins on a client-side timestamp, purely metadata-driven.

Trade-off accepted: it's more engineering work than "just store it in Postgres." But for an app that holds people's actual debt and spending data, "we architecturally cannot read your ledger" is worth more than any feature I could have shipped instead.

#encryption #systemdesign #fintech #reactnative

---

## Day 3 (Thursday) — COMPANY: Feature spotlight — Connect Akù

**Post copy:**

One of the features we're proudest of in NIPPYSKY's app pair: Connect Akù.

If you use both Ụgwọ and Akù, you can link them — one-time, fully opt-in. From then on, when you log a debt or repayment in Ụgwọ, it can automatically mirror into Akù as an expense or income entry, filed under its own Loans category.

Why it matters: money you lend or borrow is still money moving. Without this, you'd log it once in Ụgwọ to track the debt, then log it again in Akù to see your real spending picture — or skip the second entry and let your finance tracker quietly go out of sync with reality.

Connect Akù closes that gap. One entry, both pictures stay accurate. Entirely one-way, fully reversible, and every entry is deduplicated so reconnecting or restoring on a new device never double-counts.

Currently in testing — public rollout coming as both apps head toward launch.

#NIPPYSKY #producdesign #fintech

---

## Day 4 (Friday) — PERSONAL: The war story

**Post copy:**

A bug report from my own testing this week, and the lesson underneath it — the kind of thing that doesn't show up in a portfolio screenshot but is most of what engineering actually is.

Ụgwọ supports signing into the same account on multiple devices — phone stays in sync everywhere, which matters a lot for something tracking real debts. I connected Akù (see Connect Akù) on my Android, then signed into the same Ụgwọ account on iOS. The iOS device showed "not connected" — like the link never happened.

Not a data bug — I traced it first and confirmed the actual dedup logic (each mirrored entry is tagged and checked before ever mirroring twice) meant no duplicate data was possible regardless. But it's exactly the kind of bug that erodes trust fast: a user doing the right thing (checking their setup on a new device) and getting told something false.

Root cause: the connection state lived only in that one device's local secure storage — never synced, never known to the server. Classic "worked on my machine (device)" trap.

Fix: three new fields on the user's own account record (linked email, when, and a one-time-offer flag) — synced the same way currency preference already was. First-write-wins on the timestamp so reconnecting from another device never overwrites the true original connection date. Now every device signed into an account sees the same link state, instantly.

The deeper lesson: "per-device" and "per-account" look identical until you actually test on two devices. I test on two now, always, for anything involving state that should feel like "mine," not "this phone's."

#softwareengineering #debugging #distributedsystems #buildinpublic

---

## Day 5 (Saturday) — COMPANY: Visual showcase

**Post copy:**

A look at Ụgwọ and Akù — same design language, two different jobs.

[Attach: Ụgwọ home screen + person ledger screenshots, Akù home screen + expense screenshots — use the phone mockups already built for the Play Store listing]

Ụgwọ: track who owes you, what you owe, and settle up without the spreadsheet.
Akù: track everyday spending, bills, income, and savings goals.

Both in closed testing now. Full launch details coming soon — follow along.

#NIPPYSKY #uidesign #fintech #mobileapp

---

## Day 6 (Sunday) — PERSONAL: Reflection + the ask

**Post copy:**

Closing out a week of sharing the build behind Ụgwọ and Akù with a reflection, because the technical wins are only half of what this stretch actually taught me.

Building two production apps solo — architecture through App Store/Play Store submission — means being the backend engineer, the mobile engineer, the designer, the copywriter, and the release manager, often in the same afternoon. A few things that stuck:

→ The unglamorous 80%: not the features, but the App Store Connect metadata, the Play Console data-safety forms, the CocoaPods dependency hell on a fresh prebuild, the store screenshots. Ship-readiness is mostly this.
→ Constraints are useful, not just annoying. Deciding the server should never see plaintext financial data made some things (demo accounts, search) harder — and made the product something I'd actually trust with my own money.
→ Test on two devices, always, for anything account-level. (See Friday's post.)

Both apps are in closed testing now, heading toward public launch. If you want to be one of the first testers, or you're just curious, send me a message — happy to add you.

And since a few people have asked: yes, I'm open to remote frontend/full-stack and mobile engineering roles and contract work. If Ụgwọ and Akù are a useful signal of how I think about architecture, security, and shipping real products end-to-end, let's talk — DMs open.

Thank you to everyone who followed along this week.

#opentowork #remotejobs #reactnative #fintech #NIPPYSKY

---

## Notes on execution

- **Bold Igbo characters** (𝗨̣𝗴𝘄𝗼̣, 𝗔𝗸𝘂̀) in Day 1 use Unicode bold — LinkedIn doesn't support real bold text, this is the common workaround. If they don't render properly when you paste, just use plain "Ụgwọ" and "Akù" instead — not worth fighting formatting over.
- Swap in real screenshots/screen recordings on every post — LinkedIn's algorithm favors media, and you already have the Play Store screenshot assets built (in `store-assets/delivery/`) that work perfectly here.
- Days 1, 4, and 6 are the highest-value posts for job-seeking (story, technical depth, explicit ask) — don't skip those even if you trim others.
- If you get real beta testers from the Day 6 ask, that's worth its own short follow-up post the following week ("X people testing, here's what they're saying") — good excuse for a second wave.
- Replace `[link]` placeholders once you have public landing pages ready to share (ugwo.nippysky.com / aku.nippysky.com already exist per your setup).
