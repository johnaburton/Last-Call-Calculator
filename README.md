# Last Call Calculator

Scores the drink you're thinking about ordering at a bar, based on price, strength, how much you'll enjoy it and the scene.

score = enjoyment × fit × √(standard drinks) ÷ price (×1.2 if rare)

## Features
- Score a drink by size and ABV, or by ingredients from a cocktail library
- Scan a menu photo, ranked by score, with deal and happy-hour detection (uses each user's own Anthropic API key, stored only on their device)
- Turn factors on or off
- Ratings, history and a next-round forecast
- Name + 4-digit PIN accounts

## Stack
Static HTML/CSS/JS plus Vercel Functions in `api/`, with data in a private Vercel Blob store.

Environment variables (set in Vercel, never committed):
- `SESSION_SECRET`: signs sign-in tokens
- `BLOB_READ_WRITE_TOKEN`: added automatically when the Blob store is connected
