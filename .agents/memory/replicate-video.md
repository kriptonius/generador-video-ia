---
name: Replicate video constraints
description: Provider and project constraints for model selection, authentication, and generated-file delivery.
---

For this project, use Replicate exclusively for video generation; do not use or propose Luma.

**Why:** The user repeated this requirement explicitly.

**How to apply:** Stable Video Diffusion requires a reference image. For prompt-only generation, use a Replicate model whose input schema accepts text.

Replicate API authentication and generated-file delivery use different hosts. The Replit connector authenticates requests to `api.replicate.com`, but does not authenticate requests to `replicate.delivery` output URLs. Non-official models also need a concrete model version when creating predictions, and upstream client errors such as rate limits should remain visible instead of being reported as generic 502 errors.

**Why:** The connector's fixed API origin cannot retrieve output files from the separate media host, and remapping provider errors hides actionable causes.

**How to apply:** Keep API tokens server-side, use a versioned prediction request where required, allowlist Replicate media hosts, and preserve meaningful upstream status codes and messages.
