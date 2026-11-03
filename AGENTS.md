# Forma on GitHub Pages

This is the active public fallback catalogue, migrated from Beget on 2026-11-04.
Read README.md and data/catalog.json first. Public models are under assets/.
Use site-config.js for origin and project-subdirectory-aware URLs; never hardcode
root /catalog or Beget API URLs into the frontend. GitHub Pages serves static files.
All browser additions are explicitly labelled local drafts, exported in settings.
Never put GitHub tokens, SSH keys, MySQL configuration, Android signing material
or credential caches in the repository. Git uses its existing credential manager.
Local owner configuration only gives a repository path and is outside this checkout.

Source identity and stable viewerPath must survive model replacement. Preserve
PDF/JPG and project fields. Never guess a match if source IDs or titles conflict.
Run tools/validate_site.py and tests/test-routing.mjs before publishing. Check the
GitHub Pages workflow and live model after push; a Git push alone is not deployment.
Do not use the one-off migrate_local.py to reset newly published records.

Current dataset recovered from local copies: seven projects; live Beget database
was unavailable. The latest known published First Trest is Fusion v101,1539 bodies;
newer CAD revisions must be explicitly identified before replacing that model.
Engels restored local v67,1C v371,Touchpanel v9; retain their labels/materials/joints.
No original CAD files are edited by website migration.
