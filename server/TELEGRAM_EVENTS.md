# BrickLab Events (VPS)
The separate host worker reads a transactional PostgreSQL outbox. It uses the existing root-only /etc/bricklab-backup/telegram.json (token, chat_id), not the web app or GitHub. No secrets in the repository. Existing health and backup monitoring are unchanged.

## Install after migration 019
From /opt/bricklab-cloud after the normal release script succeeds:
  sudo bash scripts/install-bricklab-events.sh
  sudo systemctl start bricklab-events.service
  sudo /usr/local/sbin/bricklab-events --status
  sudo journalctl -u bricklab-events.service -n 30 --no-pager

Installation first tests the existing Telegram destination and checks the schema. The systemd timer runs every 60 seconds after the previous run. It can deliver at most 20 events per batch. The host process is serialized by flock, retries transient failures with backoff and honors Telegram 429 retry_after. No network request to Telegram is made by database triggers or during registration/publication. Delivery is at-least-once: after a crash between Telegram acceptance and recording success, a duplicate is possible. Pending messages are retained; successful/disabled outbox records expire after 30 days. Brief bug report records expire after 90 days while the service runs. The service never sends full reports, console output, screenshots, email addresses, credentials or private model documents. Public title/author names are included for public publications only. Registration links require an administrator session. Build cover is a link to the actual public image, not an uploaded photo.

## Event types
registration, profile, build, build_update (new revision only), build_report, comment_report, test_paid, test_mismatch (verified callbacks only), moderation, bug, daily, milestone.
The first digest may be partial because the outbox starts at migration; it is scheduled after 09:00 Moscow time and summarizes the previous calendar day, plus current aggregate counts. Likes, unique registered-user views/downloads and follows are totals rather than daily changes (the current tables do not store timestamps). No historical per-user notification backfill. Milestones: 10,25,50,100,250,500,1000,2500,5000,10000 accounts; already reached targets are seeded at installation.

Optional /etc/bricklab-backup/events.json (root-owned, 0600):
{"disabled":["build_update","moderation"]}
Disabled events are acknowledged without sending; not replayed on re-enable. Default: all enabled, daily/update/moderation silent. To stop all event dispatch without affecting the original monitor: sudo systemctl disable --now bricklab-events.timer; sudo systemctl stop bricklab-events.service.
Re-run the installer after worker changes to update the installed copy.

## Bug reports
Signed-in users may explicitly send a short summary from the existing report dialog. Only selected section and up to 1500 characters of description are stored in the private admin panel; limit 3/day, no console or images are uploaded. Full ZIP and manual email/Telegram remain available for everyone. Review privacy disclosures before accepting reports; Telegram receives only the report ID link. The system does not detect whether a user actually sent a manual email or Telegram message.
## Payments
There is no real-payment mode in this release. Test payment success and verified mismatches are clearly labeled; invalid signatures are not forwarded. Real revenue, refunds, failed checkout and fiscal receipts require implementing their own live event sources first.
