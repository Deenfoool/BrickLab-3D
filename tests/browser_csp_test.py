import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('fix_csp', pathlib.Path(__file__).resolve().parents[1] / 'scripts/fix-browser-csp.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BrowserCspTest(unittest.TestCase):
    def test_allows_blob_fetch_without_changing_other_directives(self):
        source = 'add_header Content-Security-Policy-Report-Only "default-src \'self\'; connect-src \'self\' https://bricks.party; worker-src \'self\' blob:;" always;\n'
        result = module.allow_blob_connections(source)
        self.assertEqual(result, source.replace("connect-src 'self' ", "connect-src 'self' blob: "))
        self.assertEqual(module.allow_blob_connections(result), result)

    def test_unexpected_config_is_rejected(self):
        with self.assertRaises(ValueError):
            module.allow_blob_connections('server_name bricklab-3d.ru;\n')


if __name__ == '__main__':
    unittest.main()
