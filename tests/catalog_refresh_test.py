import json
import runpy
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

worker = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/refresh-part-index.py"))
identity_target = worker["identity_target"]
redirects_from = worker["redirects_from"]
resolve_redirects = worker["resolve_redirects"]
atomic_json = worker["atomic_json"]
audit_inventories = worker["audit_inventories"]

def alias(target, transform="0 0 0 1 0 0 0 1 0 0 0 1"):
    return f"0 =Official Alias\n0 !LDRAW_ORG Part Alias\n0\n1 16 {transform} {target}.dat\n"

class CatalogRefreshTests(unittest.TestCase):
    def test_identity_only(self):
        self.assertEqual(identity_target(alias("6628")), "6628")
        self.assertIsNone(identity_target(alias("6628", "1 0 0 1 0 0 0 1 0 0 0 1")))
        self.assertIsNone(identity_target(alias("6628") + "2 24 0 0 0 1 1 1\n"))
        self.assertIsNone(identity_target(alias("6628").replace("1 16", "1 4")))
        self.assertIsNone(identity_target(alias("6628").replace("0\n1", "0 BFC INVERTNEXT\n1")))
        self.assertIsNone(identity_target(alias("../escape")))
    def test_chains_cycles_and_existing_designs(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "complete.zip"
            with ZipFile(path, "w") as archive:
                for key, value in {"66906": "6628", "older": "66906", "a": "b", "b": "a", "missing": "x", "existing": "6628"}.items():
                    archive.writestr(f"ldraw/parts/{key}.dat", alias(value))
                archive.writestr("ldraw/parts/s/sub.dat", alias("6628"))
            redirects = redirects_from(path)
            self.assertEqual(resolve_redirects(redirects, {"6628", "existing"}), {"66906": "6628", "older": "6628"})
    def test_weighted_inventory_audit(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            (folder / "test.json").write_text(json.dumps({"number": "1-1", "inventory": [
                {"partNum": "66906", "quantity": 3},
                {"partNum": "6628", "quantity": 4},
                {"partNum": "outside", "quantity": 2, "ldraw": ["6628", "a"]},
                {"partNum": "missing", "quantity": 5},
                {"partNum": "6628", "quantity": 8, "spare": True}
            ]}))
            result = audit_inventories(folder, {"6628", "a"}, {"66906": "6628"})
            self.assertEqual(result["1-1"], dict(exact=4, alias=3, external=0, ambiguous=2, missing=5))
    def test_atomic_snapshot_replacement(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "public/aliases.json"
            atomic_json(path, {"schema": 1, "aliases": {"66906": "6628"}})
            self.assertEqual(json.loads(path.read_text())["aliases"], {"66906": "6628"})
            self.assertEqual(list(path.parent.iterdir()), [path])

if __name__ == "__main__":
    unittest.main()
