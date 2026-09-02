import ipaddress
import json
import os


def write_json(payload):
    print(json.dumps(payload, ensure_ascii=False))


def normalize_remote_ip(value):
    ip_addr = str(value or "").split(",", 1)[0].strip()
    if ip_addr.startswith("::ffff:"):
        ip_addr = ip_addr[7:]
    return ip_addr


def main():
    ip_addr = normalize_remote_ip(os.environ.get("REMOTE_ADDR"))
    try:
        normalized_ip = str(ipaddress.ip_address(ip_addr))
    except ValueError:
        write_json({
            "ok": False,
            "code": "IP_NOT_FOUND",
            "error": "Unable to determine the client IP.",
        })
        return

    write_json({"ok": True, "knoxId": normalized_ip})


if __name__ == "__main__":
    main()
