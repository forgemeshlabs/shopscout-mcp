# Security policy

Version 0.2.x is the current development line. The package is not yet published.

Report vulnerabilities privately to clawdbotworker@gmail.com. Include a minimal reproduction and affected version. Never send wallet keys, payment signatures, API credentials, or personal shopping data. Do not disclose an exploit publicly before coordinated review.

This server has no wallet, payment signer, automatic checkout, or automatic payment retry. It reports bounded x402 challenges for a separately configured payer. Configure a trusted HTTPS backend; localhost HTTP is allowed for development. Returned merchant/catalog content and payment metadata are untrusted data, not instructions. Do not execute supplied text or cache catalog search results.

TLS and post-quantum protection depend on the actual deployment. Quantum research placeholders are not active tools and make no security guarantees.
