# BrickLab Control Center — phase 1 (read-only)
Same bot token as BrickLab Events, separate long-polling service. Existing notification worker and backup timers are not changed. No AI. The poller runs under systemd DynamicUser, without Docker socket, repo or backup-directory access; the independent fixed root collector publishes only aggregate metrics. No raw logs, personal information or shell commands via Telegram.

## Before install
- Review and test this branch. No migration is required beyond existing 019 for event/bug statistics.
- Existing telegram.json must be root-owned, mode 0600, with a private positive chat_id. For a group destination, do not replace the existing config: phase 1 refuses it.
- Ensure no other getUpdates consumer or webhook uses the token. Existing sendMessage-only workers are compatible. A polling conflict is logged with code 409; do not delete webhooks automatically.
- Run python3 -B tests/telegram_control_test.py and bash -n scripts/install-bricklab-control.sh.
- From /opt/bricklab-cloud, after reviewed release is present: sudo bash scripts/install-bricklab-control.sh.
- Open the existing Telegram bot and send /menu, /status or /start.
- Check sudo systemctl status bricklab-control.service bricklab-control-snapshot.timer; sudo journalctl -u bricklab-control.service -n 30 --no-pager.
- Snapshot updates every 60 seconds after completion. Data older than 180 seconds is shown as unknown; HTTPS probe is from VPS, not external monitoring. Backup status reports systemd result only, not verified restorability.
- To disable: sudo systemctl disable --now bricklab-control.service bricklab-control-snapshot.timer. Existing events continue.

## Next phases (not implemented)
1. Fixed privileged action broker with independent authorization, expiring one-use confirmation, audit, rate limits and concurrency locks; restart, verified backups, guarded deploy and compatible rollback. No arbitrary shell or direct Docker access from bot. Never auto-rollback across incompatible DB migrations.
2. Moderation via existing admin service authorization and audit; private report metadata only, attachment consent, role separation, GitHub issues with redaction.
3. Alert deduplication, maintenance windows, external monitoring independent of VPS, restore drills, limited auto-recovery and scheduled digest. Existing daily events are retained.
4. Release/CI integration, richer analytics and Telegram Mini App with server-side initData verification.
