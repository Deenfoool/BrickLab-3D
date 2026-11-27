"""Static contract for the mobile UI: no inline script, stable routes and DOM targets."""
import pathlib
import re
import unittest
from html.parser import HTMLParser
ROOT=pathlib.Path(__file__).resolve().parents[1]/"scripts"
class Markup(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids=[]
        self.pages=set()
        self.tabs=set()
        self.go=set()
        self.inline=[]
        self.assets=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if "id" in attrs:self.ids.append(attrs["id"])
        for attr,key in (("data-page","pages"),("data-tab","tabs"),("data-go","go")):
            if attr in attrs:getattr(self,key).add(attrs[attr])
        if any(k.startswith("on") or k=="style" for k in attrs):self.inline.append(tag)
        if tag=="script":
            if not attrs.get("src"):self.inline.append(tag)
            else:self.assets.append(attrs["src"])
class UI(unittest.TestCase):
    def check(self,stem,expected):
        page=Markup()
        page.feed((ROOT/(stem+".html")).read_text())
        js=(ROOT/(stem+".js")).read_text()
        self.assertEqual(len(page.ids),len(set(page.ids)))
        self.assertEqual(page.pages,expected)
        self.assertEqual(page.tabs,expected)
        self.assertTrue(page.go<=page.tabs)
        self.assertFalse(page.inline)
        self.assertEqual(set(page.assets),{"https://telegram.org/js/telegram-web-app.js","app.js"})
        ids=set(re.findall(r"(?:getElementById|\$)\('([^']+)'\)",js))
        ids.update(re.findall(r"tiles\('([^']+)'",js))
        self.assertTrue(ids<=set(page.ids),str(ids-set(page.ids)))
        self.assertIn("X-Telegram-Init-Data",js)
        self.assertIn("bottom-nav",(ROOT/(stem+".css")).read_text())
        self.assertIn("prefers-reduced-motion",(ROOT/(stem+".css")).read_text())
    def test_control(self):
        self.check("miniapp",{"home","people","finance","dev","server"})
    def test_hub(self):
        self.check("hub",{"home","awards","top","bonus","inbox"})
if __name__=="__main__":
    unittest.main()
