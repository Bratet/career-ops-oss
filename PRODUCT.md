# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
The primary user manages their own job search from a local computer.

## Product Purpose
Track applications, analyze job postings, and prepare tailored resumes from maintained source resumes.

## Positioning
The application keeps the tracker, source resumes, tailored documents, and AI run records together in a local workspace.

## Operating Context
The user reviews opportunities, creates an application from a posting or without one, checks the AI analysis, tailors a resume, and tracks the outcome.

## Capabilities and Constraints
The app runs on localhost with Next.js. Repository data lives under `workspace/`. AI features use authenticated local Claude and Codex CLIs. Appearance supports system, light, and dark themes. The application tracker and index are operational data; source resumes are maintained separately from reproducible application folders.

## Evidence on Hand
The current routes, UI, and local workspace structure are the source of product behavior. No marketing claims or external service promises are established.

## Product Principles
- Make the next application step clear.
- Keep AI choices understandable and visible.
- Preserve local data and source documents.
