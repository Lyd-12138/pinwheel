# Security reports

Do not publish real notes, passwords, encryption keys or personal attachment
paths in issues. Use a minimal synthetic sample to describe a problem.

The repository owner should enable GitHub private vulnerability reporting under
Settings → Code security. Use the repository's Security → Report a vulnerability
page when available. Do not post exploitable details in a public issue.

This is a development preview. Encryption protects document bodies, history and
recovery records; it does not encrypt filenames, images or attachments. Keep
independent backups. Browser previews of Harmony services do not replace native
compiler or device verification.

The 2026-10-26 review and reproducible checks are in
[docs/security-2026-10-26/REPORT.md](docs/security-2026-10-26/REPORT.md).
Source version 0.10.2 includes the fixes; older 0.10.1 binaries and GitHub-ready
archives do not. Run `npm test`, `npm run test:security-ui` after building, and
`npm run audit:dependencies` to repeat the checks. The dependency check sends
only public package names and versions to the official npm advisory service.

Encryption uses AES-256-GCM with scrypt-derived keys. While a document is open,
plaintext exists in process memory. JavaScript strings, swap and crash dumps are
not securely erased. Valid older ciphertext can be restored; this format does
not provide rollback detection. Authorized attachments may be included in an
exported note package. Filenames, images and attachments remain unencrypted.

Archive size limits and input checks reduce resource abuse; they do not prove
that every complex document or image renders within a fixed CPU budget.
Checks for filesystem links do not promise complete protection against a local
attacker concurrently changing paths with the same OS account privileges.
External viewers handle allowlisted attachment types under their own security
policies. Native platform tests and code signing remain necessary before a
production release. Passing these checks is not a security certification.
