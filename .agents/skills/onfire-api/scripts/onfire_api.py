#!/usr/bin/env python3
"""Scoped OnFire HTTP client; Python standard library only. Never follows redirects."""
import argparse
import json
import mimetypes
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

MAX_RESPONSE = 8 * 1024 * 1024
SECRET_FIELDS = {"apikey", "api_key", "secret", "secrethash", "secret_hash", "token", "password", "temporarypassword", "authsecret", "identityauthsecret", "webhooksecret", "inboundwebhooksecret", "inboundapikey", "outboundapikey", "outboundsmtppass", "access_token", "refresh_token", "signingkey", "pushkey", "devicekey", "bottoken", "webhookurl"}


class ClientError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def redacted(value, secrets=()):
    if isinstance(value, dict):
        return {key: "[REDACTED]" if key.lower() in SECRET_FIELDS or "secret" in key.lower() else redacted(item, secrets) for key, item in value.items()}
    if isinstance(value, list):
        return [redacted(item, secrets) for item in value]
    if isinstance(value, str):
        for secret in secrets:
            if secret:
                value = value.replace(secret, "[REDACTED]")
    return value


def input_secrets(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if isinstance(item, str) and (key.lower() in SECRET_FIELDS or "secret" in key.lower()):
                yield item
            else:
                yield from input_secrets(item)
    elif isinstance(value, list):
        for item in value:
            yield from input_secrets(item)


class Client:
    def __init__(self, environ=None):
        env = os.environ if environ is None else environ
        base = env.get("ONFIRE_BASE_URL", "").rstrip("/")
        parsed = urllib.parse.urlsplit(base)
        if (not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment or
                parsed.scheme not in ("http", "https") or
                (parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1", "::1"))):
            raise ClientError("Set ONFIRE_BASE_URL to the canonical HTTPS ToB origin (loopback HTTP is allowed locally).")
        token = env.get("ONFIRE_API_KEY", "")
        if not re.fullmatch(r"ofk_[a-f0-9-]{36}\.[a-f0-9]{64}", token):
            raise ClientError("Set ONFIRE_API_KEY to a securely provisioned account key; product keys cannot manage ToB resources.")
        self.base = base
        self.headers = {"Authorization": "Bearer " + token, "Accept": "application/json"}
        self.secrets = [token]
        access_id, access_secret = env.get("CF_ACCESS_CLIENT_ID"), env.get("CF_ACCESS_CLIENT_SECRET")
        if bool(access_id) != bool(access_secret):
            raise ClientError("Cloudflare Access requires both CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET.")
        if access_id:
            self.headers.update({"CF-Access-Client-Id": access_id, "CF-Access-Client-Secret": access_secret})
            self.secrets += [access_id, access_secret]
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, method, path, data=None, content_type=None):
        # No arbitrary URLs, fragments, credential-bearing paths or redirects.
        parsed = urllib.parse.urlsplit(path)
        if not re.fullmatch(r"/api/tob/[A-Za-z0-9_/-]+", parsed.path) or parsed.scheme or parsed.netloc or parsed.fragment:
            raise ClientError("Refusing a destination outside the canonical ToB API.")
        headers = dict(self.headers)
        if content_type:
            headers["Content-Type"] = content_type
        request = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            response = self.opener.open(request, timeout=60)
        except urllib.error.HTTPError as error:
            if 300 <= error.code < 400:
                raise ClientError("Redirect refused. Check the canonical origin and Cloudflare Access machine policy.") from None
            raw = error.read(MAX_RESPONSE + 1)
            try:
                payload = json.loads(raw) if len(raw) <= MAX_RESPONSE else {}
                message = payload.get("error", "Request failed") if isinstance(payload, dict) else "Request failed"
            except (ValueError, UnicodeError):
                message = "Non-JSON error; check edge access and server availability"
            retry = error.headers.get("Retry-After")
            raise ClientError(f"HTTP {error.code}: {message}" + (f" (Retry-After: {retry}s)" if retry else "")) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise ClientError("Network failure. A write may have completed; inspect current state before retrying.") from None
        with response:
            raw = response.read(MAX_RESPONSE + 1)
        if len(raw) > MAX_RESPONSE:
            raise ClientError("Response exceeds 8 MB; use narrower queries or pagination.")
        try:
            payload = json.loads(raw)
        except (ValueError, UnicodeError):
            raise ClientError("Expected JSON; check Cloudflare Access and the ToB origin.") from None
        if not isinstance(payload, dict) or payload.get("ok") is not True or "data" not in payload:
            raise ClientError("The server did not return a successful OnFire response.")
        return payload["data"]


def build_request(operation, values, filename=None):
    if not isinstance(values, dict):
        raise ClientError("Input must be a JSON object.")
    method, path = operation["method"], operation["path"]
    if method not in ("GET", "POST", "PATCH", "DELETE"):
        raise ClientError("Unsupported operation method.")
    params = re.findall(r":([A-Za-z][A-Za-z0-9]*)", path)
    if set(values) - set(params) - {"query", "body"}:
        raise ClientError("Unexpected top-level input fields; use the live input schema.")
    for param in params:
        value = values.get(param)
        if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value):
            raise ClientError(f"Invalid or missing path parameter: {param}")
        path = path.replace(":" + param, value)
    query = values.get("query", {})
    if not isinstance(query, dict) or any(not isinstance(v, (str, int, float, bool)) for v in query.values()):
        raise ClientError("Query must contain scalar values.")
    if query:
        path += "?" + urllib.parse.urlencode({k: str(v).lower() if isinstance(v, bool) else v for k, v in query.items()})
    body = values.get("body")
    if body is not None and not isinstance(body, dict):
        raise ClientError("Body must be a JSON object.")
    if method == "GET" and (body is not None or filename):
        raise ClientError("GET operations cannot have a body or upload.")
    if operation.get("contentType") == "multipart/form-data":
        if not filename:
            raise ClientError("This operation requires --file and the advertised form fields in body.")
        file = Path(filename)
        if file.stat().st_size > 10 * 1024 * 1024:
            raise ClientError("Upload exceeds 10 MB; ticket images are further limited to 5 MB by the server.")
        boundary = "onfire-" + uuid.uuid4().hex
        chunks = []
        for key, value in (body or {}).items():
            if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", key) or not isinstance(value, (str, int, float, bool)):
                raise ClientError("Invalid multipart field.")
            chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
        safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", file.name)
        mime = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{safe_name}"\r\nContent-Type: {mime}\r\n\r\n'.encode())
        chunks.extend([file.read_bytes(), f"\r\n--{boundary}--\r\n".encode()])
        return method, path, b"".join(chunks), "multipart/form-data; boundary=" + boundary
    if filename:
        raise ClientError("This operation does not accept files.")
    return method, path, None if body is None else json.dumps(body, ensure_ascii=False).encode(), None if body is None else "application/json"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("context")
    listing = sub.add_parser("operations")
    listing.add_argument("operation", nargs="?")
    call = sub.add_parser("call")
    call.add_argument("operation")
    call.add_argument("--input-file", help="JSON input file, or - for stdin (default: empty input)")
    call.add_argument("--file", help="Upload for a multipart operation")
    call.add_argument("--dry-run", action="store_true")
    call.add_argument("--output", help="Create a private new file with the unredacted result")
    args = parser.parse_args(argv)
    client = None
    output = None
    completed = False
    try:
        client = Client()
        context = client.request("GET", "/api/tob/api-key")
        operations = context.get("operations", [])
        if args.command == "context":
            result = {k: v for k, v in context.items() if k != "operations"}
        elif args.command == "operations" and not args.operation:
            result = [{k: op[k] for k in ("id", "method", "path", "description")} for op in operations]
        else:
            operation = next((op for op in operations if op.get("id") == args.operation), None)
            if not operation:
                raise ClientError("Operation is not currently granted. Ask the account owner for the needed capability; do not bypass it.")
            if args.command == "operations":
                result = operation
            else:
                values = {} if not args.input_file else json.load(sys.stdin) if args.input_file == "-" else json.loads(Path(args.input_file).read_text())
                client.secrets.extend(input_secrets(values))
                method, path, body, content_type = build_request(operation, values, args.file)
                if args.dry_run:
                    result = {"method": method, "path": path, "input": values, "file": args.file}
                else:
                    # Reserve before the write: never lose a one-time secret to an existing/unwritable path.
                    if args.output:
                        output = os.fdopen(os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w")
                    result = client.request(method, path, body, content_type)
        if output:
            json.dump(result, output, ensure_ascii=False, indent=2)
            output.write("\n")
            output.close()
            completed = True
            print(json.dumps({"saved": args.output}))
        else:
            print(json.dumps(redacted(result, client.secrets), ensure_ascii=False, indent=2))
        return 0
    except (ClientError, ValueError, OSError) as error:
        print(redacted(str(error), client.secrets if client else ()), file=sys.stderr)
        return 1
    finally:
        if output and not output.closed:
            output.close()
        if output and not completed:
            Path(args.output).unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
