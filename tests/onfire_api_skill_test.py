"""Behavioral tests for the portable skill client against a local HTTP fixture."""
import contextlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import sys
sys.dont_write_bytecode = True
import tempfile
import threading
import unittest
from unittest.mock import patch

source = Path(__file__).resolve().parents[1] / '.agents/skills/onfire-api/scripts/onfire_api.py'
spec = importlib.util.spec_from_file_location('onfire_api', source)
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)
TOKEN = 'ofk_00000000-0000-0000-0000-000000000000.' + 'a' * 64


class Handler(BaseHTTPRequestHandler):
    operations = []
    calls = []
    redirect = False
    deny = False
    error_message = "Unauthorized"

    def log_message(self, *_):
        pass

    def do_GET(self):
        self.__class__.calls.append((self.command, self.path, self.headers.get('Authorization')))
        if self.path == '/api/tob/api-key':
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'data': {'key': {'id': 'key-1'}, 'operations': self.operations}}).encode())
        elif self.redirect:
            self.send_response(302)
            self.send_header('Location', '/leaked')
            self.end_headers()
        elif self.deny:
            self.send_response(401)
            self.end_headers()
            self.wfile.write(json.dumps({'ok': False, 'error': self.error_message}).encode())
        else:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'data': {'id': 'one', 'apiKey': TOKEN, 'subject': 'Read me'}}).encode())

    do_POST = do_GET


class SkillClientTests(unittest.TestCase):
    def setUp(self):
        Handler.calls = []
        Handler.redirect = False
        Handler.deny = False
        Handler.error_message = "Unauthorized"
        Handler.operations = [{'id': 'get_ticket', 'method': 'GET', 'path': '/api/tob/tickets/:id', 'description': 'Read a ticket'},
                              {'id': 'create_product_key', 'method': 'POST', 'path': '/api/tob/admin/product-keys', 'description': 'Create key'}]
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.env = patch.dict(os.environ, {'ONFIRE_BASE_URL': f'http://127.0.0.1:{self.server.server_port}', 'ONFIRE_API_KEY': TOKEN, 'CF_ACCESS_CLIENT_ID': '', 'CF_ACCESS_CLIENT_SECRET': ''})
        self.env.start()
        self.tmp = tempfile.TemporaryDirectory()
        self.input = Path(self.tmp.name) / 'input.json'
        self.input.write_text('{"id":"one"}')

    def tearDown(self):
        self.env.stop()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def run_client(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = client.main(list(args))
        self.assertNotIn(TOKEN, out.getvalue() + err.getvalue())
        return code, out.getvalue(), err.getvalue()

    def test_reads_live_capabilities_and_redacts_secret_stdout(self):
        code, out, _ = self.run_client('call', 'get_ticket', '--input-file', str(self.input))
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out)['subject'], 'Read me')
        self.assertEqual(json.loads(out)['apiKey'], '[REDACTED]')
        self.assertEqual([call[1] for call in Handler.calls], ['/api/tob/api-key', '/api/tob/tickets/one'])
        self.assertTrue(all(call[2] == 'Bearer ' + TOKEN for call in Handler.calls))

    def test_denies_ungranted_operation_and_path_injection(self):
        self.assertEqual(self.run_client('call', 'delete_user')[0], 1)
        self.assertEqual(len(Handler.calls), 1)
        self.input.write_text('{"id":"../admin/users"}')
        self.assertEqual(self.run_client('call', 'get_ticket', '--input-file', str(self.input))[0], 1)
        self.assertEqual(len(Handler.calls), 2)

    def test_refuses_redirects_and_does_not_retry_unauthorized_calls(self):
        Handler.redirect = True
        self.assertEqual(self.run_client('call', 'get_ticket', '--input-file', str(self.input))[0], 1)
        self.assertFalse(any(call[1] == '/leaked' for call in Handler.calls))
        Handler.calls = []; Handler.redirect = False; Handler.deny = True
        self.assertEqual(self.run_client('call', 'get_ticket', '--input-file', str(self.input))[0], 1)
        self.assertEqual(len(Handler.calls), 2)

    def test_dry_run_never_mutates_and_private_output_is_reserved_before_write(self):
        self.input.write_text('{"body":{"productId":"p1"}}')
        self.assertEqual(self.run_client('call', 'create_product_key', '--input-file', str(self.input), '--dry-run')[0], 0)
        self.assertTrue(all(call[0] == 'GET' for call in Handler.calls))
        output = Path(self.tmp.name) / 'secret.json'
        self.assertEqual(self.run_client('call', 'create_product_key', '--input-file', str(self.input), '--output', str(output))[0], 0)
        self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
        self.assertEqual(json.loads(output.read_text())['apiKey'], TOKEN)
        writes = sum(call[0] == 'POST' for call in Handler.calls)
        self.assertEqual(self.run_client('call', 'create_product_key', '--output', str(output))[0], 1)
        self.assertEqual(sum(call[0] == 'POST' for call in Handler.calls), writes)

    def test_query_encoding_and_multipart_fields(self):
        op = {'method': 'GET', 'path': '/api/tob/tickets'}
        self.assertEqual(client.build_request(op, {'query': {'overdue': True, 'q': 'one & two'}})[1], '/api/tob/tickets?overdue=true&q=one+%26+two')
        file = Path(self.tmp.name) / 'note.txt'; file.write_text('document body')
        op = {'method': 'POST', 'path': '/api/tob/admin/ai/documents', 'contentType': 'multipart/form-data'}
        _, path, body, mime = client.build_request(op, {'body': {'productId': 'p1'}}, str(file))
        self.assertEqual(path, '/api/tob/admin/ai/documents')
        self.assertIn(b'name="productId"\r\n\r\np1', body)
        self.assertIn(b'document body', body)
        self.assertTrue(mime.startswith('multipart/form-data; boundary='))

    def test_redacts_notification_secrets_in_dry_runs_and_error_echoes(self):
        Handler.operations.append({'id': 'create_notification_endpoint', 'method': 'POST', 'path': '/api/tob/notification-endpoints'})
        value = 'private-device-credential'
        self.input.write_text(json.dumps({'body': {'config': {'deviceKey': value}}}))
        code, out, _ = self.run_client('call', 'create_notification_endpoint', '--input-file', str(self.input), '--dry-run')
        self.assertEqual(code, 0)
        self.assertNotIn(value, out)
        Handler.deny = True
        Handler.error_message = 'Rejected credential: ' + value
        code, _, err = self.run_client('call', 'create_notification_endpoint', '--input-file', str(self.input))
        self.assertEqual(code, 1)
        self.assertNotIn(value, err)

    def test_refuses_noncanonical_origins_and_non_account_credentials(self):
        for base in ['https://user:pass@example.com', 'http://example.com', 'https://example.com/admin', 'https://example.com?x=1']:
            with self.assertRaises(client.ClientError):
                client.Client({'ONFIRE_BASE_URL': base, 'ONFIRE_API_KEY': TOKEN})
        with self.assertRaises(client.ClientError):
            client.Client({'ONFIRE_BASE_URL': 'https://admin.example.com', 'ONFIRE_API_KEY': 'product.secret'})


if __name__ == '__main__':
    unittest.main()
