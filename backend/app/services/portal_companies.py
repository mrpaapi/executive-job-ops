"""
Curated target-company list for the Portal Scanner.

Each entry is a (display_name, slug) tuple. Slugs are the URL handle the
platform uses on its public job board:

  * Greenhouse → https://boards-api.greenhouse.io/v1/boards/<slug>/jobs
  * Lever      → https://api.lever.co/v0/postings/<slug>
  * Ashby      → https://api.ashbyhq.com/posting-api/job-board/<slug>
  * Wellfound  → https://wellfound.com/company/<slug>/jobs

These are best-effort defaults — add/remove companies here or override
per-request via the `companies` query param on /api/discovery/source.
Unknown slugs return empty quietly; the scanner reports the aggregate count.
"""

GREENHOUSE_COMPANIES: list[tuple[str, str]] = [
    ("Anthropic",    "anthropic"),
    ("Stripe",       "stripe"),
    ("Databricks",   "databricks"),
    ("Figma",        "figma"),
    ("Notion",       "notion"),
    ("Hugging Face", "huggingface"),
    ("Canva",        "canva"),
    ("Vercel",       "vercel"),
    ("Plaid",        "plaid"),
    ("Airtable",     "airtable"),
    ("Ramp",         "ramp"),
    ("Brex",         "brex"),
    ("Asana",        "asana"),
    ("Snowflake",    "snowflake"),
    ("HashiCorp",    "hashicorp"),
    ("GitLab",       "gitlab"),
    ("Coinbase",     "coinbase"),
    ("Robinhood",    "robinhood"),
    ("Discord",      "discord"),
    ("Reddit",       "reddit"),
    ("Twilio",       "twilio"),
    ("MongoDB",      "mongodb"),
    ("Elastic",      "elastic"),
    ("Confluent",    "confluent"),
    ("Datadog",      "datadog"),
    ("Deel",         "deel"),
    ("Gusto",        "gusto"),
    ("Shopify",      "shopify"),
    ("Monzo",        "monzo"),
    ("DoorDash",     "doordash"),
    ("Instacart",    "instacart"),
    ("Webflow",      "webflow"),
    ("Cloudflare",   "cloudflare"),
    ("Affirm",       "affirm"),
    ("Chime",        "chime"),
]

LEVER_COMPANIES: list[tuple[str, str]] = [
    ("Netflix",   "netflix"),
    ("Palantir",  "palantir"),
    ("Attentive", "attentive"),
    ("Kong",      "kong"),
    ("Mux",       "mux"),
    ("Thinkific", "thinkific"),
    ("Lattice",   "lattice"),
    ("Highspot",  "highspot"),
]

ASHBY_COMPANIES: list[tuple[str, str]] = [
    ("OpenAI",     "openai"),
    ("ElevenLabs", "elevenlabs"),
    ("Retool",     "retool"),
    ("n8n",        "n8n"),
    ("Linear",     "linear"),
    ("Supabase",   "supabase"),
    ("Mistral AI", "mistral"),
    ("Perplexity", "perplexity"),
    ("Cohere",     "cohere"),
    ("Modal",      "modal"),
    ("Replicate",  "replicate"),
    ("PostHog",    "posthog"),
    ("Raycast",    "raycast"),
    ("Arc",        "arc"),
]

WELLFOUND_COMPANIES: list[tuple[str, str]] = [
    ("Anthropic",  "anthropic"),
    ("OpenAI",     "openai"),
    ("ElevenLabs", "elevenlabs"),
    ("Retool",     "retool"),
]
