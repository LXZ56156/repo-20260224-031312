# Workflow Records

This directory stores machine-written JSONL records for important local workflows.

- `miniapp-ci.jsonl`: written after successful `npm run mp:preview`, `npm run mp:preview:deliver`, or `npm run mp:upload`. Phone delivery records use `event=preview_delivery_success` and point to the validated history/latest QR evidence.
- `cloudfunctions-deploy.jsonl`: written after successful `scripts/deploy-cloudfunctions.sh` deployment of each function.
- `ui-screenshot.jsonl`: written after a complete successful full run or the fixed `npm run screenshot:smoke` set. Each record includes three-frame coherence, session-bound window restoration, and runtime diagnostic proof. Explicit single/subset runs never replace the canonical latest record; capture or window-restore failures write no success record.
- `*-latest.json`: latest record for quick lookup.

Each JSONL line and `*-latest.json` is point-in-time local workflow evidence, not a mutable statement of the repository or production state. Read the capture-time `git.branch`, `git.head`, `git.dirty`, and `git.dirtyFiles` fields together; `latest` means the newest successful record in that stream, not the current clean HEAD. Screenshot evidence is not Git push, mini-program upload, cloud deployment, or online release evidence. Online status is recorded explicitly in `docs/tasks/current.md`.

Do not hand-edit JSONL or latest records to make them match a later commit. Generate a new qualifying workflow record when new evidence is required.

Preview/upload and cloud deploy commands preflight this directory before any remote action. If storage becomes unwritable only after a remote success, the command exits with the distinct `remote action succeeded, evidence write failed` contract instead of reporting the remote operation itself as failed; do not blindly retry that remote action.

`preview_delivery_success` is preview-only evidence, never online-release evidence. Its QR files live in the Git-ignored `D:\projects(WIN)\badminton-miniapp\preview-qrcodes` directory; failed delivery, damaged QR output, or evidence-write failure must not replace the prior `latest-preview-qrcode.*` pair.

Use:

```bash
npm run records:latest
```

Do not put secrets here. The writer redacts authorization headers, Bearer values, access/refresh/ID tokens, API keys, passwords, app secrets, and private-key fields, including common URL/JSON string forms.
