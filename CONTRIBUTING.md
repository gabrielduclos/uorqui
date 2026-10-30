# Contributing to Uorqui

[English](CONTRIBUTING.md) · [Português (Brasil)](CONTRIBUTING.pt-BR.md)

Thank you for considering a contribution to Uorqui.

> **Current status:** pre-MVP. A basic web/API development scaffold now exists; the actual social platform, database and deployed service do not. See [Getting started](docs/en/getting-started.md).

## Before you start

- Read the [vision](docs/en/vision.md), [product requirements](docs/en/product.md), [roadmap](docs/en/roadmap.md) and [code of conduct](CODE_OF_CONDUCT.md).
- For substantial features or architecture changes, open a GitHub issue or discussion first. Do not assume that a proposed technology has been approved.
- Start small: clarify requirements, fix broken links, add tests once there is code, or improve accessible language and bilingual documentation.
- Check that your proposed change does not introduce traditional group chats; collective interaction belongs in community channels.

## Documentation rules

- English is the primary GitHub documentation language; **Brazilian Portuguese is maintained alongside it**.
- When changing product behavior or architecture, update both translations in the same pull request.
- Keep confirmed decisions separate from ideas or hypotheses; label proposals clearly.
- Exclude business strategy, unpublished pricing, customer research, internal financial estimates, credentials and user information from the public repository.

## Pull requests

1. Fork the repository and create a descriptive branch.
2. Make a focused change and explain **why** it is needed.
3. Link the relevant issue, if one exists; describe affected product flows.
4. Update both language versions of related documentation.
5. When code and test commands become available, run the documented checks and include relevant results.
6. Submit a pull request for review. Maintainers may ask for adjustments before merging.

Do not commit secrets, authentication tokens, production data, third-party proprietary code or media without appropriate licenses.

## Quality expectations

Accessibility, privacy boundaries, mobile usability, resilient real-time messaging and resource limits for media/voice matter from the beginning. Changes touching permissions or private community content require server-side enforcement and security review.

## License

By contributing, you agree that your contributions will be licensed under the repository's [MIT License](LICENSE), unless an explicit written agreement says otherwise. Make sure you have the right to contribute your work.

For vulnerabilities, **do not publish exploit details in a public issue**; see [SECURITY.md](SECURITY.md).
