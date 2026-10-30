# Security policy

[English](SECURITY.md) · [Português (Brasil)](SECURITY.pt-BR.md)

## Project status

Uorqui is currently **pre-MVP**. No new Uorqui service or executable application is published from this repository. The legacy business messenger is a separate product; this document does not describe its security practices.

## Reporting a vulnerability

Please **do not disclose security vulnerabilities, proof-of-concept exploits, personal information or credentials in public issues or pull requests**.

If GitHub's private vulnerability reporting is enabled for this repository, use its **Security → Report a vulnerability** flow. Otherwise, contact a repository maintainer privately through a communication channel they explicitly provide. If no private contact channel is available, do not post sensitive details in a public discussion.

A maintainer should assess reports before publishing technical details. Response timelines and supported-version guarantees are **not yet defined**; we will update this document when a security process is in place.

## Security requirements for future implementation

- Enforce permissions on the server, including private communities, private channels, posts, media access and notifications.
- Apply input validation, abuse protection, request limits and safe upload handling.
- Store tokens, keys and credentials outside source control.
- Protect transport with TLS and define access logging, backups and data-retention controls.
- Do not claim end-to-end encryption until a reviewed design is implemented.
- Keep potentially sensitive security findings out of public issue trackers until coordinated disclosure is appropriate.

## Scope

Use this policy for code and documentation **in this repository**. Security concerns about other products, systems or domain deployments must be sent to their actual operators.
