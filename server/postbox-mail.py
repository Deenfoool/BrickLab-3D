"""SMTP over TLS: credentials and message arrive only through stdin."""
import json
import smtplib
import ssl
import sys
from email.message import EmailMessage
from email.headerregistry import Address

def send():
    data = json.load(sys.stdin)
    sender = Address(addr_spec=data["from"])
    recipient = Address(addr_spec=data["to"])
    message = EmailMessage()
    message["From"] = Address(display_name="BrickLab 3D", username=sender.username, domain=sender.domain)
    message["To"] = recipient
    message["Subject"] = data["subject"]
    message.set_content(data["text"])
    smtp = smtplib.SMTP_SSL("postbox.cloud.yandex.net", 465, timeout=10,
                           context=ssl.create_default_context())
    try:
        smtp.login(data["username"], data["password"])
        refused = smtp.send_message(message, from_addr=sender.addr_spec,
                                    to_addrs=[recipient.addr_spec])
        if refused:
            raise smtplib.SMTPRecipientsRefused(refused)
    finally:
        smtp.close()

try:
    send()
    print("accepted")
except smtplib.SMTPRecipientsRefused as exc:
    code = next(iter(exc.recipients.values()))[0]
    print("smtp_" + str(code) if 400 <= code <= 599 else "smtp_connection")
    sys.exit(1)
except smtplib.SMTPResponseException as exc:
    code = exc.smtp_code
    print("smtp_" + str(code) if 400 <= code <= 599 else "smtp_connection")
    sys.exit(1)
except ssl.SSLError:
    print("smtp_tls")
    sys.exit(1)
except (ValueError, KeyError, TypeError):
    print("smtp_invalid_message")
    sys.exit(1)
except (OSError, smtplib.SMTPException):
    print("smtp_connection")
    sys.exit(1)
