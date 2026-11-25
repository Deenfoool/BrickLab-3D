# BrickLab Control Center — phases 1–2 (read-only by default)
Same bot token as BrickLab Events, separate long-polling service. Existing notification worker and backup timers are not changed. No AI. The poller runs under a dedicated unprivileged systemd account, without Docker socket, repo or backup-directory access; the independent fixed root collector publishes only aggregate metrics. No raw logs, personal information or shell commands via Telegram.

## Before install
- Review and test this branch. No migration is required beyond existing 019 for event/bug statistics.
- Existing telegram.json must be root-owned, mode 0600, with a private positive chat_id. For a group destination, do not replace the existing config: the installer refuses it.
- Ensure no other getUpdates consumer or webhook uses the token. Existing sendMessage-only workers are compatible. A polling conflict is logged with code 409; do not delete webhooks automatically.
- Run python3 -B tests/telegram_control_test.py and bash -n scripts/install-bricklab-control.sh.
- From /opt/bricklab-cloud, after reviewed release is present: sudo bash scripts/install-bricklab-control.sh.
- Open the existing Telegram bot and send /menu, /status or /start.
- Check sudo systemctl status bricklab-control.service bricklab-control-snapshot.timer; sudo journalctl -u bricklab-control.service -n 30 --no-pager.
- Snapshot updates every 60 seconds after completion. Data older than 180 seconds is shown as unknown; HTTPS probe is from VPS, not external monitoring. Backup status reports systemd result only, not verified restorability.
- To disable: sudo systemctl disable --now bricklab-control.service bricklab-control-snapshot.timer bricklab-control-actions.socket bricklab-control-recovery.timer. Existing events continue.

## Optional operator actions
Default install disables the action socket. To explicitly enable after review and tests:
`sudo bash scripts/install-bricklab-control.sh --enable-actions`.
The Docker page can restart only an already running BrickLab app, not PostgreSQL. The backup page starts the two existing systemd backup services; successful units do not prove restorability. Buttons require private owner confirmation within 60 seconds; confirmation is single-use and lost on bot restart. The root broker independently checks the Unix peer UID, request shape and allowlist, serializes requests with the repository deploy script, and persists accepted requests and cooldowns in /var/lib/bricklab-control-actions/audit.sqlite3 (10 min restart / 30 min backup). The bot shows the last eight accepted operations in its audit page. View full journal with `sudo journalctl -u 'bricklab-control-actions@*'`. A timeout reports unknown, not success. A systemd job or Docker daemon operation may continue after its client times out; inspect it before manual maintenance. No automatic retries. A compromised bot account can invoke these two limited actions; Telegram confirmation is not a second authentication factor. Disable with `sudo systemctl disable --now bricklab-control-actions.socket`; in-flight operations may finish. Only the updated release script shares the lock; coordinate any manual deployment/maintenance separately. Logs show keyword counts only, not raw content. Run `python3 -B tests/telegram_control_actions_test.py` too.

## Next phases (not implemented)
1. Restore verification, guarded deploy and compatible rollback, independent step-up authentication. Never auto-rollback across incompatible DB migrations.
2. Direct Telegram moderation via existing admin service authorization and audit; attachment consent, role separation, GitHub issue submission with redaction.
3. Full maintenance mode and external monitoring independent of VPS, restore drills and richer scheduled reports.
4. Richer analytics and Telegram Mini App with server-side initData verification.


## Phase 3: operator queues
Recent accounts, public builds and bug reports, report counts and links to existing authenticated admin routes. No email, report body, raw console, screenshot or private project data is exported. Snapshot now root:bricklab-control 0640. Moderation writes remain in the web admin interface with its existing identity, validation and audit; Telegram does not impersonate a site admin.

## Phase 4: release overview
Shows checkout SHA, locally fetched remote-tracking SHA, behind count and tracked-file worktree status. Links to GitHub commits, Actions, pull requests and issues; issue creation is an authenticated GitHub web form. The GitHub page also reads the exact remote SHA and CI runs via the GitHub API on demand, cached for five minutes. Public repositories need no token. For a private repository optionally provision root-owned 0600 /etc/bricklab-backup/github.token with a fine-grained read-only token scoped to this repository (Contents and Actions read), then rerun installer. Token is only in systemd credentials, never passed to shell or logs. Local tracking can still be stale. No remote deployment or rollback from Telegram.

## Phase 5: optional additional alerts
Off by default to avoid duplicating existing monitoring. Toggle in Automation, snooze additional alerts for one hour, or resume. Persistent state in the bot StateDirectory; two consecutive distinct snapshots are required for both alert and recovery; missing readings are unknown. Thresholds: local API and SQL failure, RAM >=90%, free disk <=10%, retrying events >=20. Sends one message per transition; quiet mode suppresses extra alerts only, not the original monitor or Events. A reboot keeps preferences; no changes to maintenance mode. An independent opt-in auto-recovery timer is described below. Existing daily digest remains the source of community daily statistics. Tests: python3 -B tests/telegram_control_automation_test.py.


### Optional recovery timer
Off on a fresh installation. Only after checking existing monitor recovery policies and testing the new service on a non-production instance, enable via `sudo systemctl enable --now bricklab-control-recovery.timer`. The root-owned collector must observe three distinct recent snapshots (running app, failed local API, SQL OK). Recovery takes the same lock as the release script, rechecks that the app is running, PostgreSQL is ready and API is still failing, and invokes only the existing fixed restart broker. Attempts at most hourly (manual restart cooldown also applies), persisted before execution; no retries, no startup of stopped services, no DB restarts. To pause before manual work: `sudo touch /etc/bricklab-backup/control-recovery.pause`; resume by removing the file. To disable: `sudo systemctl disable --now bricklab-control-recovery.timer`; an already running operation may finish. The quiet mode in Telegram is notification-only and does NOT pause recovery. Review recovery journal and shared action audit (Telegram and automatic recovery are distinguished). Run `python3 -B tests/telegram_control_recovery_test.py`. No independent external uptime monitor is provisioned here.
