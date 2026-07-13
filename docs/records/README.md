# Workflow Records

This directory stores machine-written JSONL records for important local workflows.

- `miniapp-ci.jsonl`: written after successful `npm run mp:preview` or `npm run mp:upload`.
- `cloudfunctions-deploy.jsonl`: written after successful `scripts/deploy-cloudfunctions.sh` deployment of each function.
- `ui-screenshot.jsonl`: written after a complete successful full run or the fixed `npm run screenshot:smoke` set. Each record includes three-frame coherence, session-bound window restoration, and runtime diagnostic proof. Explicit single/subset runs never replace the canonical latest record; capture or window-restore failures write no success record.
- `*-latest.json`: latest record for quick lookup.

Preview/upload and cloud deploy commands preflight this directory before any remote action. If storage becomes unwritable only after a remote success, the command exits with the distinct `remote action succeeded, evidence write failed` contract instead of reporting the remote operation itself as failed; do not blindly retry that remote action.

Use:

```bash
npm run records:latest
```

Do not put secrets here. The writer redacts authorization headers, Bearer values, access/refresh/ID tokens, API keys, passwords, app secrets, and private-key fields, including common URL/JSON string forms.
