import { useState, useMemo, useRef, useEffect } from "react";
import { loadProjects, persistProject, db } from "./lib/db.js";
import { supabase } from "./lib/supabase.js";
import SortableList from "./lib/SortableList.jsx";

// ---------- Nebu brand palette ----------
// Premium tech-marketing identity: graphite base, warm platinum text,
// luminous copper as the single signature accent, steel for structure.
// Copper instead of the usual SaaS violet/green: warm, confident, memorable.
const PALETTE = {
  graphite: "#0D0F13", panelDark: "#15181F", copper: "#D98A5F", copperDeep: "#B85C34",
  platinum: "#ECEAE4", steel: "#8B94A6", porcelain: "#F5F4F0",
};

const THEMES = {
  dark: {
    bg: "#0D0F13", panel: "#15181F", ink: "#ECEAE4", inkSoft: "#8B94A6",
    line: "#23272F", accent: "#D98A5F", accentSoft: "#2A211B",
    sidebar: "#0A0C0F", sidebarText: "#ECEAE4", brandDot: "#D98A5F",
    inputBg: "#0D0F13",
  },
  light: {
    bg: "#F5F4F0", panel: "#FFFFFF", ink: "#16181D", inkSoft: "#6B7280",
    line: "#E5E3DC", accent: "#B85C34", accentSoft: "#F6EAE2",
    sidebar: "#0D0F13", sidebarText: "#ECEAE4", brandDot: "#D98A5F",
    inputBg: "#FFFFFF",
  },
};

const statusFor = (T, dark) => ({
  todo:    { label: "To do",       color: T.inkSoft, bg: dark ? "#1C2027" : "#EDECE6" },
  doing:   { label: "In progress", color: dark ? "#D98A5F" : "#B85C34", bg: dark ? "#2A211B" : "#F6EAE2" },
  review:  { label: "In review",   color: dark ? "#9BB0D4" : "#4A6398", bg: dark ? "#1C2433" : "#E8EDF6" },
  done:    { label: "Done",        color: dark ? "#9CC4A8" : "#3E7050", bg: dark ? "#1B2A20" : "#E6F0E9" },
  blocked: { label: "Blocked",     color: dark ? "#E2918B" : "#A8453C", bg: dark ? "#2E1D1B" : "#F7E6E4" },
});

const urgencyFor = (T, dark) => ({
  none:   { label: "No urgency", color: T.inkSoft, bg: "transparent", border: T.line },
  low:    { label: "Low",    color: dark ? "#9BB0D4" : "#4A6398", bg: dark ? "#1C2433" : "#E8EDF6", border: "transparent" },
  high:   { label: "High",   color: dark ? "#D98A5F" : "#B85C34", bg: dark ? "#2A211B" : "#F6EAE2", border: "transparent" },
  urgent: { label: "Urgent", color: dark ? "#0D0F13" : "#FFFFFF", bg: dark ? "#E2918B" : "#A8453C", border: "transparent" },
});
const URGENCY_ORDER = ["none", "low", "high", "urgent"];
const STATUS_ORDER = ["todo", "doing", "review", "done", "blocked"];

const uid = () => (crypto?.randomUUID ? crypto.randomUUID() :
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  }));

// ---------- Stage templates ----------
// Creating a stage from a template pre-populates its tasks. Every technical
// setup task is immediately followed by its corresponding testing task.
// Add new templates here as the agency's processes get standardized.
const STAGE_TEMPLATES = {
  landing_page: {
    name: "Landing Page",
    tasks: [
      { title: "Configure domain & DNS records (A/CNAME)", note: "Point the domain to hosting; include www redirect",
        guide: "1. In the hosting platform, find the required DNS values (an IP for an A record, or a target like xyz.netlify.app for a CNAME). 2. Open the domain registrar (e.g. Registro.br, GoDaddy) and go to DNS management. 3. Create an A record on @ pointing to the IP, or a CNAME as instructed. 4. Add a CNAME on www pointing to the root domain. 5. DNS can take up to 48h to propagate, but usually under 1h \u2014 check progress at dnschecker.org." },
      { title: "Test: domain resolves with valid SSL", note: "Check https on desktop and mobile, no certificate warnings",
        guide: "1. Open https://yourdomain.com in a normal window and in incognito. 2. Confirm the padlock icon appears with no certificate warning. 3. Test http:// and www. variants \u2014 both must redirect to the canonical https version. 4. Repeat on a phone using mobile data (not Wi-Fi) to rule out local DNS cache. If SSL fails, the hosting panel usually has a one-click certificate (Let's Encrypt) \u2014 it only works after DNS has propagated." },
      { title: "Publish landing page on hosting", note: "",
        guide: "1. Connect the page builder or upload the files to the hosting platform. 2. Set the custom domain in the hosting settings so it serves on the client's domain, not a temporary URL. 3. Remove any 'coming soon' or staging password protection. 4. Confirm the final URL the ads will use \u2014 that exact URL is what gets tagged and tested in the next steps." },
      { title: "Test: page loads correctly on desktop & mobile", note: "Check layout, speed, and all links/buttons",
        guide: "1. Open the page on a real phone and a desktop browser. 2. Click every button and link \u2014 especially the main CTA and WhatsApp links. 3. Run the URL through PageSpeed Insights; aim for mobile performance above ~60 before sending paid traffic. 4. Check that images load and no section breaks on small screens." },
      { title: "Create GTM container & install snippet on the page", note: "Snippet in <head> and <body> per GTM instructions",
        guide: "1. Go to tagmanager.google.com and create a container of type Web for the client's domain. 2. GTM shows two snippets: paste the first as high as possible inside <head>, and the second right after the opening <body> tag. 3. In most page builders this lives under Settings > Custom Code / Tracking. 4. Publish the page again after inserting. The container ID looks like GTM-XXXXXXX \u2014 save it in the project's Accesses tab." },
      { title: "Test: GTM container fires", note: "Use GTM Preview mode / Tag Assistant",
        guide: "1. In GTM click Preview, enter the landing page URL, and connect. 2. Tag Assistant should open the page and show the container as Connected. 3. If it doesn't connect: confirm the snippet is in the published version (View Source and search for GTM-), and that no cookie banner or ad-blocker is interfering. 4. Keep this tab open \u2014 the next tests use the same Preview session." },
      { title: "Install Meta Pixel via GTM", note: "Base code as a tag on All Pages trigger",
        guide: "1. In Meta Events Manager, create (or open) the Pixel and copy its ID. 2. In GTM: New Tag > Custom HTML, paste the Pixel base code (or use a Pixel template from the community gallery). 3. Set the trigger to All Pages. 4. Name it clearly (e.g. 'Meta Pixel \u2014 Base') and Submit/Publish the container. Never paste the Pixel directly in the page AND in GTM \u2014 it will fire twice and corrupt the data." },
      { title: "Test: Pixel fires PageView", note: "Verify with Meta Pixel Helper and Events Manager",
        guide: "1. Install the Meta Pixel Helper Chrome extension. 2. Open the landing page; the extension icon should turn blue and list a PageView event with the correct Pixel ID. 3. Cross-check in Events Manager > Test Events: enter the URL and confirm PageView appears in real time. 4. Watch for duplicate PageViews \u2014 two means the Pixel is installed twice." },
      { title: "Configure conversion events (lead / purchase)", note: "Define triggers for form submit or thank-you page",
        guide: "1. Decide the conversion moment: a thank-you page visit (easiest and most reliable) or a form-submit event. 2. In GTM, create a trigger: Page View on the thank-you URL, or Form Submission / Click on the submit button. 3. Create a tag: Custom HTML with fbq('track','Lead') (or 'Purchase' with value), fired by that trigger. 4. Publish. If the form stays on the same page, prefer the built-in form trigger or a developer-pushed dataLayer event." },
      { title: "Test: conversion events fire with correct parameters", note: "Use Meta Test Events tool",
        guide: "1. Open Events Manager > Test Events and connect your browser. 2. Complete the form on the live page as a fake lead. 3. Confirm the Lead (or Purchase) event arrives, only once, with the expected parameters (value/currency if set). 4. Also confirm PageView did NOT double-fire during the submission. Delete the fake lead from the CRM afterwards." },
      { title: "Set up GA4 via GTM", note: "GA4 configuration tag on All Pages",
        guide: "1. In Google Analytics, create a GA4 property and a Web data stream for the domain; copy the Measurement ID (G-XXXXXXX). 2. In GTM: New Tag > Google Tag, paste the Measurement ID, trigger All Pages. 3. Publish the container. 4. Save the Measurement ID in the Accesses tab. GA4 gives you a second, independent source of truth when Meta's numbers look strange." },
      { title: "Test: GA4 receives events", note: "Confirm in GA4 Realtime report",
        guide: "1. Open GA4 > Reports > Realtime. 2. Visit the landing page from your phone (mobile data) and from desktop. 3. Both sessions should appear within ~30 seconds with page_view events. 4. If nothing appears: check the Measurement ID matches, the GTM container was published, and an ad-blocker isn't eating the hit." },
      { title: "Connect form to CRM / email automation", note: "",
        guide: "1. In the form tool, configure the destination: native CRM integration, webhook, or a connector like Zapier/Make. 2. Map every field (name, email, phone) to the CRM fields \u2014 unmapped phone numbers are the most common silent loss. 3. Set the automation that should follow (welcome email, WhatsApp notification to the client). 4. Confirm with the client who gets notified of each new lead and how fast." },
      { title: "Test: form submission delivers lead end-to-end", note: "Submit a real test lead and confirm it arrives in the CRM",
        guide: "1. Fill the form on the LIVE page (not preview) with identifiable fake data (e.g. name 'TESTE NEBU'). 2. Confirm the lead appears in the CRM with all fields populated correctly. 3. Confirm the automation fired: welcome email received, notification sent. 4. Time it \u2014 if the lead takes more than a minute to arrive, investigate before launch. 5. Delete the test lead. This is the only test that validates the entire chain; never skip it." },
      { title: "Define UTM convention for campaign links", note: "source / medium / campaign standard for all ads",
        guide: "1. Agree a fixed pattern, e.g. utm_source=meta, utm_medium=paid, utm_campaign=lancamento-junho, utm_content=video-01. 2. Use lowercase, no spaces or accents, hyphens between words \u2014 UTMs are case-sensitive and 'Meta' and 'meta' become two different sources. 3. Document the pattern in this project's notes so every future ad uses it. 4. Build links with Meta's URL parameters field or a UTM builder spreadsheet." },
      { title: "Test: UTMs captured in analytics and CRM", note: "Click a tagged link and trace the parameters through",
        guide: "1. Open the landing page through a fully tagged URL (paste it in incognito). 2. In GA4 Realtime, confirm the session shows the expected source/medium. 3. Submit a test lead through that tagged visit and check whether the CRM captured the UTM fields (if the form passes them \u2014 many need hidden fields configured). 4. If UTMs don't reach the CRM, add hidden form fields that read the URL parameters." },
    ],
  },

  project_infra: {
    name: "Project Infrastructure",
    tasks: [
      { title: "Create dedicated Gmail account for the project", note: "One Google account per project \u2014 everything hangs from it",
        guide: "1. Create a Gmail with a clear convention, e.g. projeto.cliente.nebu@gmail.com. 2. Recovery phone and recovery email must belong to the AGENCY, not the client \u2014 you lose the account otherwise. 3. Enable 2-step verification immediately (authenticator app, not SMS only). 4. This account will own GTM, GA4, Drive and tool signups for the project \u2014 never mix projects in one account." },
      { title: "Register all credentials in the Accesses tab", note: "Email, recovery codes, every tool login",
        guide: "1. Open this project's Accesses tab and add the new Gmail (login, password, recovery info in the note). 2. Save the 2FA backup codes Google generates \u2014 paste them in the note field. 3. From now on, every account created for this project (CRM, hosting, proxy panel) gets registered here the moment it is created, not later." },
      { title: "Create shared Drive folder structure", note: "Creatives / Copy / Reports / Contracts",
        guide: "1. In the project Gmail's Drive, create a root folder named after the project. 2. Standard subfolders: 01-Briefing, 02-Copy, 03-Creatives, 04-Social-Proof, 05-Reports, 06-Contracts. 3. Share the root folder with the client's email as Viewer (or Commenter) and with your main agency account as Editor. 4. Same structure every project \u2014 you stop wasting time looking for files." },
    ],
  },

  meta_ads_infra: {
    name: "Meta Ads Infrastructure",
    tasks: [
      { title: "Purchase a dedicated proxy", note: "BEFORE the first login on the ad account \u2014 order matters",
        guide: "1. Buy a residential or ISP proxy with a single dedicated IP, located in the same country/region as the ad account. 2. Avoid cheap shared datacenter proxies \u2014 their IPs are flagged. 3. Configure it inside an anti-detect browser profile (AdsPower, Dolphin Anty) dedicated to this account only. 4. Rule: this account is NEVER opened outside this browser profile and this IP. The proxy comes first because the account's very first login must already happen through it." },
      { title: "Purchase Meta Ad Account / BM", note: "Treat purchased accounts as consumable assets",
        guide: "1. Buy from a vendor with reputation and warranty (replacement on early ban); aged accounts with spend history are safer than fresh ones. 2. Receive full credentials: profile email and password, recovery email, 2FA seed. 3. Be aware: purchased accounts violate Meta's Terms of Service \u2014 ban risk is permanent and structural. Never link it to your personal profile or the client's, keep money exposure low early, and have a replacement plan. 4. Register everything in the Accesses tab." },
      { title: "First login through the proxy + warm browsing", note: "No settings changes on day one",
        guide: "1. Open the anti-detect profile (proxy active) and log in. 2. Solve any checkpoint calmly; if asked for identity verification, follow the vendor's instructions. 3. Days 1\u20132: behave like a human \u2014 scroll the feed, watch videos, like a few posts. Do NOT change email, password, or payment settings on day one. 4. Always reopen the same browser profile; never log in from your phone." },
      { title: "Create and configure the Facebook Page", note: "Complete profile before any ad runs",
        guide: "1. From inside the account, create the Page with the project's brand name. 2. Fill everything: profile photo, cover, description, category, website (the landing page), WhatsApp button later. 3. Publish 3\u20135 organic posts so the Page does not look empty \u2014 empty pages get rejected ads and distrust from users who click the profile. 4. Page roles stay inside this BM only." },
      { title: "Connect Instagram (if applicable)", note: "Most launch projects will have one",
        guide: "1. Create or receive the project's Instagram account; secure it with the project Gmail and 2FA. 2. Convert it to a Professional account (Business). 3. In the Facebook Page settings (or Meta Business Suite > Accounts > Instagram), connect the Instagram to the Page. 4. This unlocks Instagram placements and running ads from the IG handle \u2014 without it, ads show from the Facebook Page name." },
      { title: "Create the Pixel / dataset for the project", note: "Will be installed on the landing page via GTM",
        guide: "1. In Events Manager (inside this BM), create a new dataset/Pixel named after the project. 2. Copy the Pixel ID and store it in the Accesses tab. 3. Do not install it yet if the landing page is not ready \u2014 the Landing Page stage covers installation and testing via GTM. 4. One Pixel per project; never reuse a Pixel across unrelated clients." },
      { title: "Add payment card (wait 2+ days after first proxy login)", note: "Rushing this step is the #1 cause of instant bans",
        guide: "1. Count at least 2 full days of normal browsing through the proxy before touching billing. 2. Add the card in Billing settings; ideally the card name/country is coherent with the account. 3. Set a low spending limit initially. 4. If the account asks for verification right after adding the card, stop and let it rest a day before continuing." },
      { title: "Run a warm-up campaign", note: "Cheap engagement before any conversion campaign",
        guide: "1. Create an Engagement (or Traffic) campaign promoting one of the Page's organic posts. 2. Budget R$10\u201320/day for 3\u20137 days, broad audience, no aggressive copy. 3. Goal is spend history and normal behavior, not results \u2014 do not optimize it. 4. Only after it spends without flags, launch the real conversion campaigns. Keep daily budget increases gradual (max ~2x per day)." },
      { title: "Add owner's main email as partner on the account", note: "Future step \u2014 only after the account is stable",
        guide: "1. Wait until the account has weeks of stable spend. 2. In Business Settings > People (or Partners), invite the company's main email with the LOWEST role that works (Advertiser/Analyst, not Admin). 3. The new person must accept from a normal connection \u2014 their own IP is fine since partners legitimately access from different locations. 4. This protects continuity: if the agency relationship ends, the client keeps visibility on their own assets." },
    ],
  },

  whatsapp_infra: {
    name: "WhatsApp Infrastructure",
    tasks: [
      { title: "Purchase phone number(s) for WhatsApp", note: "One prepaid chip per project",
        guide: "1. Buy a prepaid chip from a major carrier; register it under the agency's CPF/CNPJ. 2. Avoid VoIP/virtual numbers for the WhatsApp Business APP \u2014 they fail verification often (the Cloud API is more tolerant, see Sales Infrastructure). 3. Label the physical chip with the project name and store it safely \u2014 losing the chip can mean losing the number. 4. Note the carrier and the recharge requirement in the Accesses tab." },
      { title: "Activate the number", note: "Keep a minimum recharge so the line is not recycled",
        guide: "1. Insert the chip in a phone, complete the carrier activation (SMS/app). 2. Make one recharge immediately \u2014 carriers recycle numbers with no activity, and a recycled number means losing the WhatsApp. 3. Set a recurring reminder to recharge per the carrier's minimum window (usually every 90 days). 4. Confirm the number receives SMS \u2014 verification depends on it." },
      { title: "Configure WhatsApp Business app", note: "Profile, two-step PIN, quick replies",
        guide: "1. Install WhatsApp Business and verify with the new number. 2. Complete the business profile: name, photo (project brand), description, address/site (landing page). 3. Settings > Account > Two-step verification: enable the PIN and store it in the Accesses tab \u2014 without this, the number can be hijacked. 4. Create quick replies and labels matching the sales funnel stages. 5. Configure the greeting and away messages." },
      { title: "Connect the number to the Facebook Page / ad account", note: "Enables click-to-WhatsApp campaigns",
        guide: "1. In the Facebook Page settings (or Meta Business Suite), find WhatsApp and connect the number \u2014 a code is sent to the WhatsApp app. 2. Once connected, the ad account can create Click-to-WhatsApp campaigns using this number. 3. Add the WhatsApp button to the Page and to the Instagram profile. 4. Confirm in Ads Manager that the number appears as a valid messaging destination when creating a test (unpublished) campaign." },
      { title: "Test: ad click opens the correct WhatsApp with the funnel greeting", note: "",
        guide: "1. Create (or preview) a click-to-WhatsApp ad and click it from a phone that is NOT logged into the project accounts. 2. Confirm it opens a conversation with the right number, right business name and photo. 3. Confirm the pre-filled message or greeting matches the funnel script. 4. Reply and check the message arrives on the project device/CRM \u2014 response speed is conversion-critical in launches." },
    ],
  },

  sales_infra: {
    name: "Sales Infrastructure",
    tasks: [
      { title: "Hire and configure a CRM platform", note: "Pipeline, custom fields, UTM capture",
        guide: "1. Pick a CRM with native WhatsApp support (e.g. Kommo, Brevo, RD Station \u2014 whatever fits budget). 2. Create the pipeline mirroring the funnel: New Lead > Contacted > Qualified > Negotiating > Won/Lost. 3. Create custom fields: utm_source, utm_medium, utm_campaign, utm_content \u2014 attribution depends on them. 4. Add users with the minimum role needed; register the CRM login in the Accesses tab. 5. Payment for the CRM goes in the Finance tab as a monthly Subscription." },
      { title: "Build the WhatsApp sales funnel", note: "Scripts, tags, follow-up cadence",
        guide: "1. Map the journey: ad > WhatsApp greeting > qualification questions > pitch/VSL link > objection handling > close. 2. Write the actual message scripts for each step, including audio guidelines if sellers use voice notes. 3. Define follow-up cadence for silent leads (e.g. 1h, 24h, 72h touches) and the breakup message. 4. Mirror each funnel step as a CRM stage or tag so reporting works. 5. Save all scripts in the Drive 02-Copy folder." },
      { title: "Configure the WhatsApp Cloud API (for message campaigns)", note: "Complete beginner guide in the i icon \u2014 read fully before starting",
        guide: "WHAT IT IS: the Cloud API is Meta's official way to send WhatsApp messages at scale (broadcasts, automations) \u2014 different from the Business app. A number can be on the APP or on the API, not both.\n1. Go to developers.facebook.com with the project's BM admin, create an App of type Business.\n2. Inside the app, click Add Product > WhatsApp. Meta gives you a free TEST number immediately \u2014 use it to learn before touching the real number.\n3. To use a real number: it must NOT be registered on the WhatsApp/Business app (delete the account in the app first: Settings > Account > Delete). Use a separate number for the API; keep the human-sales number on the app.\n4. Verify the Business (Business Settings > Security Center > Business verification \u2014 CNPJ documents). Without verification you are limited to 250 conversations/day in test mode.\n5. Create a System User (Business Settings > Users > System Users), give it the WhatsApp app asset, and generate a PERMANENT access token \u2014 the default tokens expire in 24h. Store the token in the Accesses tab.\n6. Outbound campaign messages must use pre-approved Message Templates (created in WhatsApp Manager); free-form replies are only allowed within 24h of a user's last message.\n7. PRACTICAL SHORTCUT: instead of coding webhooks yourself, connect the API through the CRM or a BSP integration (most CRMs have a guided Cloud API connection that handles webhooks for you). That is the recommended path for the agency.\n8. Pricing is per 24h conversation window, billed by Meta to a card on the BM \u2014 add this cost to the Finance tab.\n9. Warm up sending volume gradually; mass blasts from a fresh number get quality-rated down and blocked." },
      { title: "Test: lead flows end-to-end (ad > WhatsApp > CRM > campaign)", note: "The only test that validates the whole machine",
        guide: "1. From a clean phone, click the ad, send the greeting, and go through 2\u20133 funnel steps. 2. Confirm the lead appears in the CRM at the right stage with UTMs captured. 3. Trigger one API template message to that test lead and confirm delivery. 4. Time every hop \u2014 anything over a minute between ad click and CRM entry needs fixing before launch. 5. Delete the test lead." },
    ],
  },

  creative_production: {
    name: "Creative Production",
    tasks: [
      { title: "Define the offer angles and big idea", note: "Foundation for VSL and all ad scripts",
        guide: "1. From the briefing, list the audience's top pains, desires and objections. 2. Write 5 distinct angles (e.g. pain, aspiration, curiosity, social proof, urgency) \u2014 one sentence each. 3. Validate the angles with the client/expert before writing anything long. 4. These 5 angles feed both the VSL variations and the ad scripts \u2014 do this task first and everything downstream gets faster." },
      { title: "Write VSL with 5 angle variations", note: "Same body, 5 different leads",
        guide: "1. Structure: lead (hook/angle) > story > mechanism > proof > offer > guarantee > CTA. 2. Write the full VSL once, then produce 5 versions changing mainly the LEAD (first 1\u20133 minutes) to match each angle \u2014 you rarely need 5 entirely different scripts. 3. Keep a swipe of proof elements next to the script. 4. Save versions in Drive 02-Copy with clear names (vsl-angulo-dor, vsl-angulo-prova...)." },
      { title: "Write scripts for 5+ Meta Ads creatives", note: "One per angle, hook in the first 3 seconds",
        guide: "1. Derive one ad script from each VSL angle \u2014 the ad is the angle compressed to 30\u201360s. 2. Formula: hook (3s) > agitate > tease mechanism > CTA to the LP/WhatsApp. 3. Write for native feel: spoken language, captions on screen, no corporate tone. 4. Include shot directions for the UGC creator (selfie style, location, props). 5. Deliver scripts to creators via the Drive folder." },
      { title: "Hire UGC creators", note: "Brief + usage rights + payment registered in Finance",
        guide: "1. Source creators (UGC platforms, Instagram hashtags, indication); request portfolio in the niche. 2. Send a tight brief: script, dos/don'ts, reference videos, deadline. 3. Contract must include image usage rights for paid ads (specify duration/channels). 4. Register the agreed payment in this project's Finance tab as a UGC Creator item with the delivery date and payment deadline \u2014 the client pays on schedule and you inform the creator." },
      { title: "Hire video editors", note: "Paid test edit before committing volume",
        guide: "1. Shortlist editors with short-form ad experience (not just YouTube editing). 2. Give one PAID test edit with your style references and the captions/emoji/zoom pacing you expect. 3. Agree price per creative and a weekly delivery cadence matched to the testing volume. 4. Set the file naming convention and the Drive delivery folder. 5. Register recurring payment in the Finance tab." },
      { title: "Produce and review the creatives", note: "Export specs: 9:16, captions, sound-off friendly",
        guide: "1. Coordinate UGC footage > editor > review loop; review against the script's hook timing. 2. Checklist per creative: hook in 3s, captions accurate, brand/offer clear, CTA present, no copyright music. 3. Export 9:16 (Reels/Stories) as primary; 1:1 or 4:5 if feed placements are planned. 4. Approved files go to Drive 03-Creatives with the angle name in the filename \u2014 reporting later will thank you." },
      { title: "Acquire social proof assets", note: "Track with the counter \u2014 target is 10", target: 10,
        guide: "1. Collect from the client: testimonial prints, results screenshots, before/after, video testimonials. 2. Every asset needs usage authorization from the person shown \u2014 keep the authorizations in Drive 06-Contracts. 3. Blur sensitive data (names/values when not authorized). 4. Store in Drive 04-Social-Proof and click + on this task's counter for each approved asset. 5. Minimum 10 before launch; the VSL, the LP and the WhatsApp funnel all consume these." },
    ],
  },

  social_media: {
    name: "Social Media",
    tasks: [
      { title: "Create creatives for social media", note: "Adapt ad creatives \u2014 do not start from zero",
        guide: "1. Repurpose the best ad creatives and VSL cuts into organic posts (Reels, carousels, stories). 2. Batch-produce: one production session should yield 2+ weeks of posts. 3. Keep visual identity consistent with the landing page (colors, fonts). 4. Organic content warms the profile that paid traffic sends people to \u2014 an active profile converts the curious clicker." },
      { title: "Organize weekly posting schedule", note: "Recurring \u2014 repeats every week", recurrence: "weekly",
        guide: "1. Define cadence with the client (e.g. 3 Reels + 2 stories sets per week). 2. Plan the week's posts in a simple calendar (Meta Business Suite's scheduler covers Facebook+Instagram for free). 3. Schedule everything in one sitting at the start of the week; this task repeats weekly to enforce the habit. 4. Note what performed best and feed it back to Creative Production \u2014 organic is a free testing lab for ad angles." },
    ],
  },
};

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };
const mkTask = (title) => ({ id: uid(), title, status: "todo", urgency: "none", clientVisible: true, note: "", createdAt: new Date().toISOString(), completedAt: null, dueDate: null, recurrence: "none" });
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }; // YYYY-MM-DD

// ---------- Typography ----------
// Google Sans is proprietary (licensed for Google products only) and is not on Google Fonts.
// Stack tries it first for devices that have it, then falls back to DM Sans — the closest
// openly licensed match — which is imported below so the look is consistent everywhere.
const FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300..800&display=swap');";
const FONT_STACK = "'Google Sans', 'Product Sans', 'DM Sans', 'Segoe UI', system-ui, sans-serif";

// ---------- Responsive helper ----------
const MOBILE_BP = 720;
function useIsMobile() {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth < MOBILE_BP : false);
  useEffect(() => {
    const onResize = () => setM(window.innerWidth < MOBILE_BP);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return m;
}

// ---------- Date display helpers ----------
const fmtDate = (iso) => iso ? new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
const daysBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
const durationLabel = (n) => n === 0 ? "same day" : n === 1 ? "1 day" : `${n} days`;

// ---------- Recurrence ----------
const RECURRENCE = { none: "One-time", daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
// Does a pending task occur on a given YYYY-MM-DD? dueDate is the anchor/first occurrence.
function occursOn(t, key) {
  if (!t.dueDate) return false;
  if (t.recurrence === "none" || !t.recurrence) return t.dueDate === key;
  if (key < t.dueDate) return false;
  const a = new Date(t.dueDate + "T00:00:00"), d = new Date(key + "T00:00:00");
  if (t.recurrence === "daily") return true;
  if (t.recurrence === "weekly") return a.getDay() === d.getDay();
  if (t.recurrence === "monthly") return a.getDate() === d.getDate();
  return false;
}
// ---------- Finance ----------
const FIN_CATEGORIES = { topup: "Phone Top-Up", ugc: "UGC Creator", service: "Agency Services", subscription: "Subscription", ads: "Ad Spend", other: "Other" };
const PAY_METHODS = ["Pix", "Credit Card", "Boleto", "Bank Transfer"];
const FIN_RECUR = { none: "One-time", weekly: "Weekly", monthly: "Monthly" };
const mkPayment = (o = {}) => ({
  id: uid(), title: "", category: "other", payee: "", amount: 0,
  dueDate: null, recurrence: "none", status: "pending",
  lastPaid: null, method: null, deliveredAt: null, note: "",
  clientReportedAt: null, clientMethod: null, ...o,
});
const ACCESS_CATEGORIES = { email: "Email", domain: "Domain", social: "Social", platform: "Platform", gateway: "Gateway", tool: "Tool", other: "Other" };
const mkAccess = (o = {}) => ({ id: uid(), label: "", category: "tool", username: "", password: "", url: "", note: "", ...o });
// Clipboard with fallback: in sandboxed iframes navigator.clipboard.writeText REJECTS,
// so it must be awaited inside try/catch — returning the promise directly skips the fallback.
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* fall through to execCommand */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed"; ta.style.top = "-1000px"; ta.style.left = "-1000px";
    ta.setAttribute("readonly", "");
    document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}
const normalizeUrl = (u) => /^https?:\/\//i.test(u) ? u : "https://" + u;

const fmtBRL = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// After paying a recurring obligation, roll its due date to the next cycle
function rollForward(dateStr, recurrence) {
  const d = new Date(dateStr + "T00:00:00");
  if (recurrence === "weekly") {
    d.setDate(d.getDate() + 7);
  } else if (recurrence === "monthly") {
    // clamp so Jan 31 -> Feb 28/29 instead of overflowing into March
    const day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
  }
  return d.toISOString().slice(0, 10);
}

const initials = (name) => name.split(/[\s—-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

// ---------- SVG icons (no emojis anywhere) ----------
function Icon({ name, size = 14, style }) {
  const paths = {
    chevron: <polyline points="6 9 12 15 18 9" />,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    folder: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
    sun: <><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></>,
    moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
    edit: <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />,
    x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    grip: <><circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" /></>,
    repeat: <><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
    check: <polyline points="20 6 9 17 4 12" />,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    key: <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />,
    panel: <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /></>,
    mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>,
    trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
    externalLink: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>,
    info: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ verticalAlign: "-2px", ...style }}>{paths[name]}</svg>
  );
}

// ---------- Seed data ----------
const seed = [
  {
    id: "p1", name: "Brand Identity — Café Aurora", client: "Café Aurora", contact: "marina@cafeaurora.com.br",
    stages: [
      { id: "s1", name: "Discovery", tasks: [
        { ...mkTask("Kickoff meeting & brief"), status: "done", createdAt: daysAgo(8), completedAt: daysAgo(5) },
        { ...mkTask("Competitor audit (5 brands)"), status: "done", createdAt: daysAgo(7), completedAt: daysAgo(2) },
      ]},
      { id: "s2", name: "Concept", tasks: [
        { ...mkTask("Moodboards — 3 directions"), status: "doing", urgency: "high", note: "Presenting Friday", createdAt: daysAgo(4), dueDate: inDays(0) },
        { ...mkTask("Internal type exploration"), status: "doing", clientVisible: false, note: "Keep internal until concept locks", createdAt: daysAgo(3), dueDate: inDays(2) },
      ]},
      { id: "s3", name: "Design", tasks: [ { ...mkTask("Logo system"), dueDate: inDays(7) }, { ...mkTask("Color & typography spec"), dueDate: inDays(9) } ]},
      { id: "s4", name: "Delivery", tasks: [ mkTask("Brand book PDF") ]},
    ],
    activity: [
      { id: uid(), when: "Jun 9", text: "Completed competitor audit — moved Discovery to 100%." },
      { id: uid(), when: "Jun 6", text: "Kickoff meeting held. Brief approved by Marina." },
    ],
    finance: [
      mkPayment({ title: "Brand identity — 50% on approval", category: "service", payee: "Nebu", amount: 4500, dueDate: inDays(10) }),
    ],
  },
  {
    id: "p2", name: "Website Redesign — Vetra Advogados", client: "Vetra Advogados", contact: "paulo@vetra.adv.br",
    stages: [
      { id: uid(), name: "Discovery", tasks: [{ ...mkTask("Stakeholder interviews"), status: "done", createdAt: daysAgo(10), completedAt: daysAgo(6) }]},
      { id: uid(), name: "Wireframes", tasks: [
        { ...mkTask("Sitemap proposal"), status: "review", urgency: "urgent", note: "Awaiting client approval", createdAt: daysAgo(5), dueDate: inDays(-2) },
        { ...mkTask("Home wireframe"), status: "blocked", note: "Blocked by sitemap approval", createdAt: daysAgo(5), dueDate: inDays(4) },
      ]},
      { id: uid(), name: "Build", tasks: [] },
    ],
    activity: [{ id: uid(), when: "Jun 8", text: "Sitemap sent for approval — waiting on Paulo." }],
    finance: [
      mkPayment({ title: "Website redesign — monthly installment", category: "service", payee: "Nebu", amount: 3200, dueDate: inDays(3), recurrence: "monthly" }),
      mkPayment({ title: "CRM subscription", category: "subscription", payee: "HubSpot", amount: 240, dueDate: inDays(6), recurrence: "monthly" }),
    ],
  },
  {
    id: "p3", name: "Growth Retainer — Café Aurora", client: "Café Aurora", contact: "marina@cafeaurora.com.br",
    stages: [
      { id: uid(), name: "Ongoing", tasks: [
        { ...mkTask("Social media posting"), status: "doing", recurrence: "daily", dueDate: inDays(0), createdAt: daysAgo(14) },
        { ...mkTask("Campaign performance check"), status: "doing", recurrence: "weekly", dueDate: inDays(1), createdAt: daysAgo(14), note: "Meta + Google Ads dashboards" },
        { ...mkTask("Monthly results report"), status: "todo", recurrence: "monthly", dueDate: inDays(12), createdAt: daysAgo(14), urgency: "high" },
      ]},
    ],
    activity: [{ id: uid(), when: "Jun 1", text: "Retainer cycle started for June." }],
    finance: [
      mkPayment({ title: "Support line top-up (main number)", category: "topup", payee: "Vivo", amount: 50, dueDate: inDays(1), recurrence: "monthly", note: "Top up before expiry or the number is lost" }),
      mkPayment({ title: "UGC video — June batch", category: "ugc", payee: "J\u00falia Mendes", amount: 800, dueDate: inDays(4), deliveredAt: daysAgo(2).slice(0, 10), note: "3 videos delivered; pay within 7 days of delivery" }),
      mkPayment({ title: "Meta Ads budget", category: "ads", payee: "Meta", amount: 2500, dueDate: inDays(1), recurrence: "monthly" }),
      mkPayment({ title: "Google Ads budget", category: "ads", payee: "Google", amount: 1500, dueDate: inDays(1), recurrence: "monthly" }),
      mkPayment({ title: "AI tools subscription", category: "subscription", payee: "OpenAI + Claude", amount: 180, dueDate: inDays(-1), recurrence: "monthly" }),
      mkPayment({ title: "Retainer fee — June", category: "service", payee: "Nebu", amount: 3800, dueDate: inDays(-3), status: "paid", lastPaid: daysAgo(3).slice(0, 10), method: "Pix" }),
    ],
    accesses: [
      mkAccess({ label: "Support line email", category: "email", username: "suporte@cafeaurora.com.br", password: "Au7r0ra!suporte", url: "https://mail.google.com" }),
      mkAccess({ label: "Instagram @cafeaurora", category: "social", username: "@cafeaurora", password: "Insta#Aur0ra24", url: "https://instagram.com/cafeaurora" }),
      mkAccess({ label: "TikTok @cafeaurora", category: "social", username: "@cafeaurora", password: "TkTk#Aur0ra24", url: "https://tiktok.com/@cafeaurora" }),
      mkAccess({ label: "Domain registrar", category: "domain", username: "marina@cafeaurora.com.br", password: "Reg1stro!BR", url: "https://registro.br", note: "Renews every January" }),
      mkAccess({ label: "Meta Business Suite", category: "tool", username: "ads@cafeaurora.com.br", password: "M3ta!Suite", url: "https://business.facebook.com" }),
    ],
  },
];

const seedClients = [
  { id: "c1", name: "Marina Souza", company: "Café Aurora", email: "marina@cafeaurora.com.br", status: "active", lastReset: null, projectIds: ["p1", "p3"] },
  { id: "c2", name: "Paulo Vetra", company: "Vetra Advogados", email: "paulo@vetra.adv.br", status: "invited", lastReset: null, projectIds: ["p2"] },
];

// ---------- Main app ----------
function CenterMsg({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0D0F13", color: "#8B94A6", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center",
      fontFamily: "'Google Sans','DM Sans','Segoe UI',system-ui,sans-serif", fontSize: 14 }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300..800&display=swap');"}</style>
      <div>{children}</div>
    </div>
  );
}

export default function App({ mode = "admin" }) {
  const [dark, setDark] = useState(true); // dark mode is the default
  const T = THEMES[dark ? "dark" : "light"];
  const STATUS = statusFor(T, dark);
  const URGENCY = urgencyFor(T, dark);

  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loadingData, setLoadingData] = useState(true);

  // Load everything from Supabase on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await loadProjects();
        if (!alive) return;
        setProjects(rows);
        setActiveId(rows[0]?.id || null);
      } catch (e) {
        if (alive) setLoadError(e.message || "Failed to load data");
      } finally {
        if (alive) setLoadingData(false);
      }
    })();
    return () => { alive = false; };
  }, []);
  const [newTask, setNewTask] = useState({});
  const [newStage, setNewStage] = useState("");
  const [stageTemplate, setStageTemplate] = useState("blank"); // 'blank' or a STAGE_TEMPLATES key
  const [expandedGuide, setExpandedGuide] = useState(null); // task id with its how-to guide open
  const [collapsedStages, setCollapsedStages] = useState({}); // stage id -> true when collapsed (view-only)
  const toggleStageCollapsed = (sid) => setCollapsedStages(c => ({ ...c, [sid]: !c[sid] }));
  const [taskView, setTaskView] = useState("active"); // active | all | completed — workflow task filter
  // A task counts as "completed" only if it actually finished (has completedAt).
  // Recurring tasks roll forward and never set completedAt, so they always read as active.
  const taskMatchesView = (t) => taskView === "all" ? true : taskView === "completed" ? !!t.completedAt : !t.completedAt;
  const [showNewProject, setShowNewProject] = useState(false);
  const [page, setPage] = useState("projects");
  const [projTab, setProjTab] = useState("work"); // work | finance | access inside a project
  const [clients, setClients] = useState([]);
  useEffect(() => { db.loadClients().then(setClients).catch(() => {}); }, []);
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(typeof window !== "undefined" ? window.innerWidth >= MOBILE_BP : true);
  // navigating on mobile closes the drawer so content gets the full screen
  const go = (p) => { setPage(p); if (isMobile) setSidebarOpen(false); };
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false);
  const [clientPreview, setClientPreview] = useState(false); // 'projects' | 'calendar'
  const [npName, setNpName] = useState(""); const [npClient, setNpClient] = useState("");
  const [editingProject, setEditingProject] = useState(false);
  const [editingStage, setEditingStage] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [confirmDeleteStage, setConfirmDeleteStage] = useState(null); // inline confirm — window.confirm doesn't fire in this environment

  // Reorder projects from a dnd-kit ordered id list; persist new positions.
  const reorderProjectsByIds = (orderedIds) => {
    setProjects(ps => {
      const byId = Object.fromEntries(ps.map(p => [p.id, p]));
      const next = orderedIds.map(id => byId[id]).filter(Boolean);
      db.reorderProjects(orderedIds).catch(e => console.error("reorder projects failed", e));
      return next;
    });
  };

  const project = projects.find(p => p.id === activeId);

  // Switching projects must reset transient edit/confirm state, or actions leak onto the wrong project
  useEffect(() => {
    setEditingProject(false); setEditingStage(null); setEditingTask(null);
    setConfirmDeleteStage(null); setConfirmDeleteProject(false);
  }, [activeId]);
  // Local optimistic update, then persist that project's rows to Supabase so
  // nothing is lost on refresh. We reconcile the full project (idempotent upsert).
  const update = (fn) => {
    setProjects(ps => {
      const next = ps.map(p => p.id === activeId ? fn(structuredClone(p)) : p);
      const changed = next.find(p => p.id === activeId);
      if (changed) persistProject(changed).catch(e => console.error("persist failed", e));
      return next;
    });
  };
  const findTask = (p, sid, tid) => p.stages.find(s => s.id === sid).tasks.find(t => t.id === tid);
  const cycle = (arr) => (cur) => arr[(arr.indexOf(cur) + 1) % arr.length];

  const cycleStatus = (sid, tid) => update(p => {
    const t = findTask(p, sid, tid);
    t.status = cycle(STATUS_ORDER)(t.status);
    if (t.status === "done") {
      if (t.recurrence && t.recurrence !== "none" && t.dueDate) {
        // recurring: log this occurrence, advance to the next cycle, stay active (never vanish)
        t.lastDone = new Date().toISOString().slice(0, 10);
        if (t.recurrence === "daily") {
          const d = new Date(t.dueDate + "T00:00:00"); d.setDate(d.getDate() + 1);
          t.dueDate = d.toISOString().slice(0, 10);
        } else {
          t.dueDate = rollForward(t.dueDate, t.recurrence);
        }
        t.status = "doing";
      } else if (!t.completedAt) {
        t.completedAt = new Date().toISOString(); // one-time task completes normally
      }
    }
    if (t.status !== "done") t.completedAt = null;
    return p;
  });
  const cycleUrgency = (sid, tid) => update(p => { const t = findTask(p, sid, tid); t.urgency = cycle(URGENCY_ORDER)(t.urgency); return p; });
  const incCount = (sid, tid, delta) => update(p => {
    const t = findTask(p, sid, tid);
    t.count = Math.max(0, Math.min(t.target ?? Infinity, (t.count || 0) + delta));
    return p;
  });
  const cycleRecurrence = (sid, tid) => update(p => {
    const t = findTask(p, sid, tid);
    t.recurrence = cycle(Object.keys(RECURRENCE))(t.recurrence || "none");
    // a recurring task needs an anchor date to appear on the calendar
    if (t.recurrence !== "none" && !t.dueDate) t.dueDate = new Date().toISOString().slice(0, 10);
    return p;
  });
  const toggleVis = (sid, tid) => update(p => { const t = findTask(p, sid, tid); t.clientVisible = !t.clientVisible; return p; });

  const addTask = (sid) => {
    const title = (newTask[sid] || "").trim(); if (!title) return;
    update(p => { p.stages.find(s => s.id === sid).tasks.push(mkTask(title)); return p; });
    setNewTask(nt => ({ ...nt, [sid]: "" }));
  };
  const deleteTask = (sid, tid) => {
    update(p => { const s = p.stages.find(s => s.id === sid); s.tasks = s.tasks.filter(t => t.id !== tid); return p; });
    db.deleteTask(tid).catch(e => console.error(e));
  };
  const saveTaskEdit = (sid, tid, title, note, due, recurrence) => {
    update(p => { const t = findTask(p, sid, tid); t.title = title.trim() || t.title; t.note = note.trim(); t.dueDate = due || null; t.recurrence = recurrence || "none"; return p; });
    setEditingTask(null);
  };
  const tplTask = (t) => ({
    ...mkTask(t.title), note: t.note || "", guide: t.guide,
    ...(t.target ? { target: t.target, count: 0 } : {}),
    ...(t.recurrence ? { recurrence: t.recurrence, dueDate: new Date().toISOString().slice(0, 10) } : {}),
  });
  const addStage = () => {
    const tpl = stageTemplate !== "blank" ? STAGE_TEMPLATES[stageTemplate] : null;
    const name = newStage.trim() || (tpl ? tpl.name : "");
    if (!name) return;
    update(p => {
      p.stages.push({
        id: uid(), name,
        tasks: tpl ? tpl.tasks.map(tplTask) : [],
      });
      return p;
    });
    setNewStage(""); setStageTemplate("blank");
  };
  const saveStageEdit = (sid, name) => {
    update(p => { const s = p.stages.find(s => s.id === sid); s.name = name.trim() || s.name; return p; });
    setEditingStage(null);
  };
  const deleteStage = (sid) => {
    update(p => { p.stages = p.stages.filter(s => s.id !== sid); return p; });
    setConfirmDeleteStage(null);
    db.deleteStage(sid).catch(e => console.error(e));
  };
  const saveProjectEdit = (name, client, contact) => {
    update(p => { p.name = name.trim() || p.name; p.client = client.trim(); p.contact = contact.trim(); return p; });
    setEditingProject(false);
  };
  const addActivity = (text) => {
    update(p => { p.activity.unshift({ id: uid(), when: "Today", text }); return p; });
    if (activeId) db.addActivity(activeId, "Today", text).catch(e => console.error("activity failed", e));
  };
  const deleteProject = (pid) => {
    setProjects(ps => {
      const next = ps.filter(p => p.id !== pid);
      if (pid === activeId) setActiveId(next[0]?.id || null);
      return next;
    });
    setConfirmDeleteProject(false);
    db.deleteProject(pid).catch(e => console.error("delete project failed", e));
  };

  // ----- access operations -----
  const addAccess = (item) => update(p => { (p.accesses = p.accesses || []).push(mkAccess(item)); return p; });
  const saveAccess = (aid, patch) => update(p => { const a = (p.accesses || []).find(a => a.id === aid); if (a) Object.assign(a, patch); return p; });
  const deleteAccess = (aid) => { update(p => { p.accesses = (p.accesses || []).filter(a => a.id !== aid); return p; }); db.deleteAccess(aid).catch(e => console.error(e)); };
  const reorderAccesses = (orderedIds) => update(p => {
    const arr = p.accesses || [];
    const byId = Object.fromEntries(arr.map(a => [a.id, a]));
    p.accesses = orderedIds.map(id => byId[id]).filter(Boolean);
    return p; // persistProject writes new positions by array index
  });
  const addProject = async () => {
    if (!npName.trim()) return;
    const name = npName.trim(); const client = npClient.trim() || "—";
    setShowNewProject(false); setNpName(""); setNpClient("");
    try {
      const id = await db.createProject({ name, client });
      const fresh = await loadProjects();
      setProjects(fresh);
      setActiveId(id);
    } catch (e) { console.error("create project failed", e); }
  };

  // ----- finance operations -----
  const addPayment = (item) => update(p => { (p.finance = p.finance || []).push(mkPayment(item)); return p; });
  const deletePayment = (fid) => { update(p => { p.finance = (p.finance || []).filter(f => f.id !== fid); return p; }); db.deletePayment(fid).catch(e => console.error(e)); };
  const savePayment = (fid, patch) => update(p => { const f = (p.finance || []).find(f => f.id === fid); if (f) Object.assign(f, patch); return p; });
  const reorderPayments = (orderedIds) => update(p => {
    const arr = p.finance || [];
    const byId = Object.fromEntries(arr.map(f => [f.id, f]));
    p.finance = orderedIds.map(id => byId[id]).filter(Boolean);
    return p; // persistProject writes new positions by array index
  });
  const markPaid = (fid, method) => update(p => {
    const f = (p.finance || []).find(f => f.id === fid);
    if (!f) return p;
    f.method = method; f.lastPaid = new Date().toISOString().slice(0, 10);
    f.clientReportedAt = null; f.clientMethod = null; // confirming resolves any client report
    if (f.recurrence !== "none" && f.dueDate) {
      f.dueDate = rollForward(f.dueDate, f.recurrence); // recurring: log the payment, roll due date forward, stay pending
    } else {
      f.status = "paid";
    }
    return p;
  });
  // Client-side action (portal): the client reports having paid; admin still confirms
  const reportPaymentClient = (fid, method) => update(p => {
    const f = (p.finance || []).find(f => f.id === fid);
    if (f) { f.clientReportedAt = new Date().toISOString().slice(0, 10); f.clientMethod = method; }
    return p;
  });
  const rejectPaymentReport = (fid) => update(p => {
    const f = (p.finance || []).find(f => f.id === fid);
    if (f) { f.clientReportedAt = null; f.clientMethod = null; }
    return p;
  });

  // ----- drag and drop (dnd-kit reorder by ordered id lists) -----
  const taskDragFromStage = useRef(null); // reserved for cross-stage moves

  const reorderStagesByIds = (orderedIds) => update(p => {
    const byId = Object.fromEntries(p.stages.map(s => [s.id, s]));
    p.stages = orderedIds.map(id => byId[id]).filter(Boolean);
    return p;
  });

  const reorderTasksByIds = (sid, orderedIds) => update(p => {
    const s = p.stages.find(s => s.id === sid);
    if (!s) return p;
    const byId = Object.fromEntries(s.tasks.map(t => [t.id, t]));
    // orderedIds only covers the currently shown subset; preserve any others in place
    const reordered = orderedIds.map(id => byId[id]).filter(Boolean);
    const others = s.tasks.filter(t => !orderedIds.includes(t.id));
    s.tasks = [...reordered, ...others];
    return p;
  });

  const moveTaskToStage = (fromInfo, toStageId) => {
    taskDragFromStage.current = null;
    if (!fromInfo || fromInfo.stageId === toStageId) return;
    update(p => {
      const from = p.stages.find(s => s.id === fromInfo.stageId);
      const to = p.stages.find(s => s.id === toStageId);
      if (!from || !to) return p;
      const idx = from.tasks.findIndex(t => t.id === fromInfo.taskId);
      if (idx < 0) return p;
      const [moved] = from.tasks.splice(idx, 1);
      to.tasks.push(moved);
      return p;
    });
  };

  const progress = useMemo(() => {
    if (!project) return 0;
    const all = project.stages.flatMap(s => s.tasks);
    if (!all.length) return 0;
    return Math.round(100 * all.filter(t => t.status === "done").length / all.length);
  }, [project]);

  const avgCompletion = useMemo(() => {
    if (!project) return null;
    const done = project.stages.flatMap(s => s.tasks).filter(t => t.completedAt);
    if (!done.length) return null;
    const avg = done.reduce((sum, t) => sum + daysBetween(t.createdAt, t.completedAt), 0) / done.length;
    return Math.round(avg * 10) / 10;
  }, [project]);
  const stageProgress = (s) => s.tasks.length ? s.tasks.filter(t => t.status === "done").length / s.tasks.length : 0;

  const pillBase = { fontSize: 11, fontWeight: 600, letterSpacing: 0.3, padding: "3px 10px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit" };
  const iconBtn = { border: "none", background: "transparent", cursor: "pointer", color: T.inkSoft, fontSize: 13, padding: "2px 6px", fontFamily: "inherit", borderRadius: 6 };
  const ghostBtn = { display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${T.line}`, background: "transparent", color: T.inkSoft, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8 };
  const inputStyle = { padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.line}`, fontSize: 12.5, fontFamily: "inherit", background: T.inputBg, color: T.ink };
  const primaryBtn = { padding: "8px 14px", borderRadius: 8, border: "none", background: T.accent, color: dark ? "#0D0F13" : "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
  const dangerColor = dark ? "#E2918B" : "#A8453C";
  const todayStr = new Date().toISOString().slice(0, 10);

  // All pending (not done) tasks across every project, flattened for the calendar
  const allPending = useMemo(() =>
    projects.flatMap(p => p.stages.flatMap(s => s.tasks
      .filter(t => t.status !== "done")
      .map(t => ({ ...t, projectId: p.id, projectName: p.name, client: p.client, stageName: s.name }))
    )), [projects]);

  // Client login: skip the admin shell entirely, show the read-only portal.
  // With multiple granted projects, a slim switcher lets them pick.
  if (mode === "client") {
    if (loadingData) return <CenterMsg>Loading your portal…</CenterMsg>;
    if (loadError) return <CenterMsg>Could not load your portal. {loadError}</CenterMsg>;
    if (!project) return <CenterMsg>No projects are shared with you yet.</CenterMsg>;
    return (
      <ClientPortal project={project} T={T} dark={dark} dangerColor={dangerColor} todayStr={todayStr}
        onExit={() => supabase.auth.signOut()} exitLabel="Sign out"
        projects={projects} activeId={activeId} setActiveId={setActiveId}
        onReportPayment={(fid, method) => {
          update(p => { const f = (p.finance || []).find(f => f.id === fid); if (f) { f.clientReportedAt = new Date().toISOString().slice(0,10); f.clientMethod = method; } return p; });
        }} />
    );
  }

  if (clientPreview && project) {
    return <ClientPortal project={project} T={T} dark={dark} dangerColor={dangerColor} todayStr={todayStr} onExit={() => setClientPreview(false)} onReportPayment={reportPaymentClient} />;
  }

  if (loadingData) return <CenterMsg>Loading…</CenterMsg>;
  if (loadError) return <CenterMsg>Could not connect to the database. {loadError}</CenterMsg>;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg, color: T.ink, fontFamily: FONT_STACK, transition: "background .25s, color .25s" }}>
      {/* Native date-picker calendar icon is dark; invert it in dark mode so it stays visible */}
      <style>{`
        ${FONT_IMPORT}
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: ${dark ? "invert(0.85)" : "none"};
          opacity: 0.85; cursor: pointer;
        }
        input[type="date"] { color-scheme: ${dark ? "dark" : "light"}; }
      `}</style>
      {/* Sidebar */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 40 }} />
      )}
      <aside style={{
        width: sidebarOpen ? 250 : 60, background: T.sidebar, color: T.sidebarText, padding: "20px 0",
        display: "flex", flexDirection: "column", flexShrink: 0, transition: "width .2s",
        ...(isMobile && sidebarOpen ? { position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 41, boxShadow: "4px 0 24px rgba(0,0,0,.4)" } : {}),
      }}>
        <div style={{ padding: sidebarOpen ? "0 18px 16px" : "0 12px 16px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: sidebarOpen ? "space-between" : "center", gap: 8 }}>
            {sidebarOpen && <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em" }}>Nebu<span style={{ color: T.brandDot }}>.</span></div>}
            <button onClick={() => setSidebarOpen(o => !o)} title={sidebarOpen ? "Minimize sidebar" : "Expand sidebar"}
              style={{ border: "none", background: "transparent", color: "inherit", opacity: .7, cursor: "pointer", padding: 4, display: "flex" }}>
              <Icon name="panel" size={16} style={{ verticalAlign: 0 }} />
            </button>
          </div>
          {sidebarOpen && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
              <div style={{ fontSize: 11, opacity: 0.55, letterSpacing: 1, textTransform: "uppercase" }}>Admin view</div>
              <button onClick={() => setDark(d => !d)} title={dark ? "Switch to light mode" : "Switch to dark mode"}
                style={{ width: 42, height: 22, borderRadius: 999, border: "1px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.08)", cursor: "pointer", position: "relative", padding: 0, flexShrink: 0 }}>
                <span style={{
                  position: "absolute", top: 2, left: dark ? 22 : 2, width: 16, height: 16, borderRadius: "50%",
                  background: PALETTE.copper, color: PALETTE.graphite, transition: "left .2s", display: "flex", alignItems: "center", justifyContent: "center",
                }}><Icon name={dark ? "moon" : "sun"} size={10} style={{ verticalAlign: 0 }} /></span>
              </button>
            </div>
          )}
        </div>

        {/* Page nav */}
        <div style={{ padding: sidebarOpen ? "14px 12px 0" : "14px 8px 0", flex: 1, overflowY: "auto" }}>
          {/* Overview */}
          <button onClick={() => go("calendar")} title="Overview" style={{
            display: "flex", alignItems: "center", justifyContent: sidebarOpen ? "flex-start" : "center", gap: 9,
            width: "100%", padding: sidebarOpen ? "9px 12px" : "10px 0", marginBottom: 4,
            background: page === "calendar" ? "rgba(217,138,95,.12)" : "transparent",
            border: "none", borderRadius: 6, color: "inherit", cursor: "pointer", fontFamily: "inherit",
            fontSize: 13, fontWeight: page === "calendar" ? 700 : 500, opacity: page === "calendar" ? 1 : 0.75,
          }}><Icon name="calendar" size={14} style={{ verticalAlign: 0, flexShrink: 0 }} />{sidebarOpen && <span>Overview</span>}</button>

          {/* Projects — auto-expands when it's the active category, collapses when another is selected */}
          <button onClick={() => { if (!sidebarOpen) { setSidebarOpen(true); setPage("projects"); } else { go("projects"); } }} title="Projects" style={{
            display: "flex", alignItems: "center", justifyContent: sidebarOpen ? "flex-start" : "center", gap: 9,
            width: "100%", padding: sidebarOpen ? "9px 12px" : "10px 0", marginBottom: 2,
            background: page === "projects" ? "rgba(217,138,95,.12)" : "transparent",
            border: "none", borderRadius: 6, color: "inherit", cursor: "pointer", fontFamily: "inherit",
            fontSize: 13, fontWeight: page === "projects" ? 700 : 500, opacity: page === "projects" ? 1 : 0.75,
          }}>
            <Icon name="folder" size={14} style={{ verticalAlign: 0, flexShrink: 0 }} />
            {sidebarOpen && <span style={{ flex: 1, textAlign: "left" }}>Projects</span>}
          </button>

          {sidebarOpen && page === "projects" && (
            <div style={{ paddingLeft: 10, marginBottom: 6 }}>
              <SortableList items={projects} onReorder={(ids) => reorderProjectsByIds(ids)}
                renderItem={(p, { handleProps }) => (
                  <div key={p.id} style={{
                    display: "flex", alignItems: "center", gap: 4, marginBottom: 2,
                    background: p.id === activeId && page === "projects" ? "rgba(217,138,95,.10)" : "transparent",
                    borderLeft: p.id === activeId && page === "projects" ? `3px solid ${PALETTE.copper}` : "3px solid rgba(255,255,255,.08)",
                    borderRadius: 4,
                  }}>
                    <span {...handleProps} title="Drag to reorder"
                      style={{ ...handleProps.style, color: "inherit", opacity: 0.4, display: "flex", alignItems: "center", padding: "8px 2px 8px 6px", flexShrink: 0 }}>
                      <Icon name="grip" size={13} style={{ verticalAlign: 0 }} />
                    </span>
                    <button onClick={() => { setActiveId(p.id); go("projects"); }} style={{
                      flex: 1, minWidth: 0, textAlign: "left", padding: "8px 10px 8px 2px",
                      background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontFamily: "inherit",
                    }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                      <div style={{ fontSize: 10.5, opacity: 0.55, marginTop: 1 }}>{p.client}</div>
                    </button>
                  </div>
                )} />
              {showNewProject ? (
                <div style={{ padding: 10, background: "rgba(255,255,255,.06)", borderRadius: 8, marginTop: 6 }}>
                  <input value={npName} onChange={e => setNpName(e.target.value)} placeholder="Project name"
                    style={{ width: "100%", boxSizing: "border-box", marginBottom: 6, padding: "7px 9px", borderRadius: 6, border: `1px solid ${T.line}`, fontSize: 12.5, fontFamily: "inherit", background: T.inputBg, color: T.ink }} />
                  <input value={npClient} onChange={e => setNpClient(e.target.value)} placeholder="Client name"
                    style={{ width: "100%", boxSizing: "border-box", marginBottom: 8, padding: "7px 9px", borderRadius: 6, border: `1px solid ${T.line}`, fontSize: 12.5, fontFamily: "inherit", background: T.inputBg, color: T.ink }} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={addProject} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "none", background: PALETTE.copper, color: PALETTE.graphite, fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Create</button>
                    <button onClick={() => { setShowNewProject(false); setNpName(""); setNpClient(""); }} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "inherit", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowNewProject(true)} style={{ width: "100%", marginTop: 6, padding: "8px 0", borderRadius: 8, border: "1px dashed rgba(255,255,255,.25)", background: "transparent", color: "inherit", opacity: .8, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>+ New project</button>
              )}
            </div>
          )}

          {/* Clients */}
          <button onClick={() => go("clients")} title="Clients" style={{
            display: "flex", alignItems: "center", justifyContent: sidebarOpen ? "flex-start" : "center", gap: 9,
            width: "100%", padding: sidebarOpen ? "9px 12px" : "10px 0", marginBottom: 4,
            background: page === "clients" ? "rgba(217,138,95,.12)" : "transparent",
            border: "none", borderRadius: 6, color: "inherit", cursor: "pointer", fontFamily: "inherit",
            fontSize: 13, fontWeight: page === "clients" ? 700 : 500, opacity: page === "clients" ? 1 : 0.75,
          }}><Icon name="users" size={14} style={{ verticalAlign: 0, flexShrink: 0 }} />{sidebarOpen && <span>Clients</span>}</button>

          {!sidebarOpen && (
            <button onClick={() => setDark(d => !d)} title="Toggle theme" style={{
              display: "flex", alignItems: "center", justifyContent: "center", width: "100%", padding: "10px 0",
              border: "none", background: "transparent", color: "inherit", opacity: .6, cursor: "pointer",
            }}><Icon name={dark ? "moon" : "sun"} size={14} style={{ verticalAlign: 0 }} /></button>
          )}
        </div>

        <button onClick={() => supabase.auth.signOut()} title="Sign out"
          style={{ display: "flex", alignItems: "center", justifyContent: sidebarOpen ? "flex-start" : "center", gap: 9,
            width: sidebarOpen ? "calc(100% - 24px)" : "100%", margin: sidebarOpen ? "4px 12px" : "4px 0", padding: sidebarOpen ? "9px 12px" : "10px 0",
            background: "transparent", border: "none", borderRadius: 6, color: "inherit", cursor: "pointer", fontFamily: "inherit", fontSize: 13, opacity: 0.7 }}>
          <Icon name="externalLink" size={14} style={{ verticalAlign: 0, flexShrink: 0 }} />{sidebarOpen && <span>Sign out</span>}
        </button>
        {sidebarOpen && <div style={{ padding: "12px 20px", fontSize: 10.5, opacity: 0.4 }}>Drag the grip handle to reorder stages, tasks, and projects</div>}
      </aside>

      {/* Main */}
      {page === "calendar" ? (
        <CalendarOverview
          T={T} dark={dark} dangerColor={dangerColor} todayStr={todayStr}
          allPending={allPending} urgencyMap={URGENCY}
          openProject={(pid) => { setActiveId(pid); setPage("projects"); }}
        />
      ) : page === "clients" ? (
        <ClientsPage T={T} dark={dark} dangerColor={dangerColor} clients={clients} setClients={setClients}
          reloadClients={() => db.loadClients().then(setClients).catch(() => {})}
          projects={projects} inputStyle={inputStyle} primaryBtn={primaryBtn} iconBtn={iconBtn} pillBase={pillBase} />
      ) : project ? (
        <main style={{ flex: 1, padding: isMobile ? "18px 14px" : "30px 36px", maxWidth: 1100, minWidth: 0 }}>
          {editingProject ? (
            <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <ProjectEditForm project={project} onSave={saveProjectEdit} onCancel={() => setEditingProject(false)} inputStyle={inputStyle} primaryBtn={primaryBtn} iconBtn={iconBtn} />
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: isMobile ? 14 : 24, flexDirection: isMobile ? "column" : "row" }}>
              {/* Left: kicker + title on their own lines; actions in a fixed toolbar row below */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, letterSpacing: 1.4, textTransform: "uppercase", color: T.inkSoft }}>{project.client}</div>
                <h1 style={{ fontSize: isMobile ? 21 : 28, margin: "6px 0 0", fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.25, overflowWrap: "break-word", wordBreak: "break-word" }}>{project.name}</h1>
                <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap", minHeight: 30 }}>
                  {confirmDeleteProject ? (
                    <>
                      <span style={{ fontSize: 12, fontWeight: 600, color: dangerColor }}>Delete this project and everything in it?</span>
                      <button onClick={() => deleteProject(project.id)} style={{ ...pillBase, border: "none", background: dangerColor, color: dark ? "#0D0F13" : "#fff" }}>Delete project</button>
                      <button onClick={() => setConfirmDeleteProject(false)} style={{ ...iconBtn, fontSize: 12 }}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setClientPreview(true)} title="See this project exactly as the client sees it"
                        style={{ ...ghostBtn, color: T.accent, borderColor: T.accent }}>
                        <Icon name="eye" size={12} style={{ verticalAlign: 0 }} />Preview as client
                      </button>
                      <button onClick={() => setEditingProject(true)} title="Edit project" style={ghostBtn}>
                        <Icon name="edit" size={12} style={{ verticalAlign: 0 }} />Edit
                      </button>
                      <button onClick={() => setConfirmDeleteProject(true)} title="Delete project"
                        style={{ ...ghostBtn, color: dangerColor }}>
                        <Icon name="trash" size={12} style={{ verticalAlign: 0 }} />Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Right: metrics pinned top-right, never affected by title length */}
              <div style={{ display: "flex", gap: isMobile ? 16 : 24, alignItems: "flex-start", flexShrink: 0, paddingTop: isMobile ? 0 : 22, textAlign: isMobile ? "left" : "right" }}>
                {avgCompletion !== null && (
                  <div>
                    <div style={{ fontSize: isMobile ? 24 : 30, fontWeight: 700, lineHeight: 1, whiteSpace: "nowrap" }}>{avgCompletion}<span style={{ fontSize: 14, fontWeight: 500 }}>d</span></div>
                    <div style={{ fontSize: 11.5, color: T.inkSoft, whiteSpace: "nowrap" }}>avg time to complete</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: isMobile ? 24 : 30, fontWeight: 700, color: T.accent, lineHeight: 1 }}>{progress}%</div>
                  <div style={{ fontSize: 11.5, color: T.inkSoft, whiteSpace: "nowrap" }}>overall complete</div>
                </div>
              </div>
            </div>
          )}

          {/* Work / Finance tab switcher */}
          <div style={{ display: "flex", gap: 4, margin: "18px 0 0", borderBottom: `1px solid ${T.line}` }}>
            {[["work", "Workflow"], ["finance", "Finance"], ["access", "Accesses"]].map(([k, label]) => (
              <button key={k} onClick={() => setProjTab(k)} style={{
                padding: "8px 16px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit",
                fontSize: 13, fontWeight: projTab === k ? 700 : 500,
                color: projTab === k ? T.accent : T.inkSoft,
                borderBottom: projTab === k ? `2px solid ${T.accent}` : "2px solid transparent",
                marginBottom: -1,
              }}>{label}</button>
            ))}
          </div>

          {projTab === "finance" ? (
            <FinanceSection key={project.id} T={T} dark={dark} dangerColor={dangerColor} todayStr={todayStr}
              finance={project.finance || []}
              addPayment={addPayment} deletePayment={deletePayment} savePayment={savePayment} markPaid={markPaid}
              rejectPaymentReport={rejectPaymentReport} reorderPayments={reorderPayments}
              inputStyle={inputStyle} primaryBtn={primaryBtn} iconBtn={iconBtn} pillBase={pillBase} />
          ) : projTab === "access" ? (
            <AccessSection key={project.id} T={T} dark={dark} dangerColor={dangerColor}
              accesses={project.accesses || []}
              addAccess={addAccess} saveAccess={saveAccess} deleteAccess={deleteAccess} reorderAccesses={reorderAccesses}
              inputStyle={inputStyle} primaryBtn={primaryBtn} iconBtn={iconBtn} pillBase={pillBase} />
          ) : (<>
          {/* Process spine — on mobile, labels are unreadable when squeezed into
              many equal columns, so show just the progress bars there; the stage
              cards below carry the names. */}
          <div style={{ display: "flex", gap: 6, margin: "22px 0 28px" }}>
            {project.stages.map((s, i) => {
              const pr = stageProgress(s);
              return (
                <div key={s.id} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ height: 6, borderRadius: 3, background: T.line, overflow: "hidden" }}>
                    <div style={{ width: `${pr * 100}%`, height: "100%", background: T.accent, transition: "width .3s" }} />
                  </div>
                  {!isMobile && <div style={{ fontSize: 11.5, marginTop: 6, color: pr === 1 ? T.accent : T.inkSoft, fontWeight: 600 }}>{i + 1}. {s.name}</div>}
                </div>
              );
            })}
          </div>

          {/* Stages — the whole card is draggable */}
          {project.stages.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "inline-flex", border: `1px solid ${T.line}`, borderRadius: 8, overflow: "hidden" }}>
                {[["all", "All"], ["active", "Active"], ["completed", "Completed"]].map(([k, label]) => (
                  <button key={k} onClick={() => setTaskView(k)} style={{
                    padding: "5px 12px", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600,
                    background: taskView === k ? T.accent : "transparent",
                    color: taskView === k ? (dark ? "#0D0F13" : "#fff") : T.inkSoft,
                  }}>{label}</button>
                ))}
              </div>
              <button onClick={() => {
                const allCollapsed = project.stages.every(s => collapsedStages[s.id]);
                const next = {};
                if (!allCollapsed) project.stages.forEach(s => { next[s.id] = true; });
                setCollapsedStages(next);
              }} style={{ ...ghostBtn, fontSize: 11.5, padding: "5px 10px" }}>
                {project.stages.every(s => collapsedStages[s.id]) ? "Expand all" : "Collapse all"}
              </button>
            </div>
          )}
          <SortableList items={project.stages} disabled={!!editingStage || !!editingTask}
            onReorder={(ids) => reorderStagesByIds(ids)}
            renderItem={(s, { handleProps }) => (
            <section key={s.id}
              onDragOver={e => { if (taskDragFromStage.current) { e.preventDefault(); } }}
              onDrop={e => { if (taskDragFromStage.current) { e.preventDefault(); moveTaskToStage(taskDragFromStage.current, s.id); } }}
              style={{
                background: T.panel, borderRadius: 12, padding: "18px 20px", marginBottom: 16,
                border: `1px solid ${T.line}`,
                transition: "border-color .15s, box-shadow .15s, opacity .15s",
              }}>
              {/* Stage header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: collapsedStages[s.id] ? 0 : 12 }}>
                {editingStage === s.id ? (
                  <StageEditForm stage={s} onSave={(name) => saveStageEdit(s.id, name)} onCancel={() => setEditingStage(null)} inputStyle={inputStyle} primaryBtn={primaryBtn} iconBtn={iconBtn} />
                ) : confirmDeleteStage === s.id ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Delete "{s.name}" and its {s.tasks.length} task(s)?</span>
                    <button onClick={() => deleteStage(s.id)} style={{ ...primaryBtn, background: dangerColor, color: dark ? "#0D0F13" : "#fff", padding: "6px 12px", fontSize: 12 }}>Delete stage</button>
                    <button onClick={() => setConfirmDeleteStage(null)} style={{ ...iconBtn, fontSize: 12.5 }}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <span {...handleProps} title="Drag to reorder stage"
                      style={{ ...handleProps.style, color: T.inkSoft, display: "flex", alignItems: "center", flexShrink: 0 }}>
                      <Icon name="grip" size={15} style={{ verticalAlign: 0 }} />
                    </span>
                    <button onClick={() => toggleStageCollapsed(s.id)} style={{ ...iconBtn, padding: "2px 4px", display: "flex" }}
                      title={collapsedStages[s.id] ? "Expand stage" : "Collapse stage"}>
                      <Icon name="chevron" size={15} style={{ verticalAlign: 0, transform: collapsedStages[s.id] ? "rotate(-90deg)" : "none", transition: "transform .15s" }} />
                    </button>
                    <h2 onClick={() => toggleStageCollapsed(s.id)} style={{ fontSize: 15, margin: 0, fontWeight: 700, cursor: "pointer", userSelect: "none" }}>{s.name}
                      <span style={{ fontWeight: 400, color: T.inkSoft, fontSize: 12.5, marginLeft: 8 }}>
                        {s.tasks.filter(t => t.status === "done").length}/{s.tasks.length} done
                      </span>
                    </h2>
                    <button onClick={() => setEditingStage(s.id)} style={iconBtn} title="Rename stage"><Icon name="edit" size={12} /></button>
                    <button onClick={() => setConfirmDeleteStage(s.id)} style={{ ...iconBtn, color: dangerColor }} title="Delete stage"><Icon name="x" size={13} /></button>
                  </>
                )}
              </div>

              {/* Tasks */}
              {!collapsedStages[s.id] && (<>
              {(() => { const viewTasks = s.tasks.filter(taskMatchesView); return (<>
              {s.tasks.length > 0 && viewTasks.length === 0 && (
                <div style={{ fontSize: 12, color: T.inkSoft, padding: "4px 0 10px", fontStyle: "italic" }}>
                  {taskView === "active" ? "All tasks here are completed — switch to All or Completed to see them." : "No completed tasks in this stage yet."}
                </div>
              )}
              <SortableList items={viewTasks} disabled={taskView !== "all" || !!editingTask}
                onReorder={(ids) => reorderTasksByIds(s.id, ids)}
                renderItem={(t, { handleProps }) => (
                <div key={t.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "9px 0", flexWrap: "wrap", minHeight: 64,
                    borderTop: `2px solid ${T.line}`,
                  }}>
                  <span {...handleProps} title={taskView === "all" ? "Drag to reorder" : "Switch to All view to reorder"}
                    style={{ ...(taskView === "all" && !editingTask ? handleProps.style : {}), color: T.inkSoft, userSelect: "none", display: "flex", opacity: taskView === "all" ? 1 : 0.3 }}>
                    <Icon name="grip" size={14} />
                  </span>
                  {editingTask === t.id ? (
                    <TaskEditForm task={t} onSave={(title, note, due, rec) => saveTaskEdit(s.id, t.id, title, note, due, rec)} onCancel={() => setEditingTask(null)} inputStyle={inputStyle} primaryBtn={primaryBtn} iconBtn={iconBtn} />
                  ) : (
                    <>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? T.inkSoft : T.ink }}>
                          {t.title}
                          {t.guide && (
                            <button onClick={() => setExpandedGuide(g => g === t.id ? null : t.id)}
                              title={expandedGuide === t.id ? "Hide how-to guide" : "How to perform this task"}
                              style={{ border: "none", background: "transparent", cursor: "pointer", padding: "0 4px", marginLeft: 4, color: expandedGuide === t.id ? T.accent : T.inkSoft, display: "inline-flex", verticalAlign: "-1px" }}>
                              <Icon name="info" size={13} style={{ verticalAlign: 0 }} />
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2, minHeight: 15 }}>{t.note || "\u00a0"}</div>
                        <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 3, opacity: 0.85 }}>
                          Created {fmtDate(t.createdAt)}
                          {t.recurrence && t.recurrence !== "none" && (
                            <> · <span style={{ color: T.accent, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3, verticalAlign: "bottom" }}><Icon name="repeat" size={10} style={{ verticalAlign: 0 }} />{RECURRENCE[t.recurrence]}</span>{t.dueDate ? <> · next {fmtDate(t.dueDate)}</> : null}{t.lastDone ? <> · last done {fmtDate(t.lastDone)}</> : null}</>
                          )}
                          {t.dueDate && t.status !== "done" && (!t.recurrence || t.recurrence === "none") && (
                            <> · <span style={{ color: t.dueDate < todayStr ? dangerColor : T.inkSoft, fontWeight: t.dueDate < todayStr ? 700 : 400 }}>
                              {t.dueDate < todayStr ? "Overdue — was due" : "Due"} {fmtDate(t.dueDate)}
                            </span></>
                          )}
                          {(!t.recurrence || t.recurrence === "none") && (t.completedAt
                            ? <> · Completed {fmtDate(t.completedAt)} · <span style={{ color: T.accent, fontWeight: 600 }}>took {durationLabel(daysBetween(t.createdAt, t.completedAt))}</span></>
                            : <> · open for {durationLabel(daysBetween(t.createdAt, new Date().toISOString()))}</>)}
                        </div>
                      </div>
                      {t.target != null && (
                        <span title="Acquisition counter" style={{ ...pillBase, cursor: "default", border: `1px solid ${(t.count || 0) >= t.target ? T.accent : T.line}`, color: (t.count || 0) >= t.target ? T.accent : T.inkSoft, background: (t.count || 0) >= t.target ? T.accentSoft : "transparent", display: "inline-flex", alignItems: "center", gap: 7 }}>
                          <button onClick={() => incCount(s.id, t.id, -1)} title="Decrease" style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", padding: 0, fontSize: 13, fontWeight: 800, lineHeight: 1, fontFamily: "inherit" }}>-</button>
                          {(t.count || 0)}/{t.target}
                          <button onClick={() => incCount(s.id, t.id, 1)} title="Increase" style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", padding: 0, fontSize: 13, fontWeight: 800, lineHeight: 1, fontFamily: "inherit" }}>+</button>
                        </span>
                      )}
                      <button onClick={() => cycleRecurrence(s.id, t.id)} title={t.recurrence !== "none" ? `Repeats ${RECURRENCE[t.recurrence || "none"].toLowerCase()} — click to change` : "One-time task — click to make it recurring"}
                        style={{ ...pillBase, border: `1px solid ${t.recurrence && t.recurrence !== "none" ? T.accent : T.line}`, color: t.recurrence && t.recurrence !== "none" ? T.accent : T.inkSoft, background: "transparent", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Icon name="repeat" size={10} style={{ verticalAlign: 0 }} />{RECURRENCE[t.recurrence || "none"]}
                      </button>
                      <button onClick={() => cycleUrgency(s.id, t.id)} title="Click to cycle urgency"
                        style={{ ...pillBase, border: `1px solid ${URGENCY[t.urgency].border}`, color: URGENCY[t.urgency].color, background: URGENCY[t.urgency].bg }}>
                        {URGENCY[t.urgency].label}
                      </button>
                      <button onClick={() => cycleStatus(s.id, t.id)} title="Click to cycle status"
                        style={{ ...pillBase, border: "none", color: STATUS[t.status].color, background: STATUS[t.status].bg }}>
                        {STATUS[t.status].label}
                      </button>
                      <button onClick={() => toggleVis(s.id, t.id)} title={t.clientVisible ? "Visible to client" : "Internal only"}
                        style={{ ...pillBase, border: `1px solid ${t.clientVisible ? T.accent : T.line}`, color: t.clientVisible ? T.accent : T.inkSoft, background: t.clientVisible ? T.accentSoft : "transparent" }}>
                        {t.clientVisible ? "Client sees this" : "Internal"}
                      </button>
                      <button onClick={() => setEditingTask(t.id)} style={iconBtn} title="Edit task"><Icon name="edit" size={12} /></button>
                      <button onClick={() => deleteTask(s.id, t.id)} style={{ ...iconBtn, color: dangerColor }} title="Delete task"><Icon name="x" size={13} /></button>
                      {t.guide && expandedGuide === t.id && (
                        <div style={{
                          flexBasis: "100%", background: T.accentSoft, border: `1px solid ${T.accent}`,
                          borderRadius: 10, padding: "12px 14px", marginTop: 4,
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                            <Icon name="info" size={11} style={{ verticalAlign: 0 }} />How to perform this task
                          </div>
                          <div style={{ fontSize: 12, lineHeight: 1.65, color: T.ink, whiteSpace: "pre-line" }}>{t.guide.replace(/\. (\d)\./g, ".\n$1.")}</div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )} />

              {taskView !== "completed" && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input value={newTask[s.id] || ""} onChange={e => setNewTask(nt => ({ ...nt, [s.id]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addTask(s.id)}
                    placeholder="Add a task and press Enter"
                    style={{ ...inputStyle, flex: 1, background: T.bg }} />
                  <button onClick={() => addTask(s.id)} style={primaryBtn}>Add</button>
                </div>
              )}
              </>); })()}
              </>)}
            </section>
          )} />

          <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
            <input value={newStage} onChange={e => setNewStage(e.target.value)} onKeyDown={e => e.key === "Enter" && addStage()}
              placeholder={stageTemplate === "blank" ? "Add a stage (e.g. Revisions)" : `Stage name (default: ${STAGE_TEMPLATES[stageTemplate].name})`}
              style={{ ...inputStyle, flex: "2 1 220px", border: `1px dashed ${T.line}`, background: "transparent" }} />
            <select value={stageTemplate} onChange={e => setStageTemplate(e.target.value)} title="Stage template"
              style={{ ...inputStyle, flex: "1 1 150px" }}>
              <option value="blank">Blank stage</option>
              {Object.entries(STAGE_TEMPLATES).map(([k, t]) => <option key={k} value={k}>{t.name} ({t.tasks.length} tasks)</option>)}
            </select>
            <button onClick={addStage} style={{ ...primaryBtn, background: "transparent", border: `1px solid ${T.accent}`, color: T.accent }}>Add stage</button>
          </div>

          {/* Activity log */}
          <section style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "18px 20px" }}>
            <h2 style={{ fontSize: 15, margin: "0 0 4px", fontWeight: 700 }}>Activity log</h2>
            <p style={{ fontSize: 12, color: T.inkSoft, margin: "0 0 12px" }}>Everything here will appear on the client's timeline.</p>
            <ActivityInput onAdd={addActivity} inputStyle={inputStyle} primaryBtn={primaryBtn} bg={T.bg} />
            {project.activity.map(a => (
              <div key={a.id} style={{ display: "flex", gap: 12, padding: "8px 0", borderTop: `1px solid ${T.line}` }}>
                <div style={{ fontSize: 11.5, color: T.inkSoft, width: 48, flexShrink: 0, paddingTop: 2 }}>{a.when}</div>
                <div style={{ fontSize: 13 }}>{a.text}</div>
              </div>
            ))}
          </section>
          </>)}
        </main>
      ) : (
        <main style={{ flex: 1, padding: isMobile ? "18px 14px" : "30px 36px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", color: T.inkSoft }}>
            <Icon name="folder" size={28} style={{ verticalAlign: 0, opacity: 0.5 }} />
            <p style={{ fontSize: 14, margin: "12px 0 4px", fontWeight: 600, color: T.ink }}>No projects yet</p>
            <p style={{ fontSize: 12.5, margin: 0 }}>Create one from the sidebar to get started.</p>
          </div>
        </main>
      )}
    </div>
  );
}

// ---------- Calendar overview ----------
function CalendarOverview({ T, dark, dangerColor, todayStr, allPending, urgencyMap, openProject }) {
  const isMobile = useIsMobile();
  const cellH = isMobile ? 56 : 86;
  const dotSize = isMobile ? 12 : 17;
  const maxDots = isMobile ? 3 : 6;
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-11
  const [selectedDay, setSelectedDay] = useState(null); // YYYY-MM-DD or null

  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const firstDow = new Date(year, month, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const dateKey = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const tasksOn = (key) => allPending.filter(t => occursOn(t, key));

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  // Overdue applies to one-time tasks only; recurring tasks repeat, they don't go stale the same way
  const overdue = allPending.filter(t => t.dueDate && t.dueDate < todayStr && (!t.recurrence || t.recurrence === "none")).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const dueToday = tasksOn(todayStr);
  const undated = allPending.filter(t => !t.dueDate);

  const dotColor = (t, key) =>
    ((!t.recurrence || t.recurrence === "none") && t.dueDate < todayStr) || t.urgency === "urgent" ? dangerColor
    : t.urgency === "high" ? T.accent
    : t.urgency === "low" ? (dark ? "#9BB0D4" : "#4A6398")
    : T.inkSoft;

  const ProjectDot = ({ t, size = 22 }) => (
    <span title={`${t.title} — ${t.projectName}`} style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: dotColor(t), color: dark ? "#0D0F13" : "#fff",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 800, letterSpacing: 0.3,
    }}>{initials(t.projectName)}</span>
  );

  const TaskRow = ({ t, showDate }) => (
    <button onClick={() => openProject(t.projectId)} title="Open project" style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "8px 10px", marginBottom: 6,
      background: "transparent", border: `1px solid ${T.line}`,
      borderRadius: 8, cursor: "pointer", fontFamily: "inherit", color: T.ink,
    }}>
      <ProjectDot t={t} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>
          {t.title}
          {t.recurrence && t.recurrence !== "none" && <span style={{ color: T.accent, marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 3, verticalAlign: "bottom" }}><Icon name="repeat" size={10} style={{ verticalAlign: 0 }} />{RECURRENCE[t.recurrence]}</span>}
        </div>
        <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 2 }}>
          {t.client} · {t.stageName}{showDate && t.dueDate ? <> · due {fmtDate(t.dueDate)}</> : null}
          {t.urgency !== "none" && <> · <span style={{ color: dotColor(t), fontWeight: 700 }}>{urgencyMap[t.urgency].label}</span></>}
        </div>
      </div>
    </button>
  );

  const panelStyle = { background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "16px 18px", flex: "1 1 280px" };

  return (
    <main style={{ flex: 1, padding: isMobile ? "18px 12px" : "30px 36px", maxWidth: 1200, minWidth: 0 }}>
      {/* Calendar grid */}
      <section style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "18px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h1 style={{ fontSize: 22, margin: 0, fontWeight: 700, letterSpacing: "-0.01em" }}>{monthLabel}</h1>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={prevMonth} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${T.line}`, background: "transparent", color: T.ink, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>&#8249;</button>
            <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${T.line}`, background: "transparent", color: T.inkSoft, cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600 }}>Today</button>
            <button onClick={nextMonth} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${T.line}`, background: "transparent", color: T.ink, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>&#8250;</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {(isMobile ? ["S", "M", "T", "W", "T", "F", "S"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]).map((d, di) => (
            <div key={di} style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: T.inkSoft, textAlign: "center", padding: "4px 0" }}>{d}</div>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <div key={`e${i}`} style={{ height: cellH }} />;
            const key = dateKey(d);
            const dayTasks = tasksOn(key);
            const isToday = key === todayStr;
            const isPast = key < todayStr;
            return (
              <button key={key} onClick={() => dayTasks.length && setSelectedDay(key)} style={{
                height: cellH, padding: isMobile ? 3 : 6, borderRadius: 8, overflow: "hidden", boxSizing: "border-box",
                border: `1px solid ${isToday ? T.accent : T.line}`,
                background: isToday ? T.accentSoft : "transparent",
                opacity: isPast && !dayTasks.length ? 0.45 : 1,
                cursor: dayTasks.length ? "pointer" : "default",
                fontFamily: "inherit", textAlign: "left", display: "flex", flexDirection: "column",
              }}>
                <div style={{ fontSize: isMobile ? 10 : 11.5, fontWeight: isToday ? 800 : 600, color: isToday ? T.accent : T.inkSoft, marginBottom: isMobile ? 2 : 5 }}>{d}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? 2 : 3, alignContent: "flex-start" }}>
                  {dayTasks.slice(0, maxDots).map(t => <ProjectDot key={t.id} t={t} size={dotSize} />)}
                  {dayTasks.length > maxDots && <span style={{ fontSize: 9, color: T.inkSoft, alignSelf: "center" }}>+{dayTasks.length - maxDots}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Panels below the calendar */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <section style={panelStyle}>
          <h2 style={{ fontSize: 14, margin: "0 0 10px", fontWeight: 700 }}>Today <span style={{ color: T.inkSoft, fontWeight: 400, fontSize: 12 }}>· {fmtDate(todayStr)}</span></h2>
          {dueToday.length ? dueToday.map(t => <TaskRow key={t.id} t={t} />) :
            <div style={{ fontSize: 12, color: T.inkSoft }}>Nothing due today.</div>}
        </section>

        {overdue.length > 0 && (
          <section style={{ ...panelStyle, border: `1px solid ${dangerColor}` }}>
            <h2 style={{ fontSize: 14, margin: "0 0 10px", fontWeight: 700, color: dangerColor }}>Overdue ({overdue.length})</h2>
            {overdue.map(t => <TaskRow key={t.id} t={t} showDate />)}
          </section>
        )}

        <section style={panelStyle}>
          <h2 style={{ fontSize: 14, margin: "0 0 4px", fontWeight: 700 }}>No due date ({undated.length})</h2>
          <p style={{ fontSize: 11, color: T.inkSoft, margin: "0 0 10px" }}>Pending tasks invisible to the calendar until you give them a date.</p>
          {undated.length ? undated.map(t => <TaskRow key={t.id} t={t} />) :
            <div style={{ fontSize: 12, color: T.inkSoft }}>Every pending task has a date. Good.</div>}
        </section>
      </div>

      {/* Day popup */}
      {selectedDay && (
        <div onClick={() => setSelectedDay(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 50,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14,
            padding: "20px 22px", width: "100%", maxWidth: 460, maxHeight: "70vh", overflowY: "auto",
            boxShadow: "0 20px 60px rgba(0,0,0,.4)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 18, margin: 0, fontWeight: 700, letterSpacing: "-0.01em" }}>
                {new Date(selectedDay + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </h2>
              <button onClick={() => setSelectedDay(null)} style={{ border: "none", background: "transparent", color: T.inkSoft, cursor: "pointer", padding: 4 }} title="Close"><Icon name="x" size={16} /></button>
            </div>
            <p style={{ fontSize: 11.5, color: T.inkSoft, margin: "0 0 12px" }}>{tasksOn(selectedDay).length} pending task(s) scheduled</p>
            {tasksOn(selectedDay).map(t => <TaskRow key={t.id} t={t} />)}
          </div>
        </div>
      )}
    </main>
  );
}

// ---------- Finance section (per project) ----------
function FinanceSection({ T, dark, dangerColor, todayStr, finance, addPayment, deletePayment, savePayment, markPaid, rejectPaymentReport, reorderPayments, inputStyle, primaryBtn, iconBtn, pillBase }) {
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [payingId, setPayingId] = useState(null); // item being marked paid (method picker open)
  const [method, setMethod] = useState(PAY_METHODS[0]);
  const [confirmDel, setConfirmDel] = useState(null);
  const [editId, setEditId] = useState(null);

  const isOverdue = (f) => f.status === "pending" && f.dueDate && f.dueDate < todayStr;
  const pending = finance.filter(f => f.status === "pending");
  const overdueItems = pending.filter(isOverdue);
  const pendingTotal = pending.reduce((s, f) => s + Number(f.amount || 0), 0);
  const overdueTotal = overdueItems.reduce((s, f) => s + Number(f.amount || 0), 0);
  const adsItems = finance.filter(f => f.category === "ads");
  const adsTotal = adsItems.reduce((s, f) => s + Number(f.amount || 0), 0);

  const canReorder = filter === "all"; // manual drag order only in the unfiltered view
  const visible = finance
    .filter(f => filter === "all" ? true : filter === "overdue" ? isOverdue(f) : f.category === filter)
    // In "All", preserve the user's manual (drag) order. In filtered views, surface
    // unpaid-first then by due date, since reordering a subset has no clear meaning.
    .sort((a, b) => canReorder ? 0 : ((a.status === "paid") - (b.status === "paid") || String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"))));
  const reorderPaymentsByIds = (orderedIds) => reorderPayments(orderedIds);

  const catColor = (f) => isOverdue(f) ? dangerColor : f.status === "paid" ? (dark ? "#9CC4A8" : "#3E7050") : T.accent;

  // Standardized summary card: identical fixed height, centered content — content changes can never reflow the row
  const summaryCard = {
    flex: "1 1 180px", height: 96, boxSizing: "border-box",
    background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "12px 16px",
    display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center",
  };

  return (
    <div style={{ marginTop: 20 }}>
      {/* Summary cards — all three always render, fixed structure, so every project's Finance tab looks identical */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={summaryCard}>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{fmtBRL(pendingTotal)}</div>
          <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 3 }}>pending ({pending.length}){pending.filter(f => f.clientReportedAt).length > 0 && <span style={{ color: T.accent, fontWeight: 700 }}> · {pending.filter(f => f.clientReportedAt).length} reported by client</span>}</div>
        </div>
        <div style={{ ...summaryCard, border: overdueItems.length ? `1px solid ${dangerColor}` : summaryCard.border }}>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: overdueItems.length ? dangerColor : T.ink }}>{fmtBRL(overdueTotal)}</div>
          <div style={{ fontSize: 11, color: overdueItems.length ? dangerColor : T.inkSoft, marginTop: 3 }}>overdue ({overdueItems.length})</div>
        </div>
        <div style={{ ...summaryCard, flex: "2 1 260px" }}>
          <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 6 }}>Ad budget allocation{adsTotal > 0 ? <> · {fmtBRL(adsTotal)}/cycle</> : null}</div>
          {adsTotal > 0 ? (
            <>
              <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: T.line, width: "100%" }}>
                {adsItems.map((f, i) => (
                  <div key={f.id} title={`${f.payee}: ${fmtBRL(f.amount)}`} style={{
                    width: `${(f.amount / adsTotal) * 100}%`,
                    background: i % 2 === 0 ? T.accent : (dark ? "#9BB0D4" : "#4A6398"),
                  }} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap", justifyContent: "center", maxHeight: 30, overflow: "hidden" }}>
                {adsItems.map((f, i) => (
                  <span key={f.id} style={{ fontSize: 10.5, color: T.inkSoft }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, marginRight: 4, background: i % 2 === 0 ? T.accent : (dark ? "#9BB0D4" : "#4A6398") }} />
                    {f.payee} · {Math.round((f.amount / adsTotal) * 100)}%
                  </span>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", height: 8, borderRadius: 4, background: T.line, opacity: 0.6, width: "100%" }} />
              <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 6, opacity: 0.7 }}>No ad spend registered yet — add a payment in the Ad Spend category to see the split here.</div>
            </>
          )}
        </div>
      </div>

      {/* Filters + add */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {[["all", "All"], ["overdue", "Overdue"], ...Object.entries(FIN_CATEGORIES)].map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} style={{
            ...pillBase, border: `1px solid ${filter === k ? T.accent : T.line}`,
            color: filter === k ? T.accent : T.inkSoft, background: filter === k ? T.accentSoft : "transparent",
          }}>{label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowAdd(v => !v)} style={primaryBtn}>{showAdd ? "Close" : "+ Add payment"}</button>
      </div>

      {showAdd && (
        <PaymentForm onSubmit={(item) => { addPayment(item); setShowAdd(false); }} T={T} inputStyle={inputStyle} primaryBtn={primaryBtn} />
      )}

      {/* Payment list */}
      <section style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "6px 20px" }}>
        {visible.length === 0 && <div style={{ fontSize: 12.5, color: T.inkSoft, padding: "14px 0" }}>No payments in this view.</div>}
        <SortableList items={visible} disabled={!canReorder} onReorder={(ids) => reorderPaymentsByIds(ids)}
          renderItem={(f, { handleProps }) => (
          <div key={f.id} style={{ padding: "12px 0", borderBottom: `1px solid ${T.line}` }}>
            {f.status === "pending" && f.clientReportedAt && editId !== f.id && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                background: T.accentSoft, border: `1px solid ${T.accent}`, borderRadius: 10,
                padding: "8px 12px", marginBottom: 8,
              }}>
                <Icon name="check" size={13} style={{ verticalAlign: 0, color: T.accent }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: T.accent, flex: 1, minWidth: 200 }}>
                  Client reported this payment on {fmtDate(f.clientReportedAt)}{f.clientMethod ? ` via ${f.clientMethod}` : ""} — verify it was received
                </span>
                <button onClick={() => markPaid(f.id, f.clientMethod || PAY_METHODS[0])}
                  style={{ ...primaryBtn, padding: "6px 12px", fontSize: 11.5 }}>Confirm received</button>
                <button onClick={() => rejectPaymentReport(f.id)} title="Clears the report; the item stays pending for the client"
                  style={{ ...pillBase, border: `1px solid ${dangerColor}`, color: dangerColor, background: "transparent" }}>Not received</button>
              </div>
            )}
            {editId === f.id ? (
              <PaymentForm initial={f} onSubmit={(patch) => { savePayment(f.id, patch); setEditId(null); }} onCancel={() => setEditId(null)} T={T} inputStyle={inputStyle} primaryBtn={primaryBtn} />
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", minHeight: 56 }}>
                {canReorder && (
                  <span {...handleProps} title="Drag to reorder" style={{ ...handleProps.style, color: T.inkSoft, display: "flex", flexShrink: 0, userSelect: "none" }}>
                    <Icon name="grip" size={14} />
                  </span>
                )}
                <div style={{ width: 4, alignSelf: "stretch", borderRadius: 2, background: catColor(f) }} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, textDecoration: f.status === "paid" ? "line-through" : "none", color: f.status === "paid" ? T.inkSoft : T.ink }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 3 }}>
                    {FIN_CATEGORIES[f.category]}{f.payee ? <> · {f.payee}</> : null}
                    {f.deliveredAt && <> · delivered {fmtDate(f.deliveredAt)}</>}
                    {f.dueDate && f.status !== "paid" && (
                      <> · <span style={{ color: isOverdue(f) ? dangerColor : T.inkSoft, fontWeight: isOverdue(f) ? 700 : 400 }}>
                        {isOverdue(f) ? "Overdue — was due" : "due"} {fmtDate(f.dueDate)}
                      </span></>
                    )}
                    {f.lastPaid && <> · <span style={{ color: dark ? "#9CC4A8" : "#3E7050", fontWeight: 600 }}>paid {fmtDate(f.lastPaid)}{f.method ? ` via ${f.method}` : ""}</span></>}
                  </div>
                  <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 3, minHeight: 15 }}>{f.note || "\u00a0"}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>{fmtBRL(f.amount)}</div>

                <button onClick={() => {
                  const keys = Object.keys(FIN_RECUR);
                  const next = keys[(keys.indexOf(f.recurrence || "none") + 1) % keys.length];
                  const patch = { recurrence: next };
                  if (next !== "none" && !f.dueDate) patch.dueDate = todayStr; // recurring needs an anchor date
                  savePayment(f.id, patch);
                }} title="Click to cycle recurrence"
                  style={{ ...pillBase, border: `1px solid ${f.recurrence !== "none" ? T.accent : T.line}`, color: f.recurrence !== "none" ? T.accent : T.inkSoft, background: "transparent", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Icon name="repeat" size={10} style={{ verticalAlign: 0 }} />{FIN_RECUR[f.recurrence || "none"]}
                </button>

                {f.status === "pending" && (payingId === f.id ? (
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <select value={method} onChange={e => setMethod(e.target.value)} style={{ ...inputStyle, padding: "5px 8px", fontSize: 11.5 }}>
                      {PAY_METHODS.map(m => <option key={m}>{m}</option>)}
                    </select>
                    <button onClick={() => { markPaid(f.id, method); setPayingId(null); }} style={{ ...primaryBtn, padding: "6px 12px", fontSize: 11.5 }}>Confirm</button>
                    <button onClick={() => setPayingId(null)} style={{ ...iconBtn, fontSize: 11.5 }}>Cancel</button>
                  </span>
                ) : (
                  <button onClick={() => setPayingId(f.id)} style={{ ...pillBase, border: `1px solid ${T.accent}`, color: T.accent, background: "transparent" }}>Mark paid</button>
                ))}

                {confirmDel === f.id ? (
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <button onClick={() => { deletePayment(f.id); setConfirmDel(null); }} style={{ ...pillBase, border: "none", background: dangerColor, color: dark ? "#0D0F13" : "#fff" }}>Delete</button>
                    <button onClick={() => setConfirmDel(null)} style={{ ...iconBtn, fontSize: 11.5 }}>Cancel</button>
                  </span>
                ) : (
                  <>
                    <button onClick={() => setEditId(f.id)} style={iconBtn} title="Edit payment"><Icon name="edit" size={12} /></button>
                    <button onClick={() => setConfirmDel(f.id)} style={{ ...iconBtn, color: dangerColor }} title="Delete payment"><Icon name="x" size={13} /></button>
                  </>
                )}
              </div>
            )}
          </div>
        )} />
      </section>
    </div>
  );
}

function PaymentForm({ initial, onSubmit, onCancel, T, inputStyle, primaryBtn }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [category, setCategory] = useState(initial?.category || "other");
  const [payee, setPayee] = useState(initial?.payee || "");
  const [amount, setAmount] = useState(initial?.amount || "");
  const [dueDate, setDueDate] = useState(initial?.dueDate || "");
  const [deliveredAt, setDeliveredAt] = useState(initial?.deliveredAt || "");
  const [note, setNote] = useState(initial?.note || "");
  const submit = () => {
    if (!title.trim() || !amount) return;
    onSubmit({ title: title.trim(), category, payee: payee.trim(), amount: Number(amount), dueDate: dueDate || null, deliveredAt: deliveredAt || null, note: note.trim() });
  };
  // caption sits UNDER the box; all boxes share the same top line so the row stays aligned
  const captioned = (caption, input) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {input}
      <span style={{ fontSize: 10.5, color: T.inkSoft, paddingLeft: 2 }}>{caption}</span>
    </div>
  );
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
      <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="What is this payment? *" style={{ ...inputStyle, flex: "2 1 200px" }} />
      <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inputStyle, flex: "1 1 130px" }}>
        {Object.entries(FIN_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <input value={payee} onChange={e => setPayee(e.target.value)} placeholder="Pay to (vendor / creator)" style={{ ...inputStyle, flex: "1 1 140px" }} />
      <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (R$) *" style={{ ...inputStyle, flex: "1 1 110px" }} />
      {captioned("Payment deadline",
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ ...inputStyle }} />)}
      {category === "ugc" && captioned("Content delivered on",
        <input type="date" value={deliveredAt} onChange={e => setDeliveredAt(e.target.value)} style={{ ...inputStyle }} />)}
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (visible to client)" style={{ ...inputStyle, flex: "2 1 180px" }} />
      <button onClick={submit} style={primaryBtn}>{initial ? "Save" : "Add payment"}</button>
      {onCancel && <button onClick={onCancel} style={{ border: "none", background: "transparent", color: T.inkSoft, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, padding: "8px 6px" }}>Cancel</button>}
    </div>
  );
}

// ---------- Accesses section (per project) ----------
function CopyButton({ value, T }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    await copyText(value);
    setCopied(true); setTimeout(() => setCopied(false), 1400);
  };
  return (
    <button onClick={doCopy} title={copied ? "Copied" : "Copy to clipboard"}
      style={{ border: "none", background: "transparent", cursor: "pointer", padding: "2px 4px", color: copied ? T.accent : T.inkSoft, display: "inline-flex" }}>
      <Icon name={copied ? "check" : "copy"} size={12} style={{ verticalAlign: 0 }} />
    </button>
  );
}

function AccessSection({ T, dark, dangerColor, accesses, addAccess, saveAccess, deleteAccess, reorderAccesses, inputStyle, primaryBtn, iconBtn, pillBase }) {
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [revealed, setRevealed] = useState({}); // id -> bool
  const canReorder = filter === "all"; // ordering only meaningful on the unfiltered list
  const reorderAccessesByIds = (orderedIds) => {
    reorderAccesses(orderedIds); // parent reorders within active project + persists
  };

  const visible = accesses.filter(a => filter === "all" ? true : a.category === filter);

  // Fixed label column so values align vertically; empty fields stay visible for consistent card size
  const Field = ({ label, value, secret, link, id }) => {
    const shown = !secret || revealed[id];
    return (
      <>
        <span style={{ color: T.inkSoft, fontSize: 11.5 }}>{label}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, minHeight: 22 }}>
          {value ? (
            <>
              <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11.5, letterSpacing: shown ? 0 : 1.5 }}>
                {shown ? value : "\u2022".repeat(Math.min(value.length, 10))}
              </span>
              {secret && (
                <button onClick={() => setRevealed(r => ({ ...r, [id]: !r[id] }))} title={shown ? "Hide" : "Show"}
                  style={{ border: "none", background: "transparent", cursor: "pointer", padding: "2px 4px", color: T.inkSoft, display: "inline-flex" }}>
                  <Icon name={shown ? "eyeOff" : "eye"} size={12} style={{ verticalAlign: 0 }} />
                </button>
              )}
              {!link && <CopyButton value={value} T={T} />}
              {link && (
                <button onClick={() => window.open(normalizeUrl(value), "_blank", "noopener,noreferrer")} title="Open in new tab"
                  style={{ border: "none", background: "transparent", cursor: "pointer", padding: "2px 4px", color: T.inkSoft, display: "inline-flex" }}>
                  <Icon name="externalLink" size={12} style={{ verticalAlign: 0 }} />
                </button>
              )}
            </>
          ) : (
            <span style={{ color: T.inkSoft, opacity: 0.45, fontSize: 11.5 }}>{"\u2014"}</span>
          )}
        </span>
      </>
    );
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {[["all", "All"], ...Object.entries(ACCESS_CATEGORIES)].map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} style={{
            ...pillBase, border: `1px solid ${filter === k ? T.accent : T.line}`,
            color: filter === k ? T.accent : T.inkSoft, background: filter === k ? T.accentSoft : "transparent",
          }}>{label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowAdd(v => !v)} style={primaryBtn}>{showAdd ? "Close" : "+ Add access"}</button>
      </div>

      {showAdd && <AccessForm onSubmit={(item) => { addAccess(item); setShowAdd(false); }} T={T} inputStyle={inputStyle} primaryBtn={primaryBtn} />}

      <section style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "6px 20px" }}>
        {visible.length === 0 && <div style={{ fontSize: 12.5, color: T.inkSoft, padding: "14px 0" }}>No accesses in this view.</div>}
        <SortableList items={visible} disabled={!canReorder} onReorder={(ids) => reorderAccessesByIds(ids)}
          renderItem={(a, { handleProps }) => (
          <div key={a.id}
            style={{
              padding: "12px 0",
              borderBottom: `1px solid ${T.line}`,
            }}>
            {editId === a.id ? (
              <AccessForm initial={a} onSubmit={(patch) => { saveAccess(a.id, patch); setEditId(null); }} onCancel={() => setEditId(null)} T={T} inputStyle={inputStyle} primaryBtn={primaryBtn} />
            ) : (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                {canReorder && (
                  <span {...handleProps} title="Drag to reorder" style={{ ...handleProps.style, color: T.inkSoft, display: "flex", paddingTop: 2, userSelect: "none" }}>
                    <Icon name="grip" size={14} />
                  </span>
                )}
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{a.label}</span>
                    <span style={{ ...pillBase, cursor: "default", border: `1px solid ${T.line}`, color: T.inkSoft, background: "transparent", fontSize: 10 }}>{ACCESS_CATEGORIES[a.category]}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", rowGap: 2, alignItems: "center" }}>
                    <Field label="Login" value={a.username} id={a.id + "u"} />
                    <Field label="Password" value={a.password} secret id={a.id} />
                    <Field label="URL" value={a.url} link id={a.id + "l"} />
                    <span style={{ color: T.inkSoft, fontSize: 11.5 }}>Note</span>
                    <span style={{ fontSize: 11.5, color: T.inkSoft, minHeight: 22, display: "inline-flex", alignItems: "center" }}>{a.note || "\u00a0"}</span>
                  </div>
                </div>
                {confirmDel === a.id ? (
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <button onClick={() => { deleteAccess(a.id); setConfirmDel(null); }} style={{ ...pillBase, border: "none", background: dangerColor, color: dark ? "#0D0F13" : "#fff" }}>Delete</button>
                    <button onClick={() => setConfirmDel(null)} style={{ ...iconBtn, fontSize: 11.5 }}>Cancel</button>
                  </span>
                ) : (
                  <span style={{ display: "inline-flex", gap: 2 }}>
                    <button onClick={() => setEditId(a.id)} style={iconBtn} title="Edit access"><Icon name="edit" size={12} /></button>
                    <button onClick={() => setConfirmDel(a.id)} style={{ ...iconBtn, color: dangerColor }} title="Delete access"><Icon name="x" size={13} /></button>
                  </span>
                )}
              </div>
            )}
          </div>
        )} />
      </section>
      <p style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 10 }}>
        Credentials are stored in plain text in this prototype. Before storing real passwords, this section needs encrypted storage.
      </p>
    </div>
  );
}

function AccessForm({ initial, onSubmit, onCancel, T, inputStyle, primaryBtn }) {
  const [label, setLabel] = useState(initial?.label || "");
  const [category, setCategory] = useState(initial?.category || "tool");
  const [username, setUsername] = useState(initial?.username || "");
  const [password, setPassword] = useState(initial?.password || "");
  const [url, setUrl] = useState(initial?.url || "");
  const [note, setNote] = useState(initial?.note || "");
  const submit = () => {
    if (!label.trim()) return;
    onSubmit({ label: label.trim(), category, username: username.trim(), password, url: url.trim(), note: note.trim() });
  };
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="What is this access? *" style={{ ...inputStyle, flex: "2 1 180px" }} />
      <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inputStyle, flex: "1 1 110px" }}>
        {Object.entries(ACCESS_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Login / username / email" style={{ ...inputStyle, flex: "1 1 160px" }} />
      <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" style={{ ...inputStyle, flex: "1 1 130px" }} />
      <input value={url} onChange={e => setUrl(e.target.value)} placeholder="URL" style={{ ...inputStyle, flex: "1 1 160px" }} />
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note" style={{ ...inputStyle, flex: "2 1 160px" }} />
      <button onClick={submit} style={primaryBtn}>{initial ? "Save" : "Add access"}</button>
      {onCancel && <button onClick={onCancel} style={{ border: "none", background: "transparent", color: T.inkSoft, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}>Cancel</button>}
    </div>
  );
}

// ---------- Clients management page ----------
function ClientsPage({ T, dark, dangerColor, clients, setClients, reloadClients, projects, inputStyle, primaryBtn, iconBtn, pillBase }) {
  const isMobile = useIsMobile();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [resetSent, setResetSent] = useState(null); // client id, transient confirmation
  const reorderClientsByIds = (orderedIds) => {
    setClients(cs => {
      const byId = Object.fromEntries(cs.map(c => [c.id, c]));
      const next = orderedIds.map(id => byId[id]).filter(Boolean);
      db.reorderClients(orderedIds).catch(e => console.error("reorder clients failed", e));
      return next;
    });
  };

  const statusStyle = (s) => s === "active"
    ? { color: dark ? "#9CC4A8" : "#3E7050", bg: dark ? "#1B2A20" : "#E6F0E9", label: "Active" }
    : s === "invited"
    ? { color: T.accent, bg: T.accentSoft, label: "Invited" }
    : { color: T.inkSoft, bg: dark ? "#1C2027" : "#EDECE6", label: "Disabled" };

  const projectsOf = (c) => projects.filter(p => (c.projectIds || []).includes(p.id));

  const patch = (id, fn) => {
    setClients(cs => cs.map(c => c.id === id ? { ...c, ...fn(c) } : c)); // optimistic
    const cur = clients.find(c => c.id === id); if (!cur) return;
    const next = fn(cur);
    const dbPatch = {};
    if ("status" in next) dbPatch.status = next.status;
    if ("name" in next) dbPatch.name = next.name;
    if ("company" in next) dbPatch.company = next.company;
    if ("email" in next) dbPatch.email = next.email;
    if ("lastReset" in next) dbPatch.last_reset = next.lastReset;
    if (Object.keys(dbPatch).length) db.updateClient(id, dbPatch).catch(e => console.error(e));
  };
  const toggleAccess = (clientId, projectId) => {
    const c = clients.find(c => c.id === clientId); if (!c) return;
    const has = (c.projectIds || []).includes(projectId);
    setClients(cs => cs.map(x => x.id === clientId ? { ...x, projectIds: has ? x.projectIds.filter(id => id !== projectId) : [...x.projectIds, projectId] } : x));
    (has ? db.revokeAccess(clientId, projectId) : db.grantAccess(clientId, projectId)).catch(e => console.error(e));
  };
  const sendReset = (id) => {
    const c = clients.find(x => x.id === id);
    patch(id, () => ({ lastReset: new Date().toISOString().slice(0, 10) }));
    setResetSent(id); setTimeout(() => setResetSent(null), 2500);
    if (c?.email) supabase.auth.resetPasswordForEmail(c.email).catch(e => console.error(e));
  };

  return (
    <main style={{ flex: 1, padding: isMobile ? "18px 14px" : "30px 36px", maxWidth: 980, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 28, margin: 0, fontWeight: 700, letterSpacing: "-0.015em" }}>Clients</h1>
        <button onClick={() => setShowAdd(v => !v)} style={primaryBtn}>{showAdd ? "Close" : "+ Add client"}</button>
      </div>
      <p style={{ fontSize: 12, color: T.inkSoft, margin: "0 0 18px" }}>
        Manage who can sign in to the client portal. Access controls here are a working mock until authentication is wired to a backend.
      </p>

      {showAdd && <ClientForm onSubmit={async (c) => { setShowAdd(false); try { await db.createClient(c); reloadClients(); } catch (e) { console.error(e); } }} T={T} inputStyle={inputStyle} primaryBtn={primaryBtn} />}

      <section style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "6px 20px" }}>
        {clients.length === 0 && <div style={{ fontSize: 12.5, color: T.inkSoft, padding: "14px 0" }}>No clients yet.</div>}
        <SortableList items={clients} onReorder={(ids) => reorderClientsByIds(ids)}
          renderItem={(c, { handleProps }) => {
          const st = statusStyle(c.status);
          const projList = projectsOf(c);
          return (
            <div key={c.id} style={{ padding: "14px 0", borderBottom: `1px solid ${T.line}` }}>
              {editId === c.id ? (
                <ClientForm initial={c} onSubmit={(p) => { patch(c.id, () => p); setEditId(null); }} onCancel={() => setEditId(null)} T={T} inputStyle={inputStyle} primaryBtn={primaryBtn} />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span {...handleProps} title="Drag to reorder" style={{ ...handleProps.style, color: T.inkSoft, display: "flex", flexShrink: 0, userSelect: "none" }}>
                    <Icon name="grip" size={14} />
                  </span>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", background: T.accentSoft, color: T.accent,
                    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0,
                  }}>{initials(c.name)}</div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name}</span>
                      <span style={{ ...pillBase, cursor: "default", border: "none", color: st.color, background: st.bg, fontSize: 10 }}>{st.label}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 3, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                      {c.company} · <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Icon name="mail" size={11} style={{ verticalAlign: 0 }} />{c.email}</span><CopyButton value={c.email} T={T} />
                      {c.lastReset && <> · password reset sent {fmtDate(c.lastReset)}</>}
                    </div>
                    <div style={{ marginTop: 7 }}>
                      <select value="" onChange={e => { if (e.target.value) toggleAccess(c.id, e.target.value); }}
                        title="Grant or revoke access to a project"
                        style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, background: "transparent", border: `1px dashed ${T.line}`, borderRadius: 999, padding: "3px 9px", cursor: "pointer", fontFamily: "inherit", width: 150 }}>
                        <option value="" disabled>Manage access...</option>
                        {projects.map(p => {
                          const has = (c.projectIds || []).includes(p.id);
                          return <option key={p.id} value={p.id}>{has ? "\u2713 Revoke: " : "+ Grant: "}{p.name}</option>;
                        })}
                      </select>
                    </div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10.5, color: T.inkSoft }}>Access:</span>
                      {projList.length === 0 && <span style={{ fontSize: 10.5, color: T.inkSoft, opacity: 0.6 }}>no projects yet</span>}
                      {projList.map(p => (
                        <span key={p.id} style={{ fontSize: 10, fontWeight: 600, color: T.accent, background: T.accentSoft, borderRadius: 999, padding: "2px 9px" }}>{p.name}</span>
                      ))}
                    </div>
                  </div>

                  {resetSent === c.id ? (
                    <span style={{ fontSize: 11.5, color: T.accent, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="check" size={12} style={{ verticalAlign: 0 }} />Reset link sent</span>
                  ) : (
                    <button onClick={() => sendReset(c.id)} disabled={c.status === "disabled"} title={c.status === "disabled" ? "Enable access first" : "Send a password reset link"}
                      style={{ ...pillBase, border: `1px solid ${T.line}`, color: c.status === "disabled" ? T.line : T.inkSoft, background: "transparent", display: "inline-flex", alignItems: "center", gap: 4, cursor: c.status === "disabled" ? "not-allowed" : "pointer" }}>
                      <Icon name="key" size={11} style={{ verticalAlign: 0 }} />Reset password
                    </button>
                  )}

                  <button onClick={() => patch(c.id, cl => ({ status: cl.status === "disabled" ? "active" : "disabled" }))}
                    style={{ ...pillBase, border: `1px solid ${c.status === "disabled" ? T.accent : T.line}`, color: c.status === "disabled" ? T.accent : T.inkSoft, background: "transparent" }}>
                    {c.status === "disabled" ? "Enable access" : "Disable access"}
                  </button>

                  {confirmDel === c.id ? (
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <button onClick={() => { setClients(cs => cs.filter(x => x.id !== c.id)); setConfirmDel(null); db.deleteClient(c.id).catch(e => console.error(e)); }} style={{ ...pillBase, border: "none", background: dangerColor, color: dark ? "#0D0F13" : "#fff" }}>Delete</button>
                      <button onClick={() => setConfirmDel(null)} style={{ ...iconBtn, fontSize: 11.5 }}>Cancel</button>
                    </span>
                  ) : (
                    <span style={{ display: "inline-flex", gap: 2 }}>
                      <button onClick={() => setEditId(c.id)} style={iconBtn} title="Edit client"><Icon name="edit" size={12} /></button>
                      <button onClick={() => setConfirmDel(c.id)} style={{ ...iconBtn, color: dangerColor }} title="Remove client"><Icon name="x" size={13} /></button>
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        }} />
      </section>
    </main>
  );
}

function ClientForm({ initial, onSubmit, onCancel, T, inputStyle, primaryBtn }) {
  const [name, setName] = useState(initial?.name || "");
  const [company, setCompany] = useState(initial?.company || "");
  const [email, setEmail] = useState(initial?.email || "");
  const submit = () => {
    if (!name.trim() || !email.trim()) return;
    onSubmit({ name: name.trim(), company: company.trim(), email: email.trim() });
  };
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Client name *" style={{ ...inputStyle, flex: "1 1 160px" }} />
      <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Company (matches project client)" style={{ ...inputStyle, flex: "1 1 180px" }} />
      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email *" style={{ ...inputStyle, flex: "1 1 180px" }} />
      <button onClick={submit} style={primaryBtn}>{initial ? "Save" : "Add client"}</button>
      {onCancel && <button onClick={onCancel} style={{ border: "none", background: "transparent", color: T.inkSoft, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}>Cancel</button>}
    </div>
  );
}

// ---------- Client portal (read-only, what the client sees) ----------
// Convention here is the OPPOSITE of the admin: empty fields are hidden, not shown as placeholders.
// Internal tasks never render; progress is computed from client-visible tasks only.
function ClientPortal({ project, T, dark, dangerColor, todayStr, onExit, onReportPayment, exitLabel = "Exit preview", projects, activeId, setActiveId }) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("progress"); // progress | payments
  const [reportingId, setReportingId] = useState(null); // payment being reported (method picker open)
  const [reportMethod, setReportMethod] = useState(PAY_METHODS[0]);
  const [taskView, setTaskView] = useState("active"); // active | all | completed

  // Defensive guard: during state updates `project` can briefly be undefined.
  // Never crash the whole app over a transient render — show a calm fallback.
  if (!project || !Array.isArray(project.stages)) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, color: T.inkSoft, display: "flex",
        alignItems: "center", justifyContent: "center", fontFamily: FONT_STACK, fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  const visibleStages = project.stages.map(s => ({ ...s, tasks: (s.tasks || []).filter(t => t.clientVisible) }));
  const allVisible = visibleStages.flatMap(s => s.tasks);
  const progress = allVisible.length ? Math.round(100 * allVisible.filter(t => t.status === "done").length / allVisible.length) : 0;
  const stageProgress = (s) => s.tasks.length ? s.tasks.filter(t => t.status === "done").length / s.tasks.length : 0;
  // Completion filter (Active hides finished work; recurring tasks have no completedAt so always read active).
  const taskMatchesView = (t) => taskView === "all" ? true : taskView === "completed" ? !!t.completedAt : !t.completedAt;
  const viewStages = visibleStages.map(s => ({ ...s, viewTasks: s.tasks.filter(taskMatchesView) }));

  const finance = project.finance || [];
  const isOverdue = (f) => f.status === "pending" && f.dueDate && f.dueDate < todayStr;
  const pending = finance.filter(f => f.status === "pending");
  const pendingTotal = pending.reduce((s, f) => s + Number(f.amount || 0), 0);
  const overdueItems = pending.filter(isOverdue);

  const statusBadge = (t) => {
    const dark2 = dark;
    const m = {
      todo:    { label: "To do", color: T.inkSoft, bg: dark2 ? "#1C2027" : "#EDECE6" },
      doing:   { label: "In progress", color: T.accent, bg: T.accentSoft },
      review:  { label: "In review", color: dark2 ? "#9BB0D4" : "#4A6398", bg: dark2 ? "#1C2433" : "#E8EDF6" },
      done:    { label: "Done", color: dark2 ? "#9CC4A8" : "#3E7050", bg: dark2 ? "#1B2A20" : "#E6F0E9" },
      blocked: { label: "Waiting", color: dark2 ? "#E2918B" : "#A8453C", bg: dark2 ? "#2E1D1B" : "#F7E6E4" }, // softened label for clients
    };
    return m[t.status];
  };

  const pill = { fontSize: 11, fontWeight: 600, letterSpacing: 0.3, padding: "3px 10px", borderRadius: 999, display: "inline-block" };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.ink, fontFamily: FONT_STACK }}>
      <style>{FONT_IMPORT}</style>
      {/* Preview banner — admin-only affordance */}
      <div style={{ background: T.accent, color: dark ? "#0D0F13" : "#fff", padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 600, gap: 8, flexWrap: "wrap" }}>
        <span>
          {exitLabel === "Sign out"
            ? <>Signed in to {project.client}</>
            : <><Icon name="eye" size={12} style={{ marginRight: 6 }} />Client preview — this is exactly what {project.client} sees</>}
        </span>
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {projects && projects.length > 1 && setActiveId && (
            <select value={activeId} onChange={e => setActiveId(e.target.value)}
              style={{ border: `1px solid ${dark ? "#0D0F13" : "#fff"}`, background: "transparent", color: "inherit", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
              {projects.map(p => <option key={p.id} value={p.id} style={{ color: "#111" }}>{p.name}</option>)}
            </select>
          )}
          <button onClick={onExit} style={{ border: `1px solid ${dark ? "#0D0F13" : "#fff"}`, background: "transparent", color: "inherit", borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{exitLabel}</button>
        </span>
      </div>

      {/* Portal header */}
      <header style={{ background: T.sidebar, color: "#ECEAE4", padding: "26px 0" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: isMobile ? "0 16px" : "0 24px" }}>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.01em" }}>Nebu<span style={{ color: PALETTE.copper }}>.</span> <span style={{ fontSize: 11, opacity: 0.55, letterSpacing: 1.2, textTransform: "uppercase", marginLeft: 8 }}>Client Portal</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 18, flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11.5, letterSpacing: 1.4, textTransform: "uppercase", opacity: 0.6 }}>{project.client}</div>
              <h1 style={{ fontSize: isMobile ? 21 : 26, margin: "4px 0 0", fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.25 }}>{project.name}</h1>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: PALETTE.copper, lineHeight: 1 }}>{progress}%</div>
              <div style={{ fontSize: 11.5, opacity: 0.6 }}>complete</div>
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: isMobile ? "16px 14px 48px" : "24px 24px 60px" }}>
        {/* Process spine */}
        <div style={{ display: "flex", gap: 6, margin: "4px 0 22px" }}>
          {visibleStages.map((s, i) => {
            const pr = stageProgress(s);
            return (
              <div key={s.id} style={{ flex: 1 }}>
                <div style={{ height: 6, borderRadius: 3, background: T.line, overflow: "hidden" }}>
                  <div style={{ width: `${pr * 100}%`, height: "100%", background: T.accent }} />
                </div>
                <div style={{ fontSize: isMobile ? 9.5 : 11.5, marginTop: 6, color: pr === 1 ? T.accent : T.inkSoft, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i + 1}. {s.name}</div>
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: `1px solid ${T.line}` }}>
          {[["progress", "Progress"], ["payments", "Payments"]].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: "8px 16px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit",
              fontSize: 13, fontWeight: tab === k ? 700 : 500,
              color: tab === k ? T.accent : T.inkSoft,
              borderBottom: tab === k ? `2px solid ${T.accent}` : "2px solid transparent", marginBottom: -1,
            }}>{label}{k === "payments" && overdueItems.length > 0 && <span style={{ marginLeft: 6, background: dangerColor, color: dark ? "#0D0F13" : "#fff", borderRadius: 999, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>{overdueItems.length}</span>}</button>
          ))}
        </div>

        {tab === "progress" ? (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
              <div style={{ display: "inline-flex", border: `1px solid ${T.line}`, borderRadius: 8, overflow: "hidden" }}>
                {[["all", "All"], ["active", "Active"], ["completed", "Completed"]].map(([k, label]) => (
                  <button key={k} onClick={() => setTaskView(k)} style={{
                    padding: "5px 14px", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600,
                    background: taskView === k ? T.accent : "transparent",
                    color: taskView === k ? (dark ? "#0D0F13" : "#fff") : T.inkSoft,
                  }}>{label}</button>
                ))}
              </div>
            </div>
            {viewStages.map(s => (
              <section key={s.id} style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "16px 20px", marginBottom: 14 }}>
                <h2 style={{ fontSize: 15, margin: "0 0 4px", fontWeight: 700 }}>{s.name}
                  {s.tasks.length > 0 && <span style={{ fontWeight: 400, color: T.inkSoft, fontSize: 12.5, marginLeft: 8 }}>{s.tasks.filter(t => t.status === "done").length}/{s.tasks.length} done</span>}
                </h2>
                {s.tasks.length === 0 && <div style={{ fontSize: 12.5, color: T.inkSoft, padding: "6px 0" }}>Coming up next.</div>}
                {s.tasks.length > 0 && s.viewTasks.length === 0 && (
                  <div style={{ fontSize: 12, color: T.inkSoft, padding: "6px 0", fontStyle: "italic" }}>
                    {taskView === "active" ? "Everything here is done." : "Nothing completed here yet."}
                  </div>
                )}
                {s.viewTasks.map(t => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${T.line}`, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? T.inkSoft : T.ink }}>{t.title}</div>
                      {t.note && <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>{t.note}</div>}
                      {(t.completedAt || (t.dueDate && t.status !== "done")) && (
                        <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 3 }}>
                          {t.completedAt
                            ? <>Completed {fmtDate(t.completedAt)}</>
                            : (!t.recurrence || t.recurrence === "none")
                              ? <>Expected by {fmtDate(t.dueDate)}</>
                              : <span style={{ color: T.accent, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3 }}><Icon name="repeat" size={10} style={{ verticalAlign: 0 }} />{RECURRENCE[t.recurrence]}</span>}
                        </div>
                      )}
                    </div>
                    {t.urgency === "urgent" && <span style={{ ...pill, background: dangerColor, color: dark ? "#0D0F13" : "#fff" }}>Urgent</span>}
                    <span style={{ ...pill, color: statusBadge(t).color, background: statusBadge(t).bg }}>{statusBadge(t).label}</span>
                  </div>
                ))}
              </section>
            ))}

            {/* Activity timeline */}
            {project.activity.length > 0 && (
              <section style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "16px 20px" }}>
                <h2 style={{ fontSize: 15, margin: "0 0 10px", fontWeight: 700 }}>Latest updates</h2>
                {project.activity.map(a => (
                  <div key={a.id} style={{ display: "flex", gap: 12, padding: "8px 0", borderTop: `1px solid ${T.line}` }}>
                    <div style={{ fontSize: 11.5, color: T.inkSoft, width: 48, flexShrink: 0, paddingTop: 2 }}>{a.when}</div>
                    <div style={{ fontSize: 13 }}>{a.text}</div>
                  </div>
                ))}
              </section>
            )}
          </>
        ) : (
          <>
            {/* Payments summary */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <div style={{ flex: "1 1 160px", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtBRL(pendingTotal)}</div>
                <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 3 }}>to pay ({pending.length})</div>
              </div>
              {overdueItems.length > 0 && (
                <div style={{ flex: "1 1 160px", background: T.panel, border: `1px solid ${dangerColor}`, borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: dangerColor }}>{fmtBRL(overdueItems.reduce((s, f) => s + Number(f.amount || 0), 0))}</div>
                  <div style={{ fontSize: 11, color: dangerColor, marginTop: 3 }}>overdue ({overdueItems.length}) — please pay as soon as possible</div>
                </div>
              )}
            </div>

            <section style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "6px 20px" }}>
              {finance.length === 0 && <div style={{ fontSize: 12.5, color: T.inkSoft, padding: "14px 0" }}>No payments scheduled.</div>}
              {[...finance].sort((a, b) => (a.status === "paid") - (b.status === "paid") || String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"))).map(f => (
                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${T.line}`, flexWrap: "wrap" }}>
                  <div style={{ width: 4, alignSelf: "stretch", borderRadius: 2, background: isOverdue(f) ? dangerColor : f.status === "paid" ? (dark ? "#9CC4A8" : "#3E7050") : T.accent }} />
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, textDecoration: f.status === "paid" ? "line-through" : "none", color: f.status === "paid" ? T.inkSoft : T.ink }}>{f.title}</div>
                    <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 3 }}>
                      {FIN_CATEGORIES[f.category]}{f.payee ? <> \u00b7 pay to {f.payee}</> : null}
                      {f.recurrence !== "none" && <> · <span style={{ color: T.accent, fontWeight: 600 }}>{FIN_RECUR[f.recurrence]}</span></>}
                      {f.dueDate && f.status !== "paid" && (
                        <> · <span style={{ color: isOverdue(f) ? dangerColor : T.inkSoft, fontWeight: isOverdue(f) ? 700 : 400 }}>
                          {isOverdue(f) ? "Overdue — was due" : "due by"} {fmtDate(f.dueDate)}
                        </span></>
                      )}
                      {f.lastPaid && <> · <span style={{ color: dark ? "#9CC4A8" : "#3E7050", fontWeight: 600 }}>paid {fmtDate(f.lastPaid)}{f.method ? ` via ${f.method}` : ""}</span></>}
                    </div>
                    {f.note && <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 3 }}>{f.note}</div>}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>{fmtBRL(f.amount)}</div>

                  {f.status === "pending" && (
                    f.clientReportedAt ? (
                      <span style={{ fontSize: 11, fontWeight: 600, color: T.accent, background: T.accentSoft, borderRadius: 999, padding: "4px 12px", display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <Icon name="check" size={11} style={{ verticalAlign: 0 }} />Payment reported {fmtDate(f.clientReportedAt)}{f.clientMethod ? ` via ${f.clientMethod}` : ""} · awaiting confirmation
                      </span>
                    ) : reportingId === f.id ? (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <select value={reportMethod} onChange={e => setReportMethod(e.target.value)} style={{ padding: "6px 8px", borderRadius: 8, border: `1px solid ${T.line}`, fontSize: 11.5, fontFamily: "inherit", background: T.panel, color: T.ink }}>
                          {PAY_METHODS.map(m => <option key={m}>{m}</option>)}
                        </select>
                        <button onClick={() => { onReportPayment(f.id, reportMethod); setReportingId(null); }} style={{ border: "none", background: T.accent, color: dark ? "#0D0F13" : "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Confirm</button>
                        <button onClick={() => setReportingId(null)} style={{ border: "none", background: "transparent", color: T.inkSoft, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                      </span>
                    ) : (
                      <button onClick={() => setReportingId(f.id)} style={{ border: `1px solid ${T.accent}`, background: "transparent", color: T.accent, borderRadius: 999, padding: "5px 14px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        I made this payment
                      </button>
                    )
                  )}
                </div>
              ))}
            </section>
            <p style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 10 }}>
              After you report a payment, it stays marked as awaiting confirmation until {"the agency"} verifies it was received.
            </p>
          </>
        )}

        <p style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 18, textAlign: "center" }}>Powered by Nebu</p>
      </main>
    </div>
  );
}

// ---------- Edit forms ----------
function ProjectEditForm({ project, onSave, onCancel, inputStyle, primaryBtn, iconBtn }) {
  const [name, setName] = useState(project.name);
  const [client, setClient] = useState(project.client);
  const [contact, setContact] = useState(project.contact);
  return (
    <>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Project name" style={{ ...inputStyle, flex: 2, minWidth: 200 }} />
      <input value={client} onChange={e => setClient(e.target.value)} placeholder="Client" style={{ ...inputStyle, flex: 1, minWidth: 130 }} />
      <input value={contact} onChange={e => setContact(e.target.value)} placeholder="Contact email" style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
      <button onClick={() => onSave(name, client, contact)} style={primaryBtn}>Save</button>
      <button onClick={onCancel} style={{ ...iconBtn, fontSize: 12.5 }}>Cancel</button>
    </>
  );
}

function StageEditForm({ stage, onSave, onCancel, inputStyle, primaryBtn, iconBtn }) {
  const [name, setName] = useState(stage.name);
  return (
    <div style={{ display: "flex", gap: 8, flex: 1 }}>
      <input autoFocus value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onSave(name); if (e.key === "Escape") onCancel(); }}
        style={{ ...inputStyle, flex: 1, maxWidth: 280 }} />
      <button onClick={() => onSave(name)} style={{ ...primaryBtn, padding: "6px 12px", fontSize: 12 }}>Save</button>
      <button onClick={onCancel} style={{ ...iconBtn, fontSize: 12 }}>Cancel</button>
    </div>
  );
}

function TaskEditForm({ task, onSave, onCancel, inputStyle, primaryBtn, iconBtn }) {
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note);
  const [due, setDue] = useState(task.dueDate || "");
  const [rec, setRec] = useState(task.recurrence || "none");
  const save = () => onSave(title, note, due, rec);
  return (
    <div style={{ display: "flex", gap: 8, flex: 1, flexWrap: "wrap" }}>
      <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }}
        placeholder="Task title" style={{ ...inputStyle, flex: 2, minWidth: 160 }} />
      <input value={note} onChange={e => setNote(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }}
        placeholder="Note (optional — clients see this)" style={{ ...inputStyle, flex: 2, minWidth: 160 }} />
      <input type="date" value={due} onChange={e => setDue(e.target.value)} title="Due date / first occurrence"
        style={{ ...inputStyle, minWidth: 130 }} />
      <select value={rec} onChange={e => setRec(e.target.value)} title="Recurrence" style={{ ...inputStyle, minWidth: 100 }}>
        {Object.entries(RECURRENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <button onClick={save} style={{ ...primaryBtn, padding: "7px 13px", fontSize: 12 }}>Save</button>
      <button onClick={onCancel} style={{ ...iconBtn, fontSize: 12 }}>Cancel</button>
    </div>
  );
}

function ActivityInput({ onAdd, inputStyle, primaryBtn, bg }) {
  const [v, setV] = useState("");
  const submit = () => { if (v.trim()) { onAdd(v.trim()); setV(""); } };
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()}
        placeholder="Post an update for the client (e.g. 'Moodboards sent for review')"
        style={{ ...inputStyle, flex: 1, background: bg }} />
      <button onClick={submit} style={primaryBtn}>Post</button>
    </div>
  );
}
