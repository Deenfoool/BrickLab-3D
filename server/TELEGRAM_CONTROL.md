# BrickLab Control Center — phases 1–2 (read-only by default)
Same bot token as BrickLab Events, separate long-polling service. Existing notification worker and backup timers are not changed. No AI. The poller runs under a dedicated unprivileged systemd account, without Docker socket, repo or backup-directory access; the independent fixed root collector publishes only aggregate metrics. No raw logs, personal information or shell commands via Telegram.

## Before install
- Review and test this branch. No migration is required beyond existing 019 for event/bug statistics.
- Existing telegram.json must be root-owned, mode 0600, with a private positive chat_id. For a group destination, do not replace the existing config: phase 1 refuses it.
- Ensure no other getUpdates consumer or webhook uses the token. Existing sendMessage-only workers are compatible. A polling conflict is logged with code 409; do not delete webhooks automatically.
- Run python3 -B tests/telegram_control_test.py and bash -n scripts/install-bricklab-control.sh.
- From /opt/bricklab-cloud, after reviewed release is present: sudo bash scripts/install-bricklab-control.sh.
- Open the existing Telegram bot and send /menu, /status or /start.
- Check sudo systemctl status bricklab-control.service bricklab-control-snapshot.timer; sudo journalctl -u bricklab-control.service -n 30 --no-pager.
- Snapshot updates every 60 seconds after completion. Data older than 180 seconds is shown as unknown; HTTPS probe is from VPS, not external monitoring. Backup status reports systemd result only, not verified restorability.
- To disable: sudo systemctl disable --now bricklab-control.service bricklab-control-snapshot.timer bricklab-control-actions.socket. Existing events continue.

## Optional operator actions
Default install disables the action socket. To explicitly enable after review and tests:
`sudo bash scripts/install-bricklab-control.sh --enable-actions`.
The Docker page can restart only an already running BrickLab app, not PostgreSQL. The backup page starts the two existing systemd backup services; successful units do not prove restorability. Buttons require private owner confirmation within 60 seconds; confirmation is single-use and lost on bot restart. The root broker independently checks the Unix peer UID, request shape and allowlist, serializes requests with the repository deploy script, and persists accepted requests and cooldowns in /var/lib/bricklab-control-actions/audit.sqlite3 (10 min restart / 30 min backup). View journal with `sudo journalctl -u 'bricklab-control-actions@*'`. A timeout reports unknown, not success. No automatic retries. A compromised bot account can invoke these two limited actions; Telegram confirmation is not a second authentication factor. Disable with `sudo systemctl disable --now bricklab-control-actions.socket`; in-flight operations may finish. Only the updated release script shares the lock; coordinate any manual deployment/maintenance separately. Logs show keyword counts only, not raw content. Run `python3 -B tests/telegram_control_actions_test.py` too.

## Next phases (not implemented)
1. Restore verification, guarded deploy and compatible rollback, independent step-up authentication. Never auto-rollback across incompatible DB migrations.
2. Moderation via existing admin service authorization and audit; private report metadata only, attachment consent, role separation, GitHub issues with redaction.
3. Alert deduplication, maintenance windows, external monitoring independent of VPS, restore drills, limited auto-recovery and scheduled digest. Existing daily events are retained.
4. Release/CI integration, richer analytics and Telegram Mini App with server-side initData verification.
