#!/usr/bin/env python3
"""Hash ADMIN_PIN from .env into admin/pin.json (salted PBKDF2-SHA256).

The PIN itself stays in the gitignored .env; only the salt and hash are
committed, and the admin page re-derives the hash in the browser to check it.
"""
import hashlib, json, os, secrets, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ITERATIONS = 600_000


def read_pin():
    path = os.path.join(ROOT, '.env')
    try:
        for line in open(path):
            key, _, value = line.strip().partition('=')
            if key == 'ADMIN_PIN' and value:
                return value.strip().strip('"\'')
    except FileNotFoundError:
        pass
    sys.exit('ADMIN_PIN not found in .env')


def main():
    pin = read_pin()
    if not pin.isdigit() or len(pin) < 4:
        sys.exit('ADMIN_PIN should be at least 4 digits')
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', pin.encode(), salt, ITERATIONS)
    out = {'algo': 'PBKDF2-SHA256', 'iterations': ITERATIONS, 'salt': salt.hex(), 'hash': digest.hex()}
    with open(os.path.join(ROOT, 'admin', 'pin.json'), 'w') as f:
        json.dump(out, f, indent=2)
        f.write('\n')
    print('Wrote admin/pin.json. Commit it; .env stays local.')


if __name__ == '__main__':
    main()
