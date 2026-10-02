---
name: morning-briefing
description: Build Malte's morning briefing: calendar, weather, top news. Use when he asks for a briefing or "was steht an".
---

# Morning Briefing

When Malte asks for a morning briefing (or "was steht an", "briefing"):

1. Check today's date with `bash` (`date`).
2. Use `webfetch` to get:
   - Weather for his area (e.g. https://wttr.in/Berlin?format=j1 or similar)
   - Top tech news headlines (e.g. Hacker News front page)
3. Summarize in German, short and chatty:
   - 📅 date + weekday
   - 🌤 weather in one line
   - 📰 3-5 headlines, one line each
4. Keep it under 15 lines. No fluff.

If a source fails, skip it silently and deliver the rest.
