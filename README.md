# Systems Curriculum

A self-study curriculum for DevOps, Cybersecurity, and AI/ML: 35 modules in four tracks, each one building a real portfolio project, with certifications last, on purpose.

It is a single HTML file. No build step, no framework, no server.

## Use it

- **Online:** open the site address (see the Cloudflare Pages deployment for this repo).
- **Offline:** download `curriculum.html` and double-click it.

Progress (finished tasks, quiz results, points, streak) is saved in the browser. It is saved per device, so use **Export** and **Import** in the sidebar to carry progress between a PC and a tablet.

## What is inside

- Four tracks: A DevOps (13 modules), B Security (11), C AI/ML (8), X where they meet (3).
- Every module goes Foundation to Mastery with labs, exercises, a portfolio repository plan, self-check questions, and exam mapping.
- Interactive parts: tap-to-define hard words, step-through diagrams, calculators, matching and ordering games, in-page command practice, spaced-repetition review, points and streaks, a learning map, and a portfolio view.
- Budget for everything: zero. Only the exams cost money, and they come last.

## Check the file

    node qa/qa-harness.js

Renders every module headlessly, audits that no content was lost, checks escaping, widget ids, and syntax. It must print `ALL CHECKS PASS` before the file is handed over or deployed.

## Deploy

    bash scripts/deploy.sh

Runs the harness, then publishes `curriculum.html` as `index.html` to Cloudflare Pages (needs `npx wrangler login` once).

## Layout

    curriculum.html      the whole app: styles, content, logic
    qa/                  harness, fragment validator, module splice and replace tools
    scripts/deploy.sh    Cloudflare Pages deploy
