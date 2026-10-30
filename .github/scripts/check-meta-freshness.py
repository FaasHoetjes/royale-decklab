"""Fails when production hasn't refreshed its meta for too long, so a crawler that quietly stopped gets noticed.

Usage: check-meta-freshness.py [status URL] [max age in hours]
"""
import json
import sys
import time
import urllib.request

url = sys.argv[1] if len(sys.argv) > 1 else "https://royaledecklab.com/api/meta/status"
max_hours = float(sys.argv[2]) if len(sys.argv) > 2 else 12


def fetch_status():
    request = urllib.request.Request(url, headers={"User-Agent": "royaledecklab-freshness-check"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except Exception as error:
            if attempt == 2:
                print(f"::error::Couldn't read {url}: {error}")
                sys.exit(1)
            time.sleep(20)


status = fetch_status()
age_hours = status["cacheAgeMs"] / 3_600_000
print(f"Last refresh {status['lastRefresh']} ({age_hours:.1f} hours ago), {status['deckCount']} decks")

problems = []
if age_hours > max_hours:
    problems.append(
        f"The meta was last refreshed {age_hours:.1f} hours ago (limit {max_hours:g}). Crawls may be failing: "
        "check that CLASH_ROYALE_API_KEY is still bound to the server's IP, and the server logs."
    )
if status["deckCount"] == 0:
    problems.append("The meta has no decks.")

for problem in problems:
    print(f"::error::{problem}")
sys.exit(1 if problems else 0)
