---
name: paperclip-church-outreach
description: Deep-research churches, enrich them as Paperclip leads, and run the full autonomous outreach pipeline (Content → CMO → Outreach).
version: 1.0.0
---

# Paperclip Church Outreach Pipeline

Use this skill when the user wants to research a list of churches and push them through the full Paperclip autonomous agent pipeline for FluxSpeak outreach.

## Pipeline Overview

```
User provides church list
        ↓
Research Agent (manual deep research)
        ↓
Inject enriched leads into Paperclip format
        ↓
Content Agent drafts tweets + DMs
        ↓
CMO Agent reviews & approves
        ↓
Outreach Agent generates cold emails
        ↓
Consolidated report
```

## Step 1: Deep Research Each Church

For each church, run a targeted web search combining:
- Church name + city
- Keywords: `pastor`, `contact`, `service times`, `website`

Example query:
```
"Harvest Field Church Fort Myers pastor contact service times"
```

Use `web_search` first, then `web_extract` on promising URLs. For staff/pastoral team pages that don't extract well, use `browser_navigate` + `browser_console` with:
```javascript
document.querySelector('.main-content, #ajax-content-wrap, article, .entry-content')?.innerText || document.body.innerText
```

If the page is heavily JS-rendered and the snapshot is truncated, scroll or click relevant nav links (e.g., `Contact`, `Our Pastors`) then re-run the console extraction.

### High-value URLs to check
- `/about-us`, `/our-team`, `/leadership`, `/pastoral-team`, `/contact`, `/locations`, `/iglesia`
- Facebook pages (for service times in descriptions)
- Yelp/DiscoverMass (for phone numbers and addresses)

## Step 2: Create Enriched Paperclip Leads

Save leads to:
```
/root/.hermes/paperclip/logs/leads_YYYYMMDD_HH.json
/root/.hermes/paperclip/logs/hot_leads_YYYYMMDD.json
```

### Required Lead Schema

```json
{
  "handle": "domain.tld",
  "name": "Church Name",
  "church_name_clean": "Church Name",
  "pastor_name": "Pastor First Last",
  "primary_email": "pastor@church.tld",
  "emails": [{"email": "pastor@church.tld", "type": "primary"}],
  "phones": ["(555) 123-4567"],
  "address": "123 Main St, City, ST 12345",
  "tweet_text": "Short description of multicultural/translation focus",
  "tweet_url": "https://church.tld/",
  "source_query": "manual deep research",
  "found_at": "2026-01-01T12:00:00",
  "source_platform": "web_search",
  "relevance_score": 92,
  "score": 92,
  "languages_mentioned": ["Spanish", "Portuguese"],
  "translation_pain_signals": [
    "Currently using interpretation",
    "Running bilingual services"
  ],
  "has_translation": true,
  "service_times": "Sundays 9AM & 11AM",
  "enriched_at": "2026-01-01T12:00:00",
  "enrichment_notes": "Any additional context discovered",
  "personalized_hook": "Hi Pastor Name, I came across Church Name and was struck by..."
}
```

### CRITICAL: Email Format Pitfall
The `email_sender.py` module does NOT recognize `primary_email`. You MUST also include:
```json
"emails": [{"email": "pastor@church.tld", "type": "primary"}]
```
Without this array, cold emails will fail with "No email found" even when `primary_email` is present.

### Scoring Guidance
- Base score: 85-100 for churches actively running multilingual services
- +5 for explicit translation/interpretation pain signals
- +5 for plans to expand to new languages
- +3 for multicultural/multi-ethnic stated mission
- Cap at 100

## Step 3: Run the Paperclip Pipeline

Execute each agent in order:

### Content Agent
```bash
cd /root/.hermes/paperclip && /usr/local/bin/python3 -c "
import sys
sys.path.insert(0, '/root/.hermes/paperclip')
sys.path.insert(0, '/root/.hermes/paperclip/agents')
from agents.content_agent import ContentAgent
agent = ContentAgent()
result = agent.create_content_batch()
print(result)
"
```

### CMO Agent
```bash
cd /root/.hermes/paperclip && /usr/local/bin/python3 -c "
import sys
sys.path.insert(0, '/root/.hermes/paperclip')
sys.path.insert(0, '/root/.hermes/paperclip/agents')
from agents.cmo_agent import CMOAgent
agent = CMOAgent()
result = agent.heartbeat()
print(result)
"
```

### Outreach Agent (Cold Emails)
```bash
cd /root/.hermes/paperclip && /usr/local/bin/python3 -c "
import sys
sys.path.insert(0, '/root/.hermes/paperclip')
sys.path.insert(0, '/root/.hermes/paperclip/agents')
from agents.outreach_agent import OutreachAgent
agent = OutreachAgent()
result = agent.run_cold_email_outreach(max_leads=10, dry_run=True)
print(result)
"
```

## Step 4: Fix Common Issues

### Issue: Reddit outreach crashes
**Symptom:** `TypeError: RedditOutreach.find_opportunities() got an unexpected keyword argument 'dry_run'`

**Fix:** Call `run_cold_email_outreach()` directly instead of `heartbeat()` if you only need emails, or patch `agents/outreach_agent.py` line 496 to remove the `dry_run=True` kwarg.

### Issue: Social posts fail to execute
**Symptom:** `No such file or directory: 'clix'` or `No module named 'atproto'`

**Cause:** The CMO agent tries to post to X/Bluesky/Reddit but those CLI tools aren't installed in this environment.

**Fix:** This is expected. Content is still drafted, queued, and approved. Social execution requires manual posting or deployment to the machine with `clix` installed.

### Issue: Cold emails show "No email found"
**Symptom:** Outreach agent finds leads but prints "No email found" for each.

**Fix:** Ensure the lead JSON includes `"emails": [{"email": "...", "type": "primary"}]` — not just `primary_email`.

## Step 5: Personalize Cold Emails (Required User Preference)

The user has a specific cold email persona for FluxSpeak outreach. **This is now permanently embedded in `agents/email_sender.py`** — the Outreach Agent generates emails with this tone automatically. Only manually rebuild if the user explicitly requests a different tone.

### Persona Rules
- **Tone:** Deeply personal, solo developer. Not a big tech company.
- **Bio:** Solo developer building FluxSpeak in Southwest Florida, married to a beautiful Colombian wife, with two children.
- **Angle:** Frame language barrier work as part of his family story and personal mission to help churches impact their communities.
- **Language:** No corporate/big-tech speak. No em-dashes.
- **Greeting:** Strip titles (Pastor, Rev., Dr., Fr.) and use actual first names: `Hi Greg,`, `Hi China,`, etc.
- **Value prop:** Focus on QR-code simplicity, no second services, no interpreter scheduling.
- **CTA:** Low-pressure — `quick 5-minute conversation`, `no pressure at all`.
- **Sign off:**
  ```
  Warmly,
  Abdias
  Founder, FluxSpeak
  https://fluxspeak.com
  ```

### First-Name Extraction
The patched `email_sender.py` now includes `_first_name()` which strips titles automatically. Special case: `Fr. Jayabalan (Jay) Raju` resolves to `Jay`.

### Rebuilding Emails After Persona Update
Only do this if the user asks for a one-off rewrite. The agent code is now the source of truth:
```python
for lead in leads:
    lead['email_subject'] = subject
    lead['email_text'] = text
    lead['email_html'] = html
```
Then re-save both `leads_YYYYMMDD_HH.json` and `hot_leads_YYYYMMDD.json`.

## Step 6: Generate Report

Create a consolidated report at:
```
/root/.hermes/paperclip/reports/NAME_pipeline_report.txt
```

Include:
1. **Church Intelligence** — one section per church with contact info, pastor, languages, service times, score
2. **Content Output** — drafted tweets, DMs, and cold email subjects
3. **Personalized Emails** — include the humanized, persona-driven cold email drafts
4. **Pipeline Status** — agent-by-agent completion status
5. **Files Generated** — list of JSON/queue files created

## Key File Locations

| File | Purpose |
|------|---------|
| `/root/.hermes/paperclip/logs/leads_YYYYMMDD_HH.json` | Full scored lead list |
| `/root/.hermes/paperclip/logs/hot_leads_YYYYMMDD.json` | Hot leads for outreach |
| `/root/.hermes/paperclip/logs/email_outreach_batch_YYYYMMDD_HH.json` | Cold email batch |
| `/root/.hermes/paperclip/content_queue/queue_YYYYMMDD.json` | Queued tweets/DMs |
| `/root/.hermes/paperclip/approved_content/approved_*.json` | CMO-approved content |
| `/root/.hermes/paperclip/reports/` | Final human-readable reports |

## OPSEC Reminder

All DMs and emails are humanized through HermesSpeaks. The CMO auto-approval checks for:
- Length limits
- No profanity
- No competitor mentions
- Brand alignment ("fluxspeak", "translation", or "language" must appear)

## Live Send Approval

Cold emails and DMs default to `dry_run=True`. To send live emails, change to `dry_run=False` in the outreach agent call. **Always confirm with the user before switching to live mode.**
